import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

// Mock the shared Prisma client BEFORE importing the module under test so the
// authz helpers resolve against these fakes instead of a real database.
vi.mock("./db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    coachAssignment: { findUnique: vi.fn() },
    connectionRequest: { findFirst: vi.fn() },
    guardianship: { findUnique: vi.fn() },
    academyMembership: { findMany: vi.fn() },
  },
}));

import { prisma } from "./db";
import type { AuthedRequest } from "./http";
import {
  PUBLIC_SIGNUP_ROLES,
  requireRole,
  assertAssignedPlayer,
  assertGuardianOf,
  assertSameAcademy,
  assertCanActOnPlayer,
  type Role,
} from "./authz";

// The mocked delegate methods are plain vi.fn()s; this alias keeps the casts
// tidy and strict-TS-safe without leaking `any` into assertions.
type AnyMock = ReturnType<typeof vi.fn>;
const asMock = (fn: unknown): AnyMock => fn as unknown as AnyMock;

/** Run the requireRole middleware and resolve with whatever it passes to next(). */
function runRequireRole(roles: Role[], userId: string): Promise<unknown> {
  return new Promise((resolve) => {
    const mw = requireRole(...roles);
    const req = { userId } as AuthedRequest;
    const res = {} as Response;
    void mw(req, res, (err?: unknown) => resolve(err));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Regression guards for the privilege-self-assignment fix ──────────────────
describe("PUBLIC_SIGNUP_ROLES", () => {
  it("excludes admin — admins are provisioned by invite/seed only", () => {
    expect(PUBLIC_SIGNUP_ROLES).not.toContain("admin");
  });

  it("allows exactly player, coach, observer (parent)", () => {
    expect([...PUBLIC_SIGNUP_ROLES].sort()).toEqual(["coach", "observer", "player"]);
  });
});

// ── requireRole ──────────────────────────────────────────────────────────────
describe("requireRole", () => {
  it("calls next() with no error when the user's role is allowed", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue({ role: "coach" });
    const err = await runRequireRole(["coach"], "u1");
    expect(err).toBeUndefined();
  });

  it("calls next(403) when the user's role is not allowed", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue({ role: "player" });
    const err = await runRequireRole(["coach"], "u1");
    expect(err).toMatchObject({ status: 403 });
  });

  it("calls next(401) when the user row is gone", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(null);
    const err = await runRequireRole(["coach"], "ghost");
    expect(err).toMatchObject({ status: 401 });
  });
});

// ── assertAssignedPlayer ─────────────────────────────────────────────────────
describe("assertAssignedPlayer", () => {
  it("allows a coach acting on their own records (self)", async () => {
    await expect(assertAssignedPlayer("c1", "c1")).resolves.toBeUndefined();
    expect(asMock(prisma.coachAssignment.findUnique)).not.toHaveBeenCalled();
  });

  it("allows an active assignment", async () => {
    asMock(prisma.coachAssignment.findUnique).mockResolvedValue({ status: "active" });
    await expect(assertAssignedPlayer("c1", "p1")).resolves.toBeUndefined();
  });

  it("403s when there is no assignment", async () => {
    asMock(prisma.coachAssignment.findUnique).mockResolvedValue(null);
    await expect(assertAssignedPlayer("c1", "p1")).rejects.toMatchObject({ status: 403 });
  });

  it("403s when the assignment is ended (not active)", async () => {
    asMock(prisma.coachAssignment.findUnique).mockResolvedValue({ status: "ended" });
    await expect(assertAssignedPlayer("c1", "p1")).rejects.toMatchObject({ status: 403 });
  });
});

// ── assertGuardianOf ─────────────────────────────────────────────────────────
describe("assertGuardianOf", () => {
  it("allows a consented guardianship", async () => {
    asMock(prisma.guardianship.findUnique).mockResolvedValue({ parentalConsent: true });
    await expect(assertGuardianOf("g1", "j1")).resolves.toBeUndefined();
  });

  it("403s with no guardianship", async () => {
    asMock(prisma.guardianship.findUnique).mockResolvedValue(null);
    await expect(assertGuardianOf("g1", "j1")).rejects.toMatchObject({ status: 403 });
  });

  it("403s when parental consent is not recorded", async () => {
    asMock(prisma.guardianship.findUnique).mockResolvedValue({ parentalConsent: false });
    await expect(assertGuardianOf("g1", "j1")).rejects.toMatchObject({ status: 403 });
  });
});

