import { Router } from "express";
import { z } from "zod";
import type { TrainingRequest, User } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { createNotification } from "../notifications/routes";

export const trainingRequestsRouter = Router();
trainingRequestsRouter.use(requireAuth);

const TRAINING_TYPES = ["individual", "team", "match_practice", "fitness", "recovery", "tactical"] as const;

// These feed `new Date(\`${date}T${time}:00Z\`)` on approve/reschedule — malformed
// values would silently produce an Invalid Date (→ 500 / bad rows). Validate the
// exact shapes ("yyyy-MM-dd" / "HH:mm") so bad input is rejected at 400.
const dateOnly = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), {
    message: "Invalid date (expected yyyy-MM-dd)",
  });
const timeOnly = z
  .string()
  .refine((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v), { message: "Invalid time (expected HH:mm)" });

const createSchema = z.object({
  coachId: z.string().min(1),
  preferredDate: dateOnly,
  preferredStartTime: timeOnly,
  preferredEndTime: timeOnly,
  trainingType: z.enum(TRAINING_TYPES),
  location: z.string().optional(),
  notes: z.string().optional(),
  priority: z.enum(["normal", "high"]).optional(),
});

const messageSchema = z.object({ coachMessage: z.string().optional() });
const rescheduleSchema = z.object({
  proposedDate: dateOnly,
  proposedStartTime: timeOnly,
  proposedEndTime: timeOnly,
  coachMessage: z.string().optional(),
});

type TRWithUsers = TrainingRequest & { player: User; coach: User };
const withUsers = { player: true, coach: true } as const;

function present(r: TRWithUsers) {
  return {
    id: r.id,
    playerId: r.playerId,
    playerName: `${r.player.firstName} ${r.player.lastName}`,
    coachId: r.coachId,
    coachName: `${r.coach.firstName} ${r.coach.lastName}`,
    status: r.status,
    preferredDate: r.preferredDate,
    preferredStartTime: r.preferredStartTime,
    preferredEndTime: r.preferredEndTime,
    trainingType: r.trainingType,
    location: r.location ?? undefined,
    notes: r.notes ?? undefined,
    priority: (r.priority ?? undefined) as "normal" | "high" | undefined,
    coachMessage: r.coachMessage ?? undefined,
    proposedDate: r.proposedDate ?? undefined,
    proposedStartTime: r.proposedStartTime ?? undefined,
    proposedEndTime: r.proposedEndTime ?? undefined,
    calendarEventId: r.calendarEventId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Load a request the current user is party to (player or coach). */
async function involved(id: string, userId: string): Promise<TRWithUsers> {
  const r = await prisma.trainingRequest.findUnique({ where: { id }, include: withUsers });
  if (!r) throw new HttpError(404, "Request not found");
  if (r.playerId !== userId && r.coachId !== userId) throw new HttpError(403, "Not your request");
  return r;
}

/** Coach-only guard for approve/reject/reschedule. */
function assertCoach(r: TRWithUsers, userId: string) {
  if (r.coachId !== userId) throw new HttpError(403, "Only the coach can act on this request");
}

// GET /api/training-requests — requests the user is party to.
trainingRequestsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.trainingRequest.findMany({
      where: { OR: [{ playerId: req.userId! }, { coachId: req.userId! }] },
      include: withUsers,
      orderBy: { createdAt: "desc" },
    });
    return ok(res, rows.map(present));
  }),
);

// GET /api/training-requests/:id
trainingRequestsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, present(await involved(req.params.id, req.userId!)));
  }),
);

// POST /api/training-requests — the current user (player) requests a session.
trainingRequestsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = createSchema.parse(req.body);
    const coach = await prisma.user.findUnique({ where: { id: d.coachId } });
    // Must be an actual coach — not merely an existing user of any role.
    // Uniform 404 (don't reveal that the id exists but is a non-coach).
    if (!coach || coach.role !== "coach") throw new HttpError(404, "Coach not found");
    const created = await prisma.trainingRequest.create({
      data: { ...d, playerId: req.userId! },
      include: withUsers,
    });
    void createNotification({
      userId: created.coachId,
      type: "training_request_created",
      title: "New Training Request",
      message: `${created.player.firstName} ${created.player.lastName} requested a ${created.trainingType} session on ${created.preferredDate}`,
      linkTo: "/training-requests",
    });
    return ok(res, present(created), "Request sent", 201);
  }),
);

