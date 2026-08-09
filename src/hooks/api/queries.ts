// ============================================================
// TennisAI — React Query Hooks for all domain services
// Centralized data fetching, mutation, and cache invalidation
// ============================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trainingsApi } from "@/api/endpoints/trainings";
import { trainingRequestsApi } from "@/api/endpoints/trainingRequests";
import { teamsApi } from "@/api/endpoints/teams";
import { calendarApi } from "@/api/endpoints/calendar";
import { tournamentsApi } from "@/api/endpoints/tournaments";
import { hiddenTournamentsApi } from "@/api/endpoints/hiddenTournaments";
import { financeApi } from "@/api/endpoints/finance";
import { equipmentApi } from "@/api/endpoints/equipment";
import { notificationsApi } from "@/api/endpoints/notifications";
import { profileApi } from "@/api/endpoints/profile";
import { trainingPlansApi } from "@/api/endpoints/trainingPlans";
import type { TrainingSession, TrainingRequest, Team, CalendarEvent, PlayerTournament, FinanceEntry, EquipmentItem, Notification, NotificationSettings, ConnectedPlayer, User, TrainingPlanCreateInput } from "@/types";
import { toast } from "sonner";

// ─── Query Keys ───
export const queryKeys = {
  trainings: ["trainings"] as const,
  trainingRequests: ["trainingRequests"] as const,
  teams: ["teams"] as const,
  calendarEvents: ["calendarEvents"] as const,
  tournaments: ["tournaments"] as const,
  playerTournaments: ["playerTournaments"] as const,
  hiddenTournaments: ["hidden-tournaments"] as const,
  finance: (playerId: string) => ["finance", playerId] as const,
  financeSummary: (playerId: string) => ["financeSummary", playerId] as const,
  equipment: (playerId: string) => ["equipment", playerId] as const,
  notifications: (userId: string) => ["notifications", userId] as const,
  notificationPrefs: ["notificationPrefs"] as const,
  trainingPlans: ["trainingPlans"] as const,
};

function useInvalidateRelated() {
  const qc = useQueryClient();
  return {
    training: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trainings });
      qc.invalidateQueries({ queryKey: queryKeys.calendarEvents });
    },
    trainingRequest: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trainingRequests });
      qc.invalidateQueries({ queryKey: queryKeys.calendarEvents });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    calendar: () => {
      qc.invalidateQueries({ queryKey: queryKeys.calendarEvents });
    },
    team: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams });
    },
    tournament: () => {
      qc.invalidateQueries({ queryKey: queryKeys.playerTournaments });
      qc.invalidateQueries({ queryKey: queryKeys.calendarEvents });
    },
    finance: (playerId: string) => {
      qc.invalidateQueries({ queryKey: queryKeys.finance(playerId) });
      qc.invalidateQueries({ queryKey: queryKeys.financeSummary(playerId) });
    },
    equipment: (playerId: string) => {
      qc.invalidateQueries({ queryKey: queryKeys.equipment(playerId) });
    },
    notifications: (userId: string) => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications(userId) });
    },
  };
}

// ─── Training Hooks ───

export function useTrainings() {
  return useQuery({
    queryKey: queryKeys.trainings,
    queryFn: async () => (await trainingsApi.getTrainings()).data,
  });
}

export function useCreateTraining() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (data: Omit<TrainingSession, "id" | "createdAt">) => trainingsApi.createTraining(data),
    onSuccess: () => { inv.training(); toast.success("Training created"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create training"),
  });
}

export function useUpdateTraining() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TrainingSession> }) => trainingsApi.updateTraining(id, data),
    onSuccess: () => { inv.training(); toast.success("Training updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update training"),
  });
}

export function useDeleteTraining() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (id: string) => trainingsApi.deleteTraining(id),
    onSuccess: () => { inv.training(); toast.success("Training deleted"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete training"),
  });
}

export function useAnalyzeTraining() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (id: string) => trainingsApi.analyzeTraining(id),
    onSuccess: () => { inv.training(); toast.success("Analysis ready"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to analyze training"),
  });
}

// ─── Training Request Hooks ───

export function useTrainingRequests() {
  return useQuery({
    queryKey: queryKeys.trainingRequests,
    queryFn: async () => (await trainingRequestsApi.getRequests()).data,
  });
}

export function useCreateTrainingRequest() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (data: Omit<TrainingRequest, "id" | "createdAt" | "updatedAt" | "status">) => trainingRequestsApi.createRequest(data),
    onSuccess: () => { inv.trainingRequest(); toast.success("Training request sent"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send request"),
  });
}

export function useApproveTrainingRequest() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, coachMessage }: { id: string; coachMessage?: string }) => trainingRequestsApi.approve(id, coachMessage),
    onSuccess: () => { inv.trainingRequest(); toast.success("Request approved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to approve"),
  });
}

export function useRejectTrainingRequest() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, coachMessage }: { id: string; coachMessage?: string }) => trainingRequestsApi.reject(id, coachMessage),
    onSuccess: () => { inv.trainingRequest(); toast.success("Request declined"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to decline"),
  });
}

