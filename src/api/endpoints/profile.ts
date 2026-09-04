// Profile is migrated to the real backend (server/src/profile → /me/profile).
// Live when an absolute API base is configured; otherwise the in-memory mock.
import type { User, ApiResponse } from "@/types";
import { apiClient } from "@/api/client";

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL;
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

let profileOverrides: Partial<User> = {};

export const profileApi = {
  async getProfile(): Promise<ApiResponse<User>> {
    if (USE_MOCK) { await delay(); throw { status: 501, message: "Use auth.getMe() for now" }; }
    return apiClient.get("/me/profile");
  },

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    if (USE_MOCK) {
      await delay();
      profileOverrides = { ...profileOverrides, ...data };
      return { data: { ...data } as User, message: "Profile updated" };
    }
    return apiClient.patch("/me/profile", data);
  },
};

// ── Calendar preferences ────────────────────────────────────────────────────

export interface CalendarPreferences {
  /** Subscribed federations. Empty means own sessions only — a real choice. */
  federations: string[];
  showOwnEvents: boolean;
}

export const calendarPreferencesApi = {
  async get(): Promise<ApiResponse<CalendarPreferences>> {
    if (USE_MOCK) {
      await delay();
      return { data: { federations: [], showOwnEvents: true } };
    }
    return apiClient.get("/me/calendar-preferences");
  },

  async save(prefs: Partial<CalendarPreferences> & { federations: string[] }): Promise<ApiResponse<CalendarPreferences>> {
    if (USE_MOCK) {
      await delay();
      return { data: { showOwnEvents: true, ...prefs }, message: "Saved (mock)" };
    }
    return apiClient.put("/me/calendar-preferences", prefs);
  },
};
