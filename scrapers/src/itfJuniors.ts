// ITF World Tennis Tour Juniors calendar.
//
// The calendar Aleksandr's squad actually enters, and the reason this package
// exists. ITF publishes it at
//   /en/tournament-calendar/world-tennis-tour-juniors-calendar/?categories=All&startdate=YYYY-MM
// one month per page, roughly 100–140 events a month worldwide.
//
// It needs a real browser. Verified on 2 Sep 2026: a plain HTTPS request — even
// a same-origin one issued from inside a logged-in browser — comes back as an
// 872-byte Akamai challenge carrying `noindex,nofollow` and none of the data.
// Only a full browser session that runs the challenge script sees the table.
// That is the whole reason this runs in CI rather than on the app server.
//
// ITF's robots.txt allows this path (only /umbraco/ is disallowed). The job
// still takes one pass per month-page per day, identifies itself, and pauses
// between pages.

import { chromium, type Browser, type Page } from "playwright";
import { Geocoder } from "./geocode";
import type { ScrapedTournament, ScrapeOptions, Scraper } from "./types";

const BASE =
  "https://www.itftennis.com/en/tournament-calendar/world-tennis-tour-juniors-calendar/";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 TennisAI-Calendar/1.0 (+https://github.com/SOMAXOrlov/tennisai-central)";
const PAGE_PAUSE_MS = 3000;
const NAV_TIMEOUT_MS = 60_000;

/** One row as it appears in ITF's table, before any interpretation. */
interface RawRow {
  name: string;
  dates: string;
  country: string;
  city: string;
  category: string;
  surface: string;
}

/** "31 Aug to 05 Sep 2026" → ISO start and end. */
export function parseDateRange(text: string): { start: string; end: string } | null {
  const m = text.match(
    /(\d{1,2})\s+([A-Za-z]{3,})(?:\s+(\d{4}))?\s+to\s+(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/i,
  );
  if (!m) return null;

  const [, d1, mon1, y1, d2, mon2, y2] = m;
  const endYear = Number(y2);
  // The start year is omitted when it matches the end. A fixture that begins in
  // December and finishes in January is the case a naive reading gets wrong.
  const startYear = y1 ? Number(y1) : monthIndex(mon1) > monthIndex(mon2) ? endYear - 1 : endYear;

  const start = toIso(startYear, mon1, d1);
  const end = toIso(endYear, mon2, d2);
  if (!start || !end) return null;
  if (new Date(end) < new Date(start)) return null;
  return { start, end };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}
function toIso(year: number, month: string, day: string): string | null {
  const mi = monthIndex(month);
  if (mi < 0) return null;
  const d = new Date(Date.UTC(year, mi, Number(day)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "Outdoor - Hard" → { surface: "Hard", indoorOutdoor: "outdoor" }. */
export function parseSurface(text: string): { surface: string; indoorOutdoor: "indoor" | "outdoor" } {
  const v = text.toLowerCase();
  const indoorOutdoor = v.includes("indoor") ? "indoor" : "outdoor";
  const surface = v.includes("clay")
    ? "Clay"
    : v.includes("grass")
      ? "Grass"
      : v.includes("carpet")
        ? "Carpet"
        : v.includes("hard")
          ? "Hard"
          : "Unknown";
  return { surface, indoorOutdoor };
}

/**
 * ITF's junior grades, hardest first: JGS (junior Grand Slam), then J500 down
 * to J30. The grade is the single most useful fact for a coach choosing an
 * event, so it is kept verbatim as the category.
 */
export function normaliseCategory(text: string): string {
  const v = text.trim().toUpperCase();
  return /^(JGS|J\d{2,3})$/.test(v) ? v : v || "ITF Juniors";
}

/** The months to collect, as ITF's `startdate` parameter wants them. */
export function monthsFrom(now: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// Both page-side snippets below are STRINGS, not functions, on purpose: tsx
// compiles with esbuild's `keepNames`, which wraps every function in a `__name`
// helper. That helper does not exist inside the page, so a closure passed to
// evaluate/waitForFunction dies with "__name is not defined".
//
// They also do NO parsing. Everything the page returns is raw cell text, and
// every regex runs in Node — an earlier version cleaned whitespace inside the
// page and an escaping slip turned the pattern into /s+/, which silently
// deleted the letter "s" from every value on the page. "Astana" became
// "A tana" and it looked plausible enough to ship.

/** True once the month's rows have rendered. */
const ROWS_PRESENT = "document.querySelectorAll('tbody tr').length > 0";

/** Returns one array of raw cell strings per row. No interpretation. */
const EXTRACT_ROWS =
  "Array.from(document.querySelectorAll('tbody tr'))" +
  ".map(function (tr) { return Array.from(tr.querySelectorAll('td')).map(function (td) { return td.textContent || ''; }); })" +
  ".filter(function (cells) { return cells.length >= 6; })";

/**
 * ITF renders a responsive table: each cell's text carries its column label,
 * so the date cell reads "Date:29 Aug to 04 Sep 2026". Strip the label and
 * collapse whitespace.
 */
export function cleanCell(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  const labelled = text.match(/^[A-Za-z/ ]{3,20}:\s*(.*)$/);
  return (labelled ? labelled[1] : text).trim();
}

/**
 * The name cell repeats itself and appends a country code:
 * "J300 REPENTIGNYJ300 REPENTIGNY (CAN)". One is the visible name and one is
 * the screen-reader label, concatenated by textContent.
 */
export function cleanName(raw: string): string {
  const text = cleanCell(raw);
  const withoutCode = text.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
  // If the remainder is the same thing twice, keep one copy.
  const half = withoutCode.length / 2;
  if (Number.isInteger(half) && withoutCode.slice(0, half) === withoutCode.slice(half)) {
    return withoutCode.slice(0, half).trim();
  }
  return withoutCode;
}

/**
 * ITF writes country names its own way, and several of them are not names any
 * geocoder knows. Left alone, eight percent of a month is silently dropped —
 * including J300 Beijing and J200 Nanjing.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  "chinese taipei": "Taiwan",
  "china, p.r.": "China",
  "korea, rep.": "South Korea",
  "korea, d.p.r.": "North Korea",
  "great britain": "United Kingdom",
  "usa": "United States",
  "chinese, hong kong": "Hong Kong",
  "hong kong, china": "Hong Kong",
  "russian federation": "Russia",
  "iran, islamic rep.": "Iran",
  "syrian arab rep.": "Syria",
  "moldova, rep.": "Moldova",
  "north macedonia, rep.": "North Macedonia",
  "tanzania, united rep.": "Tanzania",
  "venezuela, bolivarian rep.": "Venezuela",
  "bolivia, plurinational state": "Bolivia",
  "cote d'ivoire": "Ivory Coast",
  "chinese taipei, r.o.c.": "Taiwan",
};

export function normaliseCountry(raw: string): string {
  const key = raw.trim().toLowerCase();
  return COUNTRY_ALIASES[key] ?? raw.trim();
}

/**
 * City names carry status suffixes — "Vyshkovo (CLOSED)" — which no geocoder
 * resolves. The suffix is about entry status, not about the place.
 */
export function normaliseCity(raw: string): string {
  return raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Raw cells → the row this scraper works with, or null if it is not a fixture. */
export function toRawRow(cells: string[]): RawRow | null {
  const name = cleanName(cells[0] ?? "");
  const dates = cleanCell(cells[1] ?? "");
  if (!name || !/\d{4}/.test(dates)) return null;
  return {
    name,
    dates,
    country: normaliseCountry(cleanCell(cells[2] ?? "")),
    city: normaliseCity(cleanCell(cells[3] ?? "")),
    category: cleanCell(cells[4] ?? ""),
    surface: cleanCell(cells[5] ?? ""),
  };
}

/** Load one month and read its rows. */
async function readMonth(page: Page, month: string, verbose: boolean): Promise<RawRow[]> {
  await page.goto(`${BASE}?categories=All&startdate=${month}`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT_MS,
  });

  // Wait on the content itself rather than a fixed sleep — that is what makes
  // this survive a slow day. A page that never fills is a failure worth
  // reporting rather than papering over.
  try {
    await page.waitForFunction(ROWS_PRESENT, undefined, { timeout: NAV_TIMEOUT_MS });
  } catch {
    if (verbose) console.warn(`  ${month}: no tournament rows appeared`);
    return [];
  }

  // "Show more" pages the rest of the month in. A month has never needed more
  // than a couple of presses; the cap stops a changed control from looping.
  for (let i = 0; i < 6; i++) {
    const more = page.locator("button, a").filter({ hasText: /show \d+ more/i }).first();
    if ((await more.count()) === 0) break;
    await more.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  const cells = (await page.evaluate(EXTRACT_ROWS)) as string[][];
  return cells.map(toRawRow).filter((r): r is RawRow => r !== null);
}

export const itfJuniorsScraper: Scraper = {
  name: "itf-juniors",
  description: "ITF World Tennis Tour Juniors calendar",

  async run({ months, verbose }: ScrapeOptions): Promise<ScrapedTournament[]> {
    const geocoder = new Geocoder(USER_AGENT);
    const out: ScrapedTournament[] = [];
    const seen = new Set<string>();

    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: "en-GB",
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();

      for (const month of monthsFrom(new Date(), months)) {
        const raw = await readMonth(page, month, verbose);
        if (verbose) console.log(`  ${month}: ${raw.length} rows`);

        for (const r of raw) {
          const range = parseDateRange(r.dates);
          if (!range) continue;

          // ITF publishes no id in the table, and the same event name recurs
          // every season — so name plus start date is the stable key.
          const externalId = `${r.name}|${range.start.slice(0, 10)}`.toLowerCase();
          if (seen.has(externalId)) continue;
          seen.add(externalId);

          const where = await geocoder.lookup(r.city, r.country);
          if (!where) {
            if (verbose) console.warn(`  skipped "${r.name}" — could not place ${r.city}, ${r.country}`);
            continue;
          }

          const { surface, indoorOutdoor } = parseSurface(r.surface);
          out.push({
            externalId,
            name: r.name,
            city: r.city,
            country: r.country,
            surface,
            indoorOutdoor,
            federation: "ITF",
            category: normaliseCategory(r.category),
            level: "ITF World Tennis Tour Juniors",
            startDate: range.start,
            endDate: range.end,
            latitude: where.latitude,
            longitude: where.longitude,
            ageCategory: "18 & Under",
            sourceUrl: `${BASE}?categories=All&startdate=${month}`,
          });
        }

        await page.waitForTimeout(PAGE_PAUSE_MS);
      }

      if (verbose) {
        const s = geocoder.stats;
        console.log(`  geocoding: ${s.lookups} lookups, ${s.cacheHits} cached, ${s.failures} failed`);
      }
      return out;
    } finally {
      await browser?.close();
    }
  },
};
