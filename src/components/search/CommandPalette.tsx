// ============================================================
// TennisAI — Global command palette (Ctrl/⌘ + K)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Trophy, User } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { useTournaments } from "@/hooks/api/queries";
import type { UserRole } from "@/types";
import { searchableDestinations } from "./navRegistry";
import { buildSearchResults, countResults, type SearchResult } from "./searchIndex";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Ctrl+K / ⌘+K from anywhere in the dashboard.
 *
 * `preventDefault` is not optional: Chrome and Edge bind ⌘/Ctrl+K to the
 * omnibox search, and without it the browser wins and the palette never opens.
 * Repeat keydowns while a key is held are ignored so leaning on the shortcut
 * doesn't flicker the dialog open and shut.
 *
 * `code` is checked as well as `key`, and that is the important half here: on a
 * Cyrillic layout the same physical key reports `key: "л"`, so a `key`-only
 * check would leave the shortcut dead for anyone typing in Russian — which is
 * most of this app's coaches.
 */
function useCommandShortcut(open: boolean, onOpenChange: (open: boolean) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isKKey = event.code === "KeyK" || event.key === "k" || event.key === "K";
      if (!isKKey) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.repeat) return;
      event.preventDefault();
      onOpenChange(!open);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);
}

const TYPE_ICONS = {
  player: <User className="h-4 w-4" />,
  tournament: <Trophy className="h-4 w-4" />,
} as const;

/** The sidebar's own icon for a destination, so search and nav look alike. */
function iconFor(result: SearchResult): React.ReactNode {
  if (result.type !== "navigation") return TYPE_ICONS[result.type];
  // searchableDestinations, not navItems: the account destinations (Profile,
  // notification settings) aren't in the sidebar and would fall through to the
  // wrong icon.
  return searchableDestinations.find((item) => `nav:${item.to}` === result.id)?.icon;
}

interface PaletteResultsProps {
  role: UserRole;
  query: string;
  onSelect: (to: string) => void;
}

/**
 * The rows.
 *
 * Split out so its data hooks live *inside* the dialog content, which Radix
 * only mounts while the palette is open — a user who never presses ⌘K never
 * pays for the tournaments request.
 */
function PaletteResults({ role, query, onSelect }: PaletteResultsProps) {
  const { connectedPlayers } = useConnections();
  const { data: tournaments = [], isLoading: tournamentsLoading } = useTournaments();

  const groups = useMemo(
    () => buildSearchResults({ role, query, players: connectedPlayers, tournaments }),
    [role, query, connectedPlayers, tournaments],
  );

  const total = countResults(groups);
  // Honest states: while the tournament list is still in flight we say so
  // rather than reporting "no results" for a set we haven't seen yet.
  const isSearching = query.trim().length > 0;
  const stillLoading = isSearching && tournamentsLoading;

  return (
    <>
      {groups.map((group) => (
        <CommandGroup key={group.type} heading={group.heading}>
          {group.results.map((result) => (
            <CommandItem
              key={result.id}
              value={result.id}
              onSelect={() => onSelect(result.to)}
              className="gap-3"
            >
              <span className="flex shrink-0 items-center text-muted-foreground">{iconFor(result)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{result.label}</span>
                {result.subtitle && (
                  <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                )}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}

      {stillLoading && (
        <div
          className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Searching tournaments…
        </div>
      )}

      {/* Only when there is genuinely nothing to show and nothing still coming. */}
      {total === 0 && !stillLoading && (
        <CommandEmpty className="px-4 py-6 text-sm text-muted-foreground">
          {isSearching ? `No matches for “${query.trim()}”.` : "Nothing to show."}
        </CommandEmpty>
      )}
    </>
  );
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const role: UserRole = user?.role ?? "player";

  useCommandShortcut(open, onOpenChange);

  // A palette that reopens holding the last search is a palette you have to
  // clear before you can use it.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const handleSelect = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Matches CommandDialog's own content classes (p-0, overflow hidden), with
          two additions. `top-[8%] translate-y-0` below `sm`: a vertically centred
          palette on a phone sits behind the soft keyboard the moment you type,
          which is the only thing the palette asks you to do. And gap-0, because
          DialogContent's grid gap-4 would open a band between input and list. */}
      <DialogContent className="top-[8%] max-h-[min(80dvh,32rem)] translate-y-0 gap-0 overflow-hidden p-0 shadow-lg sm:top-[50%] sm:translate-y-[-50%]">
        {/* Radix requires both for the dialog to announce itself; the input's
            placeholder is the visible label. */}
        <DialogTitle className="sr-only">Search TennisAI</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages, players and tournaments. Use the arrow keys to choose a result and Enter to open it.
        </DialogDescription>

        {/* shouldFilter={false}: cmdk's built-in filter would re-rank on top of
            searchIndex's ordering and re-filter data it can't see the keywords
            for. The rows handed to it are already the answer. */}
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          {/* pr-10 keeps the typed text clear of DialogContent's close button. */}
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search pages, players, tournaments…"
            className="pr-10"
            aria-label="Search TennisAI"
          />
          <CommandList className="max-h-[min(60dvh,24rem)] overscroll-contain pb-[env(safe-area-inset-bottom)]">
            <PaletteResults role={role} query={query} onSelect={handleSelect} />
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
