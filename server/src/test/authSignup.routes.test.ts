// ============================================================================
// HTTP route tests — POST /api/auth/signup (privilege-escalation guard only)
//
// SCOPE NOTE: `src/auth/routes.ts` is owned by another workstream right now, so
// this spec deliberately touches ONE existing behaviour — that a public signup
// cannot self-assign a privileged role — plus the server-side pinning of fields
// a client must never control (publicId, passwordHash). The password-reset
// endpoints being added there are intentionally NOT covered here.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

// Email is a fire-and-forget side effect; stub the whole module so no transport
// is touched. Auto-vivifying so an added export in that (concurrently edited)
// module does not break this spec.
vi.mock("../email/mailer", () => {
  const stubs: Record<string, unknown> = {};
  // `then` MUST stay undefined: the module namespace is awaited during import,
  // and a thenable namespace would hang the import forever.
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
  email: "New.User@Example.COM",
  password: "correct-horse-battery",
  firstName: "New",
  lastName: "User",
  role: "player",
  ageConfirmed: true,
  termsAccepted: true,
};

function createdUserFrom(data: Record<string, unknown>) {
  return {
    id: "u-new",
    email: data.email,
    publicId: data.publicId,
    passwordHash: data.passwordHash,
    role: data.role,
    firstName: data.firstName,
    lastName: data.lastName,
    emailVerified: data.emailVerified ?? false,
    onboarding: null,
    onboardingCompletedAt: null,
    termsAcceptedAt: data.termsAcceptedAt ?? null,
    ageConfirmedAt: data.ageConfirmedAt ?? null,
    passwordChangedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve(createdUserFrom(args.data)),
  );
});

describe("POST /api/auth/signup — privilege escalation", () => {
  it('400s role:"admin" and creates NO account', async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ ...validSignup, role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request data");
    expect(db.user.create).not.toHaveBeenCalled();
    // Rejected by validation — the route never even checks for an existing email.
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("400s any other unknown/privileged role value", async () => {
    for (const role of ["superadmin", "ADMIN", "root", "", null]) {
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ ...validSignup, role });
      expect(res.status).toBe(400);
    }
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("accepts the three public roles (control: the 400 above is about the role, not the fixture)", async () => {
    for (const role of ["player", "coach", "observer"]) {
      db.user.create.mockClear();
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ ...validSignup, email: `${role}@example.com`, role });
      expect(res.status).toBe(201);
      expect(firstCallArg<{ data: { role: string } }>(db.user.create).data.role).toBe(role);
    }
  });
});

describe("POST /api/auth/signup — server-controlled fields", () => {
  it("hashes the password, normalises the email, and ignores client-supplied publicId/passwordHash", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      // Hostile extras: a forged admin publicId and a pre-baked hash.
      .send({ ...validSignup, publicId: "TAI-A-000001", passwordHash: "not-a-real-hash" });

    expect(res.status).toBe(201);
    const data = firstCallArg<{ data: Record<string, string> }>(db.user.create).data;
    expect(data.email).toBe("new.user@example.com"); // trimmed + lowercased
    expect(data.publicId).not.toBe("TAI-A-000001");
    expect(data.publicId).toMatch(/^TAI-P-/); // role letter follows the ROLE, not the client
    expect(data.passwordHash).not.toBe("not-a-real-hash");
    expect(data.passwordHash).not.toBe(validSignup.password);
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/); // real bcrypt digest
  });

  it("never returns the password hash to the client", async () => {
    const res = await request(app).post("/api/auth/signup").send(validSignup);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain(validSignup.password);
  });
});

describe("POST /api/auth/signup — validation", () => {
  it("400s a missing/false age confirmation and a missing/false terms acceptance", async () => {
    const cases = [
      { ...validSignup, ageConfirmed: undefined },
      { ...validSignup, ageConfirmed: false },
      { ...validSignup, termsAccepted: undefined },
      { ...validSignup, termsAccepted: false },
    ];
    for (const body of cases) {
      const res = await request(app).post("/api/auth/signup").send(body);
      expect(res.status).toBe(400);
    }
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("400s a short password and a malformed email", async () => {
    const short = await request(app)
      .post("/api/auth/signup")
      .send({ ...validSignup, password: "short" });
    expect(short.status).toBe(400);

    const badEmail = await request(app)
      .post("/api/auth/signup")
      .send({ ...validSignup, email: "not-an-email" });
    expect(badEmail.status).toBe(400);

    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("400s an email with surrounding whitespace (validated BEFORE it is trimmed)", async () => {
    // Documented behaviour, not a security issue: `z.string().email()` runs on the
    // raw value and the route trims only afterwards, so " a@b.com" is a 400. Worth
    // knowing because mobile keyboards routinely append a trailing space.
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ ...validSignup, email: `${validSignup.email} ` });

    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("409s a duplicate email without creating a second account", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u-existing", email: "new.user@example.com" });

    const res = await request(app).post("/api/auth/signup").send(validSignup);

    expect(res.status).toBe(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
