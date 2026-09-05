// ============================================================================
// Unit tests — money engine.
//
// The rules that matter most here are the ones about NOT doing things: not
// adding currencies together, not counting a restring twice, not matching a
// cost to the wrong tournament, not producing a per-hour figure from sessions
// that have not happened.
// ============================================================================

import { describe, it, expect } from "vitest";
import { analyseMoney, trueTournamentCosts, stringingRate, windowFor, MAX_INSIGHTS, WINDOW_DAYS } from "./money";
import {
  moneyInput,
  NOW,
  P1_ENTRIES,
  P1_TOURNAMENTS,
  P1_SETUPS,
  PAST_TRAININGS,
  PRICED_SETUPS,
  TRAVEL_HEAVY_ENTRIES,
  TRAVEL_HEAVY_TOURNAMENTS,
  MATCHING_TOURNAMENT,
  MATCHING_ENTRIES,
} from "./__fixtures__/money";

const codes = (r: { reasons: { code: string }[] }) => r.reasons.map((x) => x.code);

describe("analyseMoney — windows", () => {
  it("uses rolling 30 / 182 / 365-day windows with an equal previous window, and says so", () => {
    expect(WINDOW_DAYS).toEqual({ month: 30, season: 182, year: 365 });
    const w = windowFor(NOW, "month");
    expect(w).toEqual({ kind: "month", days: 30, from: "2026-08-05T12:00:00.000Z", to: NOW, previousFrom: "2026-07-06T12:00:00.000Z" });
    const r = analyseMoney(moneyInput({ window: "season" }));
    expect(r.window.days).toBe(182);
    expect(r.window.from).toBe(windowFor(NOW, "season").from);
    expect(codes(r)).toContain("window");
  });
});

describe("analyseMoney — empty history", () => {
  it("returns a graceful empty result with low confidence and a raisedBy about logging", () => {
    const r = analyseMoney(moneyInput({ entries: [], tournaments: [], setups: [], trainings: [] }));
    expect(r.headline).toBeNull();
    expect(r.otherCurrencies).toEqual([]);
    expect(r.tournaments).toEqual([]);
    expect(r.costPerTrainingHour).toBeNull();
    expect(r.stringingPerHour).toBeNull();
    expect(r.insights).toEqual([]);
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.raisedBy).toMatch(/Log your expenses/);
    expect(codes(r)).toContain("no_entries");
  });

  it("treats a window with no entries as empty even when older rows exist", () => {
    const r = analyseMoney(moneyInput({ now: "2026-12-01T00:00:00.000Z" }));
    expect(r.headline).toBeNull();
    expect(r.confidence.level).toBe("low");
  });
});

describe("analyseMoney — per currency, never converted", () => {
  it("over a year, EUR (3 entries) is the headline and USD (3 entries) is listed separately — tie broken alphabetically", () => {
    const r = analyseMoney(moneyInput({ window: "year" }));
    expect(r.headline!.currency).toBe("EUR");
    expect(r.headline!.entries).toBe(3);
    expect(r.headline!.total).toBe(573); // 28 + 95 + 450
    expect(r.headline!.byCategory).toEqual({ coaching: 450, stringing: 28, tournament_fee: 95 });
    expect(r.otherCurrencies).toHaveLength(1);
    expect(r.otherCurrencies[0]).toMatchObject({ currency: "USD", entries: 3, total: 1660 });
    expect(codes(r)).toContain("other_currencies_separate");
  });

  it("never produces a figure that adds the two currencies together", () => {
    const r = analyseMoney(moneyInput({ window: "year" }));
    const text = JSON.stringify(r);
    expect(text).not.toContain("2233"); // 573 + 1660
    for (const n of [r.headline!.total, ...r.otherCurrencies.map((c) => c.total)]) expect(n).toBeLessThan(2233);
  });

  it("in the 30-day window only the two August EUR rows count, so USD does not appear at all", () => {
    const r = analyseMoney(moneyInput({ window: "month" }));
    expect(r.headline!.currency).toBe("EUR");
    expect(r.headline!.total).toBe(123); // 28 stringing + 95 fee; the 1 Aug coaching row is just outside a window opening 5 Aug
    expect(r.otherCurrencies).toEqual([]);
    // The previous 30 days hold the coaching row (EUR) and one USD row — reported per currency.
    expect(r.headline!.previousTotal).toBe(450);
    expect(r.headline!.previousByCategory).toEqual({ coaching: 450 });
  });

  it("the previous window is reported per currency too", () => {
    const r = analyseMoney(moneyInput({ entries: TRAVEL_HEAVY_ENTRIES, tournaments: TRAVEL_HEAVY_TOURNAMENTS }));
    expect(r.headline!.previousTotal).toBe(450);
    expect(r.headline!.previousByCategory).toEqual({ coaching: 200, travel: 250 });
  });
});

