// Training plans (server/src/trainingPlans). Live whenever an absolute API base
// is configured; otherwise a lightweight in-memory mock keeps the flow working
// for offline frontend work and tests (no persistence in mock mode).
import type {
  ApiResponse,
  DrillCompletionStatus,
  TrainingDrill,
  TrainingPlan,
  TrainingPlanCreateInput,
} from "@/types";
import { apiClient } from "@/api/client";

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL;
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/**
 * Reading or ticking off a real plan needs the real API. There is no mock store
 * for plans, so rather than fabricate one (`list()` deliberately returns an
 * empty array in mock mode) these calls fail loudly. Unreachable in practice:
 * with no plans listed there is no plan to open or tick.
 */
function requiresLiveApi(): never {
  throw new Error("Training plans require the live API (VITE_API_BASE_URL is not configured).");
}

/** Build a fake persisted plan so mock mode returns a realistic shape. */
function mockPlan(input: TrainingPlanCreateInput): TrainingPlan {
  const now = "1970-01-01T00:00:00.000Z"; // fixed → deterministic in tests
  return {
    id: `mock-plan-${input.title.length}`,
    playerId: input.playerId,
    createdById: "mock-coach",
    title: input.title,
    weekOf: input.weekOf,
    status: "generated",
    model: "tennisai-session-builder-v1",
    promptVersion: "sb-1",
    generatedAt: now,
    updatedAt: now,
    drills: input.drills.map((d, i) => ({
      id: `mock-drill-${i}`,
      planId: `mock-plan-${input.title.length}`,
      completionStatus: "pending" as const,
      createdAt: now,
      updatedAt: now,
      ...d,
    })),
  };
}

export const trainingPlansApi = {
  async list(): Promise<ApiResponse<TrainingPlan[]>> {
    if (USE_MOCK) {
      await delay();
      return { data: [] };
    }
    return apiClient.get("/training-plans");
  },

  /** GET /training-plans/:id — one plan with its drills. */
  async get(id: string): Promise<ApiResponse<TrainingPlan>> {
    if (USE_MOCK) requiresLiveApi();
    return apiClient.get(`/training-plans/${encodeURIComponent(id)}`);
  },

  async create(input: TrainingPlanCreateInput): Promise<ApiResponse<TrainingPlan>> {
    if (USE_MOCK) {
      await delay();
      return { data: mockPlan(input), message: "Session saved (mock)" };
    }
    return apiClient.post("/training-plans", input);
  },

  /**
   * PATCH /training-plans/:planId/drills/:drillId — tick a drill off.
   * Only `message` is consumed by the caller; the plan is re-read after a
   * successful write, so the server stays the single source of truth for
   * progress (no optimistic count that could drift from the stored statuses).
   */
  async updateDrillStatus(
    planId: string,
    drillId: string,
    completionStatus: DrillCompletionStatus,
  ): Promise<ApiResponse<TrainingDrill>> {
    if (USE_MOCK) requiresLiveApi();
    return apiClient.patch(
      `/training-plans/${encodeURIComponent(planId)}/drills/${encodeURIComponent(drillId)}`,
      { completionStatus },
    );
  },
};
