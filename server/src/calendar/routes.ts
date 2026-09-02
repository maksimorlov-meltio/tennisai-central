import { Router } from "express";
import { z } from "zod";
import { Prisma, type CalendarEvent } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { assertCanActOnPlayer } from "../authz";
import { expandRecurrence, type PresentedEvent } from "./recurrence";
import { createNotification } from "../notifications/routes";

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

const EVENT_TYPES = ["training", "tournament", "match", "travel", "recovery"] as const;

// A date string must be something `new Date()` can parse — otherwise the row
// would store an Invalid Date and reads would 500. Reject malformed input at 400.
const dateString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date/time value" });

const baseSchema = z.object({
  title: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  state: z.string().optional(),
  startDate: dateString,
  endDate: dateString,
  location: z.string().optional(),
  description: z.string().optional(),
  playerId: z.string().optional(),
  playerName: z.string().optional(),
  teamId: z.string().optional(),
  tournamentId: z.string().optional(),
  coachNotes: z.string().optional(),
  // SECURITY: `createdBy` is NOT accepted from the client — the creator is
  // always the authenticated user (set server-side on create). Accepting it
  // previously allowed forging event ownership.
  createdByRole: z.string().optional(),
  trainingRequestId: z.string().optional(),
  recurrence: z.record(z.unknown()).nullable().optional(),
});
const createSchema = baseSchema;
const updateSchema = baseSchema.partial();

/** Map a DB row to the front-end CalendarEvent shape. */
function present(e: CalendarEvent): PresentedEvent {
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    state: e.state ?? undefined,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate.toISOString(),
    location: e.location ?? undefined,
    description: e.description ?? undefined,
    playerId: e.playerId ?? undefined,
    playerName: e.playerName ?? undefined,
    teamId: e.teamId ?? undefined,
    tournamentId: e.tournamentId ?? undefined,
    coachNotes: e.coachNotes ?? undefined,
    createdBy: e.createdBy ?? undefined,
    createdByRole: e.createdByRole ?? undefined,
    trainingRequestId: e.trainingRequestId ?? undefined,
    recurrence: (e.recurrence ?? undefined) as PresentedEvent["recurrence"],
  };
}

/** Events visible to the user: ones they created or are the player on. */
function visibleWhere(userId: string): Prisma.CalendarEventWhereInput {
  return { OR: [{ createdBy: userId }, { playerId: userId }] };
}

/** Turn a validated body into Prisma create/update data. */
function toData(d: z.infer<typeof updateSchema>) {
  return {
    title: d.title,
    type: d.type,
    state: d.state,
    startDate: d.startDate ? new Date(d.startDate) : undefined,
    endDate: d.endDate ? new Date(d.endDate) : undefined,
    location: d.location,
    description: d.description,
    playerId: d.playerId,
    playerName: d.playerName,
    teamId: d.teamId,
    tournamentId: d.tournamentId,
    coachNotes: d.coachNotes,
    createdByRole: d.createdByRole,
    trainingRequestId: d.trainingRequestId,
    recurrence:
      d.recurrence === null
        ? Prisma.JsonNull
        : (d.recurrence as Prisma.InputJsonValue | undefined),
  };
}

/**
 * Trainings, as calendar events.
 *
 * A session a coach books on the Trainings page is a `Training` row, and that
 * is a different table from `CalendarEvent` — so until this existed, a coach
 * created a training and it appeared on nobody's schedule. The client always
 * assumed otherwise: creating a training invalidates the calendar query
 * (hooks/api/queries.ts).
 *
 * These are projected at read time rather than mirrored into a second table on
 * write. A Training has many participants but a CalendarEvent carries a single
 * playerId, so mirroring means a row per participant kept in sync forever,
 * through a PATCH that can replace the whole participant set. Projecting keeps
 * one source of truth and cannot drift.
 *
 * The ids are prefixed `training-`, which no real event id can collide with
 * (cuids have no dash), and the client treats that prefix as read-only on the
 * calendar — a training is edited on the Trainings page, where it lives.
 */
