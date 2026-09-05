// ============================================================================
// HTTP route tests — /api/players/:playerId/recommendations/{strings,tournaments,money}
//
// The engines have their own unit tests. What is proved HERE is the layer
// around them: who may ask (and that a refusal costs the player no data), that
// the query string is validated before anything is read, that the loader asks
// Prisma for THIS player's rows and nobody else's, and that the answer arrives
// in the { data: { version, computedAt, ... } } envelope.
//
// Money is the interesting one: strings and tournaments admit a coach through
// assertCanActOnPlayer, money does not — the owner and a consenting guardian
// only. The coach test asserts not just the 403 but that the coach-assignment
// table was never consulted, which is what proves the NARROWER path ran.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));
// The conditions service reaches out to weather/elevation APIs. Not from a test.
vi.mock("../conditions/service", () => ({ loadConditions: vi.fn() }));

import { prisma } from "../db";
import { loadConditions } from "../conditions/service";
import { recommendRouter } from "../recommend/routes";
import { asMock, bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api", recommendRouter]]);

const PLAYER = "player-1";
const COACH = "coach-1";
const GUARDIAN = "guardian-1";
const STRANGER = "stranger-1";

const STRINGS = `/api/players/${PLAYER}/recommendations/strings`;
const TOURNAMENTS = `/api/players/${PLAYER}/recommendations/tournaments`;
const MONEY = `/api/players/${PLAYER}/recommendations/money`;

/** Make assertCanActOnPlayer / assertGuardianOf resolve for exactly one relationship. */
function allowVia(relationship: "coach" | "guardian" | "none") {
  db.coachAssignment.findUnique.mockResolvedValue(relationship === "coach" ? { status: "active" } : null);
  db.connectionRequest.findFirst.mockResolvedValue(null);
  db.guardianship.findUnique.mockResolvedValue(relationship === "guardian" ? { parentalConsent: true } : null);
}

function racketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "eq-1",
    playerId: PLAYER,
    category: "racket",
    name: "Pro Staff 97 v14",
    brand: "Wilson",
    model: "Pro Staff 97 v14",
    productId: "prod-ps97",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    product: {
      id: "prod-ps97",
      racketSpec: {
        stringPatternMains: 16,
        stringPatternCrosses: 19,
        stiffnessRa: 66,
        recommendedTensionMinKg: 22.5,
        recommendedTensionMaxKg: 27,
      },
    },
    ...overrides,
  };
}

function setupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ss-1",
    playerId: PLAYER,
    racketItemId: "eq-1",
    strungAt: new Date("2026-05-07T00:00:00.000Z"),
    retiredAt: new Date("2026-05-21T00:00:00.000Z"),
    retiredReason: "broke",
    hoursPlayed: 14,
    tensionMainsKg: 23,
    mainsCustomName: null,
    mains: { brand: "Luxilon", model: "ALU Power" },
    ...overrides,
  };
}

function stringProduct(id: string, material: string, gaugeMm: number, ratings: Partial<Record<"comfort" | "durability" | "spin" | "control" | "power", number>> = {}) {
  return {
    id,
    brand: "Brand",
    model: id,
    stringSpec: { material, gaugeMm, shape: "round", power: 5, control: 7, spin: 6, comfort: 6, durability: 7, ...ratings },
  };
}

/** Every loader query answers "nothing" unless a test says otherwise. */
function stubEmptyPlayer() {
  db.user.findUnique.mockResolvedValue({ dateOfBirth: null });
  db.playerProfile.findUnique.mockResolvedValue(null);
  db.stringSetup.findFirst.mockResolvedValue(null);
  db.stringSetup.findMany.mockResolvedValue([]);
  db.equipmentItem.findFirst.mockResolvedValue(null);
  db.playerTournament.findFirst.mockResolvedValue(null);
  db.playerTournament.findMany.mockResolvedValue([]);
  db.equipmentProduct.findMany.mockResolvedValue([]);
  db.tournament.findMany.mockResolvedValue([]);
  db.hiddenTournament.findMany.mockResolvedValue([]);
  db.calendarEvent.findMany.mockResolvedValue([]);
  db.training.findMany.mockResolvedValue([]);
  db.financeEntry.findMany.mockResolvedValue([]);
  asMock(loadConditions).mockResolvedValue(null);
}

