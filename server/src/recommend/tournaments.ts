// ============================================================================
// TennisAI — tournament fit engine (deterministic, v1)
//
// For every upcoming tournament the route hands in, a 0–100 fit score built
// from weighted components — level, surface, distance, calendar conflicts,
// entry deadline, cost — each returned with its own weight, score and sentence
// so the player can see what moved the number. A component the engine could
// not evaluate is returned with `score: null` and its weight is redistributed
// over the ones it could; it is never silently scored as average.
//
// Age eligibility is a HARD filter, not a component: a 17-year-old is not
// "a poor fit" for a 16 & Under event, they cannot enter it. Ineligible
// events go to `hidden[]` with a reason, as do events whose entry deadline has
// passed, events the player has already entered and events they hid
// themselves. Nothing is dropped without saying why.
//
// Pure function. No Prisma, no clock, no network. Rules are documented one by
// one in docs/recommendations.md; the component/reason codes are the index.
// ============================================================================

import { ageYearsAt, type PlayerLevel } from "./profileFacts";
import { type Confidence, type Reason, clamp, daysBetween, reason, round } from "./types";

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface TournamentsProfileFacts {
  level?: PlayerLevel;
  /** ISO yyyy-MM-dd. Age is taken AT EACH EVENT'S START, not today. */
  dateOfBirth?: string;
  utr?: number;
  preferredSurface?: string;
  suit?: { clay?: number; hard?: number; grass?: number; indoor?: number };
}

export interface TournamentCandidate {
  id: string;
  name: string;
  city: string;
  country: string;
  surface: string;
  indoorOutdoor: string;
  level?: string;
  category?: string;
  federation?: string;
  ageCategory?: string;
  startDate: string;
  endDate: string;
  entryDeadline?: string;
  latitude?: number;
  longitude?: number;
  utrRangeMin?: number;
  utrRangeMax?: number;
}

/** Something already on the player's calendar that an event could clash with. */
export interface BusyPeriod {
  id: string;
  kind: "tournament_entry" | "calendar_event" | "training";
  title: string;
  startDate: string;
  endDate: string;
}

export interface FinanceFact {
  category: string;
  amount: number;
  currency: string;
  tournamentId?: string;
}

export interface TournamentsInput {
  now: string;
  horizonDays: number;
  profile: TournamentsProfileFacts;
  /** The player's home. No profile field holds one in v1, so the route passes undefined. */
  origin?: { lat: number; lng: number };
  candidates: TournamentCandidate[];
  /** Tournament ids the player has entered (any status but withdrawn). */
  enteredTournamentIds: string[];
  /** Tournament ids the player hid from suggestions. */
  userHiddenIds: string[];
  busy: BusyPeriod[];
  finance: FinanceFact[];
}

// ── Output ──────────────────────────────────────────────────────────────────

export interface FitComponent {
  code: "level_fit" | "surface_fit" | "distance" | "calendar_conflicts" | "entry_deadline" | "estimated_cost";
  /** Nominal weight. The effective weight is this, rescaled over the known components. */
  weight: number;
  /** 0–100, or null when the engine had nothing to evaluate it with. */
  score: number | null;
  textEn: string;
}

export interface CostEstimate {
  currency: string;
  amount: number;
  basis: "own_history" | "rough_default";
  textEn: string;
}

export interface FitResult {
  tournamentId: string;
  name: string;
  city: string;
  country: string;
  surface: string;
  indoorOutdoor: string;
  startDate: string;
  endDate: string;
  entryDeadline: string | null;
  daysToDeadline: number | null;
  distanceKm: number | null;
  estimatedCost: CostEstimate | null;
  score: number;
  components: FitComponent[];
  reasons: Reason[];
}

export type HiddenCode = "age_ineligible" | "entry_deadline_passed" | "already_entered" | "hidden_by_you";

export interface HiddenResult {
  tournamentId: string;
  name: string;
  startDate: string;
  code: HiddenCode;
  textEn: string;
}

