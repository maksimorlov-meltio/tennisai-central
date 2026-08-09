import { describe, it, expect } from "vitest";
import {
  computeAggregateStats,
  computeMatchStats,
  emptyAggregateStats,
  DEFAULT_RECENT_COUNT,
  type StatsMatchRow,
} from "./compute";

/** Minimal row factory — only what a test cares about is overridden. */
function row(overrides: Partial<StatsMatchRow> & { id: string }): StatsMatchRow {
  return {
    date: "2026-01-01T00:00:00.000Z",
    surface: "hard",
    ...overrides,
  };
}

// ── Empty input ──────────────────────────────────────────────────────────────
describe("computeAggregateStats — empty input", () => {
  const stats = computeAggregateStats([]);

  it("reports zero matches without inventing results", () => {
    expect(stats.matchesPlayed).toBe(0);
    expect(stats.resultsRecorded).toBe(0);
    expect(stats.wins).toBeNull();
    expect(stats.losses).toBeNull();
    expect(stats.winRatePct).toBeNull();
  });

  it("returns null (not 0) for every derived metric", () => {
    expect(stats.serve.firstServePct.value).toBeNull();
    expect(stats.serve.firstServeWonPct.value).toBeNull();
    expect(stats.serve.secondServeWonPct.value).toBeNull();
    expect(stats.serve.aces.value).toBeNull();
    expect(stats.serve.doubleFaults.value).toBeNull();
    expect(stats.returnGame.returnPointsWonPct.value).toBeNull();
    expect(stats.breakPoints.conversionPct.value).toBeNull();
    expect(stats.breakPoints.savePct.value).toBeNull();
    expect(stats.rally.winners.value).toBeNull();
    expect(stats.rally.unforcedErrors.value).toBeNull();
    expect(stats.rally.winnerToUnforcedRatio.value).toBeNull();
    expect(stats.rally.netPointsWonPct.value).toBeNull();
  });

  it("has no surfaces, no dates and an empty recent form", () => {
    expect(stats.surfaces).toEqual([]);
    expect(stats.firstMatchDate).toBeNull();
    expect(stats.lastMatchDate).toBeNull();
    expect(stats.recentForm).toEqual({
      sampleSize: 0,
      wins: null,
      losses: null,
      winRatePct: null,
      matches: [],
    });
  });

  it("emptyAggregateStats() is the same honest zero-state", () => {
    expect(emptyAggregateStats()).toEqual(stats);
  });
});

// ── Missing counts must stay null, never 0 / NaN ─────────────────────────────
describe("computeAggregateStats — missing counts", () => {
  it("keeps every serve/return metric null when only the result was logged", () => {
    const stats = computeAggregateStats([
      row({ id: "m1", result: "win" }),
      row({ id: "m2", result: "loss" }),
    ]);

    // Win/loss IS real data — it was entered.
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRatePct).toBe(50);

    // …but nothing else was, so nothing else may show a number.
    expect(stats.serve.firstServePct).toEqual({ value: null, sample: 0 });
    expect(stats.serve.aces).toEqual({ value: null, sample: 0 });
    expect(stats.returnGame.returnPointsWonPct.value).toBeNull();
    expect(stats.rally.winnerToUnforcedRatio.value).toBeNull();
  });

  it("treats null and undefined counts identically as 'not entered'", () => {
    const stats = computeAggregateStats([
      row({ id: "m1", firstServeAttempts: null, firstServesIn: undefined }),
    ]);
    expect(stats.serve.firstServePct.value).toBeNull();
    expect(stats.serve.firstServePct.sample).toBe(0);
  });

  it("ignores a half-recorded pair (numerator without denominator)", () => {
    const stats = computeAggregateStats([row({ id: "m1", firstServesIn: 30 })]);
    expect(stats.serve.firstServePct.value).toBeNull();
    // The raw total is still honest — 30 first serves in WAS entered.
    expect(stats.rally.winners.value).toBeNull();
  });

  it("never divides by zero: 0 break points faced ⇒ null, not 0%", () => {
    const stats = computeAggregateStats([
      row({ id: "m1", breakPointsFaced: 0, breakPointsSaved: 0 }),
    ]);
    expect(stats.breakPoints.savePct.value).toBeNull();
    expect(stats.breakPoints.savePct.sample).toBe(0);
    expect(Number.isNaN(stats.breakPoints.savePct.value as unknown as number)).toBe(false);
  });

  it("never yields Infinity: winners with zero unforced errors ⇒ null ratio", () => {
    const stats = computeAggregateStats([
      row({ id: "m1", winners: 12, unforcedErrors: 0 }),
    ]);
    expect(stats.rally.winnerToUnforcedRatio.value).toBeNull();
    // The underlying counts are still reported as entered.
    expect(stats.rally.winners.value).toBe(12);
    expect(stats.rally.unforcedErrors.value).toBe(0);
  });

  it("rejects negative / non-finite counts as missing rather than trusting them", () => {
    const stats = computeAggregateStats([
      row({ id: "m1", aces: -3, doubleFaults: Number.NaN }),
    ]);
    expect(stats.serve.aces.value).toBeNull();
    expect(stats.serve.doubleFaults.value).toBeNull();
  });

  it("reports wins/losses as null when no result was recorded at all", () => {
    const stats = computeAggregateStats([
      row({ id: "m1" }),
      row({ id: "m2", result: null }),
      row({ id: "m3", result: "retired" }), // not win|loss ⇒ not counted
    ]);
    expect(stats.matchesPlayed).toBe(3);
    expect(stats.resultsRecorded).toBe(0);
    expect(stats.wins).toBeNull();
    expect(stats.losses).toBeNull();
    expect(stats.winRatePct).toBeNull();
  });
});

