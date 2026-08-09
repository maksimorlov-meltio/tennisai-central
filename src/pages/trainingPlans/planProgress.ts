// ============================================================
// Training-plan progress + labels — pure, derived from stored data only.
//
// Progress is a COUNT of the drills whose `completionStatus` the server actually
// stores. There is no estimate and no default-to-zero percentage for a plan with
// no drills: `pct` is null when there is nothing to divide by.
// ============================================================

import type { DrillCategory, DrillCompletionStatus, Intensity, TrainingDrill, TrainingPlan } from "@/types";

export interface PlanProgress {
  total: number;
  done: number;
  skipped: number;
  pending: number;
  /** null when the plan has no drills — never a fabricated 0%. */
  pct: number | null;
}

export function planProgress(drills: TrainingDrill[] | undefined): PlanProgress {
  const list = drills ?? [];
  const done = list.filter((d) => d.completionStatus === "done").length;
  const skipped = list.filter((d) => d.completionStatus === "skipped").length;
  const total = list.length;
  return {
    total,
    done,
    skipped,
    pending: total - done - skipped,
    pct: total > 0 ? Math.round((done / total) * 100) : null,
  };
}

/** "5 of 12 drills done" — or an honest note when the plan has no drills. */
export function progressLabel(progress: PlanProgress): string {
  if (progress.total === 0) return "No drills in this plan";
  return `${progress.done} of ${progress.total} drill${progress.total === 1 ? "" : "s"} done`;
}

export const DRILL_CATEGORY_LABEL: Record<DrillCategory, string> = {
  technical: "Technical",
  tactical: "Tactical",
  physical: "Physical",
  mental: "Mental",
};

export const INTENSITY_LABEL: Record<Intensity, string> = {
  low: "Low intensity",
  medium: "Medium intensity",
  high: "High intensity",
};

export const DRILL_STATUS_LABEL: Record<DrillCompletionStatus, string> = {
  pending: "To do",
  done: "Done",
  skipped: "Skipped",
};

export function drillCategoryLabel(category: string): string {
  return DRILL_CATEGORY_LABEL[category as DrillCategory] ?? category;
}

export function intensityLabel(intensity: string | undefined): string | null {
  if (!intensity) return null;
  return INTENSITY_LABEL[intensity as Intensity] ?? intensity;
}

/** Total planned minutes — null unless at least one drill carries a duration. */
export function plannedMinutes(drills: TrainingDrill[] | undefined): number | null {
  const durations = (drills ?? [])
    .map((d) => d.durationMin)
    .filter((m): m is number => typeof m === "number" && Number.isFinite(m) && m > 0);
  if (durations.length === 0) return null;
  return durations.reduce((sum, m) => sum + m, 0);
}

/** True when every drill carries a duration, so a total is complete not partial. */
export function hasCompleteDurations(drills: TrainingDrill[] | undefined): boolean {
  const list = drills ?? [];
  return list.length > 0 && list.every((d) => typeof d.durationMin === "number" && d.durationMin > 0);
}

export type PlanScope = "assigned" | "created" | "both";

/** Which side of the plan the signed-in user is on. */
export function planScope(plan: TrainingPlan, userId: string | undefined): PlanScope | null {
  if (!userId) return null;
  const isPlayer = plan.playerId === userId;
  const isCreator = plan.createdById === userId;
  if (isPlayer && isCreator) return "both";
  if (isPlayer) return "assigned";
  if (isCreator) return "created";
  return null;
}
