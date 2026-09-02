// What the last calendar import did, per source.
//
// A feed that silently stops is the failure mode that matters here: the app
// keeps showing last week's tournaments, everything looks fine, and a coach
// plans a season against a calendar that stopped updating in March. So every
// import records what it did, /api/health reports it, and a source that has
// gone quiet is visible without opening a shell.
//
// Deliberately in memory. This is operational telemetry, not data — a restart
// losing it is correct, and it costs no schema.

import type { SourceResult } from "./feed/types";

export interface ImportRecord extends SourceResult {
  at: string;
}

const lastBySource = new Map<string, ImportRecord>();

export function recordImport(results: SourceResult[]): void {
  const at = new Date().toISOString();
  for (const r of results) lastBySource.set(r.source, { ...r, at });
}

/** Newest first, so a glance at the top shows the most recent activity. */
export function importStatus(): ImportRecord[] {
  return [...lastBySource.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** The most recent import across all sources, or null if none has run yet. */
export function lastImportAt(): string | null {
  return importStatus()[0]?.at ?? null;
}

/** Test seam — the map outlives a single spec otherwise. */
export function resetImportStatus(): void {
  lastBySource.clear();
}
