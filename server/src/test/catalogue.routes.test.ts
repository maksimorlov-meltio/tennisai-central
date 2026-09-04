// ============================================================================
// HTTP route tests — /api/catalogue
//
// Asserts on what the ROUTE did: the status, and the arguments it handed to
// Prisma. A test that only checked "the mock returned two products" would pass
// with every filter silently dropped.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { catalogueRouter } from "../catalogue/routes";
import { bearer, createTestApp, firstCallArg, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/catalogue", catalogueRouter]]);

const USER = "user-1";

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    category: "racket",
    brand: "Wilson",
    model: "Pro Staff 97",
    variant: "v14",
    releaseYear: 2023,
    msrpEur: 279,
    imageUrl: null,
    source: "Manufacturer spec sheet — not fetched during seed",
    sourceUrl: "https://example.invalid/specs",
    lastVerifiedAt: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    racketSpec: { id: "rs-1", productId: "prod-1", headSizeIn2: 97 },
    stringSpec: null,
    shoeSpec: null,
    accessorySpec: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/catalogue", () => {
  it("401s an unauthenticated caller and never reads the table", async () => {
    const res = await request(app).get("/api/catalogue");
    expect(res.status).toBe(401);
    expect(db.equipmentProduct.findMany).not.toHaveBeenCalled();
    expect(db.equipmentProduct.count).not.toHaveBeenCalled();
  });

  it("returns items, total, page and pageSize, each item carrying its spec and provenance", async () => {
    db.equipmentProduct.findMany.mockResolvedValue([productRow()]);
    db.equipmentProduct.count.mockResolvedValue(1);

    const res = await request(app).get("/api/catalogue").set("Authorization", bearer(USER));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(20);
    const item = res.body.data.items[0];
    expect(item.spec).toMatchObject({ headSizeIn2: 97 });
    // Provenance travels with every product — a client cannot render one
    // without having been handed the source.
    expect(item.provenance).toEqual({
      source: "Manufacturer spec sheet — not fetched during seed",
      sourceUrl: "https://example.invalid/specs",
      lastVerifiedAt: null,
    });
  });

  it("translates query filters into the Prisma where it passes to findMany", async () => {
    db.equipmentProduct.findMany.mockResolvedValue([]);
    db.equipmentProduct.count.mockResolvedValue(0);

    await request(app)
      .get("/api/catalogue?category=racket&brand=Wilson&brand=Head&minUnstrungWeightG=300&maxUnstrungWeightG=320&targetLevel=pro")
      .set("Authorization", bearer(USER));

    expect(firstCallArg(db.equipmentProduct.findMany)).toMatchObject({
      where: {
        isActive: true,
        category: "racket",
        brand: { in: ["Wilson", "Head"] },
        racketSpec: { is: { unstrungWeightG: { gte: 300, lte: 320 }, targetLevel: { in: ["pro"] } } },
      },
    });
  });

  it("counts with the SAME where it lists with, so total cannot disagree with the page", async () => {
    db.equipmentProduct.findMany.mockResolvedValue([]);
    db.equipmentProduct.count.mockResolvedValue(0);

    await request(app).get("/api/catalogue?category=shoes&courtType=clay").set("Authorization", bearer(USER));

    const listWhere = firstCallArg<{ where: unknown }>(db.equipmentProduct.findMany).where;
    const countWhere = firstCallArg<{ where: unknown }>(db.equipmentProduct.count).where;
    expect(countWhere).toEqual(listWhere);
  });

  it("caps pageSize at 100 rather than fetching what was asked for", async () => {
    db.equipmentProduct.findMany.mockResolvedValue([]);
    db.equipmentProduct.count.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/catalogue?page=2&pageSize=5000")
      .set("Authorization", bearer(USER));

    expect(res.body.data.pageSize).toBe(100);
    expect(firstCallArg(db.equipmentProduct.findMany)).toMatchObject({ take: 100, skip: 100 });
  });

  it("400s an unknown category rather than quietly ignoring it", async () => {
    const res = await request(app).get("/api/catalogue?category=spaceship").set("Authorization", bearer(USER));
    expect(res.status).toBe(400);
    expect(db.equipmentProduct.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/catalogue/:id", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get("/api/catalogue/prod-1");
    expect(res.status).toBe(401);
    expect(db.equipmentProduct.findUnique).not.toHaveBeenCalled();
  });

  it("returns the product with its spec", async () => {
    db.equipmentProduct.findUnique.mockResolvedValue(productRow());
    const res = await request(app).get("/api/catalogue/prod-1").set("Authorization", bearer(USER));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("prod-1");
    expect(res.body.data.spec).toMatchObject({ headSizeIn2: 97 });
  });

  it("404s a missing product", async () => {
    db.equipmentProduct.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/catalogue/nope").set("Authorization", bearer(USER));
    expect(res.status).toBe(404);
  });

  it("404s a DEACTIVATED product even though the row still exists", async () => {
    db.equipmentProduct.findUnique.mockResolvedValue(productRow({ isActive: false }));
    const res = await request(app).get("/api/catalogue/prod-1").set("Authorization", bearer(USER));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Product not found");
  });

  it("reports a stored empty variant as absent rather than as an empty string", async () => {
    db.equipmentProduct.findUnique.mockResolvedValue(productRow({ variant: "" }));
    const res = await request(app).get("/api/catalogue/prod-1").set("Authorization", bearer(USER));
    expect(res.body.data.variant).toBeUndefined();
  });
});

