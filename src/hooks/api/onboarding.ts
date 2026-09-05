// ============================================================
// Onboarding answers — React Query hook
//
// The same query ProfilePage runs inline (`["onboarding"]`), lifted into a
// hook so the dashboards can derive "profile complete" for the first-run
// checklist from a shared cache read instead of a second request.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { onboardingApi } from "@/api/endpoints/onboarding";

export const onboardingQueryKey = ["onboarding"] as const;

export function useOnboarding(enabled = true) {
  return useQuery({
    queryKey: onboardingQueryKey,
    queryFn: async () => (await onboardingApi.get()).data,
    enabled,
  });
}
