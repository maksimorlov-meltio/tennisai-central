// ============================================================================
// HTTP route tests — the requireAuth gate, swept across the stable routers
//
// Every protected route must answer 401 (never 200, never 500) to an anonymous
// or bogus credential, with a parseable `{ message }` body. This also proves at
// the HTTP level what `auth/jwt.test.ts` proves at the unit level: a purpose
// token (the one that travels in a verification URL) cannot be replayed as a
// session credential, and an expired or foreign-signed token is refused.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { env } from "../env";
import { signPurposeToken } from "../auth/jwt";
import { calendarRouter } from "../calendar/routes";
import { connectionsRouter } from "../connections/routes";
import { teamsRouter } from "../teams/routes";
import { trainingsRouter } from "../trainings/routes";
import { usersRouter } from "../users/routes";
import {
  tournamentsRouter,
  playerTournamentsRouter,
  hiddenTournamentsRouter,
} from "../tournaments/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([
  ["/api/trainings", trainingsRouter],
  ["/api/tournaments", tournamentsRouter],
  ["/api/player-tournaments", playerTournamentsRouter],
  ["/api/hidden-tournaments", hiddenTournamentsRouter],
  ["/api/teams", teamsRouter],
  ["/api/connections", connectionsRouter],
  ["/api/users", usersRouter],
  ["/api/calendar", calendarRouter],
]);

const USER = "user-1";

type Method = "get" | "post" | "patch" | "delete";

/** Every protected surface reachable from the routers mounted above. */
const PROTECTED: Array<[Method, string]> = [
  ["get", "/api/trainings"],
  ["get", "/api/trainings/tr-1"],
  ["post", "/api/trainings"],
  ["patch", "/api/trainings/tr-1"],
  ["delete", "/api/trainings/tr-1"],
  ["post", "/api/trainings/tr-1/analysis"],
  ["get", "/api/tournaments"],
  ["post", "/api/tournaments/import"],
  ["get", "/api/player-tournaments"],
  ["post", "/api/player-tournaments"],
  ["patch", "/api/player-tournaments/pt-1"],
  ["delete", "/api/player-tournaments/pt-1"],
  ["get", "/api/hidden-tournaments"],
  ["post", "/api/hidden-tournaments"],
  ["delete", "/api/hidden-tournaments/t-1"],
  ["get", "/api/teams"],
  ["get", "/api/teams/team-1"],
  ["post", "/api/teams"],
  ["patch", "/api/teams/team-1"],
  ["delete", "/api/teams/team-1"],
  ["post", "/api/teams/team-1/members"],
  ["delete", "/api/teams/team-1/members/user-2"],
  ["get", "/api/connections"],
  ["post", "/api/connections"],
  ["patch", "/api/connections/conn-1"],
  ["delete", "/api/connections/conn-1"],
  ["get", "/api/users/directory"],
  ["get", "/api/calendar/events"],
  ["get", "/api/calendar/events/ev-1"],
  ["post", "/api/calendar/events"],
  ["patch", "/api/calendar/events/ev-1"],
  ["delete", "/api/calendar/events/ev-1"],
];

beforeEach(() => {
  vi.resetAllMocks();
});

/** Every `model.method` on the mocked client that has been called so far. */
function calledDelegates(): string[] {
  return Object.entries(db)
    .filter(([, delegate]) => delegate && typeof delegate === "object")
    .flatMap(([model, delegate]) =>
      Object.entries(delegate as Record<string, { mock?: { calls: unknown[] } }>)
        .filter(([, fn]) => (fn?.mock?.calls.length ?? 0) > 0)
        .map(([method]) => `${model}.${method}`),
    );
}

describe("requireAuth — anonymous callers", () => {
  // Each case is self-contained (mocks are reset per test), so the sweep is
  // order-independent: the 401 AND the "no query ran" claim are checked together.
  it.each(PROTECTED)("401s %s %s with a JSON body and no database access", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Not authenticated" });
    expect(calledDelegates()).toEqual([]);
  });
});

