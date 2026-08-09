// ============================================================
// TennisAI — Match logging API (mounted at /api/matches)
//
// Every route requires auth and is ownership-scoped. Matches are PLAYER
// scoped: a coach/parent may only touch a player they are actually related to
// (assignment, active connection, or consented guardianship) — see authz.ts.
//
// `createdBy` is ALWAYS pinned to the authenticated user and is never read
// from the request body: accepting a client-supplied owner was a real
// vulnerability class in this codebase.
//
// The DB stores RAW COUNTS ONLY. Percentages are computed on read by
// ../stats/compute.ts and are never persisted.
// ============================================================

import { Router } from "express";
import { z } from "zod";
import { Prisma, type Match, type Opponent } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { assertCanActOnPlayer } from "../authz";
import {
  computeAggregateStats,
  computeMatchStats,
  DEFAULT_RECENT_COUNT,
  type StatsMatchRow,
} from "../stats/compute";

export const matchesRouter = Router();

matchesRouter.use(requireAuth);

// ── Documented value domains (kept in sync with the schema comments) ────────
export const MATCH_SURFACES = ["clay", "hard", "grass", "indoor"] as const;
export const MATCH_ENVIRONMENTS = ["indoor", "outdoor"] as const;
export const MATCH_FORMATS = ["best_of_3", "best_of_5", "pro_set", "single_set", "fast4"] as const;
export const MATCH_RESULTS = ["win", "loss"] as const;

// ── Validation ─────────────────────────────────────────────────────────────

/** Non-negative integer count. Percentages are NEVER accepted as input. */
const count = z.number().int().min(0).max(9999);

/** ISO date / `yyyy-MM-dd`. Malformed input must be a 400, never a 500. */
const isoDate = z
  .string()
  .min(4)
  .refine((s) => Number.isFinite(Date.parse(s)), { message: "date must be a valid ISO date" });

const setScoreSchema = z.object({
  player: z.number().int().min(0).max(30),
  opponent: z.number().int().min(0).max(30),
  tiebreak: z
    .string()
    .regex(/^\d{1,2}-\d{1,2}$/, "tiebreak must look like 7-5")
    .optional(),
});

const rallyBucketsSchema = z.object({
  "1-4": count.optional(),
  "5-8": count.optional(),
  "9+": count.optional(),
});

const momentumSchema = z.object({
  set: z.number().int().min(1).max(5),
  game: z.number().int().min(0).max(30).optional(),
  note: z.string().min(1).max(500),
});

/** Raw counts — every one optional; detailed stats are never required. */
const countsShape = {
  firstServeAttempts: count.optional(),
  firstServesIn: count.optional(),
  firstServePointsWon: count.optional(),
  secondServePlayed: count.optional(),
  secondServePointsWon: count.optional(),
  aces: count.optional(),
  doubleFaults: count.optional(),
  returnPointsPlayed: count.optional(),
  returnPointsWon: count.optional(),
  winners: count.optional(),
  forcedErrors: count.optional(),
  unforcedErrors: count.optional(),
  breakPointsCreated: count.optional(),
  breakPointsConverted: count.optional(),
  breakPointsFaced: count.optional(),
  breakPointsSaved: count.optional(),
  netApproaches: count.optional(),
  netPointsWon: count.optional(),
} as const;

/** Same counts for PATCH, where an explicit `null` clears a stored count. */
const nullableCountsShape = {
  firstServeAttempts: count.nullable().optional(),
  firstServesIn: count.nullable().optional(),
  firstServePointsWon: count.nullable().optional(),
  secondServePlayed: count.nullable().optional(),
  secondServePointsWon: count.nullable().optional(),
  aces: count.nullable().optional(),
  doubleFaults: count.nullable().optional(),
  returnPointsPlayed: count.nullable().optional(),
  returnPointsWon: count.nullable().optional(),
  winners: count.nullable().optional(),
  forcedErrors: count.nullable().optional(),
  unforcedErrors: count.nullable().optional(),
  breakPointsCreated: count.nullable().optional(),
  breakPointsConverted: count.nullable().optional(),
  breakPointsFaced: count.nullable().optional(),
  breakPointsSaved: count.nullable().optional(),
  netApproaches: count.nullable().optional(),
  netPointsWon: count.nullable().optional(),
} as const;

