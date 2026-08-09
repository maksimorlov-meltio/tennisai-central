// Subtle, honest affordance shown when a saved draft was put back into a form.
import type { ReactNode } from "react";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DraftRestoredNoticeProps {
  /** ISO timestamp of the restored draft — the notice renders only when set. */
  savedAt: string | null;
  /** Throw the draft away and reset the form. */
  onDiscard: () => void;
  /** Keep the draft, just hide the notice. */
  onDismiss: () => void;
  /** Label for the discard action, e.g. "Start fresh". */
  discardLabel?: string;
  children?: ReactNode;
}

export function DraftRestoredNotice({
  savedAt,
  onDiscard,
  onDismiss,
  discardLabel = "Discard draft",
  children,
}: DraftRestoredNoticeProps) {
  if (!savedAt) return null;
  const when = new Date(savedAt);
  const label = Number.isNaN(when.getTime())
    ? "earlier"
    : when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="flex items-center gap-1.5">
        <History className="h-3.5 w-3.5 shrink-0" />
        {children ?? <>Restored your unsaved draft from {label}.</>}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onDiscard}>
          {discardLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Dismiss draft notice"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </span>
    </div>
  );
}
