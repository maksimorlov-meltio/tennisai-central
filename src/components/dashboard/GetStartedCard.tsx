// ============================================================
// "Get started" checklist — first-run guidance
//
// A brand-new account lands on an empty dashboard with no idea what to do
// first. This card lists the two or three steps that make the app useful.
// Every tick is DERIVED from real data the dashboard already queried
// (connections, plans, tournaments, onboarding answers…): a step is done
// because the data says so, never because a flag was stored. The item
// builders live in `firstRunItems.ts`, one per role.
//
// The single exception is an item flagged `manual` — reserved for a step no
// client-readable data can prove (today: the parent's consent review). Such
// an item is rendered with an explicit self-confirm control and labelled as
// self-confirmed, so nobody mistakes it for a verified tick.
//
// Dismissal is per-account and device-local (localStorage), and it expires:
// a dismissed card comes back after DISMISS_DAYS if the account is still
// incomplete. The card disappears for good once every step is done.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface GetStartedItem {
  /** Stable id — also the key a manual self-confirmation is stored under. */
  id: string;
  label: string;
  description?: string;
  /** Where the step is completed. */
  to: string;
  actionLabel: string;
  /** Derived from real data. The only thing that can tick a non-manual item. */
  done: boolean;
  /**
   * Set ONLY for a step that nothing reaching the client can prove. The user
   * confirms it by hand and the card says so. `reason` documents why the step
   * is unprovable — it is for maintainers and is never rendered.
   */
  manual?: { reason: string };
}

interface GetStartedCardProps {
  /** Per-account scope for the persisted state, e.g. `coach:usr-1`. */
  storageKey: string;
  items: GetStartedItem[];
}

interface StoredState {
  /** Epoch ms of the last dismissal, or null. */
  dismissedAt: number | null;
  /** Ids of MANUAL items the user confirmed by hand. Ignored for derived items. */
  confirmed: string[];
}

/** A dismissed card returns after this long if the account is still incomplete. */
export const DISMISS_DAYS = 7;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

const EMPTY_STATE: StoredState = { dismissedAt: null, confirmed: [] };

/** Exported so tests can seed storage without duplicating the key format. */
export function getStartedStorageId(scope: string): string {
  return `tennisai_getstarted_${scope}`;
}

/** Reads the persisted state. Storage can be unavailable (private mode) — never throw. */
function readState(scope: string): StoredState {
  try {
    const raw = localStorage.getItem(getStartedStorageId(scope));
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<StoredState> & { dismissed?: boolean };
    return {
      // Legacy `{ dismissed: true }` (no timestamp) counts as long expired, so
      // an account dismissed under the old rules sees the card again once.
      dismissedAt:
        typeof parsed.dismissedAt === "number" ? parsed.dismissedAt : parsed.dismissed === true ? 0 : null,
      confirmed: Array.isArray(parsed.confirmed)
        ? parsed.confirmed.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeState(scope: string, state: StoredState): void {
  try {
    localStorage.setItem(getStartedStorageId(scope), JSON.stringify(state));
  } catch {
    /* device storage unavailable — the checklist simply won't persist */
  }
}

export function GetStartedCard({ storageKey, items }: GetStartedCardProps) {
  const { t } = useT();
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
        isManual: item.manual !== undefined,
        // Derived truth is the only source for a normal item; storage is
        // consulted for manual items alone.
        isDone: item.done || (item.manual !== undefined && state.confirmed.includes(item.id)),
      })),
    [items, state.confirmed],
  );

  const doneCount = resolved.filter((item) => item.isDone).length;
  const dismissed = state.dismissedAt !== null && Date.now() - state.dismissedAt < DISMISS_MS;

  if (items.length === 0 || dismissed || doneCount === items.length) return null;

  const toggleConfirmed = (id: string) => {
    const confirmed = state.confirmed.includes(id)
      ? state.confirmed.filter((entry) => entry !== id)
      : [...state.confirmed, id];
    persist({ ...state, confirmed });
  };

  return (
    <DashboardCard
      title={t("firstRun.card.title")}
      description={t("firstRun.card.progress", { done: doneCount, total: items.length })}
      icon={<Rocket className="h-4 w-4" />}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => persist({ ...state, dismissedAt: Date.now() })}
          aria-label={t("firstRun.card.dismiss")}
        >
          <X className="h-4 w-4" />
        </Button>
      }
    >
      <ol className="space-y-3" data-testid="get-started-list">
        {resolved.map((item) => (
          <li
            key={item.id}
            data-testid={`get-started-item-${item.id}`}
            data-done={item.isDone ? "true" : "false"}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3"
          >
            {item.isManual ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={item.isDone}
                aria-label={t("firstRun.card.confirm", { label: item.label })}
                onClick={() => toggleConfirmed(item.id)}
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
              {item.isManual && (
                <p className="text-[11px] text-muted-foreground">{t("firstRun.card.selfConfirmed")}</p>
              )}
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
