// ============================================================================
// HTTP route tests — /api/calendar/events
//
// REGRESSION NET for the two real vulnerabilities that already occurred here:
//   1. client-forgeable `createdBy` (an attacker could forge event ownership);
//   2. cross-user content injection — posting an event with someone else's
//      `playerId` pushed content into THEIR calendar/feed.
// Both are asserted against the arguments the route hands to Prisma, so the
// mock cannot flatter the result: the create mock ECHOES the route's own data
// back, meaning every field asserted on the response was written by the route.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { calendarRouter } from "../calendar/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/calendar", calendarRouter]]);

const ACTOR = "user-actor";
const VICTIM = "user-victim";
const EVENT = "ev-1";

/** Build a CalendarEvent row from whatever the ROUTE passed to Prisma. */
function eventRowFrom(data: Record<string, unknown>) {
  return {
    id: EVENT,
    title: (data.title as string) ?? "Session",
    type: (data.type as string) ?? "training",
    state: data.state ?? null,
    startDate: (data.startDate as Date) ?? new Date("2026-06-01T09:00:00.000Z"),
    endDate: (data.endDate as Date) ?? new Date("2026-06-01T10:00:00.000Z"),
    location: data.location ?? null,
    description: data.description ?? null,
    playerId: data.playerId ?? null,
    playerName: data.playerName ?? null,
    teamId: data.teamId ?? null,
    tournamentId: data.tournamentId ?? null,
    coachNotes: data.coachNotes ?? null,
    createdBy: data.createdBy ?? null,
    createdByRole: data.createdByRole ?? null,
    trainingRequestId: data.trainingRequestId ?? null,
    recurrence: null,
  };
}

/** No coach assignment, no connection, no guardianship → assertCanActOnPlayer 403s. */
function noRelationship() {
  db.coachAssignment.findUnique.mockResolvedValue(null);
  db.connectionRequest.findFirst.mockResolvedValue(null);
  db.guardianship.findUnique.mockResolvedValue(null);
}

const validBody = {
  title: "Morning session",
  type: "training",
  startDate: "2026-06-01T09:00:00.000Z",
  endDate: "2026-06-01T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  db.calendarEvent.create.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve(eventRowFrom(args.data)),
  );
  db.calendarEvent.update.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve(eventRowFrom({ createdBy: ACTOR, ...args.data })),
  );
});

// ── POST /api/calendar/events — ownership pinning ───────────────────────────
describe("POST /api/calendar/events — createdBy is server-pinned", () => {
  it("IGNORES a client-supplied createdBy and pins it to the token's user", async () => {
    const res = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(ACTOR))
      // Hostile body: forge ownership onto another account.
      .send({ ...validBody, createdBy: VICTIM });

    expect(res.status).toBe(201);
    const arg = firstCallArg<{ data: Record<string, unknown> }>(db.calendarEvent.create);
    expect(arg.data.createdBy).toBe(ACTOR);
    expect(JSON.stringify(arg.data)).not.toContain(VICTIM);
    expect(res.body.data.createdBy).toBe(ACTOR);
  });

  it("401s an unauthenticated caller and never writes", async () => {
    const res = await request(app).post("/api/calendar/events").send(validBody);
    expect(res.status).toBe(401);
    expect(db.calendarEvent.create).not.toHaveBeenCalled();
  });
});

// ── POST /api/calendar/events — cross-user injection ────────────────────────
describe("POST /api/calendar/events — foreign playerId requires a relationship", () => {
  it("403s injecting an event into ANOTHER user's calendar with no relationship", async () => {
    noRelationship();

    const res = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(ACTOR))
      .send({ ...validBody, playerId: VICTIM, playerName: "Victim" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not authorized to act on behalf/i);
    expect(db.calendarEvent.create).not.toHaveBeenCalled();
  });

  it("allows a foreign playerId when an ACTIVE connection links the two (still pinning createdBy)", async () => {
    db.coachAssignment.findUnique.mockResolvedValue(null);
    db.connectionRequest.findFirst.mockResolvedValue({ id: "conn-1" });

    const res = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(ACTOR))
      .send({ ...validBody, playerId: VICTIM });

    expect(res.status).toBe(201);
    const arg = firstCallArg<{ data: Record<string, unknown> }>(db.calendarEvent.create);
    expect(arg.data.playerId).toBe(VICTIM);
    expect(arg.data.createdBy).toBe(ACTOR);
  });

  it("needs no relationship lookup when the playerId IS the caller (self fast-path)", async () => {
    const res = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(ACTOR))
      .send({ ...validBody, playerId: ACTOR });

    expect(res.status).toBe(201);
    expect(db.coachAssignment.findUnique).not.toHaveBeenCalled();
    expect(db.connectionRequest.findFirst).not.toHaveBeenCalled();
  });
});