// ── Known numbers ────────────────────────────────────────────────────────────
describe("computeAggregateStats — known numbers", () => {
  const rows: StatsMatchRow[] = [
    row({
      id: "m1",
      date: "2026-03-01T10:00:00.000Z",
      surface: "clay",
      result: "win",
      firstServeAttempts: 60,
      firstServesIn: 36,
      firstServePointsWon: 27,
      secondServePlayed: 24,
      secondServePointsWon: 12,
      aces: 4,
      doubleFaults: 3,
      returnPointsPlayed: 50,
      returnPointsWon: 20,
      winners: 20,
      forcedErrors: 8,
      unforcedErrors: 10,
      breakPointsCreated: 8,
      breakPointsConverted: 3,
      breakPointsFaced: 6,
      breakPointsSaved: 4,
      netApproaches: 10,
      netPointsWon: 7,
    }),
    row({
      id: "m2",
      date: "2026-03-08T10:00:00.000Z",
      surface: "clay",
      result: "loss",
      firstServeAttempts: 40,
      firstServesIn: 24,
      firstServePointsWon: 15,
      secondServePlayed: 16,
      secondServePointsWon: 6,
      aces: 2,
      doubleFaults: 5,
      returnPointsPlayed: 50,
      returnPointsWon: 15,
      winners: 10,
      forcedErrors: 4,
      unforcedErrors: 15,
      breakPointsCreated: 4,
      breakPointsConverted: 0,
      breakPointsFaced: 4,
      breakPointsSaved: 1,
      netApproaches: 6,
      netPointsWon: 2,
    }),
  ];
  const stats = computeAggregateStats(rows);

  it("counts matches and W-L from the recorded results", () => {
    expect(stats.matchesPlayed).toBe(2);
    expect(stats.resultsRecorded).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRatePct).toBe(50);
  });

  it("pools serve percentages over summed counts", () => {
    // (36 + 24) / (60 + 40) = 60%
    expect(stats.serve.firstServePct).toEqual({ value: 60, sample: 2 });
    // (27 + 15) / (36 + 24) = 70%
    expect(stats.serve.firstServeWonPct).toEqual({ value: 70, sample: 2 });
    // (12 + 6) / (24 + 16) = 45%
    expect(stats.serve.secondServeWonPct).toEqual({ value: 45, sample: 2 });
    expect(stats.serve.aces).toEqual({ value: 6, sample: 2 });
    expect(stats.serve.doubleFaults).toEqual({ value: 8, sample: 2 });
  });

  it("pools return, break-point and rally metrics", () => {
    // (20 + 15) / (50 + 50) = 35%
    expect(stats.returnGame.returnPointsWonPct).toEqual({ value: 35, sample: 2 });
    // (3 + 0) / (8 + 4) = 25%
    expect(stats.breakPoints.conversionPct).toEqual({ value: 25, sample: 2 });
    // (4 + 1) / (6 + 4) = 50%
    expect(stats.breakPoints.savePct).toEqual({ value: 50, sample: 2 });
    expect(stats.rally.winners).toEqual({ value: 30, sample: 2 });
    expect(stats.rally.forcedErrors).toEqual({ value: 12, sample: 2 });
    expect(stats.rally.unforcedErrors).toEqual({ value: 25, sample: 2 });
    // 30 / 25 = 1.2
    expect(stats.rally.winnerToUnforcedRatio).toEqual({ value: 1.2, sample: 2 });
    // (7 + 2) / (10 + 6) = 56.25 → 56.3 (1 dp)
    expect(stats.rally.netPointsWonPct).toEqual({ value: 56.3, sample: 2 });
  });

  it("rounds percentages to one decimal and ratios to two", () => {
    // 1 first serve in of 3 attempts = 33.333… → 33.3
    const odd = computeAggregateStats([
      row({ id: "x", firstServeAttempts: 3, firstServesIn: 1, winners: 10, unforcedErrors: 3 }),
    ]);
    expect(odd.serve.firstServePct.value).toBe(33.3);
    // 10 / 3 = 3.333… → 3.33
    expect(odd.rally.winnerToUnforcedRatio.value).toBe(3.33);
  });

  it("only pools matches that recorded both sides of the fraction", () => {
    const mixed = computeAggregateStats([
      rows[0],
      row({ id: "m3", surface: "clay", result: "win" }), // no counts at all
    ]);
    // Unchanged from the single populated match: 36/60 = 60%
    expect(mixed.serve.firstServePct).toEqual({ value: 60, sample: 1 });
    expect(mixed.matchesPlayed).toBe(2);
  });

  it("exposes the match date range", () => {
    expect(stats.firstMatchDate).toBe("2026-03-01T10:00:00.000Z");
    expect(stats.lastMatchDate).toBe("2026-03-08T10:00:00.000Z");
  });
});

