// ============================================================
// Matches — history + logging (route: /matches)
//
// The single place a match is recorded. Everything the Statistics page shows
// is derived from the rows created here; nothing is seeded or simulated.
// ============================================================

import { useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/shared";
import { MatchForm, type MatchFormValues } from "@/components/matches/MatchForm";
import { MatchList } from "@/components/matches/MatchList";
import { ALL_COUNT_KEYS, type CountKey } from "@/components/matches/MatchStatsFields";
import {
  useCreateMatch,
  useCreateOpponent,
  useDeleteMatch,
  useMatches,
  useOpponents,
  useUpdateMatch,
} from "@/hooks/api/matches";
import type { MatchCreateInput, MatchUpdateInput, MatchView } from "@/types";

type View = { mode: "list" } | { mode: "create" } | { mode: "edit"; match: MatchView };

/** Only counts the user actually entered are sent on create. */
function toCreateInput(values: MatchFormValues, opponentId: string | null): MatchCreateInput {
  const counts: Partial<Record<CountKey, number>> = {};
  for (const key of ALL_COUNT_KEYS) {
    const value = values.counts[key];
    if (value !== null) counts[key] = value;
  }
  return {
    ...counts,
    ...(opponentId ? { opponentId } : {}),
    date: values.date,
    ...(values.competition ? { competition: values.competition } : {}),
    surface: values.surface,
    indoorOutdoor: values.indoorOutdoor,
    format: values.format,
    ...(values.result ? { result: values.result } : {}),
    scoreSets: values.scoreSets,
    ...(values.conditions ? { conditions: values.conditions } : {}),
    ...(values.rallyLengthBuckets ? { rallyLengthBuckets: values.rallyLengthBuckets } : {}),
  };
}

/** On edit, a blank count is sent as `null` so it is cleared, not kept stale. */
function toUpdateInput(values: MatchFormValues, opponentId: string | null): MatchUpdateInput {
  const counts: Partial<Record<CountKey, number | null>> = {};
  for (const key of ALL_COUNT_KEYS) counts[key] = values.counts[key];
  return {
    ...counts,
    opponentId,
    date: values.date,
    competition: values.competition,
    surface: values.surface,
    indoorOutdoor: values.indoorOutdoor,
    format: values.format,
    result: values.result,
    scoreSets: values.scoreSets,
    conditions: values.conditions,
    rallyLengthBuckets: values.rallyLengthBuckets,
  };
}

export default function MatchesPage() {
  const [view, setView] = useState<View>({ mode: "list" });
  const [deleteTarget, setDeleteTarget] = useState<MatchView | null>(null);

  const { data: matches = [], isLoading, error, refetch } = useMatches();
  const { data: opponents = [] } = useOpponents();

  const createMatch = useCreateMatch();
  const updateMatch = useUpdateMatch();
  const deleteMatch = useDeleteMatch();
  const createOpponent = useCreateOpponent();

  const saving = createMatch.isPending || updateMatch.isPending || createOpponent.isPending;

  /** Create the opponent first when the user typed a new name. */
  async function resolveOpponentId(values: MatchFormValues): Promise<string | null> {
    if (!values.newOpponent) return values.opponentId;
    const created = await createOpponent.mutateAsync(values.newOpponent);
    return created.data.id;
  }

  /**
   * Throws on failure. `MatchForm` catches it, keeps the form (and its saved
   * draft) exactly as the user left it, and the mutation hooks have already
   * surfaced the error in a toast.
   */
  async function handleSubmit(values: MatchFormValues) {
    const opponentId = await resolveOpponentId(values);
    if (view.mode === "edit") {
      await updateMatch.mutateAsync({ id: view.match.id, input: toUpdateInput(values, opponentId) });
    } else {
      await createMatch.mutateAsync(toCreateInput(values, opponentId));
    }
    setView({ mode: "list" });
  }

  if (view.mode !== "list") {
    const editing = view.mode === "edit" ? view.match : undefined;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{editing ? "Edit match" : "Log a match"}</h1>
          <p className="text-sm text-muted-foreground">
            Record what happened on court. Detailed counts are optional — leave anything you did not count blank.
          </p>
        </div>
        <MatchForm
          mode={editing ? "edit" : "create"}
          initial={editing}
          opponents={opponents}
          submitting={saving}
          onSubmit={handleSubmit}
          onCancel={() => setView({ mode: "list" })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Matches</h1>
          <p className="text-sm text-muted-foreground">
            {matches.length > 0
              ? `${matches.length} match${matches.length === 1 ? "" : "es"} logged — your statistics are computed from these.`
              : "Log a match to start building your statistics."}
          </p>
        </div>
        <Button className="gap-2 self-start" onClick={() => setView({ mode: "create" })}>
          <Plus className="h-4 w-4" /> Log match
        </Button>
      </div>

      {isLoading ? (
        <LoadingState message="Loading matches…" />
      ) : error ? (
        <ErrorState message="Failed to load your matches." onRetry={() => void refetch()} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6 text-muted-foreground" />}
          title="No matches logged yet"
          description="Every statistic in the app comes from matches you record here — nothing is estimated or pre-filled."
        >
          <Button className="gap-1.5" onClick={() => setView({ mode: "create" })}>
            <Plus className="h-4 w-4" /> Log your first match
          </Button>
        </EmptyState>
      ) : (
        <MatchList
          matches={matches}
          onEdit={(match) => setView({ mode: "edit", match })}
          onDelete={(match) => setDeleteTarget(match)}
          busyId={deleteMatch.isPending ? (deleteTarget?.id ?? undefined) : undefined}
        />
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete match</DialogTitle>
            <DialogDescription>
              This permanently removes the match and everything counted in it. Your statistics will be recomputed
              without it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMatch.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                const id = deleteTarget.id;
                deleteMatch.mutate({ id }, { onSettled: () => setDeleteTarget(null) });
              }}
            >
              {deleteMatch.isPending ? "Deleting…" : "Delete match"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
