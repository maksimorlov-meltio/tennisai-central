// ============================================================
// Match history — one row per logged match, expandable to the percentages
// computed from that match's raw counts. Anything not counted shows "—".
// ============================================================

import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NO_VALUE,
  formatCount,
  formatMatchDate,
  formatPct,
  formatRatio,
  formatScore,
  matchFormatLabel,
  surfaceLabel,
} from "@/lib/stats/format";
import type { MatchComputedStats, MatchStatsRaw, MatchView } from "@/types";

function ResultBadge({ result }: { result?: string }) {
  if (result !== "win" && result !== "loss") {
    return (
      <span className="inline-flex items-center bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Result not recorded
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        result === "win" ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
      )}
    >
      {result === "win" ? "Win" : "Loss"}
    </span>
  );
}

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

function MatchDetails({ match }: { match: MatchView }) {
  // Explicitly typed so an absent block still resolves the optional fields.
  const c: MatchComputedStats = match.computed ?? {};
  const s: MatchStatsRaw = match.stats ?? {};

  return (
    <div className="space-y-4 border-t border-border bg-muted/30 p-4">
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

export interface MatchListProps {
  matches: MatchView[];
  onEdit: (match: MatchView) => void;
  onDelete: (match: MatchView) => void;
  busyId?: string;
}

export function MatchList({ matches, onEdit, onDelete, busyId }: MatchListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-border border border-border bg-card">
      {matches.map((match) => {
        const isOpen = openId === match.id;
        return (
          <div key={match.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : match.id)}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <ChevronDown
                  className={cn(
                    "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {match.opponentName ?? "Opponent not recorded"}
                    </span>
                    <ResultBadge result={match.result} />
                  </div>
                  <p className="text-sm text-foreground">{formatScore(match.scoreSets)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMatchDate(match.date)}
                    {" · "}
                    {surfaceLabel(match.surface)} · {match.indoorOutdoor === "indoor" ? "Indoor" : "Outdoor"} ·{" "}
                    {matchFormatLabel(match.format)}
                    {match.competition ? ` · ${match.competition}` : ""}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onEdit(match)}
                  aria-label="Edit match"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onDelete(match)}
                  disabled={busyId === match.id}
                  aria-label="Delete match"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {isOpen && <MatchDetails match={match} />}
          </div>
        );
      })}
    </div>
  );
}
