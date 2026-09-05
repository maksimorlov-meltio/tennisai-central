// ============================================================================
// TennisAI — money engine (deterministic, v1)
//
// What a player's logged expenses say, in plain language: totals by category
// for a window, the true cost of each tournament they entered, what an hour of
// training costs, what stringing costs per hour of play, and up to three
// rule-based insights. Spending and budgeting only — no budget model, no
// what-if, no debt, investment or tax language.
//
// PER CURRENCY, NEVER CONVERTED. Every figure is grouped by the currency it was
// logged in; the headline uses the currency with the most entries in the
// window and the others are listed separately. Adding 800 USD to 450 EUR
// produces a number that is neither, so it is never done.
//
// Pure function. No Prisma, no clock, no network.
// ============================================================================

import { type Confidence, type Reason, daysBetween, reason, round } from "./types";

// ── Inputs ──────────────────────────────────────────────────────────────────

export type MoneyWindowKind = "month" | "season" | "year";

export interface MoneyEntry {
  id: string;
  category: string;
  amount: number;
  currency: string;
  /** "yyyy-MM-dd" or ISO. */
  date: string;
  tournamentId?: string;
}

export interface MoneyTournamentEntry {
  tournamentId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface MoneySetup {
  id: string;
  strungAt: string;
  retiredAt?: string;
  hoursPlayed?: number;
  costEur?: number;
}

/** A training the player took part in. */
export interface MoneyTraining {
  id: string;
  startDate: string;
  endDate: string;
}

export interface MoneyInput {
  now: string;
  window: MoneyWindowKind;
  entries: MoneyEntry[];
  tournaments: MoneyTournamentEntry[];
  setups: MoneySetup[];
  trainings: MoneyTraining[];
}

// ── Output ──────────────────────────────────────────────────────────────────

export interface CurrencyTotals {
  currency: string;
  entries: number;
  total: number;
  byCategory: Record<string, number>;
  /** The window of equal length immediately before this one. */
  previousTotal: number;
  previousByCategory: Record<string, number>;
}

export interface TournamentCost {
  tournamentId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  byCurrency: Array<{ currency: string; total: number; byCategory: Record<string, number>; entries: number }>;
  matched: { byTournamentId: number; byDateWindow: number };
}

export interface Insight {
  code: string;
  params: Record<string, string | number | boolean>;
  textEn: string;
  headlineNumber: number;
  currency: string;
}

export interface MoneyRecommendation {
  window: { kind: MoneyWindowKind; days: number; from: string; to: string; previousFrom: string };
  headline: CurrencyTotals | null;
  otherCurrencies: CurrencyTotals[];
  tournaments: TournamentCost[];
  costPerTrainingHour: { currency: string; cost: number; hours: number; sessions: number; perHour: number } | null;
  stringingPerHour: { currency: "EUR"; cost: number; hours: number; jobs: number; perHour: number; source: "setups" | "finance" } | null;
  /** At most three. */
  insights: Insight[];
  reasons: Reason[];
  confidence: Confidence;
}

// ── Constants (each is a documented rule threshold) ─────────────────────────

export const WINDOW_DAYS: Record<MoneyWindowKind, number> = { month: 30, season: 182, year: 365 };
export const MAX_INSIGHTS = 3;
/** Categories that can be part of a tournament's true cost when matched by date. */
export const TOURNAMENT_COST_CATEGORIES = ["tournament", "tournament_fee", "travel", "accommodation", "food", "stringing"] as const;
/** Days either side of the event that still count as "during the tournament". */
export const TOURNAMENT_DATE_SLACK_DAYS = 1;
const TRAINING_COST_CATEGORIES = ["training", "coaching"] as const;
const TRAVEL_CATEGORIES = ["travel", "accommodation", "food"] as const;
/** Share of spend at or above which travel gets an insight. */
export const TRAVEL_SHARE_THRESHOLD = 0.35;
/** Entries in the window needed for medium / high confidence. */
export const CONFIDENCE_MEDIUM_ENTRIES = 1;
export const CONFIDENCE_HIGH_ENTRIES = 10;

// ── Helpers ─────────────────────────────────────────────────────────────────

const ms = (iso: string) => Date.parse(iso);
const addDays = (iso: string, days: number) => new Date(ms(iso) + days * 86_400_000).toISOString();
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
const money = (v: number) => round(v, 2);

function groupByCategory(rows: MoneyEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of [...rows].sort((a, b) => a.category.localeCompare(b.category))) out[r.category] = money((out[r.category] ?? 0) + r.amount);
  return out;
}

