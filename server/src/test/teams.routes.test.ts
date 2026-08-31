// ============================================================================
// HTTP route tests — /api/teams (coach-owned teams + membership)
//
// The membership route is the interesting one: the caller must own the team AND
// the target must be an actual player they may act on. Each refusal is asserted
// to stop BEFORE the membership write, so a 403 can never be a "wrote it anyway
// but returned an error" bug.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { teamsRouter } from "../teams/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/teams", teamsRouter]]);

const COACH = "user-coach";
const OTHER_COACH = "user-other-coach";
const PLAYER = "user-player";
const TEAM = "team-1";

function teamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEAM,
    name: "Squad A",
    coachId: COACH,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [],
    ...overrides,
  };
}

function memberRow(playerId: string) {
  return {
    id: `tm-${playerId}`,
    teamId: TEAM,
    playerId,
    joinedAt: new Date("2026-02-01T00:00:00.000Z"),
    player: { id: playerId, publicId: "TAI-P-001", firstName: "Ana", lastName: "Perez" },
  };
}

function noRelationship() {
  db.coachAssignment.findUnique.mockResolvedValue(null);
  db.connectionRequest.findFirst.mockResolvedValue(null);
  db.guardianship.findUnique.mockResolvedValue(null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── POST /api/teams/:id/members ─────────────────────────────────────────────
describe("POST /api/teams/:id/members", () => {
  it("401s an unauthenticated caller and never reads the team", async () => {
    const res = await request(app).post(`/api/teams/${TEAM}/members`).send({ playerUserId: PLAYER });
    expect(res.status).toBe(401);
    expect(db.team.findUnique).not.toHaveBeenCalled();
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });

  it("403s a caller who does NOT own the team, before looking the player up", async () => {
    db.team.findUnique.mockResolvedValue(teamRow({ coachId: OTHER_COACH }));

    const res = await request(app)
      .post(`/api/teams/${TEAM}/members`)
      .set("Authorization", bearer(COACH))
      .send({ playerUserId: PLAYER });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not own this team/i);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });

  it("404s a missing team", async () => {
    db.team.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/teams/${TEAM}/members`)
      .set("Authorization", bearer(COACH))
      .send({ playerUserId: PLAYER });

    expect(res.status).toBe(404);
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });

  it("404s a missing target user", async () => {
    db.team.findUnique.mockResolvedValue(teamRow());
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/teams/${TEAM}/members`)
      .set("Authorization", bearer(COACH))
      .send({ playerUserId: "ghost" });

    expect(res.status).toBe(404);
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });

  it("400s adding a non-player (e.g. another coach) to the team", async () => {
    db.team.findUnique.mockResolvedValue(teamRow());
    db.user.findUnique.mockResolvedValue({ id: OTHER_COACH, role: "coach" });

    const res = await request(app)
      .post(`/api/teams/${TEAM}/members`)
      .set("Authorization", bearer(COACH))
      .send({ playerUserId: OTHER_COACH });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only players/i);
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });

  it("403s adding a player the coach has NO relationship with (cross-user injection guard)", async () => {
    db.team.findUnique.mockResolvedValue(teamRow());
    db.user.findUnique.mockResolvedValue({ id: PLAYER, role: "player" });
    noRelationship();

    const res = await request(app)
      .post(`/api/teams/${TEAM}/members`)
      .set("Authorization", bearer(COACH))
      .send({ playerUserId: PLAYER });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not authorized to act on behalf/i);
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });

  it("adds a related player (200) writing exactly this team + player pair", async () => {
    db.team.findUnique.mockResolvedValue(teamRow({ members: [memberRow(PLAYER)] }));
    db.user.findUnique.mockResolvedValue({ id: PLAYER, role: "player" });
    db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });
    db.teamMember.upsert.mockResolvedValue(memberRow(PLAYER));

    const res = await request(app)
      .post(`/api/teams/${TEAM}/members`)
      .set("Authorization", bearer(COACH))
      .send({ playerUserId: PLAYER });

    expect(res.status).toBe(200);
    const arg = firstCallArg<{
      where: { teamId_playerId: { teamId: string; playerId: string } };
      create: { teamId: string; playerId: string };
    }>(db.teamMember.upsert);
    expect(arg.where.teamId_playerId).toEqual({ teamId: TEAM, playerId: PLAYER });
    expect(arg.create).toEqual({ teamId: TEAM, playerId: PLAYER });
  });

  it("400s a missing playerUserId (validation before any team read)", async () => {
    const res = await request(app)
      .post(`/api/teams/${TEAM}/members`)
      .set("Authorization", bearer(COACH))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request data");
    expect(db.team.findUnique).not.toHaveBeenCalled();
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/teams/:id/members/:playerId ─────────────────────────────────
describe("DELETE /api/teams/:id/members/:playerId", () => {
  it("403s a non-owner and does NOT remove the membership", async () => {
    db.team.findUnique.mockResolvedValue(teamRow({ coachId: OTHER_COACH }));

    const res = await request(app)
      .delete(`/api/teams/${TEAM}/members/${PLAYER}`)
      .set("Authorization", bearer(COACH));

    expect(res.status).toBe(403);
    expect(db.teamMember.deleteMany).not.toHaveBeenCalled();
  });

  it("lets the owning coach remove a member (200), scoped to that team", async () => {
    db.team.findUnique.mockResolvedValue(teamRow());
    db.teamMember.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .delete(`/api/teams/${TEAM}/members/${PLAYER}`)
      .set("Authorization", bearer(COACH));

    expect(res.status).toBe(200);
    expect(firstCallArg(db.teamMember.deleteMany)).toEqual({
      where: { teamId: TEAM, playerId: PLAYER },
    });
  });

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).delete(`/api/teams/${TEAM}/members/${PLAYER}`);
    expect(res.status).toBe(401);
    expect(db.teamMember.deleteMany).not.toHaveBeenCalled();
  });
});

