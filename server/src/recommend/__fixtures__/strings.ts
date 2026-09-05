// Fixtures for the strings engine. The catalogue slice mirrors the 14 seeded
// strings (ids, materials, gauges, shapes and the editorial 1–10 ratings) so a
// test can assert a REAL product id the UI will show, not a made-up one.

import { computeConditions } from "../../conditions/physics";
import type { CatalogueString, RacketFacts, SetupFact, StringsInput, StringsProfileFacts } from "../strings";

export const CATALOGUE_STRINGS: CatalogueString[] = [
  { id: "prod-babolat-rpm-blast-125", brand: "Babolat", model: "RPM Blast", material: "co_polyester", gaugeMm: 1.25, shape: "octagonal", power: 5, control: 8, spin: 9, comfort: 4, durability: 7 },
  { id: "prod-babolat-vs-touch-130", brand: "Babolat", model: "VS Touch", material: "natural_gut", gaugeMm: 1.3, shape: "round", power: 10, control: 6, spin: 5, comfort: 10, durability: 4 },
  { id: "prod-head-lynx-tour-125", brand: "Head", model: "Lynx Tour", material: "co_polyester", gaugeMm: 1.25, shape: "hexagonal", power: 6, control: 8, spin: 8, comfort: 6, durability: 7 },
  { id: "prod-head-velocity-mlt-130", brand: "Head", model: "Velocity MLT", material: "multifilament", gaugeMm: 1.3, shape: "round", power: 8, control: 5, spin: 4, comfort: 9, durability: 5 },
  { id: "prod-luxilon-4g-125", brand: "Luxilon", model: "4G", material: "co_polyester", gaugeMm: 1.25, shape: "round", power: 4, control: 9, spin: 7, comfort: 3, durability: 9 },
  { id: "prod-luxilon-alu-power-125", brand: "Luxilon", model: "ALU Power", material: "co_polyester", gaugeMm: 1.25, shape: "round", power: 5, control: 9, spin: 8, comfort: 3, durability: 8 },
  { id: "prod-luxilon-element-125", brand: "Luxilon", model: "Element", material: "co_polyester", gaugeMm: 1.25, shape: "round", power: 6, control: 7, spin: 6, comfort: 7, durability: 6 },
  { id: "prod-prince-synthetic-gut-duraflex-16", brand: "Prince", model: "Synthetic Gut Duraflex", material: "synthetic_gut", gaugeMm: 1.3, shape: "round", power: 7, control: 5, spin: 4, comfort: 7, durability: 6 },
  { id: "prod-solinco-hyper-g-120", brand: "Solinco", model: "Hyper-G", material: "co_polyester", gaugeMm: 1.2, shape: "textured", power: 5, control: 9, spin: 9, comfort: 5, durability: 5 },
  { id: "prod-solinco-tour-bite-125", brand: "Solinco", model: "Tour Bite", material: "co_polyester", gaugeMm: 1.25, shape: "textured", power: 4, control: 9, spin: 10, comfort: 3, durability: 7 },
  { id: "prod-tecnifibre-razor-code-125", brand: "Tecnifibre", model: "Razor Code", material: "co_polyester", gaugeMm: 1.25, shape: "pentagonal", power: 5, control: 9, spin: 8, comfort: 5, durability: 7 },
  { id: "prod-tecnifibre-x-one-biphase-130", brand: "Tecnifibre", model: "X-One Biphase", material: "multifilament", gaugeMm: 1.3, shape: "round", power: 9, control: 5, spin: 4, comfort: 10, durability: 4 },
  { id: "prod-wilson-nxt-16", brand: "Wilson", model: "NXT", material: "multifilament", gaugeMm: 1.3, shape: "round", power: 8, control: 5, spin: 4, comfort: 9, durability: 5 },
  { id: "prod-yonex-poly-tour-pro-125", brand: "Yonex", model: "Poly Tour Pro", material: "polyester", gaugeMm: 1.25, shape: "round", power: 6, control: 8, spin: 7, comfort: 7, durability: 7 },
];

