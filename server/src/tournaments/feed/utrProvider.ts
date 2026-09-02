// UTR events — a live feed that needs no browser and no credentials.
//
// UTR's own web app reads its event search over a public JSON endpoint. Verified
// on 2 Sep 2026 from plain `curl`, with no cookies and no API key: it answers
// 200 application/json and reports several thousand tennis events. That makes
// UTR the one source here that can run inside the API process on its daily
// schedule — the ITF, ATP and WTA calendars sit behind Akamai bot protection and
// need a real browser, so they are collected in CI and posted in (see
// scrapers/ and .github/workflows/tournament-calendar.yml).
//
// Being a private endpoint rather than a documented API, it can change without
// warning. That is why every row is validated before it is accepted and a
// malformed one is skipped rather than imported half-empty: a feed that quietly
// starts returning rubbish is worse than one that visibly returns nothing.

import type { FeedTournament, TournamentFeedProvider } from "./types";

const SEARCH_URL = "https://api.utrsports.net/v2/search/events";
const EVENT_PAGE = "https://app.utrsports.net/events";

/** Page size the endpoint accepts comfortably. */
const PAGE_SIZE = 100;
/**
 * A ceiling on one run, so a change upstream cannot turn the daily job into an
 * unbounded crawl. Roughly a season of events at the time of writing.
 */
const MAX_PAGES = 40;
/** Courtesy pause between pages. One pass a day, taken slowly. */
const PAGE_DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The slice of UTR's payload this provider relies on. */
interface UtrEvent {
  id?: number;
  name?: string;
  surfaceType?: { name?: string } | string | null;
  /**
   * Where the surface actually lives. The top-level `surfaceType` has been null
   * on every event observed; each division carries its own surface and indoor /
   * outdoor instead.
   */
  eventDivisions?: Array<{
    surfaces?: Array<{ value?: string | null; label?: string | null }> | null;
    environments?: Array<{ value?: string | null }> | null;
  }> | null;
  utrRange?: string | null;
  ageRange?: string | null;
  registeredCount?: number | null;
  eventLocations?: Array<{
    display?: string | null;
    cityName?: string | null;
    countryName?: string | null;
    streetAddress?: string | null;
    latLng?: [number, number] | null;
  }> | null;
  eventSchedule?: {
    eventStartUtc?: string | null;
    eventEndUtc?: string | null;
    registrationEndUtc?: string | null;
  } | null;
}

/** "1.0 - 16.0" → { min: 1, max: 16 }. Anything else → nothing. */
export function parseUtrRange(raw: unknown): { min?: number; max?: number } {
  if (typeof raw !== "string") return {};
  const m = raw.match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/);
  if (!m) return {};
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return {};
  return { min, max };
}

/**
 * Normalise a surface word to the app's vocabulary. "Unknown" rather than a
 * guess of "Hard": a wrong surface changes which players a coach enters, and
 * the tournament page can say "not published" honestly instead.
 */
export function normaliseSurface(raw: unknown): string {
  const text = typeof raw === "string" ? raw : ((raw as { name?: string } | null)?.name ?? "");
  const v = text.toLowerCase();
  if (v.includes("clay")) return "Clay";
  if (v.includes("grass")) return "Grass";
  if (v.includes("carpet")) return "Carpet";
  if (v.includes("hard")) return "Hard";
  return "Unknown";
}

/**
 * Surface and environment for the event as a whole.
 *
 * The top-level `surfaceType` is null on every event observed; the real values
 * sit on each division. Divisions of one event almost always agree, so the
 * first division that states a surface speaks for the event — and when they
 * genuinely disagree, the most common one wins rather than whichever happened
 * to be listed first.
 */
export function surfaceFromDivisions(divisions: UtrEvent["eventDivisions"]): {
  surface: string;
  indoorOutdoor: "indoor" | "outdoor";
} {
  const surfaces: string[] = [];
  let indoor = 0;
  let outdoor = 0;

  for (const d of divisions ?? []) {
    for (const s of d?.surfaces ?? []) {
      const norm = normaliseSurface(s?.value ?? s?.label);
      if (norm !== "Unknown") surfaces.push(norm);
    }
    for (const e of d?.environments ?? []) {
      const v = (e?.value ?? "").toLowerCase();
      if (v === "indoor") indoor++;
      else if (v === "outdoor") outdoor++;
    }
  }

  const tally = new Map<string, number>();
  for (const s of surfaces) tally.set(s, (tally.get(s) ?? 0) + 1);
  const surface = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";

  return { surface, indoorOutdoor: indoor > outdoor ? "indoor" : "outdoor" };
}