// POST /api/training-requests/:id/approve — coach approves → creates a calendar event.
trainingRequestsRouter.post(
  "/:id/approve",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { coachMessage } = messageSchema.parse(req.body ?? {});
    const r = await involved(req.params.id, req.userId!);
    assertCoach(r, req.userId!);

    const playerName = `${r.player.firstName} ${r.player.lastName}`;
    const startDate = new Date(`${r.preferredDate}T${r.preferredStartTime}:00Z`);
    const endDate = new Date(`${r.preferredDate}T${r.preferredEndTime}:00Z`);

    const updated = await prisma.$transaction(async (tx) => {
      const event = await tx.calendarEvent.create({
        data: {
          title: `Training: ${playerName}`,
          type: "training",
          state: "confirmed",
          startDate,
          endDate,
          location: r.location,
          playerId: r.playerId,
          playerName,
          createdBy: r.coachId,
          createdByRole: "coach",
          trainingRequestId: r.id,
        },
      });
      return tx.trainingRequest.update({
        where: { id: r.id },
        data: { status: "approved", coachMessage, calendarEventId: event.id },
        include: withUsers,
      });
    });
    void createNotification({
      userId: r.playerId,
      type: "training_request_approved",
      title: "Training Request Approved",
      message: `Your ${r.trainingType} request for ${r.preferredDate} was approved${coachMessage ? `: "${coachMessage}"` : ""}`,
      linkTo: "/calendar",
    });
    return ok(res, present(updated), "Request approved");
  }),
);

// POST /api/training-requests/:id/reject
trainingRequestsRouter.post(
  "/:id/reject",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { coachMessage } = messageSchema.parse(req.body ?? {});
    const r = await involved(req.params.id, req.userId!);
    assertCoach(r, req.userId!);
    const updated = await prisma.trainingRequest.update({
      where: { id: r.id },
      data: { status: "rejected", coachMessage },
      include: withUsers,
    });
    void createNotification({
      userId: r.playerId,
      type: "training_request_rejected",
      title: "Training Request Declined",
      message: `Your ${r.trainingType} request for ${r.preferredDate} was declined${coachMessage ? `: "${coachMessage}"` : ""}`,
      linkTo: "/training-requests",
    });
    return ok(res, present(updated), "Request declined");
  }),
);

// POST /api/training-requests/:id/reschedule
trainingRequestsRouter.post(
  "/:id/reschedule",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = rescheduleSchema.parse(req.body);
    const r = await involved(req.params.id, req.userId!);
    assertCoach(r, req.userId!);
    const updated = await prisma.trainingRequest.update({
      where: { id: r.id },
      data: {
        status: "reschedule_proposed",
        proposedDate: d.proposedDate,
        proposedStartTime: d.proposedStartTime,
        proposedEndTime: d.proposedEndTime,
        coachMessage: d.coachMessage,
      },
      include: withUsers,
    });
    void createNotification({
      userId: r.playerId,
      type: "training_request_rescheduled",
      title: "New Time Proposed",
      message: `Coach proposed ${d.proposedDate} ${d.proposedStartTime}–${d.proposedEndTime} for your ${r.trainingType} session`,
      linkTo: "/training-requests",
    });
    return ok(res, present(updated), "New time proposed");
  }),
);

// POST /api/training-requests/:id/cancel — either party cancels.
const TERMINAL_STATUSES = ["approved", "rejected", "cancelled"] as const;
trainingRequestsRouter.post(
  "/:id/cancel",
  asyncHandler(async (req: AuthedRequest, res) => {
    const r = await involved(req.params.id, req.userId!);
    // Guard: a request in a terminal state can't be (re-)cancelled.
    if ((TERMINAL_STATUSES as readonly string[]).includes(r.status)) {
      throw new HttpError(409, `This request is already ${r.status} and can no longer be cancelled.`);
    }
    // Cancel and, if a calendar event was linked, remove it in the SAME
    // transaction so cancelling never orphans a scheduled event. deleteMany
    // (not delete) keeps this idempotent if the event is already gone.
    const updated = await prisma.$transaction(async (tx) => {
      if (r.calendarEventId) {
        await tx.calendarEvent.deleteMany({ where: { id: r.calendarEventId } });
      }
      return tx.trainingRequest.update({
        where: { id: r.id },
        data: { status: "cancelled", calendarEventId: null },
        include: withUsers,
      });
    });
    return ok(res, present(updated), "Request cancelled");
  }),
);