export function useRescheduleTrainingRequest() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { proposedDate: string; proposedStartTime: string; proposedEndTime: string; coachMessage?: string } }) =>
      trainingRequestsApi.reschedule(id, data),
    onSuccess: () => { inv.trainingRequest(); toast.success("New time proposed"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reschedule"),
  });
}

export function useCancelTrainingRequest() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (id: string) => trainingRequestsApi.cancel(id),
    onSuccess: () => { inv.trainingRequest(); toast.success("Request cancelled"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to cancel"),
  });
}

// ─── Team Hooks ───

export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: async () => (await teamsApi.getTeams()).data,
  });
}

export function useCreateTeam() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (data: { name: string; coachId: string; description?: string }) => teamsApi.createTeam(data),
    onSuccess: () => { inv.team(); toast.success("Team created"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create team"),
  });
}

// ─── Training plans (saved from the Session Builder) ───
export function useTrainingPlans() {
  return useQuery({
    queryKey: queryKeys.trainingPlans,
    queryFn: async () => (await trainingPlansApi.list()).data,
  });
}

export function useCreateTrainingPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TrainingPlanCreateInput) => trainingPlansApi.create(input),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingPlans });
      toast.success(res.message ?? "Session saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save session"),
  });
}

export function useUpdateTeam() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Team> }) => teamsApi.updateTeam(id, data),
    onSuccess: () => { inv.team(); toast.success("Team updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update team"),
  });
}

export function useDeleteTeam() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (id: string) => teamsApi.deleteTeam(id),
    onSuccess: () => { inv.team(); toast.success("Team deleted"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete team"),
  });
}

export function useAddTeamMember() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ teamId, player }: { teamId: string; player: ConnectedPlayer }) => teamsApi.addTeamMember(teamId, player),
    onSuccess: () => { inv.team(); toast.success("Player added to team"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add player"),
  });
}

export function useRemoveTeamMember() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) => teamsApi.removeTeamMember(teamId, playerId),
    onSuccess: () => { inv.team(); toast.success("Player removed from team"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove player"),
  });
}

// ─── Calendar Hooks ───

export function useCalendarEvents() {
  return useQuery({
    queryKey: queryKeys.calendarEvents,
    queryFn: async () => (await calendarApi.getEvents()).data,
  });
}

export function useCreateCalendarEvent() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (data: Omit<CalendarEvent, "id">) => calendarApi.createEvent(data),
    onSuccess: () => { inv.calendar(); toast.success("Event created"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create event"),
  });
}

export function useUpdateCalendarEvent() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CalendarEvent> }) => calendarApi.updateEvent(id, data),
    onSuccess: () => { inv.calendar(); toast.success("Event updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update event"),
  });
}

export function useDeleteCalendarEvent() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (id: string) => calendarApi.deleteEvent(id),
    onSuccess: () => { inv.calendar(); toast.success("Event deleted"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete event"),
  });
}

// ─── Tournament Hooks ───

export function useTournaments() {
  return useQuery({
    queryKey: queryKeys.tournaments,
    queryFn: async () => (await tournamentsApi.getTournaments()).data,
  });
}

export function usePlayerTournaments() {
  return useQuery({
    queryKey: queryKeys.playerTournaments,
    queryFn: async () => (await tournamentsApi.getPlayerTournaments()).data,
  });
}

// Optimistic: a status change on an entry the client already has is a field patch
// on a row that exists — the UI can show it immediately and roll back cleanly.
export function useUpdatePlayerTournament() {
  const qc = useQueryClient();
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PlayerTournament> }) => tournamentsApi.updatePlayerTournament(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: queryKeys.playerTournaments });
      const previous = qc.getQueryData<PlayerTournament[]>(queryKeys.playerTournaments);
      qc.setQueryData<PlayerTournament[]>(queryKeys.playerTournaments, (old) =>
        old?.map((pt) => (pt.id === id ? { ...pt, ...data } : pt)),
      );
      return { previous };
    },
    onSuccess: () => { toast.success("Tournament status updated"); },
    onError: (e: any, _vars, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(queryKeys.playerTournaments, ctx.previous);
      toast.error(e?.message ?? "Failed to update");
    },
    onSettled: () => { inv.tournament(); },
  });
}

export function useAddPlayerTournament() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (data: Omit<PlayerTournament, "id">) => tournamentsApi.addPlayerTournament(data),
    onSuccess: () => { inv.tournament(); toast.success("Added to schedule"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add"),
  });
}

export function useRemovePlayerTournament() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (id: string) => tournamentsApi.removePlayerTournament(id),
    onSuccess: () => { inv.tournament(); toast.success("Removed from schedule"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove"),
  });
}

// ─── Hidden Tournaments ("eliminate from suggestions") ───

export function useHiddenTournaments() {
  return useQuery({
    queryKey: queryKeys.hiddenTournaments,
    queryFn: async () => (await hiddenTournamentsApi.getHidden()).data,
  });
}

