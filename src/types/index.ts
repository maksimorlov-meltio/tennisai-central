// ============================================================
// TennisAI — Core Type Definitions
// ============================================================

// Analytics domain (Stage 1): profile → opponent → match → scouting →
// game plan → post-match → training plan. See ./analytics.ts.
export * from "./analytics";
// Roles & tenancy (Stage 2): academies, coach assignments, guardianships.
export * from "./roles";

// --- Enums / Unions ---

export type UserRole = "player" | "coach" | "observer" | "admin";

export type RelationshipStatus = "pending" | "active" | "rejected" | "revoked";

/** @deprecated Use RelationshipStatus — kept for backward compat */
export type ConnectionStatus = RelationshipStatus;

export type TournamentStatus = "planned" | "registered" | "maybe" | "withdrawn" | "played";

export type CalendarEventType = "training" | "tournament" | "match" | "travel" | "recovery";

export type CalendarEventState = "requested" | "tentative" | "confirmed" | "cancelled" | "completed";

export type RecurrenceFrequency = "daily" | "weekly" | "biweekly" | "monthly";
export type RecurrenceEndType = "never" | "count" | "until";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  endType: RecurrenceEndType;
  count?: number;
  until?: string;
  /** Dates to exclude from the series (for "this event only" edits/deletes) */
  exceptions?: string[];
}

export type FinanceCategory = "training" | "travel" | "tournament" | "equipment";

export type EquipmentCategory = "racket" | "string" | "shoes" | "balls" | "accessories";

export type NotificationType =
  | "training_reminder"
  | "tournament_reminder"
  | "request_approval"
  | "finance_update"
  | "ai_insight"
  | "system"
  | "training_request_created"
  | "training_request_approved"
  | "training_request_rejected"
  | "training_request_rescheduled"
  | "training_created"
  | "training_updated"
  | "training_deleted"
  | "calendar_event_created"
  | "calendar_event_updated"
  | "calendar_event_deleted";

export type TrainingRequestStatus = "pending" | "approved" | "rejected" | "reschedule_proposed" | "cancelled";

// --- Core Entities ---

export interface User {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerProfile extends User {
  role: "player";
  playerPublicId: string;
  dateOfBirth?: string;
  country?: string;
  dominantHand?: "left" | "right";
  playStyle?: string;
}

export interface CoachProfile extends User {
  role: "coach";
  coachPublicId: string;
  organization?: string;
  certifications?: string[];
  country?: string;
}

export interface ObserverProfile extends User {
  role: "observer";
  observerPublicId: string;
  relationToPlayer?: string;
}

export interface AdminProfile extends User {
  role: "admin";
}

export type AnyProfile = PlayerProfile | CoachProfile | ObserverProfile | AdminProfile;

// --- Relationships / Connections ---

export interface ConnectionRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserRole: UserRole;
  toUserId: string;
  toUserName: string;
  toUserRole: UserRole;
  status: RelationshipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectedPlayer {
  id: string;
  playerPublicId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  connectedSince: string;
}

// --- Teams ---

export interface Team {
  id: string;
  name: string;
  coachId: string;
  players: ConnectedPlayer[];
  createdAt: string;
  updatedAt: string;
}

// --- Calendar ---

export interface CalendarEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  state?: CalendarEventState;
  startDate: string;
  endDate: string;
  location?: string;
  description?: string;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  tournamentId?: string;
  coachNotes?: string;
  createdBy?: string;
  createdByRole?: UserRole;
  trainingRequestId?: string;
  recurrence?: RecurrenceRule;
  /** ID of the parent recurring event (set on virtual occurrences) */
  recurrenceParentId?: string;
  /** Occurrence index for virtual instances */
  recurrenceIndex?: number;
}

// --- Tournaments ---

/** Sanctioning body / tour. WTF is not a tennis federation — assumed WTA. */
export type TournamentFederation = "ITF" | "WTA" | "ATP" | "UTR" | "USTA";

export interface Tournament {
  id: string;
  name: string;
  city: string;
  country: string;
  surface: string;
  indoorOutdoor: "indoor" | "outdoor";
  altitude?: number;
  ballBrand?: string;
  weatherSummary?: string;
  category?: string;
  level?: string;
  startDate: string;
  endDate: string;
  description?: string;
  /** Sanctioning body — used for the calendar federation filter. */
  federation?: TournamentFederation;
}

