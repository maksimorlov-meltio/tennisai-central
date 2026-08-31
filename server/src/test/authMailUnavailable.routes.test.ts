// ============================================================================
// HTTP route tests — what auth does when the server cannot send email
//
// This is the state the production server was actually deployed in: email
// verification demanded, no mail transport configured. Every account created
// then was permanently locked (told to check an inbox nothing could reach, and
// refused at login forever), and /forgot-password cheerfully promised a link
// that was never sent.
//
// These specs pin the two behaviours that make that state survivable:
//   1. signup is refused outright rather than minting a locked account;
//   2. the password-reset and resend endpoints say so instead of promising mail.
//
// `emailEnabled` is read from the module at import time, so it is mocked here
// rather than driven through the environment.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

// Verification ON, and no way to deliver a verification link.
vi.mock("../env", async () => {
  const actual = await vi.importActual<typeof import("../env")>("../env");
  return {
    ...actual,
    env: { ...actual.env, requireEmailVerification: true },
    emailEnabled: false,
    mailTransport: null,
  };
});

import { prisma } from "../db";
import { authRouter } from "../auth/routes";
import { createTestApp, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/auth", authRouter]]);

const signupBody = {
  email: "new@example.com",
  password: "a-good-password",
  firstName: "New",
  lastName: "Person",
  role: "player",
  ageConfirmed: true,
  termsAccepted: true,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("signup when verification is required but no mail can be sent", () => {
  it("refuses with 503 rather than creating an account nobody can ever log into", async () => {
    const res = await request(app).post("/api/auth/signup").send(signupBody);

    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/temporarily unavailable/i);
  });

  it("writes nothing at all — not even a lookup for an existing account", async () => {
    await request(app).post("/api/auth/signup").send(signupBody);

    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("password reset when no mail can be sent", () => {
  it("says so, instead of claiming a link is on its way", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "someone@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cannot send email/i);
    expect(res.body.message).not.toMatch(/on its way/i);
    expect(res.body.data).toEqual({ emailConfigured: false });
  });

  it("never looks the address up, so the answer cannot vary by account", async () => {
    await request(app).post("/api/auth/forgot-password").send({ email: "someone@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "nobody@example.com" });

    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("answers identically for a registered and an unregistered address", async () => {
    const a = await request(app).post("/api/auth/forgot-password").send({ email: "real@example.com" });
    const b = await request(app).post("/api/auth/forgot-password").send({ email: "fake@example.com" });

    expect(a.body).toEqual(b.body);
  });
});

describe("resend verification when no mail can be sent", () => {
  it("says so rather than promising a new link", async () => {
    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "someone@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cannot send email/i);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
