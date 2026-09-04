// ─── Filters, on a phone ──────────────────────────────────────────────────
//
// On a wide screen the calendar's filters are a run of dropdowns in the
// toolbar. At 375px that run wraps to three rows, and the tournament-calendar
// subscriptions are not reachable at all — they live in the mini-calendar
// column, which is `hidden lg:flex`. So a coach on a phone could see 1,700 UTR
// tournaments and had no way to switch them off.
//
// Everything collapses into one button and this sheet. It is a sheet rather
// than a popover for the same reason DayEventsSheet is: a full-height panel is
// the only surface on a phone big enough for a 150-row country list.
//
// Controls are plain rows, not the desktop Popover menus — a popover inside a
// sheet is a second dismissable layer to fight with on touch, and a checkable
// row is a bigger target than a menu item anyway.
import { useState } from "react";
import { Check, Filter, Globe, Loader2, MapPin, RefreshCw, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export interface CheckableItem {
  value: string;
  label: string;
  color?: string;
  count?: number;
}

export interface CalendarFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Event types (training, tournament, …). */
  typeOptions: CheckableItem[];
  activeTypes: Set<string>;
  onToggleType: (value: string) => void;
  onAllTypes: () => void;
  onNoTypes: () => void;

  /** Subscribed tournament calendars. Saved to the account. */
  circuitOptions: CheckableItem[];
  activeCircuits: Set<string>;
  onToggleCircuit: (value: string) => void;
  savingCircuits?: boolean;

  /** Countries. Shown only once at least one circuit is on. */
  countryOptions: CheckableItem[];
  activeCountries: Set<string>;
  onToggleCountry: (value: string) => void;
  onClearCountries: () => void;

  /** Coach-only: whose events to show. Absent for players and observers. */
  scopeOptions?: CheckableItem[];
  scopeValue?: string;
  onScopeChange?: (value: string) => void;

  /** Coach-only: team narrowing. `__all__` is "every team". */
  teamOptions?: CheckableItem[];
  teamValue?: string;
  onTeamChange?: (value: string) => void;

  /** The player colour key, which is a toolbar row on desktop. */
  playerLegend?: { id: string; name: string; color: string }[];

  onRefreshTournaments?: () => void;
  refreshing?: boolean;
}

