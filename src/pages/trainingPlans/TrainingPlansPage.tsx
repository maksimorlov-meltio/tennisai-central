// ============================================================
// Training plans — where a saved Session Builder plan can finally be opened.
//
// Works for both sides of the relationship from a single call: the API scopes
// GET /api/training-plans to plans where the caller is the creator OR the
// player, so a coach sees what they built and a player sees what was assigned
// to them. The filter below only splits that list; it never widens it.
//
// Every figure shown (drill counts, "5 of 12 done", progress bars) is counted
// from the drills and their stored `completionStatus` — there is no estimated
// or default progress anywhere on this screen.
// ============================================================

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/shared";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { hasCoachCounterpart } from "@/lib/connections/hasCoachCounterpart";
import { useT } from "@/lib/i18n";
import { useTrainingPlanList } from "@/hooks/api/trainingPlans";
import { PlanListItem } from "@/pages/trainingPlans/PlanListItem";
import { TrainingPlanDetail } from "@/pages/trainingPlans/TrainingPlanDetail";
import { planScope } from "@/pages/trainingPlans/planProgress";
import { usePlanPeople } from "@/pages/trainingPlans/usePlanPeople";

type PlanFilter = "all" | "assigned" | "created";

export default function TrainingPlansPage() {
  const { t } = useT();
  const { user, hasRole } = useAuth();
  const { activeRelationships } = useConnections();
  const people = usePlanPeople();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlanFilter>("all");

  const { data: plans = [], isLoading, error, refetch } = useTrainingPlanList();

  const isCoach = hasRole("coach");

  const scoped = useMemo(() => {
    const assigned = plans.filter((p) => {
      const scope = planScope(p, people.userId);
      return scope === "assigned" || scope === "both";
    });
    const created = plans.filter((p) => {
      const scope = planScope(p, people.userId);
      return scope === "created" || scope === "both";
    });
    return { assigned, created };
  }, [plans, people.userId]);

  const visible = filter === "assigned" ? scoped.assigned : filter === "created" ? scoped.created : plans;

  // The filter is only worth showing when the user genuinely has both kinds.
  const showFilter = scoped.assigned.length > 0 && scoped.created.length > 0;

  if (selectedId) {
    return <TrainingPlanDetail planId={selectedId} people={people} onBack={() => setSelectedId(null)} />;
  }

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Training plans</h1>
        <p className="text-sm text-muted-foreground">
          {isCoach
            ? "Sessions you saved from the Session Builder, plus anything assigned to you."
            : "Sessions your coach saved for you. Tick each drill off as you complete it."}
        </p>
      </div>
      {isCoach && (
        <Button asChild variant="outline" className="gap-2 self-start">
          <Link to="/session-builder">
            <Sparkles className="h-4 w-4" /> Session Builder
          </Link>
        </Button>
      )}
    </div>
  );

  if (isLoading) return <LoadingState message="Loading your training plans…" />;

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState message="Failed to load your training plans." onRetry={() => void refetch()} />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={<ClipboardList className="h-6 w-6 text-muted-foreground" />}
          title={t("empty.trainingPlans.title")}
          description={isCoach ? t("empty.trainingPlans.coach.description") : t("empty.trainingPlans.player.description")}
          action={
            isCoach ? (
              <Button asChild className="gap-1.5">
                <Link to="/session-builder">
                  <Sparkles className="h-4 w-4" /> {t("empty.trainingPlans.coach.action")}
                </Link>
              </Button>
            ) : !hasCoachCounterpart(activeRelationships, user?.id ?? "") ? (
              // A player's plans come from a coach — without one, that is the step.
              <Button asChild className="gap-1.5">
                <Link to="/connections">{t("empty.trainingPlans.player.actionConnect")}</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {showFilter && (
        <Tabs value={filter} onValueChange={(next) => setFilter(next as PlanFilter)}>
          <TabsList className="h-9 rounded-none border border-border bg-muted p-0.5">
            <TabsTrigger
              value="all"
              className="rounded-none px-3 py-1 text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              All ({plans.length})
            </TabsTrigger>
            <TabsTrigger
              value="assigned"
              className="rounded-none px-3 py-1 text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              Assigned to me ({scoped.assigned.length})
            </TabsTrigger>
            <TabsTrigger
              value="created"
              className="rounded-none px-3 py-1 text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              Created by me ({scoped.created.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {visible.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No plans in this filter.
        </p>
      ) : (
        <div className="border border-border bg-card">
          {visible.map((plan) => (
            <PlanListItem key={plan.id} plan={plan} people={people} onOpen={() => setSelectedId(plan.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
