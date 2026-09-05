// Fixtures for the money engine. p1's real seeded rows are mirrored so a test
// asserts figures the manager can check against the database, plus synthetic
// rows for the cases the seed does not cover.

import type { MoneyEntry, MoneyInput, MoneySetup, MoneyTournamentEntry, MoneyTraining } from "../money";

export const NOW = "2026-09-04T12:00:00.000Z";

/** p1 as seeded: three legacy USD rows in July, three EUR rows in August, one linked to the AO. */
export const P1_ENTRIES: MoneyEntry[] = [
  { id: "fin-1", category: "training", amount: 800, currency: "USD", date: "2026-07-01" },
  { id: "fin-2", category: "travel", amount: 640, currency: "USD", date: "2026-07-05" },
  { id: "fin-3", category: "equipment", amount: 220, currency: "USD", date: "2026-07-10" },
  { id: "fin-4", category: "stringing", amount: 28, currency: "EUR", date: "2026-08-23" },
  { id: "fin-5", category: "tournament_fee", amount: 95, currency: "EUR", date: "2026-08-30", tournamentId: "australian-open-2026" },
  { id: "fin-6", category: "coaching", amount: 450, currency: "EUR", date: "2026-08-01" },
];

export const P1_TOURNAMENTS: MoneyTournamentEntry[] = [
  { tournamentId: "australian-open-2026", name: "Australian Open", startDate: "2026-01-19T00:00:00.000Z", endDate: "2026-02-01T00:00:00.000Z", status: "registered" },
  { tournamentId: "wimbledon-2026", name: "Wimbledon", startDate: "2026-06-29T00:00:00.000Z", endDate: "2026-07-12T00:00:00.000Z", status: "planned" },
];

/**
 * p1's three jobs by date and hours, but WITHOUT their costs — the real seed
 * prices them at 32 / 27 / 28 EUR. Stripping the cost is what exercises the
 * finance-row fallback; the priced case is PRICED_SETUPS below.
 */
export const P1_SETUPS: MoneySetup[] = [
  { id: "ss-p1-1", strungAt: "2026-05-07T00:00:00.000Z", retiredAt: "2026-05-21T00:00:00.000Z", hoursPlayed: 14 },
  { id: "ss-p1-2", strungAt: "2026-05-27T00:00:00.000Z", retiredAt: "2026-07-04T00:00:00.000Z", hoursPlayed: 22 },
  { id: "ss-p1-3", strungAt: "2026-08-23T00:00:00.000Z", hoursPlayed: 6 },
];

/** Both of p1's seeded trainings are in the FUTURE relative to NOW. */
export const P1_TRAININGS_FUTURE: MoneyTraining[] = [
  { id: "t-seed-1", startDate: "2026-09-05T07:00:00.000Z", endDate: "2026-09-05T09:00:00.000Z" },
  { id: "t-seed-2", startDate: "2026-09-07T14:00:00.000Z", endDate: "2026-09-07T15:00:00.000Z" },
];

export const PAST_TRAININGS: MoneyTraining[] = [
  { id: "t-a", startDate: "2026-08-10T09:00:00.000Z", endDate: "2026-08-10T11:00:00.000Z" },
  { id: "t-b", startDate: "2026-08-17T09:00:00.000Z", endDate: "2026-08-17T10:30:00.000Z" },
  { id: "t-c", startDate: "2026-08-24T09:00:00.000Z", endDate: "2026-08-24T10:00:00.000Z" },
];

/** Setups that DO carry a cost. */
export const PRICED_SETUPS: MoneySetup[] = [
  { id: "s-1", strungAt: "2026-06-01T00:00:00.000Z", retiredAt: "2026-06-20T00:00:00.000Z", hoursPlayed: 15, costEur: 30 },
  { id: "s-2", strungAt: "2026-06-21T00:00:00.000Z", retiredAt: "2026-07-15T00:00:00.000Z", hoursPlayed: 20, costEur: 25 },
  { id: "s-3", strungAt: "2026-07-16T00:00:00.000Z", hoursPlayed: 5 }, // no cost → excluded from the rate
];

