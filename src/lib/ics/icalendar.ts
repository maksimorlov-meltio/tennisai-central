// ============================================================================
// iCalendar (RFC 5545) writer.
//
// Hand-written on purpose. .ics is a line-oriented text format with four rules
// that actually matter — CRLF endings, escaping inside TEXT values, folding at
// 75 octets, and DATE vs DATE-TIME — and every one of them is a few lines here.
// A dependency would be more code to audit than this file.
//
// PURE. No DOM, no React, no imports from any page. `src/pages/CalendarPage.tsx`
// imports *from* here; the reverse would make
// `src/pages/__tests__/calendarProjection.test.ts` (which imports CalendarPage
// directly) load a cycle that only shows up at test time.
// ============================================================================

/**
 * The shape this writer needs from a calendar event.
 *
 * Declared structurally rather than importing `CalendarEvent` from `@/types` so
 * the writer can be exercised with plain literals — `CalendarEvent` satisfies
 * it as-is.
 *
 * `coachNotes` is deliberately absent. Notes are hidden from observers in the
 * app; a file leaves the app entirely, and the whole point of this export is a
 * coach handing a schedule to a parent.
 */
export interface IcsEventInput {
  id: string;
  title: string;
  type?: string;
  state?: string;
  /** ISO 8601. */
  startDate: string;
  /** ISO 8601. */
  endDate: string;
  location?: string;
  description?: string;
  playerName?: string;
  recurrenceParentId?: string;
}

export interface BuildIcsOptions {
  /** X-WR-CALNAME — what a calendar app shows the import as. */
  calendarName?: string;
  /** DTSTAMP for every VEVENT. Injectable so tests are deterministic. */
  now?: Date;
  /** Prefix SUMMARY with the player's name, mirroring the on-screen chips. */
  includePlayerName?: boolean;
  /** Right-hand side of every UID. */
  uidDomain?: string;
}

const PRODID = "-//TennisAI//Calendar Export//EN";
const DEFAULT_UID_DOMAIN = "tennisai.app";

/** Folding is defined in octets, and the app's own data is not ASCII (`·`). */
const encoder = new TextEncoder();

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** UTF-8 length of a string, in octets. */
export function octetLength(value: string): number {
  return encoder.encode(value).length;
}

/**
 * Escape a TEXT value (RFC 5545 §3.3.11).
 *
 * Backslash first — otherwise the backslashes this function itself introduces
 * get escaped a second time and every comma arrives as `\\,`. Colon is NOT
 * escaped in TEXT; only in some property parameters, which this writer does
 * not emit.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Fold one content line to 75 octets (RFC 5545 §3.1), returning the physical
 * lines it becomes.
 *
 * Continuations begin with a single space, and that space counts against the
 * 75. Splitting happens between code points, never inside a multi-byte
 * character — a half-written `·` would make the file invalid UTF-8.
 */
