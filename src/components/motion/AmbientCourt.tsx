// The moving background behind the app.
//
// Court geometry, not particles. A generic field of drifting dots would sit
// equally well behind a crypto dashboard; the court, the service boxes and the
// ball arcs are the one piece of visual identity this product already owns, so
// the background is built out of those.
//
// Three layers, back to front:
//
//   1. the court in perspective, panning across ninety seconds
//   2. rally arcs that draw themselves on and off, like a ball's path
//   3. two loose balls drifting on crossed periods
//
// Everything is `transform`, `opacity` and `stroke-dashoffset`, so the whole
// layer composites on the GPU and never causes layout. Reduced motion is
// handled globally in index.css, which clamps every animation to 0.01ms — each
// keyframe set here ends either at rest or fully transparent, so the layer
// simply stops rather than freezing mid-sweep.
//
// The layer is `fixed`, so it must not sit inside anything that carries
// `transform`, `filter` or `will-change` — those re-parent fixed positioning.
// It is also `-z-10`, which only stays behind the content and in front of the
// page background if the container establishes a stacking context: give the
// parent `isolate`.

import { cn } from "@/lib/utils";

/**
 * How much of it there is.
 *
 * `ambient` sits behind working screens a coach reads for an hour, so it is
 * faint and slow enough to be noticed only when you look for it. `hero` is the
 * landing page, where the background is doing a job — more contrast, more
 * movement, one extra arc.
 */
export type AmbientIntensity = "ambient" | "hero";

export interface AmbientCourtProps {
  intensity?: AmbientIntensity;
  className?: string;
}

/**
 * Rally arcs — a ball's flight, in the same perspective space as the court.
 *
 * Each crosses the net (y=350) at its apex and lands short of a baseline, so
 * they read as shots rather than as decorative swooshes. The durations are
 * deliberately not multiples of one another and the delays are staggered: on a
 * shared period they would visibly pulse together every few seconds, which is
 * the thing that makes a background look like a screensaver.
 */
const ARCS: { d: string; dur: string; delay: string }[] = [
  { d: "M 410 575 Q 560 155 755 245", dur: "12s", delay: "0s" },
  { d: "M 790 560 Q 610 165 470 255", dur: "15s", delay: "4.5s" },
  { d: "M 350 600 Q 640 130 825 300", dur: "18s", delay: "9s" },
  { d: "M 845 530 Q 600 175 385 310", dur: "14s", delay: "6.5s" },
];

export function AmbientCourt({ intensity = "ambient", className }: AmbientCourtProps) {
  const hero = intensity === "hero";

  // Line weight and opacity are the whole difference between "atmosphere" and
  // "a distracting screensaver behind my training plan".
  const courtOpacity = hero ? 0.16 : 0.09;
  const rallyPeak = hero ? 0.5 : 0.22;

  return (
    <div
      aria-hidden="true"
      // overflow-hidden is load-bearing: the court pans past its own edges, and
      // the mobile pass guarantees no page scrolls sideways.
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 overflow-hidden",
        className,
      )}
    >
      {/* ── The court ────────────────────────────────────────────────────
          Drawn in perspective, from behind the baseline — the view a player
          actually has. A flat overhead rectangle reads as a grid once the
          viewBox is cropped to the screen, which is the one thing this must
          not look like.

          The viewBox is screen-shaped (12:7) rather than portrait, so
          `slice` barely crops on a desktop and the whole court survives. Its
          origin is shifted left by 170, which pushes the court to the right of
          centre — off the headline on the landing page, and clear of the
          sidebar inside the app. The arcs use the same origin, so the two stay
          registered to each other. */}
      <svg
        className="ambient-pan absolute inset-0 h-full w-full"
        style={{ "--pan-dur": hero ? "70s" : "90s" } as React.CSSProperties}
        viewBox="-170 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g
          stroke="hsl(var(--foreground))"
          strokeOpacity={courtOpacity}
          strokeWidth={hero ? 1.7 : 1.3}
          strokeLinejoin="round"
        >
          {/* Doubles court: far baseline 480→720, near 330→870. Every other
              line is interpolated between those two edges, which is what keeps
              the perspective consistent instead of approximately right. */}
          <path d="M 480 90 L 720 90 L 870 610 L 330 610 Z" />

          {/* Singles sidelines, inset proportionally at each depth. */}
          <path d="M 508 90 L 392 610" />
          <path d="M 692 90 L 808 610" />

          {/* Service lines, and the centre line between them. */}
          <path d="M 440 230 L 760 230" />
          <path d="M 370 470 L 830 470" />
          <path d="M 600 230 L 600 470" />

          {/* The net — heavier than the paint, and overhanging the sidelines
              the way a real one does. */}
          <path
            d="M 385 350 L 815 350"
            strokeWidth={hero ? 3.2 : 2.4}
            strokeOpacity={courtOpacity * 1.6}
          />
        </g>
      </svg>

      {/* ── Rally arcs ─────────────────────────────────────────────────────
          Hidden below `md`. A phone is on battery at the side of a court, and
          four continuously animating strokes are not what that battery is for;
          `display: none` stops the animation outright rather than merely
          hiding it. The court above still pans, which is enough depth. */}
      <svg
        className="absolute inset-0 hidden h-full w-full md:block"
        viewBox="-170 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {ARCS.slice(0, hero ? 4 : 3).map((arc) => (
          <path
            key={arc.d}
            className="ambient-rally"
            d={arc.d}
            pathLength={1}
            stroke="hsl(var(--primary))"
            strokeWidth={hero ? 2 : 1.5}
            strokeLinecap="round"
            style={
              {
                "--rally-dur": arc.dur,
                "--rally-delay": arc.delay,
                "--rally-peak": rallyPeak,
              } as React.CSSProperties
            }
          />
        ))}
      </svg>

      {/* ── Two loose balls ────────────────────────────────────────────────
          Also `md` and up. The nested element is deliberate: the wrapper
          carries the horizontal drift and the child the vertical one, on
          different periods, so the path is a slow figure rather than a line
          retraced back and forth. */}
      <div className="absolute inset-0 hidden md:block">
        <div
          className="ambient-drift absolute left-[18%] top-[26%]"
          style={
            {
              "--drift-x": "34px",
              "--drift-y": "26px",
              "--drift-dur-x": "38s",
              "--drift-dur-y": "25s",
            } as React.CSSProperties
          }
        >
          <div
            className="h-2.5 w-2.5 rounded-full bg-primary"
            style={{ opacity: hero ? 0.4 : 0.18 }}
          />
        </div>
        <div
          className="ambient-drift absolute right-[22%] top-[64%]"
          style={
            {
              "--drift-x": "26px",
              "--drift-y": "34px",
              "--drift-dur-x": "47s",
              "--drift-dur-y": "31s",
            } as React.CSSProperties
          }
        >
          <div
            className="h-1.5 w-1.5 rounded-full bg-foreground"
            style={{ opacity: hero ? 0.28 : 0.12 }}
          />
        </div>
      </div>
    </div>
  );
}