/** A section title with an optional right-hand action. */
function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One checkable row. 44px tall, because it is tapped with a thumb. */
function Row({
  label,
  color,
  count,
  checked,
  radio,
  onClick,
}: {
  label: string;
  color?: string;
  count?: number;
  checked: boolean;
  /** Renders the mark as a dot rather than a tick, for one-of-many choices. */
  radio?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 text-left text-sm transition-colors active:bg-accent/40"
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${radio ? "rounded-full" : "rounded-[6px]"}`}
        style={{
          backgroundColor: checked ? (color ?? "hsl(var(--primary))") : "transparent",
          borderColor: color ?? (checked ? "hsl(var(--primary))" : "hsl(var(--border))"),
        }}
      >
        {checked &&
          (radio ? (
            <span className="h-2 w-2 rounded-full bg-background" />
          ) : (
            <Check className="h-3 w-3 text-background" strokeWidth={3.5} />
          ))}
      </span>
      <span className={`min-w-0 flex-1 truncate ${checked ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      {count !== undefined && <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{count}</span>}
    </button>
  );
}

/** Countries run to ~150; the rest hide behind "Show all" until asked for. */
const COUNTRY_PREVIEW = 8;

export function CalendarFiltersSheet({
  open,
  onOpenChange,
  typeOptions,
  activeTypes,
  onToggleType,
  onAllTypes,
  onNoTypes,
  circuitOptions,
  activeCircuits,
  onToggleCircuit,
  savingCircuits,
  countryOptions,
  activeCountries,
  onToggleCountry,
  onClearCountries,
  scopeOptions,
  scopeValue,
  onScopeChange,
  teamOptions,
  teamValue,
  onTeamChange,
  playerLegend,
  onRefreshTournaments,
  refreshing,
}: CalendarFiltersSheetProps) {
  const [allCountries, setAllCountries] = useState(false);
  const countries = allCountries ? countryOptions : countryOptions.slice(0, COUNTRY_PREVIEW);
  const showCountries = activeCircuits.size > 0 && countryOptions.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        {/* text-left: shadcn's SheetHeader centres below `sm`, which is every
            phone — the one place this sheet is ever shown. */}
        <SheetHeader className="pb-2 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Filters
          </SheetTitle>
          <SheetDescription>What the calendar shows.</SheetDescription>
        </SheetHeader>

        {/* min-h-0 is what actually makes a flex column scroll — without it the
            country list grows the sheet instead of scrolling inside it. */}
        <div className="-mx-6 min-h-0 flex-1 divide-y divide-border overflow-y-auto px-6 pb-2">
          <Section
            title="Event types"
            icon={<Filter className="h-3.5 w-3.5" />}
            action={
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onAllTypes}>
                  All
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onNoTypes}>
                  None
                </Button>
              </div>
            }
          >
            {typeOptions.map((t) => (
              <Row
                key={t.value}
                label={t.label}
                color={t.color}
                count={t.count}
                checked={activeTypes.has(t.value)}
                onClick={() => onToggleType(t.value)}
              />
            ))}
          </Section>

          <Section
            title="Tournament calendars"
            icon={savingCircuits ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            action={
              onRefreshTournaments && activeCircuits.size > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={onRefreshTournaments}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              ) : undefined
            }
          >
            {circuitOptions.map((c) => (
              <Row
                key={c.value}
                label={c.label}
                color={c.color}
                count={c.count}
                checked={activeCircuits.has(c.value)}
                onClick={() => onToggleCircuit(c.value)}
              />
            ))}
            <p className="px-2 pt-1.5 text-[11px] text-muted-foreground">
              {activeCircuits.size > 0
                ? "Saved to your account."
                : "Showing only your own sessions. Pick a calendar to add tournaments."}
            </p>
          </Section>

          {showCountries && (
            <Section
              title="Countries"
              icon={<MapPin className="h-3.5 w-3.5" />}
              action={
                activeCountries.size > 0 ? (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClearCountries}>
                    Clear
                  </Button>
                ) : undefined
              }
            >
              {activeCountries.size === 0 && (
                <p className="px-2 pb-1 text-[11px] text-muted-foreground">Everywhere. Pick countries to narrow.</p>
              )}
              {countries.map((c) => (
                <Row
                  key={c.value}
                  label={c.label}
                  count={c.count}
                  checked={activeCountries.has(c.value)}
                  onClick={() => onToggleCountry(c.value)}
                />
              ))}
              {countryOptions.length > COUNTRY_PREVIEW && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-8 w-full text-xs"
                  onClick={() => setAllCountries((v) => !v)}
                >
                  {allCountries ? "Show fewer" : `Show all ${countryOptions.length} countries`}
                </Button>
              )}
            </Section>
          )}

          {scopeOptions && scopeOptions.length > 0 && onScopeChange && (
            <Section title="Whose events" icon={<Users className="h-3.5 w-3.5" />}>
              {scopeOptions.map((s) => (
                <Row
                  key={s.value}
                  label={s.label}
                  color={s.color}
                  radio
                  checked={scopeValue === s.value}
                  onClick={() => onScopeChange(s.value)}
                />
              ))}
            </Section>
          )}

          {teamOptions && teamOptions.length > 1 && onTeamChange && (
            <Section title="Team" icon={<Users className="h-3.5 w-3.5" />}>
              {teamOptions.map((t) => (
                <Row
                  key={t.value}
                  label={t.label}
                  radio
                  checked={teamValue === t.value}
                  onClick={() => onTeamChange(t.value)}
                />
              ))}
            </Section>
          )}

          {playerLegend && playerLegend.length > 0 && (
            <Section title="Player colours">
              <div className="flex flex-wrap gap-x-4 gap-y-2 px-2">
                {playerLegend.map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 text-xs text-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
