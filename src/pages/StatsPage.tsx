// ============================================================
// Statistics — every figure on this page is computed from match rows the user
// logged: the aggregates by the API (GET /api/matches/stats), the trend line in
// the browser from the same match list (GET /api/matches). Nothing is seeded,
// sampled, smoothed or estimated: a metric whose counts were never entered
// renders "—", and a trend with too few entered points is not drawn at all.
//
// Two scopes coexist on this page and are labelled as such:
//   • WINDOWED (the Window control) — recent form and the trend chart.
//   • ALL MATCHES — the overall win rate and every pooled serve/return/rally
//     figure. The API does not window those, so the UI never implies it does.
// ============================================================

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BarChart3, ClipboardList, Loader2, Plus, Swords, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/shared";
import {
  ExpandableMatchRow,
  HeadlineCard,
  MetricTile,
  PerformanceTrendChart,
  RecentFormStrip,
  StatsWindowControl,
  SurfaceSplitList,
  buildWindowOptions,
  recentParamFor,
  type StatsWindowId,
} from "@/components/stats";
import { useMatchStats, useMatches } from "@/hooks/api/matches";
import { useT } from "@/lib/i18n";
import {
  NO_VALUE,
  formatMatchDate,
  formatPct,
  formatWinLoss,
  matchCountLabel,
} from "@/lib/stats/format";

const DEFAULT_WINDOW: StatsWindowId = "last10";

