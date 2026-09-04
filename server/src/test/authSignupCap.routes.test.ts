// ============================================================================
// HTTP route tests — POST /api/auth/signup, the closed-beta cap
//
// Signup is open (the invite gate was removed by request), so MAX_SIGNUPS is
// the only thing standing between a public URL and unbounded registration.
// These specs prove it holds, that it costs nothing when unset, and that a
// full beta creates no account.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

/** Mutable so each spec picks the cap. `undefined` = no cap configured. */
const cap = vi.hoisted(() => ({ value: undefined as number | undefined }));

// Everything in env stays real except the cap under test — and the mail state,
// which has to be pinned for the cap to be reachable at all.
//
// Signup refuses outright with a 503 when verification is demanded and no
// transport is configured, correctly: every account created in that state is
// permanently locked. That check runs first, so with mail unconfigured it
// answers every request below before the cap is ever consulted. It passed
// locally only because a developer's .env sets REQUIRE_EMAIL_VERIFICATION=false;
// CI has no .env and gets the secure default, which is where it surfaced.
vi.mock("../env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../env")>();
  return {
    ...actual,
    emailEnabled: true,
    mailTransport: "smtp" as const,
    env: {
      ...actual.env,
      get maxSignups() {
        return cap.value;
      },
    },
  };
});

// Email is a fire-and-forget side effect; stub the transport away.
vi.mock("../email/mailer", () => {
  const stubs: Record<string, unknown> = {};
  const passthrough = new Set(["then", "catch", "finally", "default", "__esModule", "constructor"]);
  return new Proxy(stubs, {
    get(target, prop) {
      if (typeof prop === "symbol" || passthrough.has(prop as string)) {
        return Reflect.get(target, prop);
      }
      if (!(prop in target)) target[prop as string] = vi.fn(async () => ({ sent: false }));
      return target[prop as string];
    },
  });
});

import { prisma } from "../db";
import { authRouter } from "../auth/routes";
import { createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/auth", authRouter]]);

const validSignup = {
  email: "beta.tester@example.com",
  password: "correct-horse-battery",
  firstName: "Beta",
  lastName: "Tester",
  role: "player",
  ageConfirmed: true,
  termsAccepted: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  cap.value = undefined;
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: "u-new",
      ...args.data,
      onboarding: null,
      onboardingCompletedAt: null,
      passwordChangedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  );
});

describe("POST /api/auth/signup — MAX_SIGNUPS", () => {
  it("allows the signup when the beta is under its cap", async () => {
    cap.value = 50;
    db.user.count.mockResolvedValue(49);

    const res = await request(app).post("/api/auth/signup").send(validSignup);

    expect(res.status).toBe(201);
    expect(db.user.create).toHaveBeenCalled();
  });

  it("403s at the cap and creates NO account", async () => {
    cap.value = 50;
    db.user.count.mockResolvedValue(50);

    const res = await request(app).post("/api/auth/signup").send(validSignup);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Beta is full — no more signups available.");
    expect(db.user.create).not.toHaveBeenCalled();
    // Refused before the email lookup, so a full beta costs one count and no
    // further database work.
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("403s when the count has somehow overshot the cap", async () => {
    cap.value = 50;
    db.user.count.mockResolvedValue(51);
    const res = await request(app).post("/api/auth/signup").send(validSignup);
    expect(res.status).toBe(403);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("counts only self-registerable roles, so an admin never consumes a seat", async () => {
    cap.value = 50;
    db.user.count.mockResolvedValue(1);

    await request(app).post("/api/auth/signup").send(validSignup);

    const where = firstCallArg(db.user.count).where as { role: { in: string[] } };
    expect(where.role.in).toEqual(expect.arrayContaining(["player", "coach", "observer"]));
    expect(where.role.in).not.toContain("admin");
  });

  it("treats a cap of 0 as 'registration paused', not as 'no cap'", async () => {
    // 0 is the obvious pause button. It must refuse rather than fall through
    // to unlimited, and the server must boot on it (see env.ts).
    cap.value = 0;
    db.user.count.mockResolvedValue(0);

    const res = await request(app).post("/api/auth/signup").send(validSignup);

    expect(res.status).toBe(403);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("does not count at all when no cap is configured", async () => {
    cap.value = undefined;

    const res = await request(app).post("/api/auth/signup").send(validSignup);

    expect(res.status).toBe(201);
    expect(db.user.count).not.toHaveBeenCalled();
  });

  it("still enforces the cap ahead of a duplicate-email conflict", async () => {
    // Order matters: a full beta must not leak whether an email is registered.
    cap.value = 10;
    db.user.count.mockResolvedValue(10);
    db.user.findUnique.mockResolvedValue({ id: "existing" });

    const res = await request(app).post("/api/auth/signup").send(validSignup);

    expect(res.status).toBe(403);
  });
});
