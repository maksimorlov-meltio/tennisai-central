// Machine-to-machine calendar ingest.
//
// The ITF, ATP and WTA calendars sit behind bot protection and only render in a
// real browser, so they are collected by the scrapers/ package running in CI
// and posted here. That browser deliberately never runs on this server: a
// Chromium session per source is the hungriest thing that could be put on a
// 4 GB box that also hosts someone else's live application.
//
// On its own router because `tournamentsRouter` puts every route behind
// `requireAuth`, and this one must NOT be reachable with a coach's or player's
// login — nobody who can sign into the app should be able to rewrite the
// tournament catalog. It authenticates with a shared token instead, and is
// switched off entirely when no token is configured.

import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db";
import { env } from "../env";
import { asyncHandler, ok, HttpError } from "../http";
import { pruneStale, upsertTournaments } from "./feed";
import { recordImport, importStatus } from "./importStatus";

export const feedRouter = Router();

const tournamentSchema = z.object({
  // The source's own stable id. Without it the upsert falls back to
  // name-plus-year, and a fixture that recurs within a season collapses onto a
  // single row — "J30 ACCRA" runs four times in one September, and 135 posted
  // rows became 122 the first time this field was missing from the schema.
  externalId: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(300),
  city: z.string().min(1).max(200),
  country: z.string().min(1).max(120),
  surface: z.string().min(1).max(40),
  indoorOutdoor: z.enum(["indoor", "outdoor"]),
  federation: z.enum(["ITF", "WTA", "ATP", "UTR", "USTA"]),
  category: z.string().min(1).max(80),
  level: z.string().min(1).max(80),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  entryDeadline: z.string().optional(),
  ageCategory: z.string().max(80).optional(),
  venue: z.string().max(300).optional(),
  website: z.string().max(500).optional(),
  registeredCount: z.number().int().nonnegative().optional(),
  utrRangeMin: z.number().min(0).max(20).optional(),
  utrRangeMax: z.number().min(0).max(20).optional(),
  sourceUrl: z.string().max(500).optional(),
});

const pushSchema = z.object({
  source: z.string().min(1).max(64),
  // A ceiling, so a runaway scraper cannot post a million rows in one call.
  tournaments: z.array(tournamentSchema).min(1).max(5000),
});

/**
 * Constant-time token check that does not leak the expected length by timing.
 * `timingSafeEqual` throws on a length mismatch, so lengths are compared first
 * and a mismatch is reported the same way as a wrong token.
 */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function assertFeedToken(header: string | undefined): void {
  const expected = env.feedPushToken;
  if (!expected) {
    throw new HttpError(503, "Calendar ingest is not enabled on this server.");
  }
  if (!header || !tokenMatches(header, expected)) {
    throw new HttpError(401, "Invalid feed token.");
  }
}

// POST /api/feed/tournaments — upsert a batch of scraped rows.
feedRouter.post(
  "/tournaments",
  asyncHandler(async (req, res) => {
    assertFeedToken(req.header("x-feed-token") ?? undefined);

    const body = pushSchema.parse(req.body);
    const imported = await upsertTournaments(prisma, body.tournaments, body.source);
    // Events this source has stopped listing — cancelled, or moved out of the
    // window — should leave the calendar rather than linger forever.
    await pruneStale(prisma, body.source, imported);
    recordImport([
      {
        source: body.source,
        federation: body.tournaments[0]?.federation ?? "ITF",
        imported,
      },
    ]);

    console.log(`[feed] ${body.source} pushed ${imported}/${body.tournaments.length} rows`);
    return ok(res, { imported, received: body.tournaments.length, source: body.source });
  }),
);

// GET /api/feed/status — what each source last did. Token-gated too: it is
// operational detail, and it is what the CI job checks after posting.
feedRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    assertFeedToken(req.header("x-feed-token") ?? undefined);
    return ok(res, { sources: importStatus() });
  }),
);
