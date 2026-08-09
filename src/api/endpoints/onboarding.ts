// Onboarding answers (server/src/profile /onboarding). Live whenever an
// absolute API base is configured; a no-op-ish mock otherwise so the flow
// works offline / in tests without persistence.
import type { ApiResponse, User } from "@/types";
import { apiClient } from "@/api/client";

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL;
const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export type OnboardingAnswer = string | string[];
export type OnboardingAnswers = Record<string, OnboardingAnswer>;

export interface OnboardingState {
  completed: boolean;
  answers: OnboardingAnswers | null;
}

export const onboardingApi = {
  async get(): Promise<ApiResponse<OnboardingState>> {
    if (USE_MOCK) {
      await delay();
      return { data: { completed: false, answers: null } };
    }
    return apiClient.get("/me/onboarding");
  },

  async save(answers: OnboardingAnswers): Promise<ApiResponse<User>> {
    if (USE_MOCK) {
      await delay();
      // No persistence in mock mode; echo a completed user-ish payload.
      return { data: {} as User, message: "Profile saved (mock)" };
    }
    return apiClient.put("/me/onboarding", { answers });
  },
};
