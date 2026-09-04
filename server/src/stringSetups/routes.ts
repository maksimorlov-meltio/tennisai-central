// ============================================================================
// TennisAI — string setups (one stringing job on one frame)
//
// Mounted at /api — full nested paths, matching finance/equipment.
//   GET|POST /api/players/:playerId/string-setups
//   PATCH|DELETE /api/string-setups/:id
//
// Unlike equipment, this is NOT self-only: a coach who strings for their player
// and a consented guardian both need to record and read these, so access goes
// through assertCanActOnPlayer (which returns immediately for the owner).
//
// TENSION IS KILOGRAMS. Clients display pounds by converting on read
// (lbs = kg × 2.2046). Nothing stores pounds.
// ============================================================================

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { assertCanActOnPlayer } from "../authz";

export const stringSetupsRouter = Router();

const RETIRED_REASONS = ["broke", "dead", "switched", "other"] as const;

// Kilograms. The bounds are deliberately generous — 10 kg is looser than anyone
// strings and 35 kg is tighter — because the job of this check is to catch a
// pounds value typed into a kilograms field (a 55 would be nonsense at 55 kg),
// not to have an opinion about how someone strings their racket.
const tensionKg = z.number().positive().min(10).max(35);

const createSchema = z
  .object({
    racketItemId: z.string().min(1),
    mainsProductId: z.string().min(1).optional(),
    crossesProductId: z.string().min(1).optional(),
    mainsCustomName: z.string().min(1).max(200).optional(),
    crossesCustomName: z.string().min(1).max(200).optional(),
    tensionMainsKg: tensionKg,
    // Absent means "same as mains" — one tension, which is most jobs.
    tensionCrossesKg: tensionKg.optional(),
    prestretch: z.boolean().optional(),
    strungAt: z.coerce.date(),
    stringerName: z.string().max(200).optional(),
    costEur: z.number().nonnegative().optional(),
    hoursPlayed: z.number().nonnegative().max(2000).optional(),
    retiredAt: z.coerce.date().optional(),
    retiredReason: z.enum(RETIRED_REASONS).optional(),
    comfortNote: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((d) => !(d.retiredAt && !d.retiredReason), {
    message: "retiredReason is required when retiredAt is set",
    path: ["retiredReason"],
  });

const updateSchema = createSchema.innerType().partial().omit({ racketItemId: true });

type SetupRow = {
  id: string;
  playerId: string;
  racketItemId: string;
  mainsProductId: string | null;
  crossesProductId: string | null;
  mainsCustomName: string | null;
  crossesCustomName: string | null;
  tensionMainsKg: number;
  tensionCrossesKg: number | null;
  prestretch: boolean | null;
  strungAt: Date;
  stringerName: string | null;
  costEur: number | null;
  hoursPlayed: number | null;
  retiredAt: Date | null;
  retiredReason: string | null;
  comfortNote: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  mains?: { id: string; brand: string; model: string; variant: string } | null;
  crosses?: { id: string; brand: string; model: string; variant: string } | null;
};

const PRODUCT_SUMMARY = { select: { id: true, brand: true, model: true, variant: true } } as const;

function present(s: SetupRow) {
  return {
    id: s.id,
    playerId: s.playerId,
    racketItemId: s.racketItemId,
    mainsProductId: s.mainsProductId ?? undefined,
    crossesProductId: s.crossesProductId ?? undefined,
    mainsCustomName: s.mainsCustomName ?? undefined,
    crossesCustomName: s.crossesCustomName ?? undefined,
    mains: s.mains ?? undefined,
    crosses: s.crosses ?? undefined,
    tensionMainsKg: s.tensionMainsKg,
    tensionCrossesKg: s.tensionCrossesKg ?? undefined,
    prestretch: s.prestretch ?? undefined,
    strungAt: s.strungAt.toISOString(),
    stringerName: s.stringerName ?? undefined,
    costEur: s.costEur ?? undefined,
    hoursPlayed: s.hoursPlayed ?? undefined,
    retiredAt: s.retiredAt ? s.retiredAt.toISOString() : undefined,
    retiredReason: s.retiredReason ?? undefined,
    comfortNote: s.comfortNote ?? undefined,
    notes: s.notes ?? undefined,
    // Derived, not stored: a null retiredAt IS what "current" means.
    isCurrent: s.retiredAt === null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Both product ids, when given, must name a real catalogue row. */
async function assertProductsExist(ids: Array<string | undefined>) {
  const wanted = ids.filter((id): id is string => Boolean(id));
  if (wanted.length === 0) return;
  const found = await prisma.equipmentProduct.findMany({
    where: { id: { in: wanted } },
    select: { id: true },
  });
  const missing = wanted.filter((id) => !found.some((f) => f.id === id));
  if (missing.length) throw new HttpError(400, `Unknown product: ${missing.join(", ")}`);
}

// ── GET /api/players/:playerId/string-setups ────────────────────────────────
stringSetupsRouter.get(
  "/players/:playerId/string-setups",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    // Authorization FIRST. A caller with no relationship to this player must be
    // refused before a single row of their stringing history is read.
    await assertCanActOnPlayer(req.userId!, req.params.playerId);
    const rows = await prisma.stringSetup.findMany({
      where: { playerId: req.params.playerId },
      orderBy: { strungAt: "desc" },
      include: { mains: PRODUCT_SUMMARY, crosses: PRODUCT_SUMMARY },
    });
    return ok(res, (rows as SetupRow[]).map(present));
  }),
);

// ── POST /api/players/:playerId/string-setups ───────────────────────────────
stringSetupsRouter.post(
  "/players/:playerId/string-setups",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const playerId = req.params.playerId;
    await assertCanActOnPlayer(req.userId!, playerId);
    const d = createSchema.parse(req.body);

    // The frame must be THIS player's. Without this check a coach assigned to
    // one player could staple a stringing job onto a stranger's racket, and the
    // stranger's gear history would quietly acquire a row they never created.
    const racket = await prisma.equipmentItem.findUnique({
      where: { id: d.racketItemId },
      select: { playerId: true },
    });
    if (!racket) throw new HttpError(404, "Racket not found");
    if (racket.playerId !== playerId) throw new HttpError(400, "That racket does not belong to this player");

    await assertProductsExist([d.mainsProductId, d.crossesProductId]);

    const created = await prisma.stringSetup.create({
      data: { ...d, playerId },
      include: { mains: PRODUCT_SUMMARY, crosses: PRODUCT_SUMMARY },
    });
    return ok(res, present(created as SetupRow), "String setup added", 201);
  }),
);

