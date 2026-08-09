import { Router } from "express";
import { z } from "zod";
import type { Tournament, PlayerTournament, User } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { requireRole, readablePlayerIds } from "../authz";
import { importTournaments } from "./feed";

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
    // Coordinates power the tournaments map + distance sort. Contract shape is
    // `number | null` (explicit null, not undefined) so the client can tell
    // "no coordinates" from "field omitted".
    latitude: t.latitude ?? null,
    longitude: t.longitude ?? null,
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

// POST /api/tournaments/import — admin-only. Pulls tournaments from the active
// feed provider (curated static snapshot, or a real live feed when configured)
// and upserts them into the catalog. Idempotent.
tournamentsRouter.post(
  "/import",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const result = await importTournaments(prisma);
    return ok(res, result, `Imported ${result.imported} tournaments from ${result.source}`);
  }),
);

export const playerTournamentsRouter = Router();
playerTournamentsRouter.use(requireAuth);

// GET /api/player-tournaments — the current user's tournament entries.
playerTournamentsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    // Everyone the caller may read, not just themselves. Scoped to the caller
    // for a player; a coach or guardian sees their players' entries too, which
    // is the whole point of the coach's tournament view — it was returning an
    // empty list for every coach against the real API.
    const playerIds = await readablePlayerIds(req.userId!);
    const rows = await prisma.playerTournament.findMany({
      where: { playerId: { in: playerIds } },
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

// ── Hidden tournaments (per-user "eliminate from suggestions") ─────────────
// All routes are auth-required and strictly owner-scoped: a user can only read
// and mutate their OWN hidden list (scoped by req.userId, never a body/param id).
export const hiddenTournamentsRouter = Router();
hiddenTournamentsRouter.use(requireAuth);

const hideSchema = z.object({ tournamentId: z.string().min(1) });

// GET /api/hidden-tournaments — the tournamentIds the current user has hidden.
hiddenTournamentsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.hiddenTournament.findMany({
      where: { userId: req.userId! },
      select: { tournamentId: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, rows.map((r) => r.tournamentId));
  }),
);

// POST /api/hidden-tournaments — hide a tournament for the current user.
// Idempotent: hiding an already-hidden tournament still returns 201.
hiddenTournamentsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { tournamentId } = hideSchema.parse(req.body);

    // Guard against orphan hides + give a clean 404 (vs a raw FK error).
    const exists = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!exists) throw new HttpError(404, "Tournament not found");

    await prisma.hiddenTournament.upsert({
      where: { userId_tournamentId: { userId: req.userId!, tournamentId } },
      update: {},
      create: { userId: req.userId!, tournamentId },
    });
    return ok(res, { tournamentId }, "Tournament hidden from suggestions", 201);
  }),
);

// DELETE /api/hidden-tournaments/:tournamentId — unhide (idempotent: a no-op
// delete when the row is absent still returns 200).
hiddenTournamentsRouter.delete(
  "/:tournamentId",
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.hiddenTournament.deleteMany({
      where: { userId: req.userId!, tournamentId: req.params.tournamentId },
    });
    return ok(res, null, "Tournament restored to suggestions");
  }),
);
