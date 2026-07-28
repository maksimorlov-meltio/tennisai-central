// ============================================================
// TennisAI — map a generated session → a TrainingPlan create payload
// Pure + deterministic so it can be unit-tested without a backend.
// Each session drill becomes a TrainingDrill whose instructions carry
// both the WHAT and the HOW (coaching cues), preserving the plan detail.
// ============================================================

import type { GeneratedSession } from "./types";
import type { TrainingPlanCreateInput, TrainingDrillInput } from "@/types";

export function sessionToTrainingPlanInput(
  session: GeneratedSession,
  playerId: string,
): TrainingPlanCreateInput {
  const drills: TrainingDrillInput[] = session.blocks.flatMap((block) =>
    block.drills.map((d) => ({
      objective: d.name,
      category: d.category,
      // Fold the coaching cues (HOW) into the instructions so nothing is lost.
      instructions: `${d.whatToDo}\n\nHow:\n- ${d.howToDo.join("\n- ")}`,
      durationMin: d.durationMinutes,
      equipment: d.equipment.length ? d.equipment.join(", ") : undefined,
      intensity: session.intensity,
      successCriteria: d.successCriteria,
      coachNotes: `${block.title} — ${block.rationale}`,
    })),
  );

  return {
    playerId,
    title: session.title,
    drills,
  };
}
