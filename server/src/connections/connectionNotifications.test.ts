// ============================================================================
// HTTP route tests — connection-request NOTIFICATIONS
//
// The client promises "They'll be notified and can approve or decline", and the
// notification-settings UI exposes a "Connection Requests" toggle (the
// `requestApprovals` category). These specs pin the emission down:
//   • request created  → the RECIPIENT is notified (never the sender)
//   • request approved → the original SENDER is notified (never the approver)
//   • request rejected → the original SENDER is notified
//   • revoke           → deliberately silent
// plus the HARD RULE: the delivery funnel is fire-and-forget — a funnel that
// rejects, or one that never settles at all, must not fail or delay the
// connection mutation.
//
// Only the funnel (`../notifications/deliver`) and the data layer are faked;
// real Express routing, real requireAuth with signed tokens, real zod and the
// real error handler all execute (see src/test/harness.ts).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("../test/harness")).createPrismaMock() }));
vi.mock("../notifications/deliver", async () => {
  const { vi: v } = await import("vitest");
  return { createAndDeliverNotification: v.fn(async () => ({ id: "notif_1" })) };
});

import { prisma } from "../db";
import { createAndDeliverNotification } from "../notifications/deliver";
import { connectionsRouter } from "./routes";
import { bearer, createTestApp, prismaMockFrom, asMock } from "../test/harness";

const db = prismaMockFrom(prisma);
const funnel = asMock(createAndDeliverNotification);
const app = createTestApp([["/api/connections", connectionsRouter]]);

const SENDER = "user-sender";
const RECIPIENT = "user-recipient";
const REQ = "conn-1";

function connRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQ,
    fromUserId: SENDER,
    toUserId: RECIPIENT,
    status: "pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    fromUser: { id: SENDER, firstName: "Sam", lastName: "Sender", role: "coach" },
    toUser: { id: RECIPIENT, firstName: "Rita", lastName: "Recipient", role: "player" },
    ...overrides,
  };
}

/** Arrange a POST that will succeed. */
function arrangeSendableRequest() {
  db.user.findUnique.mockResolvedValue({ id: RECIPIENT });
  db.connectionRequest.findFirst.mockResolvedValue(null);
  db.connectionRequest.upsert.mockResolvedValue(connRow());
}

/** The DeliverInput the funnel was called with (2nd positional arg). */
function funnelInput(call = 0) {
  return funnel.mock.calls[call][1] as {
    userId: string;
    type: string;
    title: string;
    message: string;
    linkTo?: string;
  };
}

/** Let any queued microtasks (the fire-and-forget chain) run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetAllMocks();
  funnel.mockResolvedValue({ id: "notif_1" });
});

describe("POST /api/connections — notifies the recipient", () => {
  it("emits exactly one notification, addressed to the RECIPIENT", async () => {
    arrangeSendableRequest();

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: RECIPIENT });

    expect(res.status).toBe(201);
    await flush();
    expect(funnel).toHaveBeenCalledTimes(1);

    const input = funnelInput();
    expect(input.userId).toBe(RECIPIENT); // never the actor
    expect(input.userId).not.toBe(SENDER);
    expect(input.type).toBe("connection_request_created");
    expect(input.linkTo).toBe("/connections");
    // The message names the sender so the recipient knows who asked.
    expect(input.message).toContain("Sam Sender");
  });

  it("stays a 201 when the funnel REJECTS (fire-and-forget hard rule)", async () => {
    arrangeSendableRequest();
    funnel.mockRejectedValue(new Error("notification table is on fire"));

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: RECIPIENT });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(REQ);
    // The mutation itself still happened.
    expect(db.connectionRequest.upsert).toHaveBeenCalledTimes(1);
    await flush(); // a swallowed rejection must not surface as unhandled
  });

  it("does not WAIT for the funnel — the response lands while delivery is still pending", async () => {
    arrangeSendableRequest();
    let settle: (() => void) | undefined;
    funnel.mockImplementation(() => new Promise<{ id: string }>((r) => { settle = () => r({ id: "notif_1" }); }));

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: RECIPIENT });

    expect(res.status).toBe(201); // returned without the funnel ever resolving
    expect(funnel).toHaveBeenCalledTimes(1);
    settle?.();
  });

  it("emits nothing when the request is REFUSED (409 duplicate)", async () => {
    db.user.findUnique.mockResolvedValue({ id: RECIPIENT });
    db.connectionRequest.findFirst.mockResolvedValue(connRow({ status: "active" }));

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: RECIPIENT });

    expect(res.status).toBe(409);
    await flush();
    expect(funnel).not.toHaveBeenCalled();
  });

  it("emits nothing when the target user does not exist (404)", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: "ghost" });

    expect(res.status).toBe(404);
    await flush();
    expect(funnel).not.toHaveBeenCalled();
  });

  it("emits nothing for a self-connect attempt (400)", async () => {
    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: SENDER });

    expect(res.status).toBe(400);
    await flush();
    expect(funnel).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/connections/:id — notifies the original sender", () => {
  function arrangeDecision(status: string) {
    db.connectionRequest.findUnique.mockResolvedValue(connRow());
    db.connectionRequest.update.mockResolvedValue(connRow({ status }));
  }

  it("tells the SENDER their request was accepted", async () => {
    arrangeDecision("active");

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "active" });

    expect(res.status).toBe(200);
    await flush();
    expect(funnel).toHaveBeenCalledTimes(1);

    const input = funnelInput();
    expect(input.userId).toBe(SENDER);
    expect(input.userId).not.toBe(RECIPIENT); // the approver is never notified
    expect(input.type).toBe("connection_request_approved");
    expect(input.linkTo).toBe("/connections");
    expect(input.message).toContain("Rita Recipient");
  });

  it("tells the SENDER their request was declined (respectfully worded, no blame)", async () => {
    arrangeDecision("rejected");

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "rejected" });

    expect(res.status).toBe(200);
    await flush();
    expect(funnelInput().userId).toBe(SENDER);
    expect(funnelInput().type).toBe("connection_request_rejected");
  });

  it("emits nothing when the decision is REFUSED (403 — not the recipient)", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow());

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(SENDER))
      .send({ status: "active" });

    expect(res.status).toBe(403);
    await flush();
    expect(funnel).not.toHaveBeenCalled();
  });

  it("stays a 200 when the funnel rejects", async () => {
    arrangeDecision("active");
    funnel.mockRejectedValue(new Error("smtp down"));

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "active" });

    expect(res.status).toBe(200);
    await flush();
  });
});

describe("DELETE /api/connections/:id — revoke stays silent", () => {
  it("does not notify the other party when a relationship is revoked", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow({ status: "active" }));
    db.connectionRequest.update.mockResolvedValue(connRow({ status: "revoked" }));

    const res = await request(app).delete(`/api/connections/${REQ}`).set("Authorization", bearer(SENDER));

    expect(res.status).toBe(200);
    await flush();
    expect(funnel).not.toHaveBeenCalled();
  });
});

describe("connection notification types are gated by the requestApprovals category", () => {
  it("maps every connection_request_* type to requestApprovals (the 'Connection Requests' toggle)", async () => {
    // The funnel module is mocked for the route specs above — reach for the
    // REAL categoryForType here so this asserts production behaviour.
    const actual = await vi.importActual<typeof import("../notifications/deliver")>("../notifications/deliver");
    expect(actual.categoryForType("connection_request_created")).toBe("requestApprovals");
    expect(actual.categoryForType("connection_request_approved")).toBe("requestApprovals");
    expect(actual.categoryForType("connection_request_rejected")).toBe("requestApprovals");
  });
});
