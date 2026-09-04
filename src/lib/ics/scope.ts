// ============================================================================
// What an export covers.
//
// The calendar's filtered event list is not the same thing as "what is on the
// screen": with the ITF and UTR calendars subscribed it holds thousands of
// tournaments spanning the whole season. Exporting that produces a file nobody
// can send to a parent, so an export is scoped to the period being viewed as
// well as to the active filters.
//
// Pure, and independent of CalendarPage — the period union is redeclared here
// rather than imported, because importing `ViewMode` from the page is exactly
// the cycle this module exists to avoid.
// ============================================================================

import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, format,
} from "date-fns";

/** Matches CalendarPage's `ViewMode` by value, not by import. */
export type IcsPeriod = "month" | "week" | "day";

export interface IcsRange {
  start: Date;
  end: Date;
}

/**
 * The local-time span the calendar is showing.
 *
 * Local, and `weekStartsOn: 1`, to match the grid and the heading above it —
 * an export whose range disagreed with the dates on screen would be worse than
 * no export.
 */
export function periodRange(period: IcsPeriod, date: Date): IcsRange {
  if (period === "week") {
    return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) };
  }
  if (period === "day") {
    return { start: startOfDay(date), end: endOfDay(date) };
  }
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

/**
 * Events overlapping the range at all — a fortnight-long tournament belongs in
 * September's export even if it started in August.
 *
 * Events with an unparseable date are dropped here as well as in the writer, so
 * the count shown on the button is the count that lands in the file.
 */
export function eventsInRange<T extends { startDate: string; endDate: string }>(
  events: T[],
  range: IcsRange,
): T[] {
  const from = range.start.getTime();
  const to = range.end.getTime();
  return events.filter((event) => {
    const start = new Date(event.startDate).getTime();
    if (Number.isNaN(start)) return false;
    const parsedEnd = new Date(event.endDate).getTime();
    const end = Number.isNaN(parsedEnd) ? start : parsedEnd;
    return end >= from && start <= to;
  });
}

/**
 * A filename that says what is inside without being opened — the file is going
 * to land in somebody's Downloads folder next to four others.
 */
export function icsFileName(period: IcsPeriod, date: Date, prefix = "tennisai-calendar"): string {
  if (period === "month") return `${prefix}-${format(date, "yyyy-MM")}.ics`;
  if (period === "day") return `${prefix}-${format(date, "yyyy-MM-dd")}.ics`;
  const range = periodRange("week", date);
  return `${prefix}-${format(range.start, "yyyy-MM-dd")}-to-${format(range.end, "yyyy-MM-dd")}.ics`;
}
