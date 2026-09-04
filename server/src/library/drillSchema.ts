// ============================================================================
// TennisAI coaching library — the drill document schema.
//
// THIS FILE IS THE SINGLE SOURCE OF TRUTH for the shape of a drill.
// `content/schema/drill.schema.json` is GENERATED from it (see
// `server/scripts/content-schema.ts`), the validator and the importer parse
// with it, and the Prisma `Drill` model mirrors it. If the three ever disagree,
// this file wins and the other two are wrong.
//
// Deliberately dependency-light: zod + the YAML vocabularies, nothing else. It
// is imported by scripts that run in CI with a dummy DATABASE_URL, so it must
// never reach for `src/env.ts` or `src/db.ts`.
// ============================================================================

import { z } from "zod";
import { PATTERN_SET, SKILL_SET } from "./vocab";

// ── Controlled vocabularies ─────────────────────────────────────────────────

export const DOMAINS = [
  "technique",
  "tactics",
  "footwork",
  "serve_return",
  "physical",
  "mental",
  "warmup_cooldown",
  "games_kids",
] as const;

export const LEVEL_BANDS = ["beginner", "intermediate", "advanced", "high_performance"] as const;

export const AGE_BANDS = ["u10", "u12", "u14", "u16", "u18", "adult"] as const;

/**
 * MUST stay identical to `BlockKind` in `src/lib/session/types.ts` — the
 * frontend session generator and this library have to name the same five
 * blocks or a drill can never be placed.
 */
export const BLOCK_KINDS = ["warmup", "technical", "tactical", "live", "cooldown"] as const;

export const MEDIA = ["video", "book", "article", "course", "clip", "conference", "curriculum"] as const;

export const STATUSES = ["draft", "reviewed", "approved", "retired"] as const;

export const INTENSITIES = ["low", "medium", "high"] as const;

export const MARKER_TYPES = ["cone", "target", "player", "feeder", "ball_path", "hoop", "line"] as const;

export const PATH_STYLES = ["shot", "movement"] as const;

export const COURTS = ["full", "half", "doubles_full", "doubles_half"] as const;

export type Domain = (typeof DOMAINS)[number];
export type LevelBand = (typeof LEVEL_BANDS)[number];
export type AgeBand = (typeof AGE_BANDS)[number];
export type BlockKind = (typeof BLOCK_KINDS)[number];
export type Medium = (typeof MEDIA)[number];
export type DrillStatus = (typeof STATUSES)[number];
export type CourtKind = (typeof COURTS)[number];

// ── Court geometry ──────────────────────────────────────────────────────────
// Metres, origin at the centre of the court: x runs across the court (towards
// the sidelines), y runs along it (towards the baselines). A diagram is
// coordinates, never an image — so it renders at any size, in any theme, and
// carries nobody else's copyright.

/** Half the width of a singles court (8.23 m wide). */
export const SINGLES_HALF_WIDTH = 4.115;
/** Half the width of a doubles court (10.97 m wide). */
export const DOUBLES_HALF_WIDTH = 5.485;
/** Half the length of any court (23.77 m long). */
export const HALF_LENGTH = 11.885;
/** Everything a drill uses may sit up to 3 m outside the lines (run-off). */
export const RUN_OFF = 3;

export function isDoublesCourt(court: CourtKind): boolean {
  return court === "doubles_full" || court === "doubles_half";
}

export function isHalfCourt(court: CourtKind): boolean {
  return court === "half" || court === "doubles_half";
}

/** The x/y limits a marker or path point must respect for a given court. */
export function courtExtents(court: CourtKind): { maxX: number; maxY: number } {
  return {
    maxX: (isDoublesCourt(court) ? DOUBLES_HALF_WIDTH : SINGLES_HALF_WIDTH) + RUN_OFF,
    maxY: HALF_LENGTH + RUN_OFF,
  };
}

// ── Leaf shapes ─────────────────────────────────────────────────────────────

const localisedText = z.object({
  en: z.string().min(1),
  es: z.string().min(1),
});

const localisedList = z.object({
  en: z.array(z.string().min(1)).min(1),
  es: z.array(z.string().min(1)).min(1),
});

