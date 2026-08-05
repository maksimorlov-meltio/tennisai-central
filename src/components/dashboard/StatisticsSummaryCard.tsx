// ============================================================
// Statistics summary — the player dashboard's real stats card
//
// This card used to render a hardcoded "No match data yet…" line and never
// queried anything, so it stayed empty even for a player with a full season
// logged. It now reads GET /api/matches/stats through `useMatchStats()` and
// renders only what the data supports: a metric whose counts were never
// entered shows "—" (never 0, never an invented figure) via the shared
// formatters in `@/lib/stats/format`.
// ============================================================

import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ErrorState, LoadingState } from "@/components/ui/shared";
import { useMatchStats } from "@/hooks/api/matches";
import { NO_VALUE, formatPct, formatWinLoss } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { RecentFormMatch } from "@/types";

/** One headline figure. Muted when the underlying data is missing. */
function Figure({ label, value, caption }: { label: string; value: string; caption: string }) {
  const missing = value === NO_VALUE;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-xl font-bold", missing ? "text-muted-foreground" : "text-foreground")}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{caption}</p>
    </div>
  );
}

/** W / L chip — matches the Stats page treatment; "—" when no result was entered. */
function FormChip({ entry }: { entry: RecentFormMatch }) {
  if (entry.result !== "win" && entry.result !== "loss") {
    return (
      <span
        title="Result not recorded"
        className="flex h-6 w-6 items-center justify-center border border-dashed border-border text-[11px] text-muted-foreground"
      >
        {NO_VALUE}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center text-[11px] font-bold",
        entry.result === "win" ? "bg-primary/15 text-primary" : "bg-muted text-foreground",
      )}
    >
      {entry.result === "win" ? "W" : "L"}
    </span>
  );
}

export function StatisticsSummaryCard() {
  const { data: stats, isLoading, error, refetch } = useMatchStats();

  const card = (children: React.ReactNode) => (
    <DashboardCard
      title="Statistics"
      description="Season performance overview"
      icon={<BarChart3 className="h-4 w-4" />}
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/stats">
            Full stats <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      }
    >
      {children}
    </DashboardCard>
  );

  if (isLoading) return card(<LoadingState className="py-8" message="Loading your statistics…" />);
  if (error || !stats) {
    return card(
      <ErrorState className="py-8" message="Couldn't load your match statistics." onRetry={() => void refetch()} />,
    );
  }

  // Only the honest empty state keeps the original copy.
  if (stats.matchesPlayed === 0) {
    return card(
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">
          No match data yet. Your stats will appear here once matches are recorded.
        </p>
        <Button size="sm" variant="outline" className="mt-3" asChild>
          <Link to="/matches">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Log match
          </Link>
        </Button>
      </div>,
    );
  }

  const recent = stats.recentForm;

  return card(
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Figure
          label="Win rate"
          value={formatPct(stats.winRatePct)}
          caption={
            stats.resultsRecorded > 0
              ? `from ${stats.resultsRecorded} match${stats.resultsRecorded === 1 ? "" : "es"} with a result`
              : "no win/loss recorded yet"
          }
        />
        <Figure
          label="Win – loss"
          value={formatWinLoss(stats.wins, stats.losses)}
          caption={`${stats.matchesPlayed} match${stats.matchesPlayed === 1 ? "" : "es"} logged`}
        />
      </div>

      {recent.matches.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent form · last {recent.sampleSize}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {recent.matches.map((entry) => (
              <FormChip key={entry.id} entry={entry} />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {recent.winRatePct === null
              ? "None of these matches has a recorded win or loss."
              : `${formatWinLoss(recent.wins, recent.losses)} · ${formatPct(recent.winRatePct)} win rate`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" asChild>
          <Link to="/matches">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Log match
          </Link>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/stats">
            Full breakdown <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>,
  );
}
