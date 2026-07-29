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
}

/** A named source of tournament rows. */
export interface TournamentFeedProvider {
  /** Stable identifier reported back as `source` from an import. */
  name: string;
  fetchTournaments(): Promise<FeedTournament[]>;
}
