import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../db";
import { env, emailEnabled } from "../env";
import { signToken, signPurposeToken, verifyPurposeToken, signResetToken, verifyResetToken } from "./jwt";
import {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNotificationEmail,
} from "../email/mailer";
import { publicIdFor } from "../lib/publicId";
import { publicUser } from "../lib/publicUser";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { PUBLIC_SIGNUP_ROLES } from "../authz";
import { ageFromIsoDate, todayUtc } from "./age";
import {
  minorAgeThreshold,
  mintGuardianConsentToken,
  hashGuardianConsentToken,
  consentLinkExpired,
  GUARDIAN_CONSENT_PENDING_STATUS,
  GUARDIAN_CONSENT_PENDING_CODE,
  GUARDIAN_CONSENT_PENDING_MESSAGE,
  GUARDIAN_CONSENT_INVALID_MESSAGE,
} from "./guardianConsent";

const VERIFY_PURPOSE = "verify_email";
const VERIFY_TTL = "1d";

/**
 * The one password rule, declared once. Both signup and reset validate against
 * it, and GET /signup-policy publishes it so the sign-up form can state the
 * requirement up front instead of only after a rejected submit.
 */
export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;

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
 * Build the link a parent or guardian clicks to approve a child's account.
 *
 * Takes the RAW token (only the digest of it is ever stored) and is called in
 * exactly one place — the argument to the guardian email. It must never reach a
 * response body or a log.
 */
function guardianConsentUrlFor(token: string): string {
  return `${env.appUrl}/guardian-consent?token=${encodeURIComponent(token)}`;
}

/**
 * The ONLY response /forgot-password ever gives — identical for a registered and
 * an unregistered address, so the endpoint cannot be used to enumerate accounts.
 */
const RESET_REQUESTED_MESSAGE = "If that email is registered, a reset link is on its way.";

/**
 * What to say when the server has no way to send mail at all.
 *
 * This does NOT weaken the no-enumeration property: whether a transport is
 * configured is a fact about the server, identical for every address, and
 * observable from /api/health anyway. Telling the truth here is worth it —
 * the alternative is a person watching an inbox that can never receive
 * anything, concluding the app is broken, and being right.
 */
const RESET_UNAVAILABLE_MESSAGE =
  "Password reset is unavailable right now — this server cannot send email yet. Please ask your coach or the person who set this up to reset it for you.";

/** One uniform failure for every bad-token case (unknown, expired, already used). */
const RESET_INVALID_MESSAGE = "This password reset link is invalid or has expired. Please request a new one.";

export const authRouter = Router();

const BCRYPT_COST = 12;

const signupSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    // SECURITY: public signup may NOT self-assign "admin" (academy administrator).
    // Admin accounts are provisioned by invite/seed only. See PUBLIC_SIGNUP_ROLES.
    role: z.enum(PUBLIC_SIGNUP_ROLES),
    // Calendar date of birth, `yyyy-MM-dd`. OPTIONAL at the schema level and
    // validated for real below, because a client that predates this change
    // sends only `ageConfirmed` and must keep working exactly as it did.
    dateOfBirth: z.string().min(1).optional(),
    // The legacy self-declared "I meet the minimum age" tick. Now only consulted
    // when no date of birth was supplied — a real date beats a checkbox, and a
    // 14-year-old must be able to say so without the form calling them a liar.
    ageConfirmed: z.boolean().optional(),
    // Supplied only when the date of birth puts the applicant below the age of
    // digital consent. Required in that case; see the superRefine below.
    guardianName: z.string().trim().min(1).max(120).optional(),
    guardianEmail: z.string().email().max(254).optional(),
    termsAccepted: z
      .boolean()
      .refine((v) => v === true, { message: "You must accept the Terms of Service and Privacy Policy." }),
  })
  .superRefine((value, ctx) => {
    // Preserved verbatim for the no-date-of-birth path: a missing or false
    // age confirmation is still a 400, exactly as before this change.
    if (value.dateOfBirth === undefined && value.ageConfirmed !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ageConfirmed"],
        message: "You must confirm you meet the minimum age to sign up.",
      });
    }
  });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Is this account still waiting on a parent or guardian?
 *
 * Reads the explicit flag AND the timestamp, and never derives the rule from
 * "guardianEmail is set" — a rule inferred from an incidental column is the
 * kind that quietly stops firing when that column changes shape.
 *
 * `guardianConsentRequired` is NOT cleared when consent arrives: it records
 * that this account was created for a minor, which stays true forever. The
 * timestamp is what lifts the gate.
 */
function guardianConsentPending(u: Pick<User, "guardianConsentRequired" | "guardianConsentAt">): boolean {
  return u.guardianConsentRequired && !u.guardianConsentAt;
}

/**
 * Strip everything secret before sending a user to the client.
 *
 * `guardianConsentToken` is stripped for the same reason as `passwordHash`: it
 * is a live credential. It holds the SHA-256 digest rather than the token, but
 * a digest is still the thing the consent endpoint looks up, and the whole
 * point of the gate is that nothing which can lift it travels in a response.
 */


