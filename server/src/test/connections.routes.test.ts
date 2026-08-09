// ============================================================================
// HTTP route tests — /api/connections
//
// The approval flow is the privilege boundary: whoever can flip a request to
// `active` gains a relationship, and an active relationship is what
// `assertCanActOnPlayer` later trusts to allow writing into someone else's
// calendar / trainings. So: only the RECIPIENT may approve (self-approval by the
// sender is refused), terminal states are guarded, and revoke is limited to the
// two participants.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { connectionsRouter } from "../connections/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/connections", connectionsRouter]]);

const SENDER = "user-sender";
const RECIPIENT = "user-recipient";
const STRANGER = "user-stranger";
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

beforeEach(() => {
  vi.resetAllMocks();
});

// ── PATCH /api/connections/:id — approve / reject ───────────────────────────
describe("PATCH /api/connections/:id", () => {
  it("401s an unauthenticated caller and never reads the request", async () => {
    const res = await request(app).patch(`/api/connections/${REQ}`).send({ status: "active" });
    expect(res.status).toBe(401);
    expect(db.connectionRequest.findUnique).not.toHaveBeenCalled();
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("403s the SENDER approving their OWN request (no self-granted relationship)", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow());

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(SENDER))
      .send({ status: "active" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only the recipient/i);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("403s an unrelated third party", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow());

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(STRANGER))
      .send({ status: "active" });

    expect(res.status).toBe(403);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("lets the RECIPIENT approve (200) and writes status=active for that request only", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow());
    db.connectionRequest.update.mockImplementation((args: { data: { status: string } }) =>
      Promise.resolve(connRow({ status: args.data.status })),
    );

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "active" });

    expect(res.status).toBe(200);
    const arg = firstCallArg<{ where: unknown; data: unknown }>(db.connectionRequest.update);
    expect(arg.where).toEqual({ id: REQ });
    expect(arg.data).toEqual({ status: "active" });
    expect(res.body.data.status).toBe("active");
  });

  it("lets the RECIPIENT reject (200)", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow());
    db.connectionRequest.update.mockImplementation((args: { data: { status: string } }) =>
      Promise.resolve(connRow({ status: args.data.status })),
    );

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "rejected" });

    expect(res.status).toBe(200);
    expect(firstCallArg<{ data: unknown }>(db.connectionRequest.update).data).toEqual({
      status: "rejected",
    });
  });

  it("404s a missing request", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/connections/ghost")
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "active" });

    expect(res.status).toBe(404);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("409s re-acting on an already-resolved request (terminal-state guard)", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow({ status: "active" }));

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "active" });

    expect(res.status).toBe(409);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("409s reviving a revoked relationship via PATCH", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow({ status: "revoked" }));

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "active" });

    expect(res.status).toBe(409);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("400s a status outside the allowed enum (e.g. 'revoked' via PATCH)", async () => {
    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "revoked" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request data");
    expect(db.connectionRequest.findUnique).not.toHaveBeenCalled();
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/connections/:id — revoke ────────────────────────────────────
describe("DELETE /api/connections/:id (revoke)", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).delete(`/api/connections/${REQ}`);
    expect(res.status).toBe(401);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("lets either participant revoke an active relationship (200 → status revoked)", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow({ status: "active" }));
    db.connectionRequest.update.mockResolvedValue(connRow({ status: "revoked" }));

    const bySender = await request(app)
      .delete(`/api/connections/${REQ}`)
      .set("Authorization", bearer(SENDER));
    expect(bySender.status).toBe(200);
    expect(firstCallArg<{ where: unknown; data: unknown }>(db.connectionRequest.update)).toEqual({
      where: { id: REQ },
      data: { status: "revoked" },
    });

    db.connectionRequest.update.mockClear();
    const byRecipient = await request(app)
      .delete(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT));
    expect(byRecipient.status).toBe(200);
    expect(db.connectionRequest.update).toHaveBeenCalledTimes(1);
  });

  it("403s a NON-participant trying to revoke someone else's relationship", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow({ status: "active" }));

    const res = await request(app)
      .delete(`/api/connections/${REQ}`)
      .set("Authorization", bearer(STRANGER));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not part of this relationship/i);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("409s revoking a non-active relationship", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(connRow({ status: "pending" }));

    const res = await request(app)
      .delete(`/api/connections/${REQ}`)
      .set("Authorization", bearer(SENDER));

    expect(res.status).toBe(409);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("404s a missing relationship", async () => {
    db.connectionRequest.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/connections/ghost")
      .set("Authorization", bearer(SENDER));

    expect(res.status).toBe(404);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });
});

// ── POST /api/connections + GET scoping ─────────────────────────────────────
describe("POST /api/connections", () => {
  it("pins fromUserId to the token's user (a client cannot send a request AS someone else)", async () => {
    db.user.findUnique.mockResolvedValue({ id: RECIPIENT });
    db.connectionRequest.findFirst.mockResolvedValue(null);
    db.connectionRequest.upsert.mockImplementation((args: { create: Record<string, unknown> }) =>
      Promise.resolve(connRow({ fromUserId: args.create.fromUserId, toUserId: args.create.toUserId })),
    );

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      // Hostile body: pretend the request comes from a third party.
      .send({ toUserId: RECIPIENT, fromUserId: STRANGER });

    expect(res.status).toBe(201);
    const arg = firstCallArg<{
      where: { fromUserId_toUserId: { fromUserId: string } };
      create: { fromUserId: string; status: string };
    }>(db.connectionRequest.upsert);
    expect(arg.where.fromUserId_toUserId.fromUserId).toBe(SENDER);
    expect(arg.create.fromUserId).toBe(SENDER);
    // A new request is never born `active` — it must be approved by the recipient.
    expect(arg.create.status).toBe("pending");
    expect(JSON.stringify(arg)).not.toContain(STRANGER);
  });

  it("400s connecting to yourself", async () => {
    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: SENDER });

    expect(res.status).toBe(400);
    expect(db.connectionRequest.upsert).not.toHaveBeenCalled();
  });

  it("404s an unknown target user", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: "ghost" });

    expect(res.status).toBe(404);
    expect(db.connectionRequest.upsert).not.toHaveBeenCalled();
  });

  it("409s when an active/pending link already exists in either direction", async () => {
    db.user.findUnique.mockResolvedValue({ id: RECIPIENT });
    db.connectionRequest.findFirst.mockResolvedValue(connRow({ status: "active" }));

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(SENDER))
      .send({ toUserId: RECIPIENT });

    expect(res.status).toBe(409);
    expect(db.connectionRequest.upsert).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).post("/api/connections").send({ toUserId: RECIPIENT });
    expect(res.status).toBe(401);
    expect(db.connectionRequest.upsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/connections", () => {
  it("scopes the list to requests involving the caller", async () => {
    db.connectionRequest.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/connections").set("Authorization", bearer(SENDER));

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: unknown }>(db.connectionRequest.findMany).where).toEqual({
      OR: [{ fromUserId: SENDER }, { toUserId: SENDER }],
    });
  });

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get("/api/connections");
    expect(res.status).toBe(401);
    expect(db.connectionRequest.findMany).not.toHaveBeenCalled();
  });
});
