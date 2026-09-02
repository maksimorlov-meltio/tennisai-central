// Tournament feed seam — provider selection + DB import.
//
// A "feed" is any source of tournament rows. There are three kinds now:
//
//   • utr-events   — a live public JSON endpoint, pulled by this process on its
//                    daily schedule. No browser, no credentials.
//   • posted rows  — ITF Juniors, ITF World Tour, ATP and WTA sit behind bot
//                    protection and need a real browser, so they are collected
//                    by the scrapers/ package in CI and POSTed to
//                    /api/tournaments/import. They arrive here as rows rather
//                    than as providers.
//   • static       — the curated snapshot, the always-available fallback.
//
// All three land in the same idempotent upsert, so nothing downstream cares
// where a row came from.

import type { PrismaClient } from "@prisma/client";
import { env } from "../../env";
import type { FeedTournament, SourceResult, TournamentFeedProvider } from "./types";
import { staticProvider } from "./staticProvider";
import { httpProvider } from "./httpProvider";
import { utrProvider } from "./utrProvider";

/**
 * Providers this process pulls for itself, in order.
 *
 * A licensed feed replaces all of them: with FEED_API_URL/FEED_API_KEY set the
 * single configured provider wins, because a paid source covering everything
 * should not be mixed with scraped guesses at the same events.
 */
export function getProviders(): TournamentFeedProvider[] {
  if (env.feedApiUrl && env.feedApiKey) return [httpProvider];
  return [utrProvider, staticProvider];
}

/** Kept for callers and tests that only care about the primary source. */
export function getFeedProvider(): TournamentFeedProvider {
  return getProviders()[0];
}

/**
 * Deterministic, stable natural key for a tournament, used as the row id so
 * re-importing a feed updates in place instead of duplicating.
 *
 * A source that publishes its own id wins: `utr-events-388992`. That is exactly
 * as stable as the source itself and cannot collide.
 *
 * Everything else falls back to name-plus-start-year, which is right for a
 * professional tour where an event runs once a season. It is the wrong key for
 * a source full of recurring club fixtures — see `externalId` on FeedTournament
 * — which is why sources like that must supply an id.
 */
export function feedRowId(source: string, r: FeedTournament): string {
  if (r.externalId) return `${slugify(source)}-${slugify(r.externalId)}`;
  return tournamentSlug(r.name, r.startDate);
}

/** URL-safe, diacritic-free lowercase. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Name plus start year, e.g. "australian-open-2026". Kept exported because the
 * curated snapshot's existing row ids are built this way and must not change.
 */
export function tournamentSlug(name: string, startDate: string): string {
  const year = new Date(startDate).getUTCFullYear();
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
  return `${base}-${year}`;
}

/** Map a feed row onto the columns, recording where it came from. */
function toRow(r: FeedTournament, source: string, seenAt: Date) {
  return {
    name: r.name,
    city: r.city,
    country: r.country,
    surface: r.surface,
    indoorOutdoor: r.indoorOutdoor,
    federation: r.federation,
    category: r.category,
    level: r.level,
    startDate: new Date(r.startDate),
    endDate: new Date(r.endDate),
    latitude: r.latitude,
    longitude: r.longitude,
    entryDeadline: r.entryDeadline ? new Date(r.entryDeadline) : null,
    ageCategory: r.ageCategory ?? null,
    venue: r.venue ?? null,
    website: r.website ?? null,
    registeredCount: r.registeredCount ?? null,
    utrRangeMin: r.utrRangeMin ?? null,
    utrRangeMax: r.utrRangeMax ?? null,
    source,
    sourceUrl: r.sourceUrl ?? null,
    lastSeenAt: seenAt,
  };
}

/**
 * Upsert a batch of already-fetched rows. This is what the CI scrapers reach
 * through the import endpoint, and what the pull providers funnel into.
 *
 * Rows are written one at a time on purpose: one malformed row out of six
 * hundred should cost that row, not the whole night's import.
 */
export async function upsertTournaments(
  prisma: PrismaClient,
  rows: FeedTournament[],
  source: string,
): Promise<number> {
  const seenAt = new Date();
  let imported = 0;

  for (const r of rows) {
    const id = feedRowId(source, r);
    const values = toRow(r, source, seenAt);
    try {
      await prisma.tournament.upsert({ where: { id }, update: values, create: { id, ...values } });
      imported++;
    } catch (err) {
      console.error(
        `[feed] skipped "${r.name}" from ${source}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return imported;
}

/**
 * How long a row may go unseen before it is removed. A source that runs daily
 * has had a week of chances; anything still missing was cancelled, rescheduled
 * out of the window, or was never real.
 */
const STALE_AFTER_DAYS = 7;

/**
 * Forget rows a source has stopped listing.
 *
 * Without this the catalog only ever grows: a cancelled tournament stays on
 * every coach's calendar forever, and a change to a source's id scheme leaves
 * both the old and the new rows behind — which is exactly what happened the
 * first time the ITF scraper ran, leaving two of every Accra week.
 *
 * Guarded on a healthy import: pruning after a source returned little or
 * nothing would delete a real calendar because of one bad night. The caller
 * passes how many rows just arrived, and a thin import prunes nothing.
 */
export async function pruneStale(
  prisma: PrismaClient,
  source: string,
  importedNow: number,
): Promise<number> {
  if (importedNow < 1) return 0;

  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.tournament.deleteMany({
    where: {
      source,
      OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null }],
    },
  });
  if (count > 0) console.log(`[feed] pruned ${count} stale rows from ${source}`);
  return count;
}

/**
 * Run every pull provider and upsert what they return.
 *
 * One source failing must never take the others with it — a UTR outage should
 * not also wipe out the curated fallback — so each is caught and reported
 * separately and the caller can see exactly which ones ran.
 */
export async function importTournaments(
  prisma: PrismaClient,
): Promise<{ imported: number; source: string; results: SourceResult[] }> {
  const results: SourceResult[] = [];

  for (const provider of getProviders()) {
    try {
      const rows = await provider.fetchTournaments();
      const imported = await upsertTournaments(prisma, rows, provider.name);
      await pruneStale(prisma, provider.name, imported);
      results.push({ source: provider.name, federation: provider.federation, imported });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[feed] provider ${provider.name} failed:`, message);
      results.push({
        source: provider.name,
        federation: provider.federation,
        imported: 0,
        error: message,
      });
    }
  }

  const imported = results.reduce((sum, r) => sum + r.imported, 0);
  // `source` is kept for the existing response shape; it names the primary feed.
  return { imported, source: results[0]?.source ?? "none", results };
}
