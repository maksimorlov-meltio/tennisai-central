import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, type AuthedRequest } from "../http";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// Public-safe fields only — never email / hash. Matches the front-end
// DirectoryEntry shape used by the connection lookup.
const DIRECTORY_SELECT = {
  id: true,
  publicId: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;

const directoryQuery = z.object({ publicId: z.string().trim().min(1).optional() });

/**
 * Every user id the caller already has a relationship with — an active
 * connection (either direction), an active coach assignment (either direction),
 * or a consented guardianship (either direction). Used to scope the directory
 * so a signed-in user cannot enumerate every other user's real name.
 */
async function relatedUserIds(userId: string): Promise<string[]> {
  const [connections, assignmentsAsCoach, assignmentsAsPlayer, guardianAsGuardian, guardianAsJunior] =
    await Promise.all([
      prisma.connectionRequest.findMany({
        where: {
          status: "active",
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
        select: { fromUserId: true, toUserId: true },
      }),
      prisma.coachAssignment.findMany({
        where: { coachId: userId, status: "active" },
        select: { playerId: true },
      }),
      prisma.coachAssignment.findMany({
        where: { playerId: userId, status: "active" },
        select: { coachId: true },
      }),
      prisma.guardianship.findMany({
        where: { guardianId: userId, parentalConsent: true },
        select: { juniorPlayerId: true },
      }),
      prisma.guardianship.findMany({
        where: { juniorPlayerId: userId, parentalConsent: true },
        select: { guardianId: true },
      }),
    ]);

  const ids = new Set<string>();
  for (const c of connections) ids.add(c.fromUserId === userId ? c.toUserId : c.fromUserId);
  for (const a of assignmentsAsCoach) ids.add(a.playerId);
  for (const a of assignmentsAsPlayer) ids.add(a.coachId);
  for (const g of guardianAsGuardian) ids.add(g.juniorPlayerId);
  for (const g of guardianAsJunior) ids.add(g.guardianId);
  ids.delete(userId); // never include self
  return [...ids];
}

// GET /api/users/directory — the connection lookup.
//
// SECURITY: this endpoint previously returned EVERY user's full name to any
// signed-in account (mass enumeration / PII leak). It is now minimized:
//   • ?publicId=<exact>  → a single minimal record for the deliberate
//                          connect-by-ID flow (you must already know the exact
//                          shareable ID). Empty array if nothing matches.
//   • no param           → only users the caller already has a relationship
//                          with. Unrelated users' surnames are never exposed.
// Always returns an array to preserve the front-end contract.
usersRouter.get(
  "/directory",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { publicId } = directoryQuery.parse(req.query);

    if (publicId) {
      const match = await prisma.user.findFirst({
        where: { publicId, role: { not: "admin" } },
        select: DIRECTORY_SELECT,
      });
      return ok(res, match ? [match] : []);
    }

    const ids = await relatedUserIds(req.userId!);
    if (ids.length === 0) return ok(res, []);
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, role: { not: "admin" } },
      select: DIRECTORY_SELECT,
      orderBy: { firstName: "asc" },
    });
    return ok(res, users);
  }),
);
