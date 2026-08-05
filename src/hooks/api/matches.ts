// ============================================================
// TennisAI — Match & statistics React Query hooks
//
// Feature-scoped on purpose (not in the shared queries.ts). Every mutation
// invalidates BOTH the match list and the derived stats, so a statistic can
// never linger from before an edit.
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { matchesApi } from "@/api/endpoints/matches";
import { opponentsApi } from "@/api/endpoints/opponents";
import type {
  AggregateMatchStats,
  MatchCreateInput,
  MatchUpdateInput,
  MatchView,
  Opponent,
  OpponentCreateInput,
  OpponentUpdateInput,
} from "@/types";

/** `undefined` playerId ⇒ "the authenticated user", resolved server-side. */
const scope = (playerId?: string) => playerId ?? "self";

export const matchQueryKeys = {
  matches: (playerId?: string) => ["matches", scope(playerId)] as const,
  matchStats: (playerId?: string) => ["matchStats", scope(playerId)] as const,
  opponents: ["opponents"] as const,
};

/** Pull a human message off an unknown thrown value without using `any`. */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ─── Queries ───

// The window/limit is part of the key so two windows never share a cache entry.
// Invalidation is prefix-based, so it still reaches every variant.

export function useMatches(playerId?: string, limit?: number) {
  return useQuery<MatchView[]>({
    queryKey: [...matchQueryKeys.matches(playerId), limit ?? "all"],
    queryFn: async () => (await matchesApi.getMatches(playerId, limit)).data,
  });
}

export function useMatchStats(playerId?: string, recent?: number) {
  return useQuery<AggregateMatchStats>({
    queryKey: [...matchQueryKeys.matchStats(playerId), recent ?? "default"],
    queryFn: async () => (await matchesApi.getMatchStats(playerId, recent)).data,
  });
}

export function useOpponents() {
  return useQuery<Opponent[]>({
    queryKey: matchQueryKeys.opponents,
    queryFn: async () => (await opponentsApi.getOpponents()).data,
  });
}

// ─── Invalidation ───

function useInvalidateMatchData() {
  const qc = useQueryClient();
  return (playerId?: string) => {
    qc.invalidateQueries({ queryKey: matchQueryKeys.matches(playerId) });
    qc.invalidateQueries({ queryKey: matchQueryKeys.matchStats(playerId) });
    // A coach may hold several players' lists in cache; refresh them all.
    qc.invalidateQueries({ queryKey: ["matches"] });
    qc.invalidateQueries({ queryKey: ["matchStats"] });
  };
}

// ─── Match mutations ───

export function useCreateMatch() {
  const invalidate = useInvalidateMatchData();
  return useMutation({
    mutationFn: (input: MatchCreateInput) => matchesApi.createMatch(input),
    onSuccess: (res, input) => {
      invalidate(input.playerId);
      toast.success(res.message ?? "Match logged");
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Failed to log match")),
  });
}

export function useUpdateMatch() {
  const invalidate = useInvalidateMatchData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MatchUpdateInput; playerId?: string }) =>
      matchesApi.updateMatch(id, input),
    onSuccess: (res, vars) => {
      invalidate(vars.playerId);
      toast.success(res.message ?? "Match updated");
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Failed to update match")),
  });
}

export function useDeleteMatch() {
  const invalidate = useInvalidateMatchData();
  return useMutation({
    mutationFn: ({ id }: { id: string; playerId?: string }) => matchesApi.deleteMatch(id),
    onSuccess: (res, vars) => {
      invalidate(vars.playerId);
      toast.success(res.message ?? "Match deleted");
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Failed to delete match")),
  });
}

// ─── Opponent mutations ───

export function useCreateOpponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpponentCreateInput) => opponentsApi.createOpponent(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: matchQueryKeys.opponents });
      toast.success(res.message ?? "Opponent added");
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Failed to add opponent")),
  });
}

export function useUpdateOpponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OpponentUpdateInput }) =>
      opponentsApi.updateOpponent(id, input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: matchQueryKeys.opponents });
      toast.success(res.message ?? "Opponent updated");
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Failed to update opponent")),
  });
}

export function useDeleteOpponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => opponentsApi.deleteOpponent(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: matchQueryKeys.opponents });
      // Deleting an opponent clears the reference on existing matches.
      qc.invalidateQueries({ queryKey: ["matches"] });
      toast.success(res.message ?? "Opponent deleted");
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Failed to delete opponent")),
  });
}
