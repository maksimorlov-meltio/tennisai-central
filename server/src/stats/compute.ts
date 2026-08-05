// ============================================================
// TennisAI — Derived match statistics (PURE module, no I/O)
//
// The schema stores RAW COUNTS ONLY; every percentage is computed here on
// read and never persisted (see the `Match` model comment in schema.prisma).
//
// Hard rules this module obeys — a fabricated "67% win rate" once shipped in
// this product, so the honesty contract is enforced in code:
//   1. Never invent a number. A metric is `null` when the counts that feed
//      it were not entered, NOT 0 and never NaN/Infinity.
//   2. Every ratio is divide-by-zero safe: a zero denominator yields `null`.
//   3. Pooled percentages only accept a match when BOTH the numerator and
//      the denominator were recorded for that match, so the two sides of the
//      fraction always describe the same sample.
//   4. Every metric carries `sample` — how many matches actually contributed
//      — so the UI can say "from 4 matches" instead of implying a season.
// ============================================================

/** Numeric raw-count columns this module reads. */
export type CountKey =
  | "firstServeAttempts"
  | "firstServesIn"
  | "firstServePointsWon"
  | "secondServePlayed"
  | "secondServePointsWon"
  | "aces"
  | "doubleFaults"
  | "returnPointsPlayed"
  | "returnPointsWon"
  | "winners"
  | "forcedErrors"
  | "unforcedErrors"
  | "breakPointsCreated"
  | "breakPointsConverted"
  | "breakPointsFaced"
  | "breakPointsSaved"
  | "netApproaches"
  | "netPointsWon";

/**
 * The shape the aggregate reads. A Prisma `Match` row structurally satisfies
 * it; declaring it locally keeps this module pure, dependency-free and unit
 * testable without a database.
 */
export type StatsMatchRow = {
  id: string;
  date: Date | string;
  surface: string;
  result?: string | null;
} & { [K in CountKey]?: number | null };

/** A computed value plus the number of matches that contributed to it. */
export interface Metric {
  /** `null` when the underlying counts were never entered. Never 0-as-unknown. */
  value: number | null;
  /** Matches whose counts fed this value. 0 ⇒ `value` is necessarily null. */
  sample: number;
}

export interface SurfaceSplit {
  surface: string;
  matches: number;
  resultsRecorded: number;
  wins: number | null;
  losses: number | null;
  winRatePct: number | null;
}

export interface RecentFormMatch {
  id: string;
  date: string | null;
  surface: string;
  result: "win" | "loss" | null;
}

export interface RecentForm {
  /** Matches inspected (≤ the requested window). */
  sampleSize: number;
  wins: number | null;
  losses: number | null;
  winRatePct: number | null;
  /** Newest first. */
  matches: RecentFormMatch[];
}

export interface AggregateMatchStats {
  matchesPlayed: number;
  /** Matches with an explicit win/loss. Everything W-L is scoped to these. */
  resultsRecorded: number;
  wins: number | null;
  losses: number | null;
  winRatePct: number | null;
  firstMatchDate: string | null;
  lastMatchDate: string | null;
  surfaces: SurfaceSplit[];
  serve: {
    firstServePct: Metric;
    firstServeWonPct: Metric;
    secondServeWonPct: Metric;
    aces: Metric;
    doubleFaults: Metric;
  };
  returnGame: {
    returnPointsWonPct: Metric;
  };
  breakPoints: {
    conversionPct: Metric;
    savePct: Metric;
  };
  rally: {
    winners: Metric;
    forcedErrors: Metric;
    unforcedErrors: Metric;
    winnerToUnforcedRatio: Metric;
    netPointsWonPct: Metric;
  };
  recentForm: RecentForm;
}

/** Percentages derived for a SINGLE match — mirrors the client's
 *  `MatchComputedStats`. Fields are omitted (undefined) when uncomputable. */
export interface MatchComputedStats {
  firstServePct?: number;
  firstServeWonPct?: number;
  secondServeWonPct?: number;
  returnPointsWonPct?: number;
  breakPointConversionPct?: number;
  breakPointSavePct?: number;
  netPointsWonPct?: number;
  totalWinners?: number;
  totalErrors?: number;
  winnerToUnforcedRatio?: number;
}

/** Default recent-form window. */
export const DEFAULT_RECENT_COUNT = 5;

const PCT_DP = 1;
const RATIO_DP = 2;

