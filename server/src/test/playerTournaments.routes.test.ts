// ============================================================================
// HTTP route tests — /api/player-tournaments (owner-scoped tournament entries)
//
// Proves the triad for the owner-only mutations: the owner succeeds, a DIFFERENT
// authenticated user is refused, an unauthenticated caller gets 401 — plus that
// a refusal never reaches the destructive Prisma call, and that POST pins
// `playerId` to the token's user (an IDOR the client cannot override).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { playerTournamentsRouter } from "../tournaments/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/player-tournaments", playerTournamentsRouter]]);

const OWNER = "user-owner";
const OTHER = "user-attacker";
const ENTRY = "pt-1";

/** A PlayerTournament row with the relations the presenter requires. */
function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY,
    tournamentId: "t-1",
    playerId: OWNER,
    status: "registered",
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    tournament: {
      id: "t-1",
      name: "Madrid Open",
      city: "Madrid",
      country: "ES",
      surface: "clay",
      indoorOutdoor: "outdoor",
      altitude: null,
      ballBrand: null,
      weatherSummary: null,
      category: null,
      level: null,
      latitude: null,
      longitude: null,
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-05-08T00:00:00.000Z"),
      description: null,
      federation: null,
    },
    player: { id: OWNER, firstName: "Owner", lastName: "Player" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── DELETE /api/player-tournaments/:id ──────────────────────────────────────
describe("DELETE /api/player-tournaments/:id", () => {
  it("401s an unauthenticated caller and never touches the database", async () => {
    const res = await request(app).delete(`/api/player-tournaments/${ENTRY}`);
    expect(res.status).toBe(401);
    expect(db.playerTournament.findUnique).not.toHaveBeenCalled();
    expect(db.playerTournament.delete).not.toHaveBeenCalled();
  });

  it("lets the OWNER delete their own entry (200) and deletes exactly that row", async () => {
    db.playerTournament.findUnique.mockResolvedValue({ playerId: OWNER });
    db.playerTournament.delete.mockResolvedValue({ id: ENTRY });

    const res = await request(app)
      .delete(`/api/player-tournaments/${ENTRY}`)
      .set("Authorization", bearer(OWNER));

    expect(res.status).toBe(200);
    expect(db.playerTournament.delete).toHaveBeenCalledTimes(1);
    expect(firstCallArg(db.playerTournament.delete)).toEqual({ where: { id: ENTRY } });
  });

  it("403s a DIFFERENT authenticated user and does NOT delete the row", async () => {
    db.playerTournament.findUnique.mockResolvedValue({ playerId: OWNER });

    const res = await request(app)
      .delete(`/api/player-tournaments/${ENTRY}`)
      .set("Authorization", bearer(OTHER));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not your tournament entry/i);
    expect(db.playerTournament.delete).not.toHaveBeenCalled();
  });

  it("404s a missing entry (no delete attempted)", async () => {
    db.playerTournament.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/player-tournaments/does-not-exist")
      .set("Authorization", bearer(OWNER));

    expect(res.status).toBe(404);
    expect(db.playerTournament.delete).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/player-tournaments/:id ───────────────────────────────────────
describe("PATCH /api/player-tournaments/:id", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app)
      .patch(`/api/player-tournaments/${ENTRY}`)
      .send({ status: "played" });
    expect(res.status).toBe(401);
    expect(db.playerTournament.update).not.toHaveBeenCalled();
  });

  it("lets the OWNER update status/notes (200) and writes only that row", async () => {
    db.playerTournament.findUnique.mockResolvedValue({ playerId: OWNER });
    db.playerTournament.update.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(entryRow({ status: args.data.status, notes: args.data.notes ?? null })),
    );

    const res = await request(app)
      .patch(`/api/player-tournaments/${ENTRY}`)
      .set("Authorization", bearer(OWNER))
      .send({ status: "played", notes: "won R1" });

    expect(res.status).toBe(200);
    // The presented body is derived from what the route asked Prisma to write.
    expect(res.body.data).toMatchObject({ id: ENTRY, status: "played", notes: "won R1" });
    const arg = firstCallArg<{ where: unknown; data: unknown }>(db.playerTournament.update);
    expect(arg.where).toEqual({ id: ENTRY });
    expect(arg.data).toMatchObject({ status: "played", notes: "won R1" });
  });

  it("403s a DIFFERENT authenticated user and does NOT update the row", async () => {
    db.playerTournament.findUnique.mockResolvedValue({ playerId: OWNER });

    const res = await request(app)
      .patch(`/api/player-tournaments/${ENTRY}`)
      .set("Authorization", bearer(OTHER))
      .send({ status: "withdrawn" });

    expect(res.status).toBe(403);
    expect(db.playerTournament.update).not.toHaveBeenCalled();
  });

  it("404s a missing entry", async () => {
    db.playerTournament.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/player-tournaments/nope")
      .set("Authorization", bearer(OWNER))
      .send({ status: "played" });

    expect(res.status).toBe(404);
    expect(db.playerTournament.update).not.toHaveBeenCalled();
  });

  it("400s an out-of-enum status (validation, not a 500)", async () => {
    db.playerTournament.findUnique.mockResolvedValue({ playerId: OWNER });

    const res = await request(app)
      .patch(`/api/player-tournaments/${ENTRY}`)
      .set("Authorization", bearer(OWNER))
      .send({ status: "hacked" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request data");
    expect(db.playerTournament.update).not.toHaveBeenCalled();
  });
});

// ── POST /api/player-tournaments ────────────────────────────────────────────
describe("POST /api/player-tournaments", () => {
  it("pins playerId to the authenticated user and IGNORES a client-supplied playerId", async () => {
    db.tournament.findUnique.mockResolvedValue({ id: "t-1" });
    db.playerTournament.upsert.mockImplementation((args: { create: Record<string, unknown> }) =>
      Promise.resolve(entryRow({ playerId: args.create.playerId })),
    );

    const res = await request(app)
      .post("/api/player-tournaments")
      .set("Authorization", bearer(OWNER))
      // Hostile body: try to register SOMEONE ELSE for this tournament.
      .send({ tournamentId: "t-1", status: "registered", playerId: OTHER, createdBy: OTHER });

    expect(res.status).toBe(201);
    const arg = firstCallArg<{
      where: { tournamentId_playerId: { playerId: string } };
      create: { playerId: string };
    }>(db.playerTournament.upsert);
    expect(arg.where.tournamentId_playerId.playerId).toBe(OWNER);
    expect(arg.create.playerId).toBe(OWNER);
    expect(JSON.stringify(arg)).not.toContain(OTHER);
    expect(res.body.data.playerId).toBe(OWNER);
  });

  it("404s an unknown tournament without writing an orphan entry", async () => {
    db.tournament.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/player-tournaments")
      .set("Authorization", bearer(OWNER))
      .send({ tournamentId: "ghost" });

    expect(res.status).toBe(404);
    expect(db.playerTournament.upsert).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).post("/api/player-tournaments").send({ tournamentId: "t-1" });
    expect(res.status).toBe(401);
    expect(db.playerTournament.upsert).not.toHaveBeenCalled();
  });
});

