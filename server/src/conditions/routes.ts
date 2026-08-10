// ============================================================
// TennisAI — Tournament playing conditions
//
//   GET   /api/tournaments/:id/conditions   surface, balls, weather, physics
//   PATCH /api/tournaments/:id/ball         set the official ball
//
// Free and always available: no API key, no LLM, no quota. The model-written
// interpretation is a separate, optional call (POST /api/ai/match-prep), so the
// facts still show when the AI is switched off.
// ============================================================

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError } from "../http";
import { requireRole } from "../authz";
import { loadConditions } from "./service";

export const conditionsRouter = Router();

conditionsRouter.use(requireAuth);

conditionsRouter.get(
  "/:id/conditions",
  asyncHandler(async (req, res) => {
    const conditions = await loadConditions(prisma, req.params.id);
    if (!conditions) throw new HttpError(404, "Tournament not found.");
    ok(res, conditions);
  }),
);

const ballSchema = z.object({
  /** Empty clears it — a wrong ball is worse than no ball. */
  ballBrand: z.string().trim().max(80),
});

/**
 * No feed publishes the official ball, so a coach supplies it.
 *
 * This edits the shared catalog rather than a per-user record: which ball an
 * event uses is a fact about the event, the same for everyone. Coach or admin
 * only, and `ballBrand` is the only field this endpoint can touch.
 */
conditionsRouter.patch(
  "/:id/ball",
  requireRole("coach", "admin"),
  asyncHandler(async (req, res) => {
    const parsed = ballSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Ball must be 80 characters or fewer.");

    const exists = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!exists) throw new HttpError(404, "Tournament not found.");

    const updated = await prisma.tournament.update({
      where: { id: req.params.id },
      data: { ballBrand: parsed.data.ballBrand || null },
      select: { id: true, ballBrand: true },
    });
    ok(res, { id: updated.id, ballBrand: updated.ballBrand ?? null });
  }),
);
