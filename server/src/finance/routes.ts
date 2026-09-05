import { Router } from "express";
import { z } from "zod";
import type { FinanceEntry } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";

// Mounted at /api — routes use full nested paths (/players/:playerId/finance).
export const financeRouter = Router();
financeRouter.use(requireAuth);

// ADDITIVE. The first four are the original vocabulary and every row already
// written uses one of them; they stay valid forever. The rest were added with
// the gear wave, because "training" was absorbing coaching, court hire,
// restringing and entry fees indistinguishably — which made the finance page
// arithmetically correct and practically useless.
const CATEGORIES = [
  "training",
  "travel",
  "tournament",
  "equipment",
  "coaching",
  "stringing",
  "tournament_fee",
  "accommodation",
  "food",
  "membership",
  "other",
] as const;

const createSchema = z.object({
  category: z.enum(CATEGORIES),
  description: z.string().min(1),
  // EUR, matching the column default. Existing rows keep whatever they were
  // written with — a stored amount means what it meant when it was entered.
  currency: z.string().default("EUR"),
  amount: z.number(),
  date: z.string().min(1),
  // Optional link to the event this cost belongs to.
  tournamentId: z.string().min(1).optional(),
});

const updateSchema = createSchema.partial();

function present(e: FinanceEntry) {
  return {
    id: e.id,
    playerId: e.playerId,
    category: e.category,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    date: e.date,
    tournamentId: e.tournamentId ?? undefined,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Personal financial data is self-scoped only. */
function assertSelf(playerId: string, userId: string) {
  if (playerId !== userId) throw new HttpError(403, "You can only access your own finances");
}

/**
 * A tournament id must name a real tournament. Without this the insert fails on
 * a foreign-key violation, which is unmapped and surfaces as a 500 — telling
 * the user the server broke when in fact their input was wrong.
 */
async function assertTournamentExists(tournamentId?: string) {
  if (!tournamentId) return;
  const found = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } });
  if (!found) throw new HttpError(400, "Unknown tournament");
}

financeRouter.get(
  "/players/:playerId/finance",
  asyncHandler(async (req: AuthedRequest, res) => {
    assertSelf(req.params.playerId, req.userId!);
    const rows = await prisma.financeEntry.findMany({
      where: { playerId: req.params.playerId },
      orderBy: { date: "desc" },
    });
    return ok(res, rows.map(present));
  }),
);

financeRouter.get(
  "/players/:playerId/finance/summary",
  asyncHandler(async (req: AuthedRequest, res) => {
    assertSelf(req.params.playerId, req.userId!);
    const rows = await prisma.financeEntry.findMany({ where: { playerId: req.params.playerId } });
    const sum = (cat: string) =>
      rows.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0);

    // byCategory is additive and covers the whole vocabulary. The four original
    // totals stay exactly as they were so the existing frontend keeps working —
    // but on their own they now hide seven categories, which is how a player
    // ends up believing they spent nothing on stringing all season.
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, sum(c)]));

    return ok(res, {
      totalTraining: sum("training"),
      totalTravel: sum("travel"),
      totalTournament: sum("tournament"),
      totalEquipment: sum("equipment"),
      byCategory,
      total: rows.reduce((s, e) => s + e.amount, 0),
      currency: rows[0]?.currency ?? "EUR",
    });
  }),
);

financeRouter.post(
  "/players/:playerId/finance",
  asyncHandler(async (req: AuthedRequest, res) => {
    assertSelf(req.params.playerId, req.userId!);
    const d = createSchema.parse(req.body);
    await assertTournamentExists(d.tournamentId);
    const created = await prisma.financeEntry.create({
      data: { ...d, playerId: req.params.playerId },
    });
    return ok(res, present(created), "Entry added", 201);
  }),
);

financeRouter.patch(
  "/finance/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const entry = await prisma.financeEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) throw new HttpError(404, "Entry not found");
    assertSelf(entry.playerId, req.userId!);
    const d = updateSchema.parse(req.body);
    await assertTournamentExists(d.tournamentId);
    const updated = await prisma.financeEntry.update({ where: { id: req.params.id }, data: d });
    return ok(res, present(updated), "Entry updated");
  }),
);