/** p1-shaped: one racket, three jobs, a small string catalogue. */
function stubP1Strings() {
  stubEmptyPlayer();
  db.playerProfile.findUnique.mockResolvedValue({
    dateOfBirth: null,
    playingLevel: "Advanced",
    ranking: null,
    preferredSurface: "hard",
    injuryRestrictions: null,
    physicalLimitations: [],
    styleAggression: 6,
    suitClay: null,
    suitHard: null,
    suitGrass: null,
    suitIndoor: null,
  });
  db.stringSetup.findFirst.mockResolvedValue({ racketItemId: "eq-1" });
  db.equipmentItem.findFirst.mockResolvedValue(racketRow());
  db.stringSetup.findMany.mockResolvedValue([
    setupRow(),
    setupRow({ id: "ss-2", strungAt: new Date("2026-05-27T00:00:00.000Z"), retiredAt: new Date("2026-07-04T00:00:00.000Z"), retiredReason: "dead", hoursPlayed: 22, tensionMainsKg: 22, mains: { brand: "Head", model: "Lynx Tour" } }),
    setupRow({ id: "ss-3", strungAt: new Date("2026-08-23T00:00:00.000Z"), retiredAt: null, retiredReason: null, hoursPlayed: 6, tensionMainsKg: 22.5, mains: { brand: "Solinco", model: "Hyper-G" } }),
  ]);
  db.equipmentProduct.findMany.mockResolvedValue([
    stringProduct("str-copoly-soft", "co_polyester", 1.25, { comfort: 7, control: 8 }),
    stringProduct("str-copoly-thick", "co_polyester", 1.3, { durability: 9 }),
    stringProduct("str-multi", "multifilament", 1.3, { comfort: 9 }),
    stringProduct("str-poly", "polyester", 1.25, { durability: 9 }),
  ]);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── strings ─────────────────────────────────────────────────────────────────
describe("GET /api/players/:playerId/recommendations/strings", () => {
  it("401s an unauthenticated caller and reads nothing", async () => {
    const res = await request(app).get(STRINGS);
    expect(res.status).toBe(401);
    expect(db.equipmentItem.findFirst).not.toHaveBeenCalled();
    expect(db.stringSetup.findMany).not.toHaveBeenCalled();
  });

  it("lets the OWNER read a versioned, timestamped recommendation built from their own rows", async () => {
    stubP1Strings();
    const res = await request(app).get(STRINGS).set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.version).toBe("v1");
    expect(Date.parse(d.computedAt)).not.toBeNaN();
    expect(d.racketItemId).toBe("eq-1");
    expect(d.material.material).toBe("co_polyester");
    expect(d.tension.racketBandKg).toEqual([22.5, 27]);
    expect(d.tension.anchoredTo).toBe("history");
    expect(d.confidence.level).toBe("medium");
    expect(d.cautions).toEqual([]);
    expect(d.pickFromCatalogue.productIds.length).toBeGreaterThan(0);
    // The frame chosen was the most recently strung one, looked up as THIS player's.
    expect(firstCallArg(db.stringSetup.findFirst)).toMatchObject({ where: { playerId: PLAYER }, orderBy: { strungAt: "desc" } });
    expect(firstCallArg(db.equipmentItem.findFirst)).toMatchObject({ where: { id: "eq-1", playerId: PLAYER } });
    // Only that frame's jobs feed the history.
    expect(firstCallArg(db.stringSetup.findMany)).toMatchObject({ where: { playerId: PLAYER, racketItemId: "eq-1" } });
    // Catalogue slice: active strings only.
    expect(firstCallArg(db.equipmentProduct.findMany)).toMatchObject({ where: { category: "string", isActive: true } });
  });

  it("lets an ACTIVELY ASSIGNED coach read it", async () => {
    allowVia("coach");
    stubP1Strings();
    const res = await request(app).get(STRINGS).set("Authorization", bearer(COACH));
    expect(res.status).toBe(200);
    expect(res.body.data.material).toBeDefined();
  });

  it("lets a CONSENTED guardian read it", async () => {
    allowVia("guardian");
    stubP1Strings();
    const res = await request(app).get(STRINGS).set("Authorization", bearer(GUARDIAN));
    expect(res.status).toBe(200);
  });

  it("403s a stranger BEFORE reading a single row of the player's bag or history", async () => {
    allowVia("none");
    stubP1Strings();
    const res = await request(app).get(STRINGS).set("Authorization", bearer(STRANGER));
    expect(res.status).toBe(403);
    expect(db.equipmentItem.findFirst).not.toHaveBeenCalled();
    expect(db.stringSetup.findFirst).not.toHaveBeenCalled();
    expect(db.stringSetup.findMany).not.toHaveBeenCalled();
    expect(db.playerProfile.findUnique).not.toHaveBeenCalled();
  });

  it("400s a bad priority before any authorization or data read", async () => {
    stubP1Strings();
    const res = await request(app).get(`${STRINGS}?priority=maximum`).set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(400);
    expect(db.equipmentItem.findFirst).not.toHaveBeenCalled();
  });

  it("reads the plain-question booleans literally — 'false' is false, not a truthy string", async () => {
    stubP1Strings();
    const no = await request(app).get(`${STRINGS}?breaksOften=false&wantsArmComfort=false`).set("Authorization", bearer(PLAYER));
    expect(no.status).toBe(200);
    const noCodes = no.body.data.reasons.map((r: { code: string }) => r.code);
    expect(noCodes).not.toContain("breaker_declared");
    expect(noCodes).not.toContain("comfort_requested");

    stubP1Strings();
    const yes = await request(app).get(`${STRINGS}?breaksOften=true`).set("Authorization", bearer(PLAYER));
    const yesCodes = yes.body.data.reasons.map((r: { code: string }) => r.code);
    expect(yesCodes).toContain("breaker_declared");
    expect(yesCodes).toContain("gauge_thicker_for_breaks");
    expect(yesCodes).toContain("breaker_no_tension_increase");
  });

  it("400s a boolean that is neither 'true' nor 'false'", async () => {
    stubP1Strings();
    const res = await request(app).get(`${STRINGS}?wantsMoreSpin=yes`).set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(400);
  });

  it("404s with a plain message when the player has no racket at all", async () => {
    stubEmptyPlayer();
    const res = await request(app).get(STRINGS).set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Add a racket/);
    // It looked for the last-strung frame, then for any racket in the bag.
    expect(firstCallArg(db.equipmentItem.findFirst)).toMatchObject({ where: { playerId: PLAYER, category: "racket" } });
  });

  it("404s a racketItemId that is not in THIS player's equipment, and asks for it scoped to the player", async () => {
    stubEmptyPlayer();
    const res = await request(app).get(`${STRINGS}?racketItemId=eq-someone-else`).set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not in this player's equipment/);
    expect(firstCallArg(db.equipmentItem.findFirst)).toMatchObject({ where: { id: "eq-someone-else", playerId: PLAYER } });
    // Nothing else was loaded for a frame that does not exist.
    expect(db.stringSetup.findMany).not.toHaveBeenCalled();
  });

  it("runs with the band unknown, says so, and lowers confidence when the racket has no catalogue link", async () => {
    stubP1Strings();
    db.equipmentItem.findFirst.mockResolvedValue(racketRow({ productId: null, product: null }));
    const res = await request(app).get(STRINGS).set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.tension.racketBandKg).toBeNull();
    expect(d.reasons.map((r: { code: string }) => r.code)).toContain("band_unknown");
    expect(d.confidence.level).toBe("low");
    expect(d.confidence.raisedBy).toMatch(/Link your racket/);
    // 0×0 pattern from a missing spec fires neither pattern rule.
    const codes = d.reasons.map((r: { code: string }) => r.code);
    expect(codes).not.toContain("pattern_open");
    expect(codes).not.toContain("pattern_dense");
  });

  it("asks the shared conditions service about the next entered tournament, and passes null physics through honestly", async () => {
    stubP1Strings();
    db.playerTournament.findFirst.mockResolvedValue({
      tournamentId: "t-next",
      tournament: { name: "Autumn Open", startDate: new Date("2026-10-10T00:00:00.000Z") },
    });
    asMock(loadConditions).mockResolvedValue({ physics: null });
    const res = await request(app).get(STRINGS).set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    expect(asMock(loadConditions)).toHaveBeenCalledWith(expect.anything(), "t-next");
    // Only upcoming, non-withdrawn entries qualify as "the next tournament".
    expect(firstCallArg(db.playerTournament.findFirst)).toMatchObject({
      where: { playerId: PLAYER, status: { not: "withdrawn" } },
      orderBy: { tournament: { startDate: "asc" } },
    });
    const codes = res.body.data.reasons.map((r: { code: string }) => r.code);
    expect(codes).toContain("conditions_unavailable");
  });

  it("emits exactly one caution when the profile mentions an injury, and never carries the text", async () => {
    stubP1Strings();
    db.playerProfile.findUnique.mockResolvedValue({
      dateOfBirth: null,
      playingLevel: "Advanced",
      ranking: null,
      preferredSurface: null,
      injuryRestrictions: "tennis elbow flare-ups",
      physicalLimitations: [],
      styleAggression: null,
      suitClay: null,
      suitHard: null,
      suitGrass: null,
      suitIndoor: null,
    });
    const res = await request(app).get(STRINGS).set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(200);
    expect(res.body.data.cautions).toHaveLength(1);
    expect(res.body.data.cautions[0].code).toBe("seek_qualified_assessment");
    expect(JSON.stringify(res.body)).not.toMatch(/elbow|flare/i);
  });
});

