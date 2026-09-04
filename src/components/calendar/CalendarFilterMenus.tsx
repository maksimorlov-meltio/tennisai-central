import { forwardRef, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The calendar toolbar's filter dropdowns.
 *
 * These replaced four stacked rows of chips. Deliberately generic (options in,
 * selection out) so they don't need EVENT_CONFIG or the circuit list, which stay
 * page-local — the calendar passes labels and colours down.
 */

export interface FilterOption {
  value: string;
  label: string;
  /** Rendered as a small dot, so a menu row matches its colour on the grid. */
  color?: string;
  icon?: React.ReactNode;
}

function Dot({ color }: { color?: string }) {
  if (!color) return null;
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

/**
 * Shared trigger so every filter button in the row looks identical.
 *
 * MUST forward the ref and spread the rest of its props: `DropdownMenuTrigger
 * asChild` hands its onPointerDown/aria/data-state and ref to this component,
 * and swallowing them leaves a button that looks right and opens nothing.
 */
const TriggerButton = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { icon?: React.ReactNode; active?: boolean }
>(({ icon, children, active, className, ...props }, ref) => (
  <Button
    ref={ref}
    variant="outline"
    size="sm"
    // `active` = this filter is narrowing results. Worth a visible cue, since a
    // collapsed dropdown otherwise hides the fact that things are filtered out.
    className={`h-8 gap-1.5 px-2.5 text-xs font-medium ${
      active ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15" : "text-muted-foreground hover:text-foreground"
    } ${className ?? ""}`}
    {...props}
  >
    {icon}
    {children}
    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
  </Button>
));
TriggerButton.displayName = "TriggerButton";

/** Multi-select filter (event types, federations). */
export function MultiFilterMenu({
  label, icon, options, selected, onToggle, onSelectAll, onSelectNone,
}: {
  label: string;
  icon?: React.ReactNode;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const allOn = options.length > 0 && options.every((o) => selected.has(o.value));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TriggerButton icon={icon} active={!allOn}>
          {/* Both wrapped in spans so the Button's flex `gap` separates them —
              a bare text node next to the badge renders as "Federation· 5". */}
          <span>{label}</span>
          {!allOn && <span className="font-semibold">· {selected.size}</span>}
        </TriggerButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.has(o.value)}
            // Keep the menu open: picking several federations in one visit is the
            // normal case, and closing after each tick would make that tedious.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(o.value)}
            className="text-xs"
          >
            <span className="flex items-center gap-2">
              <Dot color={o.color} />
              {o.icon}
              {o.label}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <div className="flex gap-1 px-1 pb-0.5">
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onSelectAll(); }} className="flex-1 justify-center text-xs font-medium">
            All
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onSelectNone(); }} className="flex-1 justify-center text-xs font-medium">
            None
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Location filter, for a calendar that now spans the world.
 *
 * A plain checklist is what the other filters use and it does not survive here:
 * the feeds cover well over a hundred countries, and a coach looking for Spain
 * should not scroll past Azerbaijan to find it. So this one is searchable, and
 * the list is ordered by how many events each place has — the countries a squad
 * actually plays in rise to the top on their own.
 *
 * Nothing selected means everywhere, which is the right default for a filter
 * you have not opened yet.
 */
export function LocationFilterMenu({
  label = "Location",
  icon,
  options,
  selected,
  onToggle,
  onSelectNone,
}: {
  label?: string;
  icon?: React.ReactNode;
  /** Value, label and how many events are at that location. */
  options: Array<FilterOption & { count: number }>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectNone: () => void;
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    // A selected country stays visible even when the search would hide it,
    // otherwise turning one off means retyping the search to find it again.
    const selectedOnes = options.filter((o) => selected.has(o.value) && !matched.includes(o));
    return [...selectedOnes, ...matched].slice(0, 60);
  }, [options, query, selected]);

  const active = selected.size > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TriggerButton icon={icon} active={active}>
          <span>{label}</span>
          {active && <span className="font-semibold">· {selected.size}</span>}
        </TriggerButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <div className="p-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries…"
              className="h-8 pl-7 text-xs"
              // The menu steals the first keystroke to its own type-ahead
              // otherwise, and the box appears not to work.
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nowhere matches “{query}”.
            </p>
          ) : (
            shown.map((o) => (
              <DropdownMenuCheckboxItem
                key={o.value}
                checked={selected.has(o.value)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onToggle(o.value)}
                className="text-xs"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span>{o.label}</span>
                  <span className="text-muted-foreground">{o.count}</span>
                </span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </div>
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); onSelectNone(); }}
              className="justify-center text-xs font-medium"
            >
              Show everywhere
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-select filter (source, coach scope, team). Trigger shows the choice. */
export function SingleFilterMenu({
  label, icon, options, value, onChange, defaultValue, groups,
}: {
  label: string;
  icon?: React.ReactNode;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** When `value` differs from this, the trigger is highlighted as active. */
  defaultValue?: string;
  /** Optional section headings, keyed by the first option value in the section. */
  groups?: Record<string, string>;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TriggerButton icon={current?.icon ?? icon} active={defaultValue !== undefined && value !== defaultValue}>
          {current?.label ?? label}
        </TriggerButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <div key={o.value}>
              {groups?.[o.value] && (
                <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {groups[o.value]}
                </DropdownMenuLabel>
              )}
              <DropdownMenuRadioItem value={o.value} className="text-xs">
                <span className="flex items-center gap-2">
                  <Dot color={o.color} />
                  {o.icon}
                  {o.label}
                </span>
              </DropdownMenuRadioItem>
            </div>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Drop targets for reassigning an event to a player, revealed only while an
 * event is actually being dragged.
 *
 * The player chips used to be permanent, and collapsing scope into a dropdown
 * would have silently deleted drag-to-reassign along with them. Showing the
 * targets on dragstart keeps the capability and costs no toolbar space at rest.
 */
export function ReassignDropStrip({
  targets, onAssign,
}: {
  targets: { id: string | null; label: string; color?: string }[];
  onAssign: (eventId: string, playerId: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2">
      <span className="text-xs font-medium text-primary">Drop on a name to reassign:</span>
      {targets.map((t) => (
        <DropTarget key={t.id ?? "__mine__"} label={t.label} color={t.color} onDrop={(eventId) => onAssign(eventId, t.id)} />
      ))}
    </div>
  );
}

function DropTarget({ label, color, onDrop }: { label: string; color?: string; onDrop: (eventId: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <span
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("application/calendar-event-id");
        if (id) onDrop(id);
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
        over ? "scale-105 border-primary bg-primary/20 text-primary ring-2 ring-primary" : "border-border bg-card text-foreground"
      }`}
    >
      <Dot color={color} />
      {label}
      {over && <Check className="h-3 w-3" />}
    </span>
  );
}
