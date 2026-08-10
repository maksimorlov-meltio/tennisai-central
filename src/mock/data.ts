// ============================================================
// Mock Data — Used by mock service adapters
// TODO: Remove when real API is ready
// ============================================================

import type {
  ConnectedPlayer,
  ConnectionRequest,
  Team,
  CalendarEvent,
  Tournament,
  PlayerTournament,
  FinanceEntry,
  FinanceSummary,
  EquipmentItem,
  Notification,
  NotificationSettings,
} from "@/types";

export const mockConnectedPlayers: ConnectedPlayer[] = [
  { id: "p1", playerPublicId: "TAI-P-001", firstName: "Alex", lastName: "Rivera", connectedSince: "2025-02-01T00:00:00Z" },
  { id: "p2", playerPublicId: "TAI-P-002", firstName: "Sam", lastName: "Chen", connectedSince: "2025-03-01T00:00:00Z" },
  { id: "p3", playerPublicId: "TAI-P-003", firstName: "Lena", lastName: "Petrova", connectedSince: "2025-04-15T00:00:00Z" },
  { id: "p5", playerPublicId: "TAI-P-005", firstName: "Sofia", lastName: "Navarro", connectedSince: "2025-05-10T00:00:00Z" },
  { id: "p6", playerPublicId: "TAI-P-006", firstName: "Enzo", lastName: "Moretti", connectedSince: "2025-06-20T00:00:00Z" },
];

export const mockConnectionRequests: ConnectionRequest[] = [];

export const mockTeams: Team[] = [
  { id: "t1", name: "Junior Elite Squad", coachId: "c1", players: [mockConnectedPlayers[0], mockConnectedPlayers[1]], createdAt: "2025-04-01T00:00:00Z", updatedAt: "2025-04-01T00:00:00Z" },
  { id: "t2", name: "Clay Court Specialists", coachId: "c1", players: [mockConnectedPlayers[2]], createdAt: "2025-06-01T00:00:00Z", updatedAt: "2025-06-01T00:00:00Z" },
];