const createSchema = z.object({
  // `createdBy` is deliberately absent — the server pins it to req.userId.
  playerId: z.string().min(1).max(64).optional(),
  opponentId: z.string().min(1).max(64).nullable().optional(),
  date: isoDate,
  competition: z.string().max(200).optional(),
  surface: z.enum(MATCH_SURFACES),
  indoorOutdoor: z.enum(MATCH_ENVIRONMENTS),
  format: z.enum(MATCH_FORMATS),
  result: z.enum(MATCH_RESULTS).optional(),
  scoreSets: z.array(setScoreSchema).min(1).max(5),
  conditions: z.string().max(500).optional(),
  ...countsShape,
  rallyLengthBuckets: rallyBucketsSchema.optional(),
  momentumChanges: z.array(momentumSchema).max(50).optional(),
  notesBySet: z.record(z.string().regex(/^[1-5]$/), z.string().max(2000)).optional(),
});

const updateSchema = z.object({
  opponentId: z.string().min(1).max(64).nullable().optional(),
  date: isoDate.optional(),
  competition: z.string().max(200).nullable().optional(),
  surface: z.enum(MATCH_SURFACES).optional(),
  indoorOutdoor: z.enum(MATCH_ENVIRONMENTS).optional(),
  format: z.enum(MATCH_FORMATS).optional(),
  result: z.enum(MATCH_RESULTS).nullable().optional(),
  scoreSets: z.array(setScoreSchema).min(1).max(5).optional(),
  conditions: z.string().max(500).nullable().optional(),
  ...nullableCountsShape,
  rallyLengthBuckets: rallyBucketsSchema.nullable().optional(),
  momentumChanges: z.array(momentumSchema).max(50).nullable().optional(),
  notesBySet: z.record(z.string().regex(/^[1-5]$/), z.string().max(2000)).nullable().optional(),
});

const listQuerySchema = z.object({
  playerId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const statsQuerySchema = z.object({
  playerId: z.string().min(1).max(64).optional(),
  recent: z.coerce.number().int().min(1).max(50).optional(),
});

type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

/**
 * Count pairs that must stay coherent — a sub-count can never exceed the
 * total it is drawn from. Checked against the FINAL (merged) values so a
 * partial PATCH cannot slip an impossible combination past validation.
 */
const COUNT_PAIRS: ReadonlyArray<readonly [keyof typeof nullableCountsShape, keyof typeof nullableCountsShape, string]> = [
  ["firstServesIn", "firstServeAttempts", "first serves in cannot exceed first-serve attempts"],
  ["firstServePointsWon", "firstServesIn", "first-serve points won cannot exceed first serves in"],
  ["secondServePointsWon", "secondServePlayed", "second-serve points won cannot exceed second serves played"],
  ["returnPointsWon", "returnPointsPlayed", "return points won cannot exceed return points played"],
  ["breakPointsConverted", "breakPointsCreated", "break points converted cannot exceed break points created"],
  ["breakPointsSaved", "breakPointsFaced", "break points saved cannot exceed break points faced"],
  ["netPointsWon", "netApproaches", "net points won cannot exceed net approaches"],
];

type CountRecord = Partial<Record<keyof typeof nullableCountsShape, number | null | undefined>>;

function assertCoherentCounts(values: CountRecord): void {
  for (const [subKey, totalKey, message] of COUNT_PAIRS) {
    const sub = values[subKey];
    const total = values[totalKey];
    if (typeof sub === "number" && typeof total === "number" && sub > total) {
      throw new HttpError(400, message);
    }
  }
}

// ── JSON helpers (Prisma Json columns) ─────────────────────────────────────

/** Values passed here are already zod-validated, so the cast is safe. */
function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** `null` clears a nullable Json column; `undefined` leaves it untouched. */
function asNullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return asJson(value);
}

interface SetScore {
  player: number;
  opponent: number;
  tiebreak?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Defensive read — a legacy/hand-edited row must never crash a response. */
function readScoreSets(value: Prisma.JsonValue): SetScore[] {
  if (!Array.isArray(value)) return [];
  const sets: SetScore[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { player, opponent, tiebreak } = entry;
    if (typeof player !== "number" || typeof opponent !== "number") continue;
    sets.push({ player, opponent, ...(typeof tiebreak === "string" ? { tiebreak } : {}) });
  }
  return sets;
}

function readNumberRecord(value: Prisma.JsonValue | null): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
  }
  return Object.keys(out).length ? out : undefined;
}

