// ============================================================
// TennisAI — Training advice
//
// Turns what actually happened (past sessions + the coach's review + the
// player's own feedback) into the evidence an LLM reasons over, then
// validates what comes back.
//
// Two rules shape this file:
//   1. The model gets EVIDENCE, never identities. Names and emails never
//      leave this server — players are labelled "Player 1..n" and the labels
//      are swapped back for real names on the way out.
//   2. Nothing unvalidated is ever presented as advice. The response is
//      parsed against a strict schema; a malformed answer is an error, not
//      something to render optimistically.
// ============================================================

import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

export const TRAINING_TYPES = [
  "individual",
  "team",
  "match_practice",
  "fitness",
  "recovery",
  "tactical",
] as const;

/** How far back we look. Enough to show a trend, small enough to stay cheap. */
export const MAX_SESSIONS = 15;

/** Below this, the coach is told the advice is thin rather than being sold it. */
export const THIN_EVIDENCE_BELOW = 4;

// ─── The contract we hold the model to ───────────────────────────

export const adviceSchema = z.object({
  summary: z.string().min(1).max(800),
  focusAreas: z.array(z.string().min(1).max(80)).min(1).max(4),
  suggestedSessions: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        goal: z.string().min(1).max(240),
        trainingType: z.enum(TRAINING_TYPES),
        intensity: z.enum(["low", "medium", "high"]),
        durationMinutes: z.number().int().min(20).max(240),
        rationale: z.string().min(1).max(500),
        drills: z.array(z.string().min(1).max(140)).max(6).default([]),
      }),
    )
    .min(1)
    .max(3),
  cautions: z.array(z.string().min(1).max(240)).max(4).default([]),
});

export type TrainingAdvice = z.infer<typeof adviceSchema>;

// ─── Evidence ────────────────────────────────────────────────────

export interface SessionEvidence {
  date: string; // yyyy-mm-dd — no clock time, it adds nothing here
  title: string;
  trainingType: string;
  intensity: string | null;
  goal: string | null;
  durationMinutes: number;
  coachRating: number | null;
  workedOn: string | null;
  nextSteps: string | null;
  playerFeeling: string | null;
  playerEnergy: number | null;
  playerTags: string[];
  playerNote: string | null;
}

export interface AdviceEvidence {
  /** Pseudonymous roster the advice is for. */
  players: string[];
  scope: "player" | "group";
  sessions: SessionEvidence[];
  reviewedCount: number;
  feedbackCount: number;
}

/** Shape of the rows this module needs — narrower than the full Prisma model. */
export interface TrainingRow {
  title: string;
  trainingType: string;
  intensity: string | null;
  goal: string | null;
  startDate: Date;
  endDate: Date;
  review: unknown;
  playerSessionFeedback: unknown;
}

/** Reads a field off a Json column without trusting its shape. */
function pick(json: unknown, key: string): unknown {
  if (!json || typeof json !== "object") return undefined;
  return (json as Record<string, unknown>)[key];
}

function asString(v: unknown, max = 400): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Pure: rows → evidence. Kept free of Prisma and of names so it can be tested
 * directly, and so it is obvious by inspection that no identity escapes.
 */
