// ============================================================================
// useMarkAttendance — the optimistic write, and the promise it makes.
//
// The register updates before the server answers, which is the right call for
// a coach tapping names at the side of a court. The price of that is a duty:
// if the save does NOT land, the cache must go back to exactly what it was.
// A row left showing "Present" after a failed request is the app lying about
// its own database, which is worse than the slow version would have been.
//
// `mergeAttendance` is tested directly because it is where the "not yet
// marked" semantics live — it is the function that decides whether a session
// has a register at all.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { TrainingSession } from "@/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// `vi.hoisted` because `vi.mock` is lifted above the imports — a plain
// top-level `const` would not exist yet when the factory runs.
const { getTraining, updateTraining } = vi.hoisted(() => ({
  getTraining: vi.fn(),
  updateTraining: vi.fn(),
}));
vi.mock("@/mock/store", () => ({ mockStore: { getTraining, updateTraining } }));

import { toast } from "sonner";
import { mergeAttendance, useMarkAttendance } from "@/hooks/api/useTrainingAttendance";
import { queryKeys } from "@/hooks/api/queries";

const COACH = "coach-1";
const ALICE = "player-alice";
const BOB = "player-bob";

function session(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: "tr-1",
    title: "Serve block",
    trainingType: "individual",
    coachId: COACH,
    playerIds: [ALICE, BOB],
    startDate: "2026-06-01T09:00:00.000Z",
    endDate: "2026-06-01T10:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── mergeAttendance ─────────────────────────────────────────────────────────
describe("mergeAttendance", () => {
  it("turns an untaken register into a taken one only when a mark arrives", () => {
    expect(session().attendance).toBeUndefined();

    const merged = mergeAttendance(undefined, [{ playerId: ALICE, status: "present" }], COACH);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ playerId: ALICE, status: "present", markedBy: COACH });
  });

  it("leaves every player it was not told about exactly as they were", () => {
    const merged = mergeAttendance(
      [{ playerId: ALICE, status: "absent" }, { playerId: BOB }],
      [{ playerId: ALICE, status: "present" }],
      COACH,
    );

    // Marking Alice says nothing whatsoever about Bob — he stays status-less,
    // which is "not marked", not "absent".
    const bob = merged.find((a) => a.playerId === BOB);
    expect(bob).toBeDefined();
    expect(bob?.status).toBeUndefined();
    expect(merged.find((a) => a.playerId === ALICE)?.status).toBe("present");
  });

  it("overwrites a player's own earlier mark rather than adding a second row", () => {
    const merged = mergeAttendance(
      [{ playerId: ALICE, status: "present" }],
      [{ playerId: ALICE, status: "late" }],
      COACH,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("late");
  });

  it("keeps an existing note when the new mark carries none", () => {
    const merged = mergeAttendance(
      [{ playerId: ALICE, status: "absent", note: "Injured" }],
      [{ playerId: ALICE, status: "present" }],
      COACH,
    );

    expect(merged[0].note).toBe("Injured");
  });
});

