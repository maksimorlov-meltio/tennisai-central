import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountUp } from "../useCountUp";

/**
 * The count-up is hard to observe in the running app — the demo dashboard's
 * values are 0 and 1, so it settles before a frame is painted. These tests
 * drive requestAnimationFrame directly so the interpolation is actually
 * checked rather than assumed.
 */

let now = 0;
let callbacks: FrameRequestCallback[] = [];

/** Advances the fake clock and flushes exactly one animation frame. */
function frame(ms: number) {
  now += ms;
  const pending = callbacks;
  callbacks = [];
  act(() => {
    pending.forEach((cb) => cb(now));
  });
}

beforeEach(() => {
  now = 0;
  callbacks = [];
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.push(cb);
    return callbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // Default: motion allowed. Individual tests override.
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCountUp", () => {
  it("interpolates towards the target instead of jumping", () => {
    const { result, rerender } = renderHook(({ t }) => useCountUp(t, 700), {
      initialProps: { t: 0 },
    });

    rerender({ t: 100 });
    frame(0); // schedule + first tick

    frame(350); // halfway through the 700ms duration
    const mid = result.current;

    // Ease-out cubic is past the midpoint at half time, but must not be done.
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);

    frame(350); // reach the end
    expect(result.current).toBe(100);
  });

  it("lands exactly on the target, never overshooting", () => {
    const { result, rerender } = renderHook(({ t }) => useCountUp(t, 300), {
      initialProps: { t: 0 },
    });
    rerender({ t: 42 });
    frame(0);
    frame(1000); // well past the duration
    expect(result.current).toBe(42);
  });

  it("skips the animation when the user asked for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { result, rerender } = renderHook(({ t }) => useCountUp(t), {
      initialProps: { t: 0 },
    });
    rerender({ t: 250 });
    // No frames pumped at all — it must already be at the final value.
    expect(result.current).toBe(250);
  });

  it("passes non-finite values straight through rather than emitting NaN", () => {
    const { result } = renderHook(() => useCountUp(Number.NaN));
    expect(Number.isNaN(result.current)).toBe(true); // unchanged, not corrupted
  });
});