// Optimistic: hide/unhide is a per-account boolean filter over a list of ids —
// the cheapest possible thing to apply locally and reverse if the write fails.
export function useHideTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) => hiddenTournamentsApi.hide(tournamentId),
    onMutate: async (tournamentId) => {
      await qc.cancelQueries({ queryKey: queryKeys.hiddenTournaments });
      const previous = qc.getQueryData<string[]>(queryKeys.hiddenTournaments);
      qc.setQueryData<string[]>(queryKeys.hiddenTournaments, (old) =>
        old ? (old.includes(tournamentId) ? old : [...old, tournamentId]) : [tournamentId],
      );
      return { previous };
    },
    onSuccess: () => { toast.success("Tournament hidden"); },
    onError: (e: any, _tournamentId, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(queryKeys.hiddenTournaments, ctx.previous);
      toast.error(e?.message ?? "Failed to hide tournament");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.hiddenTournaments });
      qc.invalidateQueries({ queryKey: queryKeys.tournaments });
    },
  });
}

export function useUnhideTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) => hiddenTournamentsApi.unhide(tournamentId),
    onMutate: async (tournamentId) => {
      await qc.cancelQueries({ queryKey: queryKeys.hiddenTournaments });
      const previous = qc.getQueryData<string[]>(queryKeys.hiddenTournaments);
      qc.setQueryData<string[]>(queryKeys.hiddenTournaments, (old) => old?.filter((id) => id !== tournamentId));
      return { previous };
    },
    onSuccess: () => { toast.success("Tournament unhidden"); },
    onError: (e: any, _tournamentId, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(queryKeys.hiddenTournaments, ctx.previous);
      toast.error(e?.message ?? "Failed to unhide tournament");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.hiddenTournaments });
      qc.invalidateQueries({ queryKey: queryKeys.tournaments });
    },
  });
}

// ─── Finance Hooks ───

export function useFinanceEntries(playerId: string) {
  return useQuery({
    queryKey: queryKeys.finance(playerId),
    queryFn: async () => (await financeApi.getEntries(playerId)).data,
    enabled: !!playerId,
  });
}

export function useFinanceSummary(playerId: string) {
  return useQuery({
    queryKey: queryKeys.financeSummary(playerId),
    queryFn: async () => (await financeApi.getSummary(playerId)).data,
    enabled: !!playerId,
  });
}

export function useCreateFinanceEntry() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ playerId, data }: { playerId: string; data: Omit<FinanceEntry, "id" | "createdAt" | "playerId"> }) =>
      financeApi.createEntry(playerId, data),
    onSuccess: (_, vars) => { inv.finance(vars.playerId); toast.success("Expense added"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add expense"),
  });
}

// ─── Equipment Hooks ───

export function useEquipment(playerId: string) {
  return useQuery({
    queryKey: queryKeys.equipment(playerId),
    queryFn: async () => (await equipmentApi.getItems(playerId)).data,
    enabled: !!playerId,
  });
}

export function useCreateEquipment() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: (data: Omit<EquipmentItem, "id">) => equipmentApi.createItem(data),
    onSuccess: (_, vars) => { inv.equipment(vars.playerId); toast.success("Equipment added"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add equipment"),
  });
}

export function useUpdateEquipment() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, data, playerId }: { id: string; data: Partial<EquipmentItem>; playerId: string }) =>
      equipmentApi.updateItem(id, data),
    onSuccess: (_, vars) => { inv.equipment(vars.playerId); toast.success("Equipment updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
  });
}

export function useDeleteEquipment() {
  const inv = useInvalidateRelated();
  return useMutation({
    mutationFn: ({ id, playerId }: { id: string; playerId: string }) => equipmentApi.deleteItem(id),
    onSuccess: (_, vars) => { inv.equipment(vars.playerId); toast.success("Equipment removed"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });
}

// ─── Notification Hooks ───

export function useNotifications(userId: string) {
  return useQuery({
    queryKey: queryKeys.notifications(userId),
    queryFn: async () => (await notificationsApi.getNotifications(userId)).data,
    enabled: !!userId,
  });
}

// Optimistic: marking one notification read is a single boolean flip, fired the
// moment the user taps a row — waiting for a round-trip before the badge drops
// is the most visible lag in the app. Every ["notifications", userId] cache is
// patched, then restored verbatim if the write fails.
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const previous = qc.getQueriesData<Notification[]>({ queryKey: ["notifications"] });
      qc.setQueriesData<Notification[]>({ queryKey: ["notifications"] }, (old) =>
        old?.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      ctx?.previous.forEach(([key, data]) => { qc.setQueryData(key, data); });
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => notificationsApi.markAllRead(userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); toast.success("All marked as read"); },
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notificationPrefs,
    queryFn: async () => (await notificationsApi.getPreferences()).data,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<NotificationSettings>) => notificationsApi.updatePreferences(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.notificationPrefs }); toast.success("Preferences saved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save preferences"),
  });
}

// ─── Profile Hooks ───

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (data: Partial<User>) => profileApi.updateProfile(data),
    onSuccess: () => toast.success("Profile updated"),
    onError: (e: any) => toast.error(e?.message ?? "Failed to update profile"),
  });
}
