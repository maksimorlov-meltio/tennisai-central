// ============================================================
// TennisAI — Centralized Mutable Mock Data Store
// All mock service adapters read/write from here so data
// stays consistent across React Query caches and pages.
// TODO: Remove entirely when real backend is connected.
// ============================================================

import {
  addDays, addWeeks, addMonths, isBefore, isSameDay, format,
} from "date-fns";
import type {
  CalendarEvent,
  Team,
  TrainingSession,
  TrainingRequest,
  TrainingRequestStatus,
  PlayerTournament,
  FinanceEntry,
  FinanceSummary,
  EquipmentItem,
  Notification,
  NotificationSettings,
  ConnectedPlayer,
} from "@/types";
import {
  mockCalendarEvents,
  mockTeams,
  mockPlayerTournaments,
  mockFinanceEntries,
  mockFinanceSummary,
  mockEquipment,
  mockNotifications,
  mockNotificationSettings,
} from "@/mock/data";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

class MockStore {
  calendarEvents: CalendarEvent[] = clone(mockCalendarEvents);
  teams: Team[] = clone(mockTeams);
  trainings: TrainingSession[] = [
    { id: "tr1", title: "Morning Footwork Drills", trainingType: "individual", coachId: "c1", playerIds: ["p1", "p2"], startDate: "2026-03-10T08:00:00Z", endDate: "2026-03-10T10:00:00Z", location: "Court A", goal: "Improve lateral movement speed", intensity: "high", createdAt: "2026-03-01T00:00:00Z", review: { rating: 4, workedOn: "Lateral footwork drills, split-step timing, recovery steps", nextSteps: "Increase drill speed by 10%, add weighted vest next session", reviewedAt: "2026-03-10T10:15:00Z" } },
    { id: "tr2", title: "Serve & Return Practice", trainingType: "team", coachId: "c1", playerIds: ["p3"], teamId: "t2", startDate: "2026-03-12T09:00:00Z", endDate: "2026-03-12T11:00:00Z", location: "Court B", goal: "Consistency on second serve return", intensity: "medium", createdAt: "2026-03-01T00:00:00Z", review: { rating: 3, workedOn: "Second serve return positioning, backhand block returns", nextSteps: "Work on aggressive return stance, practice chip-and-charge", playerFeedback: "Felt good about backhand returns but forehand needs work", reviewedAt: "2026-03-12T11:10:00Z" } },
    { id: "tr3", title: "Tactical Clay Court Session", trainingType: "tactical", coachId: "c1", playerIds: ["p1"], startDate: "2026-03-15T10:00:00Z", endDate: "2026-03-15T12:00:00Z", location: "Clay Court 1", goal: "Prepare clay court strategy for City Open", intensity: "medium", notes: "Focus on heavy topspin rallies", coachNotes: "Player struggles with drop shots on clay", createdAt: "2026-03-05T00:00:00Z" },
    { id: "tr4", title: "Team Fitness Block", trainingType: "fitness", coachId: "c1", playerIds: ["p1", "p2", "p5"], teamId: "t1", startDate: "2026-03-18T07:00:00Z", endDate: "2026-03-18T09:00:00Z", location: "Gym", goal: "Endurance baseline for tournament week", intensity: "high", createdAt: "2026-03-05T00:00:00Z" },
    { id: "tr5", title: "Match Practice — Sam vs Lena", trainingType: "match_practice", coachId: "c1", playerIds: ["p2", "p3"], startDate: "2026-03-20T14:00:00Z", endDate: "2026-03-20T16:00:00Z", location: "Center Court", goal: "Simulate competitive pressure", intensity: "high", createdAt: "2026-03-08T00:00:00Z" },
  ];
  trainingRequests: TrainingRequest[] = [
    { id: "treq1", playerId: "p1", playerName: "Alex Rivera", coachId: "c1", coachName: "Jordan Smith", status: "pending", preferredDate: "2026-03-14", preferredStartTime: "09:00", preferredEndTime: "11:00", trainingType: "individual", location: "Court A", notes: "Want to focus on backhand improvement before City Open", priority: "high", createdAt: "2026-03-07T10:00:00Z", updatedAt: "2026-03-07T10:00:00Z" },
    { id: "treq2", playerId: "p2", playerName: "Sam Chen", coachId: "c1", coachName: "Jordan Smith", status: "pending", preferredDate: "2026-03-16", preferredStartTime: "14:00", preferredEndTime: "15:30", trainingType: "tactical", notes: "Need help with net approach patterns", createdAt: "2026-03-07T14:00:00Z", updatedAt: "2026-03-07T14:00:00Z" },
    { id: "treq3", playerId: "p1", playerName: "Alex Rivera", coachId: "c1", coachName: "Jordan Smith", status: "approved", preferredDate: "2026-03-10", preferredStartTime: "08:00", preferredEndTime: "10:00", trainingType: "fitness", location: "Gym", coachMessage: "Great idea, let's do it!", calendarEventId: "e6", createdAt: "2026-03-05T08:00:00Z", updatedAt: "2026-03-06T09:00:00Z" },
  ];
  playerTournaments: PlayerTournament[] = clone(mockPlayerTournaments);
  financeEntries: FinanceEntry[] = clone(mockFinanceEntries);
  equipment: EquipmentItem[] = clone(mockEquipment);
  notifications: Notification[] = clone(mockNotifications);
  notificationSettings: NotificationSettings = clone(mockNotificationSettings);

