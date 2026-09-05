// ============================================================================
// TennisAI — recommendation loaders: Prisma rows → plain engine inputs
//
// The engines in this folder are pure; this is the only file in it that talks
// to the database. Each loader reads what one engine needs for one player and
// returns the plain input object, with every Date turned into an ISO string
// (the engines compare strings) and every nullable column turned into an
// optional. The route layer does authorization FIRST and only then calls one
// of these — nothing here checks who is asking.
//
// The live-data smoke script imports these directly, which is what lets the
// engines be run against the seeded database without a token or a server.
// ============================================================================

import type { Prisma, PrismaClient } from "@prisma/client";
import { loadConditions } from "../conditions/service";
import { deriveProfileFacts, type ProfileFacts } from "./profileFacts";
import type { MoneyInput, MoneyWindowKind } from "./money";
import type {
  CatalogueString,
  RetiredReason,
  SetupFact,
  StringMaterial,
  StringPreferences,
  StringsInput,
} from "./strings";
import type { BusyPeriod, TournamentsInput } from "./tournaments";

const iso = (d: Date) => d.toISOString();
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

// ── Profile ─────────────────────────────────────────────────────────────────

export async function loadProfileFacts(prisma: PrismaClient, playerId: string, now: string): Promise<ProfileFacts> {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: playerId }, select: { dateOfBirth: true } }),
    prisma.playerProfile.findUnique({
      where: { userId: playerId },
      select: {
        dateOfBirth: true,
        playingLevel: true,
        ranking: true,
        preferredSurface: true,
        injuryRestrictions: true,
        physicalLimitations: true,
        styleAggression: true,
        suitClay: true,
        suitHard: true,
        suitGrass: true,
        suitIndoor: true,
      },
    }),
  ]);
  return deriveProfileFacts({ user, profile }, now);
}

// ── Strings ─────────────────────────────────────────────────────────────────

export type StringsLoadResult =
  | { kind: "no_racket" }
  | { kind: "racket_not_found" }
  | { kind: "ok"; racketItemId: string; input: StringsInput };

/**
 * Which frame: the one asked for (which must belong to THIS player — an id
 * from someone else's bag is a 404, not a 403, so it confirms nothing), else
 * the most recently strung racket, else the first racket item in the bag.
 */
