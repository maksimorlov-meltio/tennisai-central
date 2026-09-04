// ============================================================================
// HTTP route tests — /api/me/calendar-preferences
//
// Which tournament calendars a user has subscribed to. The behaviour worth
// pinning is that EMPTY IS A REAL CHOICE: a new account has no row and must be
// told "nothing subscribed", and a user who turns everything off must have that
// saved rather than quietly reinterpreted as "all", which is the old
// session-filter behaviour that made the calendar unreadable.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { profileRouter } from "../profile/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/me", profileRouter]]);
const USER = "user-coach";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/me/calendar-preferences", () => {
  it("says nothing is subscribed when the account has no row yet", async () => {
    // The normal state for a new account, and not an error.
    db.calendarPreference.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/me/calendar-preferences")
      .set("Authorization", bearer(USER));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ federations: [], showOwnEvents: true });
  });

  it("returns what was saved", async () => {
    db.calendarPreference.findUnique.mockResolvedValue({
      federations: ["ITF", "UTR"],
      showOwnEvents: true,
    });

    const res = await request(app)
      .get("/api/me/calendar-preferences")
      .set("Authorization", bearer(USER));

    expect(res.body.data.federations).toEqual(["ITF", "UTR"]);
  });

  it("401s an anonymous caller and never reads a row", async () => {
    const res = await request(app).get("/api/me/calendar-preferences");
    expect(res.status).toBe(401);
    expect(db.calendarPreference.findUnique).not.toHaveBeenCalled();
  });
});

describe("PUT /api/me/calendar-preferences", () => {
  it("saves a subscription against the caller, not anyone they name", async () => {
    db.calendarPreference.upsert.mockResolvedValue({
      federations: ["ITF"],
      showOwnEvents: true,
    });

    const res = await request(app)
      .put("/api/me/calendar-preferences")
      .set("Authorization", bearer(USER))
      .send({ federations: ["ITF"], userId: "somebody-else" });

    expect(res.status).toBe(200);
    const arg = firstCallArg<{ where: { userId: string }; create: { userId: string } }>(
      db.calendarPreference.upsert,
    );
    expect(arg.where.userId).toBe(USER);
    expect(arg.create.userId).toBe(USER);
  });

  it("SAVES an empty set rather than treating it as 'everything'", async () => {
    // Turning every calendar off is a deliberate choice — it means "just my
    // sessions" — and reinterpreting it as "all" is the old behaviour that
    // buried a coach's week under 1,458 tournaments.
    db.calendarPreference.upsert.mockResolvedValue({ federations: [], showOwnEvents: true });

    const res = await request(app)
      .put("/api/me/calendar-preferences")
      .set("Authorization", bearer(USER))
      .send({ federations: [] });

    expect(res.status).toBe(200);
    const arg = firstCallArg<{ update: { federations: string[] } }>(db.calendarPreference.upsert);
    expect(arg.update.federations).toEqual([]);
    expect(res.body.data.federations).toEqual([]);
  });

  it("de-duplicates, so a repeated value cannot grow the column", async () => {
    db.calendarPreference.upsert.mockResolvedValue({ federations: ["ITF"], showOwnEvents: true });

    await request(app)
      .put("/api/me/calendar-preferences")
      .set("Authorization", bearer(USER))
      .send({ federations: ["ITF", "ITF", "ITF"] });

    const arg = firstCallArg<{ update: { federations: string[] } }>(db.calendarPreference.upsert);
    expect(arg.update.federations).toEqual(["ITF"]);
  });

  it("accepts ITF Junior, which is a circuit rather than a federation", async () => {
    // The client splits ITF's junior events out from the pro tour, and that
    // split is the single most useful subscription for a junior coach — 256
    // events against ITF's 0. The enum rejected it until this test existed.
    db.calendarPreference.upsert.mockResolvedValue({
      federations: ["ITF Junior"],
      showOwnEvents: true,
    });

    const res = await request(app)
      .put("/api/me/calendar-preferences")
      .set("Authorization", bearer(USER))
      .send({ federations: ["ITF Junior"] });

    expect(res.status).toBe(200);
  });

  it("400s an unknown federation instead of storing it", async () => {
    const res = await request(app)
      .put("/api/me/calendar-preferences")
      .set("Authorization", bearer(USER))
      .send({ federations: ["ITF", "NOT_A_TOUR"] });

    expect(res.status).toBe(400);
    expect(db.calendarPreference.upsert).not.toHaveBeenCalled();
  });

  it("leaves showOwnEvents alone when the client does not mention it", async () => {
    // A client toggling one federation must not silently switch the user's own
    // sessions back on.
    db.calendarPreference.upsert.mockResolvedValue({ federations: ["UTR"], showOwnEvents: false });

    await request(app)
      .put("/api/me/calendar-preferences")
      .set("Authorization", bearer(USER))
      .send({ federations: ["UTR"] });

    const arg = firstCallArg<{ update: Record<string, unknown> }>(db.calendarPreference.upsert);
    expect(arg.update).not.toHaveProperty("showOwnEvents");
  });

  it("401s an anonymous caller and writes nothing", async () => {
    const res = await request(app)
      .put("/api/me/calendar-preferences")
      .send({ federations: ["ITF"] });

    expect(res.status).toBe(401);
    expect(db.calendarPreference.upsert).not.toHaveBeenCalled();
  });
});
