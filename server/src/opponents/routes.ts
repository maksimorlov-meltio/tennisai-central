// ============================================================
// TennisAI — Opponent records (mounted at /api/opponents)
//
// Lean CRUD so a logged match can reference a real opponent. Every row is
// scoped to `ownerId = req.userId`: the owner is pinned server-side and an
// opponent belonging to another user is never readable or writable (a probe
// for someone else's id gets the same 404 as a non-existent record).
//
// Only explicitly-entered data is stored — nothing here is derived or guessed.
// ============================================================

import { Router } from "express";
import { z } from "zod";
import { Prisma, type Opponent } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";

export const opponentsRouter = Router();

opponentsRouter.use(requireAuth);

const HANDS = ["left", "right"] as const;
const BACKHANDS = ["one_handed", "two_handed"] as const;
const SURFACES = ["clay", "hard", "grass", "indoor"] as const;

/** 1..10 playing-style dimension. */
const styleScore = z.number().int().min(1).max(10);
const freeText = z.string().max(500);

const baseShape = {
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dominantHand: z.enum(HANDS).optional(),
  backhandType: z.enum(BACKHANDS).optional(),
  preferredSurface: z.enum(SURFACES).optional(),
  strongestStroke: freeText.optional(),
  weakestStroke: freeText.optional(),
  servePatterns: freeText.optional(),
  returnPosition: freeText.optional(),
  returnTendencies: freeText.optional(),
  forehandPreference: freeText.optional(),
  backhandPreference: freeText.optional(),
  netBehaviour: freeText.optional(),
  pressurePerformance: freeText.optional(),
  style: z
    .object({
      aggression: styleScore.optional(),
      netPlay: styleScore.optional(),
      rallyTolerance: styleScore.optional(),
      serveDependence: styleScore.optional(),
      riskLevel: styleScore.optional(),
      returnPosition: styleScore.optional(),
      pressure: styleScore.optional(),
    })
    .optional(),
  observations: z.array(z.string().min(1).max(1000)).max(40).optional(),
} as const;

// `ownerId` is deliberately absent from both schemas — the server pins it.
const createSchema = z.object(baseShape);
const updateSchema = z.object({
  firstName: baseShape.firstName.optional(),
  lastName: baseShape.lastName.optional(),
  dominantHand: z.enum(HANDS).nullable().optional(),
  backhandType: z.enum(BACKHANDS).nullable().optional(),
  preferredSurface: z.enum(SURFACES).nullable().optional(),
  strongestStroke: freeText.nullable().optional(),
  weakestStroke: freeText.nullable().optional(),
  servePatterns: freeText.nullable().optional(),
  returnPosition: freeText.nullable().optional(),
  returnTendencies: freeText.nullable().optional(),
  forehandPreference: freeText.nullable().optional(),
  backhandPreference: freeText.nullable().optional(),
  netBehaviour: freeText.nullable().optional(),
  pressurePerformance: freeText.nullable().optional(),
  style: baseShape.style,
  observations: z.array(z.string().min(1).max(1000)).max(40).optional(),
});

type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