function readStringRecord(value: Prisma.JsonValue | null): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return Object.keys(out).length ? out : undefined;
}

interface MomentumChange {
  set: number;
  game?: number;
  note: string;
}

function readMomentum(value: Prisma.JsonValue | null): MomentumChange[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: MomentumChange[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { set, game, note } = entry;
    if (typeof set !== "number" || typeof note !== "string") continue;
    out.push({ set, note, ...(typeof game === "number" ? { game } : {}) });
  }
  return out.length ? out : undefined;
}

// ── Presentation ───────────────────────────────────────────────────────────

type MatchWithOpponent = Match & { opponent: Opponent | null };

const withOpponent = { opponent: true } as const;

/** `null` → `undefined` so the JSON body omits unset fields. */
function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

/** Raw counts as the client's `MatchStatsRaw`, plus computed percentages. */
function present(m: MatchWithOpponent) {
  return {
    id: m.id,
    playerId: m.playerId,
    opponentId: optional(m.opponentId),
    opponentName: m.opponent ? `${m.opponent.firstName} ${m.opponent.lastName}`.trim() : undefined,
    academyId: optional(m.academyId),
    date: m.date.toISOString(),
    competition: optional(m.competition),
    surface: m.surface,
    indoorOutdoor: m.indoorOutdoor,
    format: m.format,
    result: optional(m.result),
    scoreSets: readScoreSets(m.scoreSets),
    conditions: optional(m.conditions),
    stats: {
      firstServeAttempts: optional(m.firstServeAttempts),
      firstServesIn: optional(m.firstServesIn),
      firstServePointsWon: optional(m.firstServePointsWon),
      secondServePlayed: optional(m.secondServePlayed),
      secondServePointsWon: optional(m.secondServePointsWon),
      aces: optional(m.aces),
      doubleFaults: optional(m.doubleFaults),
      returnPointsPlayed: optional(m.returnPointsPlayed),
      returnPointsWon: optional(m.returnPointsWon),
      winners: optional(m.winners),
      forcedErrors: optional(m.forcedErrors),
      unforcedErrors: optional(m.unforcedErrors),
      breakPointsCreated: optional(m.breakPointsCreated),
      breakPointsConverted: optional(m.breakPointsConverted),
      breakPointsFaced: optional(m.breakPointsFaced),
      breakPointsSaved: optional(m.breakPointsSaved),
      netApproaches: optional(m.netApproaches),
      netPointsWon: optional(m.netPointsWon),
      rallyLengthBuckets: readNumberRecord(m.rallyLengthBuckets),
    },
    // Computed on read — never stored (schema contract).
    computed: computeMatchStats(toStatsRow(m)),
    momentumChanges: readMomentum(m.momentumChanges),
    notesBySet: readStringRecord(m.notesBySet),
    createdBy: m.createdBy,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

/** Narrow a Match row to exactly what the pure stats module reads. */
function toStatsRow(m: Match): StatsMatchRow {
  return {
    id: m.id,
    date: m.date,
    surface: m.surface,
    result: m.result,
    firstServeAttempts: m.firstServeAttempts,
    firstServesIn: m.firstServesIn,
    firstServePointsWon: m.firstServePointsWon,
    secondServePlayed: m.secondServePlayed,
    secondServePointsWon: m.secondServePointsWon,
    aces: m.aces,
    doubleFaults: m.doubleFaults,
    returnPointsPlayed: m.returnPointsPlayed,
    returnPointsWon: m.returnPointsWon,
    winners: m.winners,
    forcedErrors: m.forcedErrors,
    unforcedErrors: m.unforcedErrors,
    breakPointsCreated: m.breakPointsCreated,
    breakPointsConverted: m.breakPointsConverted,
    breakPointsFaced: m.breakPointsFaced,
    breakPointsSaved: m.breakPointsSaved,
    netApproaches: m.netApproaches,
    netPointsWon: m.netPointsWon,
  };
}

// ── Authorization helpers ──────────────────────────────────────────────────

/**
 * Resolve the player a request targets and prove the caller may act on them.
 * Defaults to the caller (acting on their own matches).
 */
async function resolvePlayerId(userId: string, requested?: string): Promise<string> {
  const playerId = requested ?? userId;
  if (playerId !== userId) await assertCanActOnPlayer(userId, playerId);
  return playerId;
}

/**
 * May the caller see/modify this specific match? True when it is their own
 * match, when they authored the record, or when the relationship to the
 * subject player still holds. Mirrors the trainingPlans read rule
 * (`createdById` OR `playerId`) extended with the relationship check.
 */
async function mayAccess(match: Pick<Match, "playerId" | "createdBy">, userId: string): Promise<boolean> {
  if (match.playerId === userId || match.createdBy === userId) return true;
  try {
    await assertCanActOnPlayer(userId, match.playerId);
    return true;
  } catch {
    return false;
  }
}

/** Look up an accessible match or throw. Unreadable ⇒ 404 (existence hiding). */
async function accessibleMatch(id: string, userId: string, mode: "read" | "write"): Promise<MatchWithOpponent> {
  const match = await prisma.match.findUnique({ where: { id }, include: withOpponent });
  if (!match) throw new HttpError(404, "Match not found");
  if (!(await mayAccess(match, userId))) {
    if (mode === "read") throw new HttpError(404, "Match not found");
    throw new HttpError(403, "You are not authorized to modify this match");
  }
  return match;
}

/**
 * An opponent may be referenced only if it belongs to the caller or to the
 * subject player (a coach may use the player's own opponent record). 404 —
 * not 403 — so a probe cannot confirm another user's opponent ids.
 */
async function assertUsableOpponent(opponentId: string, userId: string, playerId: string): Promise<void> {
  const opponent = await prisma.opponent.findUnique({
    where: { id: opponentId },
    select: { ownerId: true },
  });
  if (!opponent || (opponent.ownerId !== userId && opponent.ownerId !== playerId)) {
    throw new HttpError(404, "Opponent not found");
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/matches?playerId=&limit= — newest first. Defaults to own matches.
matchesRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const query = listQuerySchema.parse(req.query);
    const playerId = await resolvePlayerId(userId, query.playerId);

    const rows = await prisma.match.findMany({
      where: { playerId },
      include: withOpponent,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: query.limit ?? 100,
    });
    return ok(res, rows.map(present));
  }),
);

// GET /api/matches/stats?playerId=&recent= — aggregate derived statistics.
// Declared BEFORE "/:id" so "stats" is never parsed as a match id.
matchesRouter.get(
  "/stats",
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const query = statsQuerySchema.parse(req.query);
    const playerId = await resolvePlayerId(userId, query.playerId);

    const rows = await prisma.match.findMany({
      where: { playerId },
      orderBy: { date: "desc" },
    });
    const stats = computeAggregateStats(rows.map(toStatsRow), {
      recentCount: query.recent ?? DEFAULT_RECENT_COUNT,
    });
    return ok(res, { playerId, ...stats });
  }),
);

