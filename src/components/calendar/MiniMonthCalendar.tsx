import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore,
  isSameDay, isSameMonth, isToday as isDateToday, parseISO, startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { eventBaseColor } from "@/lib/calendar/colors";
import type { CalendarEvent } from "@/types";

/** Max events listed inside a day's hover popup before it collapses to "+N more". */
const POPUP_EVENT_LIMIT = 5;

interface MiniMonthCalendarProps {
  /** The date the main calendar is currently showing (drives the selected ring). */
  currentDate: Date;
  /** Already-filtered events, so the dots agree with what the main grid shows. */
  events: CalendarEvent[];
  onSelectDate: (day: Date) => void;
  onMonthChange: (date: Date) => void;
}

/**
 * Compact month picker for the Calendar page's 260px side column.
 *
 * It briefly lived in the app sidebar, but with a full nav above it there was
 * only ~79px of column left at a 720px-tall window, which cropped it to a
 * scrolling sliver. On the page it gets its full height back.
 *
 * Hovering a day that has events opens a popup listing them, and it closes as
 * soon as the pointer leaves — days with nothing scheduled get no popup at all,
 * so the pointer never trails empty cards across the grid. The day stays
 * clickable, which is what serves touch devices (hover doesn't exist there).
 */
export function MiniMonthCalendar({ currentDate, events, onSelectDate, onMonthChange }: MiniMonthCalendarProps) {
  const [miniMonth, setMiniMonth] = useState(currentDate);

  // Day key → that day's events, so the dot count and the popup share one source.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      const start = parseISO(e.startDate);
      const end = parseISO(e.endDate);
      // Multi-day events (tournaments, travel) mark every day they span.
      eachDayOfInterval({ start: new Date(start.toDateString()), end: new Date(end.toDateString()) })
        .forEach((d) => {
          const key = format(d, "yyyy-MM-dd");
          const list = map.get(key);
          if (list) list.push(e);
          else map.set(key, [e]);
        });
    });
    return map;
  }, [events]);

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => !isBefore(parseISO(e.startDate), currentDate))
        .sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime())
        .slice(0, 5),
    [events, currentDate],
  );

  const monthStart = startOfMonth(miniMonth);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(miniMonth), { weekStartsOn: 1 }),
  });

  const goToToday = () => {
    const today = new Date();
    setMiniMonth(today);
    onSelectDate(today);
    onMonthChange(today);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      {/* ── Month grid ── */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <button
            onClick={() => setMiniMonth((p) => subMonths(p, 1))}
            aria-label="Previous month"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-semibold text-foreground">{format(miniMonth, "MMMM yyyy")}</span>
          <button
            onClick={() => setMiniMonth((p) => addMonths(p, 1))}
            aria-label="Next month"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="flex h-5 items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground/70">
              {d}
            </div>
          ))}

          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = isSameMonth(day, miniMonth);
            const isSelected = isSameDay(day, currentDate);
            const isToday = isDateToday(day);
            const hasEvents = dayEvents.length > 0 && inMonth;

            const dayButton = (
              <button
                onClick={() => { onSelectDate(day); onMonthChange(day); }}
                // Announce the count only when it's actually surfaced (dot +
                // popup), i.e. for in-month days — otherwise a screen reader
                // would promise events on a leading/trailing day that offers no
                // way to see them.
                aria-label={`${format(day, "EEEE d MMMM")}${hasEvents ? ` — ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}` : ""}`}
                className={`relative flex h-7 w-full items-center justify-center rounded text-[11px] font-medium transition-colors
                  ${!inMonth ? "text-muted-foreground/25" : "text-foreground"}
                  ${isSelected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-accent"}
                  ${isToday && !isSelected ? "ring-1 ring-inset ring-primary/60" : ""}
                `}
              >
                {format(day, "d")}
                {hasEvents && !isSelected && (
                  <span
                    className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-primary ${
                      dayEvents.length >= 3 ? "h-1 w-2.5" : "h-1 w-1"
                    }`}
                  />
                )}
              </button>
            );

            // No events → plain button, so hovering empty days shows nothing.
            if (!hasEvents) return <div key={key}>{dayButton}</div>;

            return (
              <div key={key}>
                <HoverCard openDelay={110} closeDelay={60}>
                  <HoverCardTrigger asChild>{dayButton}</HoverCardTrigger>
                  {/* Opens to the RIGHT: the sidebar is flush against the left
                      edge, so a top/bottom popup would clip off-screen. */}
                  <HoverCardContent side="right" align="start" sideOffset={10} className="w-64 p-0">
                    <div className="border-b border-border px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">{format(day, "EEEE, d MMMM")}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"} scheduled
                      </p>
                    </div>
                    <ul className="max-h-56 space-y-1 overflow-y-auto p-2">
                      {dayEvents.slice(0, POPUP_EVENT_LIMIT).map((e) => {
                        const start = parseISO(e.startDate);
                        const multiDay = !isSameDay(start, parseISO(e.endDate));
                        return (
                          <li key={e.id} className="flex items-start gap-2 rounded px-1 py-1">
                            <span
                              className="mt-1 h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: eventBaseColor(e.type, e.title) }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium leading-tight text-foreground">{e.title}</span>
                              <span className="block text-[10px] capitalize text-muted-foreground">
                                {multiDay ? "All day" : format(start, "h:mm a")} · {e.type}
                                {e.location ? ` · ${e.location}` : ""}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {dayEvents.length > POPUP_EVENT_LIMIT && (
                      <p className="border-t border-border px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
                        +{dayEvents.length - POPUP_EVENT_LIMIT} more — click the day to see all
                      </p>
                    )}
                  </HoverCardContent>
                </HoverCard>
              </div>
            );
          })}
        </div>

        <button
          onClick={goToToday}
          className="mt-1.5 w-full rounded-md py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Today
        </button>
      </div>

      {/* ── Upcoming ── */}
      {upcoming.length > 0 && (
        <div className="border-t border-border pt-2.5">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</h3>
          <div className="space-y-0.5">
            {upcoming.map((event) => {
              const start = parseISO(event.startDate);
              return (
                <button
                  key={event.id}
                  onClick={() => { onSelectDate(start); onMonthChange(start); }}
                  className="flex w-full items-start gap-2 rounded p-1.5 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: eventBaseColor(event.type, event.title) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium leading-tight text-foreground">{event.title}</span>
                    <span className="block text-[10px] text-muted-foreground">{format(start, "EEE d MMM · h:mm a")}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
