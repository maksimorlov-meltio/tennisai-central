// Collect one calendar and post it to the API.
//
//   npm run scrape -- --source itf-juniors --months 6
//   npm run scrape -- --source itf-juniors --dry-run     # print, post nothing
//
// Posting needs two environment variables, supplied as CI secrets:
//   TENNISAI_API_URL    e.g. https://46-225-83-85.sslip.io/api
//   TENNISAI_FEED_TOKEN the server's FEED_PUSH_TOKEN
//
// Exit codes matter: CI has to fail loudly. A scraper that collects nothing has
// almost certainly broken rather than found an empty calendar, and a silent
// green run would leave the app serving a frozen calendar for weeks.

import { itfJuniorsScraper } from "./itfJuniors";
import type { Scraper, ScrapedTournament } from "./types";

const SCRAPERS: Scraper[] = [itfJuniorsScraper];

/** Below this, assume breakage rather than a quiet week. */
const MIN_EXPECTED_ROWS = 20;
/** The API caps a single request; a season of juniors exceeds it. */
const BATCH_SIZE = 500;

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function post(rows: ScrapedTournament[], source: string): Promise<number> {
  const base = process.env.TENNISAI_API_URL;
  const token = process.env.TENNISAI_FEED_TOKEN;
  if (!base || !token) {
    throw new Error("TENNISAI_API_URL and TENNISAI_FEED_TOKEN must both be set to post results");
  }

  let imported = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${base.replace(/\/$/, "")}/feed/tournaments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-feed-token": token,
      },
      body: JSON.stringify({ source, tournaments: batch }),
    });

    const body = (await res.json().catch(() => ({}))) as { message?: string; data?: { imported?: number } };
    if (!res.ok) {
      // The token never appears in a log. The status and the server's own
      // message are enough to diagnose, and neither leaks the secret.
      throw new Error(`push failed: HTTP ${res.status} ${body.message ?? ""}`.trim());
    }
    imported += body.data?.imported ?? batch.length;
    console.log(`  posted ${i + batch.length}/${rows.length}`);
  }
  return imported;
}

async function main() {
  const wanted = arg("source");
  const months = Number(arg("months", "6"));
  const dryRun = flag("dry-run");
  const verbose = !flag("quiet");

  const scraper = SCRAPERS.find((s) => s.name === wanted);
  if (!scraper) {
    console.error(
      `Unknown source "${wanted ?? ""}". Available: ${SCRAPERS.map((s) => s.name).join(", ")}`,
    );
    process.exit(2);
  }

  console.log(`Collecting ${scraper.description} — ${months} months ahead`);
  const started = Date.now();
  const rows = await scraper.run({ months, verbose });
  const seconds = Math.round((Date.now() - started) / 1000);

  console.log(`\nCollected ${rows.length} tournaments in ${seconds}s`);
  if (rows.length > 0) {
    const byCategory = rows.reduce<Record<string, number>>((a, r) => {
      a[r.category] = (a[r.category] ?? 0) + 1;
      return a;
    }, {});
    console.log("By grade:", byCategory);
    console.log("First row:", JSON.stringify(rows[0], null, 1));
  }

  if (rows.length < MIN_EXPECTED_ROWS) {
    console.error(
      `\nFAILED: ${rows.length} rows is below the ${MIN_EXPECTED_ROWS} expected. ` +
        `Treating this as a broken scraper rather than an empty calendar — the API keeps ` +
        `yesterday's rows, so nothing is lost, but this needs looking at.`,
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing posted.");
    return;
  }

  const imported = await post(rows, scraper.name);
  console.log(`\nDone — ${imported} rows accepted by the API.`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
