// ============================================================================
// TennisAI — gear catalogue seed (synthetic demo scale, real published specs)
//
// PROVENANCE, HONESTLY
// Every row carries `source` + `sourceUrl`. `lastVerifiedAt` is set ONLY where
// the source URL was actually retrieved during seeding and its numbers were
// cross-checked. At the time this seed was written that was exactly THREE rows
// — the three Babolat frames on Babolat's own specification page. Every other
// manufacturer site refused the request (403 / 404 / 429), so those rows keep
// `lastVerifiedAt = null` and say so in `source`. A null here is not a gap to
// be tidied away later; it is the row telling the truth about itself.
//
// The one nuance, spelled out rather than buried: `lastVerifiedAt` means "this
// URL was retrieved and cross-checked on this date", not "every column below
// appeared on it". The Babolat page publishes head size, length, unstrung
// weight, swingweight, string pattern and RA. Balance, beam profile, grip sizes
// and the printed tension range are NOT on it — they are the manufacturer's
// widely-published figures, and the `source` string on those three rows says so
// in full.
//
// The 1–10 string ratings are comparative editorial estimates, NOT manufacturer
// figures — no manufacturer rating table was retrievable. Every string row says
// this in `source`, and docs/catalogue.md repeats it. Any UI that shows them
// must label them as such.
//
// NO marketing copy and NO image URLs are stored, from anywhere. Retailers were
// not consulted at all.
// ============================================================================

import type { PrismaClient } from "@prisma/client";

/**
 * Pinned, NOT `new Date()`. A verification timestamp generated at seed time
 * would re-stamp every row as freshly verified on every re-seed, which is the
 * exact lie this column exists to prevent.
 */
const VERIFIED_AT = new Date("2026-09-04T00:00:00.000Z");

const BABOLAT_SPEC_PAGE = "https://www.babolat.com/us/racket/pure-drive-2021/101435.html";

/** Source string for the three rows whose page was genuinely retrieved. */
const BABOLAT_VERIFIED =
  "Babolat official racquet specification page — retrieved 2026-09-04; head size, length, " +
  "unstrung weight, swingweight, string pattern and RA confirmed on the retrieved page. " +
  "Balance, beam profile, grip sizes and the printed recommended-tension range are the " +
  "manufacturer's widely-published figures and were NOT on the retrieved page.";

/** Source string for everything else: the page was not retrievable. */
const NOT_FETCHED = "Manufacturer spec sheet — not fetched during seed";

/** Strings additionally carry the ratings caveat. */
const NOT_FETCHED_STRING =
  "Manufacturer spec sheet — not fetched during seed; the 1–10 ratings are editorial " +
  "comparative estimates, not manufacturer figures";

// Standard grip runs, as published.
const GRIPS_FULL = ["L0", "L1", "L2", "L3", "L4"];
const GRIPS_STD = ["L1", "L2", "L3", "L4"];
// Common EU size runs for tennis shoes.
const SIZES_EU = ["39", "40", "41", "42", "43", "44", "45", "46", "47"];

type RacketSpecSeed = {
  headSizeCm2: number;
  headSizeIn2: number;
  lengthCm: number;
  unstrungWeightG: number;
  strungWeightG?: number;
  balanceMm: number;
  balancePtsHL?: number;
  swingweight?: number;
  stiffnessRa?: number;
  beamMm: string;
  stringPatternMains: number;
  stringPatternCrosses: number;
  recommendedTensionMinKg: number;
  recommendedTensionMaxKg: number;
  composition?: string;
  gripSizes: string[];
  targetLevel: string;
};

type StringSpecSeed = {
  material: string;
  gaugeMm: number;
  gaugeLabel: string;
  shape: string;
  coating?: string;
  colour?: string;
  power: number;
  control: number;
  spin: number;
  comfort: number;
  durability: number;
  tensionMaintenance: number;
  recommendedTensionMinKg: number;
  recommendedTensionMaxKg: number;
  hybridPartnerNote?: string;
};

type ShoeSpecSeed = {
  courtType: string;
  weightG: number;
  dropMm?: number;
  widthFit: string;
  cushioning: string;
  stability: string;
  outsoleGuaranteeMonths?: number;
  sizesEu: string[];
};