// GET /api/matches/:id — 404 when missing OR not readable.
matchesRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const match = await accessibleMatch(req.params.id, req.userId!, "read");
    return ok(res, present(match));
  }),
);

// POST /api/matches — create for playerId (default self). createdBy is pinned.
matchesRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const input: CreateInput = createSchema.parse(req.body);
    const playerId = await resolvePlayerId(userId, input.playerId);
    assertCoherentCounts(input);

    if (input.opponentId) await assertUsableOpponent(input.opponentId, userId, playerId);

    const match = await prisma.match.create({
      data: {
        playerId,
        // NEVER from the client body — the authenticated user owns the record.
        createdBy: userId,
        opponentId: input.opponentId ?? null,
        date: new Date(input.date),
        competition: input.competition,
        surface: input.surface,
        indoorOutdoor: input.indoorOutdoor,
        format: input.format,
        result: input.result,
        scoreSets: asJson(input.scoreSets),
        conditions: input.conditions,
        firstServeAttempts: input.firstServeAttempts,
        firstServesIn: input.firstServesIn,
        firstServePointsWon: input.firstServePointsWon,
        secondServePlayed: input.secondServePlayed,
        secondServePointsWon: input.secondServePointsWon,
        aces: input.aces,
        doubleFaults: input.doubleFaults,
        returnPointsPlayed: input.returnPointsPlayed,
        returnPointsWon: input.returnPointsWon,
        winners: input.winners,
        forcedErrors: input.forcedErrors,
        unforcedErrors: input.unforcedErrors,
        breakPointsCreated: input.breakPointsCreated,
        breakPointsConverted: input.breakPointsConverted,
        breakPointsFaced: input.breakPointsFaced,
        breakPointsSaved: input.breakPointsSaved,
        netApproaches: input.netApproaches,
        netPointsWon: input.netPointsWon,
        rallyLengthBuckets: asNullableJson(input.rallyLengthBuckets),
        momentumChanges: asNullableJson(input.momentumChanges),
        notesBySet: asNullableJson(input.notesBySet),
      },
      include: withOpponent,
    });

    return ok(res, present(match), "Match logged", 201);
  }),
);