// ── assertSameAcademy ────────────────────────────────────────────────────────
describe("assertSameAcademy", () => {
  it("allows two users sharing an academy", async () => {
    asMock(prisma.academyMembership.findMany).mockImplementation((args: { where: { userId: string } }) =>
      Promise.resolve(
        args.where.userId === "a" ? [{ academyId: "ac-1" }] : [{ academyId: "ac-1" }, { academyId: "ac-2" }],
      ),
    );
    await expect(assertSameAcademy("a", "b")).resolves.toBeUndefined();
  });

  it("403s when the users share no academy", async () => {
    asMock(prisma.academyMembership.findMany).mockImplementation((args: { where: { userId: string } }) =>
      Promise.resolve(args.where.userId === "a" ? [{ academyId: "ac-1" }] : [{ academyId: "ac-9" }]),
    );
    await expect(assertSameAcademy("a", "b")).rejects.toMatchObject({ status: 403 });
  });
});

// ── assertCanActOnPlayer (new) ───────────────────────────────────────────────
describe("assertCanActOnPlayer", () => {
  it("allows acting on oneself with no DB lookups", async () => {
    await expect(assertCanActOnPlayer("u1", "u1")).resolves.toBeUndefined();
    expect(asMock(prisma.coachAssignment.findUnique)).not.toHaveBeenCalled();
    expect(asMock(prisma.connectionRequest.findFirst)).not.toHaveBeenCalled();
    expect(asMock(prisma.guardianship.findUnique)).not.toHaveBeenCalled();
  });

  it("allows via an active coach assignment", async () => {
    asMock(prisma.coachAssignment.findUnique).mockResolvedValue({ status: "active" });
    await expect(assertCanActOnPlayer("c1", "p1")).resolves.toBeUndefined();
    expect(asMock(prisma.connectionRequest.findFirst)).not.toHaveBeenCalled();
  });

  it("allows via an active connection when there is no assignment", async () => {
    asMock(prisma.coachAssignment.findUnique).mockResolvedValue(null);
    asMock(prisma.connectionRequest.findFirst).mockResolvedValue({ id: "conn-1" });
    await expect(assertCanActOnPlayer("u1", "u2")).resolves.toBeUndefined();
    expect(asMock(prisma.guardianship.findUnique)).not.toHaveBeenCalled();
  });

  it("allows via a consented guardianship when nothing else matches", async () => {
    asMock(prisma.coachAssignment.findUnique).mockResolvedValue(null);
    asMock(prisma.connectionRequest.findFirst).mockResolvedValue(null);
    asMock(prisma.guardianship.findUnique).mockResolvedValue({ parentalConsent: true });
    await expect(assertCanActOnPlayer("g1", "j1")).resolves.toBeUndefined();
  });

  it("403s when there is no relationship at all", async () => {
    asMock(prisma.coachAssignment.findUnique).mockResolvedValue(null);
    asMock(prisma.connectionRequest.findFirst).mockResolvedValue(null);
    asMock(prisma.guardianship.findUnique).mockResolvedValue(null);
    await expect(assertCanActOnPlayer("u1", "u2")).rejects.toMatchObject({ status: 403 });
  });

  it("403s when the assignment is ended and there is no other link", async () => {
    asMock(prisma.coachAssignment.findUnique).mockResolvedValue({ status: "ended" });
    asMock(prisma.connectionRequest.findFirst).mockResolvedValue(null);
    asMock(prisma.guardianship.findUnique).mockResolvedValue(null);
    await expect(assertCanActOnPlayer("c1", "p1")).rejects.toMatchObject({ status: 403 });
  });
});