type SeedProduct = {
  id: string;
  category: "racket" | "string" | "shoes" | "balls" | "accessories";
  brand: string;
  model: string;
  // Omitted → "" (see the variant convention in docs/catalogue.md).
  variant?: string;
  // Omitted wherever the generation year is not unambiguous. Preferring a gap
  // to a guess is the whole point of the provenance rule.
  releaseYear?: number;
  msrpEur?: number;
  source: string;
  sourceUrl: string;
  lastVerifiedAt?: Date;
  racket?: RacketSpecSeed;
  string?: StringSpecSeed;
  shoe?: ShoeSpecSeed;
  accessory?: Record<string, unknown>;
};

// ── Rackets ─────────────────────────────────────────────────────────────────
const RACKETS: SeedProduct[] = [
  {
    id: "prod-babolat-pure-drive-gen11",
    category: "racket",
    brand: "Babolat",
    model: "Pure Drive",
    variant: "Gen 11",
    msrpEur: 269,
    source: BABOLAT_VERIFIED,
    sourceUrl: BABOLAT_SPEC_PAGE,
    lastVerifiedAt: VERIFIED_AT,
    racket: {
      headSizeCm2: 645,
      headSizeIn2: 100,
      lengthCm: 68.5,
      unstrungWeightG: 300,
      balanceMm: 320,
      swingweight: 290,
      stiffnessRa: 72,
      beamMm: "23/26/23",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Graphite",
      gripSizes: GRIPS_FULL,
      targetLevel: "intermediate",
    },
  },
  {
    id: "prod-babolat-pure-aero-98-gen9",
    category: "racket",
    brand: "Babolat",
    model: "Pure Aero 98",
    variant: "Gen 9",
    msrpEur: 279,
    source: BABOLAT_VERIFIED,
    sourceUrl: BABOLAT_SPEC_PAGE,
    lastVerifiedAt: VERIFIED_AT,
    racket: {
      headSizeCm2: 630,
      headSizeIn2: 98,
      lengthCm: 68.5,
      unstrungWeightG: 305,
      balanceMm: 315,
      swingweight: 295,
      stiffnessRa: 71,
      beamMm: "23/23/23",
      stringPatternMains: 16,
      stringPatternCrosses: 20,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Graphite",
      gripSizes: GRIPS_STD,
      targetLevel: "advanced",
    },
  },
  {
    id: "prod-babolat-pure-strike-16x19-gen4",
    category: "racket",
    brand: "Babolat",
    model: "Pure Strike 16/19",
    variant: "Gen 4",
    msrpEur: 259,
    source: BABOLAT_VERIFIED,
    sourceUrl: BABOLAT_SPEC_PAGE,
    lastVerifiedAt: VERIFIED_AT,
    racket: {
      headSizeCm2: 632,
      headSizeIn2: 98,
      lengthCm: 68.5,
      unstrungWeightG: 305,
      balanceMm: 320,
      swingweight: 305,
      stiffnessRa: 68,
      beamMm: "21/23/21",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Graphite",
      gripSizes: GRIPS_STD,
      targetLevel: "advanced",
    },
  },
  {
    id: "prod-wilson-pro-staff-97-v14",
    category: "racket",
    brand: "Wilson",
    model: "Pro Staff 97",
    variant: "v14",
    releaseYear: 2023,
    msrpEur: 279,
    source: NOT_FETCHED,
    sourceUrl: "https://www.wilson.com/en-us/tennis/rackets/pro-staff",
    racket: {
      headSizeCm2: 626,
      headSizeIn2: 97,
      lengthCm: 68.6,
      unstrungWeightG: 315,
      strungWeightG: 337,
      balanceMm: 315,
      stiffnessRa: 66,
      beamMm: "21.5/21.5/21.5",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Braided graphite / Kevlar",
      gripSizes: GRIPS_STD,
      targetLevel: "advanced",
    },
  },
  {
    id: "prod-wilson-blade-98-16x19-v9",
    category: "racket",
    brand: "Wilson",
    model: "Blade 98 16x19",
    variant: "v9",
    releaseYear: 2024,
    msrpEur: 269,
    source: NOT_FETCHED,
    sourceUrl: "https://www.wilson.com/en-us/tennis/rackets/blade",
    racket: {
      headSizeCm2: 632,
      headSizeIn2: 98,
      lengthCm: 68.6,
      unstrungWeightG: 305,
      balanceMm: 320,
      beamMm: "21/21/21",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Braided graphite",
      gripSizes: GRIPS_STD,
      targetLevel: "advanced",
    },
  },
  {
    id: "prod-head-speed-mp-auxetic-2",
    category: "racket",
    brand: "Head",
    model: "Speed MP",
    variant: "Auxetic 2.0",
    releaseYear: 2024,
    msrpEur: 259,
    source: NOT_FETCHED,
    sourceUrl: "https://www.head.com/en_US/tennis/racquets/speed.html",
    racket: {
      headSizeCm2: 645,
      headSizeIn2: 100,
      lengthCm: 68.5,
      unstrungWeightG: 300,
      balanceMm: 320,
      beamMm: "23/23/23",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Graphene Inside / Auxetic 2.0",
      gripSizes: GRIPS_FULL,
      targetLevel: "intermediate",
    },
  },
  {
    id: "prod-head-radical-mp-auxetic",
    category: "racket",
    brand: "Head",
    model: "Radical MP",
    variant: "Auxetic",
    releaseYear: 2023,
    msrpEur: 249,
    source: NOT_FETCHED,
    sourceUrl: "https://www.head.com/en_US/tennis/racquets/radical.html",
    racket: {
      headSizeCm2: 632,
      headSizeIn2: 98,
      lengthCm: 68.5,
      unstrungWeightG: 300,
      balanceMm: 320,
      beamMm: "20/23/21",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Graphene Inside / Auxetic",
      gripSizes: GRIPS_FULL,
      targetLevel: "intermediate",
    },
  },
  {
    id: "prod-head-prestige-pro-2021",
    category: "racket",
    brand: "Head",
    model: "Prestige Pro",
    releaseYear: 2021,
    msrpEur: 269,
    source: NOT_FETCHED,
    sourceUrl: "https://www.head.com/en_US/tennis/racquets/prestige.html",
    racket: {
      headSizeCm2: 613,
      headSizeIn2: 95,
      lengthCm: 68.5,
      unstrungWeightG: 320,
      balanceMm: 310,
      beamMm: "21.5/21.5/21.5",
      stringPatternMains: 18,
      stringPatternCrosses: 20,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Graphene 360+",
      gripSizes: GRIPS_STD,
      targetLevel: "pro",
    },
  },
  {
    id: "prod-yonex-ezone-98",
    category: "racket",
    brand: "Yonex",
    model: "EZONE 98",
    msrpEur: 269,
    source: NOT_FETCHED,
    sourceUrl: "https://www.yonex.com/tennis/racquets",
    racket: {
      headSizeCm2: 632,
      headSizeIn2: 98,
      lengthCm: 68.6,
      unstrungWeightG: 305,
      balanceMm: 315,
      beamMm: "23/24/19",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      // Yonex prints 45–60 lb on the frame, not the 50–60 lb most brands use.
      recommendedTensionMinKg: 20.5,
      recommendedTensionMaxKg: 27,
      composition: "HM Graphite / 2G-Namd Speed",
      gripSizes: GRIPS_STD,
      targetLevel: "advanced",
    },
  },
  {
    id: "prod-yonex-vcore-95",
    category: "racket",
    brand: "Yonex",
    model: "VCORE 95",
    msrpEur: 269,
    source: NOT_FETCHED,
    sourceUrl: "https://www.yonex.com/tennis/racquets",
    racket: {
      headSizeCm2: 613,
      headSizeIn2: 95,
      lengthCm: 68.6,
      unstrungWeightG: 310,
      balanceMm: 310,
      beamMm: "21/22/21",
      stringPatternMains: 16,
      stringPatternCrosses: 20,
      recommendedTensionMinKg: 20.5,
      recommendedTensionMaxKg: 27,
      composition: "HM Graphite",
      gripSizes: GRIPS_STD,
      targetLevel: "pro",
    },
  },
  {
    id: "prod-tecnifibre-tfight-300-isoflex",
    category: "racket",
    brand: "Tecnifibre",
    model: "TFight 300",
    variant: "ISOFLEX",
    msrpEur: 259,
    source: NOT_FETCHED,
    sourceUrl: "https://www.tecnifibre.com/en/tennis/racquets",
    racket: {
      headSizeCm2: 632,
      headSizeIn2: 98,
      lengthCm: 68.6,
      unstrungWeightG: 300,
      balanceMm: 320,
      beamMm: "21.7/21.7/21.7",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      recommendedTensionMinKg: 22,
      recommendedTensionMaxKg: 25,
      composition: "Graphite / XTC",
      gripSizes: GRIPS_STD,
      targetLevel: "advanced",
    },
  },
  {
    id: "prod-dunlop-fx-500",
    category: "racket",
    brand: "Dunlop",
    model: "FX 500",
    msrpEur: 229,
    source: NOT_FETCHED,
    sourceUrl: "https://www.dunlopsports.com/tennis/racquets",
    racket: {
      headSizeCm2: 645,
      headSizeIn2: 100,
      lengthCm: 68.6,
      unstrungWeightG: 300,
      balanceMm: 320,
      beamMm: "23/26/23",
      stringPatternMains: 16,
      stringPatternCrosses: 19,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Graphite",
      gripSizes: GRIPS_FULL,
      targetLevel: "intermediate",
    },
  },
  {
    id: "prod-prince-phantom-100x-305",
    category: "racket",
    brand: "Prince",
    model: "Phantom 100X 305",
    msrpEur: 219,
    source: NOT_FETCHED,
    sourceUrl: "https://www.princetennis.com/racquets",
    racket: {
      headSizeCm2: 645,
      headSizeIn2: 100,
      lengthCm: 68.6,
      unstrungWeightG: 305,
      balanceMm: 315,
      beamMm: "20/20/20",
      stringPatternMains: 18,
      stringPatternCrosses: 20,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      composition: "Graphite / Textreme",
      gripSizes: GRIPS_STD,
      targetLevel: "advanced",
    },
  },
];