/** Load a setup and check the caller may act for its owner. */
async function actionableSetup(id: string, userId: string): Promise<{ playerId: string }> {
  const setup = await prisma.stringSetup.findUnique({ where: { id }, select: { playerId: true } });
  if (!setup) throw new HttpError(404, "String setup not found");
  await assertCanActOnPlayer(userId, setup.playerId);
  return setup;
}

// ── PATCH /api/string-setups/:id ────────────────────────────────────────────
// Retiring a setup is this route with `retiredAt` + `retiredReason`. There is
// no separate /retire endpoint: retirement is a state the row moves into, and
// modelling it as its own verb invites a second way to get it half-done.
stringSetupsRouter.patch(
  "/string-setups/:id",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await actionableSetup(req.params.id, req.userId!);
    const d = updateSchema.parse(req.body);
    if (d.retiredAt && !d.retiredReason) {
      // Re-checked here because `.partial()` drops the object-level refinement.
      throw new HttpError(400, "retiredReason is required when retiredAt is set");
    }
    await assertProductsExist([d.mainsProductId, d.crossesProductId]);

    const updated = await prisma.stringSetup.update({
      where: { id: req.params.id },
      data: d,
      include: { mains: PRODUCT_SUMMARY, crosses: PRODUCT_SUMMARY },
    });
    return ok(res, present(updated as SetupRow), "String setup updated");
  }),
);

// ── DELETE /api/string-setups/:id ───────────────────────────────────────────
stringSetupsRouter.delete(
  "/string-setups/:id",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await actionableSetup(req.params.id, req.userId!);
    await prisma.stringSetup.delete({ where: { id: req.params.id } });
    return ok(res, null, "String setup deleted");
  }),
);