export function buildEvidence(rows: TrainingRow[], playerCount: number): AdviceEvidence {
  const sessions: SessionEvidence[] = rows.map((t) => {
    const feedback = t.playerSessionFeedback;
    const review = t.review;
    const tags = pick(feedback, "tags");
    return {
      date: t.startDate.toISOString().slice(0, 10),
      title: t.title.slice(0, 120),
      trainingType: t.trainingType,
      intensity: t.intensity,
      goal: asString(t.goal, 240),
      durationMinutes: Math.max(
        0,
        Math.round((t.endDate.getTime() - t.startDate.getTime()) / 60000),
      ),
      coachRating: asNumber(pick(review, "rating")),
      workedOn: asString(pick(review, "workedOn")),
      nextSteps: asString(pick(review, "nextSteps")),
      playerFeeling: asString(pick(feedback, "feeling"), 20),
      playerEnergy: asNumber(pick(feedback, "energyLevel")),
      playerTags: Array.isArray(tags)
        ? tags.filter((x): x is string => typeof x === "string").slice(0, 12)
        : [],
      playerNote: asString(pick(feedback, "note"), 240),
    };
  });

  return {
    players: Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`),
    scope: playerCount > 1 ? "group" : "player",
    sessions,
    reviewedCount: sessions.filter((s) => s.coachRating !== null || s.workedOn).length,
    feedbackCount: sessions.filter((s) => s.playerFeeling !== null || s.playerNote).length,
  };
}

/** Stable fingerprint of the input, so repeated identical asks are recognisable. */
export function evidenceHash(evidence: AdviceEvidence, promptVersion: string): string {
  return createHash("sha256")
    .update(promptVersion)
    .update(JSON.stringify(evidence))
    .digest("hex");
}

/**
 * Fetches the coach's own sessions for these players. Scoped to `coachId` on
 * purpose: a coach may only reason over training they ran themselves, even for
 * a player another coach also works with.
 */
export async function loadTrainingRows(
  prisma: PrismaClient,
  coachId: string,
  playerIds: string[],
): Promise<TrainingRow[]> {
  return prisma.training.findMany({
    where: {
      coachId,
      participants: { some: { playerId: { in: playerIds } } },
      // Only sessions that have happened — a future booking has nothing to teach.
      startDate: { lte: new Date() },
    },
    orderBy: { startDate: "desc" },
    take: MAX_SESSIONS,
    select: {
      title: true,
      trainingType: true,
      intensity: true,
      goal: true,
      startDate: true,
      endDate: true,
      review: true,
      playerSessionFeedback: true,
    },
  });
}

// ─── Prompt ──────────────────────────────────────────────────────

/** Bump on any wording change — it is recorded against every generation. */
export const PROMPT_VERSION = "training-advice/1";

export const SYSTEM_PROMPT = [
  "You are an experienced tennis coach advising another coach on what to train next.",
  "You are given real session history: what was trained, how the coach rated it, and how the player felt.",
  "",
  "Rules:",
  "- Ground every recommendation in the supplied evidence. Quote what you are reacting to.",
  "- Never invent sessions, scores, injuries or events that are not in the evidence.",
  "- If the evidence is thin or contradictory, say so in `cautions` and keep advice conservative.",
  "- Respect fatigue signals: repeated low energy or 'Felt tired'/'Too hard' tags mean lighter or recovery work.",
  "- Players are pseudonymous ('Player 1'). Refer to them only by those labels.",
  "- You are not a medical professional. Never diagnose an injury or give medical advice;",
  "  if the evidence suggests pain or injury, put a caution recommending a qualified assessment.",
  "",
  "Answer with a single JSON object and nothing else — no prose, no markdown fence:",
  "{",
  '  "summary": string,',
  '  "focusAreas": string[1..4],',
  '  "suggestedSessions": [{ "title": string, "goal": string,',
  '     "trainingType": "individual"|"team"|"match_practice"|"fitness"|"recovery"|"tactical",',
  '     "intensity": "low"|"medium"|"high", "durationMinutes": number,',
  '     "rationale": string, "drills": string[] }] (1 to 3 entries),',
  '  "cautions": string[]',
  "}",
].join("\n");

export function buildUserPrompt(evidence: AdviceEvidence): string {
  const scope =
    evidence.scope === "group"
      ? `a group of ${evidence.players.length} players (${evidence.players.join(", ")})`
      : "a single player (Player 1)";

  return [
    `Advise the next training session(s) for ${scope}.`,
    "",
    `Sessions below: ${evidence.sessions.length} (most recent first). ` +
      `${evidence.reviewedCount} carry a coach review, ${evidence.feedbackCount} carry player feedback.`,
    evidence.sessions.length < THIN_EVIDENCE_BELOW
      ? "This is a small sample — be explicit about that in `cautions`."
      : "",
    "",
    "EVIDENCE:",
    JSON.stringify(evidence.sessions, null, 1),
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Output handling ─────────────────────────────────────────────

/**
 * Parses a model reply against a schema.
 *
 * Tolerates a ```json fence and a leading sentence, because models add them
 * even when told not to, but tolerates nothing about the SHAPE — that is what
 * the schema is for. Shared by every AI feature so they all fail the same way.
 */
export function parseModelJson<S extends z.ZodTypeAny>(raw: string, schema: S): z.infer<S> {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();

  // Some models prepend a sentence. Fall back to the outermost JSON object.
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Response contained no JSON object.");
    text = text.slice(start, end + 1);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Response was not valid JSON.");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`Response did not match the expected shape: ${first.path.join(".")} — ${first.message}`);
  }
  return parsed.data;
}

/** Training advice specifically. */
export function parseAdvice(raw: string): TrainingAdvice {
  return parseModelJson(raw, adviceSchema);
}

/**
 * Swaps "Player 1" back for the real first name, so the coach reads about the
 * people they actually coach. Longest label first, so "Player 10" is not
 * mangled by the rule for "Player 1".
 */
export function restoreNames(advice: TrainingAdvice, names: string[]): TrainingAdvice {
  const pairs = names
    .map((name, i) => ({ label: `Player ${i + 1}`, name }))
    .sort((a, b) => b.label.length - a.label.length);

  const swap = (s: string) =>
    pairs.reduce((acc, p) => acc.split(p.label).join(p.name), s);

  return {
    summary: swap(advice.summary),
    focusAreas: advice.focusAreas.map(swap),
    suggestedSessions: advice.suggestedSessions.map((s) => ({
      ...s,
      title: swap(s.title),
      goal: swap(s.goal),
      rationale: swap(s.rationale),
      drills: s.drills.map(swap),
    })),
    cautions: advice.cautions.map(swap),
  };
}