describe("GET /api/catalogue/facets", () => {
  // What Prisma really returns when nothing matches: the keys are present and
  // null, not absent.
  const emptyAgg = {
    _min: { headSizeIn2: null, unstrungWeightG: null, balanceMm: null, stiffnessRa: null, recommendedTensionMinKg: null, gaugeMm: null, weightG: null },
    _max: { headSizeIn2: null, unstrungWeightG: null, balanceMm: null, stiffnessRa: null, recommendedTensionMaxKg: null, gaugeMm: null, weightG: null },
  };

  function stubFacets() {
    db.equipmentProduct.groupBy.mockResolvedValue([{ brand: "Wilson", _count: { _all: 3 } }]);
    db.stringSpec.groupBy.mockResolvedValue([{ material: "polyester", _count: { _all: 2 } }]);
    db.shoeSpec.groupBy.mockResolvedValue([{ courtType: "clay", _count: { _all: 1 } }]);
    db.racketSpec.groupBy.mockResolvedValue([{ targetLevel: "pro", _count: { _all: 4 } }]);
    db.racketSpec.aggregate.mockResolvedValue({
      _min: { headSizeIn2: 95, unstrungWeightG: 300, balanceMm: 310, stiffnessRa: 66, recommendedTensionMinKg: 20.5 },
      _max: { headSizeIn2: 100, unstrungWeightG: 320, balanceMm: 320, stiffnessRa: 72, recommendedTensionMaxKg: 27 },
    });
    db.stringSpec.aggregate.mockResolvedValue({
      _min: { gaugeMm: 1.2, recommendedTensionMinKg: 21 },
      _max: { gaugeMm: 1.3, recommendedTensionMaxKg: 27 },
    });
    db.shoeSpec.aggregate.mockResolvedValue({ _min: { weightG: 300 }, _max: { weightG: 400 } });
  }

  it("401s an unauthenticated caller", async () => {
    const res = await request(app).get("/api/catalogue/facets");
    expect(res.status).toBe(401);
    expect(db.equipmentProduct.groupBy).not.toHaveBeenCalled();
  });

  it("aggregates IN THE DATABASE — groupBy/aggregate, never findMany over the table", async () => {
    stubFacets();
    const res = await request(app).get("/api/catalogue/facets").set("Authorization", bearer(USER));

    expect(res.status).toBe(200);
    expect(db.equipmentProduct.groupBy).toHaveBeenCalled();
    expect(db.racketSpec.aggregate).toHaveBeenCalled();
    // The whole point: no route to loading every product into JS to count it.
    expect(db.equipmentProduct.findMany).not.toHaveBeenCalled();
  });

  it("returns counts per facet value and min/max per numeric range", async () => {
    stubFacets();
    const res = await request(app).get("/api/catalogue/facets").set("Authorization", bearer(USER));

    expect(res.body.data.facets.brand).toEqual([{ value: "Wilson", count: 3 }]);
    expect(res.body.data.facets.material).toEqual([{ value: "polyester", count: 2 }]);
    expect(res.body.data.facets.targetLevel).toEqual([{ value: "pro", count: 4 }]);
    expect(res.body.data.ranges.headSizeIn2).toEqual({ min: 95, max: 100 });
    expect(res.body.data.ranges.weightG).toEqual({ min: 300, max: 400 });
    // Tension spans BOTH spec tables: the widest window either publishes.
    expect(res.body.data.ranges.recommendedTensionKg).toEqual({ min: 20.5, max: 27 });
  });

  it("applies the current filter to the spec aggregations too, not only to products", async () => {
    stubFacets();
    await request(app).get("/api/catalogue/facets?brand=Wilson").set("Authorization", bearer(USER));

    const specArg = firstCallArg<{ where: { product: { brand: unknown } } }>(db.racketSpec.aggregate);
    expect(specArg.where.product).toMatchObject({ isActive: true, brand: { in: ["Wilson"] } });
  });

  it("reports nulls, not zeros, for a range with no matching rows", async () => {
    db.equipmentProduct.groupBy.mockResolvedValue([]);
    db.stringSpec.groupBy.mockResolvedValue([]);
    db.shoeSpec.groupBy.mockResolvedValue([]);
    db.racketSpec.groupBy.mockResolvedValue([]);
    db.racketSpec.aggregate.mockResolvedValue(emptyAgg);
    db.stringSpec.aggregate.mockResolvedValue(emptyAgg);
    db.shoeSpec.aggregate.mockResolvedValue(emptyAgg);

    const res = await request(app).get("/api/catalogue/facets?q=zzzz").set("Authorization", bearer(USER));
    // 0 would read as "the lightest racket weighs nothing".
    expect(res.body.data.ranges.unstrungWeightG).toEqual({ min: null, max: null });
    expect(res.body.data.ranges.recommendedTensionKg).toEqual({ min: null, max: null });
  });
});