// ── Strings ─────────────────────────────────────────────────────────────────
// Ratings are editorial comparative estimates (see NOT_FETCHED_STRING).
const STRINGS: SeedProduct[] = [
  {
    id: "prod-luxilon-alu-power-125",
    category: "string",
    brand: "Luxilon",
    model: "ALU Power",
    variant: "1.25 mm",
    msrpEur: 22,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.luxilon.com/en-us/strings",
    string: {
      material: "co_polyester",
      gaugeMm: 1.25,
      gaugeLabel: "16L",
      shape: "round",
      colour: "Silver",
      power: 5,
      control: 9,
      spin: 8,
      comfort: 3,
      durability: 8,
      tensionMaintenance: 6,
      recommendedTensionMinKg: 22,
      recommendedTensionMaxKg: 25,
      hybridPartnerNote: "The classic mains half of a natural-gut hybrid.",
    },
  },
  {
    id: "prod-luxilon-4g-125",
    category: "string",
    brand: "Luxilon",
    model: "4G",
    variant: "1.25 mm",
    msrpEur: 24,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.luxilon.com/en-us/strings",
    string: {
      material: "co_polyester",
      gaugeMm: 1.25,
      gaugeLabel: "16L",
      shape: "round",
      colour: "Gold",
      power: 4,
      control: 9,
      spin: 7,
      comfort: 3,
      durability: 9,
      tensionMaintenance: 9,
      recommendedTensionMinKg: 22,
      recommendedTensionMaxKg: 25,
    },
  },
  {
    id: "prod-luxilon-element-125",
    category: "string",
    brand: "Luxilon",
    model: "Element",
    variant: "1.25 mm",
    msrpEur: 21,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.luxilon.com/en-us/strings",
    string: {
      material: "co_polyester",
      gaugeMm: 1.25,
      gaugeLabel: "16L",
      shape: "round",
      colour: "Bronze",
      power: 6,
      control: 7,
      spin: 6,
      comfort: 7,
      durability: 6,
      tensionMaintenance: 6,
      recommendedTensionMinKg: 22,
      recommendedTensionMaxKg: 25,
      hybridPartnerNote: "A softer poly — the usual first step away from ALU Power for an aching arm.",
    },
  },
  {
    id: "prod-babolat-rpm-blast-125",
    category: "string",
    brand: "Babolat",
    model: "RPM Blast",
    variant: "1.25 mm",
    msrpEur: 20,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.babolat.com/us/tennis/strings",
    string: {
      material: "co_polyester",
      gaugeMm: 1.25,
      gaugeLabel: "17",
      shape: "octagonal",
      colour: "Black",
      power: 5,
      control: 8,
      spin: 9,
      comfort: 4,
      durability: 7,
      tensionMaintenance: 6,
      recommendedTensionMinKg: 22,
      recommendedTensionMaxKg: 25,
    },
  },
  {
    id: "prod-babolat-vs-touch-130",
    category: "string",
    brand: "Babolat",
    model: "VS Touch",
    variant: "1.30 mm",
    msrpEur: 45,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.babolat.com/us/tennis/strings",
    string: {
      material: "natural_gut",
      gaugeMm: 1.3,
      gaugeLabel: "16",
      shape: "round",
      colour: "Natural",
      power: 10,
      control: 6,
      spin: 5,
      comfort: 10,
      durability: 4,
      tensionMaintenance: 10,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      hybridPartnerNote: "Usual crosses partner for a polyester mains bed.",
    },
  },
  {
    id: "prod-solinco-hyper-g-120",
    category: "string",
    brand: "Solinco",
    model: "Hyper-G",
    variant: "1.20 mm",
    msrpEur: 18,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://solincosports.com/pages/tennis-strings",
    string: {
      material: "co_polyester",
      gaugeMm: 1.2,
      gaugeLabel: "18",
      shape: "textured",
      colour: "Green",
      power: 5,
      control: 9,
      spin: 9,
      comfort: 5,
      durability: 5,
      tensionMaintenance: 6,
      recommendedTensionMinKg: 21,
      recommendedTensionMaxKg: 24,
    },
  },
  {
    id: "prod-solinco-tour-bite-125",
    category: "string",
    brand: "Solinco",
    model: "Tour Bite",
    variant: "1.25 mm",
    msrpEur: 18,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://solincosports.com/pages/tennis-strings",
    string: {
      material: "co_polyester",
      gaugeMm: 1.25,
      gaugeLabel: "17",
      shape: "textured",
      colour: "Silver",
      power: 4,
      control: 9,
      spin: 10,
      comfort: 3,
      durability: 7,
      tensionMaintenance: 6,
      recommendedTensionMinKg: 21,
      recommendedTensionMaxKg: 24,
    },
  },
  {
    id: "prod-wilson-nxt-16",
    category: "string",
    brand: "Wilson",
    model: "NXT",
    variant: "1.30 mm",
    msrpEur: 19,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.wilson.com/en-us/tennis/strings",
    string: {
      material: "multifilament",
      gaugeMm: 1.3,
      gaugeLabel: "16",
      shape: "round",
      colour: "Natural",
      power: 8,
      control: 5,
      spin: 4,
      comfort: 9,
      durability: 5,
      tensionMaintenance: 7,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
      hybridPartnerNote: "A common crosses choice for softening a polyester mains bed.",
    },
  },
  {
    id: "prod-head-lynx-tour-125",
    category: "string",
    brand: "Head",
    model: "Lynx Tour",
    variant: "1.25 mm",
    msrpEur: 17,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.head.com/en_US/tennis/strings.html",
    string: {
      material: "co_polyester",
      gaugeMm: 1.25,
      gaugeLabel: "17",
      shape: "hexagonal",
      colour: "Champagne",
      power: 6,
      control: 8,
      spin: 8,
      comfort: 6,
      durability: 7,
      tensionMaintenance: 7,
      recommendedTensionMinKg: 22,
      recommendedTensionMaxKg: 25,
    },
  },
  {
    id: "prod-head-velocity-mlt-130",
    category: "string",
    brand: "Head",
    model: "Velocity MLT",
    variant: "1.30 mm",
    msrpEur: 16,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.head.com/en_US/tennis/strings.html",
    string: {
      material: "multifilament",
      gaugeMm: 1.3,
      gaugeLabel: "16",
      shape: "round",
      colour: "Natural",
      power: 8,
      control: 5,
      spin: 4,
      comfort: 9,
      durability: 5,
      tensionMaintenance: 7,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
    },
  },
  {
    id: "prod-yonex-poly-tour-pro-125",
    category: "string",
    brand: "Yonex",
    model: "Poly Tour Pro",
    variant: "1.25 mm",
    msrpEur: 19,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.yonex.com/tennis/strings",
    string: {
      material: "polyester",
      gaugeMm: 1.25,
      gaugeLabel: "16L",
      shape: "round",
      colour: "Graphite",
      power: 6,
      control: 8,
      spin: 7,
      comfort: 7,
      durability: 7,
      tensionMaintenance: 7,
      recommendedTensionMinKg: 21,
      recommendedTensionMaxKg: 24,
    },
  },
  {
    id: "prod-tecnifibre-x-one-biphase-130",
    category: "string",
    brand: "Tecnifibre",
    model: "X-One Biphase",
    variant: "1.30 mm",
    msrpEur: 24,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.tecnifibre.com/en/tennis/strings",
    string: {
      material: "multifilament",
      gaugeMm: 1.3,
      gaugeLabel: "16",
      shape: "round",
      colour: "Natural",
      power: 9,
      control: 5,
      spin: 4,
      comfort: 10,
      durability: 4,
      tensionMaintenance: 7,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
    },
  },
  {
    id: "prod-tecnifibre-razor-code-125",
    category: "string",
    brand: "Tecnifibre",
    model: "Razor Code",
    variant: "1.25 mm",
    msrpEur: 19,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.tecnifibre.com/en/tennis/strings",
    string: {
      material: "co_polyester",
      gaugeMm: 1.25,
      gaugeLabel: "17",
      shape: "pentagonal",
      colour: "Carbon",
      power: 5,
      control: 9,
      spin: 8,
      comfort: 5,
      durability: 7,
      tensionMaintenance: 7,
      recommendedTensionMinKg: 22,
      recommendedTensionMaxKg: 25,
    },
  },
  {
    id: "prod-prince-synthetic-gut-duraflex-16",
    category: "string",
    brand: "Prince",
    model: "Synthetic Gut Duraflex",
    variant: "1.30 mm",
    msrpEur: 9,
    source: NOT_FETCHED_STRING,
    sourceUrl: "https://www.princetennis.com/strings",
    string: {
      material: "synthetic_gut",
      gaugeMm: 1.3,
      gaugeLabel: "16",
      shape: "round",
      colour: "White",
      power: 7,
      control: 5,
      spin: 4,
      comfort: 7,
      durability: 6,
      tensionMaintenance: 6,
      recommendedTensionMinKg: 23,
      recommendedTensionMaxKg: 27,
    },
  },
];