export interface TournamentsRecommendation {
  /** Best fits, at most five. */
  top: FitResult[];
  /** The rest, best first, capped — see totals. */
  others: FitResult[];
  hidden: HiddenResult[];
  totals: { candidates: number; scored: number; hidden: number; othersOmitted: number; hiddenOmitted: number };
  confidence: Confidence;
  reasonsGlobal: Reason[];
}

// ── Constants (each is a documented rule threshold) ─────────────────────────

export const TOP_N = 5;
export const OTHERS_CAP = 50;
export const HIDDEN_CAP = 50;

export const WEIGHTS: Record<FitComponent["code"], number> = {
  level_fit: 30,
  surface_fit: 15,
  distance: 20,
  calendar_conflicts: 15,
  entry_deadline: 10,
  estimated_cost: 10,
};

/**
 * Coarse UTR band per profile level, used only when the profile has no UTR.
 * Deliberately wide and overlapping: a picker with four options cannot place
 * anyone within a point.
 */
export const LEVEL_UTR_BAND: Record<PlayerLevel, [number, number]> = {
  beginner: [1, 3.5],
  intermediate: [3, 6],
  advanced: [5.5, 8.5],
  competitive: [7.5, 13],
};

/** Entries in one category and currency needed before the player's own average is used. */
export const COST_HISTORY_MIN_ENTRIES = 3;
const TRIP_CATEGORIES = ["travel", "accommodation", "food", "tournament_fee"] as const;

/** Rough default trip cost by distance, EUR. Labelled as rough wherever it is used. */
const ROUGH_DEFAULT_EUR: Array<[maxKm: number, eur: number]> = [
  [50, 20],
  [300, 120],
  [1500, 400],
  [Infinity, 900],
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Great-circle distance, km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * "18 & Under" → 18. Only this exact shape is read — it is the only one the
 * feeds produce today. Anything else is "unknown", never a guess: a wrong
 * eligibility call either hides a real option or recommends an event the
 * player cannot enter.
 */
export function parseMaxAge(ageCategory: string | undefined): number | undefined {
  if (!ageCategory) return undefined;
  const m = /^\s*(\d{1,2})\s*(?:&|and)\s*under\s*$/i.exec(ageCategory);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 6 && n <= 99 ? n : undefined;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) <= Date.parse(bEnd) && Date.parse(bStart) <= Date.parse(aEnd);
}

const PRO_LEVELS = /professional|challenger|world tour(?! juniors)/i;
const JUNIOR_ITF = /juniors/i;

function surfaceKey(t: TournamentCandidate): "clay" | "hard" | "grass" | "indoor" | undefined {
  if (t.indoorOutdoor === "indoor") return "indoor";
  const s = t.surface.toLowerCase();
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  if (s.includes("hard")) return "hard";
  return undefined;
}

// ── Engine ──────────────────────────────────────────────────────────────────

