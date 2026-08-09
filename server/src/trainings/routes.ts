import { Router } from "express";
import { z } from "zod";
import type { Prisma, Training, TrainingParticipant } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { requireRole, assertCanActOnPlayer } from "../authz";

export const trainingsRouter = Router();

// Every trainings route requires authentication.
trainingsRouter.use(requireAuth);

const TRAINING_TYPES = ["individual", "team", "match_practice", "fitness", "recovery", "tactical"] as const;

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  trainingType: z.enum(TRAINING_TYPES),
  teamId: z.string().optional(),
  playerIds: z.array(z.string()).default([]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  location: z.string().optional(),
  goal: z.string().optional(),
  intensity: z.enum(["low", "medium", "high"]).optional(),
  notes: z.string().optional(),
  coachNotes: z.string().optional(),
  review: z.record(z.unknown()).optional(),
  playerSessionFeedback: z.record(z.unknown()).optional(),
  analysis: z.record(z.unknown()).optional(),
  // coachId is accepted but ignored — the owner is always the current user.
  coachId: z.string().optional(),
});

const updateSchema = createSchema.partial();

type TrainingWithParticipants = Training & { participants: TrainingParticipant[] };

/** Map a DB row to the front-end `TrainingSession` shape. */
function present(t: TrainingWithParticipants) {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    trainingType: t.trainingType,
    coachId: t.coachId,
    playerIds: t.participants.map((p) => p.playerId),
    teamId: t.teamId ?? undefined,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    location: t.location ?? undefined,
    goal: t.goal ?? undefined,
    intensity: (t.intensity ?? undefined) as "low" | "medium" | "high" | undefined,
    notes: t.notes ?? undefined,
    coachNotes: t.coachNotes ?? undefined,
    review: t.review ?? undefined,
    playerSessionFeedback: t.playerSessionFeedback ?? undefined,
    analysis: t.analysis ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Scope: a user sees trainings they coach OR participate in. */
function visibleWhere(userId: string): Prisma.TrainingWhereInput {
  return { OR: [{ coachId: userId }, { participants: { some: { playerId: userId } } }] };
}

// GET /api/trainings — all trainings visible to the current user.
trainingsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.training.findMany({
      where: visibleWhere(req.userId!),
      include: { participants: true },
      orderBy: { startDate: "desc" },
    });
    return ok(res, rows.map(present));
  }),
);

// GET /api/trainings/:id
trainingsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const t = await prisma.training.findFirst({
      where: { id: req.params.id, ...visibleWhere(req.userId!) },
      include: { participants: true },
    });
    if (!t) throw new HttpError(404, "Training not found");
    return ok(res, present(t));
  }),
);

// POST /api/trainings — the current (coach) user owns the session.
trainingsRouter.post(
  "/",
  requireRole("coach"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    // Every participant must be someone the coach is allowed to act on.
    for (const playerId of dedupe(data.playerIds)) {
      await assertCanActOnPlayer(req.userId!, playerId);
    }
    const created = await prisma.training.create({
      data: {
        title: data.title,
        description: data.description,
        trainingType: data.trainingType,
        coachId: req.userId!,
        teamId: data.teamId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        location: data.location,
        goal: data.goal,
        intensity: data.intensity,
        notes: data.notes,
        coachNotes: data.coachNotes,
        review: data.review as Prisma.InputJsonValue | undefined,
        playerSessionFeedback: data.playerSessionFeedback as Prisma.InputJsonValue | undefined,
        analysis: data.analysis as Prisma.InputJsonValue | undefined,
        participants: { create: dedupe(data.playerIds).map((playerId) => ({ playerId })) },
      },
      include: { participants: true },
    });
    return ok(res, present(created), "Training created", 201);
  }),
);

// PATCH /api/trainings/:id — owner (coach) only.
trainingsRouter.patch(
  "/:id",
  requireRole("coach"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    await assertOwner(req.params.id, req.userId!);
    // If the participant set is being replaced, validate each new player.
    if (data.playerIds) {
      for (const playerId of dedupe(data.playerIds)) {
        await assertCanActOnPlayer(req.userId!, playerId);
      }
    }

    const updated = await prisma.training.update({
      where: { id: req.params.id },
      data: {
        title: data.title,
        description: data.description,
        trainingType: data.trainingType,
        teamId: data.teamId,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        location: data.location,
        goal: data.goal,
        intensity: data.intensity,
        notes: data.notes,
        coachNotes: data.coachNotes,
        review: data.review as Prisma.InputJsonValue | undefined,
        playerSessionFeedback: data.playerSessionFeedback as Prisma.InputJsonValue | undefined,
        analysis: data.analysis as Prisma.InputJsonValue | undefined,
        // If playerIds provided, replace the participant set.
        ...(data.playerIds
          ? { participants: { deleteMany: {}, create: dedupe(data.playerIds).map((playerId) => ({ playerId })) } }
          : {}),
      },
      include: { participants: true },
    });
    return ok(res, present(updated), "Training updated");
  }),
);

// DELETE /api/trainings/:id — owner (coach) only.
trainingsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertOwner(req.params.id, req.userId!);
    await prisma.training.delete({ where: { id: req.params.id } });
    return ok(res, null, "Training deleted");
  }),
);

// POST /api/trainings/:id/analysis — generate + persist an AI summary.
trainingsRouter.post(
  "/:id/analysis",
  asyncHandler(async (req: AuthedRequest, res) => {
    const t = await prisma.training.findFirst({
      where: { id: req.params.id, ...visibleWhere(req.userId!) },
      include: { participants: true },
    });
    if (!t) throw new HttpError(404, "Training not found");

    const analysis = {
      summary: buildSummary(t),
      generatedAt: new Date().toISOString(),
      model: "tennisai-analyzer-v1",
    };
    const updated = await prisma.training.update({
      where: { id: t.id },
      data: { analysis },
      include: { participants: true },
    });
    return ok(res, present(updated), "Analysis ready");
  }),
);

async function assertOwner(id: string, userId: string) {
  const existing = await prisma.training.findUnique({ where: { id }, select: { coachId: true } });
  if (!existing) throw new HttpError(404, "Training not found");
  if (existing.coachId !== userId) throw new HttpError(403, "You do not own this training");
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/** Deterministic, human-readable performance summary (placeholder for a real model). */
function buildSummary(t: TrainingWithParticipants): string {
  const review = t.review as { rating?: number; workedOn?: string; nextSteps?: string } | null;
  const feedback = t.playerSessionFeedback as
    | { feeling?: string; energyLevel?: number; tags?: string[] }
    | null;
  const count = t.participants.length;
  const parts: string[] = [
    `${t.title} ran as a ${t.intensity ?? "medium"}-intensity ${t.trainingType.replace("_", " ")} session with ${count} player${count === 1 ? "" : "s"}.`,
  ];
  if (t.goal) parts.push(`Stated goal: ${t.goal}.`);
  if (review?.rating) {
    parts.push(
      `Coach rated the session ${review.rating}/5 and focused on ${review.workedOn ?? "core skills"}.${review.nextSteps ? ` Next steps: ${review.nextSteps}.` : ""}`,
    );
  }
  if (feedback?.feeling) {
    parts.push(
      `Player reported feeling ${feedback.feeling} with energy ${feedback.energyLevel ?? "-"}/5${feedback.tags?.length ? ` (${feedback.tags.slice(0, 3).join(", ")})` : ""}.`,
    );
  }
  parts.push(
    "Overall, execution matched the planned intensity. Recommend reinforcing the same focus area in the next session while monitoring fatigue.",
  );
  return parts.join(" ");
}