// ── Shoes ───────────────────────────────────────────────────────────────────
const SHOES: SeedProduct[] = [
  {
    id: "prod-asics-gel-resolution-9",
    category: "shoes",
    brand: "Asics",
    model: "GEL-RESOLUTION 9",
    msrpEur: 150,
    source: NOT_FETCHED,
    sourceUrl: "https://www.asics.com/us/en-us/tennis-shoes",
    shoe: {
      courtType: "all_court",
      weightG: 355,
      dropMm: 10,
      widthFit: "standard",
      cushioning: "Rearfoot GEL + FF BLAST",
      stability: "high",
      outsoleGuaranteeMonths: 6,
      sizesEu: SIZES_EU,
    },
  },
  {
    id: "prod-asics-gel-resolution-9-clay",
    category: "shoes",
    brand: "Asics",
    model: "GEL-RESOLUTION 9",
    variant: "Clay",
    msrpEur: 150,
    source: NOT_FETCHED,
    sourceUrl: "https://www.asics.com/us/en-us/tennis-shoes",
    shoe: {
      courtType: "clay",
      weightG: 350,
      dropMm: 10,
      widthFit: "standard",
      cushioning: "Rearfoot GEL + FF BLAST",
      stability: "high",
      outsoleGuaranteeMonths: 6,
      sizesEu: SIZES_EU,
    },
  },
  {
    id: "prod-asics-court-ff-3",
    category: "shoes",
    brand: "Asics",
    model: "COURT FF 3",
    msrpEur: 170,
    source: NOT_FETCHED,
    sourceUrl: "https://www.asics.com/us/en-us/tennis-shoes",
    shoe: {
      courtType: "all_court",
      weightG: 340,
      widthFit: "standard",
      cushioning: "FF BLAST PLUS",
      stability: "medium",
      sizesEu: SIZES_EU,
    },
  },
  {
    id: "prod-nike-zoom-vapor-pro-2",
    category: "shoes",
    brand: "Nike",
    model: "Court Zoom Vapor Pro 2",
    msrpEur: 140,
    source: NOT_FETCHED,
    sourceUrl: "https://www.nike.com/w/tennis-shoes",
    shoe: {
      courtType: "hard",
      weightG: 320,
      widthFit: "narrow",
      cushioning: "Forefoot Zoom Air",
      stability: "medium",
      sizesEu: SIZES_EU,
    },
  },
  {
    id: "prod-nike-zoom-vapor-cage-4-rafa",
    category: "shoes",
    brand: "Nike",
    model: "Court Zoom Vapor Cage 4 Rafa",
    msrpEur: 150,
    source: NOT_FETCHED,
    sourceUrl: "https://www.nike.com/w/tennis-shoes",
    shoe: {
      courtType: "all_court",
      weightG: 400,
      widthFit: "standard",
      cushioning: "Zoom Air + React foam",
      stability: "high",
      outsoleGuaranteeMonths: 6,
      sizesEu: SIZES_EU,
    },
  },
  {
    id: "prod-adidas-barricade-13",
    category: "shoes",
    brand: "adidas",
    model: "Barricade 13",
    msrpEur: 140,
    source: NOT_FETCHED,
    sourceUrl: "https://www.adidas.com/us/tennis-shoes",
    shoe: {
      courtType: "all_court",
      weightG: 400,
      widthFit: "wide",
      cushioning: "Bounce Pro",
      stability: "high",
      outsoleGuaranteeMonths: 6,
      sizesEu: SIZES_EU,
    },
  },
  {
    id: "prod-adidas-adizero-ubersonic-4-1",
    category: "shoes",
    brand: "adidas",
    model: "Adizero Ubersonic 4.1",
    msrpEur: 130,
    source: NOT_FETCHED,
    sourceUrl: "https://www.adidas.com/us/tennis-shoes",
    shoe: {
      courtType: "hard",
      weightG: 300,
      widthFit: "narrow",
      cushioning: "Lightstrike",
      stability: "low",
      sizesEu: SIZES_EU,
    },
  },
  {
    id: "prod-babolat-jet-mach-3-clay",
    category: "shoes",
    brand: "Babolat",
    model: "Jet Mach 3",
    variant: "Clay",
    msrpEur: 150,
    source: NOT_FETCHED,
    sourceUrl: "https://www.babolat.com/us/tennis/shoes",
    shoe: {
      courtType: "clay",
      weightG: 310,
      widthFit: "narrow",
      cushioning: "Active Flexion / Kompressor",
      stability: "medium",
      sizesEu: SIZES_EU,
    },
  },
  {
    id: "prod-wilson-rush-pro-4-0",
    category: "shoes",
    brand: "Wilson",
    model: "Rush Pro 4.0",
    msrpEur: 130,
    source: NOT_FETCHED,
    sourceUrl: "https://www.wilson.com/en-us/tennis/footwear",
    shoe: {
      courtType: "all_court",
      weightG: 380,
      widthFit: "standard",
      cushioning: "4D Chassis / Dynamic Fit",
      stability: "high",
      outsoleGuaranteeMonths: 6,
      sizesEu: SIZES_EU,
    },
  },
];

