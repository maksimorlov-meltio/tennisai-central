import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { signToken, signPurposeToken, verifyPurposeToken } from "./jwt";
import { sendWelcomeEmail, sendVerificationEmail } from "../email/mailer";
import { publicIdFor } from "../lib/publicId";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";

const VERIFY_PURPOSE = "verify_email";
const VERIFY_TTL = "1d";

/** Build the front-end verification link a user clicks from their email. */
function verifyUrlFor(userId: string): string {
  const token = signPurposeToken(userId, VERIFY_PURPOSE, VERIFY_TTL);
  return `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

export const authRouter = Router();

const BCRYPT_COST = 12;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["player", "coach", "observer", "admin"]),
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
    const email = data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, "Email already registered");

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);
    const user = await prisma.user.create({
      data: {
        email,
        publicId: publicIdFor(data.role, randomUUID()),
        passwordHash,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });

    // Send the verification link. Fire-and-forget: a failed/queued email must
    // never block account creation. The welcome email follows once verified.
    void sendVerificationEmail(email, user.firstName, verifyUrlFor(user.id));

    return ok(
      res,
      { user: publicUser(user) },
      "Account created! Check your email for a verification link to activate your account.",
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

    // Require a verified email before issuing a session.
    if (!user.emailVerified) {
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