// ── Surface splits ───────────────────────────────────────────────────────────
describe("computeAggregateStats — surface splits", () => {
  const stats = computeAggregateStats([
    row({ id: "c1", surface: "clay", result: "win" }),
    row({ id: "c2", surface: "clay", result: "win" }),
    row({ id: "c3", surface: "clay", result: "loss" }),
    row({ id: "h1", surface: "hard", result: "loss" }),
    row({ id: "g1", surface: "grass" }), // played, result not recorded
  ]);

  it("splits per surface, largest sample first", () => {
    expect(stats.surfaces.map((s) => s.surface)).toEqual(["clay", "grass", "hard"]);
    expect(stats.surfaces[0]).toEqual({
      surface: "clay",
      matches: 3,
      resultsRecorded: 3,
      wins: 2,
      losses: 1,
      winRatePct: 66.7,
    });
  });

  it("does not invent a win rate for a surface with no recorded result", () => {
    const grass = stats.surfaces.find((s) => s.surface === "grass");
    expect(grass).toEqual({
      surface: "grass",
      matches: 1,
      resultsRecorded: 0,
      wins: null,
      losses: null,
      winRatePct: null,
    });
  });

  it("keeps surface tallies consistent with the overall totals", () => {
    const summedMatches = stats.surfaces.reduce((acc, s) => acc + s.matches, 0);
    expect(summedMatches).toBe(stats.matchesPlayed);
    expect(stats.resultsRecorded).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(2);
    expect(stats.winRatePct).toBe(50);
  });
});