describe("analyseMoney — true cost of a tournament", () => {
  it("matches by tournamentId first (even when dated months away), then by date window; never a row linked elsewhere", () => {
    const [t] = trueTournamentCosts(MATCHING_ENTRIES, [MATCHING_TOURNAMENT]);
    expect(t.matched).toEqual({ byTournamentId: 1, byDateWindow: 3 });
    const eur = t.byCurrency.find((c) => c.currency === "EUR")!;
    expect(eur.total).toBe(165); // 50 fee (by id) + 35 food + 80 travel (by date)
    expect(eur.byCategory).toEqual({ food: 35, tournament_fee: 50, travel: 80 });
    const usd = t.byCurrency.find((c) => c.currency === "USD")!;
    expect(usd.total).toBe(100);
    // m-4 (linked to t-other), m-5 (membership) and m-6 (outside the dates) are excluded.
    expect(JSON.stringify(t)).not.toContain("999");
    expect(eur.total + usd.total).not.toBe(165 + 100 + 120);
  });

  it("p1: the AO fee logged in August is attributed to the January event by id; the unlinked July flight lands on Wimbledon by date, and is labelled as such", () => {
    const r = analyseMoney(moneyInput({ window: "year" }));
    expect(r.tournaments.map((t) => t.tournamentId)).toEqual(["wimbledon-2026", "australian-open-2026"]);
    const ao = r.tournaments[1];
    expect(ao.matched).toEqual({ byTournamentId: 1, byDateWindow: 0 });
    expect(ao.byCurrency).toEqual([{ currency: "EUR", total: 95, byCategory: { tournament_fee: 95 }, entries: 1 }]);
    // "Flight to Melbourne", dated 5 July with no tournamentId, falls inside Wimbledon's dates. The
    // by-date rule attaches it — and `matched.byDateWindow` tells the UI it was inferred, not stated.
    const wim = r.tournaments[0];
    expect(wim.matched).toEqual({ byTournamentId: 0, byDateWindow: 1 });
    expect(wim.byCurrency).toEqual([{ currency: "USD", total: 640, byCategory: { travel: 640 }, entries: 1 }]);
    expect(codes(r)).toContain("tournament_costs_matched");
  });

  it("orders tournaments newest first", () => {
    const r = analyseMoney(moneyInput({ entries: TRAVEL_HEAVY_ENTRIES, tournaments: TRAVEL_HEAVY_TOURNAMENTS }));
    expect(r.tournaments.map((t) => t.tournamentId)).toEqual(["t-far", "t-near"]);
  });
});

describe("analyseMoney — cost per training hour", () => {
  it("is null when the only trainings are in the future, and says so", () => {
    const r = analyseMoney(moneyInput({ window: "year" }));
    expect(r.costPerTrainingHour).toBeNull();
    expect(codes(r)).toContain("training_hours_none");
  });

  it("divides headline-currency training + coaching by completed hours in the window", () => {
    const r = analyseMoney(moneyInput({ window: "season", trainings: PAST_TRAININGS }));
    // 450 EUR coaching over 2 + 1.5 + 1 = 4.5 h.
    expect(r.costPerTrainingHour).toEqual({ currency: "EUR", cost: 450, hours: 4.5, sessions: 3, perHour: 100 });
  });

  it("does not mix the USD training row into a EUR per-hour figure", () => {
    const r = analyseMoney(moneyInput({ window: "year", trainings: PAST_TRAININGS }));
    expect(r.costPerTrainingHour!.currency).toBe("EUR");
    expect(r.costPerTrainingHour!.cost).toBe(450);
  });
});