type TrainingForCalendar = Prisma.TrainingGetPayload<{
  include: { participants: { include: { player: { select: { id: true; firstName: true; lastName: true } } } } };
}>;

function projectTraining(t: TrainingForCalendar, viewerId: string): PresentedEvent[] {
  // Deliberately not annotated `Omit<PresentedEvent, "id">`: PresentedEvent
  // carries a string index signature, so Omit collapses it to the index
  // signature alone and the spread stops contributing startDate/endDate.
  const base = {
    title: t.title,
    type: "training",
    state: "confirmed",
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    location: t.location ?? undefined,
    description: t.description ?? undefined,
    coachNotes: t.coachNotes ?? undefined,
    createdBy: t.coachId,
    createdByRole: "coach",
  };

  // A participant sees only their own place in the session. One row per
  // participant would put every team-mate's name on their calendar.
  if (t.coachId !== viewerId) {
    return [{ ...base, id: `training-${t.id}-${viewerId}`, playerId: viewerId }];
  }

  // The coach gets one per participant, because that is what the calendar's
  // per-player filter keys off. A session with nobody attached is the coach's
  // own block of time.
  if (t.participants.length === 0) return [{ ...base, id: `training-${t.id}` }];

  return t.participants.map((p) => ({
    ...base,
    id: `training-${t.id}-${p.playerId}`,
    playerId: p.playerId,
    playerName: `${p.player.firstName} ${p.player.lastName}`,
  }));
}

// ── Telling the other side ──────────────────────────────────────────────────
// An event only matters to the person it lands on. Two directions:
//   • a coach putting something on a player's schedule  → tell that player;
//   • a player putting something on their own schedule  → tell the people
//     connected to them, so a coach or parent sees it without hunting.
// The `calendar_event_*` types were already mapped to a preference category in
// notifications/deliver.ts; nothing had ever emitted them.

/** Everyone with an ACTIVE connection to this user. */
async function connectedTo(userId: string): Promise<string[]> {
  const rows = await prisma.connectionRequest.findMany({
    where: { status: "active", OR: [{ fromUserId: userId }, { toUserId: userId }] },
    select: { fromUserId: true, toUserId: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.fromUserId !== userId) ids.add(r.fromUserId);
    if (r.toUserId !== userId) ids.add(r.toUserId);
  }
  return [...ids];
}

/**
 * Fire-and-forget, and it must stay that way safely.
 *
 * The route calls this with `void`, so anything that rejects in here becomes an
 * unhandled rejection — which takes the process down on modern Node. Unlike
 * `createNotification`, which swallows its own failures, this function also
 * queries for the actor's name and their connections, and either can throw.
 * So the whole body is wrapped: a notification that cannot be worked out must
 * never turn a successful calendar write into a crash. Same rule the
 * connections module documents on its own notifier.
 */
async function announceEvent(
  event: Pick<CalendarEvent, "title" | "type" | "startDate" | "playerId">,
  actorId: string,
  type: "calendar_event_created" | "calendar_event_updated" | "calendar_event_deleted",
  verb: string,
): Promise<void> {
  try {
    await announce(event, actorId, type, verb);
  } catch (err) {
    console.error(
      `[calendar] notification (${type}) failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function announce(
  event: Pick<CalendarEvent, "title" | "type" | "startDate" | "playerId">,
  actorId: string,
  type: string,
  verb: string,
) {
  const when = event.startDate.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { firstName: true, lastName: true },
  });
  const name = actor ? `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() : "";
  const who = name || "Someone";

  // Someone acted on another person's schedule — that person is the audience.
  const audience =
    event.playerId && event.playerId !== actorId ? [event.playerId] : await connectedTo(actorId);

  for (const userId of audience) {
    if (userId === actorId) continue;
    void createNotification({
      userId,
      type,
      title: `${event.type[0].toUpperCase()}${event.type.slice(1)} ${verb}`,
      message: `${who} ${verb} "${event.title}" on ${when}.`,
      linkTo: "/calendar",
    });
  }
}

// GET /api/calendar/events — expanded (recurring events become occurrences),
// plus every training the caller coaches or takes part in.
calendarRouter.get(
  "/events",
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const [rows, trainings] = await Promise.all([
      prisma.calendarEvent.findMany({ where: visibleWhere(userId) }),
      prisma.training.findMany({
        // Same scope as GET /api/trainings: yours to coach, or yours to attend.
        where: { OR: [{ coachId: userId }, { participants: { some: { playerId: userId } } }] },
        include: {
          participants: { include: { player: { select: { id: true, firstName: true, lastName: true } } } },
        },
      }),
    ]);
    const now = new Date();
    const expanded = rows.flatMap((r) => expandRecurrence(present(r), now));
    const projected = trainings.flatMap((t) => projectTraining(t, userId));
    return ok(res, [...expanded, ...projected]);
  }),
);

// GET /api/calendar/events/:id — resolves direct or virtual (_occ_) ids.
calendarRouter.get(
  "/events/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parentId = req.params.id.split("_occ_")[0];
    const row = await prisma.calendarEvent.findFirst({
      where: { id: parentId, ...visibleWhere(req.userId!) },
    });
    if (!row) throw new HttpError(404, "Event not found");
    const occ = expandRecurrence(present(row), new Date()).find((e) => e.id === req.params.id);
    if (!occ) throw new HttpError(404, "Event not found");
    return ok(res, occ);
  }),
);