export function recommendTournaments(input: TournamentsInput): TournamentsRecommendation {
  const { now, profile, origin } = input;
  const reasonsGlobal: Reason[] = [];
  const entered = new Set(input.enteredTournamentIds);
  const userHidden = new Set(input.userHiddenIds);

  // ── What is known about the player, said once ─────────────────────────────
  const levelKnown = profile.utr !== undefined || profile.level !== undefined;
  if (profile.utr !== undefined) {
    reasonsGlobal.push(reason("profile_utr", { utr: profile.utr }, `Your profile ranking says UTR ${profile.utr}; level fit compares it with each event's UTR range.`));
  } else if (profile.level) {
    const [lo, hi] = LEVEL_UTR_BAND[profile.level];
    reasonsGlobal.push(
      reason(
        "profile_level_band",
        { level: profile.level, utrMin: lo, utrMax: hi },
        `Your profile lists you as ${profile.level}, which is treated as roughly UTR ${lo}–${hi} — a wide band, because a four-option picker cannot place anyone more precisely.`,
      ),
    );
  } else {
    reasonsGlobal.push(reason("profile_level_unknown", {}, "Your playing level is not on your profile, so level fit could not be scored for any event."));
  }
  if (!profile.dateOfBirth) {
    reasonsGlobal.push(reason("profile_age_unknown", {}, "No date of birth on your profile, so age eligibility could not be checked — age-restricted events are shown, not hidden."));
  }
  if (!origin) {
    reasonsGlobal.push(reason("origin_unknown", {}, "We do not know where you are based, so distance and travel cost could not be scored."));
  }
  if (!profile.suit && !profile.preferredSurface) {
    reasonsGlobal.push(reason("surface_preference_unknown", {}, "No surface preference or suitability scores on your profile, so surface fit could not be scored."));
  }
  reasonsGlobal.push(reason("fee_unknown", {}, "Events do not carry an entry fee in the calendar yet, so cost estimates cover travel and stay only."));

  const costHistory = ownCostHistory(input.finance);
  if (costHistory) {
    reasonsGlobal.push(
      reason(
        "cost_from_own_history",
        { currency: costHistory.currency, amount: costHistory.amount, categories: costHistory.categories.join(",") },
        `Travel and stay are estimated at ${costHistory.amount} ${costHistory.currency} per event from your own logged averages (${costHistory.categories.join(", ")}).`,
      ),
    );
  }

  // ── Score or hide each candidate ──────────────────────────────────────────
  const scored: FitResult[] = [];
  const hidden: HiddenResult[] = [];

  for (const t of input.candidates) {
    if (userHidden.has(t.id)) {
      hidden.push({ tournamentId: t.id, name: t.name, startDate: t.startDate, code: "hidden_by_you", textEn: "You hid this event from suggestions." });
      continue;
    }
    if (entered.has(t.id)) {
      hidden.push({ tournamentId: t.id, name: t.name, startDate: t.startDate, code: "already_entered", textEn: "You are already entered — it is on your calendar, not a suggestion." });
      continue;
    }
    const maxAge = parseMaxAge(t.ageCategory);
    const ageAtStart = profile.dateOfBirth ? ageYearsAt(profile.dateOfBirth, t.startDate) : undefined;
    if (maxAge !== undefined && ageAtStart !== undefined && ageAtStart > maxAge) {
      hidden.push({
        tournamentId: t.id,
        name: t.name,
        startDate: t.startDate,
        code: "age_ineligible",
        textEn: `${t.ageCategory}: you will be ${ageAtStart} when it starts, so you cannot enter.`,
      });
      continue;
    }
    const daysToDeadline = t.entryDeadline ? daysBetween(now, t.entryDeadline) : null;
    if (daysToDeadline !== null && daysToDeadline < 0) {
      hidden.push({
        tournamentId: t.id,
        name: t.name,
        startDate: t.startDate,
        code: "entry_deadline_passed",
        textEn: `The entry deadline passed ${Math.abs(daysToDeadline)} day${Math.abs(daysToDeadline) === 1 ? "" : "s"} ago.`,
      });
      continue;
    }

    scored.push(scoreOne(t, input, { maxAge, ageAtStart, daysToDeadline, costHistory }));
  }

  // Deterministic: score desc, then start date, then id.
  scored.sort((a, b) => b.score - a.score || a.startDate.localeCompare(b.startDate) || a.tournamentId.localeCompare(b.tournamentId));
  hidden.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.tournamentId.localeCompare(b.tournamentId));

  const top = scored.slice(0, TOP_N);
  const others = scored.slice(TOP_N, TOP_N + OTHERS_CAP);
  const hiddenOut = hidden.slice(0, HIDDEN_CAP);

  reasonsGlobal.push(
    reason(
      "horizon",
      { horizonDays: input.horizonDays, candidates: input.candidates.length, scored: scored.length, hidden: hidden.length },
      `${input.candidates.length} events start in the next ${input.horizonDays} days; ${scored.length} were scored and ${hidden.length} set aside with a reason.`,
    ),
  );

  return {
    top,
    others,
    hidden: hiddenOut,
    totals: {
      candidates: input.candidates.length,
      scored: scored.length,
      hidden: hidden.length,
      othersOmitted: Math.max(0, scored.length - TOP_N - others.length),
      hiddenOmitted: hidden.length - hiddenOut.length,
    },
    confidence: confidenceFor(levelKnown, Boolean(profile.dateOfBirth), Boolean(origin)),
    reasonsGlobal,
  };
}

