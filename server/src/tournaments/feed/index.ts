// Tournament feed seam — provider selection + DB import.
//
// `getFeedProvider()` picks the live HTTP provider when a feed is configured
// (both FEED_API_URL and FEED_API_KEY set), otherwise the curated static
// snapshot. `importTournaments()` pulls rows from the chosen provider and
// UPSERTS them into the Tournament table (idempotent).

import type { PrismaClient } from "@prisma/client";
import { env } from "../../env";
import type { TournamentFeedProvider } from "./types";
import { staticProvider } from "./staticProvider";
import { httpProvider } from "./httpProvider";

/**
 * Select the active feed provider. The live HTTP provider is used only when
 * BOTH FEED_API_URL and FEED_API_KEY are configured; otherwise we fall back to
 * the curated static snapshot (the safe, always-available default).
 */
export function getFeedProvider(): TournamentFeedProvider {
  if (env.feedApiUrl && env.feedApiKey) return httpProvider;
  return staticProvider;
}

/**
 * Deterministic, stable natural key for a tournament: a URL-safe slug of the
 * name plus the start year (e.g. "australian-open-2026"). This is the chosen
 * UPSERT key — we set it as the Tournament primary id so re-importing the same
 * feed updates rows in place instead of creating duplicates. Name+startYear is
 * stable across imports and disambiguates the same event across seasons.
 */
export function tournamentSlug(name: string, startDate: string): string {
  const year = new Date(startDate).getUTCFullYear();
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
  return `${base}-${year}`;
}

/**
 * Fetch tournaments from the active provider and upsert them into the DB.
 * Upsert key: the deterministic `tournamentSlug` used as the row id, so the
 * import is idempotent (re-running updates in place, never duplicates).
 * Returns the number of rows imported and the provider name (the `source`).
 */
export async function importTournaments(
  prisma: PrismaClient,
): Promise<{ imported: number; source: string }> {
  const provider = getFeedProvider();
  const rows = await provider.fetchTournaments();

  let imported = 0;
  for (const r of rows) {
    const id = tournamentSlug(r.name, r.startDate);
    const values = {
      name: r.name,
      city: r.city,
      country: r.country,
      surface: r.surface,
      indoorOutdoor: r.indoorOutdoor,
      federation: r.federation,
      category: r.category,
      level: r.level,
      startDate: new Date(r.startDate),
      endDate: new Date(r.endDate),
      latitude: r.latitude,
      longitude: r.longitude,
    };
    await prisma.tournament.upsert({
      where: { id },
      update: values,
      create: { id, ...values },
    });
    imported++;
  }

  return { imported, source: provider.name };
}
