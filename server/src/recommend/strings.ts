// ============================================================================
// TennisAI — string recommendation engine (deterministic, v1)
//
// What a good stringer would tell a player who walked in with their racket,
// their last few string jobs and a couple of plain answers: which material,
// which gauge, what tension, and — when the history supports it — how often to
// restring. Recommendation first, numbers second.
//
// Pure function. Every rule is documented in docs/recommendations.md with its
// rationale and the input it reads; the reason codes below are the index into
// that document. Nothing here touches Prisma, the clock or the network.
//
// Two hard lines:
//  - A frequent breaker is NEVER told to raise tension as the first answer.
//    Higher tension breaks strings faster and is harder on the arm; the answer
//    is a thicker gauge or a more durable string.
//  - Pain or injury is a boolean. It produces exactly one caution and nudges
//    towards comfort; the engine never names or implies a condition.
// ============================================================================

import type { ConditionsPhysics } from "../conditions/physics";
import type { AgeBand, PlayerLevel } from "./profileFacts";
import {
  type Caution,
  type Confidence,
  type Reason,
  SEEK_ASSESSMENT_CAUTION,
  clamp,
  mean,
  reason,
  round,
  roundHalf,
} from "./types";

// ── Inputs ──────────────────────────────────────────────────────────────────

export type StringMaterial =
  | "polyester"
  | "co_polyester"
  | "multifilament"
  | "synthetic_gut"
  | "natural_gut"
  | "kevlar"
  | "hybrid_set";

export type RetiredReason = "broke" | "dead" | "switched" | "other";
export type StringPriority = "control" | "power" | "balanced";

export interface StringsProfileFacts {
  level?: PlayerLevel;
  ageBand?: AgeBand;
  /** 1 (defensive) … 10 (aggressive). */
  styleAggression?: number;
  preferredSurface?: string;
  prefersComfort: boolean;
  painMentioned: boolean;
}

export interface RacketFacts {
  /** For reasons: "Wilson Pro Staff 97 v14". */
  name: string;
  patternMains: number;
  patternCrosses: number;
  stiffnessRa?: number;
  /** Manufacturer's recommended range, kg. Absent = the frame is not linked to a catalogue product. */
  bandKg?: [number, number];
}

export interface SetupFact {
  strungAt: string;
  retiredAt?: string;
  hoursPlayed?: number;
  tensionMainsKg: number;
  retiredReason?: RetiredReason;
  /** "Luxilon ALU Power" — for reasons only. */
  mainsName?: string;
}

export interface NextTournamentFacts {
  name: string;
  startDate: string;
  /**
   * From conditions/physics.ts — reused, never recomputed here. Null when the
   * conditions service had no temperature to work from (no coordinates, or the
   * weather lookup failed): the engine then says so and changes nothing.
   */
  physics: ConditionsPhysics | null;
}

/** The three-to-four plain questions the UI asks. All optional. */
export interface StringPreferences {
  breaksOften?: boolean;
  wantsArmComfort?: boolean;
  wantsMoreSpin?: boolean;
  priority?: StringPriority;
}

/** A string product from the catalogue slice the route passes in. */
export interface CatalogueString {
  id: string;
  brand: string;
  model: string;
  material: StringMaterial;
  gaugeMm: number;
  shape: string;
  power: number;
  control: number;
  spin: number;
  comfort: number;
  durability: number;
}

export interface StringsInput {
  now: string;
  profile: StringsProfileFacts;
  racket?: RacketFacts;
  history: SetupFact[];
  nextTournament?: NextTournamentFacts;
  prefs: StringPreferences;
  catalogue: CatalogueString[];
}

// ── Output ──────────────────────────────────────────────────────────────────

export interface MaterialPick {
  material: StringMaterial;
  label: string;
  why: string;
}

export interface StringsRecommendation {
  material: MaterialPick;
  /** Up to two. */
  alternatives: MaterialPick[];
  gauge: { label: string; mm: number };
  tension: {
    /** Kilograms only; the client derives lbs. */
    mainsKg: [number, number];
    crossesKg: [number, number];
    racketBandKg: [number, number] | null;
    anchoredTo: "history" | "racket_band" | "default_band";
  };
  hybrid?: { mains: string; crosses: string; whenItHelps: string };
  restringCadence?: { hours: number; basis: string };
  reasons: Reason[];
  confidence: Confidence;
  cautions: Caution[];
  pickFromCatalogue: { productIds: string[] };
}

