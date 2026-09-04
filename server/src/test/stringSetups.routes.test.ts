// ============================================================================
// HTTP route tests — /api/players/:playerId/string-setups and
// /api/string-setups/:id
//
// Stringing history is not self-only: a coach and a consented guardian both
// need it. That makes the refusal path the interesting one — these specs prove
// the three ALLOWED relationships each work AND that a stranger is turned away
// before a single row of the player's history is read.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { stringSetupsRouter } from "../stringSetups/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api", stringSetupsRouter]]);

const PLAYER = "player-1";
const COACH = "coach-1";
const GUARDIAN = "guardian-1";
const STRANGER = "stranger-1";
const SETUP = "ss-1";

function setupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SETUP,
    playerId: PLAYER,
    racketItemId: "eq-1",
    mainsProductId: "prod-alu",
    crossesProductId: null,
    mainsCustomName: null,
    crossesCustomName: null,
    tensionMainsKg: 23,
    tensionCrossesKg: null,
    prestretch: null,
    strungAt: new Date("2026-06-01T10:00:00.000Z"),
    stringerName: "Center Court",
    costEur: 30,
    hoursPlayed: 12,
    retiredAt: null,
    retiredReason: null,
    comfortNote: 3,
    notes: null,
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    mains: { id: "prod-alu", brand: "Luxilon", model: "ALU Power", variant: "1.25 mm" },
    crosses: null,
    ...overrides,
  };
}

/** Make assertCanActOnPlayer resolve for exactly one relationship. */
function allowVia(relationship: "coach" | "guardian" | "none") {
  db.coachAssignment.findUnique.mockResolvedValue(relationship === "coach" ? { status: "active" } : null);
  db.connectionRequest.findFirst.mockResolvedValue(null);
  db.guardianship.findUnique.mockResolvedValue(relationship === "guardian" ? { parentalConsent: true } : null);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── GET /api/players/:playerId/string-setups ────────────────────────────────
describe("GET /api/players/:playerId/string-setups", () => {
  it("401s an unauthenticated caller and never reads the table", async () => {
    const res = await request(app).get(`/api/players/${PLAYER}/string-setups`);
    expect(res.status).toBe(401);
    expect(db.stringSetup.findMany).not.toHaveBeenCalled();
  });

  it("lets the OWNER read their own history", async () => {
    db.stringSetup.findMany.mockResolvedValue([setupRow()]);
    const res = await request(app)
      .get(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(firstCallArg(db.stringSetup.findMany)).toMatchObject({ where: { playerId: PLAYER } });
  });

  it("lets an ACTIVELY ASSIGNED coach read it", async () => {
    allowVia("coach");
    db.stringSetup.findMany.mockResolvedValue([setupRow()]);
    const res = await request(app)
      .get(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(COACH));
    expect(res.status).toBe(200);
  });

  it("lets a CONSENTED guardian read it", async () => {
    allowVia("guardian");
    db.stringSetup.findMany.mockResolvedValue([setupRow()]);
    const res = await request(app)
      .get(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(GUARDIAN));
    expect(res.status).toBe(200);
  });

  it("403s a stranger and reads NO string-setup row while doing it", async () => {
    allowVia("none");
    const res = await request(app)
      .get(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(STRANGER));

    expect(res.status).toBe(403);
    // The authorization check runs BEFORE the query, so the refusal costs the
    // attacker nothing and reveals nothing.
    expect(db.stringSetup.findMany).not.toHaveBeenCalled();
  });

  it("marks a setup with no retiredAt as the current one", async () => {
    db.stringSetup.findMany.mockResolvedValue([
      setupRow(),
      setupRow({ id: "ss-0", retiredAt: new Date("2026-05-01T00:00:00.000Z"), retiredReason: "broke" }),
    ]);
    const res = await request(app)
      .get(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(PLAYER));

    expect(res.body.data.map((s: { isCurrent: boolean }) => s.isCurrent)).toEqual([true, false]);
  });
});

// ── POST /api/players/:playerId/string-setups ───────────────────────────────
describe("POST /api/players/:playerId/string-setups", () => {
  const body = {
    racketItemId: "eq-1",
    mainsProductId: "prod-alu",
    tensionMainsKg: 23,
    strungAt: "2026-06-01T10:00:00.000Z",
  };

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).post(`/api/players/${PLAYER}/string-setups`).send(body);
    expect(res.status).toBe(401);
    expect(db.stringSetup.create).not.toHaveBeenCalled();
  });

  it("creates the setup for the owner and pins playerId to the URL's player", async () => {
    db.equipmentItem.findUnique.mockResolvedValue({ playerId: PLAYER });
    db.equipmentProduct.findMany.mockResolvedValue([{ id: "prod-alu" }]);
    db.stringSetup.create.mockResolvedValue(setupRow());

    const res = await request(app)
      .post(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(PLAYER))
      .send(body);

    expect(res.status).toBe(201);
    expect(firstCallArg<{ data: { playerId: string } }>(db.stringSetup.create).data.playerId).toBe(PLAYER);
  });

  it("REJECTS a racket that belongs to someone else and does not create anything", async () => {
    // The frame exists — it is just not this player's. Without this check a
    // coach could staple a stringing job onto a stranger's racket.
    db.equipmentItem.findUnique.mockResolvedValue({ playerId: "someone-else" });

    const res = await request(app)
      .post(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(PLAYER))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("That racket does not belong to this player");
    expect(db.stringSetup.create).not.toHaveBeenCalled();
  });

  it("404s a racket that does not exist", async () => {
    db.equipmentItem.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(PLAYER))
      .send(body);
    expect(res.status).toBe(404);
    expect(db.stringSetup.create).not.toHaveBeenCalled();
  });

  it("400s an unknown product id rather than storing a dangling reference", async () => {
    db.equipmentItem.findUnique.mockResolvedValue({ playerId: PLAYER });
    db.equipmentProduct.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(PLAYER))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Unknown product");
    expect(db.stringSetup.create).not.toHaveBeenCalled();
  });

  it("403s a stranger before touching the equipment table", async () => {
    allowVia("none");
    const res = await request(app)
      .post(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(STRANGER))
      .send(body);

    expect(res.status).toBe(403);
    expect(db.equipmentItem.findUnique).not.toHaveBeenCalled();
    expect(db.stringSetup.create).not.toHaveBeenCalled();
  });

  it("400s a tension that is plainly pounds typed into a kilograms field", async () => {
    const res = await request(app)
      .post(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(PLAYER))
      .send({ ...body, tensionMainsKg: 55 });

    expect(res.status).toBe(400);
    expect(db.stringSetup.create).not.toHaveBeenCalled();
  });

  it("400s a retirement with no reason", async () => {
    const res = await request(app)
      .post(`/api/players/${PLAYER}/string-setups`)
      .set("Authorization", bearer(PLAYER))
      .send({ ...body, retiredAt: "2026-07-01T00:00:00.000Z" });

    expect(res.status).toBe(400);
    expect(db.stringSetup.create).not.toHaveBeenCalled();
  });
});