interface Context {
  maxAge: number | undefined;
  ageAtStart: number | undefined;
  daysToDeadline: number | null;
  costHistory: OwnCostHistory | null;
}

function scoreOne(t: TournamentCandidate, input: TournamentsInput, ctx: Context): FitResult {
  const { profile, origin } = input;
  const reasons: Reason[] = [];
  const components: FitComponent[] = [];
  const comp = (code: FitComponent["code"], score: number | null, textEn: string) =>
    components.push({ code, weight: WEIGHTS[code], score: score === null ? null : Math.round(clamp(score, 0, 100)), textEn });

  // ── Level ─────────────────────────────────────────────────────────────────
  const hasUtrRange = t.utrRangeMin !== undefined && t.utrRangeMax !== undefined;
  if (hasUtrRange && profile.utr !== undefined) {
    const lo = t.utrRangeMin!;
    const hi = t.utrRangeMax!;
    const outside = profile.utr < lo ? lo - profile.utr : profile.utr > hi ? profile.utr - hi : 0;
    const score = outside === 0 ? 100 : 100 - outside * 40;
    comp("level_fit", score, outside === 0 ? `Takes UTR ${lo}–${hi}; your UTR ${profile.utr} is inside it.` : `Takes UTR ${lo}–${hi}; your UTR ${profile.utr} is ${round(outside, 1)} outside it.`);
  } else if (hasUtrRange && profile.level) {
    const [pLo, pHi] = LEVEL_UTR_BAND[profile.level];
    const lo = t.utrRangeMin!;
    const hi = t.utrRangeMax!;
    const overlap = Math.max(0, Math.min(pHi, hi) - Math.max(pLo, lo));
    const score = (overlap / (pHi - pLo)) * 100;
    comp("level_fit", score, `Takes UTR ${lo}–${hi}; a ${profile.level} player (roughly UTR ${pLo}–${pHi}) ${score >= 99 ? "fits fully" : score > 0 ? "partly overlaps" : "falls outside"}.`);
  } else if (!hasUtrRange && t.level && PRO_LEVELS.test(t.level)) {
    // Scored even when the player's level is unknown: entry to a tour event is
    // by professional ranking whoever you are, so "unknown" would let these
    // float to the top of an empty profile's list on the strength of nothing.
    const score = profile.level === "competitive" ? 50 : 5;
    comp(
      "level_fit",
      score,
      `${t.level} — a professional tour event${profile.level === "competitive" ? ", realistic only with a professional ranking" : profile.level ? `; your profile says ${profile.level}` : "; entry is by professional ranking"}.`,
    );
    reasons.push(reason("pro_tour_event", { level: t.level }, "This is a professional tour event; entry is by ranking, not by signing up."));
  } else if (!hasUtrRange && profile.level && t.level && JUNIOR_ITF.test(t.level)) {
    const junior = ctx.ageAtStart !== undefined && ctx.ageAtStart < 19;
    const score = junior && profile.level === "competitive" ? 80 : junior && profile.level === "advanced" ? 50 : 15;
    comp("level_fit", score, `${t.level} — an international junior event${junior ? "" : ctx.ageAtStart === undefined ? " (your age is unknown)" : " (you are over 18)"}; your profile says ${profile.level}.`);
  } else {
    comp("level_fit", null, profile.level || profile.utr !== undefined ? "The event does not state a level or UTR range." : "Your level is not on your profile.");
  }

  // ── Age (eligibility already applied; here only the honest gaps) ──────────
  if (ctx.maxAge !== undefined && ctx.ageAtStart === undefined) {
    reasons.push(reason("age_unchecked", { ageCategory: t.ageCategory! }, `${t.ageCategory}: eligibility could not be checked without your date of birth.`));
  } else if (t.ageCategory && ctx.maxAge === undefined) {
    reasons.push(reason("age_category_unparsed", { ageCategory: t.ageCategory }, `Age category "${t.ageCategory}" could not be read, so eligibility was not checked.`));
  } else if (ctx.maxAge !== undefined && ctx.ageAtStart !== undefined) {
    reasons.push(reason("age_eligible", { ageCategory: t.ageCategory!, ageAtStart: ctx.ageAtStart }, `${t.ageCategory}: you will be ${ctx.ageAtStart} at the start, so you are eligible.`));
  }

  // ── Surface ───────────────────────────────────────────────────────────────
  const key = surfaceKey(t);
  const suitScore = key && profile.suit ? profile.suit[key] : undefined;
  if (key && suitScore !== undefined) {
    comp("surface_fit", ((suitScore - 1) / 9) * 100, `${t.surface}${key === "indoor" ? " indoors" : ""}: your ${key} suitability is ${suitScore}/10.`);
  } else if (key && profile.preferredSurface) {
    const match = profile.preferredSurface.toLowerCase() === key;
    comp("surface_fit", match ? 80 : 40, match ? `${t.surface}${key === "indoor" ? " indoors" : ""} — your preferred surface.` : `${t.surface}${key === "indoor" ? " indoors" : ""}; you prefer ${profile.preferredSurface}.`);
  } else {
    comp("surface_fit", null, key ? "No surface preference on your profile." : `Surface "${t.surface}" is not stated clearly enough to compare.`);
  }

  // ── Distance ──────────────────────────────────────────────────────────────
  let distanceKm: number | null = null;
  if (origin && t.latitude !== undefined && t.longitude !== undefined) {
    distanceKm = Math.round(haversineKm(origin, { lat: t.latitude, lng: t.longitude }));
    const score = distanceKm <= 50 ? 100 : distanceKm <= 150 ? 85 : distanceKm <= 300 ? 65 : distanceKm <= 600 ? 45 : distanceKm <= 1500 ? 25 : 10;
    comp("distance", score, `About ${distanceKm} km from home.`);
  } else {
    comp("distance", null, origin ? "The event has no coordinates." : "Your home location is not known.");
  }

  // ── Calendar conflicts ────────────────────────────────────────────────────
  const clashes = input.busy.filter((b) => overlaps(t.startDate, t.endDate, b.startDate, b.endDate));
  const tournamentClash = clashes.find((c) => c.kind === "tournament_entry");
  if (tournamentClash) {
    comp("calendar_conflicts", 0, `Overlaps ${tournamentClash.title}, which you are already entered in.`);
  } else if (clashes.length > 0) {
    comp("calendar_conflicts", 40, `Overlaps ${clashes.length} item${clashes.length === 1 ? "" : "s"} on your calendar (${clashes[0].title}${clashes.length > 1 ? ", …" : ""}).`);
  } else {
    comp("calendar_conflicts", 100, "Nothing else on your calendar in those dates.");
  }

  // ── Entry deadline ────────────────────────────────────────────────────────
  const d = ctx.daysToDeadline;
  if (d === null) {
    comp("entry_deadline", null, "No entry deadline is listed.");
  } else {
    const score = d >= 14 ? 100 : d >= 7 ? 80 : d >= 3 ? 55 : 30;
    comp("entry_deadline", score, d === 0 ? "Entries close today." : `Entries close in ${d} day${d === 1 ? "" : "s"}.`);
  }

  // ── Cost ──────────────────────────────────────────────────────────────────
  let estimatedCost: CostEstimate | null = null;
  if (ctx.costHistory) {
    estimatedCost = {
      currency: ctx.costHistory.currency,
      amount: ctx.costHistory.amount,
      basis: "own_history",
      textEn: `About ${ctx.costHistory.amount} ${ctx.costHistory.currency} for travel and stay, from your own logged averages. Entry fee unknown.`,
    };
  } else if (distanceKm !== null) {
    const eur = ROUGH_DEFAULT_EUR.find(([maxKm]) => distanceKm! <= maxKm)![1];
    estimatedCost = {
      currency: "EUR",
      amount: eur,
      basis: "rough_default",
      textEn: `Roughly ${eur} EUR for travel and stay — a rough default for ${distanceKm} km, not your figures. Entry fee unknown.`,
    };
  }
  if (estimatedCost) {
    const a = estimatedCost.amount;
    const score = a <= 50 ? 100 : a <= 150 ? 80 : a <= 400 ? 55 : a <= 1000 ? 30 : 10;
    comp("estimated_cost", score, estimatedCost.textEn);
  } else {
    comp("estimated_cost", null, "Not enough logged expenses and no distance, so no cost estimate.");
  }

  // ── Weighted total over the KNOWN components only ─────────────────────────
  const known = components.filter((c) => c.score !== null);
  const weightSum = known.reduce((s, c) => s + c.weight, 0);
  const score = weightSum === 0 ? 0 : Math.round(known.reduce((s, c) => s + c.weight * (c.score as number), 0) / weightSum);
  const unknown = components.filter((c) => c.score === null);
  if (unknown.length > 0) {
    reasons.push(
      reason(
        "components_unknown",
        { count: unknown.length, codes: unknown.map((c) => c.code).join(",") },
        `${unknown.length} of ${components.length} factors could not be scored (${unknown.map((c) => c.code.replace(/_/g, " ")).join(", ")}); the score rests on the other ${known.length}.`,
      ),
    );
  }

  return {
    tournamentId: t.id,
    name: t.name,
    city: t.city,
    country: t.country,
    surface: t.surface,
    indoorOutdoor: t.indoorOutdoor,
    startDate: t.startDate,
    endDate: t.endDate,
    entryDeadline: t.entryDeadline ?? null,
    daysToDeadline: d,
    distanceKm,
    estimatedCost,
    score,
    components,
    reasons,
  };
}

