// ============================================================================
// HTTP route tests — POST /api/training-plans with a library drill.
//
// A plan drill may cite the coaching-library drill it came from. The citation
// has to be real: an id that does not resolve to an APPROVED drill the caller
// can actually see must be refused with a 400, not stored as a dangling
// pointer nobody can open later.
//
// Same idiom as drillCompletion.routes.test.ts: real Express routing, real
// requireAuth with a genuinely signed token, real zod and the real error
// handler — only the data layer is faked, and the assertions are on what the
// route passed to Prisma.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => {
  const { vi: v } = await import("vitest");
  const METHODS = ["findUnique", "findFirst", "findMany", "create", "update", "updateMany", "upsert", "delete", "deleteMany", "count"] as const;
  const MODELS = ["trainingPlan", "trainingDrill", "connectionRequest", "user", "coachAssignment", "guardianship", "academyMembership", "drill"] as const;
  const client: Record<string, Record<string, unknown>> = {};
  for (const model of MODELS) {
    client[model] = {};
    for (const method of METHODS) client[model][method] = v.fn();
  }
  return { prisma: client };
});

import { prisma } from "../db";
import { trainingPlansRouter } from "./routes";
import { bearer, createTestApp, firstCallArg, type MockFn } from "../test/harness";

type Delegate = Record<"findUnique" | "findFirst" | "findMany" | "create", MockFn>;
const db = prisma as unknown as {
  trainingPlan: Delegate;
  drill: Delegate;
  academyMembership: Delegate;
  coachAssignment: Delegate;
  connectionRequest: Delegate;
  user: Delegate;
};

const app = createTestApp([["/api/training-plans", trainingPlansRouter]]);

const COACH = "user-coach";
const PLAYER = "user-player";
const LIBRARY_DRILL = "serve-plus-one-open-court";

function body(libraryDrillId?: string) {
  return {
    playerId: PLAYER,
    title: "Week 12 — serve patterns",
    drills: [
      {
        objective: "Serve wide, attack the open court",
        category: "tactical",
        instructions: "10 two-shot sequences from the deuce court",
        successCriteria: "6 of 10 second balls in the open-court zone",
        ...(libraryDrillId ? { libraryDrillId } : {}),
      },
    ],
  };
}

/** The coach is a coach (requireRole) and is actively assigned to the player. */
function allowCoachToPlan() {
  db.user.findUnique.mockResolvedValue({ role: "coach" });
  db.coachAssignment.findUnique.mockResolvedValue({ status: "active" });
}

function createdPlan() {
  return {
    id: "plan-1",
    playerId: PLAYER,
    createdById: COACH,
    sourceReportId: null,
    title: "Week 12 — serve patterns",
    weekOf: null,
    status: "generated",
    model: "tennisai-session-builder-v1",
    promptVersion: "sb-1",
    generatedAt: new Date("2026-09-04T10:00:00.000Z"),
    updatedAt: new Date("2026-09-04T10:00:00.000Z"),
    drills: [
      {
        id: "td-1",
        planId: "plan-1",
        objective: "Serve wide, attack the open court",
        category: "tactical",
        instructions: "10 two-shot sequences from the deuce court",
        durationMin: null,
        reps: null,
        equipment: null,
        intensity: null,
        successCriteria: "6 of 10 second balls in the open-court zone",
        relatedInsight: null,
        coachNotes: null,
        completionStatus: "pending",
        trainingId: null,
        libraryDrillId: LIBRARY_DRILL,
        createdAt: new Date("2026-09-04T10:00:00.000Z"),
        updatedAt: new Date("2026-09-04T10:00:00.000Z"),
      },
    ],
  };
}

describe("POST /api/training-plans — libraryDrillId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowCoachToPlan();
  });

  it("links an approved, globally visible library drill", async () => {
    db.academyMembership.findMany.mockResolvedValue([]);
    db.drill.findMany.mockResolvedValue([{ id: LIBRARY_DRILL }]);
    db.trainingPlan.create.mockResolvedValue(createdPlan());

    const res = await request(app)
      .post("/api/training-plans")
      .set("Authorization", bearer(COACH))
      .send(body(LIBRARY_DRILL));

    expect(res.status).toBe(201);
    expect(res.body.data.drills[0].libraryDrillId).toBe(LIBRARY_DRILL);

    // The library lookup only accepts approved + visible drills.
    const lookup = firstCallArg<{ where: Record<string, unknown> }>(db.drill.findMany);
    expect(lookup.where).toMatchObject({ id: { in: [LIBRARY_DRILL] }, status: "approved" });
    expect(lookup.where.OR).toEqual(
      expect.arrayContaining([{ visibility: "global" }, { ownerCoachId: COACH }]),
    );

    // The id reached the row, pinned to what the body asked for.
    const created = firstCallArg<{ data: { drills: { create: Array<Record<string, unknown>> } } }>(
      db.trainingPlan.create,
    );
    expect(created.data.drills.create[0].libraryDrillId).toBe(LIBRARY_DRILL);
  });

  it("refuses an unknown library drill id with a 400 and writes nothing", async () => {
    db.academyMembership.findMany.mockResolvedValue([]);
    db.drill.findMany.mockResolvedValue([]); // nothing approved + visible matches

    const res = await request(app)
      .post("/api/training-plans")
      .set("Authorization", bearer(COACH))
      .send(body("no-such-drill"));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unknown or unavailable library drill: no-such-drill/);
    expect(db.trainingPlan.create).not.toHaveBeenCalled();
  });

  it("does not touch the library when no drill cites one", async () => {
    db.trainingPlan.create.mockResolvedValue({ ...createdPlan(), drills: [] });

    const res = await request(app).post("/api/training-plans").set("Authorization", bearer(COACH)).send(body());

    expect(res.status).toBe(201);
    expect(db.drill.findMany).not.toHaveBeenCalled();
    expect(db.academyMembership.findMany).not.toHaveBeenCalled();
  });
});
