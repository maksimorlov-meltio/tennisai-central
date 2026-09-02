// ============================================================================
// HTTP route tests — /api/trainings
//
// Proves the role gate (only a coach may create/patch a session), that the
// owner `coachId` is server-pinned (a client-supplied `coachId` is ignored),
// that every participant must be a player the coach may act on (cross-user
// injection guard), and the owner/non-owner/unauthenticated triad on delete.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { trainingsRouter } from "../trainings/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/trainings", trainingsRouter]]);

const COACH = "user-coach";
const PLAYER = "user-player";
const OUTSIDER = "user-outsider";
const TRAINING = "tr-1";

/** Build a Training row (with participants) from what the ROUTE passed Prisma. */
function trainingRowFrom(data: Record<string, unknown>) {
  const participants =
    (data.participants as { create?: { playerId: string }[] } | undefined)?.create ?? [];
  return {
    id: TRAINING,
    title: (data.title as string) ?? "Session",
    description: data.description ?? null,
    trainingType: (data.trainingType as string) ?? "individual",
    coachId: data.coachId ?? null,
    teamId: data.teamId ?? null,
    startDate: (data.startDate as Date) ?? new Date("2026-06-01T09:00:00.000Z"),
    endDate: (data.endDate as Date) ?? new Date("2026-06-01T10:00:00.000Z"),
    location: data.location ?? null,
    goal: data.goal ?? null,
    intensity: data.intensity ?? null,
    notes: data.notes ?? null,
    coachNotes: data.coachNotes ?? null,
    review: data.review ?? null,
    playerSessionFeedback: data.playerSessionFeedback ?? null,
    analysis: data.analysis ?? null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    participants: participants.map((p, i) => ({ id: `p-${i}`, trainingId: TRAINING, playerId: p.playerId })),
  };
}

function asRole(role: string) {
  db.user.findUnique.mockResolvedValue({ role });
}

function noRelationship() {
  db.coachAssignment.findUnique.mockResolvedValue(null);
  db.connectionRequest.findFirst.mockResolvedValue(null);
  db.guardianship.findUnique.mockResolvedValue(null);
}

const validBody = {
  title: "Serve block",
  trainingType: "individual",
  startDate: "2026-06-01T09:00:00.000Z",
  endDate: "2026-06-01T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  db.training.create.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve(trainingRowFrom(args.data)),
  );
});

// ── POST /api/trainings — role gate ─────────────────────────────────────────
describe("POST /api/trainings — requires role coach", () => {
  it("401s an unauthenticated caller before any role lookup", async () => {
    const res = await request(app).post("/api/trainings").send(validBody);
    expect(res.status).toBe(401);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.training.create).not.toHaveBeenCalled();
  });

  it("403s a PLAYER-role token and never creates the session", async () => {
    asRole("player");

    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(PLAYER))
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not have permission/i);
    expect(db.training.create).not.toHaveBeenCalled();
  });

  it("403s an OBSERVER-role token", async () => {
    asRole("observer");
    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer("user-parent"))
      .send(validBody);
    expect(res.status).toBe(403);
    expect(db.training.create).not.toHaveBeenCalled();
  });

  it("401s when the token's user row no longer exists", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer("ghost"))
      .send(validBody);
    expect(res.status).toBe(401);
    expect(db.training.create).not.toHaveBeenCalled();
  });

  it("lets a COACH create a session (201) and pins coachId to the token's user", async () => {
    asRole("coach");

    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      // Hostile body: try to attribute the session to another coach.
      .send({ ...validBody, coachId: OUTSIDER });

    expect(res.status).toBe(201);
    const arg = firstCallArg<{ data: Record<string, unknown> }>(db.training.create);
    expect(arg.data.coachId).toBe(COACH);
    expect(JSON.stringify(arg.data)).not.toContain(OUTSIDER);
    expect(res.body.data.coachId).toBe(COACH);
  });
});

