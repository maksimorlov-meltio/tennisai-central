import { Router } from "express";
import { z } from "zod";
import type { Tournament, PlayerTournament, User } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";

export const tournamentsRouter = Router();

tournamentsRouter.use(requireAuth);

const STATUSES = ["planned", "registered", "maybe", "withdrawn", "played"] as const;

const addSchema = z.object({
  tournamentId: z.string().min(1),
  status: z.enum(STATUSES).default("registered"),
  notes: z.string().optional(),
  // The client sends the embedded tournament / playerId too — accepted but ignored.
});

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  notes: z.string().optional(),
});

/** Map a Tournament row to the front-end shape (ISO dates, nulls → undefined). */
function presentTournament(t: Tournament) {
  return {
    id: t.id,
    name: t.name,
    city: t.city,
    country: t.country,
    surface: t.surface,
    indoorOutdoor: t.indoorOutdoor as "indoor" | "outdoor",
    altitude: t.altitude ?? undefined,
    ballBrand: t.ballBrand ?? undefined,
    weatherSummary: t.weatherSummary ?? undefined,
    category: t.category ?? undefined,
    level: t.level ?? undefined,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    description: t.description ?? undefined,
    federation: (t.federation ?? undefined) as
      | "ITF"
      | "WTA"
      | "ATP"
      | "UTR"
      | "USTA"
      | undefined,
  };
}

type PTWithRelations = PlayerTournament & { tournament: Tournament; player: User };

/** Map a PlayerTournament row (with relations) to the embedded front-end shape. */
function presentPlayerTournament(pt: PTWithRelations) {
  return {
    id: pt.id,
    tournamentId: pt.tournamentId,
    tournament: presentTournament(pt.tournament),
    playerId: pt.playerId,
    playerName: `${pt.player.firstName} ${pt.player.lastName}`,
    status: pt.status as (typeof STATUSES)[number],
    notes: pt.notes ?? undefined,
  };
}

// GET /api/tournaments — the global catalog.
tournamentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.tournament.findMany({ orderBy: { startDate: "asc" } });
    return ok(res, rows.map(presentTournament));
  }),
);

export const playerTournamentsRouter = Router();
playerTournamentsRouter.use(requireAuth);

// GET /api/player-tournaments — the current user's tournament entries.
playerTournamentsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.playerTournament.findMany({
      where: { playerId: req.userId! },
      include: { tournament: true, player: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, rows.map(presentPlayerTournament));
  }),
);

// POST /api/player-tournaments — register the current user for a tournament.
playerTournamentsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = addSchema.parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: data.tournamentId } });
    if (!tournament) throw new HttpError(404, "Tournament not found");

    // One entry per (tournament, player) — upsert keeps it idempotent.
    const pt = await prisma.playerTournament.upsert({
      where: { tournamentId_playerId: { tournamentId: data.tournamentId, playerId: req.userId! } },
      update: { status: data.status, notes: data.notes },
      create: {
        tournamentId: data.tournamentId,
        playerId: req.userId!,
        status: data.status,
        notes: data.notes,
      },
      include: { tournament: true, player: true },
    });
    return ok(res, presentPlayerTournament(pt), "Tournament entry added", 201);
  }),
);

// PATCH /api/player-tournaments/:id — update status/notes (owner only).
playerTournamentsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);

    const existing = await prisma.playerTournament.findUnique({
      where: { id: req.params.id },
      select: { playerId: true },
    });
    if (!existing) throw new HttpError(404, "Tournament entry not found");
    if (existing.playerId !== req.userId) throw new HttpError(403, "Not your tournament entry");

    const pt = await prisma.playerTournament.update({
      where: { id: req.params.id },
      data: { status: data.status, notes: data.notes },
      include: { tournament: true, player: true },
    });
    return ok(res, presentPlayerTournament(pt), "Tournament status updated");
  }),
);

// DELETE /api/player-tournaments/:id — remove a tournament from the schedule (owner only).
playerTournamentsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.playerTournament.findUnique({
      where: { id: req.params.id },
      select: { playerId: true },
    });
    if (!existing) throw new HttpError(404, "Tournament entry not found");
    if (existing.playerId !== req.userId) throw new HttpError(403, "Not your tournament entry");

    await prisma.playerTournament.delete({ where: { id: req.params.id } });
    return ok(res, null, "Removed from schedule");
  }),
);