export const mockCalendarEvents: CalendarEvent[] = [
  // Week of Mar 2 — Alex Rivera
  { id: "e10", title: "Agility Drills", type: "training", startDate: "2026-03-02T07:00:00Z", endDate: "2026-03-02T08:30:00Z", location: "Court B", playerId: "p1", playerName: "Alex Rivera", createdBy: "c1", createdByRole: "coach", coachNotes: "Focus on lateral movement" },
  { id: "e11", title: "Video Analysis Session", type: "training", startDate: "2026-03-03T10:00:00Z", endDate: "2026-03-03T11:30:00Z", location: "Media Room", playerId: "p1", playerName: "Alex Rivera", createdBy: "c1", createdByRole: "coach" },
  // Week of Mar 9 — Alex Rivera
  { id: "e1", title: "Morning Training", type: "training", startDate: "2026-03-09T08:00:00Z", endDate: "2026-03-09T10:00:00Z", location: "Court A", playerId: "p1", playerName: "Alex Rivera", createdBy: "c1", createdByRole: "coach", coachNotes: "Increase backhand intensity" },
  { id: "e6", title: "Fitness Session", type: "training", startDate: "2026-03-10T06:30:00Z", endDate: "2026-03-10T08:00:00Z", location: "Gym", playerId: "p1", playerName: "Alex Rivera" },
  { id: "e3", title: "Match vs. Taylor", type: "match", startDate: "2026-03-11T14:00:00Z", endDate: "2026-03-11T16:00:00Z", location: "Court 3", playerId: "p1", playerName: "Alex Rivera" },
  { id: "e7", title: "Serve Practice", type: "training", startDate: "2026-03-12T09:00:00Z", endDate: "2026-03-12T10:30:00Z", location: "Court A", playerId: "p1", playerName: "Alex Rivera", createdBy: "c1", createdByRole: "coach" },
  { id: "e4", title: "Travel to Regional Open", type: "travel", startDate: "2026-03-13T06:00:00Z", endDate: "2026-03-13T12:00:00Z", playerId: "p1", playerName: "Alex Rivera" },
  // Week of Mar 16 — Tournament week, Alex Rivera
  { id: "e2", title: "Regional Open", type: "tournament", startDate: "2026-03-15T09:00:00Z", endDate: "2026-03-17T18:00:00Z", location: "City Tennis Center", playerId: "p1", playerName: "Alex Rivera" },
  { id: "e8", title: "R1: vs. Nguyen", type: "match", startDate: "2026-03-15T11:00:00Z", endDate: "2026-03-15T13:00:00Z", location: "Court 1", playerId: "p1", playerName: "Alex Rivera" },
  { id: "e9", title: "R2: vs. Johansson", type: "match", startDate: "2026-03-16T14:00:00Z", endDate: "2026-03-16T16:00:00Z", location: "Center Court", playerId: "p1", playerName: "Alex Rivera" },
  { id: "e5", title: "Rest & Recovery", type: "recovery", startDate: "2026-03-18T00:00:00Z", endDate: "2026-03-18T23:59:00Z", playerId: "p1", playerName: "Alex Rivera" },
  // Week of Mar 23 — Alex Rivera
  { id: "e12", title: "Return Travel", type: "travel", startDate: "2026-03-19T08:00:00Z", endDate: "2026-03-19T14:00:00Z", playerId: "p1", playerName: "Alex Rivera" },
  { id: "e13", title: "Light Recovery Session", type: "recovery", startDate: "2026-03-20T10:00:00Z", endDate: "2026-03-20T11:00:00Z", location: "Wellness Center", playerId: "p1", playerName: "Alex Rivera" },
  { id: "e14", title: "Tactical Review", type: "training", startDate: "2026-03-23T09:00:00Z", endDate: "2026-03-23T11:00:00Z", location: "Court A", playerId: "p1", playerName: "Alex Rivera", createdBy: "c1", createdByRole: "coach" },
  { id: "e15", title: "Practice Match vs. Chen", type: "match", startDate: "2026-03-25T15:00:00Z", endDate: "2026-03-25T17:00:00Z", location: "Court 2", playerId: "p1", playerName: "Alex Rivera" },
  { id: "e16", title: "Endurance Training", type: "training", startDate: "2026-03-27T07:00:00Z", endDate: "2026-03-27T09:00:00Z", location: "Track", playerId: "p1", playerName: "Alex Rivera" },
  // Sam Chen events
  { id: "e20", title: "Forehand Drills", type: "training", startDate: "2026-03-09T10:00:00Z", endDate: "2026-03-09T12:00:00Z", location: "Court B", playerId: "p2", playerName: "Sam Chen", createdBy: "c1", createdByRole: "coach", coachNotes: "Work on topspin consistency" },
  { id: "e21", title: "Match vs. Lopez", type: "match", startDate: "2026-03-14T14:00:00Z", endDate: "2026-03-14T16:00:00Z", location: "Court 5", playerId: "p2", playerName: "Sam Chen" },
  { id: "e22", title: "Conditioning", type: "training", startDate: "2026-03-17T07:00:00Z", endDate: "2026-03-17T09:00:00Z", location: "Gym", playerId: "p2", playerName: "Sam Chen", createdBy: "c1", createdByRole: "coach" },
  // Lena Petrova events
  { id: "e30", title: "Serve & Volley Session", type: "training", startDate: "2026-03-10T09:00:00Z", endDate: "2026-03-10T11:00:00Z", location: "Court A", playerId: "p3", playerName: "Lena Petrova", createdBy: "c1", createdByRole: "coach" },
  { id: "e31", title: "Travel to Junior Championship", type: "travel", startDate: "2026-03-28T06:00:00Z", endDate: "2026-03-28T14:00:00Z", playerId: "p3", playerName: "Lena Petrova" },
  // Coach's own schedule (no playerId)
  { id: "e40", title: "Team Strategy Meeting", type: "training", startDate: "2026-03-08T15:00:00Z", endDate: "2026-03-08T16:30:00Z", location: "Meeting Room", createdBy: "c1", createdByRole: "coach", coachNotes: "Prepare season plan" },
  { id: "e41", title: "Scout Tournament", type: "tournament", startDate: "2026-03-22T09:00:00Z", endDate: "2026-03-22T18:00:00Z", location: "Regional Center", createdBy: "c1", createdByRole: "coach" },
];