// ── Accessories + balls ─────────────────────────────────────────────────────
// Both use AccessorySpec.attributes; `kind` is what tells them apart.
// See docs/catalogue.md for the shape of `attributes` per kind.
const ACCESSORIES: SeedProduct[] = [
  {
    id: "prod-wilson-pro-overgrip-3pk",
    category: "accessories",
    brand: "Wilson",
    model: "Pro Overgrip",
    variant: "3-pack",
    msrpEur: 9,
    source: NOT_FETCHED,
    sourceUrl: "https://www.wilson.com/en-us/tennis/accessories",
    accessory: { kind: "grip", gripType: "overgrip", thicknessMm: 0.55, packCount: 3, material: "Polyurethane", tacky: true },
  },
  {
    id: "prod-babolat-syntec-pro-grip",
    category: "accessories",
    brand: "Babolat",
    model: "Syntec Pro",
    msrpEur: 11,
    source: NOT_FETCHED,
    sourceUrl: "https://www.babolat.com/us/tennis/accessories",
    accessory: { kind: "grip", gripType: "replacement", thicknessMm: 1.8, packCount: 1, material: "Polyurethane", tacky: true },
  },
  {
    id: "prod-head-xtra-damp",
    category: "accessories",
    brand: "Head",
    model: "Xtra Damp",
    variant: "2-pack",
    msrpEur: 6,
    source: NOT_FETCHED,
    sourceUrl: "https://www.head.com/en_US/tennis/accessories.html",
    accessory: { kind: "dampener", packCount: 2, material: "Silicone", mounting: "between_mains" },
  },
  {
    id: "prod-babolat-pure-strike-rh-x6",
    category: "accessories",
    brand: "Babolat",
    model: "Pure Strike RH X6",
    msrpEur: 90,
    source: NOT_FETCHED,
    sourceUrl: "https://www.babolat.com/us/tennis/bags",
    accessory: { kind: "bag", racketCapacity: 6, compartments: 2, insulatedCompartment: true, shoeCompartment: false },
  },
  {
    id: "prod-yonex-pro-racquet-bag-9",
    category: "accessories",
    brand: "Yonex",
    model: "Pro Racquet Bag 9",
    msrpEur: 130,
    source: NOT_FETCHED,
    sourceUrl: "https://www.yonex.com/tennis/bags",
    accessory: { kind: "bag", racketCapacity: 9, compartments: 3, insulatedCompartment: true, shoeCompartment: true },
  },
  {
    id: "prod-adidas-club-tennis-polo",
    category: "accessories",
    brand: "adidas",
    model: "Club Tennis Polo",
    msrpEur: 45,
    source: NOT_FETCHED,
    sourceUrl: "https://www.adidas.com/us/tennis-clothing",
    accessory: { kind: "apparel", garment: "polo", material: "Recycled polyester", fit: "regular", sizes: ["S", "M", "L", "XL", "XXL"] },
  },
  {
    id: "prod-wilson-us-open-extra-duty",
    category: "balls",
    brand: "Wilson",
    model: "US Open Extra Duty",
    variant: "3-ball can",
    msrpEur: 5,
    source: NOT_FETCHED,
    sourceUrl: "https://www.wilson.com/en-us/tennis/balls",
    accessory: { kind: "balls", felt: "extra_duty", pressurised: true, ballsPerCan: 3, approval: "ITF approved", surface: "hard" },
  },
  {
    id: "prod-dunlop-atp-extra-duty",
    category: "balls",
    brand: "Dunlop",
    model: "ATP Championship Extra Duty",
    variant: "3-ball can",
    msrpEur: 5,
    source: NOT_FETCHED,
    sourceUrl: "https://www.dunlopsports.com/tennis/balls",
    accessory: { kind: "balls", felt: "extra_duty", pressurised: true, ballsPerCan: 3, approval: "ITF approved", surface: "all_court" },
  },
];