// ── Constants (each is a documented rule threshold) ─────────────────────────

/** Used only when the frame is not linked to a catalogue product. */
export const DEFAULT_BAND_KG: [number, number] = [22, 26];
/** Average hours to a break below this → frequent breaker. */
export const BREAKER_HOURS = 10;
/** RA at or above this → "stiff frame", soften the string. */
export const STIFF_RA = 68;
/** Air density vs a mild sea-level day, %. Thin/hot air → tighter; cold/heavy → looser. */
const THIN_AIR_PCT = -3;
const VERY_THIN_AIR_PCT = -8;
const HEAVY_AIR_PCT = 3;
const VERY_HEAVY_AIR_PCT = 8;
/** Retired jobs with hours needed before a cadence is quoted. */
const CADENCE_MIN_JOBS = 2;

const MATERIAL_LABEL: Record<StringMaterial, string> = {
  polyester: "Polyester",
  co_polyester: "Co-polyester",
  multifilament: "Multifilament",
  synthetic_gut: "Synthetic gut",
  natural_gut: "Natural gut",
  kevlar: "Kevlar",
  hybrid_set: "Hybrid (poly mains / multifilament crosses)",
};

const GAUGE_LABEL: Record<string, string> = {
  "1.2": "17",
  "1.25": "16L",
  "1.3": "16",
  "1.35": "15L",
};

function pick(material: StringMaterial, why: string): MaterialPick {
  return { material, label: MATERIAL_LABEL[material], why };
}

function gaugeOf(mm: number): { label: string; mm: number } {
  const key = String(round(mm, 2));
  return { label: GAUGE_LABEL[key] ?? `${mm.toFixed(2)} mm`, mm: round(mm, 2) };
}

const isPoly = (m: StringMaterial) => m === "polyester" || m === "co_polyester";

// ── Engine ──────────────────────────────────────────────────────────────────