// ── POST /api/calendar/events — validation hygiene ──────────────────────────
describe("POST /api/calendar/events — validation", () => {
  it("400s a malformed date (not a 500) and never writes an Invalid Date", async () => {
    const res = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(ACTOR))
      .send({ ...validBody, startDate: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request data");
    expect(db.calendarEvent.create).not.toHaveBeenCalled();
  });

  it("400s an unknown event type and a missing title", async () => {
    const bad = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(ACTOR))
      .send({ ...validBody, type: "hacking" });
    expect(bad.status).toBe(400);

    const noTitle = await request(app)
      .post("/api/calendar/events")
      .set("Authorization", bearer(ACTOR))
      .send({ ...validBody, title: "" });
    expect(noTitle.status).toBe(400);

    expect(db.calendarEvent.create).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/calendar/events/:id ──────────────────────────────────────────
describe("PATCH /api/calendar/events/:id", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).patch(`/api/calendar/events/${EVENT}`).send({ title: "x" });
    expect(res.status).toBe(401);
    expect(db.calendarEvent.update).not.toHaveBeenCalled();
  });

  it("lets the creator update their own event (200)", async () => {
    db.calendarEvent.findUnique.mockResolvedValue({ createdBy: ACTOR, playerId: null });

    const res = await request(app)
      .patch(`/api/calendar/events/${EVENT}`)
      .set("Authorization", bearer(ACTOR))
      .send({ title: "Renamed" });

    expect(res.status).toBe(200);
    const arg = firstCallArg<{ where: unknown; data: Record<string, unknown> }>(db.calendarEvent.update);
    expect(arg.where).toEqual({ id: EVENT });
    expect(arg.data.title).toBe("Renamed");
  });

  it("403s a DIFFERENT authenticated user (neither creator nor player) and does not write", async () => {
    db.calendarEvent.findUnique.mockResolvedValue({ createdBy: VICTIM, playerId: VICTIM });

    const res = await request(app)
      .patch(`/api/calendar/events/${EVENT}`)
      .set("Authorization", bearer(ACTOR))
      .send({ title: "hijacked" });

    expect(res.status).toBe(403);
    expect(db.calendarEvent.update).not.toHaveBeenCalled();
  });

  it("404s a missing event", async () => {
    db.calendarEvent.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/calendar/events/ghost")
      .set("Authorization", bearer(ACTOR))
      .send({ title: "x" });

    expect(res.status).toBe(404);
    expect(db.calendarEvent.update).not.toHaveBeenCalled();
  });

  it("403s REASSIGNING one's own event to a foreign playerId with no relationship", async () => {
    db.calendarEvent.findUnique.mockResolvedValue({ createdBy: ACTOR, playerId: ACTOR });
    noRelationship();

    const res = await request(app)
      .patch(`/api/calendar/events/${EVENT}`)
      .set("Authorization", bearer(ACTOR))
      .send({ playerId: VICTIM });

    expect(res.status).toBe(403);
    expect(db.calendarEvent.update).not.toHaveBeenCalled();
  });

  it("resolves a virtual occurrence id to its parent event", async () => {
    db.calendarEvent.findUnique.mockResolvedValue({ createdBy: ACTOR, playerId: null });

    const res = await request(app)
      .patch(`/api/calendar/events/${EVENT}_occ_3`)
      .set("Authorization", bearer(ACTOR))
      .send({ title: "Renamed" });

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: unknown }>(db.calendarEvent.findUnique).where).toEqual({ id: EVENT });
    expect(firstCallArg<{ where: unknown }>(db.calendarEvent.update).where).toEqual({ id: EVENT });
  });
});

// ── DELETE /api/calendar/events/:id ─────────────────────────────────────────
describe("DELETE /api/calendar/events/:id", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).delete(`/api/calendar/events/${EVENT}`);
    expect(res.status).toBe(401);
    expect(db.calendarEvent.delete).not.toHaveBeenCalled();
  });

  it("lets the creator delete their event (200)", async () => {
    db.calendarEvent.findUnique.mockResolvedValue({ createdBy: ACTOR, playerId: null });
    db.calendarEvent.delete.mockResolvedValue({ id: EVENT });

    const res = await request(app)
      .delete(`/api/calendar/events/${EVENT}`)
      .set("Authorization", bearer(ACTOR));

    expect(res.status).toBe(200);
    expect(firstCallArg(db.calendarEvent.delete)).toEqual({ where: { id: EVENT } });
  });

  it("403s a DIFFERENT authenticated user and does NOT delete", async () => {
    db.calendarEvent.findUnique.mockResolvedValue({ createdBy: VICTIM, playerId: VICTIM });

    const res = await request(app)
      .delete(`/api/calendar/events/${EVENT}`)
      .set("Authorization", bearer(ACTOR));

    expect(res.status).toBe(403);
    expect(db.calendarEvent.delete).not.toHaveBeenCalled();
  });

  it("404s a missing event", async () => {
    db.calendarEvent.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/calendar/events/ghost")
      .set("Authorization", bearer(ACTOR));

    expect(res.status).toBe(404);
    expect(db.calendarEvent.delete).not.toHaveBeenCalled();
  });
});

