// ============================================================================
// The register — who turned up.
//
// Purely presentational: it renders state and reports taps. The save, the
// optimistic update and the rollback all live in `useMarkAttendance`, which
// keeps this component testable without a QueryClient and keeps the "did it
// save?" question in exactly one place.
//
// THE DISTINCTION THIS COMPONENT EXISTS TO PROTECT
// `training.attendance === undefined` means nobody has taken this register.
// An entry with no `status` means the register was taken but this player was
// not marked. Neither is "absent", and neither may ever look like it. A coach
// who has not opened the session yet is not a coach reporting an empty court —
// render them the same way and the record becomes a liar the first time
// anybody bills from it.
// ============================================================================

import { Check, Clock, X, FileCheck, Loader2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, TrainingSession } from "@/types";

/** Present first — it is what a coach taps most, so it sits under the thumb. */
const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  icon: typeof Check;
  /** Applied only when this state is the chosen one. */
  selected: string;
}[] = [
  { value: "present", label: "Present", icon: Check, selected: "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" },
  { value: "late", label: "Late", icon: Clock, selected: "border-primary/50 bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary" },
  { value: "excused", label: "Excused", icon: FileCheck, selected: "border-foreground/30 bg-foreground/10 text-foreground hover:bg-foreground/10 hover:text-foreground" },
  { value: "absent", label: "Absent", icon: X, selected: "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground" },
];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

export interface AttendanceRegisterProps {
  training: TrainingSession;
  /** Name lookup. A player with no entry here falls back to their id. */
  players: { id: string; firstName?: string; lastName?: string }[];
  /** True only for the coach who OWNS this session — mirrors the server rule. */
  canMark?: boolean;
  /** The signed-in user, so a player sees their own row and nobody else's. */
  viewerId?: string;
  onMark?: (playerId: string, status: AttendanceStatus) => void;
  /** Player id whose save is still in flight, if any. */
  pendingPlayerId?: string | null;
}

export function AttendanceRegister({
  training,
  players,
  canMark = false,
  viewerId,
  onMark,
  pendingPlayerId,
}: AttendanceRegisterProps) {
  const taken = training.attendance !== undefined;
  const statusOf = (playerId: string) =>
    training.attendance?.find((a) => a.playerId === playerId)?.status;

  // A coach sees the whole register. Anyone else sees only their own line —
  // whether a team-mate turned up is not their business.
  const rowIds =
    !canMark && viewerId && training.playerIds.includes(viewerId)
      ? [viewerId]
      : training.playerIds;

  const nameOf = (playerId: string) => {
    // The viewer is never in their OWN connections list — that list is the
    // people connected TO them — so a player looking at their own row would
    // otherwise be labelled with a raw user id.
    if (playerId === viewerId) return "You";
    const p = players.find((x) => x.id === playerId);
    const name = `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim();
    return name || playerId;
  };

  if (training.playerIds.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-secondary/30 p-3">
        <RegisterHeading taken={taken} />
        <p className="mt-2 text-xs text-muted-foreground">
          No players are assigned to this session yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
      <RegisterHeading taken={taken} />

      {!taken && (
        <p className="text-xs text-muted-foreground">
          {canMark
            ? "Nobody has been marked yet. Tap a state for each player — it saves as you go."
            : "Your coach has not taken the register for this session yet."}
        </p>
      )}

      <ul className="space-y-2.5">
        {rowIds.map((playerId) => {
          const status = statusOf(playerId);
          const saving = pendingPlayerId === playerId;
          return (
            <li key={playerId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {nameOf(playerId)}
                </span>
                {saving ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Saving…
                  </span>
                ) : (
                  <StatusPill status={status} />
                )}
              </div>

              {canMark && onMark && (
                <div
                  role="group"
                  aria-label={`Attendance for ${nameOf(playerId)}`}
                  className="grid grid-cols-4 gap-1.5"
                >
                  {STATUS_OPTIONS.map((option) => {
                    const chosen = status === option.value;
                    const Icon = option.icon;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-pressed={chosen}
                        disabled={saving}
                        onClick={() => onMark(playerId, option.value)}
                        // `min-h`, never `h`: a coarse pointer gets a 44px
                        // target while a mouse keeps the compact row.
                        className={cn(
                          "h-9 min-w-0 flex-col gap-0.5 px-1 py-1 text-[10px] font-medium leading-none coarse:min-h-11",
                          chosen && option.selected,
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="truncate">{option.label}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RegisterHeading({ taken }: { taken: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ClipboardList className="h-3 w-3" aria-hidden="true" /> Attendance
      </h4>
      {!taken && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Register not taken
        </span>
      )}
    </div>
  );
}

/**
 * The read-only badge. `undefined` is spelled out as "Not marked" rather than
 * left blank — a blank row reads as an oversight in the UI, not as a fact
 * about the session.
 */
function StatusPill({ status }: { status?: AttendanceStatus }) {
  if (!status) {
    return (
      <span className="shrink-0 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        Not marked
      </span>
    );
  }
  const tone: Record<AttendanceStatus, string> = {
    present: "bg-primary/15 text-primary",
    late: "bg-primary/10 text-primary",
    excused: "bg-foreground/10 text-foreground",
    absent: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", tone[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