// ── POST /api/trainings — foreign participants ──────────────────────────────
describe("POST /api/trainings — participants must be actionable players", () => {
  it("403s a foreign playerId with no relationship and creates nothing", async () => {
    asRole("coach");
    noRelationship();

    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      .send({ ...validBody, playerIds: [PLAYER] });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not authorized to act on behalf/i);
    expect(db.training.create).not.toHaveBeenCalled();
  });

  it("403s when ONE of several participants is unrelated (all-or-nothing)", async () => {
    asRole("coach");
    db.coachAssignment.findUnique.mockImplementation(
      (args: { where: { coachId_playerId: { playerId: string } } }) =>
        Promise.resolve(
          args.where.coachId_playerId.playerId === PLAYER ? { status: "active" } : null,
        ),
    );
    db.connectionRequest.findFirst.mockResolvedValue(null);
    db.guardianship.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      .send({ ...validBody, playerIds: [PLAYER, OUTSIDER] });

    expect(res.status).toBe(403);
    expect(db.training.create).not.toHaveBeenCalled();
  });

  it("creates the session when every participant is actively assigned, deduping ids", async () => {
    asRole("coach");
    db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });

    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      .send({ ...validBody, playerIds: [PLAYER, PLAYER] });

    expect(res.status).toBe(201);
    const arg = firstCallArg<{ data: { participants: { create: { playerId: string }[] } } }>(
      db.training.create,
    );
    expect(arg.data.participants.create).toEqual([{ playerId: PLAYER }]);
    expect(res.body.data.playerIds).toEqual([PLAYER]);
  });

  it("403s an ENDED coach assignment (status must be active)", async () => {
    asRole("coach");
    db.coachAssignment.findUnique.mockResolvedValue({ status: "ended" });
    db.connectionRequest.findFirst.mockResolvedValue(null);
    db.guardianship.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      .send({ ...validBody, playerIds: [PLAYER] });

    expect(res.status).toBe(403);
    expect(db.training.create).not.toHaveBeenCalled();
  });

  it("400s a malformed trainingType before any authz lookup", async () => {
    asRole("coach");
    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      .send({ ...validBody, trainingType: "not-a-type" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request data");
    expect(db.training.create).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/trainings/:id ────────────────────────────────────────────────
describe("PATCH /api/trainings/:id", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).patch(`/api/trainings/${TRAINING}`).send({ title: "x" });
    expect(res.status).toBe(401);
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("403s a player-role token even for a session they participate in", async () => {
    asRole("player");
    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(PLAYER))
      .send({ title: "x" });
    expect(res.status).toBe(403);
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("403s a DIFFERENT coach (not the owner) and does not write", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue({ coachId: COACH });

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(OUTSIDER))
      .send({ title: "hijacked" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not own this training/i);
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("lets the owning coach update the session (200)", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue({ coachId: COACH });
    // The route reads the participant set before writing, so that it can tell
    // anyone added to — or dropped from — the session.
    db.trainingParticipant.findMany.mockResolvedValue([]);
    db.training.update.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(trainingRowFrom({ coachId: COACH, ...args.data })),
    );

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(COACH))
      .send({ title: "Renamed" });

    expect(res.status).toBe(200);
    const arg = firstCallArg<{ where: unknown; data: Record<string, unknown> }>(db.training.update);
    expect(arg.where).toEqual({ id: TRAINING });
    expect(arg.data.title).toBe("Renamed");
  });

  it("404s a missing session", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch("/api/trainings/ghost")
      .set("Authorization", bearer(COACH))
      .send({ title: "x" });
    expect(res.status).toBe(404);
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("403s replacing the participant set with an unrelated player", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue({ coachId: COACH });
    noRelationship();

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(COACH))
      .send({ playerIds: [OUTSIDER] });

    expect(res.status).toBe(403);
    expect(db.training.update).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/trainings/:id ───────────────────────────────────────────────
describe("DELETE /api/trainings/:id", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).delete(`/api/trainings/${TRAINING}`);
    expect(res.status).toBe(401);
    expect(db.training.delete).not.toHaveBeenCalled();
  });

  it("lets the owning coach delete (200)", async () => {
    // Deleting reads the whole row first: the cascade removes the participants,
    // so the people who need telling it is cancelled must be read beforehand.
    db.training.findUnique.mockResolvedValue({
      coachId: COACH,
      title: "Serve & first ball",
      startDate: new Date("2026-06-02T14:00:00.000Z"),
      participants: [],
    });
    db.training.delete.mockResolvedValue({ id: TRAINING });

    const res = await request(app)
      .delete(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(COACH));

    expect(res.status).toBe(200);
    expect(firstCallArg(db.training.delete)).toEqual({ where: { id: TRAINING } });
  });

  it("403s a DIFFERENT authenticated user and does NOT delete", async () => {
    db.training.findUnique.mockResolvedValue({ coachId: COACH });

    const res = await request(app)
      .delete(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(OUTSIDER));

    expect(res.status).toBe(403);
    expect(db.training.delete).not.toHaveBeenCalled();
  });

  it("404s a missing session", async () => {
    db.training.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .delete("/api/trainings/ghost")
      .set("Authorization", bearer(COACH));
    expect(res.status).toBe(404);
    expect(db.training.delete).not.toHaveBeenCalled();
  });
});

