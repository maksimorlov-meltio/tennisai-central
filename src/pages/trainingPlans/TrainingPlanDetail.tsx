// ============================================================
// A single plan: its drills, and the ability to tick each one off.
// Reads GET /api/training-plans/:id so the drills (and their stored statuses)
// are always fresh, and writes through PATCH .../drills/:drillId.
// ============================================================

import { ArrowLeft, CalendarDays, Clock, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ErrorState, LoadingState } from "@/components/ui/shared";
import { formatMatchDate } from "@/lib/stats/format";
import { useTrainingPlan, useUpdateDrillStatus } from "@/hooks/api/trainingPlans";
import { DrillCard } from "@/pages/trainingPlans/DrillCard";
import { PlanProgressBar } from "@/pages/trainingPlans/PlanProgressBar";
import { hasCompleteDurations, planProgress, plannedMinutes } from "@/pages/trainingPlans/planProgress";
import type { PlanPeople } from "@/pages/trainingPlans/usePlanPeople";
import type { DrillCompletionStatus } from "@/types";

export interface TrainingPlanDetailProps {
  planId: string;
  people: PlanPeople;
  onBack: () => void;
}

export function TrainingPlanDetail({ planId, people, onBack }: TrainingPlanDetailProps) {
  const { data: plan, isLoading, error, refetch } = useTrainingPlan(planId);
  const updateStatus = useUpdateDrillStatus();

  const back = (
    <Button variant="ghost" size="sm" className="gap-1.5 self-start" onClick={onBack}>
      <ArrowLeft className="h-4 w-4" /> All plans
    </Button>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {back}
        <LoadingState message="Loading this plan…" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState message="Failed to load this training plan." onRetry={() => void refetch()} />
      </div>
    );
  }

  const drills = plan.drills ?? [];
  const progress = planProgress(drills);
  const minutes = plannedMinutes(drills);
  const player = people.nameFor(plan.playerId);
  const creator = people.nameFor(plan.createdById);

  const change = (drillId: string, completionStatus: DrillCompletionStatus) =>
    updateStatus.mutate({ planId: plan.id, drillId, completionStatus });

  return (
    <div className="space-y-6">
      {back}

      <div className="space-y-4 border border-border bg-card p-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{plan.title}</h1>
          <p className="text-sm text-muted-foreground">
            For <span className={player.resolved ? "text-foreground" : "italic"}>{player.label}</span>
            {" · by "}
            <span className={creator.resolved ? "text-foreground" : "italic"}>{creator.label}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {plan.weekOf ? `Week of ${formatMatchDate(plan.weekOf)}` : `Saved ${formatMatchDate(plan.generatedAt)}`}
          </span>
          <span className="flex items-center gap-1">
            <ListChecks className="h-3 w-3" />
            {progress.total} drill{progress.total === 1 ? "" : "s"}
          </span>
          {minutes !== null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {/* Only claim a total when every drill carries a duration. */}
              {hasCompleteDurations(drills) ? `${minutes} min planned` : `${minutes}+ min planned (some drills have no duration)`}
            </span>
          )}
        </div>

        <PlanProgressBar progress={progress} className="max-w-md" />
      </div>

      <DashboardCard
        title="Drills"
        description="Tick a drill off once it is done, or skip it — the status is saved on the plan"
        icon={<ListChecks className="h-4 w-4" />}
        noPadding
      >
        {drills.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">This plan has no drills.</p>
        ) : (
          <div>
            {drills.map((drill, index) => (
              <DrillCard
                key={drill.id}
                drill={drill}
                index={index}
                canEdit
                busy={updateStatus.isPending}
                onStatusChange={(status) => change(drill.id, status)}
              />
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
