// The UTR feed reads a private endpoint that can change without warning, so
// these specs pin the two things that decide whether a change is caught or
// silently corrupts the calendar: what a row must contain to be accepted, and
// what happens to the ones that fall short.

import { describe, it, expect } from "vitest";
import {
  createUtrProvider,
  normaliseSurface,
  parseUtrRange,
  surfaceFromDivisions,
  toFeedTournament,
  type FetchLike,
} from "./utrProvider";
import { feedRowId } from "./index";

/** A UTR event shaped exactly as the endpoint returned it on 2 Sep 2026. */
function utrEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 388992,
    name: "MJFC ARAW NG DIGOS Juniors Age Group Tennis Championships",
    surfaceType: null,
    utrRange: "1.0 - 16.0",
    ageRange: "12 & Under",
    registeredCount: 79,
    eventDivisions: [
      {
        surfaces: [{ value: "hardcourt", label: "Hardcourt" }],
        environments: [{ value: "outdoor" }],
      },
    ],
    eventLocations: [
      {
        display: "Digos, Philippines",
        cityName: "Digos",
        countryName: "Philippines",
        streetAddress: "3361 Jose Abad Santos",
        latLng: [6.744971, 125.3567934] as [number, number],
      },
    ],
    eventSchedule: {
      eventStartUtc: "2026-09-02T00:00:00",
      eventEndUtc: "2026-09-08T12:00:00",
      registrationEndUtc: "2026-08-28T04:00:00",
    },
    ...overrides,
  };
}

describe("parseUtrRange", () => {
  it("reads the band the event advertises", () => {
    expect(parseUtrRange("1.0 - 16.0")).toEqual({ min: 1, max: 16 });
    expect(parseUtrRange("4.5-7.25")).toEqual({ min: 4.5, max: 7.25 });
  });

  it("returns nothing rather than a guess for anything else", () => {
    expect(parseUtrRange(null)).toEqual({});
    expect(parseUtrRange("open")).toEqual({});
    expect(parseUtrRange("16.0 - 1.0")).toEqual({}); // backwards
  });
});

describe("surfaceFromDivisions", () => {
  it("reads surface and environment off the divisions, where UTR actually puts them", () => {
    expect(
      surfaceFromDivisions([
        { surfaces: [{ value: "clay" }], environments: [{ value: "outdoor" }] },
      ]),
    ).toEqual({ surface: "Clay", indoorOutdoor: "outdoor" });
  });

  it("takes the most common surface when divisions disagree", () => {
    const mixed = surfaceFromDivisions([
      { surfaces: [{ value: "hardcourt" }], environments: [{ value: "indoor" }] },
      { surfaces: [{ value: "hardcourt" }], environments: [{ value: "indoor" }] },
      { surfaces: [{ value: "clay" }], environments: [{ value: "outdoor" }] },
    ]);
    expect(mixed).toEqual({ surface: "Hard", indoorOutdoor: "indoor" });
  });

  it("says Unknown rather than guessing Hard when nothing is published", () => {
    // A wrong surface changes which players a coach enters. Half the events on
    // this feed genuinely do not state one.
    expect(surfaceFromDivisions([]).surface).toBe("Unknown");
    expect(surfaceFromDivisions(null).surface).toBe("Unknown");
    expect(normaliseSurface(undefined)).toBe("Unknown");
  });
});

