// Training plans (server/src/trainingPlans). Live whenever an absolute API base
// is configured; otherwise a lightweight in-memory mock keeps the flow working
// for offline frontend work and tests (no persistence in mock mode).
import type { ApiResponse, TrainingPlan, TrainingPlanCreateInput } from "@/types";
import { apiClient } from "@/api/client";

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL;
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

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

  async create(input: TrainingPlanCreateInput): Promise<ApiResponse<TrainingPlan>> {
    if (USE_MOCK) {
      await delay();
      return { data: mockPlan(input), message: "Session saved (mock)" };
    }
    return apiClient.post("/training-plans", input);
  },
};
