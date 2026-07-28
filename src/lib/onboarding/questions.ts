// ============================================================
// TennisAI — role-based onboarding questionnaire
// Shown once after a new account is created. Every choice question
// also lets the user write their own answer ("Other"). Data only.
// ============================================================

import type { UserRole } from "@/types";

export type QuestionType = "single" | "multi" | "text";

export interface OnboardingQuestion {
  /** Stable key the answer is stored under (User.onboarding[id]). */
  id: string;
  prompt: string;
  type: QuestionType;
  /** Preset choices for single/multi questions. */
  options?: string[];
  /** Allow a free-text "Other" answer in addition to the options. */
  allowCustom?: boolean;
  /** Hint text for free-text (`text`) questions. */
  placeholder?: string;
  /** If true, the user may move on without answering. */
  optional?: boolean;
}

const PLAYER: OnboardingQuestion[] = [
  {
    id: "playingLevel",
    prompt: "What's your current playing level?",
    type: "single",
    options: ["Beginner", "Intermediate", "Advanced", "Competitive / tournament"],
    allowCustom: true,
  },
  { id: "dominantHand", prompt: "Which is your dominant hand?", type: "single", options: ["Right", "Left"] },
  { id: "backhand", prompt: "What backhand do you play?", type: "single", options: ["One-handed", "Two-handed"] },
  {
    id: "preferredSurface",
    prompt: "Which surface do you prefer?",
    type: "single",
    options: ["Hard", "Clay", "Grass", "Indoor"],
    allowCustom: true,
  },
  {
    id: "strengths",
    prompt: "What are your biggest strengths? (pick any)",
    type: "multi",
    options: ["Serve", "Forehand", "Backhand", "Movement", "Net play", "Fitness", "Mental game"],
    allowCustom: true,
  },
  {
    id: "improve",
    prompt: "What do you most want to improve?",
    type: "multi",
    options: ["Serve", "Forehand", "Backhand", "Movement", "Net play", "Fitness", "Consistency", "Mental game"],
    allowCustom: true,
  },
  {
    id: "goal",
    prompt: "What's your main goal this season?",
    type: "single",
    options: ["Improve ranking", "Win a tournament", "Build consistency", "Return from injury", "Have fun & stay fit"],
    allowCustom: true,
  },
  {
    id: "injuries",
    prompt: "Any injuries or physical limits we should plan around? (optional)",
    type: "text",
    placeholder: "e.g. recovering right shoulder — limit serve volume",
    optional: true,
  },
];

const COACH: OnboardingQuestion[] = [
  {
    id: "experience",
    prompt: "How long have you been coaching?",
    type: "single",
    options: ["Under 2 years", "2–5 years", "5–10 years", "10+ years"],
    allowCustom: true,
  },
  {
    id: "certification",
    prompt: "What's your highest coaching certification?",
    type: "single",
    options: ["None yet", "National federation", "ITF", "PTR / PTA", "Other"],
    allowCustom: true,
  },
  { id: "organization", prompt: "Which club or academy do you coach at? (optional)", type: "text", placeholder: "Club / academy name", optional: true },
  {
    id: "focus",
    prompt: "What's your coaching focus? (pick any)",
    type: "multi",
    options: ["Juniors", "Performance / competitive", "Adult recreational", "High performance", "Technique", "Tactics", "Physical"],
    allowCustom: true,
  },
  {
    id: "groupSize",
    prompt: "How do you usually coach?",
    type: "single",
    options: ["1-on-1", "Small groups (2–4)", "Squads (5–8)", "Large groups / clinics"],
    allowCustom: true,
  },
];

const OBSERVER: OnboardingQuestion[] = [
  {
    id: "relation",
    prompt: "What's your relationship to the player?",
    type: "single",
    options: ["Parent", "Guardian", "Family member", "Supporter"],
    allowCustom: true,
  },
  { id: "playerName", prompt: "Who are you following? (player's name, optional)", type: "text", placeholder: "Player name", optional: true },
  {
    id: "follow",
    prompt: "What would you like to keep track of? (pick any)",
    type: "multi",
    options: ["Training schedule", "Progress & feedback", "Tournaments", "Finances"],
    allowCustom: true,
  },
];

const ADMIN: OnboardingQuestion[] = [
  { id: "academyName", prompt: "What's your academy's name?", type: "text", placeholder: "Academy name" },
  {
    id: "coaches",
    prompt: "How many coaches are in your academy?",
    type: "single",
    options: ["1–2", "3–5", "6–10", "10+"],
    allowCustom: true,
  },
  {
    id: "players",
    prompt: "Roughly how many players?",
    type: "single",
    options: ["Under 10", "10–30", "30–100", "100+"],
    allowCustom: true,
  },
];

const BY_ROLE: Record<UserRole, OnboardingQuestion[]> = {
  player: PLAYER,
  coach: COACH,
  observer: OBSERVER,
  admin: ADMIN,
};

export function questionsForRole(role: UserRole): OnboardingQuestion[] {
  return BY_ROLE[role] ?? [];
}

/** Role label shown in the questionnaire header. */
export const ROLE_ONBOARDING_TITLE: Record<UserRole, string> = {
  player: "Set up your player profile",
  coach: "Set up your coaching profile",
  observer: "Set up your profile",
  admin: "Set up your academy",
};