/** UTC timestamps arrive without a zone marker; they are documented as UTC. */
function asIso(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * One UTR event → one feed row, or null when the row cannot be trusted.
 *
 * Required: a name, both dates, and real coordinates. Without coordinates the
 * event cannot be placed on the map or distance-sorted, which is most of what a
 * coach uses the calendar for — so it is dropped rather than imported blind.
 */
export function toFeedTournament(e: UtrEvent): FeedTournament | null {
  const name = e.name?.trim();
  const startDate = asIso(e.eventSchedule?.eventStartUtc);
  const endDate = asIso(e.eventSchedule?.eventEndUtc);
  if (!name || !startDate || !endDate) return null;

  const loc = e.eventLocations?.[0];
  const latLng = loc?.latLng;
  if (!Array.isArray(latLng) || latLng.length !== 2) return null;
  const [latitude, longitude] = latLng;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const { min, max } = parseUtrRange(e.utrRange);
  const { surface, indoorOutdoor } = surfaceFromDivisions(e.eventDivisions);

  return {
    // UTR's own event id. Thousands of its events are recurring club fixtures
    // that repeat the same name many times a year, so name-plus-year is not a
    // unique key here — without this, a weekly league collapses into one row.
    externalId: typeof e.id === "number" ? String(e.id) : undefined,
    name,
    city: loc?.cityName?.trim() || loc?.display?.split(",")[0]?.trim() || "Unknown",
    country: loc?.countryName?.trim() || "Unknown",
    surface,
    indoorOutdoor,
    federation: "UTR",
    category: min !== undefined && max !== undefined ? `UTR ${min}-${max}` : "UTR Event",
    level: "UTR",
    startDate,
    endDate,
    latitude,
    longitude,
    entryDeadline: asIso(e.eventSchedule?.registrationEndUtc),
    ageCategory: e.ageRange?.trim() || undefined,
    venue: loc?.streetAddress?.trim() || undefined,
    website: e.id ? `${EVENT_PAGE}/${e.id}` : undefined,
    registeredCount: typeof e.registeredCount === "number" ? e.registeredCount : undefined,
    utrRangeMin: min,
    utrRangeMax: max,
    sourceUrl: e.id ? `${EVENT_PAGE}/${e.id}` : undefined,
  };
}

/** Injected in tests so the provider can be exercised without the network. */
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export function createUtrProvider(fetchImpl: FetchLike = fetch as unknown as FetchLike): TournamentFeedProvider {
  return {
    name: "utr-events",
    federation: "UTR",
    async fetchTournaments(): Promise<FeedTournament[]> {
      const rows: FeedTournament[] = [];
      const seen = new Set<number>();

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${SEARCH_URL}?top=${PAGE_SIZE}&skip=${page * PAGE_SIZE}&sportTypes=tennis`;
        const res = await fetchImpl(url, {
          headers: {
            Accept: "application/json",
            // Say who we are. A source that wants to refuse us should be able to.
            "User-Agent": "TennisAI-Calendar/1.0 (+https://github.com/SOMAXOrlov/tennisai-central)",
          },
        });
        if (!res.ok) {
          // Partial data beats none: keep whatever earlier pages returned and
          // let the caller record the failure against this source only.
          if (rows.length > 0) break;
          throw new Error(`UTR event search failed: HTTP ${res.status}`);
        }

        const body = (await res.json()) as { hits?: Array<{ source?: UtrEvent }> };
        const hits = Array.isArray(body.hits) ? body.hits : [];
        if (hits.length === 0) break;

        for (const hit of hits) {
          const src = hit?.source;
          if (!src) continue;
          // The endpoint has been observed repeating ids across pages.
          if (typeof src.id === "number") {
            if (seen.has(src.id)) continue;
            seen.add(src.id);
          }
          const row = toFeedTournament(src);
          if (row) rows.push(row);
        }

        if (hits.length < PAGE_SIZE) break;
        await sleep(PAGE_DELAY_MS);
      }

      return rows;
    },
  };
}

export const utrProvider = createUtrProvider();
