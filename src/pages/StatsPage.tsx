// ============================================================
// Statistics — every figure on this page is computed by the API from match
// rows the user logged (GET /api/matches/stats). Nothing is seeded, sampled
// or estimated: a metric whose counts were never entered renders "—".
// ============================================================

import { Link } from "react-router-dom";
import { Activity, BarChart3, ClipboardList, Plus, Swords, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/shared";
import { useMatchStats, useMatches } from "@/hooks/api/matches";
import {
  NO_VALUE,
  formatCount,
  formatMatchDate,
  formatPct,
  formatRatio,
  formatSample,
  formatScore,
  formatWinLoss,
  matchFormatLabel,
  surfaceLabel,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { MatchView, RecentFormMatch, StatMetric, SurfaceSplitStats } from "@/types";

// ─── Small presentational pieces ───

function HeadlineCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  const missing = value === NO_VALUE;
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", missing ? "text-muted-foreground" : "text-foreground")}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

/** A pooled metric: the number plus the honest sample behind it. */
function MetricTile({ label, metric, kind }: { label: string; metric: StatMetric; kind: "pct" | "count" | "ratio" }) {
  const value = kind === "pct" ? formatPct(metric) : kind === "count" ? formatCount(metric) : formatRatio(metric);
  const missing = value === NO_VALUE;
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", missing ? "text-muted-foreground" : "text-foreground")}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{formatSample(metric)}</p>
    </div>
  );
}

function FormChip({ entry }: { entry: RecentFormMatch }) {
  if (entry.result === null) {
    return (
      <span
        title="Result not recorded"
        className="flex h-7 w-7 items-center justify-center border border-dashed border-border text-xs text-muted-foreground"
      >
        {NO_VALUE}
      </span>
    );
  }
  return (
    <span
      title={entry.date ? formatMatchDate(entry.date) : undefined}
      className={cn(
        "flex h-7 w-7 items-center justify-center text-xs font-bold",
        entry.result === "win" ? "bg-primary/15 text-primary" : "bg-muted text-foreground",
      )}
    >
      {entry.result === "win" ? "W" : "L"}
    </span>
  );
}

function SurfaceRow({ split }: { split: SurfaceSplitStats }) {
  return (
    <div className="space-y-1.5 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{surfaceLabel(split.surface)}</span>
        <span className="text-xs text-muted-foreground">
          {split.matches} match{split.matches === 1 ? "" : "es"} ·{" "}
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

function RecentMatchRow({ match }: { match: MatchView }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {match.opponentName ?? "Opponent not recorded"}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatMatchDate(match.date)} · {surfaceLabel(match.surface)} · {matchFormatLabel(match.format)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-foreground">{formatScore(match.scoreSets)}</span>
        <span
          className={cn(
            "px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            match.result === "win"
              ? "bg-primary/10 text-primary"
              : match.result === "loss"
                ? "bg-muted text-foreground"
                : "bg-muted text-muted-foreground",
          )}
        >
          {match.result === "win" ? "Win" : match.result === "loss" ? "Loss" : "Not recorded"}
        </span>
      </div>
    </div>
  );
}

// ─── Page ───

export default function StatsPage() {
  const { data: stats, isLoading, error, refetch } = useMatchStats();
  const { data: matches = [], isLoading: matchesLoading } = useMatches();

  if (isLoading || matchesLoading) return <LoadingState message="Computing your statistics…" />;

  if (error || !stats) {
    return (
      <ErrorState message="Failed to load your statistics." onRetry={() => void refetch()} />
    );
  }

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Statistics</h1>
        <p className="text-sm text-muted-foreground">
          {stats.matchesPlayed > 0
            ? `Computed from the ${stats.matchesPlayed} match${stats.matchesPlayed === 1 ? "" : "es"} you logged` +
              (stats.firstMatchDate && stats.lastMatchDate
                ? ` (${formatMatchDate(stats.firstMatchDate)} – ${formatMatchDate(stats.lastMatchDate)}).`
                : ".")
            : "Your season performance overview."}
        </p>
      </div>
      <Button asChild variant="outline" className="gap-2 self-start">
        <Link to="/matches">
          <Plus className="h-4 w-4" /> Log match
        </Link>
      </Button>
    </div>
  );

  if (stats.matchesPlayed === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={<BarChart3 className="h-6 w-6 text-muted-foreground" />}
          title="No match data recorded yet"
          description="Log a match and your win rate, surface splits, serve and return percentages and recent form appear here — all computed from what you entered."
        >
          <Button asChild className="gap-1.5">
            <Link to="/matches">
              <ClipboardList className="h-4 w-4" /> Log your first match
            </Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const recentMatches = matches.slice(0, 5);

  return (
    <div className="space-y-6">
      {header}

      {/* ── Headline ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeadlineCard
          label="Matches played"
          value={String(stats.matchesPlayed)}
          caption={
            stats.resultsRecorded === stats.matchesPlayed
              ? "all with a recorded result"
              : `${stats.resultsRecorded} with a recorded result`
          }
        />
        <HeadlineCard
          label="Win rate"
          value={formatPct(stats.winRatePct)}
          caption={
            stats.resultsRecorded > 0
              ? `from ${stats.resultsRecorded} match${stats.resultsRecorded === 1 ? "" : "es"} with a result`
              : "no win/loss recorded yet"
          }
        />
        <HeadlineCard
          label="Win – loss"
          value={formatWinLoss(stats.wins, stats.losses)}
          caption={stats.resultsRecorded > 0 ? "wins – losses" : "no win/loss recorded yet"}
        />
        <HeadlineCard
          label={`Recent form (last ${stats.recentForm.sampleSize})`}
          value={formatPct(stats.recentForm.winRatePct)}
          caption={
            stats.recentForm.wins !== null
              ? `${formatWinLoss(stats.recentForm.wins, stats.recentForm.losses)} in the last ${stats.recentForm.sampleSize}`
              : "no results recorded in these matches"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Surfaces ── */}
        <DashboardCard
          title="By surface"
          description="Win rate per court type — only surfaces you have played"
          icon={<Target className="h-4 w-4" />}
        >
          {stats.surfaces.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No surfaces recorded yet.</p>
          ) : (
            <div>
              {stats.surfaces.map((split) => (
                <SurfaceRow key={split.surface} split={split} />
              ))}
            </div>
          )}
        </DashboardCard>

        {/* ── Recent form ── */}
        <DashboardCard
          title="Recent form"
          description={`Newest first · last ${stats.recentForm.sampleSize} match${stats.recentForm.sampleSize === 1 ? "" : "es"}`}
          icon={<Activity className="h-4 w-4" />}
        >
          {stats.recentForm.matches.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nothing logged yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {stats.recentForm.matches.map((entry) => (
                  <FormChip key={entry.id} entry={entry} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.recentForm.winRatePct === null
                  ? "None of these matches has a recorded win or loss."
                  : `${formatWinLoss(stats.recentForm.wins, stats.recentForm.losses)} · ${formatPct(
                      stats.recentForm.winRatePct,
                    )} win rate over this window.`}
              </p>
            </div>
          )}
        </DashboardCard>

        {/* ── Serve ── */}
        <DashboardCard
          title="Serve"
          description="Pooled from the serve counts you entered"
          icon={<Swords className="h-4 w-4" />}
        >
          <div>
            <MetricTile label="1st serve in" metric={stats.serve.firstServePct} kind="pct" />
            <MetricTile label="1st serve points won" metric={stats.serve.firstServeWonPct} kind="pct" />
            <MetricTile label="2nd serve points won" metric={stats.serve.secondServeWonPct} kind="pct" />
            <MetricTile label="Aces" metric={stats.serve.aces} kind="count" />
            <MetricTile label="Double faults" metric={stats.serve.doubleFaults} kind="count" />
            <MetricTile label="Break points saved" metric={stats.breakPoints.savePct} kind="pct" />
          </div>
        </DashboardCard>

        {/* ── Return & rally ── */}
        <DashboardCard
          title="Return & rally"
          description="Pooled from the return and rally counts you entered"
          icon={<BarChart3 className="h-4 w-4" />}
        >
          <div>
            <MetricTile label="Return points won" metric={stats.returnGame.returnPointsWonPct} kind="pct" />
            <MetricTile label="Break points converted" metric={stats.breakPoints.conversionPct} kind="pct" />
            <MetricTile label="Winners" metric={stats.rally.winners} kind="count" />
            <MetricTile label="Unforced errors" metric={stats.rally.unforcedErrors} kind="count" />
            <MetricTile label="Winners : unforced errors" metric={stats.rally.winnerToUnforcedRatio} kind="ratio" />
            <MetricTile label="Net points won" metric={stats.rally.netPointsWonPct} kind="pct" />
          </div>
        </DashboardCard>
      </div>

      {/* ── Recent matches ── */}
      <DashboardCard
        title="Recent matches"
        description="The most recent matches behind these numbers"
        icon={<ClipboardList className="h-4 w-4" />}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/matches">View all</Link>
          </Button>
        }
      >
        {recentMatches.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No matches to show.</p>
        ) : (
          <div>
            {recentMatches.map((match) => (
              <RecentMatchRow key={match.id} match={match} />
            ))}
          </div>
        )}
      </DashboardCard>

      <p className="text-xs text-muted-foreground">
        Percentages are computed on read from the raw counts entered for each match. A metric shows{" "}
        <span className="font-medium text-foreground">{NO_VALUE}</span> when the counts behind it were never entered —
        it is never shown as zero.
      </p>
    </div>
  );
}
