// ============================================================================
// TennisAI — catalogue query builder
//
// Pure functions: filters in, Prisma `where` / `orderBy` / page size out. No
// Prisma client, no Express, no I/O — so the translation from a query string to
// a database filter is unit-testable on its own, which is the part that
// silently returns the wrong products when it is wrong.
// ============================================================================

import type { Prisma } from "@prisma/client";

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export type CatalogueSort = "relevance" | "weight" | "price" | "newest";

/** A `min`/`max` pair. Either half may be absent. */
export type Range = { min?: number; max?: number };

export type CatalogueFilters = {
  category?: string;
  /** Repeatable — `?brand=Wilson&brand=Head` is an OR across brands. */
  brand?: string[];
  /** Free text over brand / model / variant, case-insensitive. */
  q?: string;

  // Numeric ranges. Each is scoped to the spec table that owns the column, so
  // filtering on head size cannot accidentally match a shoe.
  headSizeIn2?: Range;
  unstrungWeightG?: Range;
  balanceMm?: Range;
  stiffnessRa?: Range;
  gaugeMm?: Range;
  /** OVERLAP, not containment — see buildWhere. */
  recommendedTensionKg?: Range;
  weightG?: Range;

  // Select facets.
  material?: string[];
  shape?: string[];
  courtType?: string[];
  widthFit?: string[];
  targetLevel?: string[];

  sort?: CatalogueSort;
  page?: number;
  pageSize?: number;
};

/** `{ gte, lte }`, or undefined when the range is empty. */
function num(range?: Range): Prisma.IntFilter | Prisma.FloatFilter | undefined {
  if (!range) return undefined;
  const filter: { gte?: number; lte?: number } = {};
  if (range.min !== undefined) filter.gte = range.min;
  if (range.max !== undefined) filter.lte = range.max;
  return Object.keys(filter).length ? filter : undefined;
}

function inList(values?: string[]): { in: string[] } | undefined {
  return values && values.length ? { in: values } : undefined;
}

/** Drop undefined values so an empty object is recognisably empty. */
function compact<T extends Record<string, unknown>>(obj: T): T | undefined {
  const out = Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(out).length ? out : undefined;
}

/**
 * A tension range OVERLAPS the product's recommended range — it does not have
 * to contain it. A player asking for "something I can string at 23 kg" wants
 * every frame whose 23–27 kg window includes that, not only frames whose whole
 * window sits inside their filter.
 */
function tensionOverlap(range?: Range): Record<string, unknown> | undefined {
  if (!range) return undefined;
  const filter: Record<string, unknown> = {};
  if (range.max !== undefined) filter.recommendedTensionMinKg = { lte: range.max };
  if (range.min !== undefined) filter.recommendedTensionMaxKg = { gte: range.min };
  return Object.keys(filter).length ? filter : undefined;
}

/**
 * Translate filters into a Prisma `where`. ALWAYS pins `isActive: true` — a
 * discontinued product stays readable by id (so existing links resolve) but
 * must never appear in a listing.
 */
export function buildWhere(f: CatalogueFilters): Prisma.EquipmentProductWhereInput {
  const where: Prisma.EquipmentProductWhereInput = { isActive: true };

  if (f.category) where.category = f.category;
  const brands = inList(f.brand);
  if (brands) where.brand = brands;

  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const };
    where.OR = [{ brand: contains }, { model: contains }, { variant: contains }];
  }

  const tension = tensionOverlap(f.recommendedTensionKg);

  // Racket-owned columns.
  const racket = compact({
    headSizeIn2: num(f.headSizeIn2),
    unstrungWeightG: num(f.unstrungWeightG),
    balanceMm: num(f.balanceMm),
    stiffnessRa: num(f.stiffnessRa),
    targetLevel: inList(f.targetLevel),
  });

  // String-owned columns.
  const string = compact({
    gaugeMm: num(f.gaugeMm),
    material: inList(f.material),
    shape: inList(f.shape),
  });

  // Shoe-owned columns.
  const shoe = compact({
    weightG: num(f.weightG),
    courtType: inList(f.courtType),
    widthFit: inList(f.widthFit),
  });

  // Recommended tension exists on BOTH racket and string specs. Scope it to the
  // one the caller asked for; with no category, a product matches if either of
  // its specs overlaps, which is the only answer that is not silently wrong.
  const tensionOnRacket = tension && (f.category === "racket" || f.category === undefined);
  const tensionOnString = tension && (f.category === "string" || f.category === undefined);
  const tensionIsAmbiguous = tension && f.category === undefined;

  const racketIs = { ...(racket ?? {}), ...(tensionOnRacket && !tensionIsAmbiguous ? tension : {}) };
  const stringIs = { ...(string ?? {}), ...(tensionOnString && !tensionIsAmbiguous ? tension : {}) };

  if (Object.keys(racketIs).length) where.racketSpec = { is: racketIs };
  if (Object.keys(stringIs).length) where.stringSpec = { is: stringIs };
  if (shoe) where.shoeSpec = { is: shoe };

  if (tensionIsAmbiguous) {
    // AND rather than OR at the top level, so it composes with the `q` OR
    // instead of quietly widening it.
    where.AND = [{ OR: [{ racketSpec: { is: tension } }, { stringSpec: { is: tension } }] }];
  }

  return where;
}

/**
 * Sorting.
 *
 * `weight` is CATEGORY-SCOPED: rackets sort by unstrung frame weight, shoes by
 * shoe weight. They are different columns on different tables and there is no
 * honest way to interleave them, so with `category=shoes` it means the shoe and
 * otherwise it means the frame.
 *
 * `relevance` is currently a stable alphabetical order (brand, then model). It
 * is NOT a scored ranking — there is no full-text index yet — and it is named
 * for the slot it will eventually fill rather than for a ranking that exists.
 */
export function buildOrderBy(
  sort: CatalogueSort = "relevance",
  category?: string,
): Prisma.EquipmentProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price":
      // Nulls last: a product with no published price is not the cheapest one.
      return [{ msrpEur: { sort: "asc", nulls: "last" } }, { brand: "asc" }, { model: "asc" }];
    case "newest":
      return [{ releaseYear: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
    case "weight":
      return category === "shoes"
        ? [{ shoeSpec: { weightG: "asc" } }, { brand: "asc" }]
        : [{ racketSpec: { unstrungWeightG: "asc" } }, { brand: "asc" }];
    case "relevance":
    default:
      return [{ brand: "asc" }, { model: "asc" }, { variant: "asc" }];
  }
}

/** Clamp to 1…100. A caller asking for 5000 rows gets 100, not an error. */
export function clampPageSize(pageSize?: number): number {
  if (pageSize === undefined || Number.isNaN(pageSize)) return PAGE_SIZE_DEFAULT;
  return Math.min(Math.max(Math.trunc(pageSize), 1), PAGE_SIZE_MAX);
}

/** Clamp to page 1 and up. */
export function clampPage(page?: number): number {
  if (page === undefined || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}

export function buildSkipTake(f: CatalogueFilters): { skip: number; take: number; page: number; pageSize: number } {
  const pageSize = clampPageSize(f.pageSize);
  const page = clampPage(f.page);
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}
