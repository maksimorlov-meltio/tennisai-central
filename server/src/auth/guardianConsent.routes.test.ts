// ============================================================================
// HTTP route tests — guardian consent for under-age signups.
//
// WHAT THIS PINS
//   • at or above the age of digital consent, signup behaves exactly as before;
//   • below it, the account is created but INERT — login is refused with a
//     distinct status/code, never "invalid email or password";
//   • a valid consent link unblocks login; unknown / expired / reused links do
//     not, and all three fail identically;
//   • the consent token NEVER appears in a response body, in any shape —
//     neither the raw token nor the digest that is stored for it;
//   • the threshold really is read from MINOR_AGE_THRESHOLD.
//
// ENV IS PINNED, NOT INHERITED (this has broken CI here before): server/.env
// sets REQUIRE_EMAIL_VERIFICATION=false locally while CI has no .env and gets
// the secure default — under which signup 503s outright when no transport
// exists, before any of this runs. Both flags are therefore fixed below.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

vi.mock("../db", async () => ({ prisma: (await import("../test/harness")).createPrismaMock() }));

// Mail CONFIGURED, verification OFF. The mail-off half of the matrix lives in
// guardianConsentNoMail.routes.test.ts, which needs the opposite pinning and so
// needs its own module registry.
vi.mock("../env", async () => {
  const actual = await vi.importActual<typeof import("../env")>("../env");
  return {
    ...actual,
    env: { ...actual.env, requireEmailVerification: false, appUrl: "https://tennis.example" },
    emailEnabled: true,
    mailTransport: "smtp" as const,
  };
});

vi.mock("../email/mailer", () => ({
  sendWelcomeEmail: vi.fn(async () => ({ sent: true })),
  sendVerificationEmail: vi.fn(async () => ({ sent: true })),
  sendPasswordResetEmail: vi.fn(async () => ({ sent: true })),
  sendNotificationEmail: vi.fn(async () => ({ sent: true })),
}));

import { prisma } from "../db";
import { authRouter } from "./routes";
import { sendNotificationEmail } from "../email/mailer";
import { createTestApp, prismaMockFrom, firstCallArg, bearer, asMock } from "../test/harness";
import { ageFromIsoDate, todayUtc } from "./age";
import {
  hashGuardianConsentToken,
  GUARDIAN_CONSENT_PENDING_CODE,
  GUARDIAN_CONSENT_PENDING_MESSAGE,
  GUARDIAN_CONSENT_PENDING_STATUS,
  GUARDIAN_CONSENT_INVALID_MESSAGE,
  GUARDIAN_CONSENT_TTL_DAYS,
  DEFAULT_MINOR_AGE_THRESHOLD,
} from "./guardianConsent";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/auth", authRouter]]);

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A date of birth that makes someone exactly `years` old today (UTC), shifted
 * by `dayOffset` days. Offset +1 puts the birthday tomorrow, i.e. one year
 * younger. Every fixture is checked against `ageFromIsoDate` before use, so a
 * month/leap-year edge in the construction cannot silently mis-age a test.
 */
function dobForAge(years: number, dayOffset = 0): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + dayOffset),
  );
  return d.toISOString().slice(0, 10);
}

function expectAge(dateOfBirth: string, years: number): string {
  expect(ageFromIsoDate(dateOfBirth, todayUtc()), `fixture ${dateOfBirth}`).toBe(years);
  return dateOfBirth;
}

const baseSignup = {
  email: "junior@example.com",
  password: "correct-horse-battery",
  firstName: "Juana",
  lastName: "Ramirez",
  role: "player",
  termsAccepted: true,
};

const guardian = { guardianName: "Marta Ramirez", guardianEmail: "Marta@Example.com" };

