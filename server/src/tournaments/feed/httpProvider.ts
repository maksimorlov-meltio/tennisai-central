// HTTP (live) feed provider — STUB / extension point ONLY.
//
// ⚠️  THIS IS NOT A WORKING LIVE FEED. It is the documented seam where a real
// ITF / ATP / WTA / UTR tournament API (or an internal aggregator) would be
// integrated later. It intentionally does NOT perform any HTTP request or
// scraping today — calling fetchTournaments() always throws.
//
// When a real feed is implemented here:
//   • Read the endpoint from env.feedApiUrl and authenticate with env.feedApiKey.
//   • The API key is a SERVER-SIDE SECRET. It must NEVER be sent to the browser,
//     embedded in a client bundle, logged, or returned in an API response. It
//     stays on the server; only normalized `FeedTournament[]` rows leave here.
//   • Map the upstream payload into the `FeedTournament` shape (including real
//     latitude/longitude) before returning.

import type { FeedTournament, TournamentFeedProvider } from "./types";
import { env } from "../../env";

export const httpProvider: TournamentFeedProvider = {
  name: "http-live",
  // A licensed feed is expected to cover every tour; ITF is the placeholder
  // label until one is wired and can report per-source properly.
  federation: "ITF",
  async fetchTournaments(): Promise<FeedTournament[]> {
    if (!env.feedApiUrl || !env.feedApiKey) {
      throw new Error(
        "live feed not configured — set FEED_API_URL/FEED_API_KEY to enable the HTTP tournament feed",
      );
    }
    // Config is present but the live integration is deliberately not built.
    throw new Error(
      "live tournament feed is not implemented — httpProvider is a stub seam. " +
        "Implement the real ITF/ATP/WTA/UTR API call here (server-side only; never expose FEED_API_KEY to the client).",
    );
  },
};
