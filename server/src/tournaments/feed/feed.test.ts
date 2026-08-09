import { describe, it, expect } from "vitest";
import { staticProvider } from "./staticProvider";
import { getFeedProvider, tournamentSlug } from "./index";
import { TOURNAMENT_DATASET } from "../data/dataset";

// These tests are pure — they touch no database. The static provider and the
// slug helper are deterministic, so they can run in CI without Postgres.

describe("staticProvider", () => {
  it('is named "static-snapshot"', () => {
    expect(staticProvider.name).toBe("static-snapshot");
  });

  it("returns a non-empty list of tournaments", async () => {
    const rows = await staticProvider.fetchTournaments();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBe(TOURNAMENT_DATASET.length);
  });

  it("returns a fresh copy (callers cannot mutate the shared dataset)", async () => {
    const rows = await staticProvider.fetchTournaments();
    rows[0].name = "MUTATED";
    expect(TOURNAMENT_DATASET[0].name).not.toBe("MUTATED");
  });

  it("gives every row a finite latitude/longitude within valid geographic range", async () => {
    const rows = await staticProvider.fetchTournaments();
    for (const t of rows) {
      expect(Number.isFinite(t.latitude), `${t.name} latitude`).toBe(true);
      expect(Number.isFinite(t.longitude), `${t.name} longitude`).toBe(true);
      expect(t.latitude).toBeGreaterThanOrEqual(-90);
      expect(t.latitude).toBeLessThanOrEqual(90);
      expect(t.longitude).toBeGreaterThanOrEqual(-180);
      expect(t.longitude).toBeLessThanOrEqual(180);
    }
  });

  it("gives every row parseable ISO start/end dates with end >= start", async () => {
    const rows = await staticProvider.fetchTournaments();
    for (const t of rows) {
      const start = new Date(t.startDate).getTime();
      const end = new Date(t.endDate).getTime();
      expect(Number.isNaN(start), `${t.name} startDate`).toBe(false);
      expect(Number.isNaN(end), `${t.name} endDate`).toBe(false);
      expect(end).toBeGreaterThanOrEqual(start);
    }
  });

  it("spans multiple federations including at least one German host", async () => {
    const rows = await staticProvider.fetchTournaments();
    const federations = new Set(rows.map((t) => t.federation));
    // A meaningful spread for the calendar federation filter.
    expect(federations.size).toBeGreaterThanOrEqual(3);
    expect(rows.some((t) => t.country === "Germany")).toBe(true);
  });
});

describe("getFeedProvider", () => {
  it("defaults to the static snapshot when no live feed is configured", () => {
    // FEED_API_URL / FEED_API_KEY are unset in the test env.
    expect(getFeedProvider().name).toBe("static-snapshot");
  });
});

describe("tournamentSlug (upsert key)", () => {
  it("combines a slugified name with the start year", () => {
    expect(tournamentSlug("Australian Open", "2026-01-19T00:00:00.000Z")).toBe("australian-open-2026");
    expect(tournamentSlug("Wimbledon", "2026-06-29T00:00:00.000Z")).toBe("wimbledon-2026");
  });

  it("is deterministic for the same input", () => {
    const a = tournamentSlug("Miami Open", "2026-03-23T00:00:00.000Z");
    const b = tournamentSlug("Miami Open", "2026-03-23T00:00:00.000Z");
    expect(a).toBe(b);
  });

  it("collapses punctuation and accents to hyphen-separated ascii", () => {
    expect(tournamentSlug("Roland-Garros", "2026-05-24T00:00:00.000Z")).toBe("roland-garros-2026");
    expect(tournamentSlug("Internazionali BNL d'Italia", "2026-05-11T00:00:00.000Z")).toBe(
      "internazionali-bnl-d-italia-2026",
    );
    // Diacritics are stripped (NFKD + combining-mark removal): "Zürich" → "zurich".
    expect(tournamentSlug("Zürich Open", "2026-07-01T00:00:00.000Z")).toBe("zurich-open-2026");
  });

  it("disambiguates the same event across seasons by year", () => {
    expect(tournamentSlug("US Open", "2025-08-25T00:00:00.000Z")).toBe("us-open-2025");
    expect(tournamentSlug("US Open", "2026-08-31T00:00:00.000Z")).toBe("us-open-2026");
  });

  it("produces ids that match every dataset row (no collisions)", async () => {
    const rows = await staticProvider.fetchTournaments();
    const ids = rows.map((t) => tournamentSlug(t.name, t.startDate));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