export async function loadStringsInput(
  prisma: PrismaClient,
  playerId: string,
  prefs: StringPreferences,
  now: string,
  racketItemId?: string,
): Promise<StringsLoadResult> {
  const RACKET_INCLUDE = { product: { include: { racketSpec: true } } } as const;

  let racket: Prisma.EquipmentItemGetPayload<{ include: typeof RACKET_INCLUDE }> | null = null;
  if (racketItemId) {
    racket = await prisma.equipmentItem.findFirst({ where: { id: racketItemId, playerId }, include: RACKET_INCLUDE });
    if (!racket) return { kind: "racket_not_found" };
  } else {
    const lastStrung = await prisma.stringSetup.findFirst({
      where: { playerId },
      orderBy: { strungAt: "desc" },
      select: { racketItemId: true },
    });
    if (lastStrung) {
      racket = await prisma.equipmentItem.findFirst({ where: { id: lastStrung.racketItemId, playerId }, include: RACKET_INCLUDE });
    }
    if (!racket) {
      racket = await prisma.equipmentItem.findFirst({
        where: { playerId, category: "racket" },
        orderBy: { createdAt: "asc" },
        include: RACKET_INCLUDE,
      });
    }
    if (!racket) return { kind: "no_racket" };
  }

  const [profile, setups, nextEntry, strings] = await Promise.all([
    loadProfileFacts(prisma, playerId, now),
    prisma.stringSetup.findMany({
      where: { playerId, racketItemId: racket.id },
      orderBy: { strungAt: "asc" },
      include: { mains: { select: { brand: true, model: true } } },
    }),
    prisma.playerTournament.findFirst({
      where: { playerId, status: { not: "withdrawn" }, tournament: { startDate: { gte: new Date(now) } } },
      orderBy: { tournament: { startDate: "asc" } },
      select: { tournamentId: true, tournament: { select: { name: true, startDate: true } } },
    }),
    prisma.equipmentProduct.findMany({
      where: { category: "string", isActive: true, stringSpec: { isNot: null } },
      include: { stringSpec: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const spec = racket.product?.racketSpec ?? null;
  const racketName = [racket.brand, racket.model].filter(Boolean).join(" ") || racket.name;

  const history: SetupFact[] = setups.map((s) => ({
    strungAt: iso(s.strungAt),
    retiredAt: s.retiredAt ? iso(s.retiredAt) : undefined,
    hoursPlayed: opt(s.hoursPlayed),
    tensionMainsKg: s.tensionMainsKg,
    retiredReason: opt(s.retiredReason) as RetiredReason | undefined,
    mainsName: s.mains ? `${s.mains.brand} ${s.mains.model}` : opt(s.mainsCustomName),
  }));

  // The shared conditions service — the same physics the match-prep endpoint
  // shows. Null physics (no coordinates, weather unavailable) is passed through
  // as null and the engine says so; nothing is invented here.
  let nextTournament: StringsInput["nextTournament"];
  if (nextEntry) {
    const conditions = await loadConditions(prisma, nextEntry.tournamentId).catch(() => null);
    nextTournament = {
      name: nextEntry.tournament.name,
      startDate: iso(nextEntry.tournament.startDate),
      physics: conditions?.physics ?? null,
    };
  }

  const catalogue: CatalogueString[] = strings
    .filter((p) => p.stringSpec)
    .map((p) => ({
      id: p.id,
      brand: p.brand,
      model: p.model,
      material: p.stringSpec!.material as StringMaterial,
      gaugeMm: p.stringSpec!.gaugeMm,
      shape: p.stringSpec!.shape,
      power: p.stringSpec!.power,
      control: p.stringSpec!.control,
      spin: p.stringSpec!.spin,
      comfort: p.stringSpec!.comfort,
      durability: p.stringSpec!.durability,
    }));

  return {
    kind: "ok",
    racketItemId: racket.id,
    input: {
      now,
      profile: {
        level: profile.level,
        ageBand: profile.ageBand,
        styleAggression: profile.styleAggression,
        preferredSurface: profile.preferredSurface,
        prefersComfort: profile.prefersComfort,
        painMentioned: profile.painMentioned,
      },
      racket: {
        name: racketName,
        // Without a linked spec the pattern is unknown; 0×0 matches neither
        // the open nor the dense rule, so neither fires.
        patternMains: spec?.stringPatternMains ?? 0,
        patternCrosses: spec?.stringPatternCrosses ?? 0,
        stiffnessRa: spec ? opt(spec.stiffnessRa) : undefined,
        bandKg: spec ? [spec.recommendedTensionMinKg, spec.recommendedTensionMaxKg] : undefined,
      },
      history,
      nextTournament,
      prefs,
      catalogue,
    },
  };
}

// ── Tournaments ─────────────────────────────────────────────────────────────

export async function loadTournamentsInput(
  prisma: PrismaClient,
  playerId: string,
  horizonDays: number,
  now: string,
): Promise<TournamentsInput> {
  const from = new Date(now);
  const to = new Date(from.getTime() + horizonDays * 86_400_000);

  const [profile, candidates, entries, userHidden, events, trainings, finance] = await Promise.all([
    loadProfileFacts(prisma, playerId, now),
    prisma.tournament.findMany({
      where: { startDate: { gte: from, lte: to } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    }),
    prisma.playerTournament.findMany({
      where: { playerId, status: { not: "withdrawn" } },
      select: { tournamentId: true, tournament: { select: { name: true, startDate: true, endDate: true } } },
    }),
    prisma.hiddenTournament.findMany({ where: { userId: playerId }, select: { tournamentId: true } }),
    prisma.calendarEvent.findMany({
      where: { playerId, endDate: { gte: from } },
      select: { id: true, title: true, startDate: true, endDate: true },
    }),
    prisma.training.findMany({
      where: { participants: { some: { playerId } }, endDate: { gte: from } },
      select: { id: true, title: true, startDate: true, endDate: true },
    }),
    prisma.financeEntry.findMany({
      where: { playerId },
      select: { category: true, amount: true, currency: true, tournamentId: true },
    }),
  ]);

  const busy: BusyPeriod[] = [
    ...entries.map((e) => ({
      id: e.tournamentId,
      kind: "tournament_entry" as const,
      title: e.tournament.name,
      startDate: iso(e.tournament.startDate),
      endDate: iso(e.tournament.endDate),
    })),
    ...events.map((e) => ({ id: e.id, kind: "calendar_event" as const, title: e.title, startDate: iso(e.startDate), endDate: iso(e.endDate) })),
    ...trainings.map((t) => ({ id: t.id, kind: "training" as const, title: t.title, startDate: iso(t.startDate), endDate: iso(t.endDate) })),
  ];

  return {
    now,
    horizonDays,
    profile: {
      level: profile.level,
      dateOfBirth: await dateOfBirthOf(prisma, playerId),
      utr: profile.utr,
      preferredSurface: profile.preferredSurface,
      suit: profile.suit,
    },
    // No profile field holds a home location in v1 — the engine says so and
    // scores distance as unknown. Documented in docs/recommendations.md.
    origin: undefined,
    candidates: candidates.map((t) => ({
      id: t.id,
      name: t.name,
      city: t.city,
      country: t.country,
      surface: t.surface,
      indoorOutdoor: t.indoorOutdoor,
      level: opt(t.level),
      category: opt(t.category),
      federation: opt(t.federation),
      ageCategory: opt(t.ageCategory),
      startDate: iso(t.startDate),
      endDate: iso(t.endDate),
      entryDeadline: t.entryDeadline ? iso(t.entryDeadline) : undefined,
      latitude: opt(t.latitude),
      longitude: opt(t.longitude),
      utrRangeMin: opt(t.utrRangeMin),
      utrRangeMax: opt(t.utrRangeMax),
    })),
    enteredTournamentIds: entries.map((e) => e.tournamentId),
    userHiddenIds: userHidden.map((h) => h.tournamentId),
    busy,
    finance: finance.map((f) => ({ category: f.category, amount: f.amount, currency: f.currency, tournamentId: opt(f.tournamentId) })),
  };
}

/** The tournaments engine takes the raw date so it can age the player at each event's start. */
async function dateOfBirthOf(prisma: PrismaClient, playerId: string): Promise<string | undefined> {
  const [profile, user] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId: playerId }, select: { dateOfBirth: true } }),
    prisma.user.findUnique({ where: { id: playerId }, select: { dateOfBirth: true } }),
  ]);
  return profile?.dateOfBirth ?? user?.dateOfBirth ?? undefined;
}

// ── Money ───────────────────────────────────────────────────────────────────

export async function loadMoneyInput(prisma: PrismaClient, playerId: string, window: MoneyWindowKind, now: string): Promise<MoneyInput> {
  const [entries, tournaments, setups, trainings] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { playerId },
      select: { id: true, category: true, amount: true, currency: true, date: true, tournamentId: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.playerTournament.findMany({
      where: { playerId, status: { not: "withdrawn" } },
      select: { tournamentId: true, status: true, tournament: { select: { name: true, startDate: true, endDate: true } } },
    }),
    prisma.stringSetup.findMany({
      where: { playerId },
      select: { id: true, strungAt: true, retiredAt: true, hoursPlayed: true, costEur: true },
      orderBy: { strungAt: "asc" },
    }),
    prisma.training.findMany({
      where: { participants: { some: { playerId } } },
      select: { id: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return {
    now,
    window,
    entries: entries.map((e) => ({ id: e.id, category: e.category, amount: e.amount, currency: e.currency, date: e.date, tournamentId: opt(e.tournamentId) })),
    tournaments: tournaments.map((t) => ({
      tournamentId: t.tournamentId,
      name: t.tournament.name,
      startDate: iso(t.tournament.startDate),
      endDate: iso(t.tournament.endDate),
      status: t.status,
    })),
    setups: setups.map((s) => ({
      id: s.id,
      strungAt: iso(s.strungAt),
      retiredAt: s.retiredAt ? iso(s.retiredAt) : undefined,
      hoursPlayed: opt(s.hoursPlayed),
      costEur: opt(s.costEur),
    })),
    trainings: trainings.map((t) => ({ id: t.id, startDate: iso(t.startDate), endDate: iso(t.endDate) })),
  };
}