/** p1's frame as seeded: 16×19, RA 66, 23–27 kg. */
export const PRO_STAFF_97: RacketFacts = {
  name: "Wilson Pro Staff 97 v14",
  patternMains: 16,
  patternCrosses: 19,
  stiffnessRa: 66,
  bandKg: [23, 27],
};

export const DENSE_18x20: RacketFacts = {
  name: "Wilson Blade 98 18x20 v9",
  patternMains: 18,
  patternCrosses: 20,
  stiffnessRa: 62,
  bandKg: [23, 27],
};

export const STIFF_FRAME: RacketFacts = {
  name: "Babolat Pure Drive",
  patternMains: 16,
  patternCrosses: 19,
  stiffnessRa: 71,
  bandKg: [23, 27],
};

/** A racket in the bag but not linked to a catalogue product. */
export const UNLINKED_RACKET: RacketFacts = {
  name: "Old frame",
  patternMains: 16,
  patternCrosses: 19,
};

/** p1's three seeded jobs: broke at 14 h, dead at 22 h, current with 6 h. */
export const P1_HISTORY: SetupFact[] = [
  { strungAt: "2026-05-07T00:00:00.000Z", retiredAt: "2026-05-21T00:00:00.000Z", hoursPlayed: 14, tensionMainsKg: 23, retiredReason: "broke", mainsName: "Luxilon ALU Power" },
  { strungAt: "2026-05-27T00:00:00.000Z", retiredAt: "2026-07-04T00:00:00.000Z", hoursPlayed: 22, tensionMainsKg: 22, retiredReason: "dead", mainsName: "Head Lynx Tour" },
  { strungAt: "2026-08-23T00:00:00.000Z", hoursPlayed: 6, tensionMainsKg: 22.5, mainsName: "Solinco Hyper-G" },
];

/** Two breaks in under ten hours each — a frequent breaker by history alone. */
export const BREAKER_HISTORY: SetupFact[] = [
  { strungAt: "2026-06-01T00:00:00.000Z", retiredAt: "2026-06-08T00:00:00.000Z", hoursPlayed: 6, tensionMainsKg: 24, retiredReason: "broke", mainsName: "Luxilon ALU Power" },
  { strungAt: "2026-06-09T00:00:00.000Z", retiredAt: "2026-06-18T00:00:00.000Z", hoursPlayed: 8, tensionMainsKg: 24, retiredReason: "broke", mainsName: "Luxilon ALU Power" },
  { strungAt: "2026-06-20T00:00:00.000Z", hoursPlayed: 2, tensionMainsKg: 24, mainsName: "Luxilon ALU Power" },
];

export const ADULT_ADVANCED: StringsProfileFacts = {
  level: "advanced",
  ageBand: "adult",
  prefersComfort: false,
  painMentioned: false,
};

export const JUNIOR_U14: StringsProfileFacts = {
  level: "intermediate",
  ageBand: "u14",
  prefersComfort: false,
  painMentioned: false,
};

/** A profile whose injury text was reduced to the two booleans. */
export const PAIN_MENTIONED: StringsProfileFacts = {
  level: "advanced",
  ageBand: "adult",
  prefersComfort: true,
  painMentioned: true,
};

/** Exactly p1 today: no profile row, no date of birth. */
export const UNKNOWN_PROFILE: StringsProfileFacts = {
  prefersComfort: false,
  painMentioned: false,
};

/** Hot, high and dry — Denver in summer. Density well below the reference. */
export const HOT_THIN_PHYSICS = computeConditions({ temperatureC: 32, altitudeM: 1600, humidityPct: 20 });

/** Cold sea-level morning. Density above the reference. */
export const COLD_HEAVY_PHYSICS = computeConditions({ temperatureC: 4, altitudeM: 0, humidityPct: 60 });

export const NOW = "2026-09-04T12:00:00.000Z";

export function stringsInput(overrides: Partial<StringsInput> = {}): StringsInput {
  return {
    now: NOW,
    profile: ADULT_ADVANCED,
    racket: PRO_STAFF_97,
    history: [],
    prefs: {},
    catalogue: CATALOGUE_STRINGS,
    ...overrides,
  };
}
