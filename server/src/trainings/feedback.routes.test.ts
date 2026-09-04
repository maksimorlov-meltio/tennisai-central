// ============================================================================
// HTTP route tests — PATCH /api/trainings/:id/feedback
//
// Feedback was previously saved through PATCH /api/trainings/:id, which is
// coach-only, so against the real backend every player who submitted feedback
// got a 403 and the feature only ever worked in mock mode. The fix is a route
// that admits players — and the whole risk of admitting them is that the
// general PATCH takes the entire training shape. So these specs pin two things
// with equal weight: WHO may write (a participant, and nobody else) and WHAT
// they may write (one field, and nothing else).
//
// The "nothing else" cases are the ones worth reading. A player who slips
// `title` or `coachNotes` into the body must be REFUSED, not quietly trimmed:
// a silent drop leaves the same request looking successful, and the next
// person to widen the schema has no failing test to warn them. Likewise
// `submittedAt` — a timestamp the sender chooses is not evidence of anything,
// so the spec asserts the stored value is the server's own.
//
// Style follows src/test/harness.ts: real Express routing, real requireAuth
// with genuinely signed tokens, real requireRole, real zod and the real error
// handler. Only the data layer is faked, and every assertion is about what the
// ROUTE did — the status code and the arguments handed to Prisma.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("../test/harness")).createPrismaMock() }));

import { prisma } from "../db";
import { trainingsRouter } from "./routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "../test/harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/trainings", trainingsRouter]]);

const COACH = "user-coach";
const OTHER_COACH = "user-other-coach";
const ALICE = "user-alice";
const BOB = "user-bob";
const STRANGER = "user-stranger";
const TRAINING = "tr-1";

function participant(playerId: string) {
  return {
    id: `p-${playerId}`,
    trainingId: TRAINING,
    playerId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    attendance: null,
    attendanceAt: null,
    attendanceBy: null,
    attendanceNote: null,
  };
}

function trainingRow(
  overrides: { coachId?: string; participants?: ReturnType<typeof participant>[] } = {},
) {
  return {
    id: TRAINING,
    title: "Serve block",
    description: null,
    trainingType: "individual",
    coachId: overrides.coachId ?? COACH,
    teamId: null,
    startDate: new Date("2026-06-01T09:00:00.000Z"),
    endDate: new Date("2026-06-01T10:00:00.000Z"),
    location: null,
    goal: null,
    intensity: null,
    notes: null,
    coachNotes: "Alice drops her elbow on the second serve.",
    review: null,
    playerSessionFeedback: null,
    analysis: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    participants: overrides.participants ?? [participant(ALICE), participant(BOB)],
  };
}

function asRole(role: string) {
  db.user.findUnique.mockResolvedValue({ role });
}

/** The session as it stands before the call — Alice and Bob are in it. */
function sessionExists(overrides: Parameters<typeof trainingRow>[0] = {}) {
  db.training.findUnique.mockResolvedValue(trainingRow(overrides));
  db.training.update.mockResolvedValue(trainingRow(overrides));
}

