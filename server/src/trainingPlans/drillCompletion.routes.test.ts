// ============================================================================
// HTTP route tests — PATCH /api/training-plans/:planId/drills/:drillId
//                  + GET   /api/training-plans/:id
//
// Ticking a drill off is a WRITE into a plan that belongs to two people (the
// player it was written for and the coach who created it). The privilege
// boundary is therefore the read predicate the list endpoint already uses:
// `createdById === me OR playerId === me`. These specs pin that triad down —
// owner allowed, creator allowed, unrelated user refused — plus the 404 cases
// where a drill id is valid but belongs to a DIFFERENT plan (must never 200).
//
// Style follows src/test/harness.ts: real Express routing, real requireAuth
// with genuinely signed tokens, real zod + the real error handler; only the
// data layer is faked. The shared `createPrismaMock()` doesn't carry the
// trainingPlan/trainingDrill delegates, so this spec builds its own equivalent
// fake client rather than editing the shared harness.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => {
  const { vi: v } = await import("vitest");
  const METHODS = ["findUnique", "findFirst", "findMany", "create", "update", "updateMany", "upsert", "delete", "deleteMany", "count"] as const;
  const MODELS = ["trainingPlan", "trainingDrill", "connectionRequest", "user", "coachAssignment", "guardianship", "academyMembership"] as const;
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

type Delegate = Record<"findUnique" | "update", MockFn>;
const db = prisma as unknown as { trainingPlan: Delegate; trainingDrill: Delegate };

const app = createTestApp([["/api/training-plans", trainingPlansRouter]]);

const PLAYER = "user-player";
const COACH = "user-coach";
const STRANGER = "user-stranger";
const PLAN = "plan-1";
const DRILL = "drill-1";
const OTHER_PLAN_DRILL = "drill-belonging-to-another-plan";

function drillRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRILL,
    planId: PLAN,
    objective: "Cross-court backhand depth",
    category: "technical",
    instructions: "20 rally balls past the service line",
    durationMin: 15,
    reps: "20 balls",
    equipment: null,
    intensity: "medium",
    successCriteria: "15/20 past the service line",
    relatedInsight: null,
    coachNotes: null,
    completionStatus: "pending",
    trainingId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN,
    playerId: PLAYER,
    createdById: COACH,
    sourceReportId: null,
    title: "Week 1 — backhand depth",
    weekOf: "2026-01-05",
    status: "generated",
    model: "tennisai-session-builder-v1",
    promptVersion: "sb-1",
    generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    drills: [drillRow()],
    ...overrides,
  };
}