// Realistic 2026 tour calendar across the five major sanctioning bodies.
// Dates are illustrative and follow each tour's typical seasonal cadence.
// Host-city coordinates below are public geographic facts (city centroids),
// used for the map view + distance-from-me — not live event data.
export const mockTournaments: Tournament[] = [
  // ─── Grand Slams (ATP + WTA share the venue) ────────────────────────
  { id: "t1",  name: "Australian Open 2026",       city: "Melbourne",     country: "Australia",  surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Dunlop",  category: "Grand Slam",  level: "Professional", federation: "ATP", startDate: "2026-01-19T00:00:00Z", endDate: "2026-02-01T00:00:00Z", latitude: -37.8136, longitude: 144.9631 },
  { id: "t2",  name: "Roland-Garros 2026",         city: "Paris",         country: "France",     surface: "Clay",  indoorOutdoor: "outdoor", ballBrand: "Wilson",  category: "Grand Slam",  level: "Professional", federation: "ATP", startDate: "2026-05-24T00:00:00Z", endDate: "2026-06-07T00:00:00Z", latitude: 48.8566, longitude: 2.3522 },
  { id: "t3",  name: "Wimbledon 2026",             city: "London",        country: "UK",         surface: "Grass", indoorOutdoor: "outdoor", ballBrand: "Slazenger", category: "Grand Slam", level: "Professional", federation: "WTA", startDate: "2026-06-29T00:00:00Z", endDate: "2026-07-12T00:00:00Z", latitude: 51.5074, longitude: -0.1278 },
  { id: "t4",  name: "US Open 2026",               city: "New York",      country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Wilson",  category: "Grand Slam",  level: "Professional", federation: "USTA", startDate: "2026-08-31T00:00:00Z", endDate: "2026-09-13T00:00:00Z", latitude: 40.7128, longitude: -74.0060 },

  // ─── ATP Tour ───────────────────────────────────────────────────────
  { id: "t5",  name: "Indian Wells Masters",       city: "Indian Wells",  country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Penn",     category: "ATP 1000",     level: "Professional", federation: "ATP", startDate: "2026-03-09T00:00:00Z", endDate: "2026-03-22T00:00:00Z", latitude: 33.7175, longitude: -116.3005 },
  { id: "t6",  name: "Miami Open",                 city: "Miami",         country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Wilson",  category: "ATP 1000",     level: "Professional", federation: "ATP", startDate: "2026-03-23T00:00:00Z", endDate: "2026-04-05T00:00:00Z", latitude: 25.7617, longitude: -80.1918 },
  { id: "t7",  name: "Madrid Open",                city: "Madrid",        country: "Spain",      surface: "Clay",  indoorOutdoor: "outdoor", altitude: 650, ballBrand: "Dunlop", category: "ATP 1000", level: "Professional", federation: "ATP", startDate: "2026-04-27T00:00:00Z", endDate: "2026-05-10T00:00:00Z", latitude: 40.4168, longitude: -3.7038 },
  { id: "t8",  name: "Internazionali BNL d'Italia",city: "Rome",          country: "Italy",      surface: "Clay",  indoorOutdoor: "outdoor", ballBrand: "Dunlop",  category: "ATP 1000",     level: "Professional", federation: "ATP", startDate: "2026-05-11T00:00:00Z", endDate: "2026-05-18T00:00:00Z", latitude: 41.9028, longitude: 12.4964 },
  { id: "t9",  name: "Rolex Paris Masters",        city: "Paris",         country: "France",     surface: "Hard",  indoorOutdoor: "indoor",  ballBrand: "Wilson",  category: "ATP 1000",     level: "Professional", federation: "ATP", startDate: "2026-10-26T00:00:00Z", endDate: "2026-11-01T00:00:00Z", latitude: 48.8566, longitude: 2.3522 },
  { id: "t10", name: "ATP Finals Turin",           city: "Turin",         country: "Italy",      surface: "Hard",  indoorOutdoor: "indoor",  ballBrand: "Dunlop",  category: "ATP Finals",   level: "Professional", federation: "ATP", startDate: "2026-11-15T00:00:00Z", endDate: "2026-11-22T00:00:00Z", latitude: 45.0703, longitude: 7.6869 },

  // ─── WTA Tour ───────────────────────────────────────────────────────
  { id: "t11", name: "Dubai Tennis Championships", city: "Dubai",         country: "UAE",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Dunlop",  category: "WTA 1000",     level: "Professional", federation: "WTA", startDate: "2026-02-15T00:00:00Z", endDate: "2026-02-21T00:00:00Z", latitude: 25.2048, longitude: 55.2708 },
  { id: "t12", name: "BNP Paribas Open (WTA)",     city: "Indian Wells",  country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Penn",    category: "WTA 1000",     level: "Professional", federation: "WTA", startDate: "2026-03-09T00:00:00Z", endDate: "2026-03-22T00:00:00Z", latitude: 33.7175, longitude: -116.3005 },
  { id: "t13", name: "Stuttgart Open",             city: "Stuttgart",     country: "Germany",    surface: "Clay",  indoorOutdoor: "indoor",  ballBrand: "Head",    category: "WTA 500",      level: "Professional", federation: "WTA", startDate: "2026-04-20T00:00:00Z", endDate: "2026-04-26T00:00:00Z", latitude: 48.7758, longitude: 9.1829 },
  { id: "t14", name: "Mutua Madrid Open (WTA)",    city: "Madrid",        country: "Spain",      surface: "Clay",  indoorOutdoor: "outdoor", altitude: 650, ballBrand: "Dunlop", category: "WTA 1000", level: "Professional", federation: "WTA", startDate: "2026-04-27T00:00:00Z", endDate: "2026-05-10T00:00:00Z", latitude: 40.4168, longitude: -3.7038 },
  { id: "t15", name: "Cincinnati Open (WTA)",      city: "Cincinnati",    country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Wilson",  category: "WTA 1000",     level: "Professional", federation: "WTA", startDate: "2026-08-10T00:00:00Z", endDate: "2026-08-17T00:00:00Z", latitude: 39.1031, longitude: -84.5120 },
  { id: "t16", name: "WTA Finals Riyadh",          city: "Riyadh",        country: "Saudi Arabia", surface: "Hard", indoorOutdoor: "indoor", ballBrand: "Dunlop", category: "WTA Finals",   level: "Professional", federation: "WTA", startDate: "2026-11-01T00:00:00Z", endDate: "2026-11-08T00:00:00Z", latitude: 24.7136, longitude: 46.6753 },

  // ─── ITF World Tennis Tour (developmental / juniors) ────────────────
  { id: "t17", name: "ITF M25 Antalya",            city: "Antalya",       country: "Turkey",     surface: "Clay",  indoorOutdoor: "outdoor", ballBrand: "Head",    category: "ITF M25",      level: "Semi-Professional", federation: "ITF", startDate: "2026-02-23T00:00:00Z", endDate: "2026-03-01T00:00:00Z", latitude: 36.8969, longitude: 30.7133 },
  { id: "t18", name: "ITF W35 Santo Domingo",      city: "Santo Domingo", country: "Dominican Rep.", surface: "Hard", indoorOutdoor: "outdoor", ballBrand: "Wilson", category: "ITF W35", level: "Semi-Professional", federation: "ITF", startDate: "2026-03-16T00:00:00Z", endDate: "2026-03-22T00:00:00Z", latitude: 18.4861, longitude: -69.9312 },
  { id: "t19", name: "ITF Junior J300 Roehampton", city: "London",        country: "UK",         surface: "Grass", indoorOutdoor: "outdoor", ballBrand: "Slazenger", category: "ITF Juniors J300", level: "U18", federation: "ITF", startDate: "2026-07-13T00:00:00Z", endDate: "2026-07-19T00:00:00Z", latitude: 51.4613, longitude: -0.2312 },
  { id: "t20", name: "ITF M15 Buenos Aires",       city: "Buenos Aires",  country: "Argentina",  surface: "Clay",  indoorOutdoor: "outdoor", altitude: 25, ballBrand: "Penn", category: "ITF M15", level: "Semi-Professional", federation: "ITF", startDate: "2026-09-07T00:00:00Z", endDate: "2026-09-13T00:00:00Z", latitude: -34.6037, longitude: -58.3816 },

  // ─── USTA (US national circuit) ─────────────────────────────────────
  { id: "t21", name: "USTA National L1 Boys 18s",  city: "Kalamazoo",     country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Wilson",  category: "USTA L1 Junior", level: "U18", federation: "USTA", startDate: "2026-08-01T00:00:00Z", endDate: "2026-08-09T00:00:00Z", latitude: 42.2917, longitude: -85.5872 },
  { id: "t22", name: "USTA Pro Circuit Tiburon",   city: "Tiburon",       country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Wilson",  category: "USTA Pro Circuit Challenger", level: "Professional", federation: "USTA", startDate: "2026-09-28T00:00:00Z", endDate: "2026-10-04T00:00:00Z", latitude: 37.8735, longitude: -122.4569 },
  { id: "t23", name: "USTA National Clay Court 14s", city: "Delray Beach", country: "USA",       surface: "Clay",  indoorOutdoor: "outdoor", ballBrand: "Penn",    category: "USTA L1 Junior", level: "U14", federation: "USTA", startDate: "2026-07-13T00:00:00Z", endDate: "2026-07-19T00:00:00Z", latitude: 26.4615, longitude: -80.0728 },

  // ─── UTR (Universal Tennis Rating events) ───────────────────────────
  { id: "t24", name: "UTR Pro Tennis Series Newport Beach", city: "Newport Beach", country: "USA", surface: "Hard", indoorOutdoor: "outdoor", ballBrand: "Wilson", category: "UTR Pro Series", level: "Professional", federation: "UTR", startDate: "2026-04-13T00:00:00Z", endDate: "2026-04-19T00:00:00Z", latitude: 33.6189, longitude: -117.9298 },
  { id: "t25", name: "UTR Junior Masters",         city: "Orlando",       country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Wilson",  category: "UTR Junior",   level: "U16",          federation: "UTR", startDate: "2026-06-22T00:00:00Z", endDate: "2026-06-28T00:00:00Z", latitude: 28.5383, longitude: -81.3792 },
  { id: "t26", name: "UTR College Showcase",       city: "Atlanta",       country: "USA",        surface: "Hard",  indoorOutdoor: "outdoor", ballBrand: "Penn",    category: "UTR College Showcase", level: "Collegiate", federation: "UTR", startDate: "2026-10-19T00:00:00Z", endDate: "2026-10-25T00:00:00Z", latitude: 33.7490, longitude: -84.3880 },
];

export const mockPlayerTournaments: PlayerTournament[] = [
  { id: "pt1", tournamentId: "t1", tournament: mockTournaments[0], playerId: "p1", playerName: "Alex Rivera", status: "registered" },
  { id: "pt2", tournamentId: "t3", tournament: mockTournaments[2], playerId: "p1", playerName: "Alex Rivera", status: "planned" },
  { id: "pt3", tournamentId: "t2", tournament: mockTournaments[1], playerId: "p2", playerName: "Sam Chen", status: "registered" },
  { id: "pt4", tournamentId: "t5", tournament: mockTournaments[4], playerId: "p2", playerName: "Sam Chen", status: "maybe" },
  { id: "pt5", tournamentId: "t3", tournament: mockTournaments[2], playerId: "p3", playerName: "Lena Petrova", status: "registered" },
  { id: "pt6", tournamentId: "t8", tournament: mockTournaments[7], playerId: "p3", playerName: "Lena Petrova", status: "planned" },
  { id: "pt7", tournamentId: "t6", tournament: mockTournaments[5], playerId: "p5", playerName: "Sofia Navarro", status: "planned" },
  { id: "pt8", tournamentId: "t7", tournament: mockTournaments[6], playerId: "p6", playerName: "Enzo Moretti", status: "withdrawn" },
];

export const mockFinanceEntries: FinanceEntry[] = [
  { id: "f1", playerId: "p1", category: "training", description: "Weekly coaching (March)", amount: 400, currency: "USD", date: "2026-03-01", createdAt: "2026-03-01T00:00:00Z" },
  { id: "f2", playerId: "p1", category: "travel", description: "Flight to Madrid", amount: 320, currency: "USD", date: "2026-03-14", createdAt: "2026-03-14T00:00:00Z" },
  { id: "f3", playerId: "p1", category: "equipment", description: "New racket strings", amount: 45, currency: "USD", date: "2026-03-05", createdAt: "2026-03-05T00:00:00Z" },
  { id: "f4", playerId: "p1", category: "tournament", description: "City Open entry fee", amount: 150, currency: "USD", date: "2026-03-20", createdAt: "2026-03-20T00:00:00Z" },
];

export const mockFinanceSummary: FinanceSummary = {
  totalTraining: 400,
  totalTravel: 320,
  totalTournament: 150,
  totalEquipment: 45,
  currency: "USD",
};

export const mockEquipment: EquipmentItem[] = [
  { id: "eq1", playerId: "p1", category: "racket", name: "Wilson Pro Staff 97", brand: "Wilson", model: "Pro Staff 97", condition: "Good", acquiredDate: "2025-09-01" },
  { id: "eq2", playerId: "p1", category: "string", name: "Luxilon ALU Power", brand: "Luxilon", model: "ALU Power 125", condition: "Fraying", notes: "Tension: 52 lbs" },
  { id: "eq3", playerId: "p1", category: "shoes", name: "Nike Vapor Pro 2", brand: "Nike", model: "Vapor Pro 2", condition: "New" },
  { id: "eq4", playerId: "p1", category: "racket", name: "Babolat Pure Drive", brand: "Babolat", model: "Pure Drive 2024", condition: "Fair", acquiredDate: "2024-06-15" },
  { id: "eq5", playerId: "p1", category: "accessories", name: "Wilson Pro Overgrip (3-pack)", brand: "Wilson", condition: "Worn" },
  { id: "eq6", playerId: "p1", category: "balls", name: "Wilson US Open Balls", brand: "Wilson", condition: "Practice", notes: "Can of 4" },
];

export const mockNotifications: Notification[] = [
  { id: "n1", userId: "p1", type: "request_approval", title: "New Connection Request", message: "Coach Jordan Smith wants to connect with you", read: false, createdAt: "2026-03-07T10:00:00Z" },
  { id: "n2", userId: "p1", type: "tournament_reminder", title: "Tournament Coming Up", message: "City Open 2026 starts in 5 weeks", read: true, createdAt: "2026-03-06T09:00:00Z" },
  { id: "n3", userId: "p1", type: "ai_insight", title: "New AI Insight", message: "Your preparation analysis for City Open is ready", read: false, createdAt: "2026-03-05T14:00:00Z" },
];

export const mockNotificationSettings: NotificationSettings = {
  trainingReminders: true,
  tournamentReminders: true,
  requestApprovals: true,
  financeUpdates: true,
  aiInsightUpdates: true,
  systemNotifications: true,
};

