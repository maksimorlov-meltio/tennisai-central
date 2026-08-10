import { useEffect, useRef, useState } from "react";

/**
 * Counts a number up to its target on mount / when the target changes.
 *
 * Only ever animates genuine numbers. Dashboard values are often "—" (unknown)
 * or "68%" (formatted), and counting those would either print NaN or strip the
 * unit — so non-numeric input is returned untouched and the caller renders it
 * as-is.
 */
export function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(target);
  const frame = useRef<number>();
  const from = useRef(target);

  useEffect(() => {
    // Respect the OS setting: land on the final number immediately.
    const reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !Number.isFinite(target)) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const startValue = from.current;
    const delta = target - startValue;
    if (delta === 0) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic: fast first, settling at the end — reads as "arriving at"
      // a figure rather than a slot machine.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(startValue + delta * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else from.current = target;
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      from.current = target; // don't replay from stale state on the next change
    };
  }, [target, durationMs]);

  return value;
}
