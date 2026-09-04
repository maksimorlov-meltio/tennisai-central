// Tournament feed seam — shared types.
//
// A "feed" is any source of tournament rows (the curated static snapshot today,
// a real ITF/ATP/WTA/UTR API tomorrow). Providers all return the same
// `FeedTournament` row shape so `importTournaments` (see ./index.ts) can upsert
// them into the DB without caring where they came from.

/**
 * The shape of one tournament row as it comes off a feed / the curated dataset.
 * Coordinates are required on the feed row (a feed should know where its events
 * are); they land in the nullable Tournament.latitude/longitude columns on import.
 */
export interface FeedTournament {
  /**
   * The source's own stable id for this event, when it has one.
   *
   * Without it the upsert key is name-plus-year, which is unique enough for a
   * professional tour and badly wrong for a source full of recurring club
   * fixtures: UTR repeats the same event name weekly, and 3,248 events
   * collapsed to 2,258 rows before this existed.
   */
  externalId?: string;
  name: string;
  city: string;
  country: string;
  surface: string; // Hard | Clay | Grass | ...
  indoorOutdoor: "indoor" | "outdoor";
  federation: "ITF" | "WTA" | "ATP" | "UTR" | "USTA";
  category: string; // e.g. "Grand Slam", "ATP 1000", "WTA 500", "Challenger", "ITF W35"
  level: string; // e.g. "Professional", "ITF World Tour"
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  latitude: number; // decimal degrees, -90..90
  longitude: number; // decimal degrees, -180..180

  // ── Optional, because not every source publishes them ────────────────────
  // A feed that has these should send them; a feed that does not sends nothing
  // rather than a guess, and the column stays null.

  /** When entries close. The most time-critical fact a coach needs. */
  entryDeadline?: string;
  /** Age band as the source words it, e.g. "18 & Under", "U16". */
  ageCategory?: string;
  /** The event's own page, so a coach can check the detail we do not hold. */
  website?: string;
  venue?: string;
  /** Entries so far — a rough read on field strength. */
  registeredCount?: number;
  /** The rating band the event is aimed at, as numbers. */
  utrRangeMin?: number;
  utrRangeMax?: number;
  /** Where this row came from, for provenance on screen. */
  sourceUrl?: string;
}

/** A named source of tournament rows. */
export interface TournamentFeedProvider {
  /** Stable identifier, stored on every row it produces as `source`. */
  name: string;
  /**
   * Which federation this provider covers, so one failing source can be
   * reported (and retried) without implicating the others.
   */
  federation: FeedTournament["federation"];
  fetchTournaments(): Promise<FeedTournament[]>;
}

/** Per-source outcome of one import run. */
export interface SourceResult {
  source: string;
  federation: string;
  imported: number;
  /** Present only when the source failed; the others still ran. */
  error?: string;
}