/** A busy season in EUR with travel dominating, a doubled category and two costed trips. */
export const TRAVEL_HEAVY_ENTRIES: MoneyEntry[] = [
  // Current 30-day window (2026-08-05 … 2026-09-04).
  { id: "e-1", category: "travel", amount: 300, currency: "EUR", date: "2026-08-10", tournamentId: "t-near" },
  { id: "e-2", category: "accommodation", amount: 120, currency: "EUR", date: "2026-08-11", tournamentId: "t-near" },
  { id: "e-3", category: "travel", amount: 700, currency: "EUR", date: "2026-08-20", tournamentId: "t-far" },
  { id: "e-4", category: "accommodation", amount: 400, currency: "EUR", date: "2026-08-21", tournamentId: "t-far" },
  { id: "e-5", category: "coaching", amount: 400, currency: "EUR", date: "2026-08-15" },
  { id: "e-6", category: "stringing", amount: 30, currency: "EUR", date: "2026-08-25" },
  { id: "e-7", category: "tournament_fee", amount: 60, currency: "EUR", date: "2026-08-09", tournamentId: "t-near" },
  // Previous window (2026-07-06 … 2026-08-04): coaching was 200 → now doubled.
  { id: "p-1", category: "coaching", amount: 200, currency: "EUR", date: "2026-07-20" },
  { id: "p-2", category: "travel", amount: 250, currency: "EUR", date: "2026-07-25" },
];

export const TRAVEL_HEAVY_TOURNAMENTS: MoneyTournamentEntry[] = [
  { tournamentId: "t-near", name: "Club Open", startDate: "2026-08-15T00:00:00.000Z", endDate: "2026-08-16T00:00:00.000Z", status: "played" },
  { tournamentId: "t-far", name: "Coast Masters", startDate: "2026-08-22T00:00:00.000Z", endDate: "2026-08-24T00:00:00.000Z", status: "played" },
];

/** Rows for the by-id vs by-date matching rules. */
export const MATCHING_TOURNAMENT: MoneyTournamentEntry = {
  tournamentId: "t-x",
  name: "Regional X",
  startDate: "2026-08-20T00:00:00.000Z",
  endDate: "2026-08-22T00:00:00.000Z",
  status: "played",
};
export const MATCHING_ENTRIES: MoneyEntry[] = [
  // Linked by id, dated well before the event — still counts.
  { id: "m-1", category: "tournament_fee", amount: 50, currency: "EUR", date: "2026-07-01", tournamentId: "t-x" },
  // Unlinked, inside the dates, plausible category — counts by date.
  { id: "m-2", category: "food", amount: 35, currency: "EUR", date: "2026-08-21" },
  // Unlinked, inside the ±1 day slack — counts by date.
  { id: "m-3", category: "travel", amount: 80, currency: "EUR", date: "2026-08-19" },
  // Linked to a DIFFERENT tournament, inside the dates — must NOT be matched to t-x.
  { id: "m-4", category: "travel", amount: 999, currency: "EUR", date: "2026-08-21", tournamentId: "t-other" },
  // Unlinked, inside the dates, but not a tournament category — must NOT count.
  { id: "m-5", category: "membership", amount: 120, currency: "EUR", date: "2026-08-21" },
  // Unlinked, outside the dates — must NOT count.
  { id: "m-6", category: "travel", amount: 70, currency: "EUR", date: "2026-08-10" },
  // Unlinked, inside the dates, in USD — counts, listed under USD separately.
  { id: "m-7", category: "accommodation", amount: 100, currency: "USD", date: "2026-08-20" },
];

export function moneyInput(overrides: Partial<MoneyInput> = {}): MoneyInput {
  return {
    now: NOW,
    window: "month",
    entries: P1_ENTRIES,
    tournaments: P1_TOURNAMENTS,
    setups: P1_SETUPS,
    trainings: P1_TRAININGS_FUTURE,
    ...overrides,
  };
}
