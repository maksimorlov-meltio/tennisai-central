// ============================================================
// TennisAI — the recent-window control
//
// Drives the `recent` query param of GET /api/matches/stats (which resizes the
// server's recent-form window) AND the client-side trend window, so both read
// the same span of real matches.
//
// The option list is built from the actual match list: a window bigger than the
// number of logged matches is never offered, and "Season" only appears when the
// player has logged something in the current calendar year.
// ============================================================

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toCalendarDate } from "@/lib/stats/format";
import type { MatchView } from "@/types";

/** Server cap: GET /api/matches/stats validates `recent` as 1…50. */
export const MAX_RECENT = 50;

export type StatsWindowId = "last5" | "last10" | "last20" | "season" | "all";

export interface StatsWindowOption {
  id: StatsWindowId;
  label: string;
  /** How many of the player's most recent matches this window covers. */
  size: number;
}

const NOMINAL: { id: StatsWindowId; label: string; size: number }[] = [
  { id: "last5", label: "Last 5", size: 5 },
  { id: "last10", label: "Last 10", size: 10 },
  { id: "last20", label: "Last 20", size: 20 },
];

/**
 * Matches dated on or after 1 Jan of the current year — the "season" so far.
 * Because the list is ordered newest-first, these are exactly the newest N rows,
 * which is what makes it safe to express the season as a *count* (below).
 */
function seasonSize(matches: MatchView[]): number {
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  return matches.filter((m) => {
    const date = toCalendarDate(m.date);
    return date ? date.getTime() >= yearStart : false;
  }).length;
}

/**
 * Build the windows worth offering for this player's data.
 *
 * Note on "Season": the API's `recent` param is a *count*, not a date filter,
 * so we pass the number of matches dated this year or later. Ordered
 * newest-first, that count selects exactly those rows — server-side form and the
 * client-side trend therefore cover the identical set of matches.
 */
export function buildWindowOptions(matches: MatchView[]): StatsWindowOption[] {
  const total = matches.length;

  /**
   * The API refuses a `recent` above MAX_RECENT, so a wider window could not be
   * aggregated server-side. Rather than let the form and the trend cover
   * different spans, every option is clamped to the same size and the label says
   * so — the two scopes are then always the identical set of matches.
   */
  const clamp = (size: number, label: string): StatsWindowOption["label"] =>
    size > MAX_RECENT ? `${label} (last ${MAX_RECENT})` : label;

  const options: StatsWindowOption[] = NOMINAL.filter((o) => o.size < total).map((o) => ({ ...o }));

  const season = seasonSize(matches);
  if (season > 0 && season < total) {
    options.push({
      id: "season",
      label: clamp(season, `Season ${new Date().getFullYear()}`),
      size: Math.min(season, MAX_RECENT),
    });
  }

  options.push({
    id: "all",
    label: total > MAX_RECENT ? `Last ${MAX_RECENT}` : "All",
    size: Math.min(total, MAX_RECENT),
  });
  return options;
}

export function resolveWindow(
  options: StatsWindowOption[],
  id: StatsWindowId,
): StatsWindowOption | undefined {
  return options.find((o) => o.id === id);
}

/** The size to send as `recent`, clamped into the range the API accepts. */
export function recentParamFor(option: StatsWindowOption | undefined): number | undefined {
  if (!option || !Number.isFinite(option.size) || option.size <= 0) return undefined;
  return Math.min(MAX_RECENT, Math.max(1, Math.floor(option.size)));
}

export interface StatsWindowControlProps {
  options: StatsWindowOption[];
  value: StatsWindowId;
  onChange: (id: StatsWindowId) => void;
  /** Rendered next to the control — e.g. a subtle "Updating…" hint. */
  hint?: React.ReactNode;
}

export function StatsWindowControl({ options, value, onChange, hint }: StatsWindowControlProps) {
  if (options.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Window</span>
      <Tabs value={value} onValueChange={(next) => onChange(next as StatsWindowId)}>
        <TabsList className="h-9 rounded-none border border-border bg-muted p-0.5">
          {options.map((option) => (
            <TabsTrigger
              key={option.id}
              value={option.id}
              className="rounded-none px-3 py-1 text-xs data-[state=active]:shadow-none data-[state=active]:bg-background data-[state=active]:text-foreground"
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {hint}
    </div>
  );
}
