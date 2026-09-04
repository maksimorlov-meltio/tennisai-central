// Deciding whether to enter a tournament: how long is left, and does it clash
// with something this player is already entered for.
//
// Pure functions, deliberately. Both answers appear in several places — the
// browse list, the detail page, the confirmation dialog — and two copies would
// drift into telling a coach different things on different screens.

import type { PlayerTournament, Tournament } from "@/types";

const DAY_MS = 86_400_000;

// ── How much time is left ───────────────────────────────────────────────────

export type Deadline = "entry" | "start" | "running" | "finished";

export interface TimeLeft {
  /** Which clock this is counting. */
  kind: Deadline;
  /** Whole days remaining. Negative never escapes — a passed date changes kind. */
  days: number;
  /** Ready to render: "Entries close in 6 days". */
  label: string;
  /** For styling. `urgent` is the last 72 hours of an entry window. */
  tone: "urgent" | "soon" | "normal" | "past";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The one number worth showing about a tournament, right now.
 *
 * While entries are open that is the entry deadline — the only date here you
 * can miss and not get back. Once it passes, the useful question becomes how
 * long until you travel, so it switches to the start date. Showing both at once
 * was the alternative and makes every card carry a number the reader has to
 * choose between.
 *
 * Feeds do not all publish an entry deadline; without one this counts to the
 * start, which is honest rather than inventing a deadline.
 */
export function timeLeft(t: Pick<Tournament, "startDate" | "endDate"> & { entryDeadline?: string },
  now: Date = new Date()): TimeLeft {
  const at = now.getTime();
  const start = new Date(t.startDate).getTime();
  const end = new Date(t.endDate).getTime();
  const deadline = t.entryDeadline ? new Date(t.entryDeadline).getTime() : null;

  if (end < at) return { kind: "finished", days: 0, label: "Finished", tone: "past" };
  if (start <= at) return { kind: "running", days: 0, label: "On now", tone: "normal" };

  if (deadline !== null && deadline > at) {
    // Round up: with 30 hours to go a coach should read "2 days", not "1".
    const days = Math.ceil((deadline - at) / DAY_MS);
    return {
      kind: "entry",
      days,
      label: days <= 1 ? "Entries close today" : `Entries close in ${plural(days, "day")}`,
      tone: days <= 3 ? "urgent" : days <= 10 ? "soon" : "normal",
    };
  }

  const days = Math.ceil((start - at) / DAY_MS);
  const closed = deadline !== null && deadline <= at;
  return {
    kind: "start",
    days,
    label: `${closed ? "Entries closed · s" : "S"}tarts in ${plural(days, "day")}`,
    tone: days <= 7 ? "soon" : "normal",
  };
}

// ── Clashes ─────────────────────────────────────────────────────────────────

/**
 * Days either side of a tournament that still count as a conflict.
 *
 * An event finishing on Sunday and another starting Monday in a different
 * country do not overlap on a calendar and are absolutely a clash in real life:
 * somebody has to travel. One day each way is the smallest buffer that catches
 * the back-to-back case without flagging every fortnight.
 */
export const TRAVEL_BUFFER_DAYS = 1;

/** A status that means the player is not actually going. */
const NOT_ATTENDING = new Set(["withdrawn"]);

export interface Clash {
  entry: PlayerTournament;
  /** True when the dates genuinely overlap rather than only the travel buffer. */
  direct: boolean;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Tournaments this player is already entered for that conflict with `candidate`.
 *
 * Withdrawn entries are ignored — that is the whole point of withdrawing — and
 * so is the candidate itself, so re-saving an existing entry never warns about
 * its own dates.
 */
export function findClashes(
  candidate: Pick<Tournament, "id" | "startDate" | "endDate">,
  entries: PlayerTournament[],
  playerId: string,
): Clash[] {
  const start = new Date(candidate.startDate).getTime();
  const end = new Date(candidate.endDate).getTime();
  const buffer = TRAVEL_BUFFER_DAYS * DAY_MS;

  return entries
    .filter((e) => e.playerId === playerId)
    .filter((e) => e.tournamentId !== candidate.id)
    .filter((e) => !NOT_ATTENDING.has(e.status))
    .flatMap<Clash>((entry) => {
      const t = entry.tournament;
      // A malformed entry is skipped rather than crashing the dialog it feeds.
      if (!t) return [];
      const otherStart = new Date(t.startDate).getTime();
      const otherEnd = new Date(t.endDate).getTime();
      if (Number.isNaN(otherStart) || Number.isNaN(otherEnd)) return [];

      if (overlaps(start, end, otherStart, otherEnd)) return [{ entry, direct: true }];
      if (overlaps(start - buffer, end + buffer, otherStart, otherEnd)) {
        return [{ entry, direct: false }];
      }
      return [];
    })
    .sort((a, b) => a.entry.tournament.startDate.localeCompare(b.entry.tournament.startDate));
}

/** One sentence naming the conflict, for the confirmation dialog. */
export function describeClash(clashes: Clash[], playerName?: string): string {
  if (clashes.length === 0) return "";
  const who = playerName ? `${playerName} is` : "This player is";
  const names = clashes.map((c) => c.entry.tournament.name);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const kind = clashes.every((c) => !c.direct) ? "back to back with" : "already entered for";
  return `${who} ${kind} ${list} over the same dates.`;
}
