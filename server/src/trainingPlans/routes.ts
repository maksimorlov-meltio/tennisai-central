import { Router } from "express";
import { z } from "zod";
import type { Prisma, TrainingPlan, TrainingDrill } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { requireRole, assertAssignedPlayer } from "../authz";

export const trainingPlansRouter = Router();

trainingPlansRouter.use(requireAuth);

const drillSchema = z.object({
  objective: z.string().min(1),
  category: z.enum(["technical", "tactical", "physical", "mental"]),
  instructions: z.string().min(1),
  durationMin: z.number().int().positive().optional(),
  reps: z.string().optional(),
  equipment: z.string().optional(),
  intensity: z.enum(["low", "medium", "high"]).optional(),
  successCriteria: z.string().min(1),
  relatedInsight: z.string().optional(),
  coachNotes: z.string().optional(),
});

const createSchema = z.object({
  playerId: z.string().min(1),
  title: z.string().min(1),
  weekOf: z.string().optional(),
  drills: z.array(drillSchema).min(1),
});

type PlanWithDrills = TrainingPlan & { drills: TrainingDrill[] };

function present(p: PlanWithDrills) {
  return {
    id: p.id,
    playerId: p.playerId,
    createdById: p.createdById,
    sourceReportId: p.sourceReportId ?? undefined,
    title: p.title,
    weekOf: p.weekOf ?? undefined,
    status: p.status,
    model: p.model ?? undefined,
    promptVersion: p.promptVersion ?? undefined,
    generatedAt: p.generatedAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    drills: p.drills.map((d) => ({
      id: d.id,
      planId: d.planId,
      objective: d.objective,
      category: d.category,
      instructions: d.instructions,
      durationMin: d.durationMin ?? undefined,
      reps: d.reps ?? undefined,
      equipment: d.equipment ?? undefined,
      intensity: d.intensity ?? undefined,
      successCriteria: d.successCriteria,
      relatedInsight: d.relatedInsight ?? undefined,
      coachNotes: d.coachNotes ?? undefined,
      completionStatus: d.completionStatus,
      trainingId: d.trainingId ?? undefined,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  };
}

/**
 * A coach may save a plan for themselves, an actively-assigned player, OR a
 * player they have an active connection with (covers the current connection
 * model until CoachAssignment is populated). Falls back to a 403 otherwise.
 */
async function assertCanPlanFor(userId: string, playerId: string): Promise<void> {
  if (userId === playerId) return;
  try {
    await assertAssignedPlayer(userId, playerId);
    return;
  } catch {
    const link = await prisma.connectionRequest.findFirst({
      where: {
        status: "active",
        OR: [
          { fromUserId: userId, toUserId: playerId },
          { fromUserId: playerId, toUserId: userId },
        ],
      },
      select: { id: true },
    });
    if (!link) throw new HttpError(403, "You are not connected to this player");
  }
}

// GET /api/training-plans — plans the user created OR that are about them.
trainingPlansRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const where: Prisma.TrainingPlanWhereInput = {
      OR: [{ createdById: userId }, { playerId: userId }],
    };
    const plans = await prisma.trainingPlan.findMany({
      where,
      include: { drills: { orderBy: { createdAt: "asc" } } },
      orderBy: { generatedAt: "desc" },
    });
    return ok(res, plans.map(present));
  }),
);

// POST /api/training-plans — coaches only; save a generated session as a plan.
trainingPlansRouter.post(
  "/",
  requireRole("coach"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const data = createSchema.parse(req.body);
    await assertCanPlanFor(userId, data.playerId);

    const plan = await prisma.trainingPlan.create({
      data: {
        playerId: data.playerId,
        createdById: userId,
        title: data.title,
        weekOf: data.weekOf,
        model: "tennisai-session-builder-v1",
        promptVersion: "sb-1",
        drills: {
          create: data.drills.map((d) => ({
            objective: d.objective,
            category: d.category,
            instructions: d.instructions,
            durationMin: d.durationMin,
            reps: d.reps,
            equipment: d.equipment,
            intensity: d.intensity,
            successCriteria: d.successCriteria,
            relatedInsight: d.relatedInsight,
            coachNotes: d.coachNotes,
          })),
        },
      },
      include: { drills: { orderBy: { createdAt: "asc" } } },
    });

    return ok(res, present(plan), "Session saved to the player's training plan", 201);
  }),
);
