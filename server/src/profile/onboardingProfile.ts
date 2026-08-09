// ============================================================
// Map a player's onboarding answers into structured PlayerProfile
// columns. Pure + deterministic (unit-tested; no DB access here).
// Question ids come from src/lib/onboarding/questions.ts (player set).
// ============================================================

type Answers = Record<string, string | string[]>;

const asStr = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const asArr = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v.filter((s) => s.trim()) : typeof v === "string" && v.trim() ? [v.trim()] : [];

function normHand(v?: string): string | undefined {
  const s = v?.toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("left")) return "left";
  if (s.startsWith("right")) return "right";
  return undefined;
}

function normBackhand(v?: string): string | undefined {
  const s = v?.toLowerCase();
  if (!s) return undefined;
  if (s.includes("one")) return "one_handed";
  if (s.includes("two")) return "two_handed";
  return undefined;
}

function normSurface(v?: string): string | undefined {
  const s = v?.toLowerCase();
  if (!s) return undefined;
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  if (s.includes("indoor")) return "indoor";
  if (s.includes("hard")) return "hard";
  return undefined;
}

export interface PlayerProfileFields {
  playingLevel?: string;
  dominantHand?: string;
  backhandType?: string;
  preferredSurface?: string;
  technicalStrengths: string[];
  technicalWeaknesses: string[];
  currentGoals?: string;
}

// GDPR (adults-only trial): free-text injury / health answers are Art.9 special-
// category data. We deliberately do NOT persist them into injuryRestrictions /
// physicalLimitations from onboarding — the health question is removed on the
// client, and any stray value in `answers` is ignored here.
export function onboardingToPlayerProfile(answers: Answers): PlayerProfileFields {
  return {
    playingLevel: asStr(answers.playingLevel),
    dominantHand: normHand(asStr(answers.dominantHand)),
    backhandType: normBackhand(asStr(answers.backhand)),
    preferredSurface: normSurface(asStr(answers.preferredSurface)),
    technicalStrengths: asArr(answers.strengths),
    technicalWeaknesses: asArr(answers.improve),
    currentGoals: asStr(answers.goal),
  };
}