/** Longest a coaching cue may be. A cue you cannot shout is not a cue. */
export const MAX_CUE_WORDS = 8;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * A cue is either a plain string we wrote ourselves, or an object marking it as
 * somebody else's words — in which case the attribution is mandatory. There is
 * no third option: an unattributed quote is how a library ends up republishing
 * a coach's material without saying so.
 */
const cueSchema = z.union([
  z.string().min(1),
  z.object({
    text: z.string().min(1),
    quote: z.boolean().optional(),
    attribution: z.string().min(1).optional(),
  }),
]);

export type CueInput = z.infer<typeof cueSchema>;

export function cueText(cue: CueInput): string {
  return typeof cue === "string" ? cue : cue.text;
}

/** How a cue is stored once flattened: a quote keeps its attribution attached. */
export function renderCue(cue: CueInput): string {
  if (typeof cue === "string") return cue;
  return cue.quote ? `"${cue.text}" — ${cue.attribution ?? ""}`.trim() : cue.text;
}

const cueList = z.object({
  en: z.array(cueSchema).min(3),
  es: z.array(cueSchema).min(3),
});

const point = z.object({
  x: z.number(),
  y: z.number(),
});

const marker = point.extend({
  type: z.enum(MARKER_TYPES),
  label: z.string().optional(),
});

const path = z.object({
  style: z.enum(PATH_STYLES),
  points: z.array(point).min(2),
  label: z.string().optional(),
});

const diagram = z.object({
  court: z.enum(COURTS),
  markers: z.array(marker).min(1),
  paths: z.array(path).default([]),
});

const source = z.object({
  coachOrBody: z.string().min(1),
  title: z.string().min(1),
  medium: z.enum(MEDIA),
  publisherOrChannel: z.string().optional(),
  // Optional so the in-house attribution entry ("TennisAI coaching library,
  // written from standard coaching curricula") does not need an invented URL.
  // Anything that DOES carry a url must be https — see the status rules below.
  url: z.string().url().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  timestamp: z.string().optional(),
  note: z.string().optional(),
  fetchedAt: z.string().optional(),
});

const numericRange = z.tuple([z.number(), z.number()]);

// ── The document ────────────────────────────────────────────────────────────

const baseDrill = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be a lower-case slug, e.g. serve-plus-one-deep-cross"),
  title: localisedText,
  version: z.number().int().positive(),
  status: z.enum(STATUSES),
  taxonomy: z.object({
    domain: z.enum(DOMAINS),
    skills: z.array(z.string().min(1)).min(1),
    patterns: z.array(z.string().min(1)).default([]),
  }),
  blockKinds: z.array(z.enum(BLOCK_KINDS)).min(1),
  levelBands: z.array(z.enum(LEVEL_BANDS)).min(1),
  ageBands: z.array(z.enum(AGE_BANDS)).min(1),
  players: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
  courts: z.object({ min: z.number().positive(), max: z.number().positive() }),
  equipment: z.array(z.string().min(1)).default([]),
  defaults: z.object({
    durationMin: z.number().int().positive(),
    reps: z.number().int().nonnegative(),
    sets: z.number().int().nonnegative(),
    restSec: z.number().int().nonnegative(),
    intensity: z.enum(INTENSITIES),
  }),
  ranges: z.object({
    durationMin: numericRange,
    reps: numericRange,
    sets: numericRange,
  }),
  requiresQualifiedSupervision: z.boolean().default(false),
  objective: localisedText,
  setup: localisedText,
  progression: localisedText,
  regression: localisedText,
  successCriteria: localisedText,
  diagram,
  steps: localisedList,
  cues: cueList,
  commonErrors: localisedList,
  sources: z.array(source).min(1),
  licence: z.literal("none"),
  authorAgent: z.enum(["researcher", "fullstack", "db"]),
});

/**
 * The full document schema — the base shape plus every cross-field rule that
 * cannot be expressed field-by-field.
 */
