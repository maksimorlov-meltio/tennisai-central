// Fixtures for the tournaments engine. Synthetic events shaped like the real
// feed rows (UTR ranges, "18 & Under", ISO dates, decimal coordinates).

import type { BusyPeriod, FinanceFact, TournamentCandidate, TournamentsInput, TournamentsProfileFacts } from "../tournaments";

export const NOW = "2026-09-04T12:00:00.000Z";

const iso = (daysFromNow: number, hour = 0) => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const BERLIN = { lat: 52.52, lng: 13.405 };
export const MUNICH = { lat: 48.1351, lng: 11.582 };

export const ADULT_INTERMEDIATE: TournamentsProfileFacts = {
  level: "intermediate",
  dateOfBirth: "2000-01-01",
  preferredSurface: "clay",
  suit: { clay: 8, hard: 5, grass: 3, indoor: 6 },
};

/** 15 at NOW, turns 16 on 2027-03-01. */
export const JUNIOR_15: TournamentsProfileFacts = {
  level: "advanced",
  dateOfBirth: "2011-03-01",
  preferredSurface: "hard",
};

export const UTR_PLAYER: TournamentsProfileFacts = {
  level: "competitive",
  dateOfBirth: "1998-06-15",
  utr: 7.5,
};

/** Exactly p1 today: no profile row, no date of birth. */
export const UNKNOWN_PROFILE: TournamentsProfileFacts = {};

function event(id: string, overrides: Partial<TournamentCandidate> = {}): TournamentCandidate {
  return {
    id,
    name: `Event ${id}`,
    city: "Berlin",
    country: "Germany",
    surface: "Hard",
    indoorOutdoor: "outdoor",
    level: "UTR",
    category: "UTR 1-16",
    federation: "UTR",
    startDate: iso(20),
    endDate: iso(21),
    entryDeadline: iso(10),
    latitude: 52.5,
    longitude: 13.4,
    utrRangeMin: 1,
    utrRangeMax: 16,
    ...overrides,
  };
}

/** Open UTR event, ten days to the deadline, in town. */
export const OPEN_UTR = event("utr-open");
/** A strong-field UTR event. */
export const STRONG_UTR = event("utr-strong", { utrRangeMin: 8, utrRangeMax: 12, category: "UTR 8-12" });
/** International junior event, 18 & Under. */
export const ITF_JUNIOR = event("itf-jr", {
  level: "ITF World Tennis Tour Juniors",
  category: "J60",
  federation: "ITF",
  ageCategory: "18 & Under",
  utrRangeMin: undefined,
  utrRangeMax: undefined,
  startDate: iso(30),
  endDate: iso(36),
  entryDeadline: iso(15),
});
/** 14 & Under — a 15-year-old cannot enter. */
export const U14 = event("u14", { ageCategory: "14 & Under", startDate: iso(25), endDate: iso(26) });
/** Professional tour event, no UTR range, in Munich on clay. */
export const PRO_500 = event("pro-500", {
  name: "BMW Open",
  city: "Munich",
  surface: "Clay",
  level: "Professional",
  category: "ATP 500",
  federation: "ATP",
  utrRangeMin: undefined,
  utrRangeMax: undefined,
  latitude: MUNICH.lat,
  longitude: MUNICH.lng,
  entryDeadline: undefined,
});
/** Deadline was yesterday. */
export const DEADLINE_PASSED = event("late", { entryDeadline: iso(-1) });
/** Overlaps the player's existing tournament entry (see BUSY). */
export const CLASHES_ENTRY = event("clash", { startDate: iso(40), endDate: iso(42) });
/** Overlaps a training (see BUSY). */
export const CLASHES_TRAINING = event("clash-training", { startDate: iso(50), endDate: iso(50, 18) });
/** Already entered. */
export const ENTERED = event("entered", { startDate: iso(40), endDate: iso(42) });
/** Hidden by the user. */
export const USER_HIDDEN = event("user-hid");
/** Three otherwise identical events — only date and id differ. */
export const TIE_B = event("tie-b", { startDate: iso(12), endDate: iso(12) });
export const TIE_A = event("tie-a", { startDate: iso(12), endDate: iso(12) });
export const TIE_C = event("tie-c", { startDate: iso(11), endDate: iso(11) });
/** No coordinates at all. */
export const NO_COORDS = event("no-coords", { latitude: undefined, longitude: undefined });

export const ALL_EVENTS: TournamentCandidate[] = [
  OPEN_UTR,
  STRONG_UTR,
  ITF_JUNIOR,
  U14,
  PRO_500,
  DEADLINE_PASSED,
  CLASHES_ENTRY,
  CLASHES_TRAINING,
  ENTERED,
  USER_HIDDEN,
  TIE_B,
  TIE_A,
  TIE_C,
  NO_COORDS,
];

export const BUSY: BusyPeriod[] = [
  { id: "pt-entered", kind: "tournament_entry", title: "Event entered", startDate: iso(40), endDate: iso(42) },
  { id: "t-1", kind: "training", title: "Serve session", startDate: iso(50, 9), endDate: iso(50, 11) },
];

/** Three EUR travel + three EUR accommodation rows qualify; the USD row and the single food row do not. */
export const FINANCE_WITH_HISTORY: FinanceFact[] = [
  { category: "travel", amount: 100, currency: "EUR" },
  { category: "travel", amount: 150, currency: "EUR" },
  { category: "travel", amount: 200, currency: "EUR" },
  { category: "travel", amount: 640, currency: "USD" },
  { category: "accommodation", amount: 80, currency: "EUR" },
  { category: "accommodation", amount: 90, currency: "EUR" },
  { category: "accommodation", amount: 100, currency: "EUR" },
  { category: "food", amount: 30, currency: "EUR" },
  { category: "coaching", amount: 450, currency: "EUR" },
];

export function tournamentsInput(overrides: Partial<TournamentsInput> = {}): TournamentsInput {
  return {
    now: NOW,
    horizonDays: 90,
    profile: ADULT_INTERMEDIATE,
    origin: undefined,
    candidates: ALL_EVENTS,
    enteredTournamentIds: ["entered"],
    userHiddenIds: ["user-hid"],
    busy: BUSY,
    finance: [],
    ...overrides,
  };
}

export { iso };
