import { Router } from "express";
import { z } from "zod";
import type { EquipmentItem } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { assertCanActOnPlayer } from "../authz";

// Mounted at /api — routes use full paths (/players/:playerId/equipment, /equipment/:id).
export const equipmentRouter = Router();
equipmentRouter.use(requireAuth);

const createSchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  notes: z.string().optional(),
  acquiredDate: z.string().optional(),
  condition: z.string().optional(),
});
const updateSchema = createSchema.partial();

function present(e: EquipmentItem) {
  return {
    id: e.id,
    playerId: e.playerId,
    category: e.category,
    name: e.name,
    brand: e.brand ?? undefined,
    model: e.model ?? undefined,
    notes: e.notes ?? undefined,
    acquiredDate: e.acquiredDate ?? undefined,
    condition: e.condition ?? undefined,
  };
}

async function ownedItem(id: string, userId: string): Promise<EquipmentItem> {
  const item = await prisma.equipmentItem.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, "Equipment not found");
  if (item.playerId !== userId) throw new HttpError(403, "Not your equipment");
  return item;
}

equipmentRouter.get(
  "/players/:playerId/equipment",
  asyncHandler(async (req: AuthedRequest, res) => {
    // Reading is open to whoever may act for this player — their connected
    // coach or a consenting guardian — so a coach can check a racket's
    // condition before a session. Writing (below) stays the player's alone.
    if (req.params.playerId !== req.userId) await assertCanActOnPlayer(req.userId!, req.params.playerId);
    const rows = await prisma.equipmentItem.findMany({
      where: { playerId: req.params.playerId },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, rows.map(present));
  }),
);

equipmentRouter.post(
  "/players/:playerId/equipment",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.params.playerId !== req.userId) throw new HttpError(403, "You can only add your own equipment");
    const d = createSchema.parse(req.body);
    const created = await prisma.equipmentItem.create({ data: { ...d, playerId: req.params.playerId } });
    return ok(res, present(created), "Item added", 201);
  }),
);

equipmentRouter.patch(
  "/equipment/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ownedItem(req.params.id, req.userId!);
    const d = updateSchema.parse(req.body);
    const updated = await prisma.equipmentItem.update({ where: { id: req.params.id }, data: d });
    return ok(res, present(updated), "Item updated");
  }),
);

equipmentRouter.delete(
  "/equipment/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ownedItem(req.params.id, req.userId!);
    await prisma.equipmentItem.delete({ where: { id: req.params.id } });
    return ok(res, null, "Item deleted");
  }),
);
