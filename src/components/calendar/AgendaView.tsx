// ─── Agenda View ──────────────────────────────────────────────────────────
//
// The phone's replacement for the month/week grid.
//
// A 7-column grid at 375px gives each day ~50px, of which a chip's border,
// padding and colour bar take most — the titles rendered as "M…", "2…", "J…".
// No amount of tightening fixes that: seven columns and a phone are simply
// incompatible, so on a small screen the grid is replaced rather than shrunk.
//
// What replaces it is the list every phone calendar settles on: the days of the
// range that actually have something on them, in order, each with its events
// spelled out at full width. Days with nothing are skipped — with the world's
// tournament feeds subscribed almost none are, and without a subscription the
// empty ones were the majority.
//
// The grid is untouched on desktop; this component is only ever mounted below
// the `md` breakpoint.
import { useMemo } from "react";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { eventBaseColor, entityColor, withAlpha } from "@/lib/calendar/colors";
import type { CalendarEvent } from "@/types";

/**
 * Events listed under a day before the rest collapse into "+N more", which
 * opens the day's full scrollable list (DayEventsSheet).
 *
 * Kept low deliberately: a September day with UTR subscribed holds 200+
 * tournaments, and an agenda that renders all of them for all thirty days is a
 * six-thousand-row page nobody can scroll.
 */
const AGENDA_DAY_LIMIT = 5;

/** A projected feed tournament, as opposed to one of the user's own sessions. */
const isOwn = (e: CalendarEvent) => !e.id.startsWith("intl-");

/**
 * Deliberately duplicated from CalendarPage rather than exported from it.
 *
 * CalendarPage imports this component; exporting the helper the other way
 * would close the loop, and `src/pages/__tests__/calendarProjection.test.ts`
 * imports CalendarPage directly — a circular module graph there is a fault
 * that shows up as an undefined import at test time, not at build time.
 */
function eventsOnDay(events: CalendarEvent[], day: Date) {
  return events.filter((e) => {
    const start = parseISO(e.startDate);
    const end = parseISO(e.endDate);
    return isWithinInterval(day, {
      start: new Date(start.toDateString()),
      end: new Date(end.toDateString()),
    });
  });
}

/**
 * A start time, or a date span for anything crossing midnight.
 *
 * Tournaments are stored at midnight UTC, so a plain clock time renders every
 * one of them as "02:00" — a precise-looking number that says nothing true
 * about a week-long event. Same rule as DayEventsSheet.
 */
function whenLabel(e: CalendarEvent): string {
  const start = parseISO(e.startDate);
  const end = parseISO(e.endDate);
  if (differenceInCalendarDays(end, start) >= 1) {
    return `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
  }
  return format(start, "HH:mm");
}

export interface AgendaViewProps {
  currentDate: Date;
  /** Which span the list covers — follows the view the toolbar is stepping. */
  range: "month" | "week";
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  /** Opens the day's full list. Reuses DayEventsSheet, as the month grid does. */
  onOpenDay: (day: Date, events: CalendarEvent[]) => void;
  /**
   * Tapping a day header. Same meaning as clicking a month cell: go to that
   * day. Without it the only route to 15 September in Day view is the Day tab
   * and eleven taps on the arrow.
   */
  onDayClick?: (day: Date) => void;
  showPlayerLabel?: boolean;
  registeredIntlIds?: Set<string>;
}

export function AgendaView({
  currentDate,
  range,
  events,
  onSelectEvent,
  onOpenDay,
  onDayClick,
  showPlayerLabel,
  registeredIntlIds,
}: AgendaViewProps) {
  const today = new Date();

  const groups = useMemo(() => {
    const start = range === "month" ? startOfMonth(currentDate) : startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = range === "month" ? endOfMonth(currentDate) : endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end })
      .map((day) => {
        // Own sessions first, THEN by time — and this has to happen before the
        // slice below, or on a day holding one training and two hundred
        // tournaments the coach's own session is what ends up hidden behind
        // "+197 more".
        const dayEvents = [...eventsOnDay(events, day)].sort((a, b) => {
          if (isOwn(a) !== isOwn(b)) return isOwn(a) ? -1 : 1;
          return a.startDate.localeCompare(b.startDate);
        });
        return { day, dayEvents };
      })
      .filter((g) => g.dayEvents.length > 0);
  }, [events, currentDate, range]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center shadow-sm">
        <CalendarDays className="mb-2 h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm font-medium text-foreground">
          Nothing in {range === "month" ? format(currentDate, "MMMM yyyy") : "this week"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Use the arrows to look at another {range}, or open Filters to add a tournament calendar.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <ul className="divide-y divide-border">
        {groups.map(({ day, dayEvents }) => {
          const isToday = isSameDay(day, today);
          const shown = dayEvents.slice(0, AGENDA_DAY_LIMIT);
          const hidden = dayEvents.length - shown.length;
          return (
            <li key={day.toISOString()}>
              {/* Day header. The date badge mirrors the grid's, so the two
                  layouts read as the same calendar. Tapping it opens the day,
                  which is what clicking a month cell does. */}
              <button
                type="button"
                onClick={onDayClick ? () => onDayClick(day) : undefined}
                disabled={!onDayClick}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-default ${isToday ? "bg-primary/5 dark:bg-primary/10" : "bg-muted/30"} ${onDayClick ? "active:bg-accent/40" : ""}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground"
                  }`}
                >
                  {format(day, "d")}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  {format(day, "EEEE")}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{format(day, "MMM")}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                </span>
              </button>

              <ul>
                {shown.map((e) => {
                  const base = eventBaseColor(e.type, e.title);
                  const entityId = e.playerId || e.teamId;
                  const entity = showPlayerLabel && entityId ? entityColor(entityId) : null;
                  return (
                    <li key={e.id}>
                      {/* min-h-[44px]: a phone row has to be thumb-sized. The
                          global tap-target pass covers buttons, not list rows. */}
                      <button
                        type="button"
                        onClick={() => onSelectEvent(e)}
                        className="flex min-h-[44px] w-full items-center gap-3 border-l-[3px] px-3 py-2.5 text-left transition-colors active:bg-accent/30"
                        style={{ borderLeftColor: entity ?? base, backgroundColor: withAlpha(base, "0d") }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
                              {e.title}
                            </span>
                            {registeredIntlIds?.has(e.id) && (
                              <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Entered
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="tabular-nums">{whenLabel(e)}</span>
                            {e.location && (
                              <span className="flex min-w-0 items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{e.location}</span>
                              </span>
                            )}
                            {showPlayerLabel && e.playerName && <span className="truncate">{e.playerName}</span>}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenDay(day, dayEvents)}
                  className="flex min-h-[44px] w-full items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-primary transition-colors active:bg-accent/30"
                >
                  Show all {dayEvents.length} on {format(day, "d MMM")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
