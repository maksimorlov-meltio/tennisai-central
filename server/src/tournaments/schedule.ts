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
 * Start the daily refresh. Returns a stop function.
 *
 * The first run is at the next `hourUtc`, never at boot: a redeploy should not
 * trigger a full re-import, and several restarts in an afternoon should not
 * hammer the source. The catalog already holds yesterday's rows, so waiting
 * costs nothing.
 */
export function startTournamentSchedule(
  prisma: PrismaClient,
  hourUtc = 4,
): { stop: () => void } {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

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