/** Observations are explicitly-entered strings; anything else is discarded. */
function readObservations(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function present(o: Opponent) {
  return {
    id: o.id,
    ownerId: o.ownerId,
    academyId: optional(o.academyId),
    firstName: o.firstName,
    lastName: o.lastName,
    dominantHand: optional(o.dominantHand),
    backhandType: optional(o.backhandType),
    preferredSurface: optional(o.preferredSurface),
    strongestStroke: optional(o.strongestStroke),
    weakestStroke: optional(o.weakestStroke),
    servePatterns: optional(o.servePatterns),
    returnPosition: optional(o.returnPosition),
    returnTendencies: optional(o.returnTendencies),
    forehandPreference: optional(o.forehandPreference),
    backhandPreference: optional(o.backhandPreference),
    netBehaviour: optional(o.netBehaviour),
    pressurePerformance: optional(o.pressurePerformance),
    style: {
      aggression: optional(o.styleAggression),
      netPlay: optional(o.styleNetPlay),
      rallyTolerance: optional(o.styleRallyTolerance),
      serveDependence: optional(o.styleServeDependence),
      riskLevel: optional(o.styleRiskLevel),
      returnPosition: optional(o.styleReturnPosition),
      pressure: optional(o.stylePressure),
    },
    observations: readObservations(o.observations),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/** Owner-only lookup. A foreign id is reported as missing, not forbidden. */
async function ownedOpponent(id: string, userId: string): Promise<Opponent> {
  const opponent = await prisma.opponent.findUnique({ where: { id } });
  if (!opponent || opponent.ownerId !== userId) throw new HttpError(404, "Opponent not found");
  return opponent;
}

/**
 * Map the client's nested `style` object onto the flat style columns. Omitted
 * dimensions stay `undefined`, which Prisma reads as "leave unchanged".
 */
function styleColumns(style: CreateInput["style"]) {
  return {
    styleAggression: style?.aggression,
    styleNetPlay: style?.netPlay,
    styleRallyTolerance: style?.rallyTolerance,
    styleServeDependence: style?.serveDependence,
    styleRiskLevel: style?.riskLevel,
    styleReturnPosition: style?.returnPosition,
    stylePressure: style?.pressure,
  };
}

// GET /api/opponents — the caller's own opponent records.
opponentsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.opponent.findMany({
      where: { ownerId: req.userId! },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return ok(res, rows.map(present));
  }),
);

// GET /api/opponents/:id
opponentsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, present(await ownedOpponent(req.params.id, req.userId!)));
  }),
);

// POST /api/opponents — ownerId is pinned to the authenticated user.
opponentsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const input: CreateInput = createSchema.parse(req.body);
    const opponent = await prisma.opponent.create({
      data: {
        ownerId: req.userId!,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        dominantHand: input.dominantHand,
        backhandType: input.backhandType,
        preferredSurface: input.preferredSurface,
        strongestStroke: input.strongestStroke,
        weakestStroke: input.weakestStroke,
        servePatterns: input.servePatterns,
        returnPosition: input.returnPosition,
        returnTendencies: input.returnTendencies,
        forehandPreference: input.forehandPreference,
        backhandPreference: input.backhandPreference,
        netBehaviour: input.netBehaviour,
        pressurePerformance: input.pressurePerformance,
        ...styleColumns(input.style),
        observations: input.observations === undefined ? undefined : (input.observations as Prisma.InputJsonValue),
      },
    });
    return ok(res, present(opponent), "Opponent added", 201);
  }),
);

// PATCH /api/opponents/:id — owner only.
opponentsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const input: UpdateInput = updateSchema.parse(req.body);
    const existing = await ownedOpponent(req.params.id, req.userId!);

    const opponent = await prisma.opponent.update({
      where: { id: existing.id },
      data: {
        firstName: input.firstName?.trim(),
        lastName: input.lastName?.trim(),
        dominantHand: input.dominantHand,
        backhandType: input.backhandType,
        preferredSurface: input.preferredSurface,
        strongestStroke: input.strongestStroke,
        weakestStroke: input.weakestStroke,
        servePatterns: input.servePatterns,
        returnPosition: input.returnPosition,
        returnTendencies: input.returnTendencies,
        forehandPreference: input.forehandPreference,
        backhandPreference: input.backhandPreference,
        netBehaviour: input.netBehaviour,
        pressurePerformance: input.pressurePerformance,
        ...styleColumns(input.style),
        observations: input.observations === undefined ? undefined : (input.observations as Prisma.InputJsonValue),
      },
    });
    return ok(res, present(opponent), "Opponent updated");
  }),
);

// DELETE /api/opponents/:id — owner only. Matches keep their history: the
// relation is onDelete: SetNull, so `opponentId` is cleared, not cascaded.
opponentsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await ownedOpponent(req.params.id, req.userId!);
    await prisma.opponent.delete({ where: { id: existing.id } });
    return ok(res, null, "Opponent deleted");
  }),
);
