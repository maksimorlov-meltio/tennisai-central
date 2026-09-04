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

const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;

/**
 * Taking the register. `marks` is a PARTIAL set — a coach who taps one player
 * sends one mark and everyone left out keeps whatever they had, including
 * nothing at all. There is deliberately no way to send a null status:
 * "not yet marked" is the state a row starts in, not something a coach
 * reports, and allowing an unmark would blur the two in the audit columns.
 */
const attendanceSchema = z.object({
  marks: z
    .array(
      z.object({
        playerId: z.string().min(1),
        status: z.enum(ATTENDANCE_STATUSES),
        note: z.string().max(200).optional(),
      }),
    )
    .min(1),
});

const PLAYER_FEELINGS = ["awful", "bad", "okay", "good", "great"] as const;

const PLAYER_FEEDBACK_TAGS = [
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

/**
 * A player's own word on how the session went.
 *
 * `.strict()` is the point of this schema, not decoration. The whole reason
 * this route exists is that the general PATCH accepts the entire training
 * shape, so a player saving feedback through it could also move the date or
 * rewrite the coach's notes. A silently-dropped unknown key would leave that
 * same request looking like it succeeded; rejecting it with a 400 means an
 * attempt to write anything else is visibly refused rather than quietly
 * ignored.
 *
 * `submittedAt` and `submittedBy` are deliberately NOT accepted from the
 * client — the server stamps both, exactly as the register stamps
 * `attendanceAt` / `attendanceBy`. A timestamp the sender chooses is not
 * evidence of anything.
 */
const feedbackSchema = z
  .object({
    feeling: z.enum(PLAYER_FEELINGS),
    energyLevel: z.number().int().min(1).max(5),
    tags: z.array(z.enum(PLAYER_FEEDBACK_TAGS)).max(PLAYER_FEEDBACK_TAGS.length).default([]),
    note: z.string().max(200).optional(),
  })
  .strict();

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
    attendance: presentAttendance(t.participants),
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Two different "nothing" states, and the client has to be able to tell them
 * apart:
 *
 *  - `undefined` for the whole array — nobody has ever taken this register.
 *  - an entry with no `status` — the register HAS been taken, but this one
 *    player was not marked.
 *
 * Neither is "absent". A coach who has not opened the session yet is not a
 * coach reporting an empty court, so the array is withheld entirely until at
 * least one mark exists rather than being sent full of blanks.
 */
function presentAttendance(participants: TrainingParticipant[]) {
  if (!participants.some((p) => p.attendance != null)) return undefined;
  return participants.map((p) => ({
    playerId: p.playerId,
    status: (p.attendance ?? undefined) as (typeof ATTENDANCE_STATUSES)[number] | undefined,
    markedAt: p.attendanceAt?.toISOString(),
    markedBy: p.attendanceBy ?? undefined,
    note: p.attendanceNote ?? undefined,
  }));
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
//
// `requireRole("coach")` matches POST and PATCH. It was the odd one out: the
// ownership check below already made it unreachable for anyone else (a
// non-coach cannot own a training), so this closes no hole today — it stops
// the route from depending on that coincidence continuing to hold.
trainingsRouter.delete(
  "/:id",
  requireRole("coach"),
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

// PATCH /api/trainings/:id/attendance — take the register. Owner (coach) only.
//
// AUTHORISATION, in order, all server-side:
//   1. `requireAuth` (router-level) — no token, no route.
//   2. `requireRole("coach")` — a player or parent is refused here, including
//      for their OWN attendance. Attendance is a coach's statement about who
//      turned up; a player marking themselves present is the one thing this
//      must never allow, or the record is worthless for billing or no-shows.
//   3. Ownership — `coachId === req.userId`. Another coach seeing the session
//      (they might be a participant in it) still cannot mark it.
//   4. Membership — every playerId in the body must already be a participant
//      of THIS training, so a valid mark cannot be aimed at someone else's
//      session. Checked before any write: the request is all-or-nothing.
trainingsRouter.patch(
  "/:id/attendance",
  requireRole("coach"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { marks } = attendanceSchema.parse(req.body);

    const training = await prisma.training.findUnique({
      where: { id: req.params.id },
      include: { participants: true },
    });
    if (!training) throw new HttpError(404, "Training not found");
    if (training.coachId !== req.userId) throw new HttpError(403, "You do not own this training");

    const participantIds = new Set(training.participants.map((p) => p.playerId));
    for (const mark of marks) {
      if (!participantIds.has(mark.playerId)) {
        throw new HttpError(404, "That player is not in this training");
      }
    }

    // One transaction, not a loop of awaits. Taking a register is a single act:
    // if the third of five rows fails, the coach is left with a partly-saved
    // register and no way to tell which rows landed — and the not-marked vs
    // absent distinction this whole feature rests on becomes unreadable.
    const markedAt = new Date();
    await prisma.$transaction(
      dedupeMarks(marks).map((mark) =>
        prisma.trainingParticipant.update({
          where: { trainingId_playerId: { trainingId: training.id, playerId: mark.playerId } },
          data: {
            attendance: mark.status,
            attendanceAt: markedAt,
            attendanceBy: req.userId!,
            // An omitted note leaves any existing one alone; an empty string
            // clears it, which is how the UI removes a note it no longer means.
            attendanceNote: mark.note === undefined ? undefined : mark.note || null,
          },
        }),
      ),
    );

    const updated = await prisma.training.findUnique({
      where: { id: training.id },
      include: { participants: true },
    });
    return ok(res, present(updated ?? training), "Attendance saved");
  }),
);

// PATCH /api/trainings/:id/feedback — a player's own feedback on a session
// they took part in.
//
// WHY A SEPARATE ROUTE. Feedback used to be saved through the general
// PATCH /api/trainings/:id, which is `requireRole("coach")` — so against the
// real backend every player submitting feedback got a 403, and the feature
// only ever appeared to work in mock mode. Widening that route to admit
// players was the wrong fix: it accepts the whole training shape, so the
// carve-out would have had to be re-argued every time a field was added there.
// A player writes ONE field, so they get one route that can write one field.
//
// AUTHORISATION, in order, all server-side:
//   1. `requireAuth` (router-level) — no token, no route.
//   2. `requireRole("player")` — the coach who OWNS the session writes through
//      the general PATCH; an observer (parent) has no feedback of their own to
//      give, and is not a proxy for their junior's opinion of a session. One
//      gap this leaves: a coach who is a PARTICIPANT in another coach's session
//      (coach-to-coach connections exist) has no route for their own feedback.
//      Rare enough to leave, but it is a gap and not a decision.
//   3. Membership — the caller must be a participant of THIS training. Not
//      "can see it": a coach's own player who happens to be visible on someone
//      else's session was not there and has nothing to report about it.
// And the field gate: `feedbackSchema` is `.strict()`, and the update writes
// the single literal `playerSessionFeedback` key, so there is no path from
// this route to any other column even if the schema were widened by mistake.
trainingsRouter.patch(
  "/:id/feedback",
  requireRole("player"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = feedbackSchema.parse(req.body);

    const training = await prisma.training.findUnique({
      where: { id: req.params.id },
      include: { participants: true },
    });
    if (!training) throw new HttpError(404, "Training not found");
    if (!training.participants.some((p) => p.playerId === req.userId)) {
      throw new HttpError(403, "You are not a participant in this training");
    }

    const updated = await prisma.training.update({
      where: { id: training.id },
      data: {
        playerSessionFeedback: {
          ...data,
          // Stamped here, never taken from the body — see `feedbackSchema`.
          submittedBy: req.userId!,
          submittedAt: new Date().toISOString(),
        },
      },
      include: { participants: true },
    });
    return ok(res, present(updated), "Feedback saved");
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

/** Last mark wins if a client sends the same player twice — one write per player. */
function dedupeMarks<T extends { playerId: string }>(marks: T[]): T[] {
  const byPlayer = new Map<string, T>();
  for (const mark of marks) byPlayer.set(mark.playerId, mark);
  return Array.from(byPlayer.values());
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
