import { Router } from "express";
import { z } from "zod";
import { Prisma, type User } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { sendVerificationEmail } from "../email/mailer";
import { verifyUrlFor } from "../auth/routes";
import { onboardingToPlayerProfile } from "./onboardingProfile";
import { publicUser } from "../lib/publicUser";

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

    // Detect a real email change so we can force re-verification of the new
    // address (owning the old inbox must not vouch for a new one).
    const current = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true },
    });
    if (!current) throw new HttpError(404, "User not found");
    const emailChanged = email !== undefined && email !== current.email;

    // Prisma raises P2002 on a duplicate email → the error handler maps it to 409.
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        firstName: d.firstName,
        lastName: d.lastName,
        email,
        // Changing email invalidates prior verification.
        ...(emailChanged ? { emailVerified: false } : {}),
      },
    });

    // Fire-and-forget a fresh verification link when verification is enabled.
    if (emailChanged && env.requireEmailVerification) {
      void sendVerificationEmail(user.email, user.firstName, verifyUrlFor(user.id));
    }

    return ok(
      res,
      publicUser(user),
      emailChanged && env.requireEmailVerification
        ? "Profile updated — check your new email for a verification link."
        : "Profile updated",
    );
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

// ── Calendar preferences ────────────────────────────────────────────────────
//
// Which tournament calendars this user wants to see. Stored per account rather
// than per browser: the filters used to be session-only, so with the world's
// feeds loaded a coach met 1,458 events in September and re-hid them on every
// visit, on every device.

/**
 * What the calendar can be subscribed to.
 *
 * These are CIRCUITS, not raw federations. The client splits ITF's junior
 * events out from its professional ones — a junior coach wants the 256 junior
 * events and none of the pro tour — so "ITF Junior" is a subscribable thing
 * even though no tournament row carries it as a federation.
 *
 * It is enumerated rather than free text so a typo cannot silently become a
 * subscription that matches nothing.
 */
const FEDERATIONS = ["ITF", "ITF Junior", "WTA", "ATP", "UTR", "USTA"] as const;

const calendarPrefsSchema = z.object({
  // Empty is a real, valid choice and the default — own sessions only.
  federations: z.array(z.enum(FEDERATIONS)).max(FEDERATIONS.length),
  showOwnEvents: z.boolean().optional(),
});

/** The shape the client gets, whether or not a row exists yet. */
function presentCalendarPrefs(row: { federations: string[]; showOwnEvents: boolean } | null) {
  return {
    federations: row?.federations ?? [],
    showOwnEvents: row?.showOwnEvents ?? true,
  };
}

// GET /api/me/calendar-preferences
profileRouter.get(
  "/calendar-preferences",
  asyncHandler(async (req: AuthedRequest, res) => {
    // No row yet is the normal state for a new account, not an error: it means
    // "nothing subscribed", which is exactly the intended default.
    const row = await prisma.calendarPreference.findUnique({
      where: { userId: req.userId! },
      select: { federations: true, showOwnEvents: true },
    });
    return ok(res, presentCalendarPrefs(row));
  }),
);

// PUT /api/me/calendar-preferences — replace the subscription set.
profileRouter.put(
  "/calendar-preferences",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = calendarPrefsSchema.parse(req.body);
    // De-duplicated so a client sending ["ITF","ITF"] cannot grow the column.
    const federations = [...new Set(data.federations)];

    const row = await prisma.calendarPreference.upsert({
      where: { userId: req.userId! },
      create: {
        userId: req.userId!,
        federations,
        showOwnEvents: data.showOwnEvents ?? true,
      },
      update: {
        federations,
        ...(data.showOwnEvents === undefined ? {} : { showOwnEvents: data.showOwnEvents }),
      },
      select: { federations: true, showOwnEvents: true },
    });

    return ok(res, presentCalendarPrefs(row), "Calendar preferences saved");
  }),
);
