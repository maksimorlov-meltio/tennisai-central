import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface LegendProps {
  typeItems: { label: string; color: string; count: number }[];
  circuitItems: { label: string; color: string }[];
}

/**
 * The colour/status key, as a plain panel.
 *
 * Exported separately from the popover so it can sit inline in the Calendar
 * page's mini-calendar column (where it lives) without a second click, while
 * the popover form stays available for space-constrained placements.
 */
export function CalendarLegendPanel({ typeItems, circuitItems }: LegendProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event types</h3>
          <div className="space-y-1.5">
            {typeItems.map((t) => (
              <div key={t.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.label}
                </span>
                <span className="font-medium text-muted-foreground">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Federations</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {circuitItems.map((c) => (
              <span key={c.label} className="flex items-center gap-1.5 text-xs text-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.label}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h3>
          <div className="space-y-1 text-[11px] text-muted-foreground">
            <p><span className="text-foreground">Confirmed</span> — solid</p>
            <p><span className="text-foreground">Tentative / Requested</span> — dashed outline</p>
            <p><span className="text-foreground">Completed</span> — dimmed</p>
            <p><span className="text-foreground">Cancelled</span> — dashed &amp; struck through</p>
          </div>
        </div>
        <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Tournaments are coloured by federation; the left bar &amp; dot show the player/team.
        </p>
    </div>
  );
}

/** Popover form of the same key, for toolbars with no room for a panel. */
export function CalendarLegend(props: LegendProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Colour legend"
          aria-label="Colour legend"
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 border-0 p-0 shadow-none">
        <CalendarLegendPanel {...props} />
      </PopoverContent>
    </Popover>
  );
}