// ── GET /api/trainings — read scoping ───────────────────────────────────────
describe("GET /api/trainings", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get("/api/trainings");
    expect(res.status).toBe(401);
    expect(db.training.findMany).not.toHaveBeenCalled();
  });

  it("scopes the list query to sessions the caller coaches or participates in", async () => {
    db.training.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/trainings").set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: unknown }>(db.training.findMany).where).toEqual({
      OR: [{ coachId: PLAYER }, { participants: { some: { playerId: PLAYER } } }],
    });
  });
});

// ── Telling the players ─────────────────────────────────────────────────────
// Before this, only training *requests* ever produced a notification, so a
// coach could schedule, move or cancel a session and the player found out by
// looking. Delivery (email/push) is fire-and-forget inside `createNotification`
// and swallows its own failures, so what is asserted here is the row it writes
// — who is told, and that the coach is not told about their own action.
describe("trainings notify the players", () => {
  // The notification funnel is deliberately not awaited by the route, so let
  // the microtask queue drain before asserting on it.
  const flush = () => new Promise((r) => setTimeout(r, 0));

  /** userIds passed to notification.create, in call order. */
  function notifiedUsers(): string[] {
    return db.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { userId: string } }).data.userId,
    );
  }
  function notifiedTypes(): string[] {
    return db.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { type: string } }).data.type,
    );
  }

  it("tells every participant when a session is created, and never the coach", async () => {
    asRole("coach");
    db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });
    db.notification.create.mockResolvedValue({ id: "n-1" });

    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      .send({ ...validBody, playerIds: [PLAYER, OUTSIDER] });
    await flush();

    expect(res.status).toBe(201);
    expect(notifiedUsers().sort()).toEqual([OUTSIDER, PLAYER].sort());
    expect(notifiedUsers()).not.toContain(COACH);
    expect(notifiedTypes()).toEqual(["training_created", "training_created"]);
  });

  it("names the session and when it is, so the notification is worth reading", async () => {
    asRole("coach");
    db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });
    db.notification.create.mockResolvedValue({ id: "n-1" });

    await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      .send({ ...validBody, title: "Serve & first ball", playerIds: [PLAYER] });
    await flush();

    const written = db.notification.create.mock.calls[0][0] as {
      data: { message: string; linkTo: string };
    };
    expect(written.data.message).toContain("Serve & first ball");
    expect(written.data.linkTo).toBe("/calendar");
  });

  it("tells a player they were dropped, and a new one they were added", async () => {
    asRole("coach");
    db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });
    db.notification.create.mockResolvedValue({ id: "n-1" });
    db.training.findUnique.mockResolvedValue({ coachId: COACH });
    // PLAYER was on the session; the PATCH replaces the set with OUTSIDER.
    db.trainingParticipant.findMany.mockResolvedValue([{ playerId: PLAYER }]);
    db.training.update.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(trainingRowFrom({ coachId: COACH, ...args.data })),
    );

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(COACH))
      .send({ playerIds: [OUTSIDER] });
    await flush();

    expect(res.status).toBe(200);
    const byUser = Object.fromEntries(
      db.notification.create.mock.calls.map((c) => {
        const d = (c[0] as { data: { userId: string; type: string } }).data;
        return [d.userId, d.type];
      }),
    );
    expect(byUser[OUTSIDER]).toBe("training_created"); // added
    expect(byUser[PLAYER]).toBe("training_deleted"); // dropped
  });

  it("tells the participants when a session is cancelled", async () => {
    db.notification.create.mockResolvedValue({ id: "n-1" });
    db.training.findUnique.mockResolvedValue({
      coachId: COACH,
      title: "Serve & first ball",
      startDate: new Date("2026-06-02T14:00:00.000Z"),
      participants: [{ playerId: PLAYER }],
    });
    db.training.delete.mockResolvedValue({ id: TRAINING });

    const res = await request(app)
      .delete(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(COACH));
    await flush();

    expect(res.status).toBe(200);
    expect(notifiedUsers()).toEqual([PLAYER]);
    expect(notifiedTypes()).toEqual(["training_deleted"]);
  });

  it("does not fail the request when the notification cannot be written", async () => {
    asRole("coach");
    db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });
    db.notification.create.mockRejectedValue(new Error("notifications table is on fire"));

    const res = await request(app)
      .post("/api/trainings")
      .set("Authorization", bearer(COACH))
      .send({ ...validBody, playerIds: [PLAYER] });
    await flush();

    // Scheduling succeeded; telling people about it is best-effort.
    expect(res.status).toBe(201);
    expect(db.training.create).toHaveBeenCalled();
  });
});