const patch = (planId = PLAN, drillId = DRILL) =>
  request(app).patch(`/api/training-plans/${planId}/drills/${drillId}`);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /api/training-plans/:planId/drills/:drillId — authorization triad", () => {
  it("401s an unauthenticated caller and never touches the DB", async () => {
    const res = await patch().send({ completionStatus: "done" });
    expect(res.status).toBe(401);
    expect(db.trainingPlan.findUnique).not.toHaveBeenCalled();
    expect(db.trainingDrill.update).not.toHaveBeenCalled();
  });

  it("lets the plan's PLAYER mark a drill done and writes only that drill", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(planRow());
    db.trainingDrill.update.mockImplementation((args: { data: { completionStatus: string } }) =>
      Promise.resolve(drillRow({ completionStatus: args.data.completionStatus })),
    );

    const res = await patch().set("Authorization", bearer(PLAYER)).send({ completionStatus: "done" });

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: unknown; data: unknown }>(db.trainingDrill.update)).toEqual({
      where: { id: DRILL },
      data: { completionStatus: "done" },
    });
    expect(res.body.data.id).toBe(DRILL);
    expect(res.body.data.completionStatus).toBe("done");
    expect(res.body.message).toBe("Drill updated");
  });

  it("lets the plan's CREATOR (coach) mark a drill skipped", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(planRow());
    db.trainingDrill.update.mockImplementation((args: { data: { completionStatus: string } }) =>
      Promise.resolve(drillRow({ completionStatus: args.data.completionStatus })),
    );

    const res = await patch().set("Authorization", bearer(COACH)).send({ completionStatus: "skipped" });

    expect(res.status).toBe(200);
    expect(firstCallArg<{ data: unknown }>(db.trainingDrill.update).data).toEqual({
      completionStatus: "skipped",
    });
  });

  it("403s a user with no relationship to the plan and writes nothing", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(planRow());

    const res = await patch().set("Authorization", bearer(STRANGER)).send({ completionStatus: "done" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not have access/i);
    expect(db.trainingDrill.update).not.toHaveBeenCalled();
  });

  it("404s an unknown plan id", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(null);

    const res = await patch("ghost-plan").set("Authorization", bearer(PLAYER)).send({ completionStatus: "done" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/training plan not found/i);
    expect(db.trainingDrill.update).not.toHaveBeenCalled();
  });

  it("404s an unknown drill id", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(planRow());

    const res = await patch(PLAN, "ghost-drill").set("Authorization", bearer(PLAYER)).send({ completionStatus: "done" });

    expect(res.status).toBe(404);
    expect(db.trainingDrill.update).not.toHaveBeenCalled();
  });

  it("404s (never 200) a drill that exists but belongs to a DIFFERENT plan", async () => {
    // The plan the caller may read does NOT contain the requested drill id.
    db.trainingPlan.findUnique.mockResolvedValue(planRow({ drills: [drillRow()] }));

    const res = await patch(PLAN, OTHER_PLAN_DRILL)
      .set("Authorization", bearer(PLAYER))
      .send({ completionStatus: "done" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found in this training plan/i);
    expect(db.trainingDrill.update).not.toHaveBeenCalled();
  });

  it("400s an unknown completionStatus value before reading anything", async () => {
    const res = await patch().set("Authorization", bearer(PLAYER)).send({ completionStatus: "completed" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request data");
    expect(db.trainingPlan.findUnique).not.toHaveBeenCalled();
    expect(db.trainingDrill.update).not.toHaveBeenCalled();
  });

  it("400s a missing body", async () => {
    const res = await patch().set("Authorization", bearer(PLAYER)).send({});
    expect(res.status).toBe(400);
    expect(db.trainingDrill.update).not.toHaveBeenCalled();
  });

  it("accepts 'pending' (un-ticking a drill)", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(planRow({ drills: [drillRow({ completionStatus: "done" })] }));
    db.trainingDrill.update.mockResolvedValue(drillRow({ completionStatus: "pending" }));

    const res = await patch().set("Authorization", bearer(PLAYER)).send({ completionStatus: "pending" });

    expect(res.status).toBe(200);
    expect(res.body.data.completionStatus).toBe("pending");
  });
});

describe("GET /api/training-plans/:id", () => {
  it("returns the plan with its drills for the player", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(planRow());

    const res = await request(app).get(`/api/training-plans/${PLAN}`).set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: unknown }>(db.trainingPlan.findUnique).where).toEqual({ id: PLAN });
    expect(res.body.data.id).toBe(PLAN);
    expect(res.body.data.drills).toHaveLength(1);
    expect(res.body.data.drills[0].completionStatus).toBe("pending");
  });

  it("returns the plan for the creating coach", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(planRow());
    const res = await request(app).get(`/api/training-plans/${PLAN}`).set("Authorization", bearer(COACH));
    expect(res.status).toBe(200);
  });

  it("403s an unrelated user", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(planRow());
    const res = await request(app).get(`/api/training-plans/${PLAN}`).set("Authorization", bearer(STRANGER));
    expect(res.status).toBe(403);
  });

  it("404s an unknown plan", async () => {
    db.trainingPlan.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/training-plans/ghost").set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(404);
  });

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get(`/api/training-plans/${PLAN}`);
    expect(res.status).toBe(401);
    expect(db.trainingPlan.findUnique).not.toHaveBeenCalled();
  });
});
