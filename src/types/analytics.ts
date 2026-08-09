// ============================================================
// TennisAI — Analytics Domain Types (Stage 1)
// Shared contract for: player profile → opponent → match →
// scouting → game plan → post-match → training plan.
// Mirrors server/prisma/schema.prisma. Raw counts only; every
// percentage is computed (see MatchComputedStats), never stored.
// ============================================================

// --- Shared primitives ------------------------------------------------

export type Handedness = "left" | "right";
export type BackhandType = "one_handed" | "two_handed";
export type Surface = "clay" | "hard" | "grass" | "indoor";
export type IndoorOutdoor = "indoor" | "outdoor";
export type DrillCategory = "technical" | "tactical" | "physical" | "mental";
export type Intensity = "low" | "medium" | "high";

/** Report lifecycle — mirrors the Prisma `ReportStatus` enum. */
export type ReportStatus = "generated" | "approved" | "rejected" | "outdated";

/**
 * Confidence for a single analytical conclusion. `insufficient` means the
 * data does not support a reliable claim — the UI must render the explicit
 * "Insufficient data to make a reliable conclusion" state rather than a value.
 */
export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient";

/**
 * Every analytical statement is traceable. `dataSample` describes the
 * evidence base in plain language; `sourceRecordIds` points at the exact
 * match rows the conclusion draws on. Speculation is never allowed — if
 * evidence is missing, confidence is "insufficient".
 */
export interface AnalyticalClaim {
  statement: string;
  confidence: ConfidenceLevel;
  evidence?: string;
  dataSample?: string;
  sourceRecordIds?: string[];
}

// --- Playing style ----------------------------------------------------

/**
 * Editable playing-style dimensions, each scored 1..10 (undefined until set).
 * A descriptive classification is DERIVED from these (see StyleClassification);
 * the player is never reduced to a single stored label.
 */
export interface PlayStyleDimensions {
  aggression?: number; // 1 defensive .. 10 aggressive
  netPlay?: number; // 1 deep baseline .. 10 frequent net
  rallyTolerance?: number; // 1 short-point pref .. 10 long-rally
  serveDependence?: number; // 1 low .. 10 high
  riskLevel?: number; // 1 conservative .. 10 high-risk
  returnPosition?: number; // 1 inside-baseline .. 10 deep
  pressure?: number; // 1 .. 10 pressure performance
}

export interface SurfaceSuitability {
  clay?: number; // 1..10
  hard?: number;
  grass?: number;
  indoor?: number;
}

/** Derived, human-readable style summary (computed from PlayStyleDimensions). */
export interface StyleClassification {
  label: string; // e.g. "Aggressive baseliner"
  descriptors: string[]; // supporting descriptors
}

// --- Extended player profile -----------------------------------------