// PATCH /api/matches/:id — owner-or-related only.
matchesRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const input: UpdateInput = updateSchema.parse(req.body);
    const existing = await accessibleMatch(req.params.id, userId, "write");

    // Coherence is checked on the MERGED result, not just the delta.
    const countKeys = Object.keys(nullableCountsShape) as Array<keyof typeof nullableCountsShape>;
    const merged: CountRecord = {};
    for (const key of countKeys) {
      merged[key] = key in input ? input[key] : existing[key];
    }
    assertCoherentCounts(merged);

    if (input.opponentId) {
      await assertUsableOpponent(input.opponentId, userId, existing.playerId);
    }

    const match = await prisma.match.update({
      where: { id: existing.id },
      data: {
        // playerId and createdBy are immutable — a match can never be
        // re-pointed at another player or re-owned via the API.
        opponentId: input.opponentId === undefined ? undefined : input.opponentId,
        date: input.date === undefined ? undefined : new Date(input.date),
        competition: input.competition,
        surface: input.surface,
        indoorOutdoor: input.indoorOutdoor,
        format: input.format,
        result: input.result,
        scoreSets: input.scoreSets === undefined ? undefined : asJson(input.scoreSets),
        conditions: input.conditions,
        firstServeAttempts: input.firstServeAttempts,
        firstServesIn: input.firstServesIn,
        firstServePointsWon: input.firstServePointsWon,
        secondServePlayed: input.secondServePlayed,
        secondServePointsWon: input.secondServePointsWon,
        aces: input.aces,
        doubleFaults: input.doubleFaults,
        returnPointsPlayed: input.returnPointsPlayed,
        returnPointsWon: input.returnPointsWon,
        winners: input.winners,
        forcedErrors: input.forcedErrors,
        unforcedErrors: input.unforcedErrors,
        breakPointsCreated: input.breakPointsCreated,
        breakPointsConverted: input.breakPointsConverted,
        breakPointsFaced: input.breakPointsFaced,
        breakPointsSaved: input.breakPointsSaved,
        netApproaches: input.netApproaches,
        netPointsWon: input.netPointsWon,
        rallyLengthBuckets: asNullableJson(input.rallyLengthBuckets),
        momentumChanges: asNullableJson(input.momentumChanges),
        notesBySet: asNullableJson(input.notesBySet),
      },
      include: withOpponent,
    });

    return ok(res, present(match), "Match updated");
  }),
);

// DELETE /api/matches/:id — owner-or-related only.
matchesRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await accessibleMatch(req.params.id, req.userId!, "write");
    await prisma.match.delete({ where: { id: existing.id } });
    return ok(res, null, "Match deleted");
  }),
);