describe("analyseMoney — stringing per hour of play", () => {
  it("prefers string jobs that carry both a cost and hours, ignoring jobs without a cost", () => {
    const rate = stringingRate(PRICED_SETUPS, [])!;
    expect(rate).toEqual({ currency: "EUR", cost: 55, hours: 35, jobs: 2, perHour: 1.57, source: "setups" });
  });

  it("falls back to finance stringing rows over all logged hours when no job carries a cost — never both", () => {
    const rate = stringingRate(P1_SETUPS, P1_ENTRIES)!;
    expect(rate).toEqual({ currency: "EUR", cost: 28, hours: 42, jobs: 3, perHour: 0.67, source: "finance" });
    const both = stringingRate(PRICED_SETUPS, P1_ENTRIES)!;
    expect(both.source).toBe("setups");
    expect(both.cost).toBe(55); // the 28 EUR finance row is NOT added on top
  });

  it("is null with no usable data and explains itself when jobs exist", () => {
    expect(stringingRate([], [])).toBeNull();
    const r = analyseMoney(moneyInput({ entries: P1_ENTRIES.filter((e) => e.category !== "stringing"), setups: P1_SETUPS }));
    expect(r.stringingPerHour).toBeNull();
    expect(codes(r)).toContain("stringing_rate_unknown");
  });
});

describe("analyseMoney — insights", () => {
  const r = analyseMoney(moneyInput({ entries: TRAVEL_HEAVY_ENTRIES, tournaments: TRAVEL_HEAVY_TOURNAMENTS, setups: PRICED_SETUPS }));

  it("never returns more than three, in a fixed priority order", () => {
    expect(r.insights.length).toBeLessThanOrEqual(MAX_INSIGHTS);
    expect(r.insights.map((i) => i.code)).toEqual(["travel_share", "category_doubled", "stringing_per_hour"]);
  });

  it("travel share quotes the share and the cheapest-vs-average trip from real rows", () => {
    const i = r.insights.find((x) => x.code === "travel_share")!;
    // 300+120+700+400 = 1520 of 2010 → 76%.
    expect(i.headlineNumber).toBe(76);
    expect(i.currency).toBe("EUR");
    expect(i.params).toMatchObject({ share: 76, travel: 1520, trips: 2, cheapestTrip: 420, averageTrip: 760 });
    expect(i.textEn).toMatch(/cheapest trip cost 420 EUR/);
    expect(i.textEn).not.toMatch(/nearer|closer than/); // no distance data exists to say "nearer"
  });

  it("category doubled compares against the previous window in the same currency and picks the biggest jump", () => {
    // Both coaching (200 → 400) and travel (250 → 1000) at least doubled; travel grew by more.
    const i = r.insights.find((x) => x.code === "category_doubled")!;
    expect(i.params).toMatchObject({ category: "travel", now: 1000, previous: 250, ratio: 4 });
  });

  it("with fewer triggers, later insights (most expensive tournament) get through", () => {
    const calm = analyseMoney(moneyInput({ entries: TRAVEL_HEAVY_ENTRIES.filter((e) => !e.tournamentId?.includes("far") && e.id !== "p-1"), tournaments: TRAVEL_HEAVY_TOURNAMENTS }));
    const codesOut = calm.insights.map((i) => i.code);
    expect(codesOut).toContain("most_expensive_tournament");
    expect(codesOut).not.toContain("category_doubled");
    expect(calm.insights.find((i) => i.code === "most_expensive_tournament")!.params.name).toBe("Club Open");
  });

  it("p1 over a year: no insight invents a saving, and every insight is in one currency", () => {
    const p1 = analyseMoney(moneyInput({ window: "year" }));
    for (const i of p1.insights) expect(["EUR", "USD"]).toContain(i.currency);
    expect(JSON.stringify(p1.insights)).not.toMatch(/budget|invest|tax|debt|loan/i);
  });
});

describe("analyseMoney — confidence and hygiene", () => {
  it("is medium with a few entries and names how many more make it high", () => {
    const r = analyseMoney(moneyInput({ window: "month" }));
    expect(r.confidence.level).toBe("medium");
    expect(r.confidence.raisedBy).toBe("Log 8 more expenses in this window and this becomes high.");
  });

  it("is high with ten or more entries across more than one category", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `x-${i}`, category: i % 2 ? "coaching" : "travel", amount: 10, currency: "EUR", date: "2026-08-20" }));
    expect(analyseMoney(moneyInput({ entries: many })).confidence.level).toBe("high");
  });

  it("is deterministic and mentions no forbidden advice", () => {
    const input = moneyInput({ entries: TRAVEL_HEAVY_ENTRIES, tournaments: TRAVEL_HEAVY_TOURNAMENTS, setups: PRICED_SETUPS, trainings: PAST_TRAININGS });
    expect(analyseMoney(input)).toEqual(analyseMoney(input));
    expect(JSON.stringify(analyseMoney(input))).not.toMatch(/budget|invest|tax|debt|loan/i);
    expect(P1_TOURNAMENTS).toHaveLength(2);
  });
});
