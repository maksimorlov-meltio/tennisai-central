# Tournament calendar collection

Collects the tournament calendars that only render in a real browser, and posts
them to the TennisAI API.

**This runs in CI. It must not run on the application server.** A Chromium
session is the hungriest thing that could be put on a 4 GB box that also hosts
another live application, and a scraper that spikes memory at 04:00 and gets a
neighbour killed is a bad trade for a calendar.

## Why a browser at all

Checked on 2 September 2026:

| Source | robots.txt | Data in the HTML? | Needs |
| --- | --- | --- | --- |
| ITF Juniors / World Tour | allows this path (only `/umbraco/` blocked) | no — an 872-byte Akamai challenge | a browser |
| WTA | — | no — renders "Loading…" | a browser |
| ATP | — | no — HTTP 403 to any non-browser client | a browser |
| **UTR** | allows everything | **JSON, no credentials** | **nothing — the API pulls it directly** |

UTR is therefore not here. `server/src/tournaments/feed/utrProvider.ts` reads it
on the server's own daily schedule.

## Running it

```bash
npm install
npx playwright install --with-deps chromium

# Collect and print, post nothing:
npm run scrape -- --source itf-juniors --months 1 --dry-run

# Collect and post:
TENNISAI_API_URL=https://46-225-83-85.sslip.io/api \
TENNISAI_FEED_TOKEN=<the server's FEED_PUSH_TOKEN> \
npm run scrape -- --source itf-juniors --months 6
```

A full run of six months takes about 15 minutes. Most of that is geocoding, not
scraping: ITF publishes a city and a country and no coordinates, and OpenStreetMap's
Nominatim asks for no more than one request a second. Cities are cached within a
run, so the second month is much faster than the first.

## What it refuses to do

- **Post a suspiciously small result.** Under 20 rows exits non-zero. A scraper
  that collects almost nothing has broken, not found an empty calendar, and a
  green run would leave the app serving a frozen calendar for weeks.
- **Guess a location.** An event whose city cannot be geocoded is dropped.
  Pinning it to a country centroid would silently corrupt every distance
  calculation that follows.
- **Guess a surface.** Anything unrecognised is `Unknown`, and the app says so.

## Adding a source

Implement `Scraper` from `src/types.ts` and add it to `SCRAPERS` in `src/run.ts`
and to the workflow matrix. Two rules learned the hard way:

1. **Parse in Node, never in the page.** `page.evaluate` should return raw
   strings. An early version cleaned whitespace inside the page, an escaping
   slip turned the pattern into `/s+/`, and every letter "s" vanished from every
   value — Astana read as "A tana", which looks plausible enough to ship.
2. **Pass page snippets as strings.** `tsx` compiles with esbuild's `keepNames`,
   which wraps functions in a `__name` helper that does not exist in the page. A
   closure fails with `__name is not defined`.

## Terms of use

These calendars' robots.txt files permit this path, but scraping is against the
sites' terms of use. That was a deliberate decision by the project owner. The
job behaves accordingly: one pass per source per day, an identifying user agent,
pauses between pages, and a single switch that stops it (delete the workflow, or
unset `FEED_PUSH_TOKEN` on the server).

A licensed feed removes the question entirely and drops into the same pipeline:
set `FEED_API_URL` and `FEED_API_KEY` on the server and delete this package.