// ── PATCH / DELETE /api/string-setups/:id ───────────────────────────────────
describe("PATCH /api/string-setups/:id", () => {
  it("retires a setup with retiredAt + retiredReason", async () => {
    db.stringSetup.findUnique.mockResolvedValue({ playerId: PLAYER });
    db.stringSetup.update.mockResolvedValue(
      setupRow({ retiredAt: new Date("2026-07-01T00:00:00.000Z"), retiredReason: "broke" }),
    );

    const res = await request(app)
      .patch(`/api/string-setups/${SETUP}`)
      .set("Authorization", bearer(PLAYER))
      .send({ retiredAt: "2026-07-01T00:00:00.000Z", retiredReason: "broke", hoursPlayed: 14 });

    expect(res.status).toBe(200);
    expect(res.body.data.isCurrent).toBe(false);
    expect(res.body.data.retiredReason).toBe("broke");
    const arg = firstCallArg<{ where: { id: string }; data: Record<string, unknown> }>(db.stringSetup.update);
    expect(arg.where).toEqual({ id: SETUP });
    expect(arg.data.retiredReason).toBe("broke");
    expect(arg.data.hoursPlayed).toBe(14);
  });

  it("400s a retiredAt with no reason, even though .partial() drops the object refinement", async () => {
    db.stringSetup.findUnique.mockResolvedValue({ playerId: PLAYER });
    const res = await request(app)
      .patch(`/api/string-setups/${SETUP}`)
      .set("Authorization", bearer(PLAYER))
      .send({ retiredAt: "2026-07-01T00:00:00.000Z" });

    expect(res.status).toBe(400);
    expect(db.stringSetup.update).not.toHaveBeenCalled();
  });

  it("lets an assigned coach retire the setup", async () => {
    db.stringSetup.findUnique.mockResolvedValue({ playerId: PLAYER });
    allowVia("coach");
    db.stringSetup.update.mockResolvedValue(setupRow({ retiredAt: new Date(), retiredReason: "dead" }));

    const res = await request(app)
      .patch(`/api/string-setups/${SETUP}`)
      .set("Authorization", bearer(COACH))
      .send({ retiredAt: "2026-07-01T00:00:00.000Z", retiredReason: "dead" });

    expect(res.status).toBe(200);
  });

  it("403s a stranger and does NOT update the row", async () => {
    db.stringSetup.findUnique.mockResolvedValue({ playerId: PLAYER });
    allowVia("none");

    const res = await request(app)
      .patch(`/api/string-setups/${SETUP}`)
      .set("Authorization", bearer(STRANGER))
      .send({ comfortNote: 1 });

    expect(res.status).toBe(403);
    expect(db.stringSetup.update).not.toHaveBeenCalled();
  });

  it("404s a setup that does not exist", async () => {
    db.stringSetup.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/string-setups/${SETUP}`)
      .set("Authorization", bearer(PLAYER))
      .send({ comfortNote: 1 });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/string-setups/:id", () => {
  it("deletes exactly that row for the owner", async () => {
    db.stringSetup.findUnique.mockResolvedValue({ playerId: PLAYER });
    db.stringSetup.delete.mockResolvedValue({ id: SETUP });

    const res = await request(app).delete(`/api/string-setups/${SETUP}`).set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    expect(firstCallArg(db.stringSetup.delete)).toEqual({ where: { id: SETUP } });
  });

  it("403s a stranger and does NOT delete", async () => {
    db.stringSetup.findUnique.mockResolvedValue({ playerId: PLAYER });
    allowVia("none");

    const res = await request(app).delete(`/api/string-setups/${SETUP}`).set("Authorization", bearer(STRANGER));

    expect(res.status).toBe(403);
    expect(db.stringSetup.delete).not.toHaveBeenCalled();
  });
});
