// ============================================================
// TennisAI — Visible way into the command palette
// ============================================================
//
// A keyboard shortcut nobody has been told about is not a feature. These are
// the two affordances that make the palette reachable with a mouse or a thumb:
// a full-width row at the top of the sidebar (desktop and the mobile drawer),
// and an icon button in the phone header, where the sidebar isn't.

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ⌘ on a Mac, Ctrl everywhere else — showing the wrong one teaches the wrong
 * shortcut. Evaluated once at module load; nobody changes platform mid-session.
 */
const IS_APPLE =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");

export const SHORTCUT_LABEL = IS_APPLE ? "⌘K" : "Ctrl K";

interface SearchTriggerProps {
  onClick: () => void;
  className?: string;
}

/** The sidebar row. Reads as a search field, behaves as a button. */
export function SearchTrigger({ onClick, className }: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search — pages, players and tournaments"
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        // min-h, never h: a 36px row on a mouse, a 44px target under a finger.
        "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm",
        "text-muted-foreground transition-colors touch-manipulation hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "min-h-9 coarse:min-h-11",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">Search…</span>
      {/* Desktop only. Below `md` this row is inside the mobile drawer, where
          there is no keyboard to press the shortcut on. Deliberately keyed on
          the breakpoint rather than `coarse:hidden`, because a `coarse:` and an
          `sm:` rule on the same property are two media queries of equal
          specificity and which one wins comes down to emission order. */}
      <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-block">
        {SHORTCUT_LABEL}
      </kbd>
    </button>
  );
}

/** The phone header's icon button, beside the theme switch. */
export function SearchTriggerIcon({ onClick, className }: SearchTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Search — pages, players and tournaments"
      aria-keyshortcuts="Control+K Meta+K"
      className={className}
    >
      <Search className="h-5 w-5" />
    </Button>
  );
}
