// ============================================================
// "Get started" checklist — device-local persistence
//
// Kept apart from the card so the component file exports only components
// (react-refresh) and so tests can seed storage through the same key format.
// What is stored is deliberately small: WHEN the card was dismissed, and which
// MANUAL items the user confirmed by hand. A derived item never reads this.
// ============================================================

export interface GetStartedStoredState {
  /** Epoch ms of the last dismissal, or null. */
  dismissedAt: number | null;
  /** Ids of MANUAL items the user confirmed by hand. Ignored for derived items. */
  confirmed: string[];
}

/** A dismissed card returns after this long if the account is still incomplete. */
export const DISMISS_DAYS = 7;
export const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

const EMPTY_STATE: GetStartedStoredState = { dismissedAt: null, confirmed: [] };

export function getStartedStorageId(scope: string): string {
  return `tennisai_getstarted_${scope}`;
}

/** Reads the persisted state. Storage can be unavailable (private mode) — never throw. */
export function readGetStartedState(scope: string): GetStartedStoredState {
  try {
    const raw = localStorage.getItem(getStartedStorageId(scope));
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<GetStartedStoredState> & { dismissed?: boolean };
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

export function writeGetStartedState(scope: string, state: GetStartedStoredState): void {
  try {
    localStorage.setItem(getStartedStorageId(scope), JSON.stringify(state));
  } catch {
    /* device storage unavailable — the checklist simply won't persist */
  }
}