export function foldLine(line: string): string[] {
  if (octetLength(line) <= 75) return [line];

  const out: string[] = [];
  let current = "";
  let bytes = 0;

  for (const char of line) {
    const size = octetLength(char);
    if (bytes + size > 75) {
      out.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  out.push(current);
  return out;
}

/** `20260904T143000Z`. UTC getters only — a local `format()` here would shift
 *  every exported event by the exporting machine's offset. */
export function formatUtcDateTime(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** `20260904` — the DATE form, used for all-day events. */
export function formatUtcDate(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function isUtcMidnight(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/**
 * Whether a pair of instants describes whole days rather than a time of day.
 *
 * Tournaments arrive from the feed as `2026-01-19T00:00:00Z` →
 * `2026-02-01T00:00:00Z`: a fortnight, stored as midnight UTC because no start
 * time is published. Written as DATE-TIME those become "02:00 – 02:00" in
 * Madrid and a one-line sliver in every calendar app. Both ends must be exactly
 * midnight UTC, so a real 00:00–23:59 block still exports as timed.
 */
export function isAllDayRange(start: Date, end: Date): boolean {
  return isUtcMidnight(start) && isUtcMidnight(end);
}

/** The day after `date`, in UTC. DTEND on an all-day event is exclusive. */
function nextUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/** RFC 5545 has three VEVENT statuses; the app has five states. */
export function icsStatus(state?: string): string | undefined {
  switch (state) {
    case "confirmed":
    case "completed":
      return "CONFIRMED";
    case "requested":
    case "tentative":
      return "TENTATIVE";
    case "cancelled":
      return "CANCELLED";
    default:
      return undefined;
  }
}

/**
 * A UID must be globally unique and stable for the same event across exports —
 * that is what lets a re-import update the entry a coach already has rather
 * than duplicating it. So it is derived from the event id, never from the
 * position in the array or from the export time.
 *
 * Recurring occurrences already carry distinct ids (`<parent>_occ_3`, see
 * server/src/calendar/recurrence.ts), but two feeds could still collide; the
 * start instant disambiguates without introducing order dependence.
 */
function makeUid(event: IcsEventInput, start: Date, taken: Set<string>, domain: string): string {
  const base = event.id.replace(/[\s\r\n]+/g, "");
  const candidates = [base, `${base}-${formatUtcDateTime(start)}`];
  for (const candidate of candidates) {
    const uid = `${candidate}@${domain}`;
    if (!taken.has(uid)) return uid;
  }
  let n = 2;
  let uid = `${base}-${formatUtcDateTime(start)}-${n}@${domain}`;
  while (taken.has(uid)) {
    n += 1;
    uid = `${base}-${formatUtcDateTime(start)}-${n}@${domain}`;
  }
  return uid;
}

/** One `NAME:value` content line, escaped and folded. */
function textLine(name: string, value: string): string[] {
  return foldLine(`${name}:${escapeText(value)}`);
}

/**
 * Build the VEVENT lines for one event, or `null` if its dates are unusable.
 *
 * An event with a broken date is skipped rather than emitted with a garbage
 * DTSTART: one malformed VEVENT can make a whole file unreadable to a strict
 * importer, which would lose the other thirty.
 */
function buildEvent(
  event: IcsEventInput,
  options: Required<Pick<BuildIcsOptions, "includePlayerName" | "uidDomain">> & { dtstamp: string },
  taken: Set<string>,
): string[] | null {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  if (!isValidDate(start)) return null;

  const hasEnd = isValidDate(end);
  const allDay = hasEnd && isAllDayRange(start, end);

  const lines: string[] = ["BEGIN:VEVENT"];

  const uid = makeUid(event, start, taken, options.uidDomain);
  taken.add(uid);
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${options.dtstamp}`);

  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatUtcDate(start)}`);
    // Exclusive: a single-day event ends on the following date. Clamped so a
    // reversed range still produces DTEND > DTSTART, which the RFC requires.
    const lastDay = end.getTime() > start.getTime() ? end : start;
    lines.push(`DTEND;VALUE=DATE:${formatUtcDate(nextUtcDay(lastDay))}`);
  } else {
    lines.push(`DTSTART:${formatUtcDateTime(start)}`);
    // DTEND is optional, and must be strictly later than DTSTART when present.
    // A zero-length or reversed event is written as an instant instead of an
    // invalid interval.
    if (hasEnd && end.getTime() > start.getTime()) {
      lines.push(`DTEND:${formatUtcDateTime(end)}`);
    }
  }

  const summary =
    options.includePlayerName && event.playerName
      ? `${event.playerName}: ${event.title}`
      : event.title;
  lines.push(...textLine("SUMMARY", summary || "(untitled)"));

  if (event.description) lines.push(...textLine("DESCRIPTION", event.description));
  if (event.location) lines.push(...textLine("LOCATION", event.location));
  if (event.type) lines.push(...textLine("CATEGORIES", event.type.toUpperCase()));

  const status = icsStatus(event.state);
  if (status) lines.push(`STATUS:${status}`);

  lines.push("END:VEVENT");
  return lines;
}

/**
 * Render events as a complete iCalendar file.
 *
 * With no events this returns a well-formed but component-less VCALENDAR —
 * RFC 5545 §3.6 wants at least one component, so callers should not offer the
 * download when there is nothing to export (CalendarPage disables the button).
 * It is still built rather than thrown so the function stays total.
 */
export function buildIcs(events: IcsEventInput[], options: BuildIcsOptions = {}): string {
  const dtstamp = formatUtcDateTime(options.now ?? new Date());
  const perEvent = {
    dtstamp,
    includePlayerName: options.includePlayerName ?? false,
    uidDomain: options.uidDomain ?? DEFAULT_UID_DOMAIN,
  };

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (options.calendarName) {
    lines.push(...textLine("X-WR-CALNAME", options.calendarName));
  }

  const taken = new Set<string>();
  for (const event of events) {
    const eventLines = buildEvent(event, perEvent, taken);
    if (eventLines) lines.push(...eventLines);
  }

  lines.push("END:VCALENDAR");

  // CRLF between every line and after the last one, per §3.1.
  return `${lines.join("\r\n")}\r\n`;
}
