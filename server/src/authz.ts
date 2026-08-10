// ============================================================
// TennisAI — Authorization helpers (Stage 2)
// Role-based + relationship-based server-side authorization.
// requireAuth (http.ts) must run first; these read req.userId.
//
// Role mapping (additive, no rename):
//   player   → Player
//   coach    → Coach
//   observer → Parent / guardian
//   admin    → Academy administrator
// ============================================================

import type { RequestHandler } from "express";
import { prisma } from "./db";
import { HttpError, type AuthedRequest } from "./http";

export type Role = "player" | "coach" | "observer" | "admin";

/** Roles a PUBLIC signup may self-assign. `admin` is intentionally excluded — */
/** academy-admin accounts are provisioned by invite/seed, never self-service. */
export const PUBLIC_SIGNUP_ROLES = ["player", "coach", "observer"] as const;
export type PublicSignupRole = (typeof PUBLIC_SIGNUP_ROLES)[number];

/** Load the authenticated user's role. Throws 401 if the row is gone. */
export async function getRole(userId: string): Promise<Role> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new HttpError(401, "Not authenticated");
  return user.role as Role;
}

/**
 * Gate a route to one or more roles. Server-side — hiding the UI is never
 * sufficient. Usage: `router.post("/", requireAuth, requireRole("coach"), h)`.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return async (req: AuthedRequest, _res, next) => {
    try {
      const role = await getRole(req.userId!);
      if (!roles.includes(role)) {
        throw new HttpError(403, "You do not have permission to perform this action");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * A coach may act on a player only via an active CoachAssignment (self is
 * always allowed, so a coach can act on their own records). Throws 403 if not.
 */
export async function assertAssignedPlayer(coachId: string, playerId: string): Promise<void> {
  if (coachId === playerId) return;
  const link = await prisma.coachAssignment.findUnique({
    where: { coachId_playerId: { coachId, playerId } },
    select: { status: true },
  });
  if (!link || link.status !== "active") {
    throw new HttpError(403, "This player is not assigned to you");
  }
}

/**
 * A parent/guardian (observer) may access a junior only through a guardianship
 * with parental consent recorded. Throws 403 otherwise.
 */
export async function assertGuardianOf(guardianId: string, juniorPlayerId: string): Promise<void> {
  const link = await prisma.guardianship.findUnique({
    where: { guardianId_juniorPlayerId: { guardianId, juniorPlayerId } },
    select: { parentalConsent: true },
  });
  if (!link || !link.parentalConsent) {
    throw new HttpError(403, "You are not a consented guardian of this player");
  }
}

/**
 * Generalised "may the actor act on this player?" check, used by create/update
 * routes that accept a foreign user id (calendar events, trainings, team
 * membership, …). Allowed when:
 *   - the actor IS the target (acting on their own records), OR
 *   - an ACTIVE CoachAssignment(coachId=actor, playerId=target) exists, OR
 *   - an ACTIVE ConnectionRequest links the two in EITHER direction, OR
 *   - a CONSENTED Guardianship(guardianId=actor, juniorPlayerId=target) exists.
 * Throws 403 otherwise. Connection lookup mirrors trainingPlans `assertCanPlanFor`.
 */
export async function assertCanActOnPlayer(actorId: string, targetPlayerId: string): Promise<void> {
  if (actorId === targetPlayerId) return;

  // 1) Active coach → player assignment.
  const assignment = await prisma.coachAssignment.findUnique({
    where: { coachId_playerId: { coachId: actorId, playerId: targetPlayerId } },
    select: { status: true },
  });
  if (assignment?.status === "active") return;

  // 2) Accepted/active connection in either direction (same shape as assertCanPlanFor).
  const connection = await prisma.connectionRequest.findFirst({
    where: {
      status: "active",
      OR: [
        { fromUserId: actorId, toUserId: targetPlayerId },
        { fromUserId: targetPlayerId, toUserId: actorId },
      ],
    },
    select: { id: true },
  });
  if (connection) return;

  // 3) Consented guardianship (observer/parent acting for a junior).
  const guardianship = await prisma.guardianship.findUnique({
    where: { guardianId_juniorPlayerId: { guardianId: actorId, juniorPlayerId: targetPlayerId } },
    select: { parentalConsent: true },
  });
  if (guardianship?.parentalConsent) return;

  throw new HttpError(403, "You are not authorized to act on behalf of this player");
}

/** Two users must share at least one academy. Throws 403 otherwise. */
export async function assertSameAcademy(userIdA: string, userIdB: string): Promise<void> {
  const [a, b] = await Promise.all([
    prisma.academyMembership.findMany({ where: { userId: userIdA }, select: { academyId: true } }),
    prisma.academyMembership.findMany({ where: { userId: userIdB }, select: { academyId: true } }),
  ]);
  const academiesOfA = new Set(a.map((m) => m.academyId));
  if (!b.some((m) => academiesOfA.has(m.academyId))) {
    throw new HttpError(403, "Users are not in the same academy");
  }
}

/**
 * Resolve every player id the current user is allowed to READ:
 *  - player: themselves
 *  - coach: themselves + actively-assigned players
 *  - observer (parent): consented juniors
 *  - admin: same-academy players
 * Used to scope analytics reads without leaking cross-user data.
 */
export async function readablePlayerIds(userId: string): Promise<string[]> {
  const role = await getRole(userId);
  if (role === "player") return [userId];
  if (role === "coach") {
    // Both routes to entitlement, matching assertCanActOnPlayer. Assignments
    // alone were not enough: a coach can already ACT on a connected player, so
    // returning a narrower set here made them able to write to a player they
    // could not list — which is how the coach's tournament view came to be
    // permanently empty.
    const [assignments, connections] = await Promise.all([
      prisma.coachAssignment.findMany({
        where: { coachId: userId, status: "active" },
        select: { playerId: true },
      }),
      prisma.connectionRequest.findMany({
        where: {
          status: "active",
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
        select: { fromUserId: true, toUserId: true },
      }),
    ]);

    const candidates = new Set<string>(assignments.map((a) => a.playerId));
    for (const c of connections) {
      candidates.add(c.fromUserId === userId ? c.toUserId : c.fromUserId);
    }
    candidates.delete(userId);

    // A connection can be to an observer or another coach; only players count.
    const players = candidates.size
      ? await prisma.user.findMany({
          where: { id: { in: [...candidates] }, role: "player" },
          select: { id: true },
        })
      : [];

    return [userId, ...players.map((p) => p.id)];
  }
  if (role === "observer") {
    const links = await prisma.guardianship.findMany({
      where: { guardianId: userId, parentalConsent: true },
      select: { juniorPlayerId: true },
    });
    return links.map((l) => l.juniorPlayerId);
  }
  // admin → players in the same academy
  const myAcademies = await prisma.academyMembership.findMany({
    where: { userId },
    select: { academyId: true },
  });
  const members = await prisma.academyMembership.findMany({
    where: { academyId: { in: myAcademies.map((m) => m.academyId) }, role: "player" },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