// POST /api/calendar/events
calendarRouter.post(
  "/events",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = createSchema.parse(req.body);
    // Creating an event ON BEHALF OF another player requires a relationship.
    if (d.playerId && d.playerId !== req.userId) {
      await assertCanActOnPlayer(req.userId!, d.playerId);
    }
    const created = await prisma.calendarEvent.create({
      data: {
        ...toData(d),
        title: d.title,
        type: d.type,
        startDate: new Date(d.startDate),
        endDate: new Date(d.endDate),
        // Owner is ALWAYS the authenticated user — never client-controlled.
        createdBy: req.userId!,
      },
    });
    void announceEvent(created, req.userId!, "calendar_event_created", "added");
    return ok(res, present(created), "Event created", 201);
  }),
);

// PATCH /api/calendar/events/:id — virtual ids resolve to the parent.
calendarRouter.patch(
  "/events/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = updateSchema.parse(req.body);
    const parentId = req.params.id.split("_occ_")[0];
    await assertVisible(parentId, req.userId!);
    // Reassigning the event to another player requires a relationship with them.
    if (d.playerId && d.playerId !== req.userId) {
      await assertCanActOnPlayer(req.userId!, d.playerId);
    }
    const updated = await prisma.calendarEvent.update({ where: { id: parentId }, data: toData(d) });
    void announceEvent(updated, req.userId!, "calendar_event_updated", "changed");
    return ok(res, present(updated), "Event updated");
  }),
);

// DELETE /api/calendar/events/:id — deletes the (parent) event.
calendarRouter.delete(
  "/events/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parentId = req.params.id.split("_occ_")[0];
    await assertVisible(parentId, req.userId!);
    // Read before the delete — afterwards there is nothing left to describe.
    const doomed = await prisma.calendarEvent.findUnique({ where: { id: parentId } });
    await prisma.calendarEvent.delete({ where: { id: parentId } });
    if (doomed) void announceEvent(doomed, req.userId!, "calendar_event_deleted", "cancelled");
    return ok(res, null, "Event deleted");
  }),
);

async function assertVisible(id: string, userId: string) {
  const row = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { createdBy: true, playerId: true },
  });
  if (!row) throw new HttpError(404, "Event not found");
  if (row.createdBy !== userId && row.playerId !== userId) {
    throw new HttpError(403, "You cannot modify this event");
  }
}
