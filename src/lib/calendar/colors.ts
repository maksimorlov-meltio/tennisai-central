// ============================================================
// TennisAI — calendar colour system
// Sport-convention-inspired hues, chosen mid-tone so they read on BOTH
// the warm-paper light theme and the near-black dark theme. Applied as a
// tinted background + border + coloured text/icon (the "tag" pattern),
// plus a left accent bar for the player/team and state-based styling.
// ============================================================

import type { CalendarEventType, CalendarEventState, TournamentFederation } from "@/types";

/** Event type → base colour. */
// Matte, desaturated hues (not glowing). "match" is a muted rust rather than
// a bright red, and "recovery" a sage kept distinct from the green accent.
// Theme-aware: each hue is a CSS custom property with separate light/dark
// lightness tuned in src/index.css (:root / .dark) so it clears WCAG AA
// (4.5:1) as text against --background in BOTH themes. Hue/saturation are
// shared across themes; only --cal-* lightness differs.
export const EVENT_TYPE_COLOR: Record<CalendarEventType, string> = {
  training: "hsl(var(--cal-event-training))", // matte steel blue — everyday work
  tournament: "hsl(var(--cal-event-tournament))", // matte violet — the event
  match: "hsl(var(--cal-event-match))", // matte rust — competition
  travel: "hsl(var(--cal-event-travel))", // matte amber — transit
  recovery: "hsl(var(--cal-event-recovery))", // matte sage — rest / health
};

/** Sanctioning body → colour (loosely following each tour's brand family). */
// Theme-aware via CSS custom properties — see EVENT_TYPE_COLOR comment above.
export const FEDERATION_COLOR: Record<TournamentFederation, string> = {
  ATP: "hsl(var(--cal-fed-atp))", // matte blue
  WTA: "hsl(var(--cal-fed-wta))", // matte purple
  ITF: "hsl(var(--cal-fed-itf))", // matte teal
  UTR: "hsl(var(--cal-fed-utr))", // matte orange
  USTA: "hsl(var(--cal-fed-usta))", // matte rose
};

/**
 * Circuit → colour. The calendar's filter chips split ITF juniors out of ITF
 * into an extra "ITF Junior" circuit, so those chips are keyed by circuit, NOT
 * by federation — indexing FEDERATION_COLOR with "ITF Junior" yields undefined
 * and renders a colourless dot.
 */
export const CIRCUIT_COLOR: Record<string, string> = {
  ...FEDERATION_COLOR,
  "ITF Junior": "hsl(var(--cal-fed-itf-junior))", // matte green-teal
};

/** Court surface → colour (tennis convention: clay terracotta, grass green…). */
export const SURFACE_COLOR: Record<string, string> = {
  clay: "#b06a45", // matte terracotta
  hard: "#4c6b8a", // matte blue
  grass: "#5f8f62", // matte green
  indoor: "#6e5f91", // matte violet
};

/** Distinct, reasonably-accessible hues assigned to players/teams by hash. */
export const ENTITY_PALETTE = [
  "#4c6b8a", "#b4694d", "#5f8f79", "#c1943f", "#6e5f91",
  "#4f8a86", "#a85778", "#5d6ba0", "#7d914f", "#3f8a80",
  "#a67a45", "#a05563",
] as const;

/** Stable colour for a player/team id (same id → same colour every render). */
export function entityColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ENTITY_PALETTE[h % ENTITY_PALETTE.length];
}

const FED_TITLE = /^\[(ATP|WTA|ITF|UTR|USTA)\]/;

/** Pull the federation out of an international event title like "[ATP] Miami Open". */
export function federationOf(title: string): TournamentFederation | null {
  const m = title.match(FED_TITLE);
  return m ? (m[1] as TournamentFederation) : null;
}

/** The chip's primary colour: federation for tagged tournaments, else event type. */
export function eventBaseColor(type: CalendarEventType, title: string): string {
  const fed = federationOf(title);
  if (fed) return FEDERATION_COLOR[fed];
  return EVENT_TYPE_COLOR[type];
}

/** State → visual treatment (opacity / dashed outline / strike-through). */
export const STATE_VISUAL: Record<CalendarEventState, { opacity: number; dashed: boolean; strike: boolean }> = {
  requested: { opacity: 0.7, dashed: true, strike: false },
  tentative: { opacity: 0.85, dashed: true, strike: false },
  confirmed: { opacity: 1, dashed: false, strike: false },
  completed: { opacity: 0.6, dashed: false, strike: false },
  cancelled: { opacity: 0.45, dashed: true, strike: true },
};

/**
 * Blend a CSS colour with an 8-bit alpha (as a 2-digit hex string, e.g.
 * "1f" ≈ 12%, "59" ≈ 35%). Uses `color-mix()` rather than string-appending
 * the alpha onto the colour (the old `${hex}${alpha}` trick only works for
 * literal #rrggbb hex) so it keeps working now that EVENT_TYPE_COLOR /
 * FEDERATION_COLOR return theme-aware `hsl(var(--cal-...))` strings instead
 * of raw hex — as well as for any plain #rrggbb colour (e.g. ENTITY_PALETTE).
 */
export function withAlpha(color: string, alpha: string): string {
  const alphaPct = (parseInt(alpha, 16) / 255) * 100;
  return `color-mix(in srgb, ${color} ${alphaPct}%, transparent)`;
}

export const STATE_LABEL: Record<CalendarEventState, string> = {
  requested: "Requested",
  tentative: "Tentative",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};