const PASSWORD = "correct-horse-battery";
// Cheap cost: these fixtures only have to COMPARE, and cost 12 would add a
// second per login test for nothing.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    email: "junior@example.com",
    publicId: "TAI-P-000001",
    passwordHash: PASSWORD_HASH,
    role: "player",
    firstName: "Juana",
    lastName: "Ramirez",
    emailVerified: true,
    onboarding: null,
    onboardingCompletedAt: null,
    termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
    ageConfirmedAt: null,
    dateOfBirth: "2012-01-01",
    guardianConsentRequired: false,
    guardianEmail: null,
    guardianName: null,
    guardianConsentAt: null,
    guardianConsentToken: null,
    guardianConsentSentAt: null,
    passwordChangedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createdUserFrom(data: Record<string, unknown>) {
  return userRow({
    email: data.email,
    publicId: data.publicId,
    passwordHash: data.passwordHash,
    role: data.role,
    firstName: data.firstName,
    lastName: data.lastName,
    emailVerified: data.emailVerified ?? false,
    termsAcceptedAt: data.termsAcceptedAt ?? null,
    ageConfirmedAt: data.ageConfirmedAt ?? null,
    dateOfBirth: data.dateOfBirth ?? null,
    guardianConsentRequired: data.guardianConsentRequired ?? false,
    guardianEmail: data.guardianEmail ?? null,
    guardianName: data.guardianName ?? null,
    guardianConsentToken: data.guardianConsentToken ?? null,
    guardianConsentSentAt: data.guardianConsentSentAt ?? null,
  });
}

/** The raw token out of the link the guardian was emailed. */
function tokenFromGuardianEmail(): string {
  const call = asMock(sendNotificationEmail).mock.calls[0];
  if (!call) throw new Error("expected a guardian consent email to have been sent");
  const linkUrl = (call[0] as { linkUrl?: string }).linkUrl ?? "";
  const token = new URL(linkUrl).searchParams.get("token");
  if (!token) throw new Error(`no token in guardian link: ${linkUrl}`);
  return token;
}

const ORIGINAL_THRESHOLD_ENV = process.env.MINOR_AGE_THRESHOLD;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MINOR_AGE_THRESHOLD;
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve(createdUserFrom(args.data)),
  );
  db.user.update.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve(userRow(args.data)),
  );
});

afterEach(() => {
  if (ORIGINAL_THRESHOLD_ENV === undefined) delete process.env.MINOR_AGE_THRESHOLD;
  else process.env.MINOR_AGE_THRESHOLD = ORIGINAL_THRESHOLD_ENV;
});

// ── At or above the threshold: nothing changes ──────────────────────────────

describe("signup at or above the age of digital consent", () => {
  it("creates an ordinary, immediately usable account from a date of birth", async () => {
    const dateOfBirth = expectAge(dobForAge(24), 24);
    const res = await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth });

    expect(res.status).toBe(201);
    const data = firstCallArg<{ data: Record<string, unknown> }>(db.user.create).data;
    expect(data.guardianConsentRequired).toBeUndefined();
    expect(data.guardianConsentToken).toBeUndefined();
    expect(data.dateOfBirth).toBe(dateOfBirth);
    expect(data.ageConfirmedAt).toBeInstanceOf(Date);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("treats the threshold birthday ITSELF as old enough (>=, not >)", async () => {
    const dateOfBirth = expectAge(dobForAge(DEFAULT_MINOR_AGE_THRESHOLD), DEFAULT_MINOR_AGE_THRESHOLD);
    const res = await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth });

    expect(res.status).toBe(201);
    expect(
      firstCallArg<{ data: Record<string, unknown> }>(db.user.create).data.guardianConsentRequired,
    ).toBeUndefined();
  });

  it("still accepts a legacy client that sends only the age checkbox", async () => {
    // No dateOfBirth at all — the pre-existing contract, unchanged.
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ ...baseSignup, ageConfirmed: true });

    expect(res.status).toBe(201);
    expect(
      firstCallArg<{ data: Record<string, unknown> }>(db.user.create).data.guardianConsentRequired,
    ).toBeUndefined();
  });

  it("still 400s a legacy client that ticks nothing", async () => {
    for (const ageConfirmed of [undefined, false]) {
      db.user.create.mockClear();
      const res = await request(app).post("/api/auth/signup").send({ ...baseSignup, ageConfirmed });
      expect(res.status).toBe(400);
      expect(db.user.create).not.toHaveBeenCalled();
    }
  });

  it("400s a date of birth that is not a real date, and creates nothing", async () => {
    for (const dateOfBirth of ["2025-02-29", "not-a-date", "01/02/2010", "2999-01-01"]) {
      db.user.create.mockClear();
      const res = await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth });
      expect(res.status).toBe(400);
      expect(db.user.create).not.toHaveBeenCalled();
    }
  });
});

