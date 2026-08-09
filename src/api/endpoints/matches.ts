// ============================================================
// TennisAI — Match logging + statistics API
//
// Matches live on the real backend (server/src/matches). Live whenever an
// absolute API base is configured; otherwise the app is in offline/mock mode
// and this module returns NOTHING rather than inventing matches — every
// number the UI shows must come from data a user actually entered.
// ============================================================

import type {
  AggregateMatchStats,
  ApiResponse,
  MatchCreateInput,
  MatchUpdateInput,
  MatchView,
} from "@/types";
import { apiClient } from "@/api/client";
import { emptyAggregateStats } from "@/lib/stats/format";

const LIVE_API = Boolean(import.meta.env.VITE_API_BASE_URL);
const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

/** Build a query string, dropping empty params. */
function qs(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (pairs.length === 0) return "";
  return `?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}`;
}

/**
 * Writing a match needs the real API — there is no mock store for matches on
 * purpose, so nothing can pretend a match was saved. The mutation hooks
 * surface this message in an error toast instead of a fake success.
 */
function requiresLiveApi(): never {
  throw new Error("Match logging requires the live API (VITE_API_BASE_URL is not configured).");
}

export const matchesApi = {
  /** Matches for a player (defaults to the authenticated user server-side). */
  async getMatches(playerId?: string, limit?: number): Promise<ApiResponse<MatchView[]>> {
    if (!LIVE_API) {
      await delay();
      return { data: [] };
    }
    return apiClient.get(`/matches${qs({ playerId, limit })}`);
  },

  /** Aggregate statistics computed by the server from the stored raw counts. */
  async getMatchStats(playerId?: string, recent?: number): Promise<ApiResponse<AggregateMatchStats>> {
    if (!LIVE_API) {
      await delay();
      // Shape-complete zero-state: every metric null, nothing fabricated.
      return { data: emptyAggregateStats() };
    }
    return apiClient.get(`/matches/stats${qs({ playerId, recent })}`);
  },

  async getMatch(id: string): Promise<ApiResponse<MatchView>> {
    if (!LIVE_API) requiresLiveApi();
    return apiClient.get(`/matches/${id}`);
  },

  async createMatch(input: MatchCreateInput): Promise<ApiResponse<MatchView>> {
    if (!LIVE_API) requiresLiveApi();
    return apiClient.post("/matches", input);
  },

  async updateMatch(id: string, input: MatchUpdateInput): Promise<ApiResponse<MatchView>> {
    if (!LIVE_API) requiresLiveApi();
    return apiClient.patch(`/matches/${id}`, input);
  },

  async deleteMatch(id: string): Promise<ApiResponse<null>> {
    if (!LIVE_API) requiresLiveApi();
    return apiClient.delete(`/matches/${id}`);
  },
};
