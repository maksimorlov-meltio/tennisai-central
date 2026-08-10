import { Router } from "express";
import { z } from "zod";
import type { Prisma, Training, TrainingParticipant } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { requireRole, assertCanActOnPlayer } from "../authz";
import { createNotification } from "../notifications/routes";

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

    const who = await coachName(req.userId!);
    notifyPlayers(created.participants.map((p) => p.playerId), req.userId!, {
      type: "training_created",
      title: "New training scheduled",
      message: `${who} scheduled "${created.title}" for ${whenLabel(created.startDate)}${created.location ? ` at ${created.location}` : ""}.`,
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

    // Captured before the write: a PATCH can replace the whole participant
    // set, and someone taken off a session needs telling as much as someone
    // added to it. After the update their row is gone and it is too late to ask.
    const before = (
      await prisma.trainingParticipant.findMany({
        where: { trainingId: req.params.id },
        select: { playerId: true },
      })
    ).map((p) => p.playerId);

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

    const after = updated.participants.map((p) => p.playerId);
    const who = await coachName(req.userId!);
    const when = `${whenLabel(updated.startDate)}${updated.location ? ` at ${updated.location}` : ""}`;

    notifyPlayers(after.filter((id) => !before.includes(id)), req.userId!, {
      type: "training_created",
      title: "You were added to a training",
      message: `${who} added you to "${updated.title}" on ${when}.`,
    });
    notifyPlayers(before.filter((id) => !after.includes(id)), req.userId!, {
      type: "training_deleted",
      title: "You were removed from a training",
      message: `${who} removed you from "${updated.title}" on ${when}.`,
    });
    notifyPlayers(after.filter((id) => before.includes(id)), req.userId!, {
      type: "training_updated",
      title: "Training updated",
      message: `${who} changed "${updated.title}" — now ${when}.`,
    });

    return ok(res, present(updated), "Training updated");
  }),
);

// DELETE /api/trainings/:id — owner (coach) only.
trainingsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    // One read, not two: ownership and the details needed to tell the players
    // it is off come from the same row, and the cascade takes the participants
    // with it, so this has to happen before the delete either way.
    const doomed = await prisma.training.findUnique({
      where: { id: req.params.id },
      include: { participants: { select: { playerId: true } } },
    });
    if (!doomed) throw new HttpError(404, "Training not found");
    if (doomed.coachId !== req.userId) throw new HttpError(403, "You do not own this training");

    await prisma.training.delete({ where: { id: req.params.id } });

    const who = await coachName(req.userId!);
    notifyPlayers(doomed.participants.map((p) => p.playerId), req.userId!, {
      type: "training_deleted",
      title: "Training cancelled",
      message: `${who} cancelled "${doomed.title}" on ${whenLabel(doomed.startDate)}.`,
    });

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

// ── Telling people ──────────────────────────────────────────────────────────
// A session a player is expected to turn up to is worth a notification; before
// this, only training *requests* ever produced one, so a coach could schedule,
// move or cancel a session and the player would learn about it by chance.
//
// `training_created` / `_updated` / `_deleted` were already mapped to the
// trainingReminders preference in notifications/deliver.ts — the categories
// existed, nothing emitted them.

/** "Tue 2 Jun, 14:00" — times are stored and shown in UTC elsewhere. */
function whenLabel(d: Date): string {
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

async function coachName(coachId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: coachId },
    select: { firstName: true, lastName: true },
  });
  // A name field can be empty; "undefined undefined scheduled…" is worse than
  // saying nothing about who.
  const name = u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : "";
  return name || "Your coach";
}

/**
 * Fire-and-forget, one per player. `createNotification` swallows its own
 * failures, so a mail or push outage can never fail the scheduling request
 * that triggered it. The actor is filtered out — nobody needs telling about
 * something they just did themselves.
 */
function notifyPlayers(
  playerIds: string[],
  actorId: string,
  input: { type: string; title: string; message: string },
) {
  for (const userId of dedupe(playerIds)) {
    if (userId === actorId) continue;
    void createNotification({ ...input, userId, linkTo: "/calendar" });
  }
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
