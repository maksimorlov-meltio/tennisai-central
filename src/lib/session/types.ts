// ============================================================
// TennisAI — Session Generator: types
// A deterministic, best-practice-driven tennis session builder.
// Given the coach's preferences it produces a structured session
// (warm-up → technical → tactical → live-ball → cool-down) where
// every drill states WHAT to do and HOW to do it (coaching cues).
// ============================================================

import type { Intensity, Surface, DrillCategory } from "@/types";

export type PlayerLevel = "beginner" | "intermediate" | "advanced";

export type FocusArea =
  | "serve"
  | "return"
  | "forehand"
  | "backhand"
  | "net"
  | "movement"
  | "fitness"
  | "tactics"
  | "mental";

export type SessionGoal = "technical" | "tactical" | "physical" | "match_prep" | "recovery";

export type SessionFormat = "individual" | "group";

/** The knobs a coach sets before a session is generated. */
export interface SessionPreferences {
  level: PlayerLevel;
  focusAreas: FocusArea[]; // 1–3 recommended
  durationMinutes: number; // e.g. 45 | 60 | 90 | 120
  intensity: Intensity; // low | medium | high
  format: SessionFormat; // individual | group
  playersCount: number; // ≥ 1
  surface: Surface; // clay | hard | grass | indoor
  goal: SessionGoal;
}

export type BlockKind = "warmup" | "technical" | "tactical" | "live" | "cooldown";

/** A reusable drill from the best-practice library. */
export interface DrillTemplate {
  id: string;
  name: string;
  category: DrillCategory; // technical | tactical | physical | mental
  focus: FocusArea[]; // focus areas this drill develops
  kinds: BlockKind[]; // which session blocks it fits
  minLevel: PlayerLevel;
  whatToDo: string; // the drill itself
  howToDo: string[]; // coaching cues — HOW to execute it well
  successCriteria: string; // measurable target
  equipment: string[];
  suitsGroup: boolean; // works with a group, not just 1-on-1
  baseIntensity: Intensity;
}

/** A drill as placed into a concrete session (with allocated time). */
export interface SessionDrill {
  name: string;
  category: DrillCategory;
  whatToDo: string;
  howToDo: string[];
  durationMinutes: number;
  reps?: string;
  successCriteria: string;
  equipment: string[];
}

export interface SessionBlock {
  kind: BlockKind;
  title: string;
  minutes: number;
  rationale: string; // the best-practice reason this block exists
  drills: SessionDrill[];
}

export interface GeneratedSession {
  title: string;
  summary: string;
  level: PlayerLevel;
  goal: SessionGoal;
  intensity: Intensity;
  surface: Surface;
  format: SessionFormat;
  playersCount: number;
  totalMinutes: number;
  focusAreas: FocusArea[];
  blocks: SessionBlock[];
  equipmentChecklist: string[];
  coachingPrinciples: string[];
  notes: string[]; // load-management / safety / individualisation notes
}

export const FOCUS_LABELS: Record<FocusArea, string> = {
  serve: "Serve",
  return: "Return",
  forehand: "Forehand",
  backhand: "Backhand",
  net: "Net / Volley",
  movement: "Movement & Footwork",
  fitness: "Fitness & Conditioning",
  tactics: "Tactics & Patterns",
  mental: "Mental & Competitive",
};

export const GOAL_LABELS: Record<SessionGoal, string> = {
  technical: "Technical development",
  tactical: "Tactical development",
  physical: "Physical / conditioning",
  match_prep: "Match preparation",
  recovery: "Recovery / light session",
};

export const LEVEL_RANK: Record<PlayerLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};
