import { useEffect } from "react";

/**
 * Watchdog for a known Radix UI race: when a Dialog/AlertDialog closes at the
 * same moment a React state update re-renders the tree (e.g. a React Query
 * mutation fired from the dialog's submit handler), the `Presence` unmount can
 * be interrupted and the `pointer-events: none` Radix puts on <body> while a
 * modal is open is never restored — freezing the entire app (nothing is
 * clickable) until a full reload.
 *
 * This guard watches <body>'s inline style and the `data-state` of any modal
 * layer. Whenever <body> is locked but NO modal layer is actually open, it
 * releases the lock on the next frame. It never touches the lock while a real
 * modal (dialog, alertdialog, dropdown menu, select) is open, so legitimately
 * stacked overlays are unaffected.
 *
 * Remove this only after confirming the underlying Radix version no longer
 * exhibits the stuck-body bug in the create-team / review-session flows.
 */
const OPEN_MODAL_SELECTOR =
  '[role="dialog"][data-state="open"],' +
  '[role="alertdialog"][data-state="open"],' +
  '[role="menu"][data-state="open"],' +
  '[role="listbox"][data-state="open"]';

export function BodyPointerEventsGuard() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | 0 = 0;

    const release = () => {
      timer = 0;
      if (document.body.style.pointerEvents !== "none") return;
      // Only release when nothing that legitimately locks the body is open.
      if (document.querySelector(OPEN_MODAL_SELECTOR)) return;
      document.body.style.pointerEvents = "";
    };

    // setTimeout (not requestAnimationFrame): rAF is fully paused while the tab
    // is backgrounded, which would leave the lock stuck if the user switched
    // tabs mid-close. A macrotask still fires, so the guard always recovers.
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(release, 0);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
    });
    // Catch modal layers flipping to data-state="closed" anywhere in the tree.
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    // Release any lock that was already stuck when this guard mounted.
    schedule();

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
