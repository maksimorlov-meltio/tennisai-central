import { Router } from "express";
import { z } from "zod";
import { Prisma, type CalendarEvent } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { assertCanActOnPlayer } from "../authz";
import { expandRecurrence, type PresentedEvent } from "./recurrence";

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

// GET /api/calendar/events — expanded (recurring events become occurrences).
calendarRouter.get(
  "/events",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.calendarEvent.findMany({ where: visibleWhere(req.userId!) });
    const now = new Date();
    const expanded = rows.flatMap((r) => expandRecurrence(present(r), now));
    return ok(res, expanded);
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
    return ok(res, present(updated), "Event updated");
  }),
);

// DELETE /api/calendar/events/:id — deletes the (parent) event.
calendarRouter.delete(
  "/events/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parentId = req.params.id.split("_occ_")[0];
    await assertVisible(parentId, req.userId!);
    await prisma.calendarEvent.delete({ where: { id: parentId } });
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
