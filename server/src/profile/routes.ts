import { Router } from "express";
import { z } from "zod";
import { Prisma, type User } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { onboardingToPlayerProfile } from "./onboardingProfile";

// Mounted at /api/me.
export const profileRouter = Router();
profileRouter.use(requireAuth);

const updateSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
  })
  .partial();

function publicUser(u: User) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// GET /api/me/profile
profileRouter.get(
  "/profile",
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(404, "User not found");
    return ok(res, publicUser(user));
  }),
);

// PATCH /api/me/profile
profileRouter.patch(
  "/profile",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = updateSchema.parse(req.body);
    const email = d.email ? d.email.trim().toLowerCase() : undefined;
    // Prisma raises P2002 on a duplicate email → the error handler maps it to 409.
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { firstName: d.firstName, lastName: d.lastName, email },
    });
    return ok(res, publicUser(user), "Profile updated");
  }),
);

// Role-based onboarding answers. Values are a picked option (string), a
// multi-select (string[]), or a free-text answer (string). Stored as JSON.
const onboardingSchema = z.object({
  answers: z.record(z.union([z.string(), z.array(z.string())])).default({}),
});

// GET /api/me/onboarding — the saved answers + whether the intro is done.
profileRouter.get(
  "/onboarding",
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { onboarding: true, onboardingCompletedAt: true },
    });
    if (!user) throw new HttpError(404, "User not found");
    return ok(res, {
      completed: Boolean(user.onboardingCompletedAt),
      answers: (user.onboarding as Record<string, string | string[]>) ?? null,
    });
  }),
);

// PUT /api/me/onboarding — save answers and mark the intro complete.
profileRouter.put(
  "/onboarding",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { answers } = onboardingSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        onboarding: answers as unknown as Prisma.InputJsonValue,
        onboardingCompletedAt: new Date(),
      },
    });

    // For players, also project the answers into the structured PlayerProfile
    // so the rest of the app (analytics, session targeting) can use typed fields.
    if (user.role === "player") {
      const fields = onboardingToPlayerProfile(answers);
      await prisma.playerProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...fields },
        update: fields,
      });
    }

    return ok(res, publicUser(user), "Profile saved");
  }),
);

// GET /api/me/player-profile — the structured player profile (null if unset).
profileRouter.get(
  "/player-profile",
  asyncHandler(async (req: AuthedRequest, res) => {
    const profile = await prisma.playerProfile.findUnique({ where: { userId: req.userId! } });
    return ok(res, profile);
  }),
);
