// ============================================================
// Form drafts — keep long forms alive across navigation and refreshes.
//
// A draft is only written once the user has actually changed something away
// from the form's initial state, and a restored draft is always announced to
// the user (never silently resurrected). Storage is localStorage, per-key.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PREFIX = "tennisai:draft:";
const VERSION = 1;
/** Give the user time to keep typing before we touch localStorage. */
const WRITE_DEBOUNCE_MS = 400;

interface StoredDraft<T> {
  v: number;
  savedAt: string;
  value: T;
}

export interface LoadedDraft<T> {
  value: T;
  savedAt: string;
}

/** Build a namespaced key from parts, e.g. `draftKey("match-form", "edit", id)`. */
export function draftKey(...parts: Array<string | number | null | undefined>): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== "").join(":");
}

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

export function loadDraft<T>(key: string): LoadedDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T> | null;
    if (!parsed || parsed.v !== VERSION || parsed.value === undefined) return null;
    return { value: parsed.value, savedAt: parsed.savedAt };
  } catch {
    // Corrupt or unavailable storage is treated as "no draft".
    return null;
  }
}

export function saveDraft<T>(key: string, value: T): void {
  try {
    const payload: StoredDraft<T> = { v: VERSION, savedAt: new Date().toISOString(), value };
    window.localStorage.setItem(storageKey(key), JSON.stringify(payload));
  } catch {
    // Quota or private-mode failures must never break the form.
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

export interface FormDraft {
  /** ISO timestamp of the draft that was restored on mount, else null. */
  restoredAt: string | null;
  /** Forget the stored draft (call on successful submit / explicit discard). */
  clear: () => void;
  /** Hide the "restored" affordance without deleting the draft. */
  acknowledge: () => void;
}

/**
 * Persist `value` under `key` and restore it once, on mount, via `restore`.
 *
 * Pass `key = null` to disable persistence entirely (e.g. a mode that should
 * not be remembered). `restore` is only called when a stored draft differs
 * from the value the form mounted with.
 */
export function useFormDraft<T>(key: string | null, value: T, restore: (draft: T) => void): FormDraft {
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const hydrated = useRef(false);
  /** Serialized initial value — nothing is stored while the form matches it. */
  const baseline = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // ── One-shot restore. Runs before the persist effect below (declaration order).
  useEffect(() => {
    hydrated.current = true;
    baseline.current = stableStringify(valueRef.current);
    if (!key) return;
    const stored = loadDraft<T>(key);
    if (!stored) return;
    if (stableStringify(stored.value) === baseline.current) {
      // Draft matches the pristine form — nothing worth announcing.
      clearDraft(key);
      return;
    }
    restoreRef.current(stored.value);
    setRestoredAt(stored.savedAt);
  }, [key]);

  // ── Persist on change (debounced).
  useEffect(() => {
    if (!key || !hydrated.current) return;
    const serialized = stableStringify(value);
    const timer = window.setTimeout(() => {
      if (serialized === baseline.current) clearDraft(key);
      else saveDraft(key, value);
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key, value]);

  const clear = useCallback(() => {
    if (key) clearDraft(key);
    setRestoredAt(null);
  }, [key]);

  const acknowledge = useCallback(() => setRestoredAt(null), []);

  return useMemo(() => ({ restoredAt, clear, acknowledge }), [restoredAt, clear, acknowledge]);
}
