import { Router } from "express";
import { z } from "zod";
import type { Team, TeamMember, User } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { assertCanActOnPlayer } from "../authz";

export const teamsRouter = Router();
teamsRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  coachId: z.string().optional(), // ignored — owner is always the current user
  description: z.string().optional(), // accepted for compatibility; not persisted
});

const updateSchema = z.object({ name: z.string().min(1).optional() });

const addMemberSchema = z.object({ playerUserId: z.string().min(1) });

type TeamWithMembers = Team & { members: (TeamMember & { player: User })[] };

/** Map a Team row (with members) to the front-end `Team` shape. */
function present(t: TeamWithMembers) {
  return {
    id: t.id,
    name: t.name,
    coachId: t.coachId,
    players: t.members.map((m) => ({
      id: m.player.id,
      playerPublicId: m.player.publicId,
      firstName: m.player.firstName,
      lastName: m.player.lastName,
      connectedSince: m.joinedAt.toISOString(),
    })),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

const withMembers = { members: { include: { player: true } } } as const;

async function ownedTeam(id: string, userId: string): Promise<TeamWithMembers> {
  const team = await prisma.team.findUnique({ where: { id }, include: withMembers });
  if (!team) throw new HttpError(404, "Team not found");
  if (team.coachId !== userId) throw new HttpError(403, "You do not own this team");
  return team;
}

// GET /api/teams — teams owned by the current coach.
teamsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.team.findMany({
      where: { coachId: req.userId! },
      include: withMembers,
      orderBy: { createdAt: "desc" },
    });
    return ok(res, rows.map(present));
  }),
);

// GET /api/teams/:id
teamsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, present(await ownedTeam(req.params.id, req.userId!)));
  }),
);

// POST /api/teams
teamsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const team = await prisma.team.create({
      data: { name: data.name, coachId: req.userId! },
      include: withMembers,
    });
    return ok(res, present(team), "Team created", 201);
  }),
);

// PATCH /api/teams/:id
teamsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    await ownedTeam(req.params.id, req.userId!);
    const team = await prisma.team.update({
      where: { id: req.params.id },
      data: { name: data.name },
      include: withMembers,
    });
    return ok(res, present(team), "Team updated");
  }),
);

// DELETE /api/teams/:id
teamsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ownedTeam(req.params.id, req.userId!);
    await prisma.team.delete({ where: { id: req.params.id } });
    return ok(res, null, "Team deleted");
  }),
);

// POST /api/teams/:id/members — add a player to the team.
teamsRouter.post(
  "/:id/members",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { playerUserId } = addMemberSchema.parse(req.body);
    await ownedTeam(req.params.id, req.userId!);

    const player = await prisma.user.findUnique({ where: { id: playerUserId } });
    if (!player) throw new HttpError(404, "Player not found");
    // Only actual players may be added, and only ones this coach may act on.
    if (player.role !== "player") throw new HttpError(400, "Only players can be added to a team");
    await assertCanActOnPlayer(req.userId!, playerUserId);

    await prisma.teamMember.upsert({
      where: { teamId_playerId: { teamId: req.params.id, playerId: playerUserId } },
      update: {},
      create: { teamId: req.params.id, playerId: playerUserId },
    });
    const team = await prisma.team.findUnique({ where: { id: req.params.id }, include: withMembers });
    return ok(res, present(team as TeamWithMembers), "Player added");
  }),
);

// DELETE /api/teams/:id/members/:playerId — remove a player from the team.
teamsRouter.delete(
  "/:id/members/:playerId",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ownedTeam(req.params.id, req.userId!);
    await prisma.teamMember.deleteMany({
      where: { teamId: req.params.id, playerId: req.params.playerId },
    });
    const team = await prisma.team.findUnique({ where: { id: req.params.id }, include: withMembers });
    return ok(res, present(team as TeamWithMembers), "Player removed");
  }),
);
