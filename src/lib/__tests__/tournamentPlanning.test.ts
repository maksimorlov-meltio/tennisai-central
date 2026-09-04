// The two judgements a coach makes when entering a player for a tournament:
// how long is left, and does it clash with something already booked.
//
// Both appear on several screens, so they live in one place and are pinned
// here — a countdown that disagrees with itself between the list and the detail
// page is worse than no countdown.

import { describe, it, expect } from "vitest";
import {
  describeClash,
  findClashes,
  timeLeft,
  TRAVEL_BUFFER_DAYS,
} from "../tournamentPlanning";
import type { PlayerTournament, Tournament } from "@/types";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function tournament(over: Partial<Tournament> = {}): Tournament {
  return {
    id: "t-1",
    name: "J100 Vic",
    city: "Vic",
    country: "Spain",
    surface: "Clay",
    indoorOutdoor: "outdoor",
    startDate: day(30),
    endDate: day(35),
    ...over,
  } as Tournament;
}

function entry(over: Partial<PlayerTournament> = {}): PlayerTournament {
  return {
    id: `pt-${over.tournamentId ?? "x"}`,
    tournamentId: "t-other",
    tournament: tournament({ id: "t-other", name: "J60 Burgas" }),
    playerId: "player-1",
    status: "registered",
    ...over,
  } as PlayerTournament;
}

describe("timeLeft", () => {
  it("counts to the entry deadline while entries are open", () => {
    const t = tournament({ entryDeadline: day(6) });
    const result = timeLeft(t, NOW);

    expect(result.kind).toBe("entry");
    expect(result.days).toBe(6);
    expect(result.label).toBe("Entries close in 6 days");
  });

  it("switches to the start date once entries have closed", () => {
    // The deadline is the useful number until it passes; after that it is only
    // a reminder of something you can no longer act on.
    const t = tournament({ entryDeadline: day(-2) });
    const result = timeLeft(t, NOW);

    expect(result.kind).toBe("start");
    expect(result.label).toBe("Entries closed · starts in 30 days");
  });

  it("counts to the start when the feed publishes no deadline", () => {
    // Half the UTR feed has no entry deadline. Inventing one would be worse.
    const result = timeLeft(tournament(), NOW);
    expect(result.kind).toBe("start");
    expect(result.label).toBe("Starts in 30 days");
  });

  it("rounds up, so 30 hours reads as 2 days rather than 1", () => {
    const t = tournament({ entryDeadline: new Date(NOW.getTime() + 30 * 3_600_000).toISOString() });
    expect(timeLeft(t, NOW).days).toBe(2);
  });

  it("marks the last three days of an entry window as urgent", () => {
    expect(timeLeft(tournament({ entryDeadline: day(2) }), NOW).tone).toBe("urgent");
    expect(timeLeft(tournament({ entryDeadline: day(8) }), NOW).tone).toBe("soon");
    expect(timeLeft(tournament({ entryDeadline: day(40) }), NOW).tone).toBe("normal");
  });

  it("says so plainly when the event is running or done", () => {
    expect(timeLeft(tournament({ startDate: day(-1), endDate: day(3) }), NOW).label).toBe("On now");
    expect(timeLeft(tournament({ startDate: day(-9), endDate: day(-2) }), NOW).label).toBe("Finished");
  });

  it("never reports a negative countdown", () => {
    const cases = [
      tournament({ entryDeadline: day(-5) }),
      tournament({ startDate: day(-3), endDate: day(2) }),
      tournament({ startDate: day(-30), endDate: day(-20) }),
    ];
    for (const t of cases) expect(timeLeft(t, NOW).days).toBeGreaterThanOrEqual(0);
  });
});

describe("findClashes", () => {
  const candidate = tournament({ id: "t-new", startDate: day(30), endDate: day(35) });

  it("finds an entry whose dates genuinely overlap", () => {
    const existing = entry({
      tournamentId: "t-other",
      tournament: tournament({ id: "t-other", startDate: day(33), endDate: day(38) }),
    });

    const clashes = findClashes(candidate, [existing], "player-1");
    expect(clashes).toHaveLength(1);
    expect(clashes[0].direct).toBe(true);
  });

  it("flags back-to-back events as a clash, because somebody has to travel", () => {
    // Ends day 35, the other starts day 36: no calendar overlap at all, and a
    // real conflict if they are in different countries.
    const existing = entry({
      tournamentId: "t-other",
      tournament: tournament({ id: "t-other", startDate: day(36), endDate: day(40) }),
    });

    const clashes = findClashes(candidate, [existing], "player-1");
    expect(clashes).toHaveLength(1);
    expect(clashes[0].direct).toBe(false);
  });

  it("leaves a comfortable gap alone", () => {
    const existing = entry({
      tournamentId: "t-other",
      tournament: tournament({ id: "t-other", startDate: day(38), endDate: day(42) }),
    });
    expect(findClashes(candidate, [existing], "player-1")).toHaveLength(0);
  });

  it("uses exactly one day of buffer either side", () => {
    expect(TRAVEL_BUFFER_DAYS).toBe(1);
  });

  it("ignores a withdrawn entry — that is what withdrawing means", () => {
    const existing = entry({
      status: "withdrawn",
      tournament: tournament({ id: "t-other", startDate: day(33), endDate: day(38) }),
    });
    expect(findClashes(candidate, [existing], "player-1")).toHaveLength(0);
  });

  it("ignores another player's entries", () => {
    const existing = entry({
      playerId: "player-2",
      tournament: tournament({ id: "t-other", startDate: day(33), endDate: day(38) }),
    });
    expect(findClashes(candidate, [existing], "player-1")).toHaveLength(0);
  });

  it("does not warn about the entry being re-saved", () => {
    // Changing the status on an entry must not warn about its own dates.
    const same = entry({ tournamentId: "t-new", tournament: candidate });
    expect(findClashes(candidate, [same], "player-1")).toHaveLength(0);
  });

  it("returns clashes in date order", () => {
    const later = entry({
      tournamentId: "t-late",
      tournament: tournament({ id: "t-late", name: "Later", startDate: day(34), endDate: day(39) }),
    });
    const earlier = entry({
      tournamentId: "t-early",
      tournament: tournament({ id: "t-early", name: "Earlier", startDate: day(28), endDate: day(31) }),
    });

    const names = findClashes(candidate, [later, earlier], "player-1").map(
      (c) => c.entry.tournament.name,
    );
    expect(names).toEqual(["Earlier", "Later"]);
  });
});

describe("describeClash", () => {
  const clashing = (name: string, direct: boolean) => ({
    entry: entry({ tournament: tournament({ name }) }),
    direct,
  });

  it("names the clash and the player", () => {
    expect(describeClash([clashing("J100 Vic", true)], "Anna Sokolova")).toBe(
      "Anna Sokolova is already entered for J100 Vic over the same dates.",
    );
  });

  it("says back to back when nothing actually overlaps", () => {
    expect(describeClash([clashing("J60 Burgas", false)])).toContain("back to back with");
  });

  it("lists several readably", () => {
    const text = describeClash([clashing("A", true), clashing("B", true), clashing("C", true)]);
    expect(text).toContain("A, B and C");
  });

  it("says nothing when there is nothing to say", () => {
    expect(describeClash([])).toBe("");
  });
});
