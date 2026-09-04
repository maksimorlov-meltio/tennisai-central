// ============================================================================
// HTTP route tests — /api/players/:playerId/equipment
//
// Equipment used to be private to its owner: any other caller got a 403 on
// GET. A coach's player menu now offers "Equipment", so READING is open to
// whoever may act for that player — the same ladder the rest of the API uses
// (assertCanActOnPlayer: active coach assignment, active connection, or
// consented guardianship). WRITING is still the player's alone. These specs
// pin both halves: each rung that unlocks a read, the stranger who stays
// locked out, and the coach who can read but still cannot add.
//
// Style follows src/test/harness.ts: real routing, real requireAuth with
// signed tokens, real zod, real error handler; only Prisma is faked.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("../test/harness")).createPrismaMock() }));

import { prisma } from "../db";
import { equipmentRouter } from "./routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "../test/harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api", equipmentRouter]]);

const ALICE = "user-alice";
const COACH = "user-coach";
const PARENT = "user-parent";
const STRANGER = "user-stranger";

function itemRow(playerId: string) {
  return {
    id: "eq-1",
    playerId,
    category: "racket",
    name: "Pro Staff 97",
    brand: "Wilson",
    model: null,
    notes: null,
    acquiredDate: null,
    condition: "Good",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Nobody is related to anybody unless a spec says so.
  db.coachAssignment.findUnique.mockResolvedValue(null);
  db.connectionRequest.findFirst.mockResolvedValue(null);
  db.guardianship.findUnique.mockResolvedValue(null);
  db.equipmentItem.findMany.mockResolvedValue([itemRow(ALICE)]);
});

describe("GET /api/players/:playerId/equipment", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get(`/api/players/${ALICE}/equipment`);
    expect(res.status).toBe(401);
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled();
  });

  it("lets the owner read their own list without any relationship lookup", async () => {
    const res = await request(app).get(`/api/players/${ALICE}/equipment`).set("Authorization", bearer(ALICE));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: "eq-1", playerId: ALICE, name: "Pro Staff 97", brand: "Wilson" });
    expect(db.coachAssignment.findUnique).not.toHaveBeenCalled();
    expect(firstCallArg(db.equipmentItem.findMany)).toMatchObject({ where: { playerId: ALICE } });
  });

  it("lets a coach with an ACTIVE assignment read the player's list", async () => {
    db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });
    const res = await request(app).get(`/api/players/${ALICE}/equipment`).set("Authorization", bearer(COACH));
    expect(res.status).toBe(200);
    expect(res.body.data[0].playerId).toBe(ALICE);
  });

  it("lets a coach linked by an active CONNECTION read the list", async () => {
    db.connectionRequest.findFirst.mockResolvedValue({ id: "conn-1" });
    const res = await request(app).get(`/api/players/${ALICE}/equipment`).set("Authorization", bearer(COACH));
    expect(res.status).toBe(200);
  });

  it("lets a CONSENTED guardian read the list", async () => {
    db.guardianship.findUnique.mockResolvedValue({ parentalConsent: true });
    const res = await request(app).get(`/api/players/${ALICE}/equipment`).set("Authorization", bearer(PARENT));
    expect(res.status).toBe(200);
  });

  it("403s an unrelated user and never touches the equipment table", async () => {
    const res = await request(app).get(`/api/players/${ALICE}/equipment`).set("Authorization", bearer(STRANGER));
    expect(res.status).toBe(403);
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled();
  });

  it("403s a coach whose assignment has ENDED and who has no other link", async () => {
    db.coachAssignment.findUnique.mockResolvedValue({ status: "ended" });
    const res = await request(app).get(`/api/players/${ALICE}/equipment`).set("Authorization", bearer(COACH));
    expect(res.status).toBe(403);
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/players/:playerId/equipment — writing stays the owner's", () => {
  it("403s a connected coach trying to ADD an item for their player", async () => {
    db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });
    const res = await request(app)
      .post(`/api/players/${ALICE}/equipment`)
      .set("Authorization", bearer(COACH))
      .send({ category: "racket", name: "New frame" });
    expect(res.status).toBe(403);
    expect(db.equipmentItem.create).not.toHaveBeenCalled();
  });

  it("201s the owner adding their own item", async () => {
    db.equipmentItem.create.mockResolvedValue({ ...itemRow(ALICE), id: "eq-2", name: "New frame", brand: null, condition: null });
    const res = await request(app)
      .post(`/api/players/${ALICE}/equipment`)
      .set("Authorization", bearer(ALICE))
      .send({ category: "racket", name: "New frame" });
    expect(res.status).toBe(201);
    expect(firstCallArg(db.equipmentItem.create)).toMatchObject({ data: { playerId: ALICE, name: "New frame" } });
  });
});
