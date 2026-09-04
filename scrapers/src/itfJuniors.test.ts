// The ITF table is read out of a page that can be restyled at any time, and
// every value here is parsed from text. These specs pin the parsing against
// cells captured verbatim from the live calendar on 2 Sep 2026 — including the
// two oddities that cost real rows when they were missed.

import { describe, it, expect } from "vitest";
import {
  cleanCell,
  cleanName,
  normaliseCategory,
  normaliseCity,
  normaliseCountry,
  parseDateRange,
  parseSurface,
  toRawRow,
  monthsFrom,
} from "./itfJuniors";

// Exactly as page.evaluate returned them.
const REAL_ROW = [
  "J300 REPENTIGNYJ300 REPENTIGNY (CAN)",
  "Date:29 Aug to 04 Sep 2026",
  "Ho st Nation:Canada",
  "City/Town:Repentigny",
  "Category:J300",
  "Surface:Outdoor - Hard",
  "Status :",
];

describe("cleanCell", () => {
  it("strips the responsive table's column label", () => {
    expect(cleanCell("Date:29 Aug to 04 Sep 2026")).toBe("29 Aug to 04 Sep 2026");
    expect(cleanCell("City/Town:Repentigny")).toBe("Repentigny");
  });

  it("leaves an unlabelled value alone", () => {
    expect(cleanCell("  Outdoor - Hard ")).toBe("Outdoor - Hard");
  });

  it("keeps every letter", () => {
    // An in-page regex once collapsed to /s+/ and deleted every "s" on the
    // page: Astana read as "A tana" and looked plausible enough to ship.
    expect(cleanCell("City/Town:Astana")).toBe("Astana");
    expect(cleanCell("Ho st Nation:Kazakhstan")).toBe("Kazakhstan");
  });
});

describe("cleanName", () => {
  it("un-duplicates the name and drops the country code", () => {
    expect(cleanName("J300 REPENTIGNYJ300 REPENTIGNY (CAN)")).toBe("J300 REPENTIGNY");
  });

  it("leaves a name that is not duplicated", () => {
    expect(cleanName("US OPEN JUNIOR TENNIS CHAMPIONSHIPS (USA)")).toBe(
      "US OPEN JUNIOR TENNIS CHAMPIONSHIPS",
    );
  });
});

describe("parseDateRange", () => {
  it("reads a range inside one month", () => {
    const r = parseDateRange("29 Aug to 04 Sep 2026")!;
    expect(r.start).toBe("2026-08-29T00:00:00.000Z");
    expect(r.end).toBe("2026-09-04T00:00:00.000Z");
  });

  it("infers the start year, including across New Year", () => {
    // The start year is printed only when it differs, so a December-to-January
    // fixture is the case a naive reading gets wrong by a full year.
    const r = parseDateRange("28 Dec to 03 Jan 2027")!;
    expect(r.start).toBe("2026-12-28T00:00:00.000Z");
    expect(r.end).toBe("2027-01-03T00:00:00.000Z");
  });

  it("returns nothing for text that is not a range", () => {
    expect(parseDateRange("TBC")).toBeNull();
    expect(parseDateRange("")).toBeNull();
  });
});

describe("parseSurface", () => {
  it("splits the surface from the environment", () => {
    expect(parseSurface("Outdoor - Hard")).toEqual({ surface: "Hard", indoorOutdoor: "outdoor" });
    expect(parseSurface("Indoor - Carpet")).toEqual({ surface: "Carpet", indoorOutdoor: "indoor" });
    expect(parseSurface("Outdoor - Clay")).toEqual({ surface: "Clay", indoorOutdoor: "outdoor" });
  });

  it("says Unknown rather than guessing", () => {
    expect(parseSurface("Outdoor -").surface).toBe("Unknown");
  });
});

describe("normaliseCountry / normaliseCity", () => {
  it("translates the names ITF uses that no geocoder knows", () => {
    // These eight cost 10 of 135 events in a single month, J300 Beijing among them.
    expect(normaliseCountry("Chinese Taipei")).toBe("Taiwan");
    expect(normaliseCountry("China, P.R.")).toBe("China");
    expect(normaliseCountry("Korea, Rep.")).toBe("South Korea");
    expect(normaliseCountry("Great Britain")).toBe("United Kingdom");
  });

  it("leaves an ordinary country alone", () => {
    expect(normaliseCountry("Canada")).toBe("Canada");
  });

  it("drops the entry-status suffix from a city", () => {
    expect(normaliseCity("Vyshkovo (CLOSED)")).toBe("Vyshkovo");
    expect(normaliseCity("Repentigny")).toBe("Repentigny");
  });
});

describe("normaliseCategory", () => {
  it("keeps the grade, which is what a coach chooses on", () => {
    expect(normaliseCategory("J300")).toBe("J300");
    expect(normaliseCategory("jgs")).toBe("JGS");
  });

  it("falls back to a label rather than an empty string", () => {
    expect(normaliseCategory("")).toBe("ITF Juniors");
  });
});

describe("toRawRow", () => {
  it("turns a real captured row into clean fields", () => {
    expect(toRawRow(REAL_ROW)).toEqual({
      name: "J300 REPENTIGNY",
      dates: "29 Aug to 04 Sep 2026",
      country: "Canada",
      city: "Repentigny",
      category: "J300",
      surface: "Outdoor - Hard",
    });
  });

  it("rejects a header or filler row", () => {
    expect(toRawRow(["Name", "Date", "Host Nation", "City/Town", "Category", "Surface"])).toBeNull();
    expect(toRawRow([])).toBeNull();
  });
});

describe("monthsFrom", () => {
  it("counts forward in ITF's own parameter format, rolling the year", () => {
    expect(monthsFrom(new Date("2026-11-15T00:00:00Z"), 4)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});