// ── GET /api/calendar/events — read scoping ─────────────────────────────────
describe("GET /api/calendar/events", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get("/api/calendar/events");
    expect(res.status).toBe(401);
    expect(db.calendarEvent.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to events the caller created or is the player on", async () => {
    db.calendarEvent.findMany.mockResolvedValue([]);
    db.training.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/calendar/events").set("Authorization", bearer(ACTOR));

    expect(res.status).toBe(200);
    // The WHERE the route builds is the whole protection here — assert it.
    expect(firstCallArg(db.calendarEvent.findMany)).toEqual({
      where: { OR: [{ createdBy: ACTOR }, { playerId: ACTOR }] },
    });
  });

  // ── Trainings projected onto the calendar ────────────────────────────────
  // A coach booking a session writes a Training row, which is a different
  // table from CalendarEvent — so before this the session showed up on nobody's
  // schedule. These assert the projection AND that it inherits the trainings
  // scope rather than widening what anyone can see.
  const PLAYER = "user-player";
  const OTHER = "user-other";

  function trainingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "tr-1",
      title: "Serve & first ball",
      description: null,
      trainingType: "individual",
      coachId: ACTOR,
      teamId: null,
      startDate: new Date("2026-06-02T14:00:00.000Z"),
      endDate: new Date("2026-06-02T15:30:00.000Z"),
      location: "Court 3",
      coachNotes: null,
      participants: [
        { playerId: PLAYER, player: { id: PLAYER, firstName: "Anastasiya", lastName: "Kosar" } },
      ],
      ...overrides,
    };
  }

  it("asks only for trainings the caller coaches or takes part in", async () => {
    db.calendarEvent.findMany.mockResolvedValue([]);
    db.training.findMany.mockResolvedValue([]);

    await request(app).get("/api/calendar/events").set("Authorization", bearer(ACTOR));

    expect(firstCallArg(db.training.findMany)).toMatchObject({
      where: { OR: [{ coachId: ACTOR }, { participants: { some: { playerId: ACTOR } } }] },
    });
  });

  it("puts a coach's training on the calendar, one event per participant", async () => {
    db.calendarEvent.findMany.mockResolvedValue([]);
    db.training.findMany.mockResolvedValue([trainingRow()]);

    const res = await request(app).get("/api/calendar/events").set("Authorization", bearer(ACTOR));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: `training-tr-1-${PLAYER}`,
      type: "training",
      title: "Serve & first ball",
      location: "Court 3",
      playerId: PLAYER,
      playerName: "Anastasiya Kosar",
      createdBy: ACTOR,
      startDate: "2026-06-02T14:00:00.000Z",
      endDate: "2026-06-02T15:30:00.000Z",
    });
  });

  it("shows a participant only their own place in the session, not their team-mates'", async () => {
    db.calendarEvent.findMany.mockResolvedValue([]);
    db.training.findMany.mockResolvedValue([
      trainingRow({
        participants: [
          { playerId: PLAYER, player: { id: PLAYER, firstName: "Anastasiya", lastName: "Kosar" } },
          { playerId: OTHER, player: { id: OTHER, firstName: "Someone", lastName: "Else" } },
        ],
      }),
    ]);

    const res = await request(app).get("/api/calendar/events").set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(`training-tr-1-${PLAYER}`);
    expect(res.body.data[0].playerId).toBe(PLAYER);
    // The other participant's name must not travel with it.
    expect(JSON.stringify(res.body.data)).not.toContain("Someone");
  });

  it("projects a training with no participants as the coach's own block of time", async () => {
    db.calendarEvent.findMany.mockResolvedValue([]);
    db.training.findMany.mockResolvedValue([trainingRow({ participants: [] })]);

    const res = await request(app).get("/api/calendar/events").set("Authorization", bearer(ACTOR));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe("training-tr-1");
    expect(res.body.data[0].playerId).toBeUndefined();
  });

  it("ids projected trainings so they can never collide with a real event id", async () => {
    db.calendarEvent.findMany.mockResolvedValue([]);
    db.training.findMany.mockResolvedValue([trainingRow()]);

    const res = await request(app).get("/api/calendar/events").set("Authorization", bearer(ACTOR));

    // The client keys "read-only, edited elsewhere" off this prefix; a real
    // cuid contains no dash, so the two sets cannot overlap.
    expect(res.body.data[0].id.startsWith("training-")).toBe(true);
  });

  it("404s a single event that is not visible to the caller", async () => {
    // The route filters by id AND visibility in one query — an event belonging to
    // someone else simply does not match, so the caller cannot confirm it exists.
    db.calendarEvent.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/calendar/events/${EVENT}`)
      .set("Authorization", bearer(ACTOR));

    expect(res.status).toBe(404);
    expect(firstCallArg(db.calendarEvent.findFirst)).toEqual({
      where: { id: EVENT, OR: [{ createdBy: ACTOR }, { playerId: ACTOR }] },
    });
  });
});
