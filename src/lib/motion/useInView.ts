import { useEffect, useRef, useState } from "react";

/**
 * Fires once when an element first scrolls into view.
 *
 * Deliberately one-shot: re-animating on every scroll past turns a page into a
 * flickering slideshow when someone scrolls up and down. Once revealed, content
 * stays revealed.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(options?: {
  /** Fraction of the element that must be visible. */
  threshold?: number;
  /** Shrinks the viewport so content reveals slightly before its edge appears. */
  rootMargin?: string;
}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (old browsers, some test environments) → show the
    // content immediately. Failing open matters: failing closed would leave the
    // whole page invisible.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect(); // one-shot
        }
      },
      { threshold: options?.threshold ?? 0.12, rootMargin: options?.rootMargin ?? "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [options?.threshold, options?.rootMargin]);

  return { ref, inView };
}
