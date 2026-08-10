import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { signToken, signPurposeToken, verifyPurposeToken, signResetToken, verifyResetToken } from "./jwt";
import { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail } from "../email/mailer";
import { publicIdFor } from "../lib/publicId";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { PUBLIC_SIGNUP_ROLES } from "../authz";

const VERIFY_PURPOSE = "verify_email";
const VERIFY_TTL = "1d";

/** Build the front-end verification link a user clicks from their email. */
/** Exported so the profile router can re-send verification on an email change. */
export function verifyUrlFor(userId: string): string {
  const token = signPurposeToken(userId, VERIFY_PURPOSE, VERIFY_TTL);
  return `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

/** Build the front-end password-reset link a user clicks from their email. */
function resetUrlFor(userId: string): string {
  return `${env.appUrl}/reset-password?token=${encodeURIComponent(signResetToken(userId))}`;
}

/**
 * The ONLY response /forgot-password ever gives — identical for a registered and
 * an unregistered address, so the endpoint cannot be used to enumerate accounts.
 */
const RESET_REQUESTED_MESSAGE = "If that email is registered, a reset link is on its way.";

/** One uniform failure for every bad-token case (unknown, expired, already used). */
const RESET_INVALID_MESSAGE = "This password reset link is invalid or has expired. Please request a new one.";

export const authRouter = Router();

const BCRYPT_COST = 12;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  // SECURITY: public signup may NOT self-assign "admin" (academy administrator).
  // Admin accounts are provisioned by invite/seed only. See PUBLIC_SIGNUP_ROLES.
  role: z.enum(PUBLIC_SIGNUP_ROLES),
  // ADULTS-ONLY trial: both consents are mandatory and must be exactly `true`.
  // (The 16+ minimum-age wording is presented on the client.) A missing or
  // false value fails validation → 400.
  ageConfirmed: z
    .boolean()
    .refine((v) => v === true, { message: "You must confirm you meet the minimum age to sign up." }),
  termsAccepted: z
    .boolean()
    .refine((v) => v === true, { message: "You must accept the Terms of Service and Privacy Policy." }),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Strip the password hash before sending a user to the client. */
function publicUser(u: User) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// POST /api/auth/signup — create account, then send a welcome email.
authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const data = signupSchema.parse(req.body);

    // NOTE: registration is OPEN — there is no invite-code gate. Anyone who can
    // reach this endpoint can create an account (subject to role restrictions,
    // the 16+/terms consents, and the rate limiter). If access ever needs
    // restricting again, gate it here, before any account work happens.
    const email = data.email.trim().toLowerCase();

    // Closed-beta cap. Checked before any account work, so a full beta costs a
    // count and nothing else. Only self-registerable roles are counted, so an
    // admin created out of band never consumes a seat.
    // Race note: count-then-create, so simultaneous requests at the boundary
    // could overshoot by one or two. At beta scale that is cheaper to accept
    // than serialising every signup behind a transaction.
    if (env.maxSignups !== undefined) {
      const taken = await prisma.user.count({
        where: { role: { in: [...PUBLIC_SIGNUP_ROLES] } },
      });
      if (taken >= env.maxSignups) {
        throw new HttpError(403, "Beta is full — no more signups available.");
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, "Email already registered");

    // When email verification is disabled (local no-email test), accounts are
    // created pre-verified so they are immediately usable. Secure default: false.
    const autoVerified = !env.requireEmailVerification;

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        email,
        publicId: publicIdFor(data.role, randomUUID()),
        passwordHash,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName,
        emailVerified: autoVerified,
        // Record the consents captured at signup (adults-only trial + ToS).
        termsAcceptedAt: now,
        ageConfirmedAt: now,
      },
    });

    // Send the verification link only when verification is required. Fire-and-forget:
    // a failed/queued email must never block account creation.
    if (!autoVerified) {
      void sendVerificationEmail(email, user.firstName, verifyUrlFor(user.id));
    }

    return ok(
      res,
      { user: publicUser(user) },
      autoVerified
        ? "Account created! You can log in now."
        : "Account created! Check your email for a verification link to activate your account.",
      201,
    );
  }),
);

// POST /api/auth/login — verify credentials, issue a JWT.
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    // Uniform error — never reveal whether it was the email or the password.
    if (!parsed.success) throw new HttpError(401, "Invalid email or password");

    const email = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    // Require a verified email before issuing a session (unless verification is
    // disabled for a local no-email test — see REQUIRE_EMAIL_VERIFICATION).
    if (env.requireEmailVerification && !user.emailVerified) {
      throw new HttpError(403, "Please verify your email first — check your inbox for the verification link.");
    }

    const accessToken = signToken(user.id);
    return ok(res, { user: publicUser(user), tokens: { accessToken, refreshToken: accessToken } });
  }),
);

// POST /api/auth/logout — stateless JWT, nothing to invalidate server-side.
authRouter.post("/logout", (_req, res) => {
  return ok(res, null);
});

// GET /api/auth/me — resolve the current user from the Bearer token.
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(401, "Not authenticated");
    return ok(res, publicUser(user));
  }),
);

// POST /api/auth/verify-email — confirm an email from the link's token.
authRouter.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const userId = verifyPurposeToken(token, VERIFY_PURPOSE);
    if (!userId) throw new HttpError(400, "This verification link is invalid or has expired.");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(400, "This verification link is invalid or has expired.");

    // Idempotent: a second click on an already-verified account still succeeds.
    if (!user.emailVerified) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      void sendWelcomeEmail(user.email, user.firstName, user.role);
    }
    return ok(res, null, "Email verified! You can now sign in.");
  }),
);

// POST /api/auth/resend-verification — re-send the link (uniform response).
authRouter.post(
  "/resend-verification",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (parsed.success) {
      const email = parsed.data.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.emailVerified) {
        void sendVerificationEmail(email, user.firstName, verifyUrlFor(user.id));
      }
    }
    return ok(res, null, "If an unverified account exists for that email, a new verification link is on its way.");
  }),
);

// POST /api/auth/forgot-password — request a reset link.
//
// SECURITY (no user enumeration): the response is byte-identical whether or not
// the address belongs to an account — even when the body fails validation. The
// only observable difference is whether an email gets sent. Same idiom as
// /resend-verification above.
authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (parsed.success) {
      const email = parsed.data.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        // Fire-and-forget: a slow or failing mail provider must not change the
        // response (nor its timing profile enough to leak account existence).
        void sendPasswordResetEmail(email, user.firstName, resetUrlFor(user.id));
      }
    }
    // The token is NEVER returned to the caller — it only travels by email.
    return ok(res, null, RESET_REQUESTED_MESSAGE);
  }),
);

// POST /api/auth/reset-password — consume a reset link and set a new password.
authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        token: z.string().min(1, RESET_INVALID_MESSAGE),
        password: z.string().min(8, "Password must be at least 8 characters"),
      })
      .safeParse(req.body);
    // Surface the field message (never the submitted value) so the reset form can
    // show something useful.
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request data");
    }

    const claims = verifyResetToken(parsed.data.token);
    if (!claims) throw new HttpError(400, RESET_INVALID_MESSAGE);

    const user = await prisma.user.findUnique({ where: { id: claims.userId } });
    if (!user) throw new HttpError(400, RESET_INVALID_MESSAGE);

    // SINGLE USE: any token minted before the last password change is dead, so a
    // link cannot be replayed (and older outstanding links are invalidated too).
    // Both sides are compared in whole seconds because a JWT `iat` is truncated
    // to seconds — comparing against millisecond precision would reject a token
    // issued in the same second as a previous change.
    if (user.passwordChangedAt) {
      const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (claims.issuedAtSeconds < changedAtSeconds) throw new HttpError(400, RESET_INVALID_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    return ok(res, null, "Your password has been updated. You can sign in with it now.");
  }),
);
