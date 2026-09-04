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
    fromUser: { id: SENDER, publicId: "TAI-C-SENDER", firstName: "Sam", lastName: "Sender", role: "coach" },
    toUser: { id: RECIPIENT, publicId: "TAI-P-RECIP", firstName: "Rita", lastName: "Recipient", role: "player" },
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

// ── The shareable ids ───────────────────────────────────────────────────────
//
// These were missing from the response, so the client built a TAI-P-… of its
// own out of the digits in the user's cuid. It looked plausible, belonged to
// nobody, and was shown on every screen listing a player — including to a coach
// reading it out so somebody could connect with them.
describe("GET /api/connections — public ids", () => {
  it("returns each side's real publicId", async () => {
    db.connectionRequest.findMany.mockResolvedValue([connRow({ status: "active" })]);

    const res = await request(app)
      .get("/api/connections")
      .set("Authorization", bearer(SENDER));

    expect(res.status).toBe(200);
    expect(res.body.data[0].fromUserPublicId).toBe("TAI-C-SENDER");
    expect(res.body.data[0].toUserPublicId).toBe("TAI-P-RECIP");
  });

  it("still never leaks a password hash or email through the join", async () => {
    db.connectionRequest.findMany.mockResolvedValue([
      connRow({
        fromUser: {
          id: SENDER, publicId: "TAI-C-SENDER", firstName: "Sam", lastName: "Sender",
          role: "coach", email: "sam@example.com", passwordHash: "$2a$12$nope",
        },
      }),
    ]);

    const res = await request(app)
      .get("/api/connections")
      .set("Authorization", bearer(SENDER));

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("sam@example.com");
  });
});

// ── How many coaches one player may have ────────────────────────────────────
//
// There was no limit at all: a player could accumulate coaches indefinitely,
// and every one of them sees that player's calendar, sessions, notes and match
// history. Three is the agreed ceiling — enough for a club coach, a fitness
// coach and a national-programme coach, and a deliberate number rather than
// however many requests happen to get approved.
describe("the coach limit", () => {
  /** An active coach↔player connection, from the count query's point of view. */
  const atCapacity = (n: number) => db.connectionRequest.count.mockResolvedValue(n);

  const coach = { id: "user-coach", role: "coach", firstName: "Sam", lastName: "Sender" };
  const player = { id: "user-player", role: "player", firstName: "Rita", lastName: "Recipient" };

  it("lets a coach connect to a player who has two", async () => {
    db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === coach.id ? coach : player),
    );
    atCapacity(2);
    db.connectionRequest.findFirst.mockResolvedValue(null);
    db.connectionRequest.upsert.mockResolvedValue(connRow());

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(coach.id))
      .send({ toUserId: player.id });

    expect(res.status).toBe(201);
  });

  it("refuses the fourth, and never writes the request", async () => {
    db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === coach.id ? coach : player),
    );
    atCapacity(3);

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(coach.id))
      .send({ toUserId: player.id });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/at most 3 coaches/i);
    expect(db.connectionRequest.upsert).not.toHaveBeenCalled();
  });

  it("refuses again at APPROVAL, which is where the real limit lives", async () => {
    // Three coaches can each send a request while the player has none active.
    // Checking only at send time would let all four through.
    db.connectionRequest.findUnique.mockResolvedValue(
      connRow({ fromUser: coach, toUser: player, status: "pending" }),
    );
    atCapacity(3);

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "active" });

    expect(res.status).toBe(409);
    expect(db.connectionRequest.update).not.toHaveBeenCalled();
  });

  it("lets a player DECLINE even at the limit", async () => {
    // Rejecting adds no relationship, so the limit has nothing to say about it.
    db.connectionRequest.findUnique.mockResolvedValue(
      connRow({ fromUser: coach, toUser: player, status: "pending" }),
    );
    atCapacity(3);
    db.connectionRequest.update.mockResolvedValue(connRow({ status: "rejected" }));

    const res = await request(app)
      .patch(`/api/connections/${REQ}`)
      .set("Authorization", bearer(RECIPIENT))
      .send({ status: "rejected" });

    expect(res.status).toBe(200);
  });

  it("says nothing about pairings that are not coach and player", async () => {
    // A parent following a player, for instance, is not this rule's business.
    const parent = { id: "user-parent", role: "observer", firstName: "Kim", lastName: "Brooks" };
    db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === parent.id ? parent : player),
    );
    atCapacity(99);
    db.connectionRequest.findFirst.mockResolvedValue(null);
    db.connectionRequest.upsert.mockResolvedValue(connRow());

    const res = await request(app)
      .post("/api/connections")
      .set("Authorization", bearer(parent.id))
      .send({ toUserId: player.id });

    expect(res.status).toBe(201);
  });
});
