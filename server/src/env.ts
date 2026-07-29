import "dotenv/config";
import { z } from "zod";

/**
 * Centralised, validated environment configuration.
 * The process refuses to start with an invalid/insecure config in production.
 */

const INSECURE_JWT_DEFAULTS = new Set([
  "dev-only-insecure-secret-change-me",
  "change-me-to-a-long-random-string-in-production",
  "",
]);

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("1d"),
  APP_URL: z.string().url().default("http://localhost:5180"),
  GMAIL_USER: z.string().default(""),
  GMAIL_APP_PASSWORD: z.string().default(""),
  MAIL_FROM_NAME: z.string().default("TennisAI"),
  // Local-test escape hatch: set to "false" ONLY for a local trial with no
  // email provider, so accounts are usable without a verification round-trip.
  // Secure default is ON — anything other than the literal "false" enables it.
  REQUIRE_EMAIL_VERIFICATION: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

// A strong, non-default JWT secret is mandatory EVERYWHERE except explicit local
// dev/test — the default is publicly known and would let anyone forge tokens for
// any user. Only NODE_ENV exactly "development" or "test" may use a weak secret.
const allowWeakSecret = e.NODE_ENV === "development" || e.NODE_ENV === "test";
if (!allowWeakSecret && (INSECURE_JWT_DEFAULTS.has(e.JWT_SECRET) || e.JWT_SECRET.length < 32)) {
  console.error(
    "❌ JWT_SECRET is missing, insecure, or too short (need ≥32 chars, non-default).\n" +
      `   NODE_ENV=${e.NODE_ENV} requires a strong secret. Generate one with:\n` +
      "   node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
  );
  process.exit(1);
}

if (allowWeakSecret && INSECURE_JWT_DEFAULTS.has(e.JWT_SECRET)) {
  console.warn("⚠️  Using a development JWT secret — never deploy this to production.");
}

export const env = {
  nodeEnv: e.NODE_ENV,
  isProd,
  port: e.PORT,
  databaseUrl: e.DATABASE_URL,
  jwtSecret: e.JWT_SECRET,
  jwtExpiresIn: e.JWT_EXPIRES_IN,
  appUrl: e.APP_URL,
  gmailUser: e.GMAIL_USER,
  gmailAppPassword: e.GMAIL_APP_PASSWORD.replace(/\s+/g, ""),
  mailFromName: e.MAIL_FROM_NAME,
  requireEmailVerification: e.REQUIRE_EMAIL_VERIFICATION,
};

// Guard: disabling email verification in production is almost never intended.
if (isProd && !env.requireEmailVerification) {
  console.warn(
    "⚠️  REQUIRE_EMAIL_VERIFICATION is OFF in production — accounts can log in " +
      "without proving email ownership. Only do this intentionally.",
  );
}

/** Real Gmail sending only happens when both credentials are present. */
export const emailEnabled = Boolean(env.gmailUser && env.gmailAppPassword);
