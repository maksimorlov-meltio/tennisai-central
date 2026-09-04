// The row shape the API accepts at POST /api/feed/tournaments.
//
// A deliberate copy of `FeedTournament` from server/src/tournaments/feed/types.ts
// rather than an import: this package installs Playwright and a browser, and
// nothing that heavy should be a dependency of the server, in either direction.
// The API validates every field on arrival, so a drift between the two shapes
// fails loudly at the door instead of corrupting the catalog.

export interface ScrapedTournament {
  /** The source's own id, when it publishes one. Prevents recurring events
   *  from collapsing onto one row — see feedRowId on the server. */
  externalId?: string;
  name: string;
  city: string;
  country: string;
  /** Hard | Clay | Grass | Carpet | Unknown — never a guess. */
  surface: string;
  indoorOutdoor: "indoor" | "outdoor";
  federation: "ITF" | "WTA" | "ATP" | "UTR" | "USTA";
  /** e.g. "J300", "Grand Slam", "ATP 500". */
  category: string;
  /** e.g. "ITF World Tennis Tour Juniors". */
  level: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  latitude: number;
  longitude: number;
  entryDeadline?: string;
  ageCategory?: string;
  venue?: string;
  website?: string;
  registeredCount?: number;
  utrRangeMin?: number;
  utrRangeMax?: number;
  sourceUrl?: string;
}

export interface Scraper {
  /** Stable name, stored as `source` on every row it produces. */
  name: string;
  /** Human label for logs. */
  description: string;
  run(options: ScrapeOptions): Promise<ScrapedTournament[]>;
}

export interface ScrapeOptions {
  /** How many months forward to collect. */
  months: number;
  /** Log every step — CI runs with this on, so a failure is diagnosable. */
  verbose: boolean;
}
