// ============================================================
// TennisAI — match-trend derivation (pure, no I/O)
//
// Turns the *logged match list* into a plottable series. The honesty contract
// of this module, in full:
//
//   • A point's value is `null` whenever the counts behind that metric were
//     never entered for that match. Null is NEVER replaced by 0, by the
//     previous value, or by an average — the chart draws a gap instead
//     (`connectNulls={false}`).
//   • The running win rate only advances on matches with a recorded win/loss.
//     Matches with no result contribute nothing and get `null` — no carry
//     forward, so the line never implies a figure that was not earned.
//   • `usable` / `missing` are reported so the caller can refuse to draw a
//     trend that would mislead (see MIN_TREND_POINTS).
// ============================================================

import { formatMatchDate } from "@/lib/stats/format";
import type { MatchResult, MatchView } from "@/types";

/** Fewer usable points than this and a "trend" is noise, not a trend. */
export const MIN_TREND_POINTS = 3;

export type TrendMetricId =
  | "firstServePct"
  | "firstServeWonPct"
  | "secondServeWonPct"
  | "returnPointsWonPct"
  | "runningWinRatePct";

export interface TrendMetricMeta {
  id: TrendMetricId;
  label: string;
  /** Shown under the chart so the reader knows exactly what a point means. */
  definition: string;
  /** What the metric needs from a match to produce a point. */
  requires: string;
}

export const TREND_METRICS: TrendMetricMeta[] = [
  {
    id: "firstServePct",
    label: "1st serve in",
    definition: "First serves in, as a share of first-serve attempts, for that single match.",
    requires: "first-serve attempts and first serves in",
  },
  {
    id: "firstServeWonPct",
    label: "1st serve points won",
    definition: "Points won behind a first serve that landed in, for that single match.",
    requires: "first serves in and first-serve points won",
  },
  {
    id: "secondServeWonPct",
    label: "2nd serve points won",
    definition: "Points won on second serve, for that single match.",
    requires: "second serves played and second-serve points won",
  },
  {
    id: "returnPointsWonPct",
    label: "Return points won",
    definition: "Return points won, for that single match.",
    requires: "return points played and return points won",
  },
  {
    id: "runningWinRatePct",
    label: "Win rate (running)",
    definition:
      "Win rate across every match with a recorded result up to and including that match — it only moves when a result was recorded.",
    requires: "a recorded win or loss",
  },
];

export function trendMetricMeta(id: TrendMetricId): TrendMetricMeta {
  return TREND_METRICS.find((m) => m.id === id) ?? TREND_METRICS[0];
}

export interface TrendPoint {
  /** Stable x key — the index, so two matches on the same date never collide. */
  x: string;
  matchId: string;
  /** Short axis label, "—" when the date is unreadable. */
  label: string;
  dateIso: string | null;
  opponentName: string | null;
  result: MatchResult | null;
  /** null ⇒ never entered for this match. Rendered as a gap, never as 0. */
  value: number | null;
}

export interface TrendSeries {
  metric: TrendMetricId;
  points: TrendPoint[];
  /** Points with a real, entered value — the honest sample of the line. */
  usable: number;
  /** Points in the window whose inputs were never entered. */
  missing: number;
  /** True when there is enough entered data for a trend to mean anything. */
  plottable: boolean;
}

/** Finite-number guard. `strictNullChecks` is off here, so be explicit. */
function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeResult(result: string | undefined | null): MatchResult | null {
  return result === "win" || result === "loss" ? result : null;
}

/**
 * The match list arrives newest-first. Take the window off the front, then
 * flip to chronological order so the x axis reads left→right in time.
 */
export function windowedChronological(matches: MatchView[], windowSize: number): MatchView[] {
  const size = Number.isFinite(windowSize) && windowSize > 0 ? Math.floor(windowSize) : matches.length;
  return matches.slice(0, size).reverse();
}

export function buildTrendSeries(
  matches: MatchView[],
  metric: TrendMetricId,
  windowSize: number,
): TrendSeries {
  const ordered = windowedChronological(matches, windowSize);

  // Running win rate is stateful, so it is accumulated as we walk forward.
  let wins = 0;
  let results = 0;

  const points: TrendPoint[] = ordered.map((match, index) => {
    const result = normalizeResult(match.result);

    let value: number | null;
    if (metric === "runningWinRatePct") {
      if (result === null) {
        // No result recorded → no point. Deliberately NOT carried forward.
        value = null;
      } else {
        results += 1;
        if (result === "win") wins += 1;
        value = Math.round((wins / results) * 1000) / 10;
      }
    } else {
      value = finite(match.computed?.[metric]);
    }

    return {
      x: String(index),
      matchId: match.id,
      label: formatMatchDate(match.date, "d MMM"),
      dateIso: match.date ?? null,
      opponentName: match.opponentName ?? null,
      result,
      value,
    };
  });

  const usable = points.filter((p) => p.value !== null && p.value !== undefined).length;

  return {
    metric,
    points,
    usable,
    missing: points.length - usable,
    plottable: usable >= MIN_TREND_POINTS,
  };
}