// ── tournaments ─────────────────────────────────────────────────────────────
describe("GET /api/players/:playerId/recommendations/tournaments", () => {
  function tournamentRow(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      name: `Event ${id}`,
      city: "Madrid",
      country: "Spain",
      surface: "clay",
      indoorOutdoor: "outdoor",
      level: null,
      category: null,
      federation: null,
      ageCategory: null,
      startDate: new Date("2026-10-10T00:00:00.000Z"),
      endDate: new Date("2026-10-12T00:00:00.000Z"),
      entryDeadline: null,
      latitude: null,
      longitude: null,
      utrRangeMin: null,
      utrRangeMax: null,
      ...overrides,
    };
  }

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get(TOURNAMENTS);
    expect(res.status).toBe(401);
    expect(db.tournament.findMany).not.toHaveBeenCalled();
  });

  it("lets the OWNER read it; defaults the horizon to 90 days and asks only for events that start inside it", async () => {
    stubEmptyPlayer();
    db.tournament.findMany.mockResolvedValue([tournamentRow("t-a"), tournamentRow("t-b", { ageCategory: "12 & Under" })]);
    const before = Date.now();
    const res = await request(app).get(TOURNAMENTS).set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.version).toBe("v1");
    expect(d.top.map((t: { tournamentId: string }) => t.tournamentId).sort()).toEqual(["t-a", "t-b"]);
    expect(d.totals).toMatchObject({ candidates: 2, scored: 2, hidden: 0 });
    expect(d.reasonsGlobal.map((r: { code: string }) => r.code)).toContain("origin_unknown");

    const where = firstCallArg<{ where: { startDate: { gte: Date; lte: Date } } }>(db.tournament.findMany).where;
    const spanDays = (where.startDate.lte.getTime() - where.startDate.gte.getTime()) / 86_400_000;
    expect(spanDays).toBe(90);
    expect(where.startDate.gte.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("honours horizonDays and rejects a nonsense one before reading", async () => {
    stubEmptyPlayer();
    await request(app).get(`${TOURNAMENTS}?horizonDays=30`).set("Authorization", bearer(PLAYER));
    const where = firstCallArg<{ where: { startDate: { gte: Date; lte: Date } } }>(db.tournament.findMany).where;
    expect((where.startDate.lte.getTime() - where.startDate.gte.getTime()) / 86_400_000).toBe(30);

    vi.resetAllMocks();
    stubEmptyPlayer();
    const bad = await request(app).get(`${TOURNAMENTS}?horizonDays=0`).set("Authorization", bearer(PLAYER));
    expect(bad.status).toBe(400);
    expect(db.tournament.findMany).not.toHaveBeenCalled();
  });

  it("lets a coach read it, and uses the PLAYER's hidden list and entries — not the coach's", async () => {
    allowVia("coach");
    stubEmptyPlayer();
    db.tournament.findMany.mockResolvedValue([tournamentRow("t-a"), tournamentRow("t-hid")]);
    db.hiddenTournament.findMany.mockResolvedValue([{ tournamentId: "t-hid" }]);
    const res = await request(app).get(TOURNAMENTS).set("Authorization", bearer(COACH));

    expect(res.status).toBe(200);
    expect(firstCallArg(db.hiddenTournament.findMany)).toMatchObject({ where: { userId: PLAYER } });
    expect(firstCallArg(db.playerTournament.findMany)).toMatchObject({ where: { playerId: PLAYER } });
    expect(firstCallArg(db.training.findMany)).toMatchObject({ where: { participants: { some: { playerId: PLAYER } } } });
    expect(res.body.data.hidden).toEqual([expect.objectContaining({ tournamentId: "t-hid", code: "hidden_by_you" })]);
  });

  it("lets a CONSENTED guardian read it", async () => {
    allowVia("guardian");
    stubEmptyPlayer();
    const res = await request(app).get(TOURNAMENTS).set("Authorization", bearer(GUARDIAN));
    expect(res.status).toBe(200);
  });

  it("403s a stranger before reading any tournament, entry or finance row", async () => {
    allowVia("none");
    stubEmptyPlayer();
    const res = await request(app).get(TOURNAMENTS).set("Authorization", bearer(STRANGER));
    expect(res.status).toBe(403);
    expect(db.tournament.findMany).not.toHaveBeenCalled();
    expect(db.playerTournament.findMany).not.toHaveBeenCalled();
    expect(db.financeEntry.findMany).not.toHaveBeenCalled();
  });

  it("hands the engine an already-entered event as busy AND as entered, so it is hidden with 'already_entered'", async () => {
    stubEmptyPlayer();
    db.tournament.findMany.mockResolvedValue([tournamentRow("t-in")]);
    db.playerTournament.findMany.mockResolvedValue([
      { tournamentId: "t-in", tournament: { name: "Event t-in", startDate: new Date("2026-10-10T00:00:00.000Z"), endDate: new Date("2026-10-12T00:00:00.000Z") } },
    ]);
    const res = await request(app).get(TOURNAMENTS).set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(200);
    expect(res.body.data.top).toEqual([]);
    expect(res.body.data.hidden[0]).toMatchObject({ tournamentId: "t-in", code: "already_entered" });
  });
});

