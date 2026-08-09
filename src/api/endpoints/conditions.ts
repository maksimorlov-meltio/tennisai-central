// Tournament playing conditions (server/src/conditions) and the optional AI
// interpretation (server/src/ai/matchPrep).
//
// No mock: the conditions come from a real weather service and the analysis
// from a real model, or neither is shown. A plausible-looking fake forecast is
// worse than an empty panel.
import type { ApiResponse } from "@/types";
import { apiClient } from "@/api/client";

/** How a weather reading was obtained. Always shown to the user. */
export type WeatherKind = "observed" | "forecast" | "typical";

export interface WeatherReading {
  kind: WeatherKind;
  temperatureC: number;
  temperatureMaxC: number;
  temperatureMinC: number;
  humidityPct: number;
  basedOnYears?: number;
  source: string;
}

export interface ConditionsPhysics {
  airDensity: number;
  densityVsReferencePct: number;
  pressureHPa: number;
  speed: "slower" | "neutral" | "faster";
  bounce: "lower" | "neutral" | "higher";
  drivers: string[];
}

export interface TournamentConditions {
  tournament: {
    id: string;
    name: string;
    city: string;
    country: string;
    surface: string;
    indoorOutdoor: string;
    ballBrand: string | null;
    startDate: string;
    endDate: string;
  };
  altitudeM: number | null;
  altitudeSource: "catalog" | "derived" | null;
  altitudeAssumed: boolean;
  weather: WeatherReading | null;
  weatherError: string | null;
  physics: ConditionsPhysics | null;
  physicsBasis: "indoor" | "outdoor";
}

export interface MatchPrep {
  conditionsSummary: string;
  ballBehaviour: string;
  tacticalAdjustments: string[];
  preparation: string[];
  equipmentNotes: string[];
  cautions: string[];
}

export interface MatchPrepResult {
  prep: MatchPrep;
  basedOn: { weatherKind: WeatherKind | null; sessions: number };
  generatedAt: string;
  model: string;
  provider: string;
}

export const conditionsApi = {
  async get(tournamentId: string): Promise<TournamentConditions> {
    const res = await apiClient.get<ApiResponse<TournamentConditions>>(
      `/tournaments/${tournamentId}/conditions`,
    );
    return res.data;
  },

  async setBall(tournamentId: string, ballBrand: string): Promise<{ ballBrand: string | null }> {
    const res = await apiClient.patch<ApiResponse<{ id: string; ballBrand: string | null }>>(
      `/tournaments/${tournamentId}/ball`,
      { ballBrand },
    );
    return res.data;
  },

  async matchPrep(input: { tournamentId: string; playerId?: string }): Promise<MatchPrepResult> {
    const res = await apiClient.post<ApiResponse<MatchPrepResult>>("/ai/match-prep", input);
    return res.data;
  },
};
