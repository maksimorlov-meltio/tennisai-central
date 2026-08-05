// ============================================================================
// HTTP route tests — GET /api/users/directory
//
// PRIVACY REGRESSION NET. This endpoint once returned EVERY user's full name to
// any signed-in account (mass enumeration). The protection lives entirely in the
// query the route builds, so that is what these tests assert:
//   • no `?publicId=` → the caller's RELATED user ids only; with no
//     relationships the route must not run a user query at all;
//   • `?publicId=<exact>` → a single record by exact shareable id, and the
//     relationship fan-out is skipped;
//   • the projection never selects email / passwordHash.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { usersRouter } from "../users/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/users", usersRouter]]);

const ME = "user-me";
const FRIEND = "user-friend";
const STRANGER = "user-stranger";

/** The five relationship look-ups `relatedUserIds` fans out to. */
function relationships(opts: {
  connections?: { fromUserId: string; toUserId: string }[];
  coachOf?: string[];
  coachedBy?: string[];
  guardianOf?: string[];
  wardOf?: string[];
} = {}) {
  db.connectionRequest.findMany.mockResolvedValue(opts.connections ?? []);
  db.coachAssignment.findMany.mockImplementation((args: { where: Record<string, unknown> }) =>
    Promise.resolve(
      args.where.coachId
        ? (opts.coachOf ?? []).map((playerId) => ({ playerId }))
        : (opts.coachedBy ?? []).map((coachId) => ({ coachId })),
    ),
  );
  db.guardianship.findMany.mockImplementation((args: { where: Record<string, unknown> }) =>
    Promise.resolve(
      args.where.guardianId
        ? (opts.guardianOf ?? []).map((juniorPlayerId) => ({ juniorPlayerId }))
        : (opts.wardOf ?? []).map((guardianId) => ({ guardianId })),
    ),
  );
}

const FRIEND_RECORD = {
  id: FRIEND,
  publicId: "TAI-P-042",
  firstName: "Ana",
  lastName: "Perez",
  role: "player",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/users/directory — unauthenticated", () => {
  it("401s and runs no query", async () => {
    const res = await request(app).get("/api/users/directory");
    expect(res.status).toBe(401);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/users/directory — no publicId (relationship-scoped)", () => {
  it("returns [] and NEVER queries the users table when the caller has no relationships", async () => {
    relationships();

    const res = await request(app).get("/api/users/directory").set("Authorization", bearer(ME));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    // The old vulnerability was an unscoped findMany over every user — assert it
    // is not even reached.
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it("queries ONLY the ids the caller is related to (no unrelated user in the WHERE)", async () => {
    relationships({ connections: [{ fromUserId: ME, toUserId: FRIEND }] });
    db.user.findMany.mockResolvedValue([FRIEND_RECORD]);

    const res = await request(app).get("/api/users/directory").set("Authorization", bearer(ME));

    expect(res.status).toBe(200);
    const arg = firstCallArg<{
      where: { id: { in: string[] }; role: { not: string } };
      select: Record<string, boolean>;
    }>(db.user.findMany);
    expect(arg.where.id.in).toEqual([FRIEND]);
    expect(arg.where.id.in).not.toContain(STRANGER);
    expect(arg.where.id.in).not.toContain(ME); // never include self
    expect(arg.where.role).toEqual({ not: "admin" });
    expect(res.body.data).toEqual([FRIEND_RECORD]);
  });

  it("resolves the OTHER side of a connection regardless of direction", async () => {
    // Incoming request: the caller is `toUserId`, so the friend is `fromUserId`.
    relationships({ connections: [{ fromUserId: FRIEND, toUserId: ME }] });
    db.user.findMany.mockResolvedValue([FRIEND_RECORD]);

    const res = await request(app).get("/api/users/directory").set("Authorization", bearer(ME));

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: { id: { in: string[] } } }>(db.user.findMany).where.id.in).toEqual([
      FRIEND,
    ]);
  });

  it("only counts ACTIVE connections / CONSENTED guardianships (the route filters in-query)", async () => {
    relationships({ connections: [] });

    await request(app).get("/api/users/directory").set("Authorization", bearer(ME));

    expect(firstCallArg<{ where: Record<string, unknown> }>(db.connectionRequest.findMany).where)
      .toMatchObject({ status: "active" });
    const guardianArgs = db.guardianship.findMany.mock.calls.map(
      (c) => (c[0] as { where: Record<string, unknown> }).where,
    );
    for (const where of guardianArgs) expect(where).toMatchObject({ parentalConsent: true });
    const assignmentArgs = db.coachAssignment.findMany.mock.calls.map(
      (c) => (c[0] as { where: Record<string, unknown> }).where,
    );
    for (const where of assignmentArgs) expect(where).toMatchObject({ status: "active" });
  });

  it("never selects email or passwordHash", async () => {
    relationships({ coachOf: [FRIEND] });
    db.user.findMany.mockResolvedValue([FRIEND_RECORD]);

    await request(app).get("/api/users/directory").set("Authorization", bearer(ME));

    const select = firstCallArg<{ select: Record<string, boolean> }>(db.user.findMany).select;
    expect(Object.keys(select).sort()).toEqual(["firstName", "id", "lastName", "publicId", "role"]);
    expect(select).not.toHaveProperty("email");
    expect(select).not.toHaveProperty("passwordHash");
  });
});

describe("GET /api/users/directory?publicId= — exact lookup", () => {
  it("looks a user up by exact publicId, excludes admins, and skips the relationship fan-out", async () => {
    db.user.findFirst.mockResolvedValue(FRIEND_RECORD);

    const res = await request(app)
      .get("/api/users/directory?publicId=TAI-P-042")
      .set("Authorization", bearer(ME));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([FRIEND_RECORD]);
    const arg = firstCallArg<{ where: Record<string, unknown>; select: Record<string, boolean> }>(
      db.user.findFirst,
    );
    expect(arg.where).toEqual({ publicId: "TAI-P-042", role: { not: "admin" } });
    expect(arg.select).not.toHaveProperty("email");
    // The deliberate connect-by-ID path must not fan out over relationships.
    expect(db.connectionRequest.findMany).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty array (not 404) when no publicId matches", async () => {
    db.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/users/directory?publicId=TAI-P-does-not-exist")
      .set("Authorization", bearer(ME));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("400s an empty publicId param instead of falling back to a broad query", async () => {
    const res = await request(app)
      .get("/api/users/directory?publicId=")
      .set("Authorization", bearer(ME));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request data");
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
