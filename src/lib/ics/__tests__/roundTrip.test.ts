// ============================================================================
// The writer against the app's own data, read back the way an importer reads it.
//
// The unit tests pin each primitive with fixtures chosen to exercise it. This
// one takes the real `mockCalendarEvents` and `mockTournaments` — the same
// shapes the API returns, em dashes, middots, midnight-UTC tournament dates and
// all — writes a file, then unfolds and parses it with a deliberately naive
// reader. If a comma escaping bug or a fold in the wrong place would truncate a
// title in Google Calendar, it truncates here too.
// ============================================================================

import { describe, it, expect } from "vitest";
import { buildIcs, octetLength } from "../icalendar";
import { periodRange, eventsInRange } from "../scope";
import { mockCalendarEvents, mockTournaments } from "@/mock/data";
import type { CalendarEvent, CalendarEventType } from "@/types";

/** The calendar's own projection of a tournament onto an event. */
const asEvent = (t: (typeof mockTournaments)[number]): CalendarEvent => ({
  id: `intl-${t.id}`,
  title: t.federation ? `[${t.federation}] ${t.name}` : t.name,
  type: "tournament" as CalendarEventType,
  startDate: t.startDate,
  endDate: t.endDate,
  location: `${t.city}, ${t.country}`,
  description: `${t.category} · ${t.level} · ${t.surface} (${t.indoorOutdoor})`,
  state: "confirmed",
});

/**
 * Unfold (RFC 5545 §3.1) and split into `NAME[;params]:value` pairs, undoing
 * the TEXT escaping. Naive on purpose — this is roughly the least a real parser
 * does, so anything it mangles a real one will too.
 */
function parseIcs(ics: string) {
  const unfolded: string[] = [];
  for (const line of ics.split("\r\n")) {
    if (line.startsWith(" ") && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else if (line !== "") {
      unfolded.push(line);
    }
  }

  const unescape = (v: string) =>
    v.replace(/\\([\\;,nN])/g, (_, ch) => (ch === "n" || ch === "N" ? "\n" : ch));

  const events: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT") { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const colon = line.indexOf(":");
    const [name, ...params] = line.slice(0, colon).split(";");
    current[name] = unescape(line.slice(colon + 1));
    if (params.length) current[`${name}__params`] = params.join(";");
  }
  return { lines: unfolded, events };
}

const NOW = new Date("2026-09-04T09:30:00Z");
const source: CalendarEvent[] = [...mockCalendarEvents, ...mockTournaments.map(asEvent)];

describe("round trip over the app's own fixtures", () => {
  const ics = buildIcs(source, { now: NOW, calendarName: "TennisAI", includePlayerName: true });
  const { lines, events } = parseIcs(ics);

  it("has something to say", () => {
    expect(source.length).toBeGreaterThan(5);
    expect(events).toHaveLength(source.length);
  });

  it("keeps every physical line inside 75 octets", () => {
    for (const line of ics.split("\r\n")) {
      expect(octetLength(line)).toBeLessThanOrEqual(75);
    }
  });

  it("gives every event a unique UID, a DTSTAMP and a DTSTART", () => {
    const uids = events.map((e) => e.UID);
    expect(new Set(uids).size).toBe(uids.length);
    for (const event of events) {
      expect(event.DTSTAMP).toBe("20260904T093000Z");
      expect(event.DTSTART).toBeTruthy();
    }
  });

  it("returns every title and location intact after unescaping", () => {
    for (const original of source) {
      const written = events.find((e) => e.UID?.startsWith(`${original.id}@`));
      expect(written, `no VEVENT for ${original.id}`).toBeDefined();
      const expectedSummary = original.playerName
        ? `${original.playerName}: ${original.title}`
        : original.title;
      expect(written!.SUMMARY).toBe(expectedSummary);
      if (original.location) expect(written!.LOCATION).toBe(original.location);
    }
  });

  it("writes the multi-day tournaments as DATE ranges", () => {
    // Every fixture tournament is stored midnight-UTC to midnight-UTC.
    const tournaments = events.filter((e) => e.UID?.startsWith("intl-"));
    expect(tournaments.length).toBe(mockTournaments.length);
    for (const event of tournaments) {
      expect(event.DTSTART__params).toBe("VALUE=DATE");
      expect(event.DTSTART).toMatch(/^\d{8}$/);
      expect(event.DTEND__params).toBe("VALUE=DATE");
      expect(Number(event.DTEND)).toBeGreaterThan(Number(event.DTSTART));
    }
  });

  it("survives the middot in a tournament description", () => {
    // "Grand Slam · Professional · Hard (outdoor)" is 2 octets per middot and
    // long enough to fold — the case a character-counting folder gets wrong.
    const withMiddot = events.find((e) => e.DESCRIPTION?.includes("·"));
    expect(withMiddot).toBeDefined();
    expect(withMiddot!.DESCRIPTION).toContain(" · ");
    expect(withMiddot!.DESCRIPTION).not.toContain("�");
  });

  it("balances BEGIN and END for every component", () => {
    const begins = lines.filter((l) => l.startsWith("BEGIN:")).length;
    const ends = lines.filter((l) => l.startsWith("END:")).length;
    expect(begins).toBe(ends);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });
});

describe("scoping the app's own fixtures", () => {
  it("narrows a season to one month", () => {
    // The point of the range: the fixture set spans a whole season, and a
    // coach exporting March must not hand over January to December.
    const march = periodRange("month", new Date(2026, 2, 15));
    const scoped = eventsInRange(source, march);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.length).toBeLessThan(source.length);
    for (const event of scoped) {
      expect(new Date(event.startDate).getTime()).toBeLessThanOrEqual(march.end.getTime());
      expect(new Date(event.endDate).getTime()).toBeGreaterThanOrEqual(march.start.getTime());
    }
  });
});