// ── money ───────────────────────────────────────────────────────────────────
describe("GET /api/players/:playerId/recommendations/money", () => {
  function stubP1Money() {
    stubEmptyPlayer();
    db.financeEntry.findMany.mockResolvedValue([
      { id: "fin-1", category: "training", amount: 800, currency: "USD", date: "2026-07-01", tournamentId: null },
      { id: "fin-4", category: "stringing", amount: 28, currency: "EUR", date: "2026-08-23", tournamentId: null },
      { id: "fin-5", category: "tournament_fee", amount: 95, currency: "EUR", date: "2026-08-30", tournamentId: "ao-2026" },
    ]);
    db.playerTournament.findMany.mockResolvedValue([
      { tournamentId: "ao-2026", status: "registered", tournament: { name: "Australian Open", startDate: new Date("2026-01-19T00:00:00.000Z"), endDate: new Date("2026-02-01T00:00:00.000Z") } },
    ]);
    db.stringSetup.findMany.mockResolvedValue([{ id: "ss-1", strungAt: new Date("2026-05-07T00:00:00.000Z"), retiredAt: new Date("2026-05-21T00:00:00.000Z"), hoursPlayed: 14, costEur: null }]);
  }

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get(MONEY);
    expect(res.status).toBe(401);
    expect(db.financeEntry.findMany).not.toHaveBeenCalled();
  });

  it("lets the OWNER read it, per currency, over a month by default, from THEIR rows only", async () => {
    stubP1Money();
    const res = await request(app).get(MONEY).set("Authorization", bearer(PLAYER));

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.version).toBe("v1");
    expect(d.window.kind).toBe("month");
    expect(d.window.days).toBe(30);
    expect(d.insights.length).toBeLessThanOrEqual(3);
    // The AO fee is attributed to the January event by id even though it was logged in August.
    expect(d.tournaments).toEqual([expect.objectContaining({ tournamentId: "ao-2026", matched: { byTournamentId: 1, byDateWindow: 0 } })]);
    expect(firstCallArg(db.financeEntry.findMany)).toMatchObject({ where: { playerId: PLAYER } });
    expect(firstCallArg(db.stringSetup.findMany)).toMatchObject({ where: { playerId: PLAYER } });
    expect(firstCallArg(db.training.findMany)).toMatchObject({ where: { participants: { some: { playerId: PLAYER } } } });
    // Whatever the window, no figure ever adds USD to EUR.
    expect(JSON.stringify(d)).not.toContain("923"); // 800 + 28 + 95
  });

  it("honours window=year and rejects a bad window before reading", async () => {
    stubP1Money();
    const res = await request(app).get(`${MONEY}?window=year`).set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(200);
    expect(res.body.data.window.days).toBe(365);

    vi.resetAllMocks();
    stubP1Money();
    const bad = await request(app).get(`${MONEY}?window=decade`).set("Authorization", bearer(PLAYER));
    expect(bad.status).toBe(400);
    expect(db.financeEntry.findMany).not.toHaveBeenCalled();
  });

  it("lets a CONSENTED guardian read it", async () => {
    allowVia("guardian");
    stubP1Money();
    const res = await request(app).get(MONEY).set("Authorization", bearer(GUARDIAN));
    expect(res.status).toBe(200);
    expect(firstCallArg(db.guardianship.findUnique)).toMatchObject({
      where: { guardianId_juniorPlayerId: { guardianId: GUARDIAN, juniorPlayerId: PLAYER } },
    });
  });

  it("403s a guardian whose consent is not recorded", async () => {
    db.guardianship.findUnique.mockResolvedValue({ parentalConsent: false });
    stubP1Money();
    const res = await request(app).get(MONEY).set("Authorization", bearer(GUARDIAN));
    expect(res.status).toBe(403);
    expect(db.financeEntry.findMany).not.toHaveBeenCalled();
  });

  it("403s an ACTIVELY ASSIGNED coach — and never even consults the coach-assignment table", async () => {
    allowVia("coach");
    stubP1Money();
    const res = await request(app).get(MONEY).set("Authorization", bearer(COACH));

    expect(res.status).toBe(403);
    // The proof that the NARROWER check ran: the ladder that admits coaches
    // (coach assignment, connection) was never asked. Only guardianship was.
    expect(db.coachAssignment.findUnique).not.toHaveBeenCalled();
    expect(db.connectionRequest.findFirst).not.toHaveBeenCalled();
    expect(db.guardianship.findUnique).toHaveBeenCalled();
    expect(db.financeEntry.findMany).not.toHaveBeenCalled();
  });

  it("403s a stranger before reading a single finance row", async () => {
    allowVia("none");
    stubP1Money();
    const res = await request(app).get(MONEY).set("Authorization", bearer(STRANGER));
    expect(res.status).toBe(403);
    expect(db.financeEntry.findMany).not.toHaveBeenCalled();
    expect(db.stringSetup.findMany).not.toHaveBeenCalled();
  });

  it("returns a graceful empty result with low confidence for a player with nothing logged", async () => {
    stubEmptyPlayer();
    const res = await request(app).get(MONEY).set("Authorization", bearer(PLAYER));
    expect(res.status).toBe(200);
    expect(res.body.data.headline).toBeNull();
    expect(res.body.data.insights).toEqual([]);
    expect(res.body.data.confidence.level).toBe("low");
    expect(res.body.data.confidence.raisedBy).toMatch(/Log your expenses/);
  });
});
