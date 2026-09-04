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

/**
 * Treats a blank value as "not set".
 *
 * .env.example ships these keys as `AI_PROVIDER=""` so they are discoverable.
 * Without this, copying the example to .env would hand zod an empty string,
 * fail the enum, and refuse to boot — a copied example must never brick the
 * server.
 */
const blankAsUnset = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema);

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
  // Any SMTP provider, as an alternative to Gmail. Gmail needs 2-Step
  // Verification switched on before it will issue an app password, which is a
  // Google-account change some operators can't or won't make; a provider like
  // Resend, Brevo or Mailgun hands over SMTP credentials immediately.
  //
  // Gmail wins if both are configured — it was here first and is the
  // documented default. SMTP_HOST alone is enough (some relays authenticate by
  // IP), so the pair below is optional.
  SMTP_HOST: blankAsUnset(z.string().min(1).optional()),
  SMTP_PORT: blankAsUnset(z.coerce.number().int().positive().default(587)),
  // Implicit TLS (port 465). Port 587 upgrades with STARTTLS and wants `false`.
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  // Envelope sender for SMTP. Providers reject mail from an address the domain
  // has not authorised, so this cannot be guessed — it must be set alongside
  // SMTP_HOST. Ignored on the Gmail path, which must send as the account.
  MAIL_FROM: blankAsUnset(z.string().email().optional()),
  // Local-test escape hatch: set to "false" ONLY for a local trial with no
  // email provider, so accounts are usable without a verification round-trip.
  // Secure default is ON — anything other than the literal "false" enables it.
  REQUIRE_EMAIL_VERIFICATION: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
  // Optional live tournament-feed provider (see src/tournaments/feed/). Both must
  // be set to activate the HTTP provider; otherwise the curated static snapshot is
  // used. FEED_API_KEY is a server-side secret and is NEVER sent to the client.
  // Undefined when unset — missing values do NOT stop the process.
  FEED_API_URL: z.string().url().optional(),
  FEED_API_KEY: z.string().min(1).optional(),
  // Shared secret for the machine-to-machine calendar ingest (POST
  // /api/feed/tournaments), used by the CI scrapers that collect the calendars
  // needing a real browser. Unset = that endpoint is switched off entirely,
  // which is the right default: an ingest nobody uses should not be reachable.
  // SERVER-SIDE SECRET — never sent to a browser.
  FEED_PUSH_TOKEN: blankAsUnset(z.string().min(24, "FEED_PUSH_TOKEN must be at least 24 characters").optional()),
  // Hour (UTC) of the daily calendar refresh. 4 = 04:00 UTC, chosen to sit well
  // away from the 03:17 database backup.
  FEED_REFRESH_HOUR_UTC: blankAsUnset(z.coerce.number().int().min(0).max(23).default(4)),
  // Web-Push (VAPID) keys. Push self-disables when these are unset, so email and
  // in-app notifications keep working. Generate with:
  //   npx web-push generate-vapid-keys
  // VAPID_PRIVATE_KEY is a server-side SECRET — only the public key may reach the
  // browser. VAPID_SUBJECT is a contact URL/mailto the push service can use.
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
  // Optional LLM provider, used only by the training-advice feature (src/ai/).
  // BOTH AI_PROVIDER and AI_API_KEY must be set to switch it on; anything less
  // counts as OFF and the endpoint reports itself unavailable rather than
  // inventing advice. AI_API_KEY is a server-side SECRET — it is never
  // returned by any endpoint and never reaches the browser.
  // Optional hard cap on self-service signups, for a closed beta. Counts
  // existing accounts in the publicly-registerable roles; unset = no cap.
  //
  // `coerce` is wrapped in blankAsUnset because a bare coerce turns "" into 0 —
  // a copied example env would silently become "closed" rather than "no cap".
  //
  // 0 is ALLOWED and means "accept nobody new": that is the obvious way to
  // pause registration, and rejecting it would make the server exit at boot —
  // an operator reaching for the pause button would take the API down instead.
  MAX_SIGNUPS: blankAsUnset(z.coerce.number().int().min(0).optional()),
  AI_PROVIDER: blankAsUnset(z.enum(["anthropic", "openai"]).optional()),
  AI_API_KEY: blankAsUnset(z.string().min(1).optional()),
  AI_MODEL: blankAsUnset(z.string().min(1).optional()),
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
  // Generic SMTP alternative to Gmail. Credentials are server-side secrets.
  smtpHost: e.SMTP_HOST,
  smtpPort: e.SMTP_PORT,
  smtpSecure: e.SMTP_SECURE,
  smtpUser: e.SMTP_USER,
  smtpPassword: e.SMTP_PASSWORD,
  mailFrom: e.MAIL_FROM,
  requireEmailVerification: e.REQUIRE_EMAIL_VERIFICATION,
  // Optional live-feed config (undefined unless explicitly set). Server-side only.
  feedApiUrl: e.FEED_API_URL,
  feedApiKey: e.FEED_API_KEY,
  feedPushToken: e.FEED_PUSH_TOKEN,
  feedRefreshHourUtc: e.FEED_REFRESH_HOUR_UTC,
  // Optional Web-Push config (undefined = push disabled). Private key is server-side only.
  vapidPublicKey: e.VAPID_PUBLIC_KEY,
  vapidPrivateKey: e.VAPID_PRIVATE_KEY,
  vapidSubject: e.VAPID_SUBJECT,
  /** Undefined = unlimited signups. */
  maxSignups: e.MAX_SIGNUPS,
  // Optional LLM config (undefined = training advice disabled). Server-side only.
  aiProvider: e.AI_PROVIDER,
  aiApiKey: e.AI_API_KEY,
  aiModel: e.AI_MODEL,
};

// Guard: disabling email verification in production is almost never intended.
if (isProd && !env.requireEmailVerification) {
  console.warn(
    "⚠️  REQUIRE_EMAIL_VERIFICATION is OFF in production — accounts can log in " +
      "without proving email ownership. Only do this intentionally.",
  );
}

/**
 * Which transport will actually carry mail, or null when none is configured.
 * Gmail wins when both are set: it is the documented default here.
 */
export const mailTransport: "gmail" | "smtp" | null = env.gmailUser && env.gmailAppPassword
  ? "gmail"
  : env.smtpHost
    ? "smtp"
    : null;

/** Whether any real mail can leave this process. */
export const emailEnabled = mailTransport !== null;

// The combination that silently traps every new account: verification is
// demanded, but no transport exists to deliver the link. Signup refuses while
// this holds (see auth/routes.ts) rather than minting accounts nobody can ever
// log into — but say so at boot, because the fix is one environment variable
// and the operator should not have to learn about it from a stuck user.
if (env.requireEmailVerification && !emailEnabled) {
  console.warn(
    "⚠️  REQUIRE_EMAIL_VERIFICATION is on but no mail transport is configured.\n" +
      "   Verification links cannot be delivered, so SIGNUP IS DISABLED until you\n" +
      "   set GMAIL_USER + GMAIL_APP_PASSWORD (or SMTP_HOST + MAIL_FROM), or set\n" +
      "   REQUIRE_EMAIL_VERIFICATION=false.",
  );
}