// ── Below the threshold ─────────────────────────────────────────────────────

describe("signup below the age of digital consent", () => {
  it("refuses without a guardian, and says what is missing rather than 'you are too young'", async () => {
    const dateOfBirth = expectAge(dobForAge(14), 14);
    const res = await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/parent or guardian/i);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("refuses a guardian address equal to the applicant's own", async () => {
    const dateOfBirth = expectAge(dobForAge(14), 14);
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        ...baseSignup,
        dateOfBirth,
        guardianName: "Myself",
        // Same mailbox, different case — normalisation must not let it through.
        guardianEmail: "JUNIOR@example.com",
      });

    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("creates a consent-required account and emails the guardian a link", async () => {
    const dateOfBirth = expectAge(dobForAge(14), 14);
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ ...baseSignup, dateOfBirth, ...guardian });

    expect(res.status).toBe(201);
    const data = firstCallArg<{ data: Record<string, unknown> }>(db.user.create).data;
    expect(data.guardianConsentRequired).toBe(true);
    expect(data.guardianName).toBe("Marta Ramirez");
    expect(data.guardianEmail).toBe("marta@example.com"); // normalised
    expect(data.guardianConsentSentAt).toBeInstanceOf(Date);
    // A minor is not confirming they meet the minimum age — their guardian is
    // consenting on their behalf.
    expect(data.ageConfirmedAt).toBeNull();

    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    const mail = asMock(sendNotificationEmail).mock.calls[0][0] as Record<string, string>;
    expect(mail.to).toBe("marta@example.com");
    expect(mail.linkUrl).toContain("https://tennis.example/guardian-consent?token=");
  });

  it("stores only the DIGEST of the token that was emailed", async () => {
    const dateOfBirth = expectAge(dobForAge(14), 14);
    await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth, ...guardian });

    const stored = firstCallArg<{ data: Record<string, string> }>(db.user.create).data
      .guardianConsentToken;
    const emailed = tokenFromGuardianEmail();

    expect(stored).not.toBe(emailed);
    expect(stored).toBe(hashGuardianConsentToken(emailed));
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it("NEVER puts the token — raw or hashed — in the signup response", async () => {
    const dateOfBirth = expectAge(dobForAge(14), 14);
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ ...baseSignup, dateOfBirth, ...guardian });

    const emailed = tokenFromGuardianEmail();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(emailed);
    expect(body).not.toContain(hashGuardianConsentToken(emailed));
    expect(body).not.toContain("guardianConsentToken");
    expect(res.body.data.user).not.toHaveProperty("guardianConsentToken");
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
  });
});

// ── The threshold is configuration, not a constant ──────────────────────────

describe("MINOR_AGE_THRESHOLD", () => {
  it("lets a 15-year-old through unaided where the age of consent is 14 (Spain)", async () => {
    process.env.MINOR_AGE_THRESHOLD = "14";
    const dateOfBirth = expectAge(dobForAge(15), 15);

    const res = await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth });

    expect(res.status).toBe(201);
    expect(
      firstCallArg<{ data: Record<string, unknown> }>(db.user.create).data.guardianConsentRequired,
    ).toBeUndefined();
  });

  it("demands a guardian for the SAME 15-year-old where it is 16 (Germany)", async () => {
    process.env.MINOR_AGE_THRESHOLD = "16";
    const dateOfBirth = expectAge(dobForAge(15), 15);

    const res = await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/under 16/);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("falls back to the default rather than dying on a nonsense value", async () => {
    process.env.MINOR_AGE_THRESHOLD = "sixteen";
    const dateOfBirth = expectAge(dobForAge(15), 15);

    const res = await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth });

    // 15 < the default 16, so a guardian is still required.
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(new RegExp(`under ${DEFAULT_MINOR_AGE_THRESHOLD}`));
  });

  it("publishes the effective threshold and password rule for the sign-up form", async () => {
    process.env.MINOR_AGE_THRESHOLD = "13";
    const res = await request(app).get("/api/auth/signup-policy");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ minorAgeThreshold: 13, passwordMinLength: 8 });
  });
});

// ── The gate: login and /me ─────────────────────────────────────────────────

