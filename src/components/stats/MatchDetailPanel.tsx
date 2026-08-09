// ============================================================
// Per-match detail — the percentages computed from ONE match's raw counts.
//
// Extracted from the private `MatchDetails` in
// src/components/matches/MatchList.tsx so the stats drill-down and the match
// history render the same panel from one source. (MatchList still holds its own
// copy: that file is owned by another change in flight and must be switched over
// to this component in a follow-up — see the changelog.)
// ============================================================

import { NO_VALUE, formatCount, formatPct, formatRatio } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { MatchComputedStats, MatchStatsRaw, MatchView } from "@/types";

function DetailRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const missing = value === NO_VALUE;
  return (
    <div className="border-b border-border py-2 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm font-semibold", missing ? "text-muted-foreground" : "text-foreground")}>
        {value}
        {missing && hint && <span className="ml-1.5 text-xs font-normal">({hint})</span>}
      </dd>
    </div>
  );
}

export function MatchDetailPanel({ match, className }: { match: MatchView; className?: string }) {
  // Explicitly typed so an absent block still resolves the optional fields.
  const c: MatchComputedStats = match.computed ?? {};
  const s: MatchStatsRaw = match.stats ?? {};

  return (
    <div className={cn("space-y-4 border-t border-border bg-muted/30 p-4", className)}>
      <dl className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        <DetailRow label="1st serve in" value={formatPct(c.firstServePct ?? null)} hint="not counted" />
        <DetailRow label="1st serve points won" value={formatPct(c.firstServeWonPct ?? null)} hint="not counted" />
        <DetailRow label="2nd serve points won" value={formatPct(c.secondServeWonPct ?? null)} hint="not counted" />
        <DetailRow label="Return points won" value={formatPct(c.returnPointsWonPct ?? null)} hint="not counted" />
        <DetailRow
          label="Break points converted"
          value={formatPct(c.breakPointConversionPct ?? null)}
          hint="none created or not counted"
        />
        <DetailRow
          label="Break points saved"
          value={formatPct(c.breakPointSavePct ?? null)}
          hint="none faced or not counted"
        />
        <DetailRow label="Net points won" value={formatPct(c.netPointsWonPct ?? null)} hint="not counted" />
        <DetailRow label="Aces" value={formatCount(s.aces ?? null)} hint="not counted" />
        <DetailRow label="Double faults" value={formatCount(s.doubleFaults ?? null)} hint="not counted" />
        <DetailRow label="Winners" value={formatCount(c.totalWinners ?? null)} hint="not counted" />
        <DetailRow
          label="Errors (forced + unforced)"
          value={formatCount(c.totalErrors ?? null)}
          hint="needs both error counts"
        />
        <DetailRow
          label="Winners : unforced errors"
          value={formatRatio(c.winnerToUnforcedRatio ?? null)}
          hint="not counted"
        />
      </dl>

      {match.conditions && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Conditions:</span> {match.conditions}
        </p>
      )}

      {match.notesBySet && Object.keys(match.notesBySet).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes by set</p>
          {Object.entries(match.notesBySet).map(([set, note]) => (
            <p key={set} className="text-sm text-foreground">
              <span className="text-muted-foreground">Set {set}:</span> {note}
            </p>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Percentages are computed from the counts entered for this match — nothing is estimated.
      </p>
    </div>
  );
}
