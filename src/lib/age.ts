// ============================================================================
// Age maths — pure calendar arithmetic, no Date parsing of the input.
//
// WHY IT LOOKS LIKE THIS
// A date of birth is a CALENDAR date ("2011-03-04"), not an instant. Feeding it
// to `new Date("2011-03-04")` produces midnight UTC, which is the 3rd of March
// for anyone west of Greenwich — so a browser in New York would compute an age
// one day out for every person whose birthday is today. Everything below works
// on the (year, month, day) triple directly, so there is no timezone in the
// arithmetic at all. The only timezone decision is which calendar day counts as
// "today", and that is made explicitly by the caller (`todayLocal` / `todayUtc`).
//
// A NEAR-IDENTICAL COPY LIVES AT server/src/auth/age.ts. The two cannot share a
// module (separate packages, separate tsconfigs) and the server is the one that
// decides; this copy exists so the sign-up form can show the guardian fields
// before anything is submitted. Both are covered by matching tests.
// ============================================================================

export interface CalendarDate {
  /** Full year, e.g. 2011. */
  year: number;
  /** 1-12. */
  month: number;
  /** 1-31. */
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Proleptic Gregorian leap rule — the one `<input type="date">` uses. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/**
 * Parse a strict `yyyy-MM-dd` string. Returns null for anything else —
 * including dates that look well-formed but do not exist (2025-02-29), which
 * `new Date()` would silently roll forward to the 1st of March.
 */
export function parseIsoDate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/**
 * Completed years between two calendar dates.
 *
 * LEAP-DAY RULE: someone born on 29 February has no birthday in a common year,
 * so this treats them as ageing up on 1 March — they are still 15 on 28 Feb.
 * That is the ordinary reading of "has reached the age of", and it is the
 * conservative direction for a consent gate: it never makes a child older
 * than they are.
 */
export function ageOnDate(dateOfBirth: CalendarDate, today: CalendarDate): number {
  let age = today.year - dateOfBirth.year;
  const beforeBirthday =
    today.month < dateOfBirth.month ||
    (today.month === dateOfBirth.month && today.day < dateOfBirth.day);
  if (beforeBirthday) age -= 1;
  return age;
}

/** The largest plausible age; anything beyond it is a typo, not a person. */
export const MAX_PLAUSIBLE_AGE = 120;

/**
 * Age in completed years from a `yyyy-MM-dd` string, or null when the string is
 * not a real date, is in the future, or implies an impossible age.
 *
 * Null means "cannot derive an age" — callers must treat it as a validation
 * failure, never as "old enough".
 */
export function ageFromIsoDate(dateOfBirth: string, today: CalendarDate): number | null {
  const parsed = parseIsoDate(dateOfBirth);
  if (!parsed) return null;
  const age = ageOnDate(parsed, today);
  if (age < 0 || age > MAX_PLAUSIBLE_AGE) return null;
  return age;
}

/** Today in the viewer's own timezone — the calendar day a person is living in. */
export function todayLocal(now: Date = new Date()): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Today in UTC — what the server uses, so its answer does not move with the host. */
export function todayUtc(now: Date = new Date()): CalendarDate {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

/** Format a CalendarDate back to `yyyy-MM-dd` (for `<input type="date">` bounds). */
export function toIsoDate(date: CalendarDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}
