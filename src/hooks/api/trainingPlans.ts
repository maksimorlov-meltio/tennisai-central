// ============================================================
// TennisAI — Training-plan React Query hooks
//
// Feature-scoped (the pattern set by hooks/api/matches.ts). The key root is the
// same `["trainingPlans"]` used by useCreateTrainingPlan in the shared
// queries.ts, so saving a session from the Session Builder invalidates this
// list too (React Query matches keys by prefix).
//
// Progress is never computed optimistically: a drill write invalidates the plan
// and the list, and the counts are re-derived from the stored completionStatus
// values the server returns.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trainingPlansApi } from "@/api/endpoints/trainingPlans";
import type { DrillCompletionStatus, TrainingPlan } from "@/types";

export const trainingPlanQueryKeys = {
  /** Root — matches the shared queries.ts key so invalidation crosses over. */
  all: ["trainingPlans"] as const,
  list: ["trainingPlans", "list"] as const,
  detail: (id: string) => ["trainingPlans", "detail", id] as const,
};

/** Pull a human message off an unknown thrown value without using `any`. */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Plans visible to the signed-in user. The API scopes this itself:
 * GET /api/training-plans returns plans where `createdById` OR `playerId` is
 * the caller — so a coach sees what they built and a player sees what was
 * assigned to them, from the same call.
 */
export function useTrainingPlanList() {
  return useQuery<TrainingPlan[]>({
    queryKey: trainingPlanQueryKeys.list,
    queryFn: async () => (await trainingPlansApi.list()).data,
  });
}

/** One plan with its drills. Disabled until a plan is actually selected. */
export function useTrainingPlan(id: string | null) {
  return useQuery<TrainingPlan>({
    queryKey: trainingPlanQueryKeys.detail(id ?? "none"),
    queryFn: async () => (await trainingPlansApi.get(id as string)).data,
    enabled: Boolean(id),
  });
}

export interface DrillStatusVariables {
  planId: string;
  drillId: string;
  completionStatus: DrillCompletionStatus;
}

export function useUpdateDrillStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, drillId, completionStatus }: DrillStatusVariables) =>
      trainingPlansApi.updateDrillStatus(planId, drillId, completionStatus),
    onSuccess: (res, vars) => {
      // Re-read rather than patch the cache: progress must always reflect the
      // statuses the server actually stored.
      qc.invalidateQueries({ queryKey: trainingPlanQueryKeys.detail(vars.planId) });
      qc.invalidateQueries({ queryKey: trainingPlanQueryKeys.list });
      if (res.message) toast.success(res.message);
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Failed to update the drill")),
  });
}
