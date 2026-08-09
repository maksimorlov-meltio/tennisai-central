// Training advice (server/src/ai). Always the live API — there is deliberately
// no mock: a canned "AI" answer is exactly the thing this feature must not
// produce. Without a configured server the UI reports it as unavailable.
import type { ApiResponse } from "@/types";
import { apiClient } from "@/api/client";

export interface AdviceSession {
  title: string;
  goal: string;
  trainingType: "individual" | "team" | "match_practice" | "fitness" | "recovery" | "tactical";
  intensity: "low" | "medium" | "high";
  durationMinutes: number;
  rationale: string;
  drills: string[];
}

export interface TrainingAdvice {
  summary: string;
  focusAreas: string[];
  suggestedSessions: AdviceSession[];
  cautions: string[];
}

export interface TrainingAdviceResult {
  advice: TrainingAdvice;
  /** What the answer was actually derived from — shown to the coach verbatim. */
  basedOn: {
    sessions: number;
    reviewed: number;
    withPlayerFeedback: number;
    thin: boolean;
  };
  generatedAt: string;
  model: string;
  provider: string;
}

export interface AiStatus {
  configured: boolean;
  provider: string | null;
}

const liveApi = Boolean(import.meta.env.VITE_API_BASE_URL);

export const aiAdviceApi = {
  /** Never throws — a server without the feature is a normal, expected state. */
  async status(): Promise<AiStatus> {
    if (!liveApi) return { configured: false, provider: null };
    try {
      const res = await apiClient.get<ApiResponse<AiStatus>>("/ai/status");
      return res.data;
    } catch {
      return { configured: false, provider: null };
    }
  },

  async trainingAdvice(input: { playerIds: string[]; teamId?: string }): Promise<TrainingAdviceResult> {
    const res = await apiClient.post<ApiResponse<TrainingAdviceResult>>(
      "/ai/training-advice",
      input,
    );
    return res.data;
  },
};
