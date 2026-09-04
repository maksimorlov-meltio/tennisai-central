// ============================================================================
// Guardian consent — the policy, the token, and the wording.
//
// WHY THIS EXISTS
// The product ships ITF JUNIOR calendars, so a 14-year-old on that circuit is
// the archetypal user. Signup used to hard-require "I am 16 or older" and
// refuse anyone who ticked nothing, which locked out the richest part of the
// addressable market at the front door. The rule is now: derive the age from a
// date of birth; at or above the threshold nothing changes; below it the
// account is created but INERT until a parent or guardian approves it by email.
//
// WHY THE THRESHOLD IS CONFIGURABLE
// GDPR Art. 8 leaves the age of digital consent to each member state and it
// ranges 13-16 (Spain 14, Germany 16, Ireland 16, Denmark 13). Any single baked
// -in number is wrong somewhere by design, so it is read from the environment.
//
// WHY IT IS READ HERE AND NOT IN src/env.ts
// `src/env.ts` is owned by another workstream in this change. Reading it here,
// per call, keeps the whole feature inside one directory and makes the
// threshold trivially drivable from a test.
// ============================================================================

import { createHash, randomBytes } from "node:crypto";

/** Used when MINOR_AGE_THRESHOLD is unset or unusable. */
export const DEFAULT_MINOR_AGE_THRESHOLD = 16;

/** Sanity bounds. Outside these the value is a mistake, not a jurisdiction. */
const MIN_ALLOWED_THRESHOLD = 0;
const MAX_ALLOWED_THRESHOLD = 21;

let warnedAboutThreshold = false;

/**
 * The age of digital consent this deployment enforces.
 *
 * Read from `process.env` on every call rather than frozen at import: the value
 * is consulted a handful of times per signup, and reading it live is what lets
 * a spec prove the threshold really is configurable instead of asserting
 * against a constant it also imported.
 *
 * A malformed value falls back to the default and warns ONCE. It deliberately
 * does not exit the process: an operator fat-fingering an env var should not be
 * able to take the whole API down, and the fallback is the strictest common
 * value in the GDPR range anyway.
 */
export function minorAgeThreshold(): number {
  const raw = process.env.MINOR_AGE_THRESHOLD;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MINOR_AGE_THRESHOLD;

  const parsed = Number(raw.trim());
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_ALLOWED_THRESHOLD ||
    parsed > MAX_ALLOWED_THRESHOLD
  ) {
    if (!warnedAboutThreshold) {
      warnedAboutThreshold = true;
      console.warn(
        `⚠️  MINOR_AGE_THRESHOLD="${raw}" is not a whole number between ` +
          `${MIN_ALLOWED_THRESHOLD} and ${MAX_ALLOWED_THRESHOLD}. ` +
          `Falling back to ${DEFAULT_MINOR_AGE_THRESHOLD}.`,
      );
    }
    return DEFAULT_MINOR_AGE_THRESHOLD;
  }
  return parsed;
}

/** Test seam: forget that a bad value was already reported. */
export function resetThresholdWarning(): void {
  warnedAboutThreshold = false;
}

/**
 * How long a consent link stays usable.
 *
 * Far longer than the 1-hour password-reset window on purpose. A reset link is
 * clicked by someone sitting at the screen who just asked for it; a consent
 * link is sent to a parent who was not at the keyboard, may be in another
 * country, and may not open personal email for a week. An hour would turn the
 * common case into a dead account.
 */
export const GUARDIAN_CONSENT_TTL_DAYS = 30;

// KNOWN GAP, deliberately left open rather than half-built: there is no
// self-service way to re-issue a consent link. If the 30 days lapse, the
// account is stuck — signing up again is refused (the email is registered) and
// nothing else mints a new token. The fix is a "resend to guardian" endpoint,
// which needs its own rate limiting and its own thinking about who is allowed
// to trigger a fresh email to a third party. Until then an operator has to
// intervene, and the consent page says so instead of pretending otherwise.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** True when the link is past its window, or was never actually sent. */
export function consentLinkExpired(sentAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!sentAt) return true;
  return now.getTime() - sentAt.getTime() > GUARDIAN_CONSENT_TTL_DAYS * MS_PER_DAY;
}

/**
 * SHA-256 of a consent token, hex encoded.
 *
 * The database stores this digest, never the token itself. The token is a
 * bearer credential — whoever holds it can approve a child's account — so a
 * read of the users table must not hand anyone that power. Lookup still works:
 * hash what the caller presents and look up the digest, which is `@unique`.
 * (The digest is high-entropy, so there is nothing here for a rainbow table.)
 */
export function hashGuardianConsentToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Mint a fresh consent token. The caller emails `token` and stores `digest`.
 *
 * `token` must never be written to a response body, a log line, or the UI. If
 * it leaks, the gate is decoration.
 */
export function mintGuardianConsentToken(): { token: string; digest: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, digest: hashGuardianConsentToken(token) };
}

// ── Wording and status codes ────────────────────────────────────────────────

/**
 * 423 Locked, NOT 403.
 *
 * 403 is already this API's answer for "correct password, unverified email",
 * and the login screen keys its "send the link again" offer off it. A distinct
 * status is what lets the client tell a child waiting on a parent apart from a
 * typo'd password — the whole point of not answering "invalid credentials".
 */
export const GUARDIAN_CONSENT_PENDING_STATUS = 423;

/** Machine-readable discriminator, for clients that read the body. */
export const GUARDIAN_CONSENT_PENDING_CODE = "guardian_consent_pending";

export const GUARDIAN_CONSENT_PENDING_MESSAGE =
  "This account is waiting for your parent or guardian to approve it. " +
  "We've emailed them a link — you can sign in as soon as they confirm.";

/** One uniform failure for every bad-token case (unknown, expired, already used). */
export const GUARDIAN_CONSENT_INVALID_MESSAGE =
  "This approval link is invalid, has expired, or has already been used.";
