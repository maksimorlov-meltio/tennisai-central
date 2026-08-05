// Full notification-preferences contract: channel switches (email/push) PLUS
// the existing per-category flags, and the web-push subscription handshake.
// Deliberately separate from `@/api/endpoints/notifications.ts` (which only
// knows the legacy 6-field `NotificationSettings` used by the shared
// `useNotificationPreferences` hook in `@/hooks/api/queries.ts`) so this can
// evolve without touching that shared file.
import type { ApiResponse } from "@/types";
import { apiClient } from "@/api/client";

export interface NotificationPreferencesFull {
  emailEnabled: boolean;
  pushEnabled: boolean;
  trainingReminders: boolean;
  tournamentReminders: boolean;
  requestApprovals: boolean;
  financeUpdates: boolean;
  aiInsightUpdates: boolean;
  systemNotifications: boolean;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

const LIVE_API = Boolean(import.meta.env.VITE_API_BASE_URL);
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const MOCK_DEFAULTS: NotificationPreferencesFull = {
  emailEnabled: true,
  pushEnabled: true,
  trainingReminders: true,
  tournamentReminders: true,
  requestApprovals: true,
  financeUpdates: true,
  aiInsightUpdates: true,
  systemNotifications: true,
};

// Offline/mock-mode in-memory state so toggling in the UI feels real without
// a backend — never persisted, reset on reload (same spirit as mockStore).
let mockPrefs: NotificationPreferencesFull = { ...MOCK_DEFAULTS };

export const notificationPrefsApi = {
  async getPreferences(): Promise<ApiResponse<NotificationPreferencesFull>> {
    if (!LIVE_API) {
      await delay();
      return { data: { ...mockPrefs } };
    }
    return apiClient.get("/notification-preferences");
  },

  async updatePreferences(patch: Partial<NotificationPreferencesFull>): Promise<ApiResponse<NotificationPreferencesFull>> {
    if (!LIVE_API) {
      await delay();
      mockPrefs = { ...mockPrefs, ...patch };
      return { data: { ...mockPrefs }, message: "Preferences updated" };
    }
    return apiClient.put("/notification-preferences", patch);
  },

  /** Null when web push isn't configured on the server (no VAPID keys). */
  async getPushPublicKey(): Promise<ApiResponse<{ publicKey: string | null }>> {
    if (!LIVE_API) {
      await delay();
      return { data: { publicKey: null } }; // mock mode never has a real push backend
    }
    return apiClient.get("/push/public-key");
  },

  async subscribePush(sub: PushSubscriptionInput): Promise<ApiResponse<{ id: string } | null>> {
    if (!LIVE_API) {
      await delay();
      return { data: null, message: "Push subscription saved (mock)" };
    }
    return apiClient.post("/push/subscribe", sub);
  },

  async unsubscribePush(endpoint: string): Promise<ApiResponse<null>> {
    if (!LIVE_API) {
      await delay();
      return { data: null, message: "Push subscription removed (mock)" };
    }
    return apiClient.delete(`/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`);
  },
};