  private nextId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // ─── Calendar ───

  /** Expand a single recurring event into virtual occurrences */
  private expandRecurrence(event: CalendarEvent): CalendarEvent[] {
    if (!event.recurrence) return [event];

    const { frequency, endType, count, until, exceptions = [] } = event.recurrence;
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    const duration = end.getTime() - start.getTime();
    const maxOccurrences = endType === "count" ? (count ?? 30) : 90;
    const untilDate = endType === "until" && until ? new Date(until) : addDays(new Date(), 180);

    const advanceFn = (d: Date, n: number) => {
      switch (frequency) {
        case "daily": return addDays(d, n);
        case "weekly": return addWeeks(d, n);
        case "biweekly": return addWeeks(d, n * 2);
        case "monthly": return addMonths(d, n);
      }
    };

    const results: CalendarEvent[] = [];
    for (let i = 0; i < maxOccurrences; i++) {
      const occStart = advanceFn(start, i);
      if (isBefore(untilDate, occStart)) break;

      const occDateKey = format(occStart, "yyyy-MM-dd");
      if (exceptions.includes(occDateKey)) continue;

      const occEnd = new Date(occStart.getTime() + duration);
      results.push({
        ...event,
        id: i === 0 ? event.id : `${event.id}_occ_${i}`,
        startDate: occStart.toISOString(),
        endDate: occEnd.toISOString(),
        recurrenceParentId: i === 0 ? undefined : event.id,
        recurrenceIndex: i,
      });
    }
    return results;
  }

  getCalendarEvents() {
    const expanded: CalendarEvent[] = [];
    for (const event of this.calendarEvents) {
      expanded.push(...this.expandRecurrence(event));
    }
    return clone(expanded);
  }

  getCalendarEvent(id: string) {
    // Check direct match first
    const direct = this.calendarEvents.find((e) => e.id === id);
    if (direct) return clone(direct);
    // Check if it's a virtual occurrence
    const allExpanded = this.getCalendarEvents();
    return clone(allExpanded.find((e) => e.id === id));
  }

  createCalendarEvent(event: Omit<CalendarEvent, "id">) {
    const newEvent = { ...event, id: this.nextId("e") } as CalendarEvent;
    this.calendarEvents.push(newEvent);
    return clone(newEvent);
  }

  updateCalendarEvent(id: string, updates: Partial<CalendarEvent>) {
    // If it's a virtual occurrence, find the parent
    const parentId = id.includes("_occ_") ? id.split("_occ_")[0] : id;
    const idx = this.calendarEvents.findIndex((e) => e.id === parentId);
    if (idx === -1) throw new Error("Event not found");
    this.calendarEvents[idx] = { ...this.calendarEvents[idx], ...updates };
    return clone(this.calendarEvents[idx]);
  }

  /** Add an exception date to a recurring event (for "this event only" delete) */
  addRecurrenceException(parentId: string, exceptionDate: string) {
    const idx = this.calendarEvents.findIndex((e) => e.id === parentId);
    if (idx === -1) throw new Error("Event not found");
    const event = this.calendarEvents[idx];
    if (!event.recurrence) return;
    const exceptions = event.recurrence.exceptions ?? [];
    if (!exceptions.includes(exceptionDate)) {
      exceptions.push(exceptionDate);
    }
    event.recurrence = { ...event.recurrence, exceptions };
  }

  deleteCalendarEvent(id: string) {
    this.calendarEvents = this.calendarEvents.filter((e) => e.id !== id);
  }