// POST /api/auth/signup — create account, then send a welcome email.
authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const data = signupSchema.parse(req.body);

    // NOTE: registration is OPEN — there is no invite-code gate. Anyone who can
    // reach this endpoint can create an account (subject to role restrictions,
    // the age/terms consents, and the rate limiter). If access ever needs
    // restricting again, gate it here, before any account work happens.
    const email = data.email.trim().toLowerCase();

    // ── Age of digital consent ───────────────────────────────────────────────
    // A supplied date of birth decides; `ageConfirmed` is ignored whenever one
    // is present, because a real date is evidence and a checkbox is a promise.
    const threshold = minorAgeThreshold();
    let isMinor = false;
    if (data.dateOfBirth !== undefined) {
      const age = ageFromIsoDate(data.dateOfBirth, todayUtc());
      // null covers a malformed string, a date that does not exist
      // (2025-02-29), a future date, and an implausible one. It NEVER means
      // "old enough".
      if (age === null) {
        throw new HttpError(400, "Please enter a real date of birth.");
      }
      isMinor = age < threshold;
    }

    // Below the threshold the account cannot be self-authorised, so a guardian
    // must be named before anything is created.
    let guardianEmail: string | undefined;
    if (isMinor) {
      if (!data.guardianName || !data.guardianEmail) {
        throw new HttpError(
          400,
          `Because you are under ${threshold}, a parent or guardian has to approve this account. ` +
            "Please give their name and email address.",
        );
      }
      guardianEmail = data.guardianEmail.trim().toLowerCase();
      // Without this the gate is decoration for anyone who owns one mailbox:
      // sign up as a minor, name yourself as your own guardian, approve.
      // It is not airtight (a second free address defeats it), but the point
      // is that consent must involve a second party at all.
      if (guardianEmail === email) {
        throw new HttpError(
          400,
          "A parent or guardian's email has to be different from the account's own email address.",
        );
      }
    }

    // Verification demanded, but nothing configured to deliver the link with.
    // Every account created in this state is permanently locked: told to check
    // an inbox that will never receive anything, and refused at login forever.
    // Refuse the signup instead of minting one.
    //
    // Deliberately NOT a refuse-to-boot check. Taking the API down would log
    // out everyone already using it to punish a setting that only harms people
    // who have not signed up yet.
    if (env.requireEmailVerification && !emailEnabled) {
      throw new HttpError(
        503,
        "Registration is temporarily unavailable — this server cannot send verification emails yet. Please try again later.",
      );
    }

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

    // Mint the consent token ONLY when there is a transport to carry it.
    //
    // With no mail configured the account is still created and still locked —
    // it simply waits. That is the honest outcome: the alternative shortcuts
    // (echo the token in the response, print the link to the log) would turn
    // the gate into decoration, because anyone who can read either can approve
    // any child's account.
    const consent = isMinor && emailEnabled ? mintGuardianConsentToken() : null;

    const user = await prisma.user.create({
      data: {
        email,
        publicId: publicIdFor(data.role, randomUUID()),
        passwordHash,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName,
        emailVerified: autoVerified,
        // Record the consents captured at signup (ToS always; the self-declared
        // age confirmation only where it means something — a minor is not
        // confirming they meet the minimum age, their guardian is consenting).
        termsAcceptedAt: now,
        ageConfirmedAt: isMinor ? null : now,
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth } : {}),
        ...(isMinor
          ? {
              // The gate itself. `guardianConsentAt` stays null until a guardian
              // clicks the link, and login refuses for as long as it is null.
              guardianConsentRequired: true,
              guardianName: data.guardianName,
              guardianEmail,
              // Only the DIGEST is stored, and only when a link actually went out.
              ...(consent ? { guardianConsentToken: consent.digest, guardianConsentSentAt: now } : {}),
            }
          : {}),
      },
    });

    // Send the verification link only when verification is required. Fire-and-forget:
    // a failed/queued email must never block account creation.
    if (!autoVerified) {
      void sendVerificationEmail(email, user.firstName, verifyUrlFor(user.id));
    }

    // The guardian's approval link. Sent through the ordinary transactional
    // mailer, and only when `consent` exists — which is only when a transport
    // exists, so the mailer's no-transport branch (which logs the link) can
    // never be reached with this URL.
    if (consent && guardianEmail) {
      void sendNotificationEmail({
        to: guardianEmail,
        firstName: data.guardianName!,
        title: "Approve a TennisAI account for your child",
        message:
          `${user.firstName} ${user.lastName} (${user.email}) signed up for TennisAI — a training, ` +
          `calendar and tournament app — and gave your address as their parent or guardian.\n\n` +
          `Because they are under ${threshold}, the account is locked and cannot be used until you ` +
          `approve it. Follow the link below to read what it involves and confirm.\n\n` +
          `The link stops working in 30 days. If you were not expecting this, do nothing: without ` +
          `your approval the account stays locked.`,
        linkUrl: guardianConsentUrlFor(consent.token),
      });
    }

    const minorMessage = emailEnabled
      ? "Account created. We've emailed your parent or guardian to ask for their approval — " +
        "you'll be able to sign in as soon as they confirm."
      : "Account created, but it's waiting for a parent or guardian to approve it. This server " +
        "cannot send email yet, so ask your coach or whoever set up TennisAI to sort it out.";

    return ok(
      res,
      { user: publicUser(user) },
      isMinor
        ? minorMessage
        : autoVerified
          ? "Account created! You can log in now."
          : "Account created! Check your email for a verification link to activate your account.",
      201,
    );
  }),
);