// ── GET / — read scope ──────────────────────────────────────────────────────
//
// A coach must see their players' entries, not just their own. This is the
// query that made the coach's tournament view permanently empty against the
// real API: it filtered on the caller's own id, and a coach has no entries.

describe("GET /api/player-tournaments — whose entries come back", () => {
  const COACH = "user-coach";
  const PLAYER = "user-player";

  it("scopes a PLAYER to their own entries only", async () => {
    db.user.findUnique.mockResolvedValue({ role: "player" });
    db.playerTournament.findMany.mockResolvedValue([]);

    await request(app).get("/api/player-tournaments").set("Authorization", bearer(PLAYER));

    expect(firstCallArg(db.playerTournament.findMany).where).toEqual({
      playerId: { in: [PLAYER] },
    });
  });

  it("includes a COACH's connected players, not just assigned ones", async () => {
    db.user.findUnique.mockResolvedValue({ role: "coach" });
    db.coachAssignment.findMany.mockResolvedValue([]); // no formal assignment…
    db.connectionRequest.findMany.mockResolvedValue([
      { fromUserId: COACH, toUserId: PLAYER }, // …only an active connection
    ]);
    db.user.findMany.mockResolvedValue([{ id: PLAYER }]);
    db.playerTournament.findMany.mockResolvedValue([]);

    await request(app).get("/api/player-tournaments").set("Authorization", bearer(COACH));

    const ids = firstCallArg(db.playerTournament.findMany).where as { playerId: { in: string[] } };
    expect(ids.playerId.in).toContain(PLAYER);
    expect(ids.playerId.in).toContain(COACH);
  });

  it("does not widen the scope to non-players a coach happens to be connected to", async () => {
    db.user.findUnique.mockResolvedValue({ role: "coach" });
    db.coachAssignment.findMany.mockResolvedValue([]);
    db.connectionRequest.findMany.mockResolvedValue([
      { fromUserId: COACH, toUserId: "another-coach" },
    ]);
    // The role filter returns nothing — the connection is not to a player.
    db.user.findMany.mockResolvedValue([]);
    db.playerTournament.findMany.mockResolvedValue([]);

    await request(app).get("/api/player-tournaments").set("Authorization", bearer(COACH));

    const ids = firstCallArg(db.playerTournament.findMany).where as { playerId: { in: string[] } };
    expect(ids.playerId.in).toEqual([COACH]);
  });

  it("401s an unauthenticated caller before any read", async () => {
    const res = await request(app).get("/api/player-tournaments");
    expect(res.status).toBe(401);
    expect(db.playerTournament.findMany).not.toHaveBeenCalled();
  });
});
