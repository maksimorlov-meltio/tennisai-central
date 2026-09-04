// ============================================================================
// TennisAI — HTTP route-level test harness
//
// WHY THIS EXISTS
// There is no PostgreSQL in this environment, and `src/index.ts` starts a
// listening server at import time and exports no app factory. Rather than
// refactor production code, these tests COMPOSE the individual per-domain
// routers (all exported: `playerTournamentsRouter`, `calendarRouter`, …) onto a
// fresh `express()` using the same JSON body parser, JSON 404 fallback and
// shared `errorHandler` as `index.ts`, and point the shared Prisma client at an
// in-memory mock (see `createPrismaMock`). Real Express routing, real
// `requireAuth`, real `requireRole` / authz helpers, real zod validation and the
// real error handler all execute — only the data layer is faked.
//
// Deliberately NOT mounted: helmet, cors, morgan and the rate limiters from
// `index.ts`. They are transport-level concerns that would make ownership tests
// order-dependent (the limiter counts across tests). Anything they affect is
// therefore out of scope for these specs.
//
// HONESTY RULE for every spec that uses this harness: assert on what the ROUTE
// did — the status code, the refusal, and the arguments it passed to Prisma
// (e.g. that `createdBy` was pinned to the token's user). Never assert only
// that a mock returned what the test told it to return.
// ============================================================================

import express from "express";
import type { Express, Router } from "express";
import { vi } from "vitest";
import { errorHandler } from "../http";
import { signToken } from "../auth/jwt";

/** A single `vi.fn()` — the type of every mocked Prisma delegate method. */
export type MockFn = ReturnType<typeof vi.fn>;

/** Delegate methods the routers under test may call. */
const DELEGATE_METHODS = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
] as const;

/** Prisma models touched by the stable routers these specs cover. */
const DELEGATES = [
  "user",
  "training",
  "trainingParticipant",
  "tournament",
  "playerTournament",
  "hiddenTournament",
  "team",
  "teamMember",
  "connectionRequest",
  "trainingRequest",
  "calendarEvent",
  "notification",
  // The delivery funnel (notifications/deliver.ts) reads both of these right
  // after writing a notification. Without them every notification spec logged
  // "delivery funnel failed: Cannot read properties of undefined" and exercised
  // only half of what it claimed to — the assertions still passed, because a
  // delivery failure is swallowed by design.
  "notificationPreference",
  "calendarPreference",
  "pushSubscription",
  "coachAssignment",
  "guardianship",
  "academyMembership",
  "aiGeneration",
  "aiUsageCounter",
] as const;

export type MockDelegate = Record<(typeof DELEGATE_METHODS)[number], MockFn>;

export type PrismaMock = Record<(typeof DELEGATES)[number], MockDelegate> & {
  $transaction: MockFn;
  $queryRaw: MockFn;
  $disconnect: MockFn;
};

/**
 * Build a fake Prisma client whose every delegate method is a `vi.fn()`.
 * Specs set return values per test, so nothing is shared implicitly.
 *
 * Use from a spec like:
 *   vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));
 * (the async factory is required — a hoisted `vi.mock` cannot reference a
 * top-level import.)
 */
export function createPrismaMock(): PrismaMock {
  const client = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  } as unknown as PrismaMock;

  for (const model of DELEGATES) {
    const delegate = {} as MockDelegate;
    for (const method of DELEGATE_METHODS) delegate[method] = vi.fn();
    client[model] = delegate;
  }
  return client;
}

/** Narrow the mocked `prisma` import back to its mock type (no `any`). */
export function prismaMockFrom(client: unknown): PrismaMock {
  return client as PrismaMock;
}

/** Cast a mocked function for assertion helpers, mirroring `authz.test.ts`. */
export const asMock = (fn: unknown): MockFn => fn as MockFn;

/**
 * Compose the routers under test onto a fresh app, mirroring `index.ts`'s
 * body parser, JSON 404 fallback and terminal error handler.
 */
export function createTestApp(mounts: Array<[string, Router]>): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  for (const [path, router] of mounts) app.use(path, router);
  app.use((_req, res) => res.status(404).json({ message: "Not found" }));
  app.use(errorHandler);
  return app;
}

/**
 * A GENUINE Authorization header — signed by the production `signToken`, so it
 * carries the real `typ:"access"` claim and is verified by the real
 * `requireAuth`. Tokens are never hand-rolled in the specs.
 */
export function bearer(userId: string): string {
  return `Bearer ${signToken(userId)}`;
}

/** Read the first call's argument object of a mocked delegate method. */
export function firstCallArg<T = Record<string, unknown>>(fn: unknown): T {
  const mock = asMock(fn);
  if (mock.mock.calls.length === 0) throw new Error("expected the mocked Prisma method to have been called");
  return mock.mock.calls[0][0] as T;
}
