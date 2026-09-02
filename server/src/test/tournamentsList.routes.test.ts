// ============================================================================
// GET /api/tournaments — how much of the catalog one request returns.
//
// The route returned every row. That was fine at 26 curated events and is not
// at 3,278 live ones: 1.13 MB and four seconds on every calendar and tournaments
// page load, measured against production.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { tournamentsRouter } from "../tournaments/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/tournaments", tournamentsRouter]]);
const USER = "user-coach";

type FindManyArgs = {
  where: { startDate: { lte: Date }; endDate: { gte: Date } };
  take: number;
};

beforeEach(() => {
  vi.resetAllMocks();
  db.tournament.findMany.mockResolvedValue([]);
});

describe("GET /api/tournaments", () => {
  it("returns a season either side by default, not the whole catalog", async () => {
    const res = await request(app).get("/api/tournaments").set("Authorization", bearer(USER));
    expect(res.status).toBe(200);

    const arg = firstCallArg<FindManyArgs>(db.tournament.findMany);
    const daysBack = (Date.now() - arg.where.endDate.gte.getTime()) / 86_400_000;
    const daysAhead = (arg.where.startDate.lte.getTime() - Date.now()) / 86_400_000;

    expect(daysBack).toBeGreaterThan(59);
    expect(daysAhead).toBeGreaterThan(364);
  });

  it("still includes an event that started before the window and is running", async () => {
    // A fortnight-long tournament in its second week is current, not past, so
    // the overlap is tested rather than only the start date.
    await request(app).get("/api/tournaments").set("Authorization", bearer(USER));

    const arg = firstCallArg<FindManyArgs>(db.tournament.findMany);
    expect(arg.where.startDate).toHaveProperty("lte");
    expect(arg.where.endDate).toHaveProperty("gte");
  });

  it("caps the number of rows even with no range given", async () => {
    await request(app).get("/api/tournaments").set("Authorization", bearer(USER));
    expect(firstCallArg<FindManyArgs>(db.tournament.findMany).take).toBeLessThanOrEqual(2000);
  });

  it("honours an explicit range and limit", async () => {
    await request(app)
      .get("/api/tournaments?from=2027-01-01&to=2027-03-01&limit=50")
      .set("Authorization", bearer(USER));

    const arg = firstCallArg<FindManyArgs>(db.tournament.findMany);
    expect(arg.where.startDate.lte.toISOString()).toContain("2027-03-01");
    expect(arg.take).toBe(50);
  });

  it("refuses a limit above the ceiling rather than honouring it", async () => {
    const res = await request(app)
      .get("/api/tournaments?limit=999999")
      .set("Authorization", bearer(USER));
    expect(res.status).toBe(400);
  });

  it("falls back to the default window when the dates are nonsense", async () => {
    await request(app).get("/api/tournaments?from=banana").set("Authorization", bearer(USER));

    const arg = firstCallArg<FindManyArgs>(db.tournament.findMany);
    const daysBack = (Date.now() - arg.where.endDate.gte.getTime()) / 86_400_000;
    expect(daysBack).toBeGreaterThan(59);
  });

  it("401s an anonymous caller and never touches the catalog", async () => {
    const res = await request(app).get("/api/tournaments");
    expect(res.status).toBe(401);
    expect(db.tournament.findMany).not.toHaveBeenCalled();
  });
});