  // ─── Teams ───
  getTeams() { return clone(this.teams); }
  getTeam(id: string) { return clone(this.teams.find((t) => t.id === id)); }
  createTeam(data: { name: string; coachId: string; description?: string }) {
    const team: Team = { id: this.nextId("t"), name: data.name, coachId: data.coachId, players: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.teams.push(team);
    return clone(team);
  }
  updateTeam(id: string, updates: Partial<Team>) {
    const idx = this.teams.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Team not found");
    this.teams[idx] = { ...this.teams[idx], ...updates, updatedAt: new Date().toISOString() };
    return clone(this.teams[idx]);
  }
  deleteTeam(id: string) { this.teams = this.teams.filter((t) => t.id !== id); }
  addTeamMember(teamId: string, player: ConnectedPlayer) {
    const team = this.teams.find((t) => t.id === teamId);
    if (!team) throw new Error("Team not found");
    if (!team.players.some((p) => p.id === player.id)) {
      team.players.push(clone(player));
      team.updatedAt = new Date().toISOString();
    }
    return clone(team);
  }
  removeTeamMember(teamId: string, playerId: string) {
    const team = this.teams.find((t) => t.id === teamId);
    if (!team) throw new Error("Team not found");
    team.players = team.players.filter((p) => p.id !== playerId);
    team.updatedAt = new Date().toISOString();
    return clone(team);
  }

  // ─── Trainings ───
  getTrainings() { return clone(this.trainings); }
  getTraining(id: string) { return clone(this.trainings.find((t) => t.id === id)); }
  createTraining(data: Omit<TrainingSession, "id" | "createdAt">) {
    const training: TrainingSession = { ...data, id: this.nextId("tr"), createdAt: new Date().toISOString() };
    this.trainings.push(training);
    return clone(training);
  }
  updateTraining(id: string, updates: Partial<TrainingSession>) {
    const idx = this.trainings.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Training not found");
    this.trainings[idx] = { ...this.trainings[idx], ...updates };
    return clone(this.trainings[idx]);
  }
  deleteTraining(id: string) { this.trainings = this.trainings.filter((t) => t.id !== id); }

  // ─── Training Requests ───
  getTrainingRequests() { return clone(this.trainingRequests); }
  getTrainingRequest(id: string) { return clone(this.trainingRequests.find((r) => r.id === id)); }
  createTrainingRequest(data: Omit<TrainingRequest, "id" | "createdAt" | "updatedAt" | "status">) {
    const req: TrainingRequest = { ...data, id: this.nextId("treq"), status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.trainingRequests.push(req);
    // Notification for coach
    this.addNotification({ userId: data.coachId, type: "training_request_created", title: "New Training Request", message: `${data.playerName} requested a ${data.trainingType} session on ${data.preferredDate}`, read: false, linkTo: "/training-requests" });
    return clone(req);
  }
  approveTrainingRequest(id: string, coachMessage?: string) {
    const idx = this.trainingRequests.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("Request not found");
    const req = this.trainingRequests[idx];
    req.status = "approved";
    req.coachMessage = coachMessage;
    req.updatedAt = new Date().toISOString();
    // Create calendar event
    const startDate = new Date(`${req.preferredDate}T${req.preferredStartTime}:00Z`).toISOString();
    const endDate = new Date(`${req.preferredDate}T${req.preferredEndTime}:00Z`).toISOString();
    const event = this.createCalendarEvent({
      title: `Training: ${req.playerName}`,
      type: "training",
      state: "confirmed",
      startDate,
      endDate,
      location: req.location,
      playerId: req.playerId,
      playerName: req.playerName,
      createdBy: req.coachId,
      createdByRole: "coach",
      trainingRequestId: id,
    });
    req.calendarEventId = event.id;
    // Notification for player
    this.addNotification({ userId: req.playerId, type: "training_request_approved", title: "Training Request Approved", message: `Your ${req.trainingType} request for ${req.preferredDate} was approved${coachMessage ? `: "${coachMessage}"` : ""}`, read: false, linkTo: "/calendar" });
    return clone(req);
  }
  rejectTrainingRequest(id: string, coachMessage?: string) {
    const idx = this.trainingRequests.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("Request not found");
    const req = this.trainingRequests[idx];
    req.status = "rejected";
    req.coachMessage = coachMessage;
    req.updatedAt = new Date().toISOString();
    this.addNotification({ userId: req.playerId, type: "training_request_rejected", title: "Training Request Declined", message: `Your ${req.trainingType} request for ${req.preferredDate} was declined${coachMessage ? `: "${coachMessage}"` : ""}`, read: false, linkTo: "/training-requests" });
    return clone(req);
  }
  rescheduleTrainingRequest(id: string, data: { proposedDate: string; proposedStartTime: string; proposedEndTime: string; coachMessage?: string }) {
    const idx = this.trainingRequests.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("Request not found");
    const req = this.trainingRequests[idx];
    req.status = "reschedule_proposed";
    req.proposedDate = data.proposedDate;
    req.proposedStartTime = data.proposedStartTime;
    req.proposedEndTime = data.proposedEndTime;
    req.coachMessage = data.coachMessage;
    req.updatedAt = new Date().toISOString();
    this.addNotification({ userId: req.playerId, type: "training_request_rescheduled", title: "New Time Proposed", message: `Coach proposed ${data.proposedDate} ${data.proposedStartTime}–${data.proposedEndTime} for your ${req.trainingType} session`, read: false, linkTo: "/training-requests" });
    return clone(req);
  }
  cancelTrainingRequest(id: string) {
    const idx = this.trainingRequests.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("Request not found");
    this.trainingRequests[idx].status = "cancelled";
    this.trainingRequests[idx].updatedAt = new Date().toISOString();
    return clone(this.trainingRequests[idx]);
  }

  // ─── Hidden Tournaments (per-session "eliminate from suggestions") ───
  hiddenTournamentIds: string[] = [];
  getHiddenTournaments() { return clone(this.hiddenTournamentIds); }
  hideTournament(tournamentId: string) {
    if (!this.hiddenTournamentIds.includes(tournamentId)) {
      this.hiddenTournamentIds.push(tournamentId);
    }
    return clone(this.hiddenTournamentIds);
  }
  unhideTournament(tournamentId: string) {
    this.hiddenTournamentIds = this.hiddenTournamentIds.filter((id) => id !== tournamentId);
    return clone(this.hiddenTournamentIds);
  }

  // ─── Player Tournaments ───
  getPlayerTournaments() { return clone(this.playerTournaments); }
  addPlayerTournament(data: Omit<PlayerTournament, "id">) {
    const pt = { ...data, id: this.nextId("pt") };
    this.playerTournaments.push(pt);
    return clone(pt);
  }
  updatePlayerTournament(id: string, updates: Partial<PlayerTournament>) {
    const idx = this.playerTournaments.findIndex((pt) => pt.id === id);
    if (idx === -1) throw new Error("Player tournament not found");
    this.playerTournaments[idx] = { ...this.playerTournaments[idx], ...updates };
    return clone(this.playerTournaments[idx]);
  }

  // ─── Finance ───
  getFinanceEntries(playerId?: string) {
    const entries = playerId ? this.financeEntries.filter((f) => f.playerId === playerId) : this.financeEntries;
    return clone(entries);
  }
  getFinanceSummary(playerId?: string): FinanceSummary {
    const entries = playerId ? this.financeEntries.filter((f) => f.playerId === playerId) : this.financeEntries;
    return {
      totalTraining: entries.filter((e) => e.category === "training").reduce((s, e) => s + e.amount, 0),
      totalTravel: entries.filter((e) => e.category === "travel").reduce((s, e) => s + e.amount, 0),
      totalTournament: entries.filter((e) => e.category === "tournament").reduce((s, e) => s + e.amount, 0),
      totalEquipment: entries.filter((e) => e.category === "equipment").reduce((s, e) => s + e.amount, 0),
      currency: "USD",
    };
  }
  createFinanceEntry(data: Omit<FinanceEntry, "id" | "createdAt">) {
    const entry: FinanceEntry = { ...data, id: this.nextId("f"), createdAt: new Date().toISOString() };
    this.financeEntries.push(entry);
    return clone(entry);
  }

  // ─── Equipment ───
  getEquipment(playerId?: string) {
    const items = playerId ? this.equipment.filter((e) => e.playerId === playerId) : this.equipment;
    return clone(items);
  }
  createEquipmentItem(data: Omit<EquipmentItem, "id">) {
    const item: EquipmentItem = { ...data, id: this.nextId("eq") };
    this.equipment.push(item);
    return clone(item);
  }
  updateEquipmentItem(id: string, updates: Partial<EquipmentItem>) {
    const idx = this.equipment.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error("Equipment not found");
    this.equipment[idx] = { ...this.equipment[idx], ...updates };
    return clone(this.equipment[idx]);
  }
  deleteEquipmentItem(id: string) { this.equipment = this.equipment.filter((e) => e.id !== id); }

  // ─── Notifications ───
  getNotifications(userId?: string) {
    const notifs = userId ? this.notifications.filter((n) => n.userId === userId) : this.notifications;
    return clone(notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }
  markNotificationRead(id: string) {
    const n = this.notifications.find((n) => n.id === id);
    if (n) n.read = true;
  }
  markAllNotificationsRead(userId: string) {
    this.notifications.filter((n) => n.userId === userId).forEach((n) => { n.read = true; });
  }
  addNotification(data: Omit<Notification, "id" | "createdAt">) {
    const notif: Notification = { ...data, id: this.nextId("n"), createdAt: new Date().toISOString() };
    this.notifications.unshift(notif);
    return clone(notif);
  }
  getNotificationSettings() { return clone(this.notificationSettings); }
  updateNotificationSettings(updates: Partial<NotificationSettings>) {
    this.notificationSettings = { ...this.notificationSettings, ...updates };
    return clone(this.notificationSettings);
  }
}

export const mockStore = new MockStore();