// ── Recent form ──────────────────────────────────────────────────────────────
describe("computeAggregateStats — recent form", () => {
  const many: StatsMatchRow[] = [
    row({ id: "a", date: "2026-01-01T00:00:00.000Z", result: "loss" }),
    row({ id: "b", date: "2026-02-01T00:00:00.000Z", result: "loss" }),
    row({ id: "c", date: "2026-03-01T00:00:00.000Z", result: "win" }),
    row({ id: "d", date: "2026-04-01T00:00:00.000Z", result: "win" }),
    row({ id: "e", date: "2026-05-01T00:00:00.000Z", result: "win" }),
    row({ id: "f", date: "2026-06-01T00:00:00.000Z", result: "win" }),
  ];

  it("takes the last N matches, newest first", () => {
    const stats = computeAggregateStats(many);
    expect(stats.recentForm.sampleSize).toBe(DEFAULT_RECENT_COUNT);
    expect(stats.recentForm.matches.map((m) => m.id)).toEqual(["f", "e", "d", "c", "b"]);
    expect(stats.recentForm.wins).toBe(4);
    expect(stats.recentForm.losses).toBe(1);
    expect(stats.recentForm.winRatePct).toBe(80);
  });

  it("honours a custom window", () => {
    const stats = computeAggregateStats(many, { recentCount: 2 });
    expect(stats.recentForm.matches.map((m) => m.id)).toEqual(["f", "e"]);
    expect(stats.recentForm.winRatePct).toBe(100);
  });

  it("accepts Date objects as well as ISO strings", () => {
    const stats = computeAggregateStats([
      row({ id: "old", date: new Date("2026-01-01T00:00:00.000Z"), result: "loss" }),
      row({ id: "new", date: new Date("2026-07-01T00:00:00.000Z"), result: "win" }),
    ]);
    expect(stats.recentForm.matches[0].id).toBe("new");
    expect(stats.recentForm.matches[0].date).toBe("2026-07-01T00:00:00.000Z");
  });

  it("does not fabricate form when results were not recorded", () => {
    const stats = computeAggregateStats([row({ id: "a" }), row({ id: "b" })]);
    expect(stats.recentForm.sampleSize).toBe(2);
    expect(stats.recentForm.wins).toBeNull();
    expect(stats.recentForm.winRatePct).toBeNull();
    expect(stats.recentForm.matches.every((m) => m.result === null)).toBe(true);
  });
});

// ── Per-match computed stats ─────────────────────────────────────────────────
describe("computeMatchStats", () => {
  it("computes every percentage from the entered counts", () => {
    const computed = computeMatchStats(
      row({
        id: "m1",
        firstServeAttempts: 50,
        firstServesIn: 30,
        firstServePointsWon: 21,
        secondServePlayed: 20,
        secondServePointsWon: 9,
        returnPointsPlayed: 40,
        returnPointsWon: 18,
        breakPointsCreated: 5,
        breakPointsConverted: 2,
        breakPointsFaced: 4,
        breakPointsSaved: 3,
        netApproaches: 8,
        netPointsWon: 6,
        winners: 15,
        forcedErrors: 5,
        unforcedErrors: 12,
      }),
    );
    expect(computed.firstServePct).toBe(60);
    expect(computed.firstServeWonPct).toBe(70);
    expect(computed.secondServeWonPct).toBe(45);
    expect(computed.returnPointsWonPct).toBe(45);
    expect(computed.breakPointConversionPct).toBe(40);
    expect(computed.breakPointSavePct).toBe(75);
    expect(computed.netPointsWonPct).toBe(75);
    expect(computed.totalWinners).toBe(15);
    expect(computed.totalErrors).toBe(17);
    expect(computed.winnerToUnforcedRatio).toBe(1.25);
  });

  it("omits every field when no counts were entered", () => {
    expect(computeMatchStats(row({ id: "bare" }))).toEqual({});
  });

  it("omits only the uncomputable fields for a partially-filled match", () => {
    const computed = computeMatchStats(row({ id: "m", aces: 3, winners: 9, unforcedErrors: 3 }));
    expect(computed).toEqual({ totalWinners: 9, winnerToUnforcedRatio: 3 });
    expect(computed.firstServePct).toBeUndefined();
  });

  it("does not report a total error count when only one half was counted", () => {
    // Unforced errors counted, forced errors not — a "total" would imply 0 forced.
    expect(computeMatchStats(row({ id: "m", unforcedErrors: 12 })).totalErrors).toBeUndefined();
    expect(computeMatchStats(row({ id: "m", forcedErrors: 4, unforcedErrors: 12 })).totalErrors).toBe(16);
  });
});
