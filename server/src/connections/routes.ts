import { Router } from "express";
import { z } from "zod";
import type { ConnectionRequest, User } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { createAndDeliverNotification, type DeliverInput } from "../notifications/deliver";

export const connectionsRouter = Router();
connectionsRouter.use(requireAuth);

/**
 * Fire-and-forget notification for a connection mutation.
 *
 * HARD RULES enforced here:
 *  - never awaited by the route → a slow mail/push provider can't delay the
 *    HTTP response, and a rejection can never turn a successful mutation into
 *    a 500 (the funnel's own `notification.create` await lives inside this
 *    promise, so even a DB failure while writing the row is swallowed);
 *  - never notify the actor about their own action.
 */
function notifyCounterparty(actorId: string, input: DeliverInput): void {
  if (input.userId === actorId) return;
  void createAndDeliverNotification(prisma, input).catch((err) => {
    console.error(
      `[connections] notification (${input.type}) for ${input.userId} failed:`,
      err instanceof Error ? err.message : err,
    );
  });
}

const fullName = (u: Pick<User, "firstName" | "lastName">) => `${u.firstName} ${u.lastName}`;

const sendSchema = z.object({
  toUserId: z.string().min(1),
  toPublicId: z.string().optional(), // accepted; the server resolves by id
});

const updateSchema = z.object({ status: z.enum(["active", "rejected"]) });

type ConnWithUsers = ConnectionRequest & { fromUser: User; toUser: User };

/** Map a row to the denormalised front-end `ConnectionRequest` shape. */
function present(r: ConnWithUsers) {
  return {
    id: r.id,
    fromUserId: r.fromUserId,
    fromUserName: `${r.fromUser.firstName} ${r.fromUser.lastName}`,
    fromUserRole: r.fromUser.role,
    // The shareable ids (TAI-P-…, TAI-C-…) each side needs to connect. Without
    // them the client had nothing real to show, so it invented one from the
    // cuid — every screen listing a player displayed an id that belonged to
    // nobody, and typing it into "New Request" could never find that player.
    fromUserPublicId: r.fromUser.publicId,
    toUserId: r.toUserId,
    toUserName: `${r.toUser.firstName} ${r.toUser.lastName}`,
    toUserRole: r.toUser.role,
    toUserPublicId: r.toUser.publicId,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const withUsers = { fromUser: true, toUser: true } as const;

// GET /api/connections — every request involving the current user.
connectionsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.connectionRequest.findMany({
      where: { OR: [{ fromUserId: req.userId! }, { toUserId: req.userId! }] },
      include: withUsers,
      orderBy: { updatedAt: "desc" },
    });
    return ok(res, rows.map(present));
  }),
);

// POST /api/connections — send a new request from the current user.
connectionsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { toUserId } = sendSchema.parse(req.body);
    const fromUserId = req.userId!;

    if (toUserId === fromUserId) throw new HttpError(400, "You cannot connect with yourself.");

    const target = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!target) throw new HttpError(404, "User not found");

    // Block if an active or pending relationship exists in EITHER direction.
    const blocking = await prisma.connectionRequest.findFirst({
      where: {
        status: { in: ["active", "pending"] },
        OR: [
          { fromUserId, toUserId },
          { fromUserId: toUserId, toUserId: fromUserId },
        ],
      },
    });
    if (blocking) {
      throw new HttpError(
        409,
        blocking.status === "active"
          ? "You're already connected with this user."
          : "A pending request already exists between you.",
      );
    }

    // Reuse a stale (rejected/revoked) row in the same direction if present,
    // otherwise create — respects the @@unique([fromUserId, toUserId]).
    const created = await prisma.connectionRequest.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      update: { status: "pending" },
      create: { fromUserId, toUserId, status: "pending" },
      include: withUsers,
    });

    // The recipient is the one who has to act — tell them, exactly as the
    // client promises ("They'll be notified and can approve or decline").
    notifyCounterparty(fromUserId, {
      userId: created.toUserId,
      type: "connection_request_created",
      title: "New connection request",
      message: `${fullName(created.fromUser)} (${created.fromUser.role}) wants to connect with you.`,
      linkTo: "/connections",
    });

    return ok(res, present(created), "Connection request sent", 201);
  }),
);

// PATCH /api/connections/:id — recipient approves or rejects a pending request.
connectionsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = updateSchema.parse(req.body);
    const existing = await prisma.connectionRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Request not found.");
    if (existing.toUserId !== req.userId) {
      throw new HttpError(403, "Only the recipient can act on this request.");
    }
    if (existing.status !== "pending") {
      throw new HttpError(409, `Request is already ${existing.status}.`);
    }
    const updated = await prisma.connectionRequest.update({
      where: { id: req.params.id },
      data: { status },
      include: withUsers,
    });

    // Only the ORIGINAL SENDER is notified — they're the party waiting on an
    // answer. The recipient just performed the action, so they get nothing.
    // Revoke (DELETE) deliberately stays silent: ending a relationship is not
    // an event the other side needs pushed to their phone.
    notifyCounterparty(req.userId!, {
      userId: updated.fromUserId,
      type: status === "active" ? "connection_request_approved" : "connection_request_rejected",
      title: status === "active" ? "Connection accepted" : "Connection request declined",
      message:
        status === "active"
          ? `${fullName(updated.toUser)} accepted your connection request.`
          : `${fullName(updated.toUser)} declined your connection request for now.`,
      linkTo: "/connections",
    });

    return ok(res, present(updated), status === "active" ? "Connection approved" : "Request rejected");
  }),
);

// DELETE /api/connections/:id — revoke an active relationship (either party).
connectionsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.connectionRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Relationship not found.");
    if (existing.status !== "active") throw new HttpError(409, "Only active relationships can be revoked.");
    if (existing.fromUserId !== req.userId && existing.toUserId !== req.userId) {
      throw new HttpError(403, "You are not part of this relationship.");
    }
    await prisma.connectionRequest.update({
      where: { id: req.params.id },
      data: { status: "revoked" },
    });
    return ok(res, null, "Relationship revoked");
  }),
);