describe("requireAuth — bogus credentials", () => {
  const cases: Array<[string, string]> = [
    ["an empty Bearer token", "Bearer "],
    ["a non-JWT string", "Bearer not-a-jwt"],
    ["a three-segment fake", "Bearer a.b.c"],
    ["a Basic auth header", "Basic dXNlcjpwYXNz"],
    ["a raw token with no scheme", jwt.sign({ sub: USER, typ: "access" }, env.jwtSecret)],
  ];

  it.each(cases)("401s %s", async (_label, header) => {
    const res = await request(app).get("/api/trainings").set("Authorization", header);
    expect(res.status).toBe(401);
    expect(db.training.findMany).not.toHaveBeenCalled();
  });

  it("401s a token signed with a DIFFERENT secret", async () => {
    const forged = jwt.sign({ sub: USER, typ: "access" }, "some-other-secret-entirely");
    const res = await request(app).get("/api/trainings").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(db.training.findMany).not.toHaveBeenCalled();
  });

  it("401s an EXPIRED access token", async () => {
    const expired = jwt.sign({ sub: USER, typ: "access" }, env.jwtSecret, { expiresIn: "-10s" });
    const res = await request(app).get("/api/trainings").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(db.training.findMany).not.toHaveBeenCalled();
  });

  it("401s a purpose token replayed as a session credential", async () => {
    // This is the token shape that travels inside an email verification URL.
    const purpose = signPurposeToken(USER, "verify_email", "1d");
    const res = await request(app).get("/api/trainings").set("Authorization", `Bearer ${purpose}`);
    expect(res.status).toBe(401);
    expect(db.training.findMany).not.toHaveBeenCalled();
  });

  it("401s a token whose sub is missing", async () => {
    const noSub = jwt.sign({ typ: "access" }, env.jwtSecret);
    const res = await request(app).get("/api/trainings").set("Authorization", `Bearer ${noSub}`);
    expect(res.status).toBe(401);
  });
});

describe("requireAuth — a genuine token is accepted and scoped to its own sub", () => {
  it("passes a real signToken through and scopes the query to that user id", async () => {
    db.training.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/trainings").set("Authorization", bearer(USER));

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: unknown }>(db.training.findMany).where).toEqual({
      OR: [{ coachId: USER }, { participants: { some: { playerId: USER } } }],
    });
  });
});

describe("hidden tournaments are pinned to the caller (per-user list)", () => {
  it("scopes the read to the token's user", async () => {
    db.hiddenTournament.findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/hidden-tournaments").set("Authorization", bearer(USER));

    expect(res.status).toBe(200);
    expect(firstCallArg<{ where: unknown }>(db.hiddenTournament.findMany).where).toEqual({
      userId: USER,
    });
  });

  it("ignores a client-supplied userId when hiding a tournament", async () => {
    db.tournament.findUnique.mockResolvedValue({ id: "t-1" });
    db.hiddenTournament.upsert.mockResolvedValue({ userId: USER, tournamentId: "t-1" });

    const res = await request(app)
      .post("/api/hidden-tournaments")
      .set("Authorization", bearer(USER))
      .send({ tournamentId: "t-1", userId: "user-victim" });

    expect(res.status).toBe(201);
    const arg = firstCallArg<{
      where: { userId_tournamentId: { userId: string } };
      create: { userId: string };
    }>(db.hiddenTournament.upsert);
    expect(arg.where.userId_tournamentId.userId).toBe(USER);
    expect(arg.create.userId).toBe(USER);
    expect(JSON.stringify(arg)).not.toContain("user-victim");
  });

  it("unhides only the caller's own row", async () => {
    db.hiddenTournament.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .delete("/api/hidden-tournaments/t-1")
      .set("Authorization", bearer(USER));

    expect(res.status).toBe(200);
    expect(firstCallArg(db.hiddenTournament.deleteMany)).toEqual({
      where: { userId: USER, tournamentId: "t-1" },
    });
  });
});

describe("POST /api/tournaments/import — admin only", () => {
  it("403s a coach-role token", async () => {
    db.user.findUnique.mockResolvedValue({ role: "coach" });
    const res = await request(app)
      .post("/api/tournaments/import")
      .set("Authorization", bearer(USER));
    expect(res.status).toBe(403);
  });

  it("403s a player-role token", async () => {
    db.user.findUnique.mockResolvedValue({ role: "player" });
    const res = await request(app)
      .post("/api/tournaments/import")
      .set("Authorization", bearer(USER));
    expect(res.status).toBe(403);
  });
});

describe("unknown routes", () => {
  it("404s with a parseable JSON body", async () => {
    const res = await request(app).get("/api/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Not found" });
  });
});
