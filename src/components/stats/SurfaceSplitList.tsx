// Win rate per surface. The bar is only drawn when a win rate actually exists —
// a surface with no recorded result shows an empty track, not a zero-width bar
// that would read as "0%".
import { formatPct, formatWinLoss, matchCountLabel, surfaceLabel } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { SurfaceSplitStats } from "@/types";

export function SurfaceSplitRow({ split }: { split: SurfaceSplitStats }) {
  return (
    <div className="space-y-1.5 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{surfaceLabel(split.surface)}</span>
        <span className="text-xs text-muted-foreground">
          {matchCountLabel(split.matches)} ·{" "}
          {split.resultsRecorded > 0 ? formatWinLoss(split.wins, split.losses) : "no result recorded"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 bg-muted">
          {split.winRatePct !== null && (
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, split.winRatePct)}%` }} />
          )}
        </div>
        <span
          className={cn(
            "w-16 text-right text-sm font-semibold",
            split.winRatePct === null ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {formatPct(split.winRatePct)}
        </span>
      </div>
    </div>
  );
}

export function SurfaceSplitList({ splits }: { splits: SurfaceSplitStats[] }) {
  if (splits.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No surfaces recorded yet.</p>;
  }
  return (
    <div>
      {splits.map((split) => (
        <SurfaceSplitRow key={split.surface} split={split} />
      ))}
    </div>
  );
}
