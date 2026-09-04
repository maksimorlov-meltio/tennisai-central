// ============================================================================
// Unit tests — browser-side age maths (src/lib/age.ts).
//
// The mirror of these cases lives at server/src/auth/age.test.ts. When one
// changes, change the other: this copy decides whether the sign-up form asks
// for guardian details, the server copy decides whether consent is required.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  ageFromIsoDate,
  ageOnDate,
  daysInMonth,
  isLeapYear,
  parseIsoDate,
  todayLocal,
  todayUtc,
  toIsoDate,
  MAX_PLAUSIBLE_AGE,
  type CalendarDate,
} from "@/lib/age";

const on = (iso: string): CalendarDate => {
  const parsed = parseIsoDate(iso);
  if (!parsed) throw new Error(`bad fixture date: ${iso}`);
  return parsed;
};

describe("parseIsoDate", () => {
  it("accepts a well-formed yyyy-MM-dd", () => {
    expect(parseIsoDate("2011-03-04")).toEqual({ year: 2011, month: 3, day: 4 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseIsoDate("  2011-03-04 ")).toEqual({ year: 2011, month: 3, day: 4 });
  });

  it("rejects anything that is not strictly yyyy-MM-dd", () => {
    for (const bad of [
      "",
      "2011-3-4",
      "04/03/2011",
      "2011-03-04T00:00:00Z",
      "not-a-date",
      "20110304",
      "2011-03",
    ]) {
      expect(parseIsoDate(bad), bad).toBeNull();
    }
  });

  it("rejects dates that do NOT exist, which `new Date()` would roll forward", () => {
    // new Date("2025-02-29") silently becomes 1 March — the exact class of bug
    // this parser exists to prevent.
    expect(parseIsoDate("2025-02-29")).toBeNull();
    expect(parseIsoDate("2011-04-31")).toBeNull();
    expect(parseIsoDate("2011-13-01")).toBeNull();
    expect(parseIsoDate("2011-00-10")).toBeNull();
    expect(parseIsoDate("2011-01-00")).toBeNull();
    expect(parseIsoDate("2011-01-32")).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseIsoDate("2000-02-29")).toEqual({ year: 2000, month: 2, day: 29 });
  });
});

describe("leap years", () => {
  it("follows the full Gregorian rule, centuries included", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // divisible by 100, not by 400
    expect(isLeapYear(2000)).toBe(true); // divisible by 400
    expect(isLeapYear(2100)).toBe(false);
  });

  it("reports February's length accordingly", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2025, 12)).toBe(31);
    expect(daysInMonth(2025, 13)).toBe(0);
  });
});

describe("ageOnDate — the birthday boundary", () => {
  const dob = on("2010-06-15");

  it("is one year short the DAY BEFORE the birthday", () => {
    expect(ageOnDate(dob, on("2026-06-14"))).toBe(15);
  });

  it("ticks over ON the birthday, not the day after", () => {
    expect(ageOnDate(dob, on("2026-06-15"))).toBe(16);
  });

  it("stays put the day after", () => {
    expect(ageOnDate(dob, on("2026-06-16"))).toBe(16);
  });

  it("handles the same-month-earlier-day and earlier-month cases", () => {
    expect(ageOnDate(dob, on("2026-05-31"))).toBe(15);
    expect(ageOnDate(dob, on("2026-12-31"))).toBe(16);
    expect(ageOnDate(dob, on("2026-01-01"))).toBe(15);
  });

  it("is 0 on the day someone is born", () => {
    expect(ageOnDate(on("2026-09-04"), on("2026-09-04"))).toBe(0);
  });
});

describe("ageOnDate — 29 February birthdays", () => {
  const leapling = on("2008-02-29");

  it("ages up on the real date in a leap year", () => {
    expect(ageOnDate(leapling, on("2024-02-28"))).toBe(15);
    expect(ageOnDate(leapling, on("2024-02-29"))).toBe(16);
  });

  it("ages up on 1 March in a common year — never early, which is the safe direction", () => {
    expect(ageOnDate(leapling, on("2025-02-28"))).toBe(16);
    expect(ageOnDate(leapling, on("2025-03-01"))).toBe(17);
  });
});

describe("ageFromIsoDate", () => {
  it("returns the age for a valid date", () => {
    expect(ageFromIsoDate("2010-06-15", on("2026-09-04"))).toBe(16);
  });

  it("returns null — never a number — for input it cannot trust", () => {
    // Null must be read as "cannot derive an age", so a caller that treats a
    // number as permission can never be handed one by accident.
    expect(ageFromIsoDate("2025-02-29", on("2026-09-04"))).toBeNull(); // not a real day
    expect(ageFromIsoDate("nonsense", on("2026-09-04"))).toBeNull();
    expect(ageFromIsoDate("2027-01-01", on("2026-09-04"))).toBeNull(); // in the future
    expect(ageFromIsoDate("1700-01-01", on("2026-09-04"))).toBeNull(); // implausible
  });

  it("accepts the extremes it should: born today, and the oldest plausible age", () => {
    expect(ageFromIsoDate("2026-09-04", on("2026-09-04"))).toBe(0);
    expect(ageFromIsoDate("1906-09-04", on("2026-09-04"))).toBe(MAX_PLAUSIBLE_AGE);
    expect(ageFromIsoDate("1905-09-04", on("2026-09-04"))).toBeNull(); // 121 — a typo, not a person
  });
});

describe("today, and why the timezone never reaches the arithmetic", () => {
  it("todayUtc and todayLocal read the SAME instant through different calendars", () => {
    // 2026-01-01T00:30:00Z is still 31 December in any timezone behind UTC.
    // Whichever side of midnight the test host sits on, both helpers must agree
    // with their own clock — that is the only timezone decision in the module.
    const instant = new Date("2026-01-01T00:30:00.000Z");
    expect(todayUtc(instant)).toEqual({ year: 2026, month: 1, day: 1 });
    expect(todayLocal(instant)).toEqual({
      year: instant.getFullYear(),
      month: instant.getMonth() + 1,
      day: instant.getDate(),
    });
  });

  it("derives the same age from a date-of-birth STRING regardless of host timezone", () => {
    // The bug this module exists to prevent: `new Date("2010-06-15")` is
    // midnight UTC, which is 14 June in New York. Parsing the components makes
    // the answer independent of where the process runs.
    const dobIso = "2010-06-15";
    expect(ageFromIsoDate(dobIso, { year: 2026, month: 6, day: 15 })).toBe(16);
    // Same string via the JS Date path would drift; ours cannot, because the
    // string never becomes a Date.
    expect(parseIsoDate(dobIso)).toEqual({ year: 2010, month: 6, day: 15 });
  });
});

describe("toIsoDate", () => {
  it("round-trips through parseIsoDate with zero padding", () => {
    expect(toIsoDate({ year: 2011, month: 3, day: 4 })).toBe("2011-03-04");
    expect(parseIsoDate(toIsoDate({ year: 2011, month: 12, day: 31 }))).toEqual({
      year: 2011,
      month: 12,
      day: 31,
    });
  });
});
