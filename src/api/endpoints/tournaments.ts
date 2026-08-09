import type { Tournament, PlayerTournament, ApiResponse } from "@/types";
import { apiClient } from "@/api/client";
import { mockStore } from "@/mock/store";
import { mockTournaments } from "@/mock/data";
import { mapTournaments } from "@/api/mappers/tournamentFederation";

// Tournaments are migrated to the real backend (server/src/tournaments). Live
// whenever an absolute API base is configured; otherwise the in-memory mock is
// used for offline frontend work and tests.
const LIVE_API = Boolean(import.meta.env.VITE_API_BASE_URL);
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

export const tournamentsApi = {
  async getTournaments(): Promise<ApiResponse<Tournament[]>> {
    if (!LIVE_API) {
      await delay();
      return { data: JSON.parse(JSON.stringify(mockTournaments)) };
    }
    const raw = await apiClient.get<unknown>("/tournaments");
    return { data: mapTournaments(raw) };
  },

  async getPlayerTournaments(): Promise<ApiResponse<PlayerTournament[]>> {
    if (!LIVE_API) { await delay(); return { data: mockStore.getPlayerTournaments() }; }
    return apiClient.get("/player-tournaments");
  },

  async addPlayerTournament(data: Omit<PlayerTournament, "id">): Promise<ApiResponse<PlayerTournament>> {
    if (!LIVE_API) { await delay(); return { data: mockStore.addPlayerTournament(data), message: "Tournament entry added" }; }
    return apiClient.post("/player-tournaments", data);
  },

  async updatePlayerTournament(id: string, data: Partial<PlayerTournament>): Promise<ApiResponse<PlayerTournament>> {
    if (!LIVE_API) { await delay(); return { data: mockStore.updatePlayerTournament(id, data), message: "Tournament status updated" }; }
    return apiClient.patch(`/player-tournaments/${id}`, data);
  },

  async removePlayerTournament(id: string): Promise<ApiResponse<null>> {
    if (!LIVE_API) { await delay(); return { data: null, message: "Removed from schedule (mock)" }; }
    return apiClient.delete(`/player-tournaments/${id}`);
  },
};