// ── The optimistic write ────────────────────────────────────────────────────
function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("useMarkAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the mark before the server answers", async () => {
    const qc = freshClient();
    qc.setQueryData(queryKeys.trainings, [session()]);

    // A save that never settles — so what is asserted is purely the optimistic
    // write, not the response being folded back in.
    getTraining.mockReturnValue(session());
    updateTraining.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useMarkAttendance(COACH), { wrapper: wrapper(qc) });
    result.current.mutate({ trainingId: "tr-1", marks: [{ playerId: ALICE, status: "present" }] });

    await waitFor(() => {
      const cached = qc.getQueryData<TrainingSession[]>(queryKeys.trainings);
      expect(cached?.[0].attendance).toEqual([
        expect.objectContaining({ playerId: ALICE, status: "present", markedBy: COACH }),
      ]);
    });
  });

  it("rolls the register back to UNTAKEN when the save fails, and says so", async () => {
    const qc = freshClient();
    qc.setQueryData(queryKeys.trainings, [session()]);

    getTraining.mockReturnValue(session());
    updateTraining.mockImplementation(() => {
      throw new Error("Network down");
    });

    const { result } = renderHook(() => useMarkAttendance(COACH), { wrapper: wrapper(qc) });
    result.current.mutate({ trainingId: "tr-1", marks: [{ playerId: ALICE, status: "present" }] });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Not an empty array and not a leftover "present": back to having no
    // register at all, which is the truth about what the server holds.
    const cached = qc.getQueryData<TrainingSession[]>(queryKeys.trainings);
    expect(cached?.[0].attendance).toBeUndefined();
    expect(toast.error).toHaveBeenCalled();
  });

  it("restores a PREVIOUS mark on failure rather than clearing it", async () => {
    const qc = freshClient();
    qc.setQueryData(queryKeys.trainings, [
      session({ attendance: [{ playerId: ALICE, status: "absent", markedBy: COACH }] }),
    ]);

    getTraining.mockReturnValue(session());
    updateTraining.mockImplementation(() => {
      throw new Error("Network down");
    });

    const { result } = renderHook(() => useMarkAttendance(COACH), { wrapper: wrapper(qc) });
    result.current.mutate({ trainingId: "tr-1", marks: [{ playerId: ALICE, status: "present" }] });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = qc.getQueryData<TrainingSession[]>(queryKeys.trainings);
    expect(cached?.[0].attendance).toEqual([
      { playerId: ALICE, status: "absent", markedBy: COACH },
    ]);
  });

  it("holds every mark of a rapid burst until the last one settles", async () => {
    // The courtside case: a coach going down the list faster than the round
    // trips come back. An early refetch would answer with a payload that
    // predates the later taps and flick those rows back to "Not marked".
    const qc = freshClient();
    qc.setQueryData(queryKeys.trainings, [session()]);

    getTraining.mockReturnValue(session());
    const settle: Array<(v: TrainingSession) => void> = [];
    updateTraining.mockImplementation(
      () => new Promise<TrainingSession>((resolve) => settle.push(resolve)),
    );

    const { result } = renderHook(() => useMarkAttendance(COACH), { wrapper: wrapper(qc) });
    result.current.mutate({ trainingId: "tr-1", marks: [{ playerId: ALICE, status: "present" }] });
    result.current.mutate({ trainingId: "tr-1", marks: [{ playerId: BOB, status: "late" }] });

    await waitFor(() => expect(settle).toHaveLength(2));

    // First save lands; the second is still out there.
    settle[0](session());
    await waitFor(() =>
      expect(qc.isMutating({ mutationKey: ["markAttendance"] })).toBeLessThan(2),
    );

    const cached = qc.getQueryData<TrainingSession[]>(queryKeys.trainings);
    const statusOf = (id: string) => cached?.[0].attendance?.find((a) => a.playerId === id)?.status;
    expect(statusOf(ALICE)).toBe("present");
    // Bob's optimistic mark survived the first save settling.
    expect(statusOf(BOB)).toBe("late");
  });

  it("does not touch other sessions in the cache", async () => {
    const qc = freshClient();
    const other = session({ id: "tr-2" });
    qc.setQueryData(queryKeys.trainings, [session(), other]);

    getTraining.mockReturnValue(session());
    updateTraining.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useMarkAttendance(COACH), { wrapper: wrapper(qc) });
    result.current.mutate({ trainingId: "tr-1", marks: [{ playerId: ALICE, status: "present" }] });

    await waitFor(() => {
      const cached = qc.getQueryData<TrainingSession[]>(queryKeys.trainings);
      expect(cached?.[0].attendance).toBeDefined();
    });
    expect(qc.getQueryData<TrainingSession[]>(queryKeys.trainings)?.[1].attendance).toBeUndefined();
  });
});
