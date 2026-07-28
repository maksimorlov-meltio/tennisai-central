// ============================================================
// TennisAI — Session Generator: the engine
// Pure, deterministic. Maps SessionPreferences → GeneratedSession
// using the best-practice drill library. No randomness, no network,
// no per-user data — so it is fully unit-testable and transparent.
// ============================================================

import type {
  BlockKind,
  DrillTemplate,
  FocusArea,
  GeneratedSession,
  SessionBlock,
  SessionDrill,
  SessionGoal,
  SessionPreferences,
} from "./types";
import { FOCUS_LABELS, GOAL_LABELS, LEVEL_RANK } from "./types";
import { DRILL_LIBRARY } from "./drills";

/** Share of total time per block, by session goal (rows sum to 1). */
const GOAL_WEIGHTS: Record<SessionGoal, Record<BlockKind, number>> = {
  technical: { warmup: 0.12, technical: 0.4, tactical: 0.23, live: 0.18, cooldown: 0.07 },
  tactical: { warmup: 0.12, technical: 0.22, tactical: 0.38, live: 0.21, cooldown: 0.07 },
  physical: { warmup: 0.15, technical: 0.28, tactical: 0.12, live: 0.35, cooldown: 0.1 },
  match_prep: { warmup: 0.12, technical: 0.18, tactical: 0.3, live: 0.33, cooldown: 0.07 },
  recovery: { warmup: 0.25, technical: 0.22, tactical: 0.1, live: 0.08, cooldown: 0.35 },
};

const BLOCK_ORDER: BlockKind[] = ["warmup", "technical", "tactical", "live", "cooldown"];

const BLOCK_TITLES: Record<BlockKind, string> = {
  warmup: "Warm-up & activation",
  technical: "Technical block",
  tactical: "Tactical block",
  live: "Live-ball & competitive",
  cooldown: "Cool-down & review",
};

const BLOCK_RATIONALE: Record<BlockKind, string> = {
  warmup: "Raise heart rate, groove timing and protect against injury before intensity rises.",
  technical: "Isolated, deliberate practice of the focus stroke(s) with a clear feeding progression.",
  tactical: "Apply the technique inside patterns and situations that mirror real play.",
  live: "Transfer skills to competition under score and pressure — where they actually count.",
  cooldown: "Aid recovery and lock in learning by reviewing what was worked and the next priority.",
};

const SURFACE_NOTE: Record<SessionPreferences["surface"], string> = {
  clay: "Clay: expect longer rallies and higher bounce — reward patience and practise sliding into shots.",
  hard: "Hard court: true medium-fast bounce — first-strike patterns (serve +1, return +1) decide points.",
  grass: "Grass: low, fast bounce and short points — bias toward slice, returns and net play.",
  indoor: "Indoor: no wind or sun, faster conditions — targets can be tighter and serving more aggressive.",
};

/** Round-and-fix so per-block minutes sum EXACTLY to the requested total. */
function allocateMinutes(total: number, goal: SessionGoal): Record<BlockKind, number> {
  const weights = GOAL_WEIGHTS[goal];
  const mins = {} as Record<BlockKind, number>;
  for (const k of BLOCK_ORDER) mins[k] = Math.round(weights[k] * total);

  // Fix rounding drift by adjusting the largest block.
  const drift = total - BLOCK_ORDER.reduce((s, k) => s + mins[k], 0);
  if (drift !== 0) {
    const biggest = BLOCK_ORDER.reduce((a, b) => (mins[b] > mins[a] ? b : a));
    mins[biggest] += drift;
  }

  // Guarantee a real warm-up and cool-down for sessions of a meaningful length.
  if (total >= 45) {
    for (const k of ["warmup", "cooldown"] as BlockKind[]) {
      if (mins[k] < 5) {
        const need = 5 - mins[k];
        const donor = (["technical", "tactical", "live"] as BlockKind[]).reduce((a, b) =>
          mins[b] > mins[a] ? b : a,
        );
        if (mins[donor] - need >= 5) {
          mins[donor] -= need;
          mins[k] = 5;
        }
      }
    }
  }
  return mins;
}

const eligible = (d: DrillTemplate, kind: BlockKind, prefs: SessionPreferences): boolean =>
  d.kinds.includes(kind) &&
  LEVEL_RANK[d.minLevel] <= LEVEL_RANK[prefs.level] &&
  (prefs.format === "individual" || d.suitsGroup);

