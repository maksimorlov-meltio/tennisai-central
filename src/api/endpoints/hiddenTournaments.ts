import type { ApiResponse } from "@/types";
import { apiClient } from "@/api/client";
import { mockStore } from "@/mock/store";

// "Hidden" tournaments are the player's own per-account suggestion filter
// ("eliminate from suggestions") — not a moderation feature. Live whenever an
// absolute API base is configured; otherwise a per-session in-memory mock.
const LIVE_API = Boolean(import.meta.env.VITE_API_BASE_URL);
const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export const hiddenTournamentsApi = {
  async getHidden(): Promise<ApiResponse<string[]>> {
    if (!LIVE_API) { await delay(); return { data: mockStore.getHiddenTournaments() }; }
    return apiClient.get("/hidden-tournaments");
  },

  async hide(tournamentId: string): Promise<ApiResponse<{ tournamentId: string }>> {
    if (!LIVE_API) {
      await delay();
      mockStore.hideTournament(tournamentId);
      return { data: { tournamentId }, message: "Tournament hidden" };
    }
    return apiClient.post("/hidden-tournaments", { tournamentId });
  },

  async unhide(tournamentId: string): Promise<ApiResponse<null>> {
    if (!LIVE_API) {
      await delay();
      mockStore.unhideTournament(tournamentId);
      return { data: null, message: "Tournament unhidden" };
    }
    return apiClient.delete(`/hidden-tournaments/${tournamentId}`);
  },
};
