// ============================================================================
// Export scoping.
//
// The failure this guards against is concrete: a coach with the ITF and UTR
// calendars subscribed has thousands of tournaments in the filtered list. Hand
// that whole list to the writer and the "next month's schedule" a parent asked
// for arrives as a 1,700-entry season dump.
//
// So the range has to match what the grid is showing — same week start, same
// local days — and it has to catch the tournament that began last month and is
// still running.
// ============================================================================

import { describe, it, expect } from "vitest";
import { periodRange, eventsInRange, icsFileName } from "../scope";

/** 4 September 2026 is a Friday. */
const FRIDAY = new Date(2026, 8, 4, 15, 30);

describe("periodRange", () => {
  it("spans the whole calendar month", () => {
    const { start, end } = periodRange("month", FRIDAY);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(30);
    expect(end.getHours()).toBe(23);
  });

  it("starts the week on Monday, as the grid and the heading do", () => {
    // A Sunday-start week here would export a different seven days from the
    // seven on screen.
    const { start, end } = periodRange("week", FRIDAY);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(31); // Mon 31 Aug
    expect(end.getDay()).toBe(0);
    expect(end.getDate()).toBe(6); // Sun 6 Sep
  });

  it("spans one whole local day", () => {
    const { start, end } = periodRange("day", FRIDAY);
    expect(start.getDate()).toBe(4);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(4);
    expect(end.getHours()).toBe(23);
  });
});

describe("eventsInRange", () => {
  const range = periodRange("month", FRIDAY); // September 2026

  const ev = (id: string, startDate: string, endDate: string) => ({ id, startDate, endDate });

  it("keeps an event inside the range", () => {
    const events = [ev("in", "2026-09-10T07:00:00Z", "2026-09-10T08:00:00Z")];
    expect(eventsInRange(events, range).map((e) => e.id)).toEqual(["in"]);
  });

  it("drops events either side of it", () => {
    const events = [
      ev("before", "2026-08-10T07:00:00Z", "2026-08-10T08:00:00Z"),
      ev("after", "2026-10-10T07:00:00Z", "2026-10-10T08:00:00Z"),
    ];
    expect(eventsInRange(events, range)).toEqual([]);
  });

  it("keeps a multi-day tournament that only overlaps the range", () => {
    // A fortnight starting in August is still part of September's schedule.
    const events = [
      ev("straddles-start", "2026-08-24T00:00:00Z", "2026-09-06T00:00:00Z"),
      ev("straddles-end", "2026-09-28T00:00:00Z", "2026-10-11T00:00:00Z"),
    ];
    expect(eventsInRange(events, range).map((e) => e.id)).toEqual(["straddles-start", "straddles-end"]);
  });

  it("drops an event whose start date cannot be parsed", () => {
    // Keeping it would make the count on the button disagree with the file,
    // since the writer skips it too.
    expect(eventsInRange([ev("junk", "not a date", "also not")], range)).toEqual([]);
  });

  it("falls back to the start when only the end is unusable", () => {
    expect(eventsInRange([ev("half", "2026-09-10T07:00:00Z", "")], range).map((e) => e.id)).toEqual(["half"]);
  });

  it("returns nothing for an empty list", () => {
    expect(eventsInRange([], range)).toEqual([]);
  });
});

describe("icsFileName", () => {
  it("names the month", () => {
    expect(icsFileName("month", FRIDAY)).toBe("tennisai-calendar-2026-09.ics");
  });

  it("names both ends of the week", () => {
    expect(icsFileName("week", FRIDAY)).toBe("tennisai-calendar-2026-08-31-to-2026-09-06.ics");
  });

  it("names the day", () => {
    expect(icsFileName("day", FRIDAY)).toBe("tennisai-calendar-2026-09-04.ics");
  });
});