export const drillDocumentSchema = baseDrill.superRefine((doc, ctx) => {
  // Vocabulary. An unknown tag is a typo or an unreviewed synonym; either way
  // it silently removes the drill from every query that filters on the tag.
  doc.taxonomy.skills.forEach((skill, i) => {
    if (!SKILL_SET.has(skill)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxonomy", "skills", i],
        message: `unknown skill "${skill}" — add it to content/schema/skills.yaml first`,
      });
    }
  });
  doc.taxonomy.patterns.forEach((pattern, i) => {
    if (!PATTERN_SET.has(pattern)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxonomy", "patterns", i],
        message: `unknown pattern "${pattern}" — add it to content/schema/patterns.yaml first`,
      });
    }
  });

  // Players / courts / ranges must be orderable.
  if (doc.players.max < doc.players.min) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["players"], message: "players.max is below players.min" });
  }
  if (doc.courts.max < doc.courts.min) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["courts"], message: "courts.max is below courts.min" });
  }
  for (const key of ["durationMin", "reps", "sets"] as const) {
    const [lo, hi] = doc.ranges[key];
    if (hi < lo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ranges", key], message: `${key} range is inverted` });
    }
    const value = doc.defaults[key];
    if (value < lo || value > hi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaults", key],
        message: `defaults.${key} (${value}) is outside ranges.${key} [${lo}, ${hi}]`,
      });
    }
  }

  // Diagram geometry. Every marker and every path point has to be somewhere a
  // player could actually stand or a ball actually land.
  const { maxX, maxY } = courtExtents(doc.diagram.court);
  const half = isHalfCourt(doc.diagram.court);
  const ys: number[] = [];

  const checkPoint = (p: { x: number; y: number }, at: (string | number)[]) => {
    if (Math.abs(p.x) > maxX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at,
        message: `x=${p.x} is outside the court plus run-off (|x| ≤ ${maxX})`,
      });
    }
    if (Math.abs(p.y) > maxY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at,
        message: `y=${p.y} is outside the court plus run-off (|y| ≤ ${maxY})`,
      });
    }
    ys.push(p.y);
  };

  doc.diagram.markers.forEach((m, i) => checkPoint(m, ["diagram", "markers", i]));
  doc.diagram.paths.forEach((p, i) => p.points.forEach((pt, j) => checkPoint(pt, ["diagram", "paths", i, "points", j])));

  if (half && ys.some((y) => y > 0) && ys.some((y) => y < 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["diagram"],
      message: "a half-court diagram must keep every y on one side of the net (all ≥ 0 or all ≤ 0)",
    });
  }

  // Cues: short, and honest about whose words they are.
  for (const lang of ["en", "es"] as const) {
    doc.cues[lang].forEach((cue, i) => {
      const text = cueText(cue);
      const words = countWords(text);
      if (words > MAX_CUE_WORDS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cues", lang, i],
          message: `cue is ${words} words — the limit is ${MAX_CUE_WORDS}`,
        });
      }
      if (typeof cue !== "string" && cue.quote && !cue.attribution) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cues", lang, i],
          message: "a quoted cue must name its attribution",
        });
      }
    });
  }

  // Provenance. Draft work may still be chasing its sources; anything offered
  // to a coach as reviewed or approved may not.
  if (doc.status === "reviewed" || doc.status === "approved") {
    doc.sources.forEach((s, i) => {
      if (s.url !== undefined && !s.url.startsWith("https://")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", i, "url"],
          message: "a reviewed or approved drill may only cite https URLs",
        });
      }
    });
    if (!doc.sources.some((s) => typeof s.url === "string" && s.url.startsWith("https://"))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sources"],
        message: "a reviewed or approved drill needs at least one source with an https URL that was actually fetched",
      });
    }
  }

  // Safeguarding. Strength work for children is supervised work — the flag is
  // not advisory, and a drill that omits it cannot be placed by the assembler.
  const minorBands: AgeBand[] = ["u10", "u12", "u14"];
  const touchesMinors = doc.ageBands.some((b) => minorBands.includes(b));
  const isStrength = doc.taxonomy.skills.some((s) => s === "lower_body_strength" || s === "plyometric_landing");
  if (touchesMinors && doc.taxonomy.domain === "physical" && isStrength && !doc.requiresQualifiedSupervision) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requiresQualifiedSupervision"],
      message: "strength work offered to under-14s must be flagged requiresQualifiedSupervision: true",
    });
  }
});

/** The parsed, defaulted drill document. */
export type Drill = z.infer<typeof drillDocumentSchema>;

/** The raw (pre-refinement) object shape — used to generate the JSON Schema. */
export const drillObjectSchema = baseDrill;
