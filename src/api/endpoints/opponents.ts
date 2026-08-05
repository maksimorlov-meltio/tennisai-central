// ============================================================
// TennisAI — Opponent records API
//
// Backed by server/src/opponents (owner-scoped). In offline/mock mode the list
// is empty — no invented opponents ever enter the app.
// ============================================================

import type { ApiResponse, Opponent, OpponentCreateInput, OpponentUpdateInput } from "@/types";
import { apiClient } from "@/api/client";

const LIVE_API = Boolean(import.meta.env.VITE_API_BASE_URL);
const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

function requiresLiveApi(): never {
  throw new Error("Opponent records require the live API (VITE_API_BASE_URL is not configured).");
}

export const opponentsApi = {
  async getOpponents(): Promise<ApiResponse<Opponent[]>> {
    if (!LIVE_API) {
      await delay();
      return { data: [] };
    }
    return apiClient.get("/opponents");
  },

  async createOpponent(input: OpponentCreateInput): Promise<ApiResponse<Opponent>> {
    if (!LIVE_API) requiresLiveApi();
    return apiClient.post("/opponents", input);
  },

  async updateOpponent(id: string, input: OpponentUpdateInput): Promise<ApiResponse<Opponent>> {
    if (!LIVE_API) requiresLiveApi();
    return apiClient.patch(`/opponents/${id}`, input);
  },

  async deleteOpponent(id: string): Promise<ApiResponse<null>> {
    if (!LIVE_API) requiresLiveApi();
    return apiClient.delete(`/opponents/${id}`);
  },
};
