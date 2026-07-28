// ============================================================
// TennisAI — calendar colour system
// Sport-convention-inspired hues, chosen mid-tone so they read on BOTH
// the warm-paper light theme and the near-black dark theme. Applied as a
// tinted background + border + coloured text/icon (the "tag" pattern),
// plus a left accent bar for the player/team and state-based styling.
// ============================================================

import type { CalendarEventType, CalendarEventState, TournamentFederation } from "@/types";

/** Event type → base colour. */
export const EVENT_TYPE_COLOR: Record<CalendarEventType, string> = {
  training: "#2563eb", // blue — everyday work
  tournament: "#7c3aed", // violet — the event
  match: "#dc2626", // red — competition
  travel: "#0891b2", // cyan — transit
  recovery: "#16a34a", // green — rest / health
};

/** Sanctioning body → colour (loosely following each tour's brand family). */
export const FEDERATION_COLOR: Record<TournamentFederation, string> = {
  ATP: "#1d4ed8", // blue
  WTA: "#9333ea", // purple
  ITF: "#0d9488", // teal
  UTR: "#f97316", // orange
  USTA: "#db2777", // magenta
};

/** Court surface → colour (tennis convention: clay terracotta, grass green…). */
export const SURFACE_COLOR: Record<string, string> = {
  clay: "#c2612f",
  hard: "#2563eb",
  grass: "#3f9142",
  indoor: "#7c3aed",
};

/** Distinct, reasonably-accessible hues assigned to players/teams by hash. */
export const ENTITY_PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#4f46e5", "#65a30d", "#0d9488",
  "#b45309", "#be123c",
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

/** Append an 8-bit alpha to a #rrggbb hex → #rrggbbaa. */
export function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

export const STATE_LABEL: Record<CalendarEventState, string> = {
  requested: "Requested",
  tentative: "Tentative",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};
