// Feature-scoped hooks for the full notification-preferences + web-push
// surface. Kept out of the shared `@/hooks/api/queries.ts` per the notify
// agent's file ownership — those hooks own the legacy category-only prefs.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notificationPrefsApi, type NotificationPreferencesFull, type PushSubscriptionInput } from "@/api/endpoints/notificationPrefs";

const notificationPreferencesFullKey = ["notificationPreferencesFull"] as const;
const pushPublicKeyKey = ["pushPublicKey"] as const;

export function useNotificationPreferencesFull() {
  return useQuery({
    queryKey: notificationPreferencesFullKey,
    queryFn: async () => (await notificationPrefsApi.getPreferences()).data,
  });
}

export function useUpdateNotificationPreferencesFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferencesFull>) => notificationPrefsApi.updatePreferences(patch),
    onSuccess: (res) => {
      qc.setQueryData(notificationPreferencesFullKey, res.data);
    },
    onError: () => {
      toast.error("Couldn't save notification preferences");
    },
  });
}

/** Server's VAPID public key, or null when push isn't configured. Static for
 *  the session — no need to refetch once we have (or confirm the absence of) it. */
export function usePushPublicKey() {
  return useQuery({
    queryKey: pushPublicKeyKey,
    queryFn: async () => (await notificationPrefsApi.getPushPublicKey()).data,
    staleTime: Infinity,
  });
}

export function useSubscribePush() {
  return useMutation({
    mutationFn: (sub: PushSubscriptionInput) => notificationPrefsApi.subscribePush(sub),
  });
}

export function useUnsubscribePush() {
  return useMutation({
    mutationFn: (endpoint: string) => notificationPrefsApi.unsubscribePush(endpoint),
  });
}