function currenciesByEntries(rows: MoneyEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

// ── Engine ──────────────────────────────────────────────────────────────────

export function analyseMoney(input: MoneyInput): MoneyRecommendation {
  const reasons: Reason[] = [];
  const days = WINDOW_DAYS[input.window];
  const to = input.now;
  const from = addDays(to, -days);
  const previousFrom = addDays(from, -days);
  const window = { kind: input.window, days, from, to, previousFrom };

  const inWindow = (e: MoneyEntry) => ms(e.date) >= ms(from) && ms(e.date) <= ms(to);
  const inPrevious = (e: MoneyEntry) => ms(e.date) >= ms(previousFrom) && ms(e.date) < ms(from);
  const current = input.entries.filter(inWindow);
  const previous = input.entries.filter(inPrevious);

  reasons.push(
    reason(
      "window",
      { kind: input.window, days, from: from.slice(0, 10), to: to.slice(0, 10) },
      `A rolling ${days}-day window (${from.slice(0, 10)} to ${to.slice(0, 10)}), compared with the ${days} days before it.`,
    ),
  );

  // ── Totals per currency ───────────────────────────────────────────────────
  const currencies = currenciesByEntries(current);
  const totalsFor = (currency: string): CurrencyTotals => {
    const rows = current.filter((e) => e.currency === currency);
    const prev = previous.filter((e) => e.currency === currency);
    return {
      currency,
      entries: rows.length,
      total: money(sum(rows.map((e) => e.amount))),
      byCategory: groupByCategory(rows),
      previousTotal: money(sum(prev.map((e) => e.amount))),
      previousByCategory: groupByCategory(prev),
    };
  };
  const headline = currencies.length ? totalsFor(currencies[0]) : null;
  const otherCurrencies = currencies.slice(1).map(totalsFor);

  if (!headline) {
    reasons.push(reason("no_entries", {}, `No expenses are logged in the last ${days} days.`));
  } else {
    reasons.push(
      reason(
        "headline_currency",
        { currency: headline.currency, entries: headline.entries, total: headline.total },
        `${headline.entries} of ${current.length} entries are in ${headline.currency}, so ${headline.currency} is the headline: ${headline.total} ${headline.currency} in the window.`,
      ),
    );
    if (otherCurrencies.length) {
      reasons.push(
        reason(
          "other_currencies_separate",
          { currencies: otherCurrencies.map((c) => c.currency).join(",") },
          `Entries in ${otherCurrencies.map((c) => `${c.currency} (${c.total})`).join(", ")} are listed separately — amounts in different currencies are never added together.`,
        ),
      );
    }
  }

  // ── True cost of each entered tournament ──────────────────────────────────
  const tournaments = trueTournamentCosts(input.entries, input.tournaments);
  if (input.tournaments.length && tournaments.length === 0) {
    reasons.push(reason("tournament_costs_none", { entered: input.tournaments.length }, "None of your tournament entries has an expense logged against it yet — link costs to the event when you add them."));
  } else if (tournaments.length) {
    const byId = sum(tournaments.map((t) => t.matched.byTournamentId));
    const byDate = sum(tournaments.map((t) => t.matched.byDateWindow));
    reasons.push(
      reason(
        "tournament_costs_matched",
        { tournaments: tournaments.length, byTournamentId: byId, byDateWindow: byDate },
        `${tournaments.length} tournament${tournaments.length === 1 ? "" : "s"} have costs: ${byId} row${byId === 1 ? "" : "s"} linked to the event directly, ${byDate} matched only because they fall within its dates.`,
      ),
    );
  }

  // ── Cost per training hour (headline currency, past sessions in the window) ─
  let costPerTrainingHour: MoneyRecommendation["costPerTrainingHour"] = null;
  const pastTrainings = input.trainings.filter((t) => ms(t.endDate) <= ms(to) && ms(t.endDate) >= ms(from));
  const trainingHours = sum(pastTrainings.map((t) => Math.max(0, (ms(t.endDate) - ms(t.startDate)) / 3_600_000)));
  if (headline) {
    const trainingCost = sum(current.filter((e) => e.currency === headline.currency && (TRAINING_COST_CATEGORIES as readonly string[]).includes(e.category)).map((e) => e.amount));
    if (trainingHours > 0 && trainingCost > 0) {
      costPerTrainingHour = {
        currency: headline.currency,
        cost: money(trainingCost),
        hours: round(trainingHours, 1),
        sessions: pastTrainings.length,
        perHour: money(trainingCost / trainingHours),
      };
      reasons.push(
        reason(
          "cost_per_training_hour",
          { currency: headline.currency, cost: costPerTrainingHour.cost, hours: costPerTrainingHour.hours, sessions: pastTrainings.length, perHour: costPerTrainingHour.perHour },
          `${costPerTrainingHour.cost} ${headline.currency} of training and coaching over ${costPerTrainingHour.hours} h in ${pastTrainings.length} completed session${pastTrainings.length === 1 ? "" : "s"} — about ${costPerTrainingHour.perHour} ${headline.currency} per hour.`,
        ),
      );
    } else if (trainingCost > 0) {
      reasons.push(reason("training_hours_none", { currency: headline.currency, cost: money(trainingCost) }, `Training and coaching costs are logged (${money(trainingCost)} ${headline.currency}) but no completed training sessions fall in the window, so there is no per-hour figure.`));
    }
  }

  // ── Stringing per hour of play ────────────────────────────────────────────
  const stringingPerHour = stringingRate(input.setups, input.entries);
  if (stringingPerHour) {
    reasons.push(
      reason(
        "stringing_per_hour",
        { cost: stringingPerHour.cost, hours: stringingPerHour.hours, jobs: stringingPerHour.jobs, perHour: stringingPerHour.perHour, source: stringingPerHour.source },
        stringingPerHour.source === "setups"
          ? `${stringingPerHour.jobs} string job${stringingPerHour.jobs === 1 ? "" : "s"} with a cost and hours logged: ${stringingPerHour.cost} EUR over ${stringingPerHour.hours} h — about ${stringingPerHour.perHour} EUR per hour of play.`
          : `No string job carries a cost, so the ${stringingPerHour.cost} EUR of stringing expenses is spread over the ${stringingPerHour.hours} h logged on ${stringingPerHour.jobs} string job${stringingPerHour.jobs === 1 ? "" : "s"} — about ${stringingPerHour.perHour} EUR per hour of play.`,
      ),
    );
  } else if (input.setups.length) {
    reasons.push(reason("stringing_rate_unknown", { jobs: input.setups.length }, "String jobs are logged but without both a cost and hours played, so stringing cost per hour cannot be worked out."));
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  const insights = headline ? buildInsights(headline, current, tournaments, stringingPerHour) : [];

  return {
    window,
    headline,
    otherCurrencies,
    tournaments,
    costPerTrainingHour,
    stringingPerHour,
    insights,
    reasons,
    confidence: confidenceFor(current.length, headline ? Object.keys(headline.byCategory).length : 0, days),
  };
}

// ── Tournament true cost ────────────────────────────────────────────────────

/**
 * Rows are matched to a tournament by `tournamentId` FIRST — a flight booked
 * two months early belongs to the event it was booked for. Rows with no
 * tournamentId are matched by date only when they fall within the event's
 * dates (± one day) and are in a category a tournament can plausibly incur. A
 * row linked to ANY tournament is never matched by date to another one.
 */
export function trueTournamentCosts(entries: MoneyEntry[], tournaments: MoneyTournamentEntry[]): TournamentCost[] {
  const out: TournamentCost[] = [];
  for (const t of tournaments) {
    const byId = entries.filter((e) => e.tournamentId === t.tournamentId);
    const lo = ms(addDays(t.startDate, -TOURNAMENT_DATE_SLACK_DAYS));
    const hi = ms(addDays(t.endDate, TOURNAMENT_DATE_SLACK_DAYS));
    const byDate = entries.filter(
      (e) => !e.tournamentId && (TOURNAMENT_COST_CATEGORIES as readonly string[]).includes(e.category) && ms(e.date) >= lo && ms(e.date) <= hi,
    );
    const rows = [...byId, ...byDate];
    if (rows.length === 0) continue;
    const byCurrency = currenciesByEntries(rows).map((currency) => {
      const cur = rows.filter((e) => e.currency === currency);
      return { currency, total: money(sum(cur.map((e) => e.amount))), byCategory: groupByCategory(cur), entries: cur.length };
    });
    out.push({
      tournamentId: t.tournamentId,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      byCurrency,
      matched: { byTournamentId: byId.length, byDateWindow: byDate.length },
    });
  }
  return out.sort((a, b) => b.startDate.localeCompare(a.startDate) || a.tournamentId.localeCompare(b.tournamentId));
}

// ── Stringing rate ──────────────────────────────────────────────────────────

/**
 * Preferred source: string jobs that carry both a cost and hours. Fallback:
 * finance `stringing` rows in EUR spread over the hours logged on all jobs.
 * The two are never combined — that would count the same restring twice.
 */
export function stringingRate(setups: MoneySetup[], entries: MoneyEntry[]): MoneyRecommendation["stringingPerHour"] {
  const priced = setups.filter((s) => (s.costEur ?? 0) > 0 && (s.hoursPlayed ?? 0) > 0);
  if (priced.length > 0) {
    const cost = sum(priced.map((s) => s.costEur!));
    const hours = sum(priced.map((s) => s.hoursPlayed!));
    return { currency: "EUR", cost: money(cost), hours: round(hours, 1), jobs: priced.length, perHour: money(cost / hours), source: "setups" };
  }
  const withHours = setups.filter((s) => (s.hoursPlayed ?? 0) > 0);
  const hours = sum(withHours.map((s) => s.hoursPlayed!));
  const finance = entries.filter((e) => e.category === "stringing" && e.currency === "EUR");
  const cost = sum(finance.map((e) => e.amount));
  if (hours > 0 && cost > 0) {
    return { currency: "EUR", cost: money(cost), hours: round(hours, 1), jobs: withHours.length, perHour: money(cost / hours), source: "finance" };
  }
  return null;
}

// ── Insights ────────────────────────────────────────────────────────────────

function buildInsights(
  headline: CurrencyTotals,
  current: MoneyEntry[],
  tournaments: TournamentCost[],
  stringing: MoneyRecommendation["stringingPerHour"],
): Insight[] {
  const out: Insight[] = [];
  const cur = headline.currency;
  const rows = current.filter((e) => e.currency === cur);

  // 1. Travel share, with the cheapest logged trip against the average — both from real rows.
  const travel = sum(rows.filter((e) => (TRAVEL_CATEGORIES as readonly string[]).includes(e.category)).map((e) => e.amount));
  if (headline.total > 0 && travel / headline.total >= TRAVEL_SHARE_THRESHOLD) {
    const share = Math.round((travel / headline.total) * 100);
    const trips = tournaments
      .map((t) => t.byCurrency.find((c) => c.currency === cur))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => sum((TRAVEL_CATEGORIES as readonly string[]).map((k) => c.byCategory[k] ?? 0)))
      .filter((v) => v > 0);
    let textEn = `${share}% of your ${cur} spend in this window is travel, accommodation and food (${money(travel)} ${cur}).`;
    const params: Insight["params"] = { share, travel: money(travel), currency: cur };
    if (trips.length >= 2) {
      const cheapest = Math.min(...trips);
      const average = sum(trips) / trips.length;
      params.cheapestTrip = money(cheapest);
      params.averageTrip = money(average);
      params.trips = trips.length;
      textEn += ` Across ${trips.length} tournaments with travel logged, your cheapest trip cost ${money(cheapest)} ${cur} and your average ${money(average)} ${cur} — the gap is what a closer event saves.`;
    }
    out.push({ code: "travel_share", params, textEn, headlineNumber: share, currency: cur });
  }

  // 2. A category that at least doubled against the previous window.
  const doubled = Object.entries(headline.byCategory)
    .map(([cat, now]) => ({ cat, now, prev: headline.previousByCategory[cat] ?? 0 }))
    .filter((x) => x.prev > 0 && x.now >= 2 * x.prev)
    .sort((a, b) => b.now - b.prev - (a.now - a.prev) || a.cat.localeCompare(b.cat))[0];
  if (doubled) {
    const ratio = round(doubled.now / doubled.prev, 1);
    out.push({
      code: "category_doubled",
      params: { category: doubled.cat, now: doubled.now, previous: doubled.prev, ratio, currency: cur },
      textEn: `${doubled.cat.replace(/_/g, " ")} is ${ratio}× the previous window: ${doubled.now} ${cur} against ${doubled.prev} ${cur}.`,
      headlineNumber: ratio,
      currency: cur,
    });
  }

  // 3. Stringing per hour of play.
  if (stringing) {
    out.push({
      code: "stringing_per_hour",
      params: { perHour: stringing.perHour, jobs: stringing.jobs, hours: stringing.hours, cost: stringing.cost },
      textEn: `Stringing costs you about ${stringing.perHour} EUR per hour of play (${stringing.cost} EUR over ${stringing.hours} h, ${stringing.jobs} job${stringing.jobs === 1 ? "" : "s"}).`,
      headlineNumber: stringing.perHour,
      currency: "EUR",
    });
  }

  // 4. The most expensive tournament in the headline currency.
  const priciest = tournaments
    .map((t) => ({ t, c: t.byCurrency.find((c) => c.currency === cur) }))
    .filter((x): x is { t: TournamentCost; c: NonNullable<typeof x.c> } => Boolean(x.c))
    .sort((a, b) => b.c.total - a.c.total || a.t.tournamentId.localeCompare(b.t.tournamentId))[0];
  if (priciest) {
    const cats = Object.entries(priciest.c.byCategory)
      .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
      .join(", ");
    out.push({
      code: "most_expensive_tournament",
      params: { tournamentId: priciest.t.tournamentId, name: priciest.t.name, total: priciest.c.total, currency: cur, entries: priciest.c.entries },
      textEn: `${priciest.t.name} is your most expensive tournament so far: ${priciest.c.total} ${cur} (${cats}).`,
      headlineNumber: priciest.c.total,
      currency: cur,
    });
  }

  // 5. A category that is new this window and already a fifth of the spend.
  const fresh = Object.entries(headline.byCategory)
    .filter(([cat, now]) => !(cat in headline.previousByCategory) && headline.total > 0 && now / headline.total >= 0.2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (fresh) {
    const share = Math.round((fresh[1] / headline.total) * 100);
    out.push({
      code: "new_category",
      params: { category: fresh[0], amount: fresh[1], share, currency: cur },
      textEn: `${fresh[0].replace(/_/g, " ")} is new this window and already ${share}% of your ${cur} spend (${fresh[1]} ${cur}).`,
      headlineNumber: share,
      currency: cur,
    });
  }

  return out.slice(0, MAX_INSIGHTS);
}

// ── Confidence ──────────────────────────────────────────────────────────────

/** The ladder, spelled out so the doc and the code cannot drift. */
export function confidenceFor(entriesInWindow: number, categoriesInHeadline: number, days: number): Confidence {
  if (entriesInWindow === 0) {
    return { level: "low", raisedBy: `Log your expenses as they happen — even a few entries in the last ${days} days give this something to work with.` };
  }
  if (entriesInWindow < CONFIDENCE_HIGH_ENTRIES || categoriesInHeadline < 2) {
    const n = Math.max(0, CONFIDENCE_HIGH_ENTRIES - entriesInWindow);
    return {
      level: "medium",
      raisedBy:
        n > 0
          ? `Log ${n} more expense${n === 1 ? "" : "s"} in this window${categoriesInHeadline < 2 ? ", across more than one category," : ""} and this becomes high.`
          : "Log expenses in more than one category and this becomes high.",
    };
  }
  return { level: "high", raisedBy: "This is as confident as the v1 rules get." };
}

/** Exported for the route's `computedAt`/window echo; kept here so the tests can pin it. */
export function windowFor(now: string, kind: MoneyWindowKind): MoneyRecommendation["window"] {
  const days = WINDOW_DAYS[kind];
  const from = addDays(now, -days);
  return { kind, days, from, to: now, previousFrom: addDays(from, -days) };
}

export { daysBetween };
