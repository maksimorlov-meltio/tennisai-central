// ============================================================================
// The .ics writer.
//
// This file leaves the app and is parsed by software nobody here controls —
// Google Calendar, Apple Calendar, Outlook. There is no forgiving render path:
// a comma that should have been `\,` silently truncates an event title, a line
// past 75 octets is rejected outright by strict importers, and a fortnight-long
// tournament written as DATE-TIME shows up as "02:00 – 02:00" in Madrid.
//
// So the primitives are pinned individually and the whole file is checked
// structurally, the way a validator would.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  buildIcs, escapeText, foldLine, octetLength, formatUtcDate, formatUtcDateTime,
  isAllDayRange, icsStatus,
} from "../icalendar";
import type { IcsEventInput } from "../icalendar";

/** Fixed DTSTAMP so a snapshot means something. */
const NOW = new Date("2026-09-04T09:30:00Z");

const build = (events: IcsEventInput[], options = {}) =>
  buildIcs(events, { now: NOW, ...options });

const lines = (ics: string) => ics.split("\r\n");

// ---------------------------------------------------------------------------

describe("escapeText", () => {
  it("escapes the three TEXT delimiters", () => {
    expect(escapeText("Clay, indoor; 3 sets")).toBe("Clay\\, indoor\\; 3 sets");
  });

  it("turns real newlines into the literal \\n sequence", () => {
    expect(escapeText("Line one\nLine two")).toBe("Line one\\nLine two");
    expect(escapeText("CRLF\r\nhere")).toBe("CRLF\\nhere");
    expect(escapeText("CR\rhere")).toBe("CR\\nhere");
  });

  it("escapes backslashes first, so an escape is never escaped twice", () => {
    // Naive ordering yields "C:\\\\path\\\\, x" — the comma's own backslash
    // gets doubled and the value arrives corrupted.
    expect(escapeText("C:\\path, x")).toBe("C:\\\\path\\, x");
  });

  it("leaves the colon alone — it is not escaped in TEXT values", () => {
    expect(escapeText("Alex Rivera: Morning drill")).toBe("Alex Rivera: Morning drill");
  });

  it("passes ordinary text through untouched", () => {
    expect(escapeText("Morning drill")).toBe("Morning drill");
  });
});

describe("foldLine", () => {
  it("leaves a short line as one line", () => {
    expect(foldLine("SUMMARY:Morning drill")).toEqual(["SUMMARY:Morning drill"]);
  });

  it("leaves a line of exactly 75 octets alone", () => {
    const line = `SUMMARY:${"x".repeat(75 - "SUMMARY:".length)}`;
    expect(octetLength(line)).toBe(75);
    expect(foldLine(line)).toEqual([line]);
  });

  it("folds a long line, continuations starting with a space", () => {
    const folded = foldLine(`SUMMARY:${"x".repeat(200)}`);
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(octetLength(part)).toBeLessThanOrEqual(75);
    folded.slice(1).forEach((part) => expect(part.startsWith(" ")).toBe(true));
  });

  it("unfolds back to the original", () => {
    const original = `DESCRIPTION:${"abcde ".repeat(40)}`;
    const unfolded = foldLine(original)
      .map((part, i) => (i === 0 ? part : part.slice(1)))
      .join("");
    expect(unfolded).toBe(original);
  });

  it("counts octets, not characters, and never splits a multi-byte char", () => {
    // The app's own tournament descriptions are joined with "·" (2 octets):
    // "ITF · W35 · Clay (outdoor)". Folding on character count would emit
    // lines over 75 octets; splitting mid-character would emit invalid UTF-8.
    const original = `DESCRIPTION:${"Grand Slam · Professional · Hard (outdoor) ".repeat(4)}`;
    const folded = foldLine(original);
    for (const part of folded) {
      expect(octetLength(part)).toBeLessThanOrEqual(75);
      expect(part).not.toContain("\uFFFD");
    }
    const unfolded = folded.map((p, i) => (i === 0 ? p : p.slice(1))).join("");
    expect(unfolded).toBe(original);
  });
});