export function recommendStrings(input: StringsInput): StringsRecommendation {
  const reasons: Reason[] = [];
  const { profile, racket, prefs } = input;

  // ── Read the inputs into named signals ────────────────────────────────────
  const history = [...input.history].sort((a, b) => a.strungAt.localeCompare(b.strungAt));
  const latest = history.length ? history[history.length - 1] : undefined;
  const retired = history.filter((s) => s.retiredAt);
  const retiredWithHours = retired.filter((s) => (s.hoursPlayed ?? 0) > 0);
  const breaks = retired.filter((s) => s.retiredReason === "broke");
  const breakHours = mean(breaks.filter((s) => (s.hoursPlayed ?? 0) > 0).map((s) => s.hoursPlayed!));

  const junior = profile.ageBand === "u12" || profile.ageBand === "u14" || profile.ageBand === "u16";
  const comfort = Boolean(prefs.wantsArmComfort) || profile.prefersComfort;
  const breakerHistory = breakHours !== undefined && breakHours < BREAKER_HOURS;
  const breaker = Boolean(prefs.breaksOften) || breakerHistory;
  const aggressive = (profile.styleAggression ?? 0) >= 7;
  const spin = Boolean(prefs.wantsMoreSpin) || aggressive;
  const stiff = (racket?.stiffnessRa ?? 0) >= STIFF_RA;
  const priority = prefs.priority;
  const patternOpen = racket ? racket.patternMains <= 16 && racket.patternCrosses <= 19 : false;
  const patternDense = racket ? racket.patternMains >= 18 : false;
  const strongLevel = profile.level === "advanced" || profile.level === "competitive";

  // ── Profile facts (say what is known, and what is not) ────────────────────
  if (profile.level) {
    reasons.push(reason("profile_level", { level: profile.level }, `Your profile lists you as ${profile.level}.`));
  } else {
    reasons.push(
      reason("profile_level_unknown", {}, "Your playing level is not on your profile, so the material choice leans on the safer middle ground."),
    );
  }
  if (junior) {
    reasons.push(
      reason(
        "junior_comfort",
        { ageBand: profile.ageBand! },
        "Juniors are steered towards a soft string at the lower half of the frame's range — a developing arm should not be asked to absorb a stiff polyester.",
      ),
    );
  } else if (!profile.ageBand) {
    reasons.push(reason("profile_age_unknown", {}, "No date of birth on the profile, so the junior rule could not be applied either way."));
  }
  if (prefs.wantsArmComfort) {
    reasons.push(reason("comfort_requested", {}, "You asked for arm comfort, so softer materials and the lower half of the tension range are preferred."));
  } else if (profile.prefersComfort) {
    reasons.push(reason("comfort_profile", {}, "Your profile indicates a comfort preference, so softer materials and a lower tension are preferred."));
  }

  // ── History facts ─────────────────────────────────────────────────────────
  if (history.length === 0) {
    reasons.push(reason("history_none", {}, "No string jobs are logged yet, so this starts from the racket rather than from what has worked for you."));
  } else {
    reasons.push(
      reason(
        "history_summary",
        { jobs: history.length, retired: retired.length, lastTensionKg: latest!.tensionMainsKg, lastString: latest!.mainsName ?? "unknown string" },
        `${history.length} string job${history.length === 1 ? "" : "s"} logged; your latest is ${latest!.mainsName ?? "an unnamed string"} at ${latest!.tensionMainsKg} kg.`,
      ),
    );
    if (latest && !latest.retiredAt && (latest.hoursPlayed ?? 0) > 0) {
      reasons.push(
        reason("current_setup_hours", { hours: latest.hoursPlayed! }, `Your current set has ${latest.hoursPlayed} h on it.`),
      );
    }
  }
  if (prefs.breaksOften) {
    reasons.push(reason("breaker_declared", {}, "You said you break strings often."));
  }
  if (breakerHistory) {
    reasons.push(
      reason(
        "breaker_history",
        { breaks: breaks.length, avgHours: round(breakHours!, 1) },
        `Your logged break${breaks.length === 1 ? "" : "s"} came after ${round(breakHours!, 1)} h on average — under ${BREAKER_HOURS} h counts as frequent.`,
      ),
    );
  }

  // ── Material ──────────────────────────────────────────────────────────────
  let primary: MaterialPick;
  const alternatives: MaterialPick[] = [];
  let hybrid: StringsRecommendation["hybrid"];
  /** Which catalogue rating decides the order of "Fits me" picks. */
  let sortKey: keyof Pick<CatalogueString, "comfort" | "durability" | "spin" | "control"> = "control";
  const ratingFilters: Array<(s: CatalogueString) => boolean> = [];

  if (junior || comfort) {
    primary = pick("multifilament", "Soft and arm-friendly, with easy power — the comfortable default.");
    sortKey = "comfort";
    ratingFilters.push((s) => s.comfort >= 7);
    if (profile.ageBand !== "u12" && profile.ageBand !== "u14") {
      alternatives.push(pick("co_polyester", "A soft co-polyester if you want more control and durability; keep the tension low."));
    }
    if (profile.ageBand === "adult" || profile.ageBand === undefined) {
      alternatives.push(pick("natural_gut", "The most comfortable string there is, if the budget allows."));
    } else {
      alternatives.push(pick("synthetic_gut", "A cheaper everyday option that is still soft."));
    }
    if (spin) {
      hybrid = {
        mains: "shaped co-polyester",
        crosses: "multifilament",
        whenItHelps: "When you want more spin without giving up arm comfort — the soft crosses take the edge off the poly.",
      };
      reasons.push(reason("spin_with_comfort", {}, "Spin was asked for too, so a hybrid is offered rather than a full polyester bed."));
    }
    if (breaker) {
      hybrid = {
        mains: "durable co-polyester",
        crosses: "multifilament",
        whenItHelps: "If the multifilament keeps breaking — poly mains last longer while the soft crosses keep it comfortable.",
      };
    }
  } else if (breaker) {
    primary = pick("co_polyester", "A durable co-polyester resists notching and lasts longer between breaks.");
    sortKey = "durability";
    ratingFilters.push((s) => s.durability >= 7);
    alternatives.push(pick("polyester", "Stiffer and longest-lasting, but less comfortable."));
    alternatives.push(pick("hybrid_set", "Poly mains with a multifilament cross if a full poly bed feels too harsh."));
  } else if (spin) {
    primary = pick("co_polyester", "A shaped co-polyester bites the ball for spin and holds tension well.");
    sortKey = "spin";
    ratingFilters.push((s) => s.shape !== "round" || s.spin >= 8);
    alternatives.push(pick("polyester", "A round polyester if you want a more predictable, lower-launch response."));
    alternatives.push(pick("hybrid_set", "Shaped poly mains with a softer cross for comfort."));
    reasons.push(
      reason(
        "spin_priority",
        { requested: Boolean(prefs.wantsMoreSpin), aggressive },
        prefs.wantsMoreSpin
          ? "You asked for more spin, so a shaped co-polyester is recommended."
          : "Your profile reads as an aggressive baseliner, so a shaped co-polyester is recommended.",
      ),
    );
  } else if (priority === "control") {
    primary = pick("co_polyester", "A control co-polyester keeps the ball in with a full swing.");
    sortKey = "control";
    ratingFilters.push((s) => s.control >= 8);
    alternatives.push(pick("polyester", "A firmer polyester for maximum control if comfort is not a concern."));
    alternatives.push(pick("hybrid_set", "Poly mains with a softer cross if you want a little more feel."));
    reasons.push(reason("priority_control", {}, "You chose control as the priority."));
  } else if (priority === "power") {
    primary = pick("multifilament", "A multifilament gives free power and a lively response.");
    sortKey = "comfort";
    alternatives.push(pick("natural_gut", "The liveliest option, if the budget allows."));
    alternatives.push(pick("synthetic_gut", "A budget option with a similar feel."));
    reasons.push(reason("priority_power", {}, "You chose power as the priority, so a soft, lively material is recommended."));
  } else if (priority === "balanced") {
    primary = pick("co_polyester", "A softer co-polyester balances control, spin and comfort.");
    sortKey = "comfort";
    ratingFilters.push((s) => s.comfort >= 6);
    alternatives.push(pick("multifilament", "If comfort matters more than control."));
    alternatives.push(pick("hybrid_set", "Poly mains and a multifilament cross is the classic balanced setup."));
    hybrid = {
      mains: "co-polyester",
      crosses: "multifilament",
      whenItHelps: "When you want the control of poly and the comfort of a multifilament in one racket.",
    };
    reasons.push(reason("priority_balanced", {}, "You chose balanced, so a softer co-polyester with a hybrid option is recommended."));
  } else if (profile.level === "beginner" || profile.level === "intermediate") {
    primary = pick("multifilament", "Soft, forgiving and powerful — the right default while technique is developing.");
    sortKey = "comfort";
    alternatives.push(pick("synthetic_gut", "The budget option with similar feel."));
    alternatives.push(pick("co_polyester", "Only if you generate a lot of your own pace and want more control."));
    reasons.push(reason("level_developing", { level: profile.level }, "At a developing level a soft string rewards a growing swing; polyester can wait."));
  } else if (strongLevel) {
    primary = pick("co_polyester", "A co-polyester for the control and spin a full swing needs.");
    sortKey = "control";
    alternatives.push(pick("multifilament", "If your arm needs a break from poly."));
    alternatives.push(pick("hybrid_set", "Poly mains and a softer cross for a little more feel."));
    reasons.push(reason("level_strong", { level: profile.level! }, "At your level a co-polyester gives the control a full swing needs."));
  } else {
    // Nothing to go on: the safe middle — a soft co-poly rather than a stiff one.
    primary = pick("co_polyester", "A softer co-polyester — the safe middle ground when little is known about you yet.");
    sortKey = "comfort";
    ratingFilters.push((s) => s.comfort >= 6);
    alternatives.push(pick("multifilament", "If you prefer a softer, livelier feel."));
    alternatives.push(pick("hybrid_set", "Poly mains and a multifilament cross if you want both control and comfort."));
    reasons.push(reason("default_middle_ground", {}, "With no level, no preference answers and no comfort signal, a soft co-polyester is the safe middle ground."));
  }

  // Stiff frame → soften. Polyester steps down to co-poly; a co-poly must be a soft one.
  if (stiff) {
    reasons.push(
      reason(
        "frame_stiff",
        { stiffnessRa: racket!.stiffnessRa! },
        `${racket!.name} is a stiff frame (RA ${racket!.stiffnessRa}), so a softer string and a slightly lower tension are recommended.`,
      ),
    );
    if (primary.material === "polyester") primary = pick("co_polyester", "A softer co-polyester — the frame is stiff enough already.");
    if (isPoly(primary.material)) {
      ratingFilters.push((s) => s.comfort >= 6);
      if (!hybrid) {
        hybrid = {
          mains: "co-polyester",
          crosses: "multifilament",
          whenItHelps: "To take the edge off a stiff frame while keeping poly control in the mains.",
        };
      }
    }
  }

  // ── Gauge ─────────────────────────────────────────────────────────────────
  let gaugeMm = isPoly(primary.material) ? 1.25 : 1.3;
  if (breaker) {
    gaugeMm += 0.05;
    reasons.push(
      reason(
        "gauge_thicker_for_breaks",
        { gaugeMm: round(gaugeMm, 2) },
        `A thicker ${round(gaugeMm, 2)} mm gauge is the first answer to breaking strings — not a higher tension.`,
      ),
    );
    reasons.push(
      reason(
        "breaker_no_tension_increase",
        {},
        "Tension is deliberately NOT raised for breakage: tighter strings break sooner and are harder on the arm.",
      ),
    );
  } else if (spin && !junior && !comfort && strongLevel) {
    gaugeMm = 1.2;
    reasons.push(reason("gauge_thinner_for_spin", { gaugeMm: 1.2 }, "A thinner 1.20 mm gauge bites the ball more for spin; it will not last as long."));
  } else {
    reasons.push(reason("gauge_standard", { gaugeMm: round(gaugeMm, 2) }, `${round(gaugeMm, 2)} mm is the standard gauge for this material.`));
  }
  const gauge = gaugeOf(gaugeMm);

  // ── Tension ───────────────────────────────────────────────────────────────
  const band: [number, number] = racket?.bandKg ?? DEFAULT_BAND_KG;
  let anchoredTo: StringsRecommendation["tension"]["anchoredTo"];
  let centre: number;

  if (!racket?.bandKg) {
    reasons.push(
      reason(
        "band_unknown",
        { defaultMinKg: DEFAULT_BAND_KG[0], defaultMaxKg: DEFAULT_BAND_KG[1] },
        racket
          ? `${racket.name} is not linked to a catalogue product, so its recommended range is unknown; a typical ${DEFAULT_BAND_KG[0]}–${DEFAULT_BAND_KG[1]} kg range is assumed.`
          : `No racket is linked, so a typical ${DEFAULT_BAND_KG[0]}–${DEFAULT_BAND_KG[1]} kg range is assumed.`,
      ),
    );
  }

  if (latest) {
    // Start from what the player actually strings at. Frame-derived rules
    // (pattern, midpoint) are already baked into a tension they have lived
    // with, so only situational adjustments apply on top.
    anchoredTo = "history";
    centre = clamp(latest.tensionMainsKg, band[0], band[1]);
    reasons.push(
      reason("anchor_history", { tensionKg: latest.tensionMainsKg }, `Starting from the ${latest.tensionMainsKg} kg you last strung at.`),
    );
    if (junior || comfort || priority === "power") {
      centre -= 0.5;
      reasons.push(reason("tension_softer", { deltaKg: -0.5 }, "Half a kilo lower for a softer, more forgiving string bed."));
    }
    // The junior/comfort rule is "lower half of the frame's range". A history
    // anchor does not override it: a junior who was last strung at the top of
    // the band is brought down to its midpoint, not kept there because that is
    // what happened last time.
    const midpoint = (band[0] + band[1]) / 2;
    if ((junior || comfort) && centre > midpoint) {
      centre = midpoint;
      reasons.push(
        reason(
          "tension_capped_lower_half",
          { minKg: band[0], maxKg: band[1], lastTensionKg: latest.tensionMainsKg },
          `Your last ${latest.tensionMainsKg} kg sits in the upper half of the ${band[0]}–${band[1]} kg range; for comfort this is brought down to the middle.`,
        ),
      );
    }
    if (priority === "control" && !breaker) {
      centre += 0.5;
      reasons.push(reason("tension_control", { deltaKg: 0.5 }, "Half a kilo higher for control, since that is the priority."));
    }
  } else {
    anchoredTo = racket?.bandKg ? "racket_band" : "default_band";
    centre = (band[0] + band[1]) / 2;
    if (junior || comfort || priority === "power") {
      centre = band[0] + (band[1] - band[0]) * 0.25;
      reasons.push(
        reason("tension_lower_half", { minKg: band[0], maxKg: band[1] }, `Aimed at the lower half of the ${band[0]}–${band[1]} kg range for comfort and power.`),
      );
    } else {
      reasons.push(reason("tension_midpoint", { minKg: band[0], maxKg: band[1] }, `Starting from the middle of the ${band[0]}–${band[1]} kg range.`));
    }
    if (racket && patternOpen) {
      centre += 0.5;
      reasons.push(
        reason(
          "pattern_open",
          { mains: racket.patternMains, crosses: racket.patternCrosses },
          `A ${racket.patternMains}×${racket.patternCrosses} pattern is open, so half a kilo more gives back some control.`,
        ),
      );
    } else if (racket && patternDense) {
      centre -= 0.5;
      reasons.push(
        reason(
          "pattern_dense",
          { mains: racket.patternMains, crosses: racket.patternCrosses },
          `A ${racket.patternMains}×${racket.patternCrosses} pattern is dense and already controlled, so half a kilo less keeps some feel.`,
        ),
      );
    }
    if (priority === "control" && !breaker) {
      centre += 0.5;
      reasons.push(reason("tension_control", { deltaKg: 0.5 }, "Half a kilo higher for control, since that is the priority."));
    }
  }

  if (stiff) {
    centre -= 0.5;
    reasons.push(reason("tension_stiff_frame", { deltaKg: -0.5 }, "Half a kilo lower to soften a stiff frame."));
  }

  // Conditions at the next tournament, from the shared physics — never recomputed here.
  if (input.nextTournament && !input.nextTournament.physics) {
    reasons.push(
      reason(
        "conditions_unavailable",
        { tournament: input.nextTournament.name },
        `${input.nextTournament.name}: no temperature or altitude data was available, so nothing was adjusted for conditions.`,
      ),
    );
  } else if (input.nextTournament) {
    const { physics, name } = input.nextTournament;
    const pct = physics!.densityVsReferencePct;
    let delta = 0;
    if (pct <= VERY_THIN_AIR_PCT) delta = 1;
    else if (pct <= THIN_AIR_PCT) delta = 0.5;
    else if (pct >= VERY_HEAVY_AIR_PCT) delta = -1;
    else if (pct >= HEAVY_AIR_PCT) delta = -0.5;

    if (delta > 0) {
      reasons.push(
        reason(
          "conditions_hot_thin",
          { tournament: name, densityVsReferencePct: pct, deltaKg: delta },
          `${name}: the air is ${Math.abs(pct)}% thinner than a mild sea-level day, so the ball flies — ${delta} kg more for control.`,
        ),
      );
    } else if (delta < 0) {
      reasons.push(
        reason(
          "conditions_cold_heavy",
          { tournament: name, densityVsReferencePct: pct, deltaKg: delta },
          `${name}: the air is ${pct}% heavier than a mild sea-level day, so the ball sits — ${Math.abs(delta)} kg less for depth and feel.`,
        ),
      );
    } else {
      reasons.push(
        reason("conditions_neutral", { tournament: name, densityVsReferencePct: pct }, `${name}: ordinary air density, no tension change for conditions.`),
      );
    }
    centre += delta;
  }

  // A 1 kg window around the centre, kept inside the racket's band.
  let lo = roundHalf(centre - 0.5);
  let hi = roundHalf(centre + 0.5);
  const width = band[1] - band[0];
  if (width < 1) {
    lo = band[0];
    hi = band[1];
  } else if (lo < band[0]) {
    hi += band[0] - lo;
    lo = band[0];
  } else if (hi > band[1]) {
    lo -= hi - band[1];
    hi = band[1];
  }
  if (roundHalf(centre - 0.5) !== lo || roundHalf(centre + 0.5) !== hi) {
    reasons.push(
      reason("band_clamped", { minKg: band[0], maxKg: band[1] }, `Kept inside the frame's ${band[0]}–${band[1]} kg range.`),
    );
  }
  const mainsKg: [number, number] = [round(lo, 1), round(hi, 1)];
  const crossesKg: [number, number] = [...mainsKg];
  reasons.push(reason("crosses_same_as_mains", {}, "Crosses at the same tension as the mains — one number to give the stringer."));

  // ── Cadence ───────────────────────────────────────────────────────────────
  let restringCadence: StringsRecommendation["restringCadence"];
  if (retiredWithHours.length >= CADENCE_MIN_JOBS) {
    const hours = Math.round(mean(retiredWithHours.map((s) => s.hoursPlayed!))!);
    restringCadence = {
      hours,
      basis: `based on your last ${retiredWithHours.length} finished string job${retiredWithHours.length === 1 ? "" : "s"}`,
    };
    reasons.push(
      reason(
        "restring_cadence",
        { hours, jobs: retiredWithHours.length },
        `Restring about every ${hours} hours of play, ${restringCadence.basis}.`,
      ),
    );
  }

  // ── Catalogue picks ("Fits me") ───────────────────────────────────────────
  const productIds = pickFromCatalogue(input.catalogue, primary.material, gauge.mm, ratingFilters, sortKey);
  if (ratingFilters.length > 0 && productIds.length > 0) {
    reasons.push(
      reason(
        "ratings_are_estimates",
        {},
        "Catalogue picks use the catalogue's 1–10 ratings, which are editorial estimates — strings are rated, not measured.",
      ),
    );
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  const confidence = confidenceFor(Boolean(racket?.bandKg), retiredWithHours.length, Boolean(profile.level));

  // ── Cautions ──────────────────────────────────────────────────────────────
  const cautions: Caution[] = profile.painMentioned ? [SEEK_ASSESSMENT_CAUTION] : [];

  return {
    material: primary,
    alternatives: alternatives.slice(0, 2),
    gauge,
    tension: { mainsKg, crossesKg, racketBandKg: racket?.bandKg ?? null, anchoredTo },
    hybrid,
    restringCadence,
    reasons,
    confidence,
    cautions,
    pickFromCatalogue: { productIds },
  };
}

/**
 * Filter the catalogue slice down to what the recommendation actually says,
 * relaxing step by step rather than returning nothing: material is a hard
 * filter; gauge (±0.05 mm) and the rating thresholds are dropped in turn if
 * they empty the list. Order is by the deciding rating, then id — stable.
 */
export function pickFromCatalogue(
  catalogue: CatalogueString[],
  material: StringMaterial,
  gaugeMm: number,
  ratingFilters: Array<(s: CatalogueString) => boolean>,
  sortKey: "comfort" | "durability" | "spin" | "control",
): string[] {
  const byMaterial = catalogue.filter((s) => s.material === material);
  const gaugeOk = (s: CatalogueString) => Math.abs(s.gaugeMm - gaugeMm) <= 0.051;
  const ratingsOk = (s: CatalogueString) => ratingFilters.every((f) => f(s));

  let chosen = byMaterial.filter((s) => gaugeOk(s) && ratingsOk(s));
  if (chosen.length === 0) chosen = byMaterial.filter(ratingsOk);
  if (chosen.length === 0) chosen = byMaterial.filter(gaugeOk);
  if (chosen.length === 0) chosen = byMaterial;

  return [...chosen]
    .sort((a, b) => b[sortKey] - a[sortKey] || a.id.localeCompare(b.id))
    .map((s) => s.id);
}

/** The ladder, spelled out so the doc and the code cannot drift. */
export function confidenceFor(bandKnown: boolean, retiredJobsWithHours: number, levelKnown: boolean): Confidence {
  let level: Confidence["level"];
  if (!bandKnown || retiredJobsWithHours === 0 || !levelKnown) level = "low";
  else if (retiredJobsWithHours >= 3) level = "high";
  else level = "medium";

  let raisedBy: string;
  if (!bandKnown) {
    raisedBy = "Link your racket to a catalogue product so its recommended tension range is known — that alone lifts this to medium.";
  } else if (retiredJobsWithHours === 0) {
    raisedBy = "Log your finished string jobs with hours played — two of them make this medium, three make it high.";
  } else if (!levelKnown) {
    raisedBy = `Add your playing level to your profile and this becomes ${retiredJobsWithHours >= 3 ? "high" : "medium"}.`;
  } else if (retiredJobsWithHours < 3) {
    const n = 3 - retiredJobsWithHours;
    raisedBy = `Log ${n} more finished string job${n === 1 ? "" : "s"} with hours played and this becomes high.`;
  } else {
    raisedBy = "This is as confident as the v1 rules get.";
  }
  return { level, raisedBy };
}
