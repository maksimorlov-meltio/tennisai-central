import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { importTournaments, tournamentSlug } from "../src/tournaments/feed";
import { importDrills } from "../src/library/importDrills";
import { validateContent } from "../src/library/validate";

const prisma = new PrismaClient();

// Demo accounts. IDs are pinned to match the front-end mock data
// (equipment, finance, etc. are keyed on p1 / c1 / …), so the seeded
// dashboard keeps working after auth becomes real.
const DEMO_USERS = [
  { id: "p1", email: "player@test.com", publicId: "TAI-P-001", role: "player", firstName: "Alex", lastName: "Rivera" },
  { id: "c1", email: "coach@test.com", publicId: "TAI-C-001", role: "coach", firstName: "Jordan", lastName: "Smith" },
  { id: "o1", email: "observer@test.com", publicId: "TAI-F-001", role: "observer", firstName: "Morgan", lastName: "Lee" },
  { id: "a1", email: "admin@test.com", publicId: "TAI-A-001", role: "admin", firstName: "Admin", lastName: "User" },
];

// A couple of demo trainings for coach c1 with player p1 as participant, so the
// Trainings page shows real DB-backed data for the demo logins.
const now = new Date();
const day = (offset: number, hour: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const DEMO_TRAININGS = [
  {
    id: "t-seed-1",
    title: "Serve & Volley Fundamentals",
    trainingType: "individual",
    coachId: "c1",
    startDate: day(1, 9),
    endDate: day(1, 11),
    location: "Center Court",
    goal: "Sharpen first-serve placement and net approach",
    intensity: "high",
  },
  {
    id: "t-seed-2",
    title: "Baseline Consistency Drill",
    trainingType: "fitness",
    coachId: "c1",
    startDate: day(3, 16),
    endDate: day(3, 17),
    location: "Court 3",
    goal: "20-ball rally consistency under fatigue",
    intensity: "medium",
  },
];

// The tournament catalog itself is populated from the curated real-world dataset
// via importTournaments (see src/tournaments/feed + src/tournaments/data/dataset),
// so every seeded tournament carries real host-city coordinates. Rows use a
// deterministic slug id (name + start year), so we reference two of them here for
// player p1's demo entries. `tournamentSlug` guarantees these ids match the rows
// importTournaments writes.
const AO_2026_ID = tournamentSlug("Australian Open", "2026-01-19T00:00:00.000Z"); // australian-open-2026
const WIMBLEDON_2026_ID = tournamentSlug("Wimbledon", "2026-06-29T00:00:00.000Z"); // wimbledon-2026

// Demo tournament entries for player p1.
const DEMO_PLAYER_TOURNAMENTS = [
  { id: "pt1", tournamentId: AO_2026_ID, playerId: "p1", status: "registered" },
  { id: "pt2", tournamentId: WIMBLEDON_2026_ID, playerId: "p1", status: "planned" },
];

// Demo team (coach c1 → player p1) and an active connection between them.
const DEMO_TEAMS = [{ id: "team-1", name: "Rising Stars", coachId: "c1", memberIds: ["p1"] }];
const DEMO_CONNECTIONS = [
  { id: "conn-1", fromUserId: "c1", toUserId: "p1", status: "active" },
];

// A pending request (p1 → c1) and a confirmed calendar event.
const DEMO_TRAINING_REQUESTS = [
  {
    id: "treq-1",
    playerId: "p1",
    coachId: "c1",
    status: "pending",
    preferredDate: "2026-07-25",
    preferredStartTime: "10:00",
    preferredEndTime: "11:30",
    trainingType: "individual",
    location: "Court 2",
    priority: "normal",
  },
];
const DEMO_CALENDAR_EVENTS = [
  {
    id: "cal-1",
    title: "Training: Alex Rivera",
    type: "training",
    state: "confirmed",
    startDate: "2026-07-22T09:00:00Z",
    endDate: "2026-07-22T10:30:00Z",
    playerId: "p1",
    playerName: "Alex Rivera",
    createdBy: "c1",
    createdByRole: "coach",
  },
];

// Finance / equipment / notifications for player p1.
const DEMO_FINANCE = [
  { id: "fin-1", playerId: "p1", category: "training", description: "Monthly coaching", amount: 800, currency: "USD", date: "2026-07-01" },
  { id: "fin-2", playerId: "p1", category: "travel", description: "Flight to Melbourne", amount: 640, currency: "USD", date: "2026-07-05" },
  { id: "fin-3", playerId: "p1", category: "equipment", description: "New racket", amount: 220, currency: "USD", date: "2026-07-10" },
];
const DEMO_EQUIPMENT = [
  { id: "eq-1", playerId: "p1", category: "racket", name: "Pro Staff 97", brand: "Wilson", model: "v14", condition: "good", acquiredDate: "2026-01-15" },
  { id: "eq-2", playerId: "p1", category: "shoes", name: "Court FF 3", brand: "Asics", condition: "new", acquiredDate: "2026-06-20" },
];
const DEMO_NOTIFICATIONS = [
  { id: "notif-1", userId: "p1", type: "training_request_approved", title: "Training Request Approved", message: "Your individual request for 2026-07-22 was approved", read: false, linkTo: "/calendar" },
];

// ── Roles & tenancy (Stage 2) + analytics (Stage 1) demo rows ─────
// Pinned ids aligned with the demo users (c1 / p1 / o1) so the coach→player
// and parent→junior authz paths (server/src/authz.ts) resolve for the demo
// logins. All rows use idempotent upserts on their natural unique keys.
const DEMO_ACADEMY = { id: "acad-1", name: "Center Court Academy" };

// role = role WITHIN the academy (admin | coach | player). c1 both coaches and
// administers the academy; p1 is a player; o1 (parent/observer) belongs to the
// academy for tenancy but is deliberately NOT "player" (admin reads filter on
// role:"player", so o1 must not be counted as a readable player).
const DEMO_ACADEMY_MEMBERSHIPS = [
  { id: "am-c1", academyId: "acad-1", userId: "c1", role: "admin" },
  { id: "am-p1", academyId: "acad-1", userId: "p1", role: "player" },
  { id: "am-o1", academyId: "acad-1", userId: "o1", role: "observer" },
];

// coach c1 → player p1 (active): powers the coach→player authz path.
const DEMO_COACH_ASSIGNMENTS = [
  { id: "ca-c1-p1", coachId: "c1", playerId: "p1", status: "active" },
];

// parent o1 → junior p1 with recorded consent: powers the parent→junior path.
const DEMO_GUARDIANSHIPS = [
  { id: "guard-o1-p1", guardianId: "o1", juniorPlayerId: "p1", parentalConsent: true, consentAt: now },
];

// Free subscription owned by the coach, scoped to the academy.
const DEMO_SUBSCRIPTIONS = [
  { id: "sub-c1", ownerUserId: "c1", academyId: "acad-1", tier: "free" as const, status: "active" },
];

// Opponent scouting records (owned by coach c1, within the academy).
const DEMO_OPPONENTS = [
  { id: "opp-seed-1", ownerId: "c1", academyId: "acad-1", firstName: "Sam", lastName: "Becker", dominantHand: "right", backhandType: "two_handed", preferredSurface: "hard" },
  { id: "opp-seed-2", ownerId: "c1", academyId: "acad-1", firstName: "Chris", lastName: "Dubois", dominantHand: "left", backhandType: "one_handed", preferredSurface: "clay" },
];

// Matches for player p1 (raw counts only — percentages are computed on read).
const DEMO_MATCHES = [
  {
    id: "match-seed-1",
    playerId: "p1",
    opponentId: "opp-seed-1",
    academyId: "acad-1",
    date: day(-7, 14),
    competition: "Club Championship R1",
    surface: "hard",
    indoorOutdoor: "outdoor",
    format: "best_of_3",
    result: "win",
    scoreSets: [{ player: 6, opponent: 4 }, { player: 6, opponent: 3 }],
    firstServeAttempts: 60, firstServesIn: 39, firstServePointsWon: 30,
    secondServePlayed: 21, secondServePointsWon: 11, aces: 5, doubleFaults: 3,
    winners: 22, unforcedErrors: 18,
    createdBy: "c1",
  },
  {
    id: "match-seed-2",
    playerId: "p1",
    opponentId: "opp-seed-2",
    academyId: "acad-1",
    date: day(-2, 11),
    competition: "Club Championship QF",
    surface: "clay",
    indoorOutdoor: "outdoor",
    format: "best_of_3",
    result: "loss",
    scoreSets: [{ player: 4, opponent: 6 }, { player: 6, opponent: 7, tiebreak: "5-7" }],
    firstServeAttempts: 71, firstServesIn: 42, firstServePointsWon: 27,
    secondServePlayed: 29, secondServePointsWon: 12, aces: 3, doubleFaults: 6,
    winners: 19, unforcedErrors: 27,
    createdBy: "c1",
  },
];

/**
 * Whether this run is allowed to write demo data.
 *
 * The demo accounts share one publicly-documented password, so seeding a
 * production database would hand anyone who reads this repo four working
 * logins — one of them `admin`. Production therefore refuses by default and
 * has to be opted in explicitly with SEED_ON_BOOT=true.
 *
 * The guard lives here rather than in the deploy blueprint's start command so
 * it holds no matter how the seed is invoked — `npm run prisma:seed`,
 * `db:setup`, a one-off shell on the host, or a future platform's hook.
 */
function seedingAllowed(): { ok: boolean; reason?: string } {
  if (process.env.NODE_ENV !== "production") return { ok: true };
  if (process.env.SEED_ON_BOOT === "true") return { ok: true };
  return {
    ok: false,
    reason:
      "NODE_ENV=production and SEED_ON_BOOT is not \"true\" — refusing to write demo accounts. " +
      "Set SEED_ON_BOOT=true only if you really want the shared-password demo logins in this database.",
  };
}

// The default session shape. Shares sum to 100; the assembler turns them into
// minutes for whatever total the coach asks for.
const DEFAULT_SESSION_TEMPLATE = {
  name: "Standard session",
  levelBands: ["beginner", "intermediate", "advanced", "high_performance"],
  blocks: [
    { kind: "warmup", sharePct: 15, minMin: 8, maxMin: 20 },
    { kind: "technical", sharePct: 30, minMin: 10, maxMin: 40 },
    { kind: "tactical", sharePct: 25, minMin: 10, maxMin: 35 },
    { kind: "live", sharePct: 20, minMin: 8, maxMin: 30 },
    { kind: "cooldown", sharePct: 10, minMin: 5, maxMin: 15 },
  ],
};

async function main() {
  const allowed = seedingAllowed();
  if (!allowed.ok) {
    console.log(`⏭️  Seed skipped: ${allowed.reason}`);
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 12);

  // Mark demo users as consented (Terms accepted + age confirmed) so they look
  // like real, fully-onboarded signups. Columns are additive + nullable.
  const consentAt = now;
  for (const u of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { firstName: u.firstName, lastName: u.lastName, role: u.role, termsAcceptedAt: consentAt, ageConfirmedAt: consentAt },
      create: { ...u, passwordHash, emailVerified: true, termsAcceptedAt: consentAt, ageConfirmedAt: consentAt },
    });
  }

  for (const t of DEMO_TRAININGS) {
    await prisma.training.upsert({
      where: { id: t.id },
      update: { title: t.title, startDate: t.startDate, endDate: t.endDate },
      create: {
        ...t,
        participants: { create: [{ playerId: "p1" }] },
      },
    });
  }

  // Populate the tournament catalog from the curated real-world dataset (slug
  // ids + coordinates) via the same importTournaments the admin route uses.
  // Idempotent — re-seeding updates rows in place.
  const tournamentImport = await importTournaments(prisma);

  for (const pt of DEMO_PLAYER_TOURNAMENTS) {
    await prisma.playerTournament.upsert({
      where: { tournamentId_playerId: { tournamentId: pt.tournamentId, playerId: pt.playerId } },
      update: { status: pt.status },
      create: pt,
    });
  }

  for (const t of DEMO_TEAMS) {
    await prisma.team.upsert({
      where: { id: t.id },
      update: { name: t.name },
      create: { id: t.id, name: t.name, coachId: t.coachId },
    });
    for (const playerId of t.memberIds) {
      await prisma.teamMember.upsert({
        where: { teamId_playerId: { teamId: t.id, playerId } },
        update: {},
        create: { teamId: t.id, playerId },
      });
    }
  }

  for (const c of DEMO_CONNECTIONS) {
    await prisma.connectionRequest.upsert({
      where: { fromUserId_toUserId: { fromUserId: c.fromUserId, toUserId: c.toUserId } },
      update: { status: c.status },
      create: c,
    });
  }

  for (const tr of DEMO_TRAINING_REQUESTS) {
    await prisma.trainingRequest.upsert({ where: { id: tr.id }, update: { status: tr.status }, create: tr });
  }

  for (const ev of DEMO_CALENDAR_EVENTS) {
    const { startDate, endDate, ...rest } = ev;
    const values = { ...rest, startDate: new Date(startDate), endDate: new Date(endDate) };
    await prisma.calendarEvent.upsert({ where: { id: ev.id }, update: values, create: values });
  }

  for (const f of DEMO_FINANCE) {
    await prisma.financeEntry.upsert({ where: { id: f.id }, update: { amount: f.amount }, create: f });
  }
  for (const e of DEMO_EQUIPMENT) {
    await prisma.equipmentItem.upsert({ where: { id: e.id }, update: { name: e.name }, create: e });
  }
  for (const n of DEMO_NOTIFICATIONS) {
    await prisma.notification.upsert({ where: { id: n.id }, update: { title: n.title }, create: n });
  }

  // ── Roles & tenancy + analytics demo rows ──────────────────────
  await prisma.academy.upsert({
    where: { id: DEMO_ACADEMY.id },
    update: { name: DEMO_ACADEMY.name },
    create: DEMO_ACADEMY,
  });

  for (const m of DEMO_ACADEMY_MEMBERSHIPS) {
    await prisma.academyMembership.upsert({
      where: { academyId_userId: { academyId: m.academyId, userId: m.userId } },
      update: { role: m.role },
      create: m,
    });
  }

  for (const ca of DEMO_COACH_ASSIGNMENTS) {
    await prisma.coachAssignment.upsert({
      where: { coachId_playerId: { coachId: ca.coachId, playerId: ca.playerId } },
      update: { status: ca.status },
      create: ca,
    });
  }

  for (const g of DEMO_GUARDIANSHIPS) {
    await prisma.guardianship.upsert({
      where: { guardianId_juniorPlayerId: { guardianId: g.guardianId, juniorPlayerId: g.juniorPlayerId } },
      update: { parentalConsent: g.parentalConsent, consentAt: g.consentAt },
      create: g,
    });
  }

  for (const s of DEMO_SUBSCRIPTIONS) {
    await prisma.subscription.upsert({
      where: { ownerUserId: s.ownerUserId },
      update: { tier: s.tier, status: s.status, academyId: s.academyId },
      create: s,
    });
  }

  for (const o of DEMO_OPPONENTS) {
    await prisma.opponent.upsert({
      where: { id: o.id },
      update: { firstName: o.firstName, lastName: o.lastName },
      create: o,
    });
  }

  for (const m of DEMO_MATCHES) {
    await prisma.match.upsert({
      where: { id: m.id },
      update: { result: m.result, date: m.date },
      create: m,
    });
  }

  console.log(`✅ Seeded ${DEMO_USERS.length} demo users (password: password123):`);
  DEMO_USERS.forEach((u) => console.log(`   • ${u.email} (${u.role})`));
  console.log(`✅ Seeded ${DEMO_TRAININGS.length} demo trainings for coach c1 / player p1.`);
  console.log(`✅ Imported ${tournamentImport.imported} tournaments (source: ${tournamentImport.source}, with coordinates) + ${DEMO_PLAYER_TOURNAMENTS.length} entries for p1.`);
  console.log(`✅ Seeded ${DEMO_TEAMS.length} team + ${DEMO_CONNECTIONS.length} connection.`);
  console.log(`✅ Seeded ${DEMO_TRAINING_REQUESTS.length} training request + ${DEMO_CALENDAR_EVENTS.length} calendar event.`);
  console.log(`✅ Seeded ${DEMO_FINANCE.length} finance + ${DEMO_EQUIPMENT.length} equipment + ${DEMO_NOTIFICATIONS.length} notification for p1.`);
  console.log(`✅ Seeded 1 academy + ${DEMO_ACADEMY_MEMBERSHIPS.length} memberships + ${DEMO_COACH_ASSIGNMENTS.length} coach assignment + ${DEMO_GUARDIANSHIPS.length} guardianship (consented).`);
  console.log(`✅ Seeded ${DEMO_SUBSCRIPTIONS.length} subscription + ${DEMO_OPPONENTS.length} opponents + ${DEMO_MATCHES.length} matches for p1.`);

  // The default session shape: the five blocks in order, with the share of the
  // session each takes. Pinned id so re-seeding updates it rather than adding a
  // second "default" template — two defaults is an assembler bug waiting to be
  // written.
  await prisma.sessionTemplate.upsert({
    where: { id: "tmpl-default" },
    update: { name: DEFAULT_SESSION_TEMPLATE.name, blocks: DEFAULT_SESSION_TEMPLATE.blocks, isDefault: true },
    create: { id: "tmpl-default", ...DEFAULT_SESSION_TEMPLATE, isDefault: true },
  });
  console.log(`✅ Seeded 1 default session template (${DEFAULT_SESSION_TEMPLATE.blocks.map((b) => b.kind).join(" → ")}).`);

  // The coaching library. Reviewed drills are included so a fresh demo database
  // is not an empty library on p1 / c1's screens; invalid content refuses to
  // import rather than half-filling the table.
  const content = validateContent();
  if (content.issues.length > 0) {
    console.log(`⏭️  Library import skipped: ${content.issues.length} content problem(s) — run npm run content:validate.`);
  } else {
    const imported = await importDrills(prisma, content.drills, { includeReviewed: true });
    console.log(
      `✅ Imported ${imported.created} + updated ${imported.updated} library drills ` +
        `(${imported.unchanged} unchanged, ${imported.skipped} skipped).`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