describe("date formatting", () => {
  it("writes UTC DATE-TIME with the trailing Z", () => {
    expect(formatUtcDateTime(new Date("2026-09-04T14:30:00Z"))).toBe("20260904T143000Z");
  });

  it("uses UTC fields regardless of the exporting machine's timezone", () => {
    // 23:30 UTC is the next calendar day in Madrid. A local formatter here
    // would move the event a day for every coach east of Greenwich.
    expect(formatUtcDateTime(new Date("2026-09-04T23:30:00Z"))).toBe("20260904T233000Z");
    expect(formatUtcDate(new Date("2026-09-04T23:30:00Z"))).toBe("20260904");
  });

  it("zero-pads every field", () => {
    expect(formatUtcDateTime(new Date("2026-01-02T03:04:05Z"))).toBe("20260102T030405Z");
  });

  it("recognises an all-day range only when both ends are midnight UTC", () => {
    const midnight = new Date("2026-01-19T00:00:00Z");
    const alsoMidnight = new Date("2026-02-01T00:00:00Z");
    expect(isAllDayRange(midnight, alsoMidnight)).toBe(true);
    // A genuine 00:00–23:59 block is a timed event, not an all-day one.
    expect(isAllDayRange(midnight, new Date("2026-01-19T23:59:00Z"))).toBe(false);
    expect(isAllDayRange(new Date("2026-01-19T09:00:00Z"), alsoMidnight)).toBe(false);
  });
});

