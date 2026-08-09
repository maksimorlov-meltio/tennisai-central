// ============================================================
// "Get started" checklist — first-run guidance
//
// A brand-new account lands on an empty dashboard with no idea what to do
// first. This card lists the two or three steps that make the app useful,
// and every tick is derived from real data the dashboard already queried
// (connections, matches, tournaments, trainings…) — a step is never marked
// done on the user's behalf. Steps that no query can prove (e.g. "build a
// session") stay manually tickable.
//
// Dismissal and manual ticks are per-account, device-local (localStorage).
// The card disappears once every step is done, so it is only ever visible
// while the account is still fresh.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { cn } from "@/lib/utils";

export interface GetStartedItem {
  /** Stable id — used as the localStorage key for a manual tick. */
  id: string;
  label: string;
  description?: string;
  /** Where the step is completed. */
  to: string;
  actionLabel: string;
  /**
   * Derived from real data. `undefined` means nothing in the app can prove
   * this step, so the user ticks it by hand.
   */
  done?: boolean;
}

interface GetStartedCardProps {
  /** Per-account scope for the persisted state, e.g. `coach:usr-1`. */
  storageKey: string;
  items: GetStartedItem[];
}

interface StoredState {
  dismissed: boolean;
  checked: string[];
}

const EMPTY_STATE: StoredState = { dismissed: false, checked: [] };

function storageId(scope: string): string {
  return `tennisai_getstarted_${scope}`;
}

/** Reads the persisted state. Storage can be unavailable (private mode) — never throw. */
function readState(scope: string): StoredState {
  try {
    const raw = localStorage.getItem(storageId(scope));
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      dismissed: parsed.dismissed === true,
      checked: Array.isArray(parsed.checked) ? parsed.checked.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeState(scope: string, state: StoredState): void {
  try {
    localStorage.setItem(storageId(scope), JSON.stringify(state));
  } catch {
    /* device storage unavailable — the checklist simply won't persist */
  }
}

export function GetStartedCard({ storageKey, items }: GetStartedCardProps) {
  const [state, setState] = useState<StoredState>(() => readState(storageKey));

  // Switching account (or scope) must not carry the previous state over.
  useEffect(() => {
    setState(readState(storageKey));
  }, [storageKey]);

  const persist = useCallback(
    (next: StoredState) => {
      setState(next);
      writeState(storageKey, next);
    },
    [storageKey],
  );

  const resolved = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        /** Derived truth wins; a manual tick only applies to non-derivable steps. */
        isDone: item.done === true || (item.done === undefined && state.checked.includes(item.id)),
        isManual: item.done === undefined,
      })),
    [items, state.checked],
  );

  const doneCount = resolved.filter((item) => item.isDone).length;

  if (items.length === 0 || state.dismissed || doneCount === items.length) return null;

  const toggle = (id: string) => {
    const checked = state.checked.includes(id)
      ? state.checked.filter((entry) => entry !== id)
      : [...state.checked, id];
    persist({ ...state, checked });
  };

  return (
    <DashboardCard
      title="Get started"
      description={`${doneCount} of ${items.length} done — a few steps and the app starts working for you`}
      icon={<Rocket className="h-4 w-4" />}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => persist({ ...state, dismissed: true })}
          aria-label="Dismiss the get started checklist"
        >
          <X className="h-4 w-4" />
        </Button>
      }
    >
      <ol className="space-y-3">
        {resolved.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3"
          >
            {item.isManual ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={item.isDone}
                aria-label={`Mark "${item.label}" as done`}
                onClick={() => toggle(item.id)}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors",
                  item.isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-transparent hover:border-primary/60",
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border",
                  item.isDone ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  item.isDone ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {item.label}
              </p>
              {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
            </div>

            {!item.isDone && (
              <Button size="sm" variant="outline" className="shrink-0 text-xs" asChild>
                <Link to={item.to}>
                  {item.actionLabel} <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
    </DashboardCard>
  );
}