export interface PlayerProfileDetail {
  id: string;
  userId: string;
  dateOfBirth?: string; // ISO "yyyy-MM-dd"
  playingLevel?: string;
  ranking?: string;
  dominantHand?: Handedness;
  backhandType?: BackhandType;
  preferredSurface?: Surface;
  currentCoachId?: string;
  preferredCourtPosition?: string;
  technicalStrengths: string[];
  technicalWeaknesses: string[];
  physicalStrengths: string[];
  physicalLimitations: string[];
  serveTendencies?: string;
  returnTendencies?: string;
  mentalUnderPressure?: string;
  currentGoals?: string;
  injuryRestrictions?: string;
  style: PlayStyleDimensions;
  surfaceSuitability: SurfaceSuitability;
  /** 0..1 fraction of key fields completed (computed server-side). */
  completion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Private coach note. NEVER returned to players or parents — the server
 * scopes reads to the authoring coach only. Modeled in its own table so it
 * can never be joined into a player/parent profile response.
 */
export interface PrivateCoachNote {
  id: string;
  authorCoachId: string;
  subjectUserId: string;
  opponentId?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

// --- Opponent ---------------------------------------------------------

export interface Opponent {
  id: string;
  ownerId: string;
  academyId?: string;
  firstName: string;
  lastName: string;
  dominantHand?: Handedness;
  backhandType?: BackhandType;
  preferredSurface?: Surface;
  strongestStroke?: string;
  weakestStroke?: string;
  servePatterns?: string;
  returnPosition?: string;
  returnTendencies?: string;
  forehandPreference?: string;
  backhandPreference?: string;
  netBehaviour?: string;
  pressurePerformance?: string;
  style: PlayStyleDimensions;
  /** Explicitly-marked coach observations (not derived from match data). */
  observations: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Match ------------------------------------------------------------

export interface MatchSetScore {
  player: number;
  opponent: number;
  tiebreak?: string; // e.g. "7-5"
}

export type RallyLengthBuckets = {
  "1-4"?: number;
  "5-8"?: number;
  "9+"?: number;
};

export interface MomentumChange {
  set: number;
  game?: number;
  note: string;
}

/** Raw counts entered courtside. Percentages are NEVER entered here. */
export interface MatchStatsRaw {
  firstServeAttempts?: number;
  firstServesIn?: number;
  firstServePointsWon?: number;
  secondServePlayed?: number;
  secondServePointsWon?: number;
  aces?: number;
  doubleFaults?: number;
  returnPointsPlayed?: number;
  returnPointsWon?: number;
  winners?: number;
  forcedErrors?: number;
  unforcedErrors?: number;
  breakPointsCreated?: number;
  breakPointsConverted?: number;
  breakPointsFaced?: number;
  breakPointsSaved?: number;
  netApproaches?: number;
  netPointsWon?: number;
  rallyLengthBuckets?: RallyLengthBuckets;
}

/** Percentages derived from MatchStatsRaw (computed, read-only). */
export interface MatchComputedStats {
  firstServePct?: number; // firstServesIn / firstServeAttempts
  firstServeWonPct?: number; // firstServePointsWon / firstServesIn
  secondServeWonPct?: number; // secondServePointsWon / secondServePlayed
  returnPointsWonPct?: number; // returnPointsWon / returnPointsPlayed
  breakPointConversionPct?: number; // converted / created
  breakPointSavePct?: number; // saved / faced
  netPointsWonPct?: number; // netPointsWon / netApproaches
  totalWinners?: number;
  totalErrors?: number; // forced + unforced
  winnerToUnforcedRatio?: number;
}

export interface Match {
  id: string;
  playerId: string;
  opponentId?: string;
  academyId?: string;
  date: string; // ISO
  competition?: string;
  surface: Surface;
  indoorOutdoor: IndoorOutdoor;
  format: string; // best_of_3 | best_of_5 | pro_set | ...
  /** Raw win/loss — NEVER used to infer performance quality. */
  result?: "win" | "loss";
  scoreSets: MatchSetScore[];
  conditions?: string;
  stats: MatchStatsRaw;
  /** Present on read; computed from `stats`. */
  computed?: MatchComputedStats;
  momentumChanges?: MomentumChange[];
  notesBySet?: Record<string, string>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// --- Match logging + derived statistics (API contract) ----------------
// Mirrors server/src/matches/routes.ts and server/src/stats/compute.ts.
// The API stores raw counts only and computes every percentage on read.

/** Documented match formats accepted by the API. */
export type MatchFormat = "best_of_3" | "best_of_5" | "pro_set" | "single_set" | "fast4";
export type MatchResult = "win" | "loss";

/** A match as returned by the API — carries the resolved opponent name. */
export interface MatchView extends Match {
  opponentName?: string;
}

/** Raw counts without the rally-bucket object (numeric fields only). */
export type MatchCountFields = Omit<MatchStatsRaw, "rallyLengthBuckets">;

/** POST payload. `playerId` defaults to the caller; `createdBy` is server-pinned. */
export interface MatchCreateInput extends MatchStatsRaw {
  playerId?: string;
  opponentId?: string | null;
  date: string; // ISO or yyyy-MM-dd
  competition?: string;
  surface: Surface;
  indoorOutdoor: IndoorOutdoor;
  format: MatchFormat;
  result?: MatchResult;
  scoreSets: MatchSetScore[];
  conditions?: string;
  notesBySet?: Record<string, string>;
}

/** PATCH payload — `null` explicitly clears a stored value. */
export type MatchUpdateInput = {
  opponentId?: string | null;
  date?: string;
  competition?: string | null;
  surface?: Surface;
  indoorOutdoor?: IndoorOutdoor;
  format?: MatchFormat;
  result?: MatchResult | null;
  scoreSets?: MatchSetScore[];
  conditions?: string | null;
  rallyLengthBuckets?: RallyLengthBuckets | null;
  notesBySet?: Record<string, string> | null;
} & { [K in keyof MatchCountFields]?: number | null };

/**
 * A computed value plus the number of matches that fed it. `value === null`
 * means the underlying counts were never entered — the UI must render "—",
 * never 0 and never an invented figure.
 */
export interface StatMetric {
  value: number | null;
  sample: number;
}

export interface SurfaceSplitStats {
  surface: string;
  matches: number;
  resultsRecorded: number;
  wins: number | null;
  losses: number | null;
  winRatePct: number | null;
}

export interface RecentFormMatch {
  id: string;
  date: string | null;
  surface: string;
  result: MatchResult | null;
}

export interface RecentFormSummary {
  sampleSize: number;
  wins: number | null;
  losses: number | null;
  winRatePct: number | null;
  /** Newest first. */
  matches: RecentFormMatch[];
}

/** Aggregate returned by GET /api/matches/stats. */
export interface AggregateMatchStats {
  playerId?: string;
  matchesPlayed: number;
  /** Matches with an explicit win/loss — every W-L figure is scoped to these. */
  resultsRecorded: number;
  wins: number | null;
  losses: number | null;
  winRatePct: number | null;
  firstMatchDate: string | null;
  lastMatchDate: string | null;
  surfaces: SurfaceSplitStats[];
  serve: {
    firstServePct: StatMetric;
    firstServeWonPct: StatMetric;
    secondServeWonPct: StatMetric;
    aces: StatMetric;
    doubleFaults: StatMetric;
  };
  returnGame: {
    returnPointsWonPct: StatMetric;
  };
  breakPoints: {
    conversionPct: StatMetric;
    savePct: StatMetric;
  };
  rally: {
    winners: StatMetric;
    forcedErrors: StatMetric;
    unforcedErrors: StatMetric;
    winnerToUnforcedRatio: StatMetric;
    netPointsWonPct: StatMetric;
  };
  recentForm: RecentFormSummary;
}

/** POST payload for an opponent record. `ownerId` is server-pinned. */
export interface OpponentCreateInput {
  firstName: string;
  lastName: string;
  dominantHand?: Handedness;
  backhandType?: BackhandType;
  preferredSurface?: Surface;
  strongestStroke?: string;
  weakestStroke?: string;
  servePatterns?: string;
  returnPosition?: string;
  returnTendencies?: string;
  forehandPreference?: string;
  backhandPreference?: string;
  netBehaviour?: string;
  pressurePerformance?: string;
  style?: PlayStyleDimensions;
  observations?: string[];
}

export type OpponentUpdateInput = Partial<OpponentCreateInput>;

// --- AI report contract ----------------------------------------------

/** Metadata carried by every generated report for traceability + lifecycle. */
export interface ReportMeta {
  status: ReportStatus;
  model?: string;
  promptVersion?: string;
  sourceRecordIds?: string[];
  confidenceOverall?: number; // 0..1
  approvedById?: string;
  approvedAt?: string;
  generatedAt: string;
  updatedAt: string;
}

export interface ScoutingReportContent {
  strengths: AnalyticalClaim[];
  weaknesses: AnalyticalClaim[];
  servePatterns: AnalyticalClaim[];
  returnPatterns: AnalyticalClaim[];
  rallyPreferences: AnalyticalClaim[];
  underPressure: AnalyticalClaim[];
  surfaceTendencies: AnalyticalClaim[];
  recommendedResponses: AnalyticalClaim[];
}

export interface ScoutingReport extends ReportMeta {
  id: string;
  opponentId: string;
  createdById: string;
  academyId?: string;
  content: ScoutingReportContent;
}

export interface GamePlanContent {
  priorities: string[]; // exactly three primary tactical priorities
  serveDeuce: string;
  serveAdvantage: string;
  firstServeTargets: string;
  secondServeTargets: string;
  returnPosition: string;
  returnTargets: string;
  preferredRallyPattern: string;
  opponentWeaknessesToTarget: string[];
  patternsToAvoid: string[];
  planB: string;
  breakPointStrategy: string;
  tieBreakStrategy: string;
  mentalReminders: string[];
  courtsideSummary: string;
}

export interface GamePlan extends ReportMeta {
  id: string;
  playerId: string;
  opponentId?: string;
  createdById: string;
  academyId?: string;
  /** AI-suggested plan. */
  content: GamePlanContent;
  /** Coach-approved edits, kept distinct from the AI suggestion. */
  coachOverrides?: Partial<GamePlanContent>;
}

export interface PostMatchReportContent {
  reasonsForResult: AnalyticalClaim[];
  performanceBySet: AnalyticalClaim[];
  serve: AnalyticalClaim[];
  return: AnalyticalClaim[];
  rally: AnalyticalClaim[];
  importantPoints: AnalyticalClaim[];
  tacticsWorked: AnalyticalClaim[];
  tacticsFailed: AnalyticalClaim[];
  recurringErrors: AnalyticalClaim[];
  baselineComparison: AnalyticalClaim[];
  conclusions: AnalyticalClaim[]; // three actionable conclusions
  nextWeekPriorities: string[];
}

export interface PostMatchReport extends ReportMeta {
  id: string;
  matchId: string;
  createdById: string;
  content: PostMatchReportContent;
}

// --- Training plan ----------------------------------------------------

export type DrillCompletionStatus = "pending" | "done" | "skipped";

export interface TrainingDrill {
  id: string;
  planId: string;
  objective: string;
  category: DrillCategory;
  instructions: string;
  durationMin?: number;
  reps?: string;
  equipment?: string;
  intensity?: Intensity;
  successCriteria: string; // measurable
  relatedInsight?: string;
  coachNotes?: string;
  completionStatus: DrillCompletionStatus;
  trainingId?: string; // optional link to a scheduled Training session
  createdAt: string;
  updatedAt: string;
}

export interface TrainingPlan {
  id: string;
  playerId: string;
  createdById: string;
  sourceReportId?: string;
  title: string;
  weekOf?: string;
  status: ReportStatus;
  model?: string;
  promptVersion?: string;
  drills: TrainingDrill[];
  generatedAt: string;
  updatedAt: string;
}

/** Payload to create a TrainingPlan (e.g. from a generated session). */
export interface TrainingDrillInput {
  objective: string;
  category: DrillCategory;
  instructions: string;
  durationMin?: number;
  reps?: string;
  equipment?: string;
  intensity?: Intensity;
  successCriteria: string;
  relatedInsight?: string;
  coachNotes?: string;
}

export interface TrainingPlanCreateInput {
  playerId: string;
  title: string;
  weekOf?: string;
  drills: TrainingDrillInput[];
}

// --- Subscriptions / usage -------------------------------------------

export type PlanTier = "free" | "player_pro" | "coach_pro" | "academy";

/** Plan limits are defined once in a config module and enforced server-side. */
export interface PlanLimits {
  tier: PlanTier;
  label: string;
  maxPlayers: number | null; // null = unlimited
  maxCoaches: number | null;
  aiReportsPerMonth: number;
  features: string[];
}

export interface SubscriptionInfo {
  tier: PlanTier;
  status: "active" | "past_due" | "canceled";
  periodStart: string;
  periodEnd?: string;
}

export interface AiUsage {
  periodKey: string; // "yyyy-MM"
  reportsGenerated: number;
  limit: number;
  remaining: number;
}