// ── Cost history ────────────────────────────────────────────────────────────

interface OwnCostHistory {
  currency: string;
  amount: number;
  categories: string[];
}

/**
 * The player's own average per trip category, in the single currency that has
 * the most trip-category entries. A category counts only with at least
 * COST_HISTORY_MIN_ENTRIES rows in that currency; the estimate is the sum of
 * the qualifying averages. Currencies are never mixed.
 */
export function ownCostHistory(finance: FinanceFact[]): OwnCostHistory | null {
  const trip = finance.filter((f) => (TRIP_CATEGORIES as readonly string[]).includes(f.category) && f.amount > 0);
  if (trip.length === 0) return null;
  const byCurrency = new Map<string, number>();
  for (const f of trip) byCurrency.set(f.currency, (byCurrency.get(f.currency) ?? 0) + 1);
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  const categories: string[] = [];
  let amount = 0;
  for (const cat of TRIP_CATEGORIES) {
    const rows = trip.filter((f) => f.currency === currency && f.category === cat);
    if (rows.length >= COST_HISTORY_MIN_ENTRIES) {
      categories.push(cat);
      amount += rows.reduce((s, f) => s + f.amount, 0) / rows.length;
    }
  }
  if (categories.length === 0) return null;
  return { currency, amount: Math.round(amount), categories };
}

// ── Confidence ──────────────────────────────────────────────────────────────

/** The ladder, spelled out so the doc and the code cannot drift. */
export function confidenceFor(levelKnown: boolean, ageKnown: boolean, originKnown: boolean): Confidence {
  if (!levelKnown) {
    return { level: "low", raisedBy: "Add your playing level to your profile — or your UTR in the ranking field — and level fit can be scored for every event." };
  }
  if (!ageKnown) {
    return { level: "low", raisedBy: "Add your date of birth to your profile so age eligibility can be checked instead of assumed." };
  }
  if (!originKnown) {
    return { level: "medium", raisedBy: "Distance and travel cost cannot be scored yet: there is no home location on the profile in this version." };
  }
  return { level: "high", raisedBy: "This is as confident as the v1 rules get." };
}
