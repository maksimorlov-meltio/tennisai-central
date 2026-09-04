// ============================================================================
// HTTP route tests — /api/players/:playerId/finance
//
// The category vocabulary grew and the currency default changed. Both are
// meant to be ADDITIVE, and "additive" is a claim about the old values still
// working — so that is what these assert, alongside the new ones.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { financeRouter } from "../finance/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api", financeRouter]]);

const OWNER = "player-1";
const OTHER = "player-2";

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fin-1",
    playerId: OWNER,
    category: "stringing",
    description: "Restring",
    amount: 28,
    currency: "EUR",
    date: "2026-08-23",
    tournamentId: null,
    createdAt: new Date("2026-08-23T00:00:00.000Z"),
    ...overrides,
  };
}

const base = { description: "x", amount: 10, date: "2026-08-01" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/players/:playerId/finance — categories", () => {
  it.each(["training", "travel", "tournament", "equipment"])(
    "still accepts the original category %s",
    async (category) => {
      db.financeEntry.create.mockResolvedValue(entryRow({ category }));
      const res = await request(app)
        .post(`/api/players/${OWNER}/finance`)
        .set("Authorization", bearer(OWNER))
        .send({ ...base, category });
      expect(res.status).toBe(201);
    },
  );

  it.each(["coaching", "stringing", "tournament_fee", "accommodation", "food", "membership", "other"])(
    "accepts the new category %s",
    async (category) => {
      db.financeEntry.create.mockResolvedValue(entryRow({ category }));
      const res = await request(app)
        .post(`/api/players/${OWNER}/finance`)
        .set("Authorization", bearer(OWNER))
        .send({ ...base, category });
      expect(res.status).toBe(201);
      expect(firstCallArg<{ data: { category: string } }>(db.financeEntry.create).data.category).toBe(category);
    },
  );

  it("400s a category outside the vocabulary", async () => {
    const res = await request(app)
      .post(`/api/players/${OWNER}/finance`)
      .set("Authorization", bearer(OWNER))
      .send({ ...base, category: "yacht" });
    expect(res.status).toBe(400);
    expect(db.financeEntry.create).not.toHaveBeenCalled();
  });

  it("defaults an unspecified currency to EUR, matching the column default", async () => {
    db.financeEntry.create.mockResolvedValue(entryRow());
    await request(app)
      .post(`/api/players/${OWNER}/finance`)
      .set("Authorization", bearer(OWNER))
      .send({ ...base, category: "stringing" });

    expect(firstCallArg<{ data: { currency: string } }>(db.financeEntry.create).data.currency).toBe("EUR");
  });

  it("still honours an explicit currency, so a USD cost can still be recorded as USD", async () => {
    db.financeEntry.create.mockResolvedValue(entryRow({ currency: "USD" }));
    await request(app)
      .post(`/api/players/${OWNER}/finance`)
      .set("Authorization", bearer(OWNER))
      .send({ ...base, category: "travel", currency: "USD" });

    expect(firstCallArg<{ data: { currency: string } }>(db.financeEntry.create).data.currency).toBe("USD");
  });
});

describe("tournamentId", () => {
  it("round-trips a tournamentId through create and back out of the response", async () => {
    db.tournament.findUnique.mockResolvedValue({ id: "australian-open-2026" });
    db.financeEntry.create.mockResolvedValue(entryRow({ tournamentId: "australian-open-2026" }));

    const res = await request(app)
      .post(`/api/players/${OWNER}/finance`)
      .set("Authorization", bearer(OWNER))
      .send({ ...base, category: "tournament_fee", tournamentId: "australian-open-2026" });

    expect(res.status).toBe(201);
    expect(firstCallArg<{ data: { tournamentId: string } }>(db.financeEntry.create).data.tournamentId).toBe(
      "australian-open-2026",
    );
    expect(res.body.data.tournamentId).toBe("australian-open-2026");
  });

  it("400s an unknown tournament instead of letting a foreign-key error surface as a 500", async () => {
    db.tournament.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/players/${OWNER}/finance`)
      .set("Authorization", bearer(OWNER))
      .send({ ...base, category: "tournament_fee", tournamentId: "no-such-event" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Unknown tournament");
    expect(db.financeEntry.create).not.toHaveBeenCalled();
  });

  it("omits tournamentId from the response when the entry has none", async () => {
    db.financeEntry.create.mockResolvedValue(entryRow());
    const res = await request(app)
      .post(`/api/players/${OWNER}/finance`)
      .set("Authorization", bearer(OWNER))
      .send({ ...base, category: "food" });
    expect(res.body.data.tournamentId).toBeUndefined();
  });
});

describe("PATCH /api/finance/:id", () => {
  it("updates the owner's entry", async () => {
    db.financeEntry.findUnique.mockResolvedValue(entryRow());
    db.financeEntry.update.mockResolvedValue(entryRow({ amount: 35 }));

    const res = await request(app)
      .patch("/api/finance/fin-1")
      .set("Authorization", bearer(OWNER))
      .send({ amount: 35 });

    expect(res.status).toBe(200);
    expect(firstCallArg(db.financeEntry.update)).toEqual({ where: { id: "fin-1" }, data: { amount: 35 } });
  });

  it("403s a DIFFERENT user and does not update", async () => {
    db.financeEntry.findUnique.mockResolvedValue(entryRow());
    const res = await request(app)
      .patch("/api/finance/fin-1")
      .set("Authorization", bearer(OTHER))
      .send({ amount: 35 });

    expect(res.status).toBe(403);
    expect(db.financeEntry.update).not.toHaveBeenCalled();
  });

  it("404s an entry that does not exist", async () => {
    db.financeEntry.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch("/api/finance/nope")
      .set("Authorization", bearer(OWNER))
      .send({ amount: 1 });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/players/:playerId/finance/summary", () => {
  it("reports the new categories in byCategory rather than hiding them", async () => {
    db.financeEntry.findMany.mockResolvedValue([
      entryRow({ category: "training", amount: 800 }),
      entryRow({ id: "f2", category: "stringing", amount: 28 }),
      entryRow({ id: "f3", category: "tournament_fee", amount: 95 }),
    ]);

    const res = await request(app)
      .get(`/api/players/${OWNER}/finance/summary`)
      .set("Authorization", bearer(OWNER));

    // The four original totals are untouched, so the existing frontend keeps working…
    expect(res.body.data.totalTraining).toBe(800);
    // …and the money it cannot see is now reported alongside them.
    expect(res.body.data.byCategory.stringing).toBe(28);
    expect(res.body.data.byCategory.tournament_fee).toBe(95);
    expect(res.body.data.total).toBe(923);
  });

  it("403s another user's summary and reads nothing", async () => {
    const res = await request(app)
      .get(`/api/players/${OWNER}/finance/summary`)
      .set("Authorization", bearer(OTHER));
    expect(res.status).toBe(403);
    expect(db.financeEntry.findMany).not.toHaveBeenCalled();
  });
});