const validBody = {
  feeling: "good",
  energyLevel: 4,
  tags: ["Good pace", "Learned a lot"],
  note: "Backhand felt better today.",
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Who may write ───────────────────────────────────────────────────────────
describe("PATCH /api/trainings/:id/feedback — only a participant player may write", () => {
  it("saves the feedback of a PLAYER who is in the session", async () => {
    asRole("player");
    sessionExists();

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer(ALICE))
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Feedback saved");

    const arg = firstCallArg<{
      where: { id: string };
      data: { playerSessionFeedback: Record<string, unknown> };
    }>(db.training.update);
    expect(arg.where).toEqual({ id: TRAINING });
    expect(arg.data.playerSessionFeedback).toMatchObject({
      feeling: "good",
      energyLevel: 4,
      tags: ["Good pace", "Learned a lot"],
      note: "Backhand felt better today.",
    });
  });

  it("401s an unauthenticated caller before any role or training lookup", async () => {
    const res = await request(app).patch(`/api/trainings/${TRAINING}/feedback`).send(validBody);

    expect(res.status).toBe(401);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.training.findUnique).not.toHaveBeenCalled();
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("403s a PLAYER who is NOT a participant, and writes nothing", async () => {
    asRole("player");
    sessionExists();

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer(STRANGER))
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not a participant/i);
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("403s an OBSERVER (parent) — a guardian is not a proxy for the player's own word", async () => {
    asRole("observer");
    sessionExists();

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer("user-parent"))
      .send(validBody);

    expect(res.status).toBe(403);
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("403s a COACH on this route — coaches keep the general PATCH", async () => {
    asRole("coach");
    sessionExists();

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer(COACH))
      .send(validBody);

    expect(res.status).toBe(403);
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("404s a training that does not exist, without writing", async () => {
    asRole("player");
    db.training.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer(ALICE))
      .send(validBody);

    expect(res.status).toBe(404);
    expect(db.training.update).not.toHaveBeenCalled();
  });
});

// ── What they may write ─────────────────────────────────────────────────────
describe("PATCH /api/trainings/:id/feedback — one field and nothing else", () => {
  it("writes ONLY playerSessionFeedback — no other column is touched", async () => {
    asRole("player");
    sessionExists();

    await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer(ALICE))
      .send(validBody);

    const arg = firstCallArg<{ data: Record<string, unknown> }>(db.training.update);
    expect(Object.keys(arg.data)).toEqual(["playerSessionFeedback"]);
  });

  it("400s — and writes nothing — when a player smuggles another training field in", async () => {
    asRole("player");
    sessionExists();

    for (const smuggled of [
      { title: "Renamed by a player" },
      { coachNotes: "deleted" },
      { coachId: STRANGER },
      { startDate: "2030-01-01T00:00:00.000Z" },
      { review: { rating: 5 } },
      { playerIds: [STRANGER] },
    ]) {
      db.training.update.mockClear();

      const res = await request(app)
        .patch(`/api/trainings/${TRAINING}/feedback`)
        .set("Authorization", bearer(ALICE))
        .send({ ...validBody, ...smuggled });

      expect(res.status).toBe(400);
      expect(db.training.update).not.toHaveBeenCalled();
    }
  });

  it("refuses a client-supplied submittedAt / submittedBy outright rather than dropping it", async () => {
    asRole("player");
    sessionExists();

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer(ALICE))
      .send({ ...validBody, submittedAt: "1999-01-01T00:00:00.000Z", submittedBy: STRANGER });

    expect(res.status).toBe(400);
    expect(db.training.update).not.toHaveBeenCalled();
  });

  it("stamps submittedBy from the token and submittedAt from the server clock", async () => {
    asRole("player");
    sessionExists();
    const before = Date.now();

    await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer(ALICE))
      .send(validBody);

    const arg = firstCallArg<{
      data: { playerSessionFeedback: { submittedBy: string; submittedAt: string } };
    }>(db.training.update);
    expect(arg.data.playerSessionFeedback.submittedBy).toBe(ALICE);
    const stamped = Date.parse(arg.data.playerSessionFeedback.submittedAt);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it("400s an out-of-range energy level, an unknown feeling, an unknown tag or an over-long note", async () => {
    asRole("player");
    sessionExists();

    for (const bad of [
      { energyLevel: 9 },
      { energyLevel: 2.5 },
      { feeling: "ecstatic" },
      { tags: ["Sabotage"] },
      { note: "x".repeat(201) },
    ]) {
      db.training.update.mockClear();

      const res = await request(app)
        .patch(`/api/trainings/${TRAINING}/feedback`)
        .set("Authorization", bearer(ALICE))
        .send({ ...validBody, ...bad });

      expect(res.status).toBe(400);
      expect(db.training.update).not.toHaveBeenCalled();
    }
  });

  it("accepts feedback with no tags and no note — only the feeling and energy are required", async () => {
    asRole("player");
    sessionExists();

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/feedback`)
      .set("Authorization", bearer(BOB))
      .send({ feeling: "okay", energyLevel: 3 });

    expect(res.status).toBe(200);
    const arg = firstCallArg<{ data: { playerSessionFeedback: Record<string, unknown> } }>(
      db.training.update,
    );
    expect(arg.data.playerSessionFeedback).toMatchObject({
      feeling: "okay",
      energyLevel: 3,
      tags: [],
    });
  });
});

// ── The coach's route is unchanged ──────────────────────────────────────────
describe("the owning coach still saves feedback through the general PATCH", () => {
  it("200s a coach PATCHing /:id with playerSessionFeedback", async () => {
    db.user.findUnique.mockResolvedValue({ role: "coach", firstName: "Sam", lastName: "Coach" });
    db.training.findUnique.mockResolvedValue({ coachId: COACH });
    db.trainingParticipant.findMany.mockResolvedValue([{ playerId: ALICE }, { playerId: BOB }]);
    db.training.update.mockResolvedValue(trainingRow());

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(COACH))
      .send({ playerSessionFeedback: { feeling: "great", energyLevel: 5, tags: [] } });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Training updated");
    const arg = firstCallArg<{ data: Record<string, unknown> }>(db.training.update);
    expect(arg.data.playerSessionFeedback).toMatchObject({ feeling: "great", energyLevel: 5 });
  });
});

// ── DELETE is now gated like POST and PATCH ─────────────────────────────────
describe("DELETE /api/trainings/:id — role-gated like the other writes", () => {
  it("403s a player before the training is even read", async () => {
    asRole("player");

    const res = await request(app)
      .delete(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(ALICE));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not have permission/i);
    expect(db.training.findUnique).not.toHaveBeenCalled();
    expect(db.training.delete).not.toHaveBeenCalled();
  });

  it("still lets the owning coach delete", async () => {
    db.user.findUnique.mockResolvedValue({ role: "coach", firstName: "Sam", lastName: "Coach" });
    db.training.findUnique.mockResolvedValue(trainingRow());
    db.training.delete.mockResolvedValue(trainingRow());

    const res = await request(app)
      .delete(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(COACH));

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: { id: string } }>(db.training.delete).where).toEqual({
      id: TRAINING,
    });
  });

  it("still 403s a coach who does not own the training", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue(trainingRow({ coachId: OTHER_COACH }));

    const res = await request(app)
      .delete(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(COACH));

    expect(res.status).toBe(403);
    expect(db.training.delete).not.toHaveBeenCalled();
  });
});
