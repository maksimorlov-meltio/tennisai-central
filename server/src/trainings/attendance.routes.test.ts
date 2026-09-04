// ============================================================================
// HTTP route tests — PATCH /api/trainings/:id/attendance
//
// Taking the register is a coach's STATEMENT about who turned up, so the whole
// value of the record rests on who is allowed to write it. These specs pin the
// authorisation ladder down one rung at a time: unauthenticated, wrong role,
// right role but not the owner, owner. The player case is the one that matters
// most — a player marking themselves present would make the record useless for
// billing or no-show history, so it is refused even for their own row.
//
// Also covered: the enum gate on the status value, the cross-training guard (a
// valid mark aimed at someone who is not in THIS session), and the read shape —
// specifically that "nobody has taken the register" and "this player was not
// marked" both survive the trip to the client and neither looks like "absent".
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

type ParticipantOverrides = {
  attendance?: string | null;
  attendanceAt?: Date | null;
  attendanceBy?: string | null;
  attendanceNote?: string | null;
};

function participant(playerId: string, o: ParticipantOverrides = {}) {
  return {
    id: `p-${playerId}`,
    trainingId: TRAINING,
    playerId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    attendance: o.attendance ?? null,
    attendanceAt: o.attendanceAt ?? null,
    attendanceBy: o.attendanceBy ?? null,
    attendanceNote: o.attendanceNote ?? null,
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
    coachNotes: null,
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

const validBody = { marks: [{ playerId: ALICE, status: "present" }] };

beforeEach(() => {
  vi.resetAllMocks();
});

// ── The authorisation ladder ────────────────────────────────────────────────
describe("PATCH /api/trainings/:id/attendance — only the owning coach may mark", () => {
  it("401s an unauthenticated caller before any role or training lookup", async () => {
    const res = await request(app).patch(`/api/trainings/${TRAINING}/attendance`).send(validBody);

    expect(res.status).toBe(401);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.training.findUnique).not.toHaveBeenCalled();
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("403s a PLAYER marking THEMSELVES present and writes nothing", async () => {
    asRole("player");
    db.training.findUnique.mockResolvedValue(trainingRow());

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(ALICE))
      .send({ marks: [{ playerId: ALICE, status: "present" }] });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not have permission/i);
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("403s a PLAYER marking someone else and writes nothing", async () => {
    asRole("player");
    db.training.findUnique.mockResolvedValue(trainingRow());

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(ALICE))
      .send({ marks: [{ playerId: BOB, status: "absent" }] });

    expect(res.status).toBe(403);
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("403s an OBSERVER (parent) and writes nothing", async () => {
    asRole("observer");
    db.training.findUnique.mockResolvedValue(trainingRow());

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer("user-parent"))
      .send(validBody);

    expect(res.status).toBe(403);
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("403s a DIFFERENT coach — role alone is not enough, the session must be theirs", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue(trainingRow({ coachId: COACH }));

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(OTHER_COACH))
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not own this training/i);
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("404s an unknown training without writing", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/trainings/nope/attendance")
      .set("Authorization", bearer(COACH))
      .send(validBody);

    expect(res.status).toBe(404);
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("lets the OWNING coach mark, stamping the marker and the time server-side", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue(trainingRow());
    db.trainingParticipant.update.mockResolvedValue(participant(ALICE, { attendance: "late" }));

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(COACH))
      // Hostile body: try to attribute the mark to somebody else.
      .send({ marks: [{ playerId: ALICE, status: "late", note: "Traffic" }], markedBy: STRANGER });

    expect(res.status).toBe(200);
    const arg = firstCallArg<{ where: Record<string, unknown>; data: Record<string, unknown> }>(
      db.trainingParticipant.update,
    );
    expect(arg.where).toEqual({ trainingId_playerId: { trainingId: TRAINING, playerId: ALICE } });
    expect(arg.data.attendance).toBe("late");
    expect(arg.data.attendanceBy).toBe(COACH);
    expect(arg.data.attendanceNote).toBe("Traffic");
    expect(arg.data.attendanceAt).toBeInstanceOf(Date);
    // The client-supplied marker never reaches the database.
    expect(JSON.stringify(arg.data)).not.toContain(STRANGER);
  });

  it("writes once per player when the whole register is submitted at once", async () => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue(trainingRow());
    db.trainingParticipant.update.mockResolvedValue(participant(ALICE, { attendance: "present" }));

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(COACH))
      .send({
        marks: [
          { playerId: ALICE, status: "present" },
          { playerId: BOB, status: "excused" },
        ],
      });

    expect(res.status).toBe(200);
    expect(db.trainingParticipant.update).toHaveBeenCalledTimes(2);
  });
});

// ── Validation ──────────────────────────────────────────────────────────────
describe("PATCH /api/trainings/:id/attendance — validation", () => {
  beforeEach(() => {
    asRole("coach");
    db.training.findUnique.mockResolvedValue(trainingRow());
  });

  it.each(["present", "absent", "late", "excused"])("accepts %s", async (status) => {
    db.trainingParticipant.update.mockResolvedValue(participant(ALICE, { attendance: status }));

    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(COACH))
      .send({ marks: [{ playerId: ALICE, status }] });

    expect(res.status).toBe(200);
  });

  it.each(["maybe", "PRESENT", "", "no-show", null, 1, true])(
    "400s the invalid status %p and writes nothing",
    async (status) => {
      const res = await request(app)
        .patch(`/api/trainings/${TRAINING}/attendance`)
        .set("Authorization", bearer(COACH))
        .send({ marks: [{ playerId: ALICE, status }] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid request data/i);
      expect(db.trainingParticipant.update).not.toHaveBeenCalled();
    },
  );

  it("400s an empty marks array — a save that changes nothing is a bug, not a no-op", async () => {
    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(COACH))
      .send({ marks: [] });

    expect(res.status).toBe(400);
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("400s a note longer than 200 characters", async () => {
    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(COACH))
      .send({ marks: [{ playerId: ALICE, status: "absent", note: "x".repeat(201) }] });

    expect(res.status).toBe(400);
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("404s a playerId that is not a participant of THIS session, before any write", async () => {
    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(COACH))
      .send({ marks: [{ playerId: STRANGER, status: "present" }] });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not in this training/i);
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it("rejects a batch ATOMICALLY when one player of several is a stranger", async () => {
    const res = await request(app)
      .patch(`/api/trainings/${TRAINING}/attendance`)
      .set("Authorization", bearer(COACH))
      .send({
        marks: [
          { playerId: ALICE, status: "present" },
          { playerId: STRANGER, status: "present" },
        ],
      });

    expect(res.status).toBe(404);
    // Alice is a genuine participant, but a partly-applied register is worse
    // than a refused one — nothing at all should have been written.
    expect(db.trainingParticipant.update).not.toHaveBeenCalled();
  });
});

// ── The read shape: "not taken" is not "absent" ─────────────────────────────
describe("GET /api/trainings — attendance in the read payload", () => {
  it("omits `attendance` entirely when nobody has taken the register", async () => {
    db.training.findMany.mockResolvedValue([trainingRow()]);

    const res = await request(app).get("/api/trainings").set("Authorization", bearer(COACH));

    expect(res.status).toBe(200);
    // Not an empty array, not a list of "absent" — absent from the payload, so
    // the UI can say "register not taken" rather than "nobody turned up".
    expect(res.body.data[0]).not.toHaveProperty("attendance");
    expect(JSON.stringify(res.body.data[0])).not.toContain("absent");
  });

  it("returns one entry per participant once ANY mark exists, leaving unmarked rows status-less", async () => {
    db.training.findMany.mockResolvedValue([
      trainingRow({
        participants: [
          participant(ALICE, {
            attendance: "absent",
            attendanceAt: new Date("2026-06-01T09:05:00.000Z"),
            attendanceBy: COACH,
            attendanceNote: "Injured",
          }),
          participant(BOB),
        ],
      }),
    ]);

    const res = await request(app).get("/api/trainings").set("Authorization", bearer(COACH));

    const attendance = res.body.data[0].attendance;
    expect(attendance).toHaveLength(2);

    const alice = attendance.find((a: { playerId: string }) => a.playerId === ALICE);
    expect(alice).toMatchObject({
      status: "absent",
      markedBy: COACH,
      markedAt: "2026-06-01T09:05:00.000Z",
      note: "Injured",
    });

    // Bob is in the same taken register with no mark of his own. That is a
    // third state — not present, not absent — and it must not carry a status.
    const bob = attendance.find((a: { playerId: string }) => a.playerId === BOB);
    expect(bob).toBeDefined();
    expect(bob.status).toBeUndefined();
  });

  it("GET /:id carries attendance too", async () => {
    db.training.findFirst.mockResolvedValue(
      trainingRow({
        participants: [participant(ALICE, { attendance: "present", attendanceBy: COACH })],
      }),
    );

    const res = await request(app)
      .get(`/api/trainings/${TRAINING}`)
      .set("Authorization", bearer(ALICE));

    expect(res.status).toBe(200);
    expect(res.body.data.attendance).toEqual([
      { playerId: ALICE, status: "present", markedBy: COACH },
    ]);
  });
});