describe("toFeedTournament", () => {
  it("maps a real event onto the feed shape", () => {
    const row = toFeedTournament(utrEvent())!;
    expect(row).toMatchObject({
      externalId: "388992",
      city: "Digos",
      country: "Philippines",
      surface: "Hard",
      indoorOutdoor: "outdoor",
      federation: "UTR",
      category: "UTR 1-16",
      utrRangeMin: 1,
      utrRangeMax: 16,
      registeredCount: 79,
      ageCategory: "12 & Under",
    });
  });

  it("treats the zone-less timestamps as UTC, as the source documents", () => {
    const row = toFeedTournament(utrEvent())!;
    expect(row.startDate).toBe("2026-09-02T00:00:00.000Z");
    expect(row.entryDeadline).toBe("2026-08-28T04:00:00.000Z");
  });

  it("drops an event with no usable coordinates instead of importing it blind", () => {
    // Distance sorting and the map are most of what the calendar is for.
    expect(toFeedTournament(utrEvent({ eventLocations: [{ cityName: "X", latLng: null }] }))).toBeNull();
    expect(toFeedTournament(utrEvent({ eventLocations: [] }))).toBeNull();
    expect(
      toFeedTournament(utrEvent({ eventLocations: [{ latLng: [999, 0] }] })),
    ).toBeNull();
  });

  it("drops an event with no name or no dates", () => {
    expect(toFeedTournament(utrEvent({ name: "  " }))).toBeNull();
    expect(toFeedTournament(utrEvent({ eventSchedule: { eventStartUtc: null } }))).toBeNull();
  });
});

describe("the upsert key", () => {
  it("uses UTR's own id, so a weekly fixture does not collapse into one row", () => {
    // The bug this prevents: 3,248 events became 2,258 rows because hundreds of
    // recurring club events share a name within the same year.
    const a = toFeedTournament(utrEvent({ id: 1, name: "Wednesday Night Flex" }))!;
    const b = toFeedTournament(
      utrEvent({
        id: 2,
        name: "Wednesday Night Flex",
        eventSchedule: {
          eventStartUtc: "2026-09-09T00:00:00",
          eventEndUtc: "2026-09-09T12:00:00",
        },
      }),
    )!;

    expect(feedRowId("utr-events", a)).toBe("utr-events-1");
    expect(feedRowId("utr-events", b)).toBe("utr-events-2");
    expect(feedRowId("utr-events", a)).not.toBe(feedRowId("utr-events", b));
  });

  it("still keys the curated snapshot by name and year, so its ids do not move", () => {
    expect(
      feedRowId("static-snapshot", {
        name: "Australian Open",
        startDate: "2026-01-19T00:00:00.000Z",
      } as never),
    ).toBe("australian-open-2026");
  });
});

describe("the provider", () => {
  function fakeFetch(pages: unknown[][]): { impl: FetchLike; urls: string[] } {
    const urls: string[] = [];
    let call = 0;
    const impl: FetchLike = async (url) => {
      urls.push(url);
      const hits = (pages[call++] ?? []).map((source) => ({ source }));
      return { ok: true, status: 200, json: async () => ({ hits }) };
    };
    return { impl, urls };
  }

  it("pages until the source runs out, and identifies itself", async () => {
    const full = Array.from({ length: 100 }, (_, i) => utrEvent({ id: i + 1 }));
    const { impl, urls } = fakeFetch([full, [utrEvent({ id: 999 })]]);

    const rows = await createUtrProvider(impl).fetchTournaments();

    expect(rows).toHaveLength(101);
    expect(urls[0]).toContain("skip=0");
    expect(urls[1]).toContain("skip=100");
  });

  it("keeps one row per event when the source repeats an id across pages", async () => {
    const dup = utrEvent({ id: 42 });
    const { impl } = fakeFetch([[dup], [dup]]);
    const rows = await createUtrProvider(impl).fetchTournaments();
    expect(rows).toHaveLength(1);
  });

  it("throws when the very first page fails, so the run is recorded as failed", async () => {
    const impl: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(createUtrProvider(impl).fetchTournaments()).rejects.toThrow(/503/);
  });

  it("keeps what it already has when a later page fails", async () => {
    // Half a calendar beats none, and the previous rows are still valid.
    let call = 0;
    const impl: FetchLike = async () => {
      if (call++ === 0) {
        const hits = Array.from({ length: 100 }, (_, i) => ({ source: utrEvent({ id: i + 1 }) }));
        return { ok: true, status: 200, json: async () => ({ hits }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    };

    const rows = await createUtrProvider(impl).fetchTournaments();
    expect(rows).toHaveLength(100);
  });
});
