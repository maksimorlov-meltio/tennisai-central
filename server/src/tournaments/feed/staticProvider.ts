// Static-snapshot feed provider — returns the curated real-world dataset.
// This is the default provider used everywhere until a real live feed is wired
// (see httpProvider.ts). It performs no network I/O.

import type { FeedTournament, TournamentFeedProvider } from "./types";
import { TOURNAMENT_DATASET } from "../data/dataset";

export const staticProvider: TournamentFeedProvider = {
  name: "static-snapshot",
  // Mixed by nature — the curated slice spans several tours. ITF is the widest
  // label of the ones the type allows.
  federation: "ITF",
  async fetchTournaments(): Promise<FeedTournament[]> {
    // Return a shallow copy so callers can't mutate the shared module constant.
    return TOURNAMENT_DATASET.map((t) => ({ ...t }));
  },
};
