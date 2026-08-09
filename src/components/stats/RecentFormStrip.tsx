// W/L chips for the active window. A match with no recorded result renders a
// dashed "—" chip rather than being silently dropped or counted as a loss.
import { NO_VALUE, formatMatchDate, formatPct, formatWinLoss } from "@/lib/stats/format";
import { cn } from "@/lib/utils";
import type { RecentFormMatch, RecentFormSummary } from "@/types";

export function FormChip({ entry }: { entry: RecentFormMatch }) {
  if (entry.result === null) {
    return (
      <span
        title="Result not recorded"
        className="flex h-7 w-7 items-center justify-center border border-dashed border-border text-xs text-muted-foreground"
      >
        {NO_VALUE}
      </span>
    );
  }
  return (
    <span
      title={entry.date ? formatMatchDate(entry.date) : undefined}
      className={cn(
        "flex h-7 w-7 items-center justify-center text-xs font-bold",
        entry.result === "win" ? "bg-primary/15 text-primary" : "bg-muted text-foreground",
      )}
    >
      {entry.result === "win" ? "W" : "L"}
    </span>
  );
}

export function RecentFormStrip({ form }: { form: RecentFormSummary }) {
  if (form.matches.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Nothing logged in this window.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {form.matches.map((entry) => (
          <FormChip key={entry.id} entry={entry} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {form.winRatePct === null
          ? "None of these matches has a recorded win or loss, so there is no win rate for this window."
          : `${formatWinLoss(form.wins, form.losses)} · ${formatPct(form.winRatePct)} win rate over this window.`}
      </p>
    </div>
  );
}