describe("login while consent is pending", () => {
  const pending = userRow({ guardianConsentRequired: true, guardianConsentAt: null });

  it("refuses with a DISTINCT status and code — never 'invalid email or password'", async () => {
    db.user.findUnique.mockResolvedValue(pending);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: pending.email, password: PASSWORD });

    expect(res.status).toBe(GUARDIAN_CONSENT_PENDING_STATUS);
    expect(res.status).not.toBe(401);
    expect(res.body.code).toBe(GUARDIAN_CONSENT_PENDING_CODE);
    expect(res.body.message).toBe(GUARDIAN_CONSENT_PENDING_MESSAGE);
    expect(res.body.message).not.toMatch(/invalid/i);
    expect(res.body.message).toMatch(/parent or guardian/i);
    // Refused means refused: no session comes back with the explanation.
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("accessToken");
  });

  it("still answers the UNIFORM 401 for a wrong password on a pending account", async () => {
    // Proves the gate runs AFTER the password check. Reversed, the endpoint
    // would tell anyone with an email address which accounts belong to children.
    db.user.findUnique.mockResolvedValue(pending);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: pending.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
    expect(res.body.code).toBeUndefined();
  });

  it("issues a session once consent is recorded", async () => {
    db.user.findUnique.mockResolvedValue(
      userRow({
        guardianConsentRequired: true,
        guardianConsentAt: new Date("2026-02-02T10:00:00.000Z"),
      }),
    );

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "junior@example.com", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    // The flag stays set — it records that this account was created for a
    // minor, which never stops being true.
    expect(res.body.data.user.guardianConsentRequired).toBe(true);
    expect(res.body.data.user).not.toHaveProperty("guardianConsentToken");
  });

  it("refuses GET /me for a pending account, so no other session path lets one in", async () => {
    db.user.findUnique.mockResolvedValue(pending);

    const res = await request(app).get("/api/auth/me").set("Authorization", bearer("u-1"));

    expect(res.status).toBe(GUARDIAN_CONSENT_PENDING_STATUS);
    expect(res.body.code).toBe(GUARDIAN_CONSENT_PENDING_CODE);
    expect(res.body.data).toBeUndefined();
  });

  it("serves GET /me normally once consent is recorded", async () => {
    db.user.findUnique.mockResolvedValue(
      userRow({ guardianConsentRequired: true, guardianConsentAt: new Date() }),
    );

    const res = await request(app).get("/api/auth/me").set("Authorization", bearer("u-1"));

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("junior@example.com");
    expect(res.body.data).not.toHaveProperty("guardianConsentToken");
  });
});

// ── Consuming the consent link ──────────────────────────────────────────────