/** Prefer the most level-appropriate drill (highest minLevel ≤ player level); id breaks ties → deterministic. */
function byLevelThenId(a: DrillTemplate, b: DrillTemplate): number {
  if (LEVEL_RANK[b.minLevel] !== LEVEL_RANK[a.minLevel]) return LEVEL_RANK[b.minLevel] - LEVEL_RANK[a.minLevel];
  return a.id.localeCompare(b.id);
}

/** Split a block's minutes across its drills (first drill gets any remainder). */
function splitMinutes(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const out = Array<number>(n).fill(base);
  out[0] += total - base * n;
  return out;
}

function toSessionDrills(chosen: DrillTemplate[], minutes: number): SessionDrill[] {
  const split = splitMinutes(minutes, chosen.length);
  return chosen.map((d, i) => ({
    name: d.name,
    category: d.category,
    whatToDo: d.whatToDo,
    howToDo: d.howToDo,
    durationMinutes: split[i],
    successCriteria: d.successCriteria,
    equipment: d.equipment,
  }));
}

/** How many of a drill's focus tags fall inside the requested focus set. */
function focusMatchScore(d: DrillTemplate, areas: FocusArea[]): number {
  return d.focus.filter((f) => areas.includes(f)).length;
}

/**
 * Choose drills for a focus-driven block (technical / tactical), staying tight
 * to the requested focus:
 *  1. one dedicated drill per focus area — the MOST specific match wins
 *     (fewest focus tags), then most level-appropriate, then id (deterministic);
 *  2. backfill only with drills that still hit a requested focus area, ranked
 *     by how on-focus they are. A completely off-focus drill is used only as a
 *     last resort when nothing on-focus remains.
 */
function chooseFocusDrills(kind: BlockKind, prefs: SessionPreferences, max: number): DrillTemplate[] {
  const pool = DRILL_LIBRARY.filter((d) => eligible(d, kind, prefs));
  const areas: FocusArea[] =
    prefs.goal === "physical"
      ? [...new Set<FocusArea>(["movement", "fitness", ...prefs.focusAreas])]
      : prefs.focusAreas;
  const chosen: DrillTemplate[] = [];

  // 1) A dedicated, most-specific drill for each focus area.
  for (const area of areas) {
    if (chosen.length >= max) break;
    const pick = pool
      .filter((d) => d.focus.includes(area) && !chosen.includes(d))
      .sort(
        (a, b) =>
          a.focus.length - b.focus.length || // more specific first
          LEVEL_RANK[b.minLevel] - LEVEL_RANK[a.minLevel] || // level-appropriate
          a.id.localeCompare(b.id),
      )[0];
    if (pick) chosen.push(pick);
  }

  // 2) Focus-aware backfill (off-focus drills sort last via score 0).
  if (chosen.length < max) {
    const ranked = pool
      .filter((d) => !chosen.includes(d))
      .sort(
        (a, b) =>
          focusMatchScore(b, areas) - focusMatchScore(a, areas) || // most on-focus first
          a.focus.length - b.focus.length ||
          LEVEL_RANK[b.minLevel] - LEVEL_RANK[a.minLevel] ||
          a.id.localeCompare(b.id),
      );
    for (const d of ranked) {
      if (chosen.length >= max) break;
      chosen.push(d);
    }
  }
  return chosen;
}

/** Choose drills for the fixed-shape blocks (warmup / live / cooldown). */
function chooseFixedDrills(kind: BlockKind, prefs: SessionPreferences, max: number): DrillTemplate[] {
  const pool = DRILL_LIBRARY.filter((d) => eligible(d, kind, prefs));

  const prefIds: Record<Exclude<BlockKind, "technical" | "tactical">, string[]> = {
    warmup: ["wu-dynamic", "wu-mini-tennis", "mv-split-first-step"],
    live:
      prefs.goal === "match_prep"
        ? ["lv-pressure-0-30", "lv-tiebreak-constraint", "lv-king-of-court"]
        : prefs.format === "group"
          ? ["lv-king-of-court", "lv-tiebreak-constraint"]
          : ["lv-tiebreak-constraint", "tc-serve-plus-one"],
    cooldown: prefs.goal === "physical" ? ["ft-core", "cd-stretch-review"] : ["cd-stretch-review"],
  };

  const wanted = prefIds[kind as Exclude<BlockKind, "technical" | "tactical">] ?? [];
  const chosen: DrillTemplate[] = [];
  for (const id of wanted) {
    if (chosen.length >= max) break;
    const d = pool.find((x) => x.id === id);
    if (d) chosen.push(d);
  }
  for (const d of pool.sort(byLevelThenId)) {
    if (chosen.length >= max) break;
    if (!chosen.includes(d)) chosen.push(d);
  }
  return chosen;
}