// ── Team ownership triad (read / rename / delete) ───────────────────────────
describe("team ownership", () => {
  it("GET /api/teams scopes the list to the caller's own teams", async () => {
    db.team.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/teams").set("Authorization", bearer(COACH));

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: unknown }>(db.team.findMany).where).toEqual({ coachId: COACH });
  });

  it("GET /api/teams/:id 403s another coach's team", async () => {
    db.team.findUnique.mockResolvedValue(teamRow({ coachId: OTHER_COACH }));
    const res = await request(app).get(`/api/teams/${TEAM}`).set("Authorization", bearer(COACH));
    expect(res.status).toBe(403);
  });

  it("PATCH /api/teams/:id 403s a non-owner and does not write", async () => {
    db.team.findUnique.mockResolvedValue(teamRow({ coachId: OTHER_COACH }));

    const res = await request(app)
      .patch(`/api/teams/${TEAM}`)
      .set("Authorization", bearer(COACH))
      .send({ name: "hijacked" });

    expect(res.status).toBe(403);
    expect(db.team.update).not.toHaveBeenCalled();
  });

  it("DELETE /api/teams/:id 403s a non-owner, 200s the owner, 404s a missing team", async () => {
    db.team.findUnique.mockResolvedValue(teamRow({ coachId: OTHER_COACH }));
    const refused = await request(app).delete(`/api/teams/${TEAM}`).set("Authorization", bearer(COACH));
    expect(refused.status).toBe(403);
    expect(db.team.delete).not.toHaveBeenCalled();

    db.team.findUnique.mockResolvedValue(teamRow());
    db.team.delete.mockResolvedValue({ id: TEAM });
    const okRes = await request(app).delete(`/api/teams/${TEAM}`).set("Authorization", bearer(COACH));
    expect(okRes.status).toBe(200);
    expect(firstCallArg(db.team.delete)).toEqual({ where: { id: TEAM } });

    db.team.findUnique.mockResolvedValue(null);
    const missing = await request(app).delete("/api/teams/ghost").set("Authorization", bearer(COACH));
    expect(missing.status).toBe(404);
  });

  it("POST /api/teams pins coachId to the token's user, ignoring a client-supplied coachId", async () => {
    db.user.findUnique.mockResolvedValue({ id: COACH, role: "coach" });
    db.team.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(teamRow({ coachId: args.data.coachId, name: args.data.name })),
    );

    const res = await request(app)
      .post("/api/teams")
      .set("Authorization", bearer(COACH))
      .send({ name: "Squad A", coachId: OTHER_COACH });

    expect(res.status).toBe(201);
    const arg = firstCallArg<{ data: Record<string, unknown> }>(db.team.create);
    expect(arg.data.coachId).toBe(COACH);
    expect(JSON.stringify(arg.data)).not.toContain(OTHER_COACH);
  });
});

// ── POST /api/teams — who is allowed to create one ──────────────────────────
//
// The route used to make whoever was signed in the team's coach. The Teams page
// is hidden from players and observers in the UI, which is not a control: a
// player with a token could create teams and own them.
describe("POST /api/teams — role gate", () => {
  it("lets a coach create a team", async () => {
    db.user.findUnique.mockResolvedValue({ id: COACH, role: "coach" });
    db.team.create.mockResolvedValue(teamRow());

    const res = await request(app)
      .post("/api/teams")
      .set("Authorization", bearer(COACH))
      .send({ name: "Squad A" });

    expect(res.status).toBe(201);
    expect(db.team.create).toHaveBeenCalled();
  });

  it("403s a PLAYER, and writes nothing", async () => {
    db.user.findUnique.mockResolvedValue({ id: PLAYER, role: "player" });

    const res = await request(app)
      .post("/api/teams")
      .set("Authorization", bearer(PLAYER))
      .send({ name: "Not mine to make" });

    expect(res.status).toBe(403);
    expect(db.team.create).not.toHaveBeenCalled();
  });

  it("403s an OBSERVER, and writes nothing", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-observer", role: "observer" });

    const res = await request(app)
      .post("/api/teams")
      .set("Authorization", bearer("user-observer"))
      .send({ name: "Not mine either" });

    expect(res.status).toBe(403);
    expect(db.team.create).not.toHaveBeenCalled();
  });
});
