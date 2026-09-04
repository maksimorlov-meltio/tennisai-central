// The once-a-day calendar refresh.
//
// Deliberately a plain timer rather than a cron dependency: "run at 04:00 UTC,
// then every 24 hours" is the whole requirement, and a scheduling library would
// be more moving parts than the job itself.
//
// Only pull sources run here — UTR today, a licensed feed if one is ever
// configured. The browser-driven scrapers post their rows in from CI instead
// (see feedRoutes.ts), so nothing on this box ever starts a Chromium.

import type { PrismaClient } from "@prisma/client";
import { importTournaments } from "./feed";
import { recordImport } from "./importStatus";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds from `now` until the next occurrence of `hourUtc`:00 UTC. */
export function msUntilNextRun(now: Date, hourUtc: number): number {
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** One run, wrapped so a feed outage can never take the API process down. */
export async function runDailyImport(prisma: PrismaClient): Promise<void> {
  const started = Date.now();
  try {
    const { imported, results } = await importTournaments(prisma);
    recordImport(results);
    const detail = results
      .map((r) => `${r.source}: ${r.error ? `FAILED (${r.error})` : r.imported}`)
      .join(", ");
    console.log(
      `[feed] daily import finished in ${Math.round((Date.now() - started) / 1000)}s — ` +
        `${imported} rows. ${detail}`,
    );
  } catch (err) {
    // importTournaments already isolates per-provider failures; this is the
    // last-resort net so a bug in the runner itself cannot become an unhandled
    // rejection that kills the process at 04:00 with nobody watching.
    console.error("[feed] daily import failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Fill an empty catalog immediately, instead of waiting for the first
 * scheduled run.
 *
 * A redeploy must NOT re-import — several restarts in an afternoon would hammer
 * the source for nothing, since the catalog already holds yesterday's rows. But
 * an EMPTY catalog is a different situation entirely, and it was the normal one:
 * a fresh install had no tournaments and no reachable way to get any. The only
 * trigger was an admin-only endpoint, and `admin` is not a role anyone can sign
 * up as — so the calendar read "No events found" on day one and would have gone
 * on saying it forever.
 *
 * Empty is therefore the one state worth acting on at boot.
 */
export async function importIfEmpty(prisma: PrismaClient): Promise<boolean> {
  const existing = await prisma.tournament.count();
  if (existing > 0) return false;

  console.log("[feed] tournament catalog is empty — importing now rather than waiting for 04:00");
  await runDailyImport(prisma);
  return true;
}

/**
 * Start the daily refresh. Returns a stop function.
 *
 * Scheduled runs happen at the next `hourUtc` and every 24 hours after. The
 * only work done at boot is filling a catalog that is completely empty.
 */
export function startTournamentSchedule(
  prisma: PrismaClient,
  hourUtc = 4,
): { stop: () => void } {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  // Fire-and-forget: the API must come up and serve traffic whatever the feed
  // is doing, and a source being down at boot is not a reason to fail to start.
  void importIfEmpty(prisma).catch((err) => {
    console.error("[feed] initial import failed:", err instanceof Error ? err.message : err);
  });

  const scheduleNext = () => {
    if (stopped) return;
    const wait = msUntilNextRun(new Date(), hourUtc);
    timer = setTimeout(async () => {
      await runDailyImport(prisma);
      scheduleNext();
    }, wait);
    // Do not hold the event loop open on this alone — a process that has
    // finished everything else should still be able to exit.
    timer.unref?.();
    const hours = (wait / 3_600_000).toFixed(1);
    console.log(`[feed] next calendar refresh in ${hours}h (daily at ${hourUtc}:00 UTC)`);
  };

  scheduleNext();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
