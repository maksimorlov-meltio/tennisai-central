// Putting a tournament on a player's calendar.
//
// Used from the browse list and from the tournament page, so the clash warning
// and the wording are identical wherever a coach happens to be standing.

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/auth/AuthContext";
import { useConnections } from "@/store/ConnectionStore";
import { usePlayerTournaments, useAddPlayerTournament } from "@/hooks/api/queries";
import { describeClash, findClashes, timeLeft } from "@/lib/tournamentPlanning";
import type { Tournament, TournamentStatus } from "@/types";
import { format, parseISO } from "date-fns";

const STATUS_OPTIONS: { value: TournamentStatus; label: string; hint: string }[] = [
  { value: "registered", label: "Registered", hint: "Entry is in" },
  { value: "planned", label: "Planned", hint: "Intending to enter" },
  { value: "maybe", label: "Maybe", hint: "Still deciding" },
];

export function AddToCalendarDialog({
  tournament,
  open,
  onOpenChange,
}: {
  tournament: Tournament | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { connectedPlayers } = useConnections();
  const { data: entries = [] } = usePlayerTournaments();
  const addEntry = useAddPlayerTournament();

  const isCoach = user?.role === "coach";
  const [playerId, setPlayerId] = useState<string>("");
  const [status, setStatus] = useState<TournamentStatus>("registered");
  // Set once the coach has seen a clash and chosen to go ahead anyway.
  const [acknowledged, setAcknowledged] = useState(false);

  // A coach picks; anyone else can only enter themselves.
  const target = isCoach ? playerId : (user?.id ?? "");
  const targetName = isCoach
    ? connectedPlayers.find((p) => p.id === target)?.firstName
    : user?.firstName;

  const clashes = useMemo(
    () => (tournament && target ? findClashes(tournament, entries, target) : []),
    [tournament, entries, target],
  );

  const alreadyEntered = useMemo(
    () => entries.some((e) => e.playerId === target && e.tournamentId === tournament?.id),
    [entries, target, tournament?.id],
  );

  if (!tournament) return null;

  const left = timeLeft(tournament);
  const needsAcknowledgement = clashes.length > 0 && !acknowledged;
  const canSubmit = Boolean(target) && !addEntry.isPending;

  const reset = () => {
    setPlayerId("");
    setStatus("registered");
    setAcknowledged(false);
  };

  const submit = () => {
    if (!target) return;
    if (needsAcknowledgement) {
      setAcknowledged(true);
      return;
    }
    addEntry.mutate(
      {
        tournamentId: tournament.id,
        tournament,
        playerId: target,
        playerName: targetName,
        status,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" /> Add to the calendar
          </DialogTitle>
          <DialogDescription>
            {tournament.name} · {tournament.city}, {tournament.country}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {format(parseISO(tournament.startDate), "d MMM")} –{" "}
                {format(parseISO(tournament.endDate), "d MMM yyyy")}
              </span>
              <span
                className={
                  left.tone === "urgent"
                    ? "font-semibold text-destructive"
                    : left.tone === "soon"
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                }
              >
                {left.label}
              </span>
            </div>
            {tournament.surface !== "Unknown" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {tournament.surface} · {tournament.indoorOutdoor}
                {tournament.category ? ` · ${tournament.category}` : ""}
              </p>
            )}
          </div>

          {isCoach && (
            <div className="space-y-1.5">
              <Label>Player</Label>
              {connectedPlayers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Connect a player first — there is nobody to enter yet.
                </p>
              ) : (
                <Select value={playerId} onValueChange={(v) => { setPlayerId(v); setAcknowledged(false); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a player…" />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedPlayers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TournamentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label} — <span className="text-muted-foreground">{s.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {alreadyEntered && (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              Already on this calendar — saving again just updates the status.
            </p>
          )}

          {clashes.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="flex items-start gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {describeClash(clashes, targetName)}
              </p>
              <ul className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
                {clashes.map((c) => (
                  <li key={c.entry.id}>
                    {c.entry.tournament.name} ·{" "}
                    {format(parseISO(c.entry.tournament.startDate), "d MMM")} –{" "}
                    {format(parseISO(c.entry.tournament.endDate), "d MMM")}
                    {c.direct ? "" : " (back to back)"}
                  </li>
                ))}
              </ul>
              {acknowledged && (
                <p className="mt-2 pl-6 text-xs text-muted-foreground">
                  Adding anyway — both will show on the calendar.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            variant={needsAcknowledgement ? "destructive" : "default"}
          >
            {addEntry.isPending
              ? "Adding…"
              : needsAcknowledgement
                ? "Add anyway"
                : "Add to calendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
