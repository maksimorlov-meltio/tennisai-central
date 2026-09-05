// ============================================================================
// Unit tests — catalogue filter → Prisma `where` translation.
//
// This is the layer that silently returns the wrong products when it is wrong:
// a filter dropped here does not throw, it just widens the result set, and
// nothing downstream can tell the difference. So the assertions are on the
// EXACT `where` object, not on "some rows came back".
// ============================================================================

import { describe, it, expect } from "vitest";
import { buildOrderBy, buildSkipTake, buildWhere, clampPage, clampPageSize, PAGE_SIZE_MAX } from "./query";

describe("buildWhere", () => {
  it("always pins isActive:true, so a retired product can never appear in a listing", () => {
    expect(buildWhere({})).toEqual({ isActive: true });
  });

  it("passes category through and turns repeated brands into an IN", () => {
    expect(buildWhere({ category: "racket", brand: ["Wilson", "Head"] })).toEqual({
      isActive: true,
      category: "racket",
      brand: { in: ["Wilson", "Head"] },
    });
  });

  it("searches brand, model and variant case-insensitively for q", () => {
    const where = buildWhere({ q: "blade" });
    expect(where.OR).toEqual([
      { brand: { contains: "blade", mode: "insensitive" } },
      { model: { contains: "blade", mode: "insensitive" } },
      { variant: { contains: "blade", mode: "insensitive" } },
    ]);
  });

  it("scopes racket-owned ranges to racketSpec and never to another spec table", () => {
    const where = buildWhere({ headSizeIn2: { min: 95, max: 100 }, unstrungWeightG: { min: 300 } });
    expect(where.racketSpec).toEqual({
      is: { headSizeIn2: { gte: 95, lte: 100 }, unstrungWeightG: { gte: 300 } },
    });
    expect(where.stringSpec).toBeUndefined();
    expect(where.shoeSpec).toBeUndefined();
  });

  it("scopes gauge to stringSpec and shoe weight to shoeSpec", () => {
    expect(buildWhere({ gaugeMm: { max: 1.25 } }).stringSpec).toEqual({ is: { gaugeMm: { lte: 1.25 } } });
    expect(buildWhere({ weightG: { min: 300, max: 400 } }).shoeSpec).toEqual({
      is: { weightG: { gte: 300, lte: 400 } },
    });
  });

  it("puts select facets on the spec table that owns them", () => {
    const where = buildWhere({
      material: ["polyester"],
      shape: ["hexagonal"],
      courtType: ["clay"],
      widthFit: ["wide"],
      targetLevel: ["pro"],
    });
    expect(where.stringSpec).toEqual({ is: { material: { in: ["polyester"] }, shape: { in: ["hexagonal"] } } });
    expect(where.shoeSpec).toEqual({ is: { courtType: { in: ["clay"] }, widthFit: { in: ["wide"] } } });
    expect(where.racketSpec).toEqual({ is: { targetLevel: { in: ["pro"] } } });
  });

  it("treats a tension filter as an OVERLAP, not containment", () => {
    // Asking for 23 kg must match a frame recommended 23–27, whose window is
    // NOT contained in [23,23].
    const where = buildWhere({ category: "racket", recommendedTensionKg: { min: 23, max: 23 } });
    expect(where.racketSpec).toEqual({
      is: { recommendedTensionMinKg: { lte: 23 }, recommendedTensionMaxKg: { gte: 23 } },
    });
  });

  it("scopes the tension overlap to strings when the category is string", () => {
    const where = buildWhere({ category: "string", recommendedTensionKg: { min: 22 } });
    expect(where.stringSpec).toEqual({ is: { recommendedTensionMaxKg: { gte: 22 } } });
    expect(where.racketSpec).toBeUndefined();
  });

  it("matches EITHER spec when a tension filter is given with no category", () => {
    const where = buildWhere({ recommendedTensionKg: { min: 24, max: 24 } });
    const overlap = { recommendedTensionMinKg: { lte: 24 }, recommendedTensionMaxKg: { gte: 24 } };
    expect(where.AND).toEqual([{ OR: [{ racketSpec: { is: overlap } }, { stringSpec: { is: overlap } }] }]);
    // …and does NOT collapse it onto one table, which would drop half the matches.
    expect(where.racketSpec).toBeUndefined();
    expect(where.stringSpec).toBeUndefined();
  });

  it("keeps the q OR and the tension AND separate so neither widens the other", () => {
    const where = buildWhere({ q: "alu", recommendedTensionKg: { min: 22 } });
    expect(where.OR).toHaveLength(3);
    expect(where.AND).toHaveLength(1);
  });

  it("combines a range and a facet on the same spec into one `is`", () => {
    const where = buildWhere({ category: "racket", unstrungWeightG: { min: 300 }, targetLevel: ["pro", "advanced"] });
    expect(where.racketSpec).toEqual({
      is: { unstrungWeightG: { gte: 300 }, targetLevel: { in: ["pro", "advanced"] } },
    });
  });

  it("ignores empty brand lists and empty ranges rather than emitting a filter that matches nothing", () => {
    expect(buildWhere({ brand: [], headSizeIn2: {} })).toEqual({ isActive: true });
  });
});

describe("buildOrderBy", () => {
  it("sorts price ascending with unpriced products LAST", () => {
    expect(buildOrderBy("price")[0]).toEqual({ msrpEur: { sort: "asc", nulls: "last" } });
  });

  it("sorts newest by release year descending, undated products last", () => {
    expect(buildOrderBy("newest")).toEqual([
      { releaseYear: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
  });

  it("scopes `weight` to the spec table the category actually has", () => {
    expect(buildOrderBy("weight", "shoes")[0]).toEqual({ shoeSpec: { weightG: "asc" } });
    expect(buildOrderBy("weight", "racket")[0]).toEqual({ racketSpec: { unstrungWeightG: "asc" } });
    // No category → the frame, which is what "weight" means for a racket shop.
    expect(buildOrderBy("weight")[0]).toEqual({ racketSpec: { unstrungWeightG: "asc" } });
  });

  it("defaults to the stable alphabetical order", () => {
    expect(buildOrderBy()).toEqual([{ brand: "asc" }, { model: "asc" }, { variant: "asc" }]);
  });
});

describe("paging", () => {
  it("caps pageSize at 100 instead of honouring a huge request", () => {
    expect(clampPageSize(5000)).toBe(PAGE_SIZE_MAX);
    expect(clampPageSize(100)).toBe(100);
    expect(clampPageSize(101)).toBe(100);
  });

  it("floors pageSize at 1 and page at 1", () => {
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(-9)).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-3)).toBe(1);
  });

  it("defaults to page 1 / 20 per page when nothing is asked for", () => {
    expect(buildSkipTake({})).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });

  it("computes skip from the CLAMPED page size, not the requested one", () => {
    expect(buildSkipTake({ page: 3, pageSize: 5000 })).toEqual({ skip: 200, take: 100, page: 3, pageSize: 100 });
  });
});