/** How many drills to fit into a block given its minutes (≈ one drill per 8–12 min). */
function drillCountFor(kind: BlockKind, minutes: number, prefs: SessionPreferences): number {
  if (minutes <= 0) return 0;
  if (kind === "cooldown") return prefs.goal === "physical" ? 2 : 1;
  if (kind === "warmup") return minutes >= 12 ? 2 : 1;
  const perDrill = kind === "technical" ? 12 : 10;
  return Math.max(1, Math.min(3, Math.floor(minutes / perDrill) || 1));
}

export function generateSession(input: SessionPreferences): GeneratedSession {
  // Normalise defensively so a bad form value can't produce nonsense.
  const prefs: SessionPreferences = {
    ...input,
    durationMinutes: Math.max(20, Math.min(180, Math.round(input.durationMinutes))),
    focusAreas: (input.focusAreas.length ? input.focusAreas : (["forehand"] as FocusArea[])).slice(0, 3),
    playersCount: Math.max(1, Math.round(input.playersCount)),
    // A recovery session is low intensity by definition.
    intensity: input.goal === "recovery" ? "low" : input.intensity,
  };

  const minutes = allocateMinutes(prefs.durationMinutes, prefs.goal);

  const blocks: SessionBlock[] = [];
  for (const kind of BLOCK_ORDER) {
    const m = minutes[kind];
    if (m <= 0) continue;
    const count = drillCountFor(kind, m, prefs);
    const chosen =
      kind === "technical" || kind === "tactical"
        ? chooseFocusDrills(kind, prefs, count)
        : chooseFixedDrills(kind, prefs, count);
    if (!chosen.length) continue;
    blocks.push({
      kind,
      title: BLOCK_TITLES[kind],
      minutes: m,
      rationale: BLOCK_RATIONALE[kind],
      drills: toSessionDrills(chosen, m),
    });
  }

  const focusText = prefs.focusAreas.map((f) => FOCUS_LABELS[f]).join(", ");
  const totalMinutes = blocks.reduce((s, b) => s + b.minutes, 0);
  const equipmentChecklist = [
    ...new Set(blocks.flatMap((b) => b.drills.flatMap((d) => d.equipment))),
  ].sort();

  const notes: string[] = [
    SURFACE_NOTE[prefs.surface],
    prefs.format === "group"
      ? `Group of ${prefs.playersCount}: rotate players through feeds to keep work density high and rest honest.`
      : "1-on-1: maximise reps and give a single, specific cue per drill.",
  ];
  if (prefs.intensity === "high" && prefs.goal !== "recovery") {
    notes.push("High intensity: watch for fatigue and technique breakdown — cut a set rather than grind through poor reps.");
  }
  if (prefs.goal === "recovery") {
    notes.push("Recovery day: keep everything sub-maximal — the aim is movement quality and feel, not load.");
  }
  notes.push("Not medical advice: stop and reassess on any pain; adjust load for injury history.");

  return {
    title: `${GOAL_LABELS[prefs.goal]} — ${focusText} (${prefs.level})`,
    summary: `A ${totalMinutes}-minute ${prefs.format} ${prefs.goal.replace("_", " ")} session on ${prefs.surface} for a ${prefs.level} player, focused on ${focusText}. Structured warm-up → technical → tactical → live-ball → cool-down.`,
    level: prefs.level,
    goal: prefs.goal,
    intensity: prefs.intensity,
    surface: prefs.surface,
    format: prefs.format,
    playersCount: prefs.playersCount,
    totalMinutes,
    focusAreas: prefs.focusAreas,
    blocks,
    equipmentChecklist,
    coachingPrinciples: [
      "Deliberate practice: every drill has a specific, measurable success criterion.",
      "Progressive feeding: hand-fed → basket-fed → live → under pressure.",
      "Game-based transfer: finish with competitive, score-based play.",
      "One or two cues at a time — don't over-coach mid-rally.",
      "Individualise: adjust targets and reps to the player in front of you.",
    ],
    notes,
  };
}
