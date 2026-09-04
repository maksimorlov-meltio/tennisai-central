import * as React from "react";

/** Below this width the app shows its mobile shell (drawer nav, stacked rows). */
export const MOBILE_BREAKPOINT = 768;

/**
 * Reads a media query and keeps re-reading it as the viewport changes.
 *
 * Initialised from `matchMedia` during the first render rather than in an
 * effect. The previous version started at `undefined` and settled a tick
 * later, so on a phone the very first paint was always the DESKTOP branch —
 * a visible flash of the wrong layout, and a wasted second render for every
 * consumer. `typeof window` guards the non-DOM case (tests, any future SSR).
 */
function useMediaQuery(query: string): boolean {
  const read = React.useCallback(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : false,
    [query],
  );

  const [matches, setMatches] = React.useState<boolean>(read);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    // Re-read on mount too: the viewport can have changed between the first
    // render and this effect (rotation, a restored window size).
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * True on phone-width viewports. The single source of truth for the app's
 * mobile branch — `sidebar.tsx` and `DashboardLayout` both read this one hook
 * rather than each keeping their own breakpoint.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}

/**
 * True when the primary input is a finger or stylus rather than a mouse.
 *
 * The JavaScript counterpart of the `coarse:` Tailwind variant, for the
 * handful of decisions CSS can't make — whether to open a hover tooltip, how
 * long to hold before a long-press fires. Prefer `coarse:` in classNames and
 * reach for this only when the branch genuinely has to happen in JS.
 */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

export { useMediaQuery };