/** A fresh "nothing was entered" metric (never a shared mutable object). */
const noData = (): Metric => ({ value: null, sample: 0 });

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** A usable count: a finite, non-negative number. Anything else is "missing". */
function isCount(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/** Percentage for one pair of counts. `null` when missing or divide-by-zero. */
function pctOf(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (!isCount(numerator) || !isCount(denominator) || denominator === 0) return null;
  return round((numerator / denominator) * 100, PCT_DP);
}

/** Ratio for one pair of counts. `null` when missing or divide-by-zero. */
function ratioOf(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (!isCount(numerator) || !isCount(denominator) || denominator === 0) return null;
  return round(numerator / denominator, RATIO_DP);
}

/** `null` → `undefined`, so JSON responses omit uncomputable fields. */
function orUndef(v: number | null): number | undefined {
  return v === null ? undefined : v;
}

/**
 * Pool a percentage across matches. A match contributes only when both counts
 * are present AND its denominator is > 0 — so "0 break points faced" is not
 * mistaken for "0% saved".
 */
function pooledPct(rows: readonly StatsMatchRow[], numKey: CountKey, denKey: CountKey): Metric {
  let numerator = 0;
  let denominator = 0;
  let sample = 0;
  for (const row of rows) {
    const n = row[numKey];
    const d = row[denKey];
    if (!isCount(n) || !isCount(d) || d === 0) continue;
    numerator += n;
    denominator += d;
    sample += 1;
  }
  if (sample === 0 || denominator === 0) return noData();
  return { value: round((numerator / denominator) * 100, PCT_DP), sample };
}

/** Pool a ratio (e.g. winners : unforced errors) the same way. */
function pooledRatio(rows: readonly StatsMatchRow[], numKey: CountKey, denKey: CountKey): Metric {
  let numerator = 0;
  let denominator = 0;
  let sample = 0;
  for (const row of rows) {
    const n = row[numKey];
    const d = row[denKey];
    if (!isCount(n) || !isCount(d) || d === 0) continue;
    numerator += n;
    denominator += d;
    sample += 1;
  }
  if (sample === 0 || denominator === 0) return noData();
  return { value: round(numerator / denominator, RATIO_DP), sample };
}

/** Total a count across matches. `null` when no match recorded it. */
function pooledSum(rows: readonly StatsMatchRow[], key: CountKey): Metric {
  let total = 0;
  let sample = 0;
  for (const row of rows) {
    const v = row[key];
    if (!isCount(v)) continue;
    total += v;
    sample += 1;
  }
  return sample === 0 ? noData() : { value: total, sample };
}

/** Only an explicit "win"/"loss" counts; anything else is "not recorded". */
function normalizeResult(result: string | null | undefined): "win" | "loss" | null {
  return result === "win" || result === "loss" ? result : null;
}

function toMillis(date: Date | string): number {
  const ms = date instanceof Date ? date.getTime() : Date.parse(date);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function toIso(date: Date | string): string | null {
  const ms = toMillis(date);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Win/loss tallies for a set of rows — all `null` when nothing is recorded. */
function winLoss(rows: readonly StatsMatchRow[]): {
  resultsRecorded: number;
  wins: number | null;
  losses: number | null;
  winRatePct: number | null;
} {
  let wins = 0;
  let losses = 0;
  for (const row of rows) {
    const r = normalizeResult(row.result);
    if (r === "win") wins += 1;
    else if (r === "loss") losses += 1;
  }
  const resultsRecorded = wins + losses;
  if (resultsRecorded === 0) {
    return { resultsRecorded: 0, wins: null, losses: null, winRatePct: null };
  }
  return {
    resultsRecorded,
    wins,
    losses,
    winRatePct: round((wins / resultsRecorded) * 100, PCT_DP),
  };
}

/**
 * Percentages for a single match. Every field is omitted when its inputs are
 * missing — the UI then renders "—" rather than a zero.
 */
export function computeMatchStats(row: StatsMatchRow): MatchComputedStats {
  const winners = row.winners;
  const forced = row.forcedErrors;
  const unforced = row.unforcedErrors;

  // A "total" needs BOTH halves. Adding only the counted half would imply the
  // other half was zero — exactly the kind of quiet fabrication banned here.
  const totalErrors = isCount(forced) && isCount(unforced) ? forced + unforced : null;

  return {
    firstServePct: orUndef(pctOf(row.firstServesIn, row.firstServeAttempts)),
    firstServeWonPct: orUndef(pctOf(row.firstServePointsWon, row.firstServesIn)),
    secondServeWonPct: orUndef(pctOf(row.secondServePointsWon, row.secondServePlayed)),
    returnPointsWonPct: orUndef(pctOf(row.returnPointsWon, row.returnPointsPlayed)),
    breakPointConversionPct: orUndef(pctOf(row.breakPointsConverted, row.breakPointsCreated)),
    breakPointSavePct: orUndef(pctOf(row.breakPointsSaved, row.breakPointsFaced)),
    netPointsWonPct: orUndef(pctOf(row.netPointsWon, row.netApproaches)),
    totalWinners: isCount(winners) ? winners : undefined,
    totalErrors: totalErrors === null ? undefined : totalErrors,
    winnerToUnforcedRatio: orUndef(ratioOf(winners, unforced)),
  };
}

/**
 * Aggregate a player's matches. Callers pass only rows they are authorized to
 * read — this module performs no authorization and no I/O.
 */
export function computeAggregateStats(
  rows: readonly StatsMatchRow[],
  options: { recentCount?: number } = {},
): AggregateMatchStats {
  const recentCount =
    isCount(options.recentCount) && options.recentCount > 0
      ? Math.floor(options.recentCount)
      : DEFAULT_RECENT_COUNT;

  const overall = winLoss(rows);

  // ── date range (rows with an unparseable date are simply not dated) ──
  const times = rows.map((r) => toMillis(r.date)).filter((ms) => Number.isFinite(ms));
  const firstMatchDate = times.length ? new Date(Math.min(...times)).toISOString() : null;
  const lastMatchDate = times.length ? new Date(Math.max(...times)).toISOString() : null;

  // ── per-surface splits, biggest sample first ──
  const bySurface = new Map<string, StatsMatchRow[]>();
  for (const row of rows) {
    const key = row.surface;
    const bucket = bySurface.get(key);
    if (bucket) bucket.push(row);
    else bySurface.set(key, [row]);
  }
  const surfaces: SurfaceSplit[] = [...bySurface.entries()]
    .map(([surface, surfaceRows]) => {
      const wl = winLoss(surfaceRows);
      return {
        surface,
        matches: surfaceRows.length,
        resultsRecorded: wl.resultsRecorded,
        wins: wl.wins,
        losses: wl.losses,
        winRatePct: wl.winRatePct,
      };
    })
    .sort((a, b) => b.matches - a.matches || a.surface.localeCompare(b.surface));

  // ── recent form: newest first, undated rows last ──
  const sorted = [...rows].sort((a, b) => {
    const at = toMillis(a.date);
    const bt = toMillis(b.date);
    if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0;
    if (!Number.isFinite(at)) return 1;
    if (!Number.isFinite(bt)) return -1;
    return bt - at;
  });
  const recentRows = sorted.slice(0, recentCount);
  const recentWl = winLoss(recentRows);
  const recentForm: RecentForm = {
    sampleSize: recentRows.length,
    wins: recentWl.wins,
    losses: recentWl.losses,
    winRatePct: recentWl.winRatePct,
    matches: recentRows.map((row) => ({
      id: row.id,
      date: toIso(row.date),
      surface: row.surface,
      result: normalizeResult(row.result),
    })),
  };

  return {
    matchesPlayed: rows.length,
    resultsRecorded: overall.resultsRecorded,
    wins: overall.wins,
    losses: overall.losses,
    winRatePct: overall.winRatePct,
    firstMatchDate,
    lastMatchDate,
    surfaces,
    serve: {
      firstServePct: pooledPct(rows, "firstServesIn", "firstServeAttempts"),
      firstServeWonPct: pooledPct(rows, "firstServePointsWon", "firstServesIn"),
      secondServeWonPct: pooledPct(rows, "secondServePointsWon", "secondServePlayed"),
      aces: pooledSum(rows, "aces"),
      doubleFaults: pooledSum(rows, "doubleFaults"),
    },
    returnGame: {
      returnPointsWonPct: pooledPct(rows, "returnPointsWon", "returnPointsPlayed"),
    },
    breakPoints: {
      conversionPct: pooledPct(rows, "breakPointsConverted", "breakPointsCreated"),
      savePct: pooledPct(rows, "breakPointsSaved", "breakPointsFaced"),
    },
    rally: {
      winners: pooledSum(rows, "winners"),
      forcedErrors: pooledSum(rows, "forcedErrors"),
      unforcedErrors: pooledSum(rows, "unforcedErrors"),
      winnerToUnforcedRatio: pooledRatio(rows, "winners", "unforcedErrors"),
      netPointsWonPct: pooledPct(rows, "netPointsWon", "netApproaches"),
    },
    recentForm,
  };
}

/** The honest zero-state: shape-complete, every metric null. */
export function emptyAggregateStats(): AggregateMatchStats {
  return computeAggregateStats([]);
}