export interface PlayerTournament {
  id: string;
  tournamentId: string;
  tournament: Tournament;
  playerId: string;
  playerName?: string;
  status: TournamentStatus;
  notes?: string;
}

// --- Finance ---

export interface FinanceEntry {
  id: string;
  playerId: string;
  category: FinanceCategory;
  description: string;
  amount: number;
  currency: string;
  date: string;
  createdAt: string;
}

export interface FinanceSummary {
  totalTraining: number;
  totalTravel: number;
  totalTournament: number;
  totalEquipment: number;
  currency: string;
}

// --- Equipment ---

export interface EquipmentItem {
  id: string;
  playerId: string;
  category: EquipmentCategory;
  name: string;
  brand?: string;
  model?: string;
  notes?: string;
  acquiredDate?: string;
  condition?: string;
}

// --- Training ---

export type TrainingType = "individual" | "team" | "match_practice" | "fitness" | "recovery" | "tactical";

export interface TrainingReview {
  rating: number; // 1-5
  workedOn: string;
  nextSteps: string;
  playerFeedback?: string;
  reviewedAt: string;
}

// Structured player feedback — designed for AI analysis
export type PlayerFeeling = "awful" | "bad" | "okay" | "good" | "great";

export const PLAYER_FEEDBACK_TAGS = [
  "Too easy",
  "Too hard",
  "Good pace",
  "Learned a lot",
  "Need more practice",
  "Fun session",
  "Felt tired",
  "Great coaching",
  "Too long",
  "Too short",
  "Want more of this",
  "Felt confused",
] as const;

export type PlayerFeedbackTag = typeof PLAYER_FEEDBACK_TAGS[number];

export interface PlayerSessionFeedback {
  feeling: PlayerFeeling;
  energyLevel: number; // 1-5
  tags: PlayerFeedbackTag[];
  note?: string; // max 200 chars, optional
  submittedAt: string;
}

export interface TrainingAnalysis {
  summary: string;
  generatedAt: string;
  model?: string;
}

export interface TrainingSession {
  id: string;
  title: string;
  description?: string;
  trainingType: TrainingType;
  coachId: string;
  playerIds: string[];
  teamId?: string;
  startDate: string;
  endDate: string;
  location?: string;
  goal?: string;
  intensity?: "low" | "medium" | "high";
  notes?: string;
  coachNotes?: string;
  review?: TrainingReview;
  playerSessionFeedback?: PlayerSessionFeedback;
  analysis?: TrainingAnalysis;
  createdAt: string;
}

// --- Training Requests (Player → Coach) ---

export interface TrainingRequest {
  id: string;
  playerId: string;
  playerName: string;
  coachId: string;
  coachName?: string;
  status: TrainingRequestStatus;
  preferredDate: string;
  preferredStartTime: string;
  preferredEndTime: string;
  trainingType: TrainingType;
  location?: string;
  notes?: string;
  priority?: "normal" | "high";
  /** Coach message when approving/rejecting/rescheduling */
  coachMessage?: string;
  /** Proposed reschedule fields */
  proposedDate?: string;
  proposedStartTime?: string;
  proposedEndTime?: string;
  /** Linked calendar event ID after approval */
  calendarEventId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Notifications ---

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  /** Link to related entity for click-through */
  linkTo?: string;
  createdAt: string;
}

export interface NotificationSettings {
  trainingReminders: boolean;
  tournamentReminders: boolean;
  requestApprovals: boolean;
  financeUpdates: boolean;
  aiInsightUpdates: boolean;
  systemNotifications: boolean;
}

// --- AI Insights ---

export interface AIInsightInput {
  tournamentId?: string;
  weather?: string;
  altitude?: number;
  surface?: string;
  racket?: string;
  stringType?: string;
  ballBrand?: string;
  playerStyle?: string;
  recentTrainingLoad?: string;
}

export interface AIInsightResult {
  matchConditionsSummary: string;
  expectedRisks: string[];
  preparationRecommendations: string[];
  equipmentRecommendations: string[];
  generatedAt: string;
}

// --- API Response Wrappers ---

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Auth ---

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignUpRequest {
  email: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  ageConfirmed: boolean;
  termsAccepted: boolean;
  dateOfBirth?: string;
  country?: string;
  dominantHand?: "left" | "right";
  organization?: string;
  relationToPlayer?: string;
}