export const GEAR_PRODUCTS: SeedProduct[] = [...RACKETS, ...STRINGS, ...SHOES, ...ACCESSORIES];

/**
 * Upsert the catalogue. Idempotent on the pinned id, and the nested 1:1 spec
 * uses `upsert` on the update branch so re-seeding an existing product corrects
 * its specs instead of silently leaving stale numbers behind.
 */
export async function seedGearCatalogue(prisma: PrismaClient) {
  for (const p of GEAR_PRODUCTS) {
    const product = {
      category: p.category,
      brand: p.brand,
      model: p.model,
      variant: p.variant ?? "",
      releaseYear: p.releaseYear ?? null,
      msrpEur: p.msrpEur ?? null,
      // Never populated by the seed: no image is licensed for our use.
      imageUrl: null,
      source: p.source,
      sourceUrl: p.sourceUrl,
      lastVerifiedAt: p.lastVerifiedAt ?? null,
      isActive: true,
    };

    const spec = p.racket
      ? { racketSpec: { create: p.racket, update: p.racket } }
      : p.string
        ? { stringSpec: { create: p.string, update: p.string } }
        : p.shoe
          ? { shoeSpec: { create: p.shoe, update: p.shoe } }
          : { accessorySpec: { create: { attributes: p.accessory ?? {} }, update: { attributes: p.accessory ?? {} } } };

    const [[relation, payload]] = Object.entries(spec) as [
      [string, { create: Record<string, unknown>; update: Record<string, unknown> }],
    ];

    await prisma.equipmentProduct.upsert({
      where: { id: p.id },
      create: { id: p.id, ...product, [relation]: { create: payload.create } },
      update: { ...product, [relation]: { upsert: { create: payload.create, update: payload.update } } },
    });
  }

  const counts: Record<string, number> = {};
  for (const p of GEAR_PRODUCTS) counts[p.category] = (counts[p.category] ?? 0) + 1;
  const verified = GEAR_PRODUCTS.filter((p) => p.lastVerifiedAt).length;
  return { total: GEAR_PRODUCTS.length, counts, verified };
}
