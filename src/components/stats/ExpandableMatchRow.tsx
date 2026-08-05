// A recent-match row that opens into the per-match detail — the drill-down from
// an aggregate figure to the match that fed it.
import { ChevronDown } from "lucide-react";
import { MatchDetailPanel } from "@/components/stats/MatchDetailPanel";
import { formatMatchDate, formatScore, matchFormatLabel, surfaceLabel } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { MatchView } from "@/types";

export interface ExpandableMatchRowProps {
  match: MatchView;
  isOpen: boolean;
  onToggle: () => void;
}

export function ExpandableMatchRow({ match, isOpen, onToggle }: ExpandableMatchRowProps) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex min-w-0 items-start gap-2">
          <ChevronDown
            className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {match.opponentName ?? "Opponent not recorded"}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatMatchDate(match.date)} · {surfaceLabel(match.surface)} · {matchFormatLabel(match.format)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 pl-6">
          <span className="text-sm text-foreground">{formatScore(match.scoreSets)}</span>
          <span
            className={cn(
              "px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              match.result === "win"
                ? "bg-primary/10 text-primary"
                : match.result === "loss"
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {match.result === "win" ? "Win" : match.result === "loss" ? "Loss" : "Not recorded"}
          </span>
        </div>
      </button>

      {isOpen && <MatchDetailPanel match={match} />}
    </div>
  );
}
