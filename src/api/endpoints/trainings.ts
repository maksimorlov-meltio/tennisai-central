// Trainings are migrated to the real backend (server/src/trainings). When an
// absolute API base is configured (production, or local dev pointed at the API),
// calls go live; otherwise they fall back to the in-memory mock for offline
// frontend work and tests.
import type { TrainingSession, ApiResponse, TrainingAnalysis } from "@/types";
import { apiClient } from "@/api/client";
import { mockStore } from "@/mock/store";

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL;
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

export const trainingsApi = {
  async getTrainings(): Promise<ApiResponse<TrainingSession[]>> {
    if (USE_MOCK) { await delay(); return { data: mockStore.getTrainings() }; }
    return apiClient.get("/trainings");
  },

  async getTraining(id: string): Promise<ApiResponse<TrainingSession>> {
    if (USE_MOCK) {
      await delay();
      const t = mockStore.getTraining(id);
      if (!t) throw { status: 404, message: "Training not found" };
      return { data: t };
    }
    return apiClient.get(`/trainings/${id}`);
  },

  async createTraining(data: Omit<TrainingSession, "id" | "createdAt">): Promise<ApiResponse<TrainingSession>> {
    if (USE_MOCK) { await delay(); return { data: mockStore.createTraining(data), message: "Training created" }; }
    return apiClient.post("/trainings", data);
  },

  async updateTraining(id: string, data: Partial<TrainingSession>): Promise<ApiResponse<TrainingSession>> {
    if (USE_MOCK) { await delay(); return { data: mockStore.updateTraining(id, data), message: "Training updated" }; }
    return apiClient.patch(`/trainings/${id}`, data);
  },

  async deleteTraining(id: string): Promise<ApiResponse<null>> {
    if (USE_MOCK) { await delay(); mockStore.deleteTraining(id); return { data: null, message: "Training deleted" }; }
    return apiClient.delete(`/trainings/${id}`);
  },

  // AI-powered performance summary for a completed session.
  // Real backend: POST /trainings/:id/analysis → returns the updated TrainingSession
  // with `analysis` populated by the AWS service.
  async analyzeTraining(id: string): Promise<ApiResponse<TrainingSession>> {
    if (USE_MOCK) {
      await delay(900);
      const t = mockStore.getTraining(id);
      if (!t) throw { status: 404, message: "Training not found" };
      // Internal engine identifier is intentionally not surfaced to users as an "AI" credit.
      const analysis: TrainingAnalysis = {
        summary: buildMockSummary(t),
        generatedAt: new Date().toISOString(),
      };
      return { data: mockStore.updateTraining(id, { analysis }), message: "Analysis ready" };
    }
    return apiClient.post(`/trainings/${id}/analysis`);
  },
};

function buildMockSummary(t: TrainingSession): string {
  const parts: string[] = [];
  const intensity = t.intensity ?? "medium";
  parts.push(
    `${t.title} ran as a ${intensity}-intensity ${t.trainingType.replace("_", " ")} session with ${t.playerIds.length} player${t.playerIds.length === 1 ? "" : "s"}.`,
  );
  if (t.goal) parts.push(`Stated goal: ${t.goal}.`);
  if (t.review) {
    parts.push(
      `Coach rated the session ${t.review.rating}/5 and focused on ${t.review.workedOn}.${t.review.nextSteps ? ` Next steps: ${t.review.nextSteps}.` : ""}`,
    );
  }
  if (t.playerSessionFeedback) {
    const f = t.playerSessionFeedback;
    parts.push(
      `Player reported feeling ${f.feeling} with energy ${f.energyLevel}/5${f.tags.length ? ` (${f.tags.slice(0, 3).join(", ")})` : ""}.`,
    );
  }
  parts.push(
    "Overall, execution matched the planned intensity. Recommend reinforcing the same focus area in the next session while monitoring fatigue.",
  );
  return parts.join(" ");
}
