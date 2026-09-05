// ============================================================================
// TennisAI — recommendation routes (deterministic v1, computed at read time)
//
// Mounted at /api — full nested paths, like finance / equipment / string-setups:
//   GET /api/players/:playerId/recommendations/strings
//   GET /api/players/:playerId/recommendations/tournaments
//   GET /api/players/:playerId/recommendations/money
//
// Nothing is cached or stored: every call loads the player's current rows and
// runs the pure engine over them. Every response is
//   { data: { version, computedAt, ...engineOutput } }.
//
// AUTHORIZATION, per route:
//   strings, tournaments — assertCanActOnPlayer: the owner, an actively assigned
//     coach, an active connection, or a consenting guardian.
//   money — the owner or a CONSENTING GUARDIAN only. A coach gets 403: the
//     sprint document allows coaches to see a player's money only under an
//     academy permission that does not exist in the schema yet, so until it
//     does the narrower check stands. Composed from assertGuardianOf; no new
//     permission table.
// Authorization runs BEFORE any of the player's rows are read.
// ============================================================================

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { assertCanActOnPlayer, assertGuardianOf } from "../authz";
import { RECOMMENDER_VERSION } from "./types";
import { recommendStrings } from "./strings";
import { recommendTournaments } from "./tournaments";
import { analyseMoney } from "./money";
import { loadMoneyInput, loadStringsInput, loadTournamentsInput } from "./load";

export const recommendRouter = Router();

/**
 * Owner or consenting guardian. `assertGuardianOf` has no self short-circuit
 * and throws 403 for everyone who is not a consented guardian — which is
 * exactly the coach case.
 */
export async function assertOwnerOrGuardian(actorId: string, playerId: string): Promise<void> {
  if (actorId === playerId) return;
  await assertGuardianOf(actorId, playerId);
}

// Query strings arrive as text. `z.coerce.boolean()` would turn "false" into
// true (any non-empty string is truthy), so the two words are matched literally.
const boolParam = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

const stringsQuery = z
  .object({
    racketItemId: z.string().min(1).optional(),
    breaksOften: boolParam,
    wantsArmComfort: boolParam,
    wantsMoreSpin: boolParam,
    priority: z.enum(["control", "power", "balanced"]).optional(),
  })
  .strip();

const tournamentsQuery = z
  .object({
    horizonDays: z.coerce.number().int().min(1).max(365).default(90),
  })
  .strip();

const moneyQuery = z
  .object({
    window: z.enum(["month", "season", "year"]).default("month"),
  })
  .strip();

function envelope<T extends object>(computedAt: string, out: T) {
  return { version: RECOMMENDER_VERSION, computedAt, ...out };
}

// ── GET /api/players/:playerId/recommendations/strings ──────────────────────
recommendRouter.get(
  "/players/:playerId/recommendations/strings",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = stringsQuery.parse(req.query);
    await assertCanActOnPlayer(req.userId!, req.params.playerId);

    const now = new Date().toISOString();
    const loaded = await loadStringsInput(
      prisma,
      req.params.playerId,
      { breaksOften: q.breaksOften, wantsArmComfort: q.wantsArmComfort, wantsMoreSpin: q.wantsMoreSpin, priority: q.priority },
      now,
      q.racketItemId,
    );
    if (loaded.kind === "no_racket") {
      throw new HttpError(404, "Add a racket to your equipment first — string advice starts from the frame.");
    }
    if (loaded.kind === "racket_not_found") {
      throw new HttpError(404, "That racket is not in this player's equipment.");
    }

    const out = recommendStrings(loaded.input);
    return ok(res, envelope(now, { racketItemId: loaded.racketItemId, ...out }));
  }),
);

// ── GET /api/players/:playerId/recommendations/tournaments ──────────────────
recommendRouter.get(
  "/players/:playerId/recommendations/tournaments",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = tournamentsQuery.parse(req.query);
    await assertCanActOnPlayer(req.userId!, req.params.playerId);

    const now = new Date().toISOString();
    const input = await loadTournamentsInput(prisma, req.params.playerId, q.horizonDays, now);
    return ok(res, envelope(now, recommendTournaments(input)));
  }),
);

// ── GET /api/players/:playerId/recommendations/money ────────────────────────
recommendRouter.get(
  "/players/:playerId/recommendations/money",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = moneyQuery.parse(req.query);
    await assertOwnerOrGuardian(req.userId!, req.params.playerId);

    const now = new Date().toISOString();
    const input = await loadMoneyInput(prisma, req.params.playerId, q.window, now);
    return ok(res, envelope(now, analyseMoney(input)));
  }),
);
