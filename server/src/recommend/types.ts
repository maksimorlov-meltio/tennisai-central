// ============================================================================
// TennisAI — recommendation engines: the shared output contract
//
// Three deterministic engines live in this folder (strings, tournaments,
// money). They are PURE FUNCTIONS over plain input objects: no Prisma, no
// clock, no network. The route layer (recommend/routes.ts) loads the data and
// hands it in, which is what makes every rule testable with a fixture and
// every answer reproducible.
//
// Every recommendation carries `reasons[]` naming the inputs it used, a
// `confidence` with the single thing that would raise it, and `cautions[]`.
// A reason must never cite a number the engine did not have — where an input
// is missing, the engine SAYS so in a reason and lowers confidence, rather
// than filling the gap with a guess.
// ============================================================================

/** Bumped whenever a rule changes in a way that changes output for the same input. */
export const RECOMMENDER_VERSION = "v1";

/**
 * One input the engine used, and what it concluded from it.
 * `code` is a stable machine key (snake_case) so the client can localise later;
 * `textEn` is the plain-English sentence for now.
 */
export interface Reason {
  code: string;
  params: Record<string, string | number | boolean>;
  textEn: string;
}

export type ConfidenceLevel = "low" | "medium" | "high";

/**
 * How much to trust the answer, and the ONE thing that would raise it —
 * "Log two more string jobs and this becomes high". A player who cannot see
 * how to make the advice better has no reason to feed it.
 */
export interface Confidence {
  level: ConfidenceLevel;
  raisedBy: string;
}

/**
 * The only caution v1 ever emits. When pain or an injury is mentioned anywhere
 * in the inputs the engine outputs exactly this, once, and says nothing else
 * about it — it never names or implies a condition. That is not modesty: a
 * string recommendation is not a clinical assessment and must not read as one.
 */
export interface Caution {
  code: "seek_qualified_assessment";
  textEn: string;
}

export const SEEK_ASSESSMENT_CAUTION: Caution = {
  code: "seek_qualified_assessment",
  textEn:
    "Your profile mentions a physical concern. Please have it assessed by a qualified professional before changing equipment on that basis — this advice does not account for it.",
};

export function reason(code: string, params: Reason["params"], textEn: string): Reason {
  return { code, params, textEn };
}

export function round(v: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/** Round to the nearest half — tensions are quoted in 0.5 kg steps. */
export function roundHalf(v: number): number {
  return Math.round(v * 2) / 2;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Whole days between two ISO instants (b − a), floored. */
export function daysBetween(aIso: string, bIso: string): number {
  return Math.floor((Date.parse(bIso) - Date.parse(aIso)) / 86_400_000);
}

export function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