export default function StatsPage() {
  const { t } = useT();
  const [windowId, setWindowId] = useState<StatsWindowId>(DEFAULT_WINDOW);
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  const { data: matches = [], isLoading: matchesLoading, error: matchesError, refetch: refetchMatches } = useMatches();

  // Windows are derived from the real list, so a window larger than the number
  // of logged matches is never offered.
  const windowOptions = useMemo(() => buildWindowOptions(matches), [matches]);
  // The default window may not be on offer yet (too few matches) — fall back to
  // the widest one so the control never highlights an option that isn't there.
  const activeWindow = windowOptions.find((o) => o.id === windowId) ?? windowOptions[windowOptions.length - 1];
  const activeWindowId: StatsWindowId = activeWindow?.id ?? "all";
  const recentParam = recentParamFor(activeWindow);

  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
    error: statsError,
    refetch: refetchStats,
  } = useMatchStats(undefined, recentParam);

  const retry = () => {
    void refetchStats();
    void refetchMatches();
  };

  if (statsLoading || matchesLoading) return <LoadingState message="Computing your statistics…" />;

  if (statsError || matchesError || !stats) {
    return <ErrorState message="Failed to load your statistics." onRetry={retry} />;
  }

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Statistics</h1>
        <p className="text-sm text-muted-foreground">
          {stats.matchesPlayed > 0
            ? `Computed from the ${matchCountLabel(stats.matchesPlayed)} you logged` +
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
          title={t("empty.stats.title")}
          description={t("empty.stats.description")}
          action={
            <Button asChild className="gap-1.5">
              <Link to="/matches">
                <ClipboardList className="h-4 w-4" /> {t("empty.stats.action")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const windowLabel = activeWindow?.label ?? "All";
  // The window's true sample is whatever the server actually aggregated.
  const formSample = stats.recentForm.sampleSize;

  return (
    <div className="space-y-6">
      {header}

      {/* ── Window control — scoped, and says what it is scoped to ── */}
      <div className="space-y-2 border border-border bg-card p-4">
        <StatsWindowControl
          options={windowOptions}
          value={activeWindowId}
          onChange={setWindowId}
          hint={
            statsFetching ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating…
              </span>
            ) : null
          }
        />
        <p className="text-xs text-muted-foreground">
          The window applies to <span className="font-medium text-foreground">recent form</span> and the{" "}
          <span className="font-medium text-foreground">trend</span> chart. Overall win rate and the pooled serve,
          return and rally figures always cover all {matchCountLabel(stats.matchesPlayed)}.
        </p>
      </div>

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
          label="Win rate (all matches)"
          value={formatPct(stats.winRatePct)}
          caption={
            stats.resultsRecorded > 0
              ? `from ${matchCountLabel(stats.resultsRecorded)} with a result`
              : "no win/loss recorded yet"
          }
        />
        <HeadlineCard
          label="Win – loss (all matches)"
          value={formatWinLoss(stats.wins, stats.losses)}
          caption={stats.resultsRecorded > 0 ? "wins – losses" : "no win/loss recorded yet"}
        />
        <HeadlineCard
          label={`Form · ${windowLabel}`}
          value={formatPct(stats.recentForm.winRatePct)}
          caption={
            stats.recentForm.wins !== null
              ? `${formatWinLoss(stats.recentForm.wins, stats.recentForm.losses)} in the last ${matchCountLabel(
                  formSample,
                )}`
              : `no results recorded in these ${matchCountLabel(formSample)}`
          }
        />
      </div>

      {/* ── Trend ── */}
      <PerformanceTrendChart
        matches={matches}
        windowSize={activeWindow?.size ?? matches.length}
        windowLabel={windowLabel}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Surfaces ── */}
        <DashboardCard
          title="By surface"
          description="Win rate per court type — only surfaces you have played · all matches"
          icon={<Target className="h-4 w-4" />}
        >
          <SurfaceSplitList splits={stats.surfaces} />
        </DashboardCard>

        {/* ── Recent form ── */}
        <DashboardCard
          title="Recent form"
          description={`Newest first · ${windowLabel} (${matchCountLabel(formSample)})`}
          icon={<Activity className="h-4 w-4" />}
        >
          <RecentFormStrip form={stats.recentForm} />
        </DashboardCard>

        {/* ── Serve ── */}
        <DashboardCard
          title="Serve"
          description="Pooled from the serve counts you entered · all matches"
          icon={<Swords className="h-4 w-4" />}
        >
          <div>
            <MetricTile
              label="1st serve in"
              metric={stats.serve.firstServePct}
              kind="pct"
              requires="first-serve attempts and serves in"
            />
            <MetricTile
              label="1st serve points won"
              metric={stats.serve.firstServeWonPct}
              kind="pct"
              requires="first serves in and points won behind them"
            />
            <MetricTile
              label="2nd serve points won"
              metric={stats.serve.secondServeWonPct}
              kind="pct"
              requires="second serves played and points won"
            />
            <MetricTile label="Aces" metric={stats.serve.aces} kind="count" requires="aces" />
            <MetricTile
              label="Double faults"
              metric={stats.serve.doubleFaults}
              kind="count"
              requires="double faults"
            />
            <MetricTile
              label="Break points saved"
              metric={stats.breakPoints.savePct}
              kind="pct"
              requires="break points faced and saved"
            />
          </div>
        </DashboardCard>

        {/* ── Return & rally ── */}
        <DashboardCard
          title="Return & rally"
          description="Pooled from the return and rally counts you entered · all matches"
          icon={<BarChart3 className="h-4 w-4" />}
        >
          <div>
            <MetricTile
              label="Return points won"
              metric={stats.returnGame.returnPointsWonPct}
              kind="pct"
              requires="return points played and won"
            />
            <MetricTile
              label="Break points converted"
              metric={stats.breakPoints.conversionPct}
              kind="pct"
              requires="break points created and converted"
            />
            <MetricTile label="Winners" metric={stats.rally.winners} kind="count" requires="winners" />
            <MetricTile
              label="Unforced errors"
              metric={stats.rally.unforcedErrors}
              kind="count"
              requires="unforced errors"
            />
            <MetricTile
              label="Winners : unforced errors"
              metric={stats.rally.winnerToUnforcedRatio}
              kind="ratio"
              requires="winners and unforced errors"
            />
            <MetricTile
              label="Net points won"
              metric={stats.rally.netPointsWonPct}
              kind="pct"
              requires="net approaches and net points won"
            />
          </div>
        </DashboardCard>
      </div>

      {/* ── Recent matches — drill down to the match behind the numbers ── */}
      <DashboardCard
        title="Recent matches"
        description="Open a match to see the percentages computed from its own counts"
        icon={<ClipboardList className="h-4 w-4" />}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/matches">View all</Link>
          </Button>
        }
      >
        {matches.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No matches to show.</p>
        ) : (
          <div>
            {matches.slice(0, 5).map((match) => (
              <ExpandableMatchRow
                key={match.id}
                match={match}
                isOpen={openMatchId === match.id}
                onToggle={() => setOpenMatchId(openMatchId === match.id ? null : match.id)}
              />
            ))}
          </div>
        )}
      </DashboardCard>

      <p className="text-xs text-muted-foreground">
        Percentages are computed on read from the raw counts entered for each match. A metric shows{" "}
        <span className="font-medium text-foreground">{NO_VALUE}</span> when the counts behind it were never entered —
        it is never shown as zero, and the trend line breaks rather than bridging a match with no counts.
      </p>
    </div>
  );
}
