// ============================================================
// A pooled metric tile: the number, and — prominently, on the same line — the
// honest sample it was computed from ("from 4 matches"). The sample is the
// whole point: a 71% off two matches and a 71% off forty are not the same claim.
// ============================================================

import { Info } from "lucide-react";
import {
  NO_VALUE,
  formatCount,
  formatPct,
  formatRatio,
  formatSample,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { StatMetric } from "@/types";

export type MetricKind = "pct" | "count" | "ratio";

export interface MetricTileProps {
  label: string;
  metric: StatMetric;
  kind: MetricKind;
  /** What the player would have to log for this metric to appear. */
  requires?: string;
}

function formatMetric(metric: StatMetric, kind: MetricKind): string {
  if (kind === "pct") return formatPct(metric);
  if (kind === "count") return formatCount(metric);
  return formatRatio(metric);
}

export function MetricTile({ label, metric, kind, requires }: MetricTileProps) {
  const value = formatMetric(metric, kind);
  const missing = value === NO_VALUE;

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className={cn("text-lg font-semibold", missing ? "text-muted-foreground" : "text-foreground")}>{value}</p>
        <span
          className={cn(
            "px-1.5 py-0.5 text-[11px] font-medium",
            missing ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {formatSample(metric)}
        </span>
      </div>
      {missing && requires && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" />
          Count {requires} when logging a match to see this.
        </p>
      )}
    </div>
  );
}