/**
 * GET /api/auth/signup-policy — the rules the sign-up form has to state up front.
 *
 * Public and unauthenticated: neither value is a secret, and both are already
 * observable by submitting a form and reading the rejection. Publishing them is
 * what lets the client show the password requirement before a failed submit,
 * and ask for guardian details at the SAME age the server enforces — rather
 * than duplicating a number that is deployment-specific by design.
 */
authRouter.get("/signup-policy", (_req, res) =>
  ok(res, { minorAgeThreshold: minorAgeThreshold(), passwordMinLength: PASSWORD_MIN_LENGTH }),
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

    // THE GATE. Checked AFTER the password comparison above, deliberately: put
    // it first and the endpoint becomes an oracle that reveals which addresses
    // belong to children, to anyone who can type an email address.
    //
    // Distinct status and code, never "invalid credentials" — a 14-year-old
    // whose parent has not clicked yet has not got their password wrong, and
    // telling them so would send them round the reset loop forever.
    if (guardianConsentPending(user)) {
      return res
        .status(GUARDIAN_CONSENT_PENDING_STATUS)
        .json({ message: GUARDIAN_CONSENT_PENDING_MESSAGE, code: GUARDIAN_CONSENT_PENDING_CODE });
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

    // Belt and braces. /login is the only route that mints a token, and it
    // refuses while consent is pending — so in ordinary operation no token for
    // a pending account can exist. This catches the cases that ordinary
    // operation does not cover: a token minted before the gate existed, and a
    // consent that is somehow withdrawn while a session is live.
    if (guardianConsentPending(user)) {
      return res
        .status(GUARDIAN_CONSENT_PENDING_STATUS)
        .json({ message: GUARDIAN_CONSENT_PENDING_MESSAGE, code: GUARDIAN_CONSENT_PENDING_CODE });
    }

    return ok(res, publicUser(user));
  }),
);

// POST /api/auth/guardian-consent — a parent or guardian approves an account.
//
// TOKEN SEMANTICS, matching the password-reset link next door:
//   • one uniform message for unknown / expired / already-used, so the endpoint
//     cannot be used to probe which tokens ever existed;
//   • strictly single use — the stored digest is cleared on success;
//   • time limited (30 days, measured from guardianConsentSentAt).
//
// Unlike /verify-email this is NOT idempotent, and that is on purpose: consent
// is a one-time legal act, and a link that keeps working is a link that keeps
// being replayable from a forwarded email.
authRouter.post(
  "/guardian-consent",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, GUARDIAN_CONSENT_INVALID_MESSAGE);

    // Look up by digest — the raw token is never stored, so it is hashed here
    // and compared against what signup wrote.
    const digest = hashGuardianConsentToken(parsed.data.token);
    const user = await prisma.user.findUnique({ where: { guardianConsentToken: digest } });
    if (!user) throw new HttpError(400, GUARDIAN_CONSENT_INVALID_MESSAGE);

    if (consentLinkExpired(user.guardianConsentSentAt)) {
      // Burn the dead token rather than leaving it addressable forever.
      await prisma.user.update({ where: { id: user.id }, data: { guardianConsentToken: null } });
      throw new HttpError(400, GUARDIAN_CONSENT_INVALID_MESSAGE);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { guardianConsentAt: new Date(), guardianConsentToken: null },
    });

    // Tell the guardian what they just approved — but only the child's first
    // name and the kind of account. Whoever holds the link is presumed to be
    // the guardian, not proven to be, so this is not a place to hand back a
    // user record.
    return ok(
      res,
      { childFirstName: user.firstName, accountRole: user.role },
      "Thank you — the account is approved and can now be used.",
    );
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
    // Same reasoning as /forgot-password: promising a link the server cannot
    // send leaves someone waiting on an empty inbox indefinitely.
    if (!emailEnabled) {
      return ok(res, null, "This server cannot send email yet, so a verification link cannot be re-sent.");
    }
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
    // `emailConfigured` is a property of the server, identical for every
    // address, so returning it cannot be used to probe for accounts.
    if (!emailEnabled) return ok(res, { emailConfigured: false }, RESET_UNAVAILABLE_MESSAGE);

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
    return ok(res, { emailConfigured: true }, RESET_REQUESTED_MESSAGE);
  }),
);

// POST /api/auth/reset-password — consume a reset link and set a new password.
authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        token: z.string().min(1, RESET_INVALID_MESSAGE),
        password: z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT),
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
