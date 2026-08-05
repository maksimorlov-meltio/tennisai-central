// Progress derived from the stored drill statuses. A plan with no drills shows
// no bar and no percentage — there is nothing to be a percentage of.
import { cn } from "@/lib/utils";
import { progressLabel, type PlanProgress } from "@/pages/trainingPlans/planProgress";

export function PlanProgressBar({
  progress,
  className,
}: {
  progress: PlanProgress;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">{progressLabel(progress)}</span>
        {progress.skipped > 0 && <span className="text-muted-foreground">{progress.skipped} skipped</span>}
      </div>
      {progress.total > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 bg-muted">
            {progress.done > 0 && (
              <div className="h-full bg-primary" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            )}
          </div>
          <span className="w-10 text-right text-xs font-semibold tabular-nums text-foreground">
            {progress.pct}%
          </span>
        </div>
      )}
    </div>
  );
}
