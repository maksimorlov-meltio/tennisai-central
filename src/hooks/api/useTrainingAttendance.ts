// ============================================================================
// Taking the register — PATCH /trainings/:id/attendance
//
// Lives in its own file rather than in queries.ts because attendance is
// written from one screen by one role, and the shared hook module is edited by
// everybody. The API call is inlined here for the same reason: it needs the
// same live/mock switch as the rest of the trainings endpoints, but that module
// is shared surface too.
//
// The mutation is OPTIMISTIC. A coach takes the register standing at the side
// of a court on a phone, tapping one player after another; waiting for a round
// trip between taps makes the list feel broken on a bad connection. The row
// flips immediately, and if the save fails the cache is rolled back to exactly
// what it was and a toast says so — the UI never claims a save that did not
// land.
// ============================================================================

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { mockStore } from "@/mock/store";
import { queryKeys } from "@/hooks/api/queries";
import type { ApiResponse, AttendanceStatus, TrainingAttendance, TrainingSession } from "@/types";

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL;

/** Shared by every in-flight mark, so a burst of taps can be counted. */
const MARK_ATTENDANCE_KEY = ["markAttendance"] as const;

export interface AttendanceMark {
  playerId: string;
  status: AttendanceStatus;
  note?: string;
}

export interface MarkAttendanceInput {
  trainingId: string;
  marks: AttendanceMark[];
}

/**
 * Fold new marks into an existing register.
 *
 * Two rules carry the whole "not yet marked" semantics:
 *  - a `undefined` register becomes an array only when the first mark lands,
 *    so an untouched session stays visibly untouched;
 *  - players not named in `marks` are left exactly as they were, including
 *    unmarked. Marking one player never implies anything about the others.
 */
export function mergeAttendance(
  existing: TrainingAttendance[] | undefined,
  marks: AttendanceMark[],
  markedBy: string | undefined,
  markedAt = new Date().toISOString(),
): TrainingAttendance[] {
  const byPlayer = new Map<string, TrainingAttendance>(
    (existing ?? []).map((entry) => [entry.playerId, entry]),
  );
  for (const mark of marks) {
    const previous = byPlayer.get(mark.playerId);
    byPlayer.set(mark.playerId, {
      ...previous,
      playerId: mark.playerId,
      status: mark.status,
      markedAt,
      markedBy,
      note: mark.note === undefined ? previous?.note : mark.note || undefined,
    });
  }
  return Array.from(byPlayer.values());
}

async function markAttendance({
  trainingId,
  marks,
}: MarkAttendanceInput): Promise<ApiResponse<TrainingSession>> {
  if (USE_MOCK) {
    const training = mockStore.getTraining(trainingId);
    if (!training) throw { status: 404, message: "Training not found" };
    const attendance = mergeAttendance(training.attendance, marks, training.coachId);
    return { data: mockStore.updateTraining(trainingId, { attendance }), message: "Attendance saved" };
  }
  return apiClient.patch(`/trainings/${trainingId}/attendance`, { marks });
}

/**
 * `markedBy` is only ever cosmetic here — the server stamps the real marker
 * from the bearer token and ignores anything the client sends, so passing the
 * current user id just keeps the optimistic row from flickering when the
 * authoritative payload arrives.
 */
export function useMarkAttendance(markedBy?: string) {
  const qc = useQueryClient();

  return useMutation({
    // Named so concurrent taps can see each other — see `onSettled`.
    mutationKey: MARK_ATTENDANCE_KEY,
    mutationFn: markAttendance,

    async onMutate(input: MarkAttendanceInput) {
      await qc.cancelQueries({ queryKey: queryKeys.trainings });
      const previous = qc.getQueryData<TrainingSession[]>(queryKeys.trainings);

      qc.setQueryData<TrainingSession[]>(queryKeys.trainings, (list) =>
        list?.map((t) =>
          t.id === input.trainingId
            ? { ...t, attendance: mergeAttendance(t.attendance, input.marks, markedBy) }
            : t,
        ),
      );

      return { previous };
    },

    onError(err: unknown, _input, ctx) {
      // Put back exactly what was there. A half-rolled-back register would be
      // worse than the failure itself.
      if (ctx?.previous) qc.setQueryData(queryKeys.trainings, ctx.previous);
      toast.error((err as { message?: string })?.message ?? "Couldn't save attendance");
    },

    // No success toast: a coach ticking off eight players does not want eight
    // toasts. The row changing state is the confirmation.
    //
    // Refetch only when the LAST tap settles. A coach going down the list taps
    // faster than the round trips come back, and a refetch fired after tap one
    // would answer with a payload that predates taps two and three — flicking
    // those rows back to "Not marked" until their own responses land. Waiting
    // for the queue to drain keeps the register still while it fills in.
    onSettled() {
      if (qc.isMutating({ mutationKey: MARK_ATTENDANCE_KEY }) === 1) {
        qc.invalidateQueries({ queryKey: queryKeys.trainings });
      }
    },
  });
}
