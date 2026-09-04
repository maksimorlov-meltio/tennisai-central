// Everything on one day, in a list you can scroll.
//
// A month cell fits four events. With the world's tournament calendars loaded a
// single day can hold two hundred, and "+181 more" was a dead end — the count
// told you something was there and gave you no way to reach it.

import { useMemo } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { CalendarDays, MapPin } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { CalendarEvent } from "@/types";

export interface DayEventsSheetProps {
  day: Date | null;
  events: CalendarEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  /** Ids the viewer's players are entered for, badged so they stand out. */
  registeredIds?: Set<string>;
}

export function DayEventsSheet({
  day,
  events,
  open,
  onOpenChange,
  onSelectEvent,
  registeredIds,
}: DayEventsSheetProps) {
  // Own sessions first, then everything else by time. On a day with two hundred
  // tournaments the coach's own training is the thing they came to find.
  const ordered = useMemo(() => {
    const isOwn = (e: CalendarEvent) => !e.id.startsWith("intl-");
    return [...events].sort((a, b) => {
      if (isOwn(a) !== isOwn(b)) return isOwn(a) ? -1 : 1;
      return a.startDate.localeCompare(b.startDate);
    });
  }, [events]);

  const ownCount = ordered.filter((e) => !e.id.startsWith("intl-")).length;

  /**
   * A start time, or a date range for anything spanning days.
   *
   * Tournaments are stored as midnight UTC and were rendering as "02:00" for
   * every single one — a precise-looking time that means nothing about a
   * week-long event. The span is the useful fact.
   */
  const whenLabel = (e: CalendarEvent): string => {
    const start = new Date(e.startDate);
    const end = new Date(e.endDate);
    const days = differenceInCalendarDays(end, start);
    if (days >= 1) return `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
    return format(start, "HH:mm");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="pb-3">
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            {day ? format(day, "EEEE d MMMM yyyy") : "Day"}
          </SheetTitle>
          <SheetDescription>
            {ordered.length} {ordered.length === 1 ? "event" : "events"}
            {ownCount > 0 && ownCount !== ordered.length && <> · {ownCount} yours</>}
          </SheetDescription>
        </SheetHeader>

        {/* The scrolling region. min-h-0 is what actually lets it scroll inside
            a flex column — without it the list grows and pushes the sheet. */}
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {ordered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing on this day.
            </p>
          ) : (
            <ul className="space-y-2">
              {ordered.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEvent(e)}
                    className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/30 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm font-medium text-foreground">{e.title}</span>
                      {registeredIds?.has(e.id) && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Entered
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{whenLabel(e)}</span>
                      {e.location && (
                        <span className="flex min-w-0 items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{e.location}</span>
                        </span>
                      )}
                      {e.playerName && <span>{e.playerName}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