describe("POST /api/auth/guardian-consent", () => {
  const RAW = "a-token-that-was-emailed-to-a-guardian";
  const DIGEST = hashGuardianConsentToken(RAW);

  /** Answer findUnique only for the digest this test expects. */
  function respondToDigest(row: Record<string, unknown> | null) {
    db.user.findUnique.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve(args.where.guardianConsentToken === DIGEST ? row : null),
    );
  }

  it("records consent, burns the token, and says what was approved", async () => {
    respondToDigest(
      userRow({
        guardianConsentRequired: true,
        guardianConsentToken: DIGEST,
        guardianConsentSentAt: new Date(),
      }),
    );

    const res = await request(app).post("/api/auth/guardian-consent").send({ token: RAW });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ childFirstName: "Juana", accountRole: "player" });

    // Looked up by the DIGEST, never by the raw token.
    expect(firstCallArg<{ where: Record<string, string> }>(db.user.findUnique).where).toEqual({
      guardianConsentToken: DIGEST,
    });
    const update = firstCallArg<{ data: Record<string, unknown> }>(db.user.update).data;
    expect(update.guardianConsentAt).toBeInstanceOf(Date);
    // SINGLE USE: the stored digest is cleared, so the link cannot be replayed
    // out of a forwarded email.
    expect(update.guardianConsentToken).toBeNull();
    // The gate flag itself is deliberately left alone.
    expect(update.guardianConsentRequired).toBeUndefined();
  });

  it("never echoes the token back", async () => {
    respondToDigest(
      userRow({
        guardianConsentRequired: true,
        guardianConsentToken: DIGEST,
        guardianConsentSentAt: new Date(),
      }),
    );

    const res = await request(app).post("/api/auth/guardian-consent").send({ token: RAW });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(RAW);
    expect(body).not.toContain(DIGEST);
  });

  it("rejects an unknown token", async () => {
    respondToDigest(null);

    const res = await request(app).post("/api/auth/guardian-consent").send({ token: "made-up" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(GUARDIAN_CONSENT_INVALID_MESSAGE);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects a missing/blank token without touching the database", async () => {
    for (const body of [{}, { token: "" }, { token: 42 }]) {
      db.user.findUnique.mockClear();
      const res = await request(app).post("/api/auth/guardian-consent").send(body);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(GUARDIAN_CONSENT_INVALID_MESSAGE);
      expect(db.user.findUnique).not.toHaveBeenCalled();
    }
  });

  it("rejects an EXPIRED link with the same wording, and burns it", async () => {
    const sentAt = new Date(Date.now() - (GUARDIAN_CONSENT_TTL_DAYS + 1) * 24 * 60 * 60 * 1000);
    respondToDigest(
      userRow({ guardianConsentRequired: true, guardianConsentToken: DIGEST, guardianConsentSentAt: sentAt }),
    );

    const res = await request(app).post("/api/auth/guardian-consent").send({ token: RAW });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(GUARDIAN_CONSENT_INVALID_MESSAGE);
    // Consent was NOT recorded — only the dead token was cleared.
    const update = firstCallArg<{ data: Record<string, unknown> }>(db.user.update).data;
    expect(update).toEqual({ guardianConsentToken: null });
  });

  it("accepts a link on the last day of its window", async () => {
    const sentAt = new Date(Date.now() - (GUARDIAN_CONSENT_TTL_DAYS - 1) * 24 * 60 * 60 * 1000);
    respondToDigest(
      userRow({ guardianConsentRequired: true, guardianConsentToken: DIGEST, guardianConsentSentAt: sentAt }),
    );

    const res = await request(app).post("/api/auth/guardian-consent").send({ token: RAW });
    expect(res.status).toBe(200);
  });

  it("rejects a REUSED link — the second click finds nothing to approve", async () => {
    respondToDigest(
      userRow({
        guardianConsentRequired: true,
        guardianConsentToken: DIGEST,
        guardianConsentSentAt: new Date(),
      }),
    );
    const first = await request(app).post("/api/auth/guardian-consent").send({ token: RAW });
    expect(first.status).toBe(200);

    // The row as it now stands: consent recorded, digest cleared. Nothing
    // matches that token any more.
    respondToDigest(null);
    const second = await request(app).post("/api/auth/guardian-consent").send({ token: RAW });

    expect(second.status).toBe(400);
    expect(second.body.message).toBe(GUARDIAN_CONSENT_INVALID_MESSAGE);
  });

  it("full round trip: signed-up minor is refused, consents, then signs in", async () => {
    const dateOfBirth = expectAge(dobForAge(14), 14);
    await request(app).post("/api/auth/signup").send({ ...baseSignup, dateOfBirth, ...guardian });
    const emailed = tokenFromGuardianEmail();
    const digest = hashGuardianConsentToken(emailed);

    // Before: locked.
    db.user.findUnique.mockResolvedValue(
      userRow({ guardianConsentRequired: true, guardianConsentToken: digest }),
    );
    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ email: "junior@example.com", password: PASSWORD });
    expect(blocked.status).toBe(GUARDIAN_CONSENT_PENDING_STATUS);

    // The guardian clicks the link from their email.
    db.user.findUnique.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve(
        args.where.guardianConsentToken === digest
          ? userRow({
              guardianConsentRequired: true,
              guardianConsentToken: digest,
              guardianConsentSentAt: new Date(),
            })
          : null,
      ),
    );
    const consented = await request(app).post("/api/auth/guardian-consent").send({ token: emailed });
    expect(consented.status).toBe(200);

    // After: in.
    db.user.findUnique.mockResolvedValue(
      userRow({ guardianConsentRequired: true, guardianConsentAt: new Date() }),
    );
    const allowed = await request(app)
      .post("/api/auth/login")
      .send({ email: "junior@example.com", password: PASSWORD });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.tokens.accessToken).toEqual(expect.any(String));
  });
});
