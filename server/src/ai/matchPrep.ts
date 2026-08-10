// ============================================================
// TennisAI — Match preparation for a tournament
//
// The division of labour matters here. The physics (air density, speed and
// bounce direction) is computed in conditions/physics.ts and handed to the
// model as FACT. The model is asked only what a player should do about it —
// tactics, warm-up, strings, pacing — which is judgement.
//
// Asking a model to compute the physics would be slower, costlier, and
// occasionally wrong in ways nobody would catch.
// ============================================================

import { z } from "zod";
import type { ConditionsPhysics } from "../conditions/physics";
import type { WeatherReading } from "../conditions/weather";
import { buildEvidence, type TrainingRow } from "./trainingAdvice";

export const PROMPT_VERSION = "match-prep/1";

export const matchPrepSchema = z.object({
  conditionsSummary: z.string().min(1).max(800),
  ballBehaviour: z.string().min(1).max(600),
  tacticalAdjustments: z.array(z.string().min(1).max(240)).min(1).max(5),
  preparation: z.array(z.string().min(1).max(240)).min(1).max(5),
  equipmentNotes: z.array(z.string().min(1).max(240)).max(4).default([]),
  cautions: z.array(z.string().min(1).max(240)).max(4).default([]),
});

export type MatchPrep = z.infer<typeof matchPrepSchema>;

export interface MatchPrepInput {
  tournament: {
    name: string;
    city: string;
    country: string;
    surface: string;
    indoorOutdoor: string;
    ballBrand: string | null;
    startDate: string;
  };
  altitudeM: number | null;
  weather: WeatherReading | null;
  physics: ConditionsPhysics | null;
  physicsBasis: "indoor" | "outdoor";
  /** Recent training rows for the player — turned into pseudonymous evidence. */
  recentTraining: TrainingRow[];
}

export const SYSTEM_PROMPT = [
  "You are an experienced tennis coach preparing a player for a specific tournament.",
  "",
  "You are given: the venue and surface, the official ball if known, the expected",
  "weather, and a PRE-COMPUTED physics readout (air density, and whether the ball",
  "will play faster/slower and bounce higher/lower than a mild sea-level day).",
  "",
  "Rules:",
  "- The physics readout is authoritative. Interpret it; never contradict or recompute it.",
  "- Say plainly what the conditions do to the ball, then what the player should do about it.",
  "- Ground the player-specific advice in the training evidence supplied. If there is none,",
  "  give conditions-based advice only and say so in `cautions`.",
  "- Weather marked `typical` is a historical average, NOT a forecast. Never describe it as",
  "  a forecast, and note the uncertainty in `cautions`.",
  "- Respect fatigue signals in the training evidence: low energy or 'Felt tired' tags mean",
  "  pacing and recovery advice, not more load.",
  "- The player is pseudonymous ('Player 1'). Refer to them only by that label.",
  "- You are not a medical professional. Never diagnose; if the evidence suggests pain or",
  "  injury, put a caution recommending a qualified assessment.",
  "",
  "Answer with a single JSON object and nothing else — no prose, no markdown fence:",
  "{",
  '  "conditionsSummary": string,',
  '  "ballBehaviour": string,',
  '  "tacticalAdjustments": string[1..5],',
  '  "preparation": string[1..5],',
  '  "equipmentNotes": string[],',
  '  "cautions": string[]',
  "}",
].join("\n");

export function buildUserPrompt(input: MatchPrepInput): string {
  const t = input.tournament;
  const evidence = buildEvidence(input.recentTraining, 1);

  const lines = [
    `TOURNAMENT: ${t.name}, ${t.city}, ${t.country}`,
    `Starts: ${t.startDate.slice(0, 10)}`,
    `Surface: ${t.surface} (${t.indoorOutdoor})`,
    `Official ball: ${t.ballBrand ?? "unknown — do not speculate about a specific brand"}`,
    `Altitude: ${input.altitudeM === null ? "unknown, assume near sea level" : `${input.altitudeM} m`}`,
    "",
  ];

  if (input.weather) {
    const w = input.weather;
    lines.push(
      `WEATHER (${w.kind === "typical" ? "TYPICAL — historical average, not a forecast" : w.kind.toUpperCase()}):`,
      `Playing-hours temperature ${w.temperatureC}°C (day ${w.temperatureMinC}–${w.temperatureMaxC}°C), humidity ${w.humidityPct}%`,
      w.basedOnYears ? `Averaged over ${w.basedOnYears} previous years.` : "",
      "",
    );
  } else {
    lines.push("WEATHER: unavailable. Do not guess it.", "");
  }

  if (input.physics) {
    const p = input.physics;
    lines.push(
      `PHYSICS (computed, authoritative — basis: ${input.physicsBasis}):`,
      `Air density ${p.airDensity} kg/m³, ${p.densityVsReferencePct > 0 ? "+" : ""}${p.densityVsReferencePct}% vs a mild sea-level day`,
      `Ball speed through the air: ${p.speed}. Bounce: ${p.bounce}.`,
      p.drivers.length ? `Drivers: ${p.drivers.join("; ")}` : "",
      "",
    );
  }

  lines.push(
    `PLAYER TRAINING EVIDENCE — ${evidence.sessions.length} recent session(s), ` +
      `${evidence.reviewedCount} reviewed, ${evidence.feedbackCount} with the player's own feedback:`,
    evidence.sessions.length ? JSON.stringify(evidence.sessions, null, 1) : "none",
  );

  return lines.filter((l) => l !== "").join("\n");
}
