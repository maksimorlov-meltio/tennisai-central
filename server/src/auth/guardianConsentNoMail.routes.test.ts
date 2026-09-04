// ============================================================================
// HTTP route tests — a minor signs up on a server that cannot send email.
//
// THE TEMPTING SHORTCUT THIS FORBIDS
// With no transport there is no way to get the consent link to a parent, so it
// is very tempting to return it in the response, or print it to the log, "just
// for development". Either would mean anyone who can read a signup response or
// a log file can approve any child's account — the gate would be decoration.
//
// The correct behaviour is duller: create the account, mark it consent-required,
// mint NOTHING, and let it wait.
//
// ENV IS PINNED (this pairing has broken CI here before): the mail-off state is
// only reachable with REQUIRE_EMAIL_VERIFICATION off as well, because signup
// 503s outright when verification is demanded and no transport exists. Locally
// server/.env sets that flag; CI has no .env and gets the secure default. Both
// are fixed here so the spec means the same thing in both places.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("../test/harness")).createPrismaMock() }));

vi.mock("../env", async () => {
  const actual = await vi.importActual<typeof import("../env")>("../env");
  return {
    ...actual,
    env: { ...actual.env, requireEmailVerification: false, appUrl: "https://tennis.example" },
    emailEnabled: false,
    mailTransport: null,
  };
});

vi.mock("../email/mailer", () => ({
  sendWelcomeEmail: vi.fn(async () => ({ sent: false })),
  sendVerificationEmail: vi.fn(async () => ({ sent: false })),
  sendPasswordResetEmail: vi.fn(async () => ({ sent: false })),
  sendNotificationEmail: vi.fn(async () => ({ sent: false })),
}));

import { prisma } from "../db";
import { authRouter } from "./routes";
import { sendNotificationEmail } from "../email/mailer";
import { createTestApp, prismaMockFrom, firstCallArg } from "../test/harness";
import { ageFromIsoDate, todayUtc } from "./age";
import { GUARDIAN_CONSENT_PENDING_STATUS } from "./guardianConsent";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/auth", authRouter]]);

/** A date of birth that makes someone exactly 14 today (UTC). */
function dobFor14(): string {
  const now = new Date();
  const iso = new Date(Date.UTC(now.getUTCFullYear() - 14, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
  expect(ageFromIsoDate(iso, todayUtc())).toBe(14);
  return iso;
}

const minorSignup = () => ({
  email: "junior@example.com",
  password: "correct-horse-battery",
  firstName: "Juana",
  lastName: "Ramirez",
  role: "player",
  termsAccepted: true,
  dateOfBirth: dobFor14(),
  guardianName: "Marta Ramirez",
  guardianEmail: "marta@example.com",
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: "u-1",
      publicId: args.data.publicId,
      email: args.data.email,
      passwordHash: args.data.passwordHash,
      role: args.data.role,
      firstName: args.data.firstName,
      lastName: args.data.lastName,
      emailVerified: true,
      guardianConsentRequired: args.data.guardianConsentRequired ?? false,
      guardianConsentAt: null,
      guardianConsentToken: args.data.guardianConsentToken ?? null,
      guardianConsentSentAt: args.data.guardianConsentSentAt ?? null,
      guardianEmail: args.data.guardianEmail ?? null,
      guardianName: args.data.guardianName ?? null,
      dateOfBirth: args.data.dateOfBirth ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
});

describe("a minor signs up with no mail transport configured", () => {
  it("creates the account, locked, and mints NO token at all", async () => {
    const res = await request(app).post("/api/auth/signup").send(minorSignup());

    expect(res.status).toBe(201);
    const data = firstCallArg<{ data: Record<string, unknown> }>(db.user.create).data;
    expect(data.guardianConsentRequired).toBe(true);
    expect(data.guardianName).toBe("Marta Ramirez");
    expect(data.guardianEmail).toBe("marta@example.com");
    // No token, and no "sent at" claiming a link went out when none did.
    expect(data.guardianConsentToken).toBeUndefined();
    expect(data.guardianConsentSentAt).toBeUndefined();
  });

  it("does not call the mailer at all — its no-transport branch LOGS the link", async () => {
    await request(app).post("/api/auth/signup").send(minorSignup());
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("says plainly that the account is waiting, without inventing a link", async () => {
    const res = await request(app).post("/api/auth/signup").send(minorSignup());

    expect(res.body.message).toMatch(/waiting for a parent or guardian/i);
    expect(res.body.message).toMatch(/cannot send email/i);
    expect(res.body.message).not.toContain("guardian-consent?token=");
    expect(JSON.stringify(res.body)).not.toContain("guardianConsentToken");
    expect(JSON.stringify(res.body)).not.toContain("/guardian-consent");
  });

  it("still refuses the login — an account nobody can approve waits, it does not open", async () => {
    const create = await request(app).post("/api/auth/signup").send(minorSignup());
    expect(create.status).toBe(201);

    db.user.findUnique.mockResolvedValue({
      id: "u-1",
      email: "junior@example.com",
      // A real bcrypt digest of the signup password, so the comparison in the
      // route genuinely succeeds and the refusal is the gate, not a bad password.
      passwordHash: (await import("bcryptjs")).default.hashSync("correct-horse-battery", 4),
      role: "player",
      firstName: "Juana",
      lastName: "Ramirez",
      emailVerified: true,
      guardianConsentRequired: true,
      guardianConsentAt: null,
      guardianConsentToken: null,
      guardianConsentSentAt: null,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "junior@example.com", password: "correct-horse-battery" });

    expect(res.status).toBe(GUARDIAN_CONSENT_PENDING_STATUS);
    expect(JSON.stringify(res.body)).not.toContain("accessToken");
  });
});
