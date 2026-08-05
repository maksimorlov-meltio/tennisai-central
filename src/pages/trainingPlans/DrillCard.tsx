// ============================================================
// One drill: what to do, how to do it, what counts as success — plus the
// check-off controls.
//
// Contract: PATCH /api/training-plans/:planId/drills/:drillId
//           { completionStatus: "pending" | "done" | "skipped" }
// The status shown is always the stored one; nothing is toggled locally and
// hoped for. While a write is in flight the controls are disabled.
// ============================================================

import { Clock, Dumbbell, Lightbulb, Repeat, StickyNote, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  DRILL_STATUS_LABEL,
  drillCategoryLabel,
  intensityLabel,
} from "@/pages/trainingPlans/planProgress";
import type { DrillCompletionStatus, TrainingDrill } from "@/types";

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

export interface DrillCardProps {
  drill: TrainingDrill;
  index: number;
  /** false while another write is settling, or when the viewer may not edit. */
  canEdit: boolean;
  busy: boolean;
  onStatusChange: (status: DrillCompletionStatus) => void;
}

export function DrillCard({ drill, index, canEdit, busy, onStatusChange }: DrillCardProps) {
  const done = drill.completionStatus === "done";
  const skipped = drill.completionStatus === "skipped";
  const intensity = intensityLabel(drill.intensity);
  const checkboxId = `drill-${drill.id}`;

  return (
    <div className={cn("border-b border-border p-4 last:border-b-0", skipped && "opacity-70")}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={checkboxId}
          checked={done}
          disabled={!canEdit || busy}
          onCheckedChange={(checked) => onStatusChange(checked === true ? "done" : "pending")}
          aria-label={`Mark "${drill.objective}" as done`}
          className="mt-1 rounded-none"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <label
              htmlFor={checkboxId}
              className={cn(
                "cursor-pointer font-semibold text-foreground",
                done && "line-through decoration-1",
                skipped && "line-through decoration-dashed decoration-1",
              )}
            >
              {drill.objective}
            </label>
            <span className="bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground">
              {drillCategoryLabel(drill.category)}
            </span>
            {drill.completionStatus !== "pending" && (
              <span
                className={cn(
                  "px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                  done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {DRILL_STATUS_LABEL[drill.completionStatus]}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {typeof drill.durationMin === "number" && (
              <Meta icon={<Clock className="h-3 w-3" />}>{drill.durationMin} min</Meta>
            )}
            {drill.reps && <Meta icon={<Repeat className="h-3 w-3" />}>{drill.reps}</Meta>}
            {drill.equipment && <Meta icon={<Dumbbell className="h-3 w-3" />}>{drill.equipment}</Meta>}
            {intensity && <Meta icon={<Target className="h-3 w-3" />}>{intensity}</Meta>}
          </div>

          {/* How to run it */}
          <p className="text-sm text-foreground">{drill.instructions}</p>

          {/* What good looks like */}
          <p className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Success: </span>
            {drill.successCriteria}
          </p>

          {drill.relatedInsight && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Why: </span>
                {drill.relatedInsight}
              </span>
            </p>
          )}

          {drill.coachNotes && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Coach note: </span>
                {drill.coachNotes}
              </span>
            </p>
          )}

          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onStatusChange(skipped ? "pending" : "skipped")}
              className="h-7 px-2 text-xs text-muted-foreground"
            >
              {skipped ? "Un-skip" : "Skip this drill"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