describe("icsStatus", () => {
  it("maps the app's five states onto the RFC's three", () => {
    expect(icsStatus("confirmed")).toBe("CONFIRMED");
    expect(icsStatus("completed")).toBe("CONFIRMED");
    expect(icsStatus("tentative")).toBe("TENTATIVE");
    expect(icsStatus("requested")).toBe("TENTATIVE");
    expect(icsStatus("cancelled")).toBe("CANCELLED");
  });

  it("omits STATUS rather than inventing one", () => {
    expect(icsStatus(undefined)).toBeUndefined();
    expect(icsStatus("nonsense")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

const timedEvent: IcsEventInput = {
  id: "cmsnjpxn3000o9tgdigtv5exp",
  title: "Morning drill",
  type: "training",
  state: "confirmed",
  startDate: "2026-09-04T07:00:00Z",
  endDate: "2026-09-04T08:30:00Z",
  location: "Club Deportivo, Madrid",
  playerName: "Alex Rivera",
};

/** As the public feed stores them: midnight UTC at both ends. */
const tournamentEvent: IcsEventInput = {
  id: "intl-t1",
  title: "[ATP] Australian Open 2026",
  type: "tournament",
  state: "confirmed",
  startDate: "2026-01-19T00:00:00Z",
  endDate: "2026-02-01T00:00:00Z",
  location: "Melbourne, Australia",
  description: "Grand Slam · Professional · Hard (outdoor)",
};

describe("buildIcs — envelope", () => {
  it("emits a well-formed VCALENDAR", () => {
    const out = lines(build([timedEvent]));
    expect(out[0]).toBe("BEGIN:VCALENDAR");
    expect(out).toContain("VERSION:2.0");
    expect(out).toContain("CALSCALE:GREGORIAN");
    expect(out.some((l) => l.startsWith("PRODID:"))).toBe(true);
    expect(out[out.length - 2]).toBe("END:VCALENDAR");
  });

  it("uses CRLF everywhere and ends with one", () => {
    const ics = build([timedEvent, tournamentEvent]);
    expect(ics.endsWith("\r\n")).toBe(true);
    // No bare LF: every \n in the file is preceded by \r.
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("carries the calendar name, escaped", () => {
    const ics = build([timedEvent], { calendarName: "TennisAI — September 2026, all players" });
    expect(ics).toContain("X-WR-CALNAME:TennisAI — September 2026\\, all players");
  });

  it("produces a component-less but structurally intact file for no events", () => {
    // Callers must not offer this — RFC 5545 §3.6 wants at least one component —
    // but the writer stays total rather than throwing at the download handler.
    const out = lines(build([]));
    expect(out[0]).toBe("BEGIN:VCALENDAR");
    expect(out).not.toContain("BEGIN:VEVENT");
    expect(out.filter((l) => l === "END:VCALENDAR")).toHaveLength(1);
  });
});

describe("buildIcs — timed events", () => {
  it("writes DTSTART/DTEND as UTC DATE-TIME", () => {
    const out = lines(build([timedEvent]));
    expect(out).toContain("DTSTART:20260904T070000Z");
    expect(out).toContain("DTEND:20260904T083000Z");
    expect(out).not.toContain("DTSTART;VALUE=DATE:20260904");
  });

  it("stamps every event with the same DTSTAMP", () => {
    const stamps = lines(build([timedEvent, tournamentEvent])).filter((l) => l.startsWith("DTSTAMP:"));
    expect(stamps).toEqual(["DTSTAMP:20260904T093000Z", "DTSTAMP:20260904T093000Z"]);
  });

  it("omits DTEND rather than writing an interval that ends before it starts", () => {
    // RFC 5545 §3.8.2.2 requires DTEND > DTSTART. A zero-length or reversed
    // event becomes an instant, which is valid; an inverted DTEND is not.
    const zero = lines(build([{ ...timedEvent, endDate: "2026-09-04T07:00:00Z" }]));
    expect(zero.some((l) => l.startsWith("DTEND"))).toBe(false);
    const reversed = lines(build([{ ...timedEvent, endDate: "2026-09-03T07:00:00Z" }]));
    expect(reversed.some((l) => l.startsWith("DTEND"))).toBe(false);
  });
});

describe("buildIcs — all-day and multi-day tournaments", () => {
  it("writes a midnight-UTC tournament as a DATE range, not 02:00", () => {
    const out = lines(build([tournamentEvent]));
    expect(out).toContain("DTSTART;VALUE=DATE:20260119");
    // DTEND is exclusive: the last day is 1 Feb, so DTEND is 2 Feb.
    expect(out).toContain("DTEND;VALUE=DATE:20260202");
    expect(out.some((l) => /^DTSTART:\d{8}T/.test(l))).toBe(false);
  });

  it("gives a single-day all-day event the following date as DTEND", () => {
    const out = lines(build([{
      ...tournamentEvent,
      startDate: "2026-03-18T00:00:00Z",
      endDate: "2026-03-18T00:00:00Z",
    }]));
    expect(out).toContain("DTSTART;VALUE=DATE:20260318");
    expect(out).toContain("DTEND;VALUE=DATE:20260319");
  });

  it("crosses a month and a year boundary without arithmetic slips", () => {
    const out = lines(build([{
      ...tournamentEvent,
      startDate: "2026-12-28T00:00:00Z",
      endDate: "2026-12-31T00:00:00Z",
    }]));
    expect(out).toContain("DTSTART;VALUE=DATE:20261228");
    expect(out).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("keeps a 00:00–23:59 block timed", () => {
    // Only both-ends-midnight means "no time was published". A day-long
    // recovery block has real times and should keep them.
    const out = lines(build([{
      ...timedEvent,
      type: "recovery",
      startDate: "2026-03-18T00:00:00Z",
      endDate: "2026-03-18T23:59:00Z",
    }]));
    expect(out).toContain("DTSTART:20260318T000000Z");
    expect(out).toContain("DTEND:20260318T235900Z");
  });
});

describe("buildIcs — UIDs", () => {
  it("derives a stable UID from the event id", () => {
    const first = lines(build([timedEvent])).find((l) => l.startsWith("UID:"));
    const again = lines(build([timedEvent], { now: new Date("2027-01-01T00:00:00Z") }))
      .find((l) => l.startsWith("UID:"));
    // Same event, different export — same UID, so a re-import updates rather
    // than duplicating.
    expect(first).toBe("UID:cmsnjpxn3000o9tgdigtv5exp@tennisai.app");
    expect(again).toBe(first);
  });

  it("does not depend on position in the array", () => {
    const forwards = lines(build([timedEvent, tournamentEvent])).filter((l) => l.startsWith("UID:"));
    const backwards = lines(build([tournamentEvent, timedEvent])).filter((l) => l.startsWith("UID:"));
    expect([...forwards].sort()).toEqual([...backwards].sort());
  });

  it("keeps recurring occurrences distinct", () => {
    const uids = lines(build([
      { ...timedEvent, id: "evt1" },
      { ...timedEvent, id: "evt1_occ_1", startDate: "2026-09-11T07:00:00Z", endDate: "2026-09-11T08:30:00Z", recurrenceParentId: "evt1" },
    ])).filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(2);
  });

  it("disambiguates a genuine id collision by start instant", () => {
    const uids = lines(build([
      { ...timedEvent, id: "dupe" },
      { ...timedEvent, id: "dupe", startDate: "2026-09-05T07:00:00Z", endDate: "2026-09-05T08:30:00Z" },
    ])).filter((l) => l.startsWith("UID:"));
    expect(uids).toEqual([
      "UID:dupe@tennisai.app",
      "UID:dupe-20260905T070000Z@tennisai.app",
    ]);
  });
});

describe("buildIcs — text properties", () => {
  it("escapes commas and semicolons in SUMMARY, LOCATION and DESCRIPTION", () => {
    const ics = build([{
      ...timedEvent,
      title: "Drill: serve, return; footwork",
      location: "Court 3, Club Deportivo",
      description: "Bring two racquets, a spare grip; no notes",
    }]);
    expect(ics).toContain("SUMMARY:Drill: serve\\, return\\; footwork");
    expect(ics).toContain("LOCATION:Court 3\\, Club Deportivo");
    expect(ics).toContain("DESCRIPTION:Bring two racquets\\, a spare grip\\; no notes");
  });

  it("flattens a multi-line description onto one folded content line", () => {
    const out = lines(build([{ ...timedEvent, description: "Warm up\nSets\nCool down" }]));
    expect(out).toContain("DESCRIPTION:Warm up\\nSets\\nCool down");
    expect(out.filter((l) => l.startsWith("DESCRIPTION"))).toHaveLength(1);
  });

  it("prefixes the player name only when asked", () => {
    expect(build([timedEvent])).toContain("SUMMARY:Morning drill");
    expect(build([timedEvent], { includePlayerName: true })).toContain("SUMMARY:Alex Rivera: Morning drill");
  });

  it("never writes coach notes into the file", () => {
    // The export exists so a coach can send a schedule to a parent. Notes are
    // already hidden from observers in the app; a file has no such guard.
    const ics = build([{ ...timedEvent, ...({ coachNotes: "Struggling with the second serve" } as object) }]);
    expect(ics).not.toContain("Struggling");
  });

  it("carries the event type as CATEGORIES and the state as STATUS", () => {
    const out = lines(build([{ ...timedEvent, state: "tentative" }]));
    expect(out).toContain("CATEGORIES:TRAINING");
    expect(out).toContain("STATUS:TENTATIVE");
  });

  it("omits empty optional properties instead of emitting blank ones", () => {
    const out = lines(build([{
      id: "bare", title: "Untitled block",
      startDate: "2026-09-04T07:00:00Z", endDate: "2026-09-04T08:00:00Z",
    }]));
    expect(out.some((l) => l.startsWith("LOCATION"))).toBe(false);
    expect(out.some((l) => l.startsWith("DESCRIPTION"))).toBe(false);
    expect(out.some((l) => l.startsWith("STATUS"))).toBe(false);
    expect(out.some((l) => l.startsWith("CATEGORIES"))).toBe(false);
  });
});

describe("buildIcs — bad input", () => {
  it("skips an event with an unparseable start date rather than corrupting the file", () => {
    const out = lines(build([{ ...timedEvent, id: "broken", startDate: "not a date" }, tournamentEvent]));
    expect(out.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(out.some((l) => l.includes("broken"))).toBe(false);
  });

  it("still exports an event whose end date is unusable", () => {
    // A missing end is recoverable — the event becomes an instant. Losing the
    // whole entry would not be.
    const out = lines(build([{ ...timedEvent, endDate: "" }]));
    expect(out).toContain("DTSTART:20260904T070000Z");
    expect(out.some((l) => l.startsWith("DTEND"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The whole file, checked the way an importer would.
// ---------------------------------------------------------------------------

describe("buildIcs — a full file", () => {
  const ics = build([timedEvent, tournamentEvent], {
    calendarName: "TennisAI — September 2026",
    includePlayerName: true,
  });

  it("passes the structural rules a validator applies", () => {
    const out = lines(ics);
    // Trailing CRLF leaves one empty element.
    expect(out[out.length - 1]).toBe("");
    const content = out.slice(0, -1);

    for (const line of content) expect(octetLength(line)).toBeLessThanOrEqual(75);

    expect(content.filter((l) => l === "BEGIN:VCALENDAR")).toHaveLength(1);
    expect(content.filter((l) => l === "END:VCALENDAR")).toHaveLength(1);
    expect(content.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
    expect(content.filter((l) => l === "END:VEVENT")).toHaveLength(2);

    // Every VEVENT carries the three mandatory properties.
    expect(content.filter((l) => l.startsWith("UID:"))).toHaveLength(2);
    expect(content.filter((l) => l.startsWith("DTSTAMP:"))).toHaveLength(2);
    expect(content.filter((l) => l.startsWith("DTSTART"))).toHaveLength(2);

    // Nothing outside a VEVENT, and nothing after END:VCALENDAR.
    expect(content.indexOf("BEGIN:VEVENT")).toBeGreaterThan(content.indexOf("BEGIN:VCALENDAR"));
    expect(content.lastIndexOf("END:VEVENT")).toBeLessThan(content.indexOf("END:VCALENDAR"));
  });

  it("matches the expected file, line for line", () => {
    expect(lines(ics)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TennisAI//Calendar Export//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:TennisAI — September 2026",
      "BEGIN:VEVENT",
      "UID:cmsnjpxn3000o9tgdigtv5exp@tennisai.app",
      "DTSTAMP:20260904T093000Z",
      "DTSTART:20260904T070000Z",
      "DTEND:20260904T083000Z",
      "SUMMARY:Alex Rivera: Morning drill",
      "LOCATION:Club Deportivo\\, Madrid",
      "CATEGORIES:TRAINING",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:intl-t1@tennisai.app",
      "DTSTAMP:20260904T093000Z",
      "DTSTART;VALUE=DATE:20260119",
      "DTEND;VALUE=DATE:20260202",
      "SUMMARY:[ATP] Australian Open 2026",
      "DESCRIPTION:Grand Slam · Professional · Hard (outdoor)",
      "LOCATION:Melbourne\\, Australia",
      "CATEGORIES:TOURNAMENT",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
  });
});
