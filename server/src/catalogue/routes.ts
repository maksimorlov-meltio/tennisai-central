// ============================================================================
// TennisAI — gear catalogue (read) + admin CSV import (write)
//
// Mounted at /api/catalogue and /api/admin/catalogue. Every read requires a
// session; the import additionally requires the admin role.
// ============================================================================

import { Router, text as textBody } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { requireRole } from "../authz";
import {
  buildOrderBy,
  buildSkipTake,
  buildWhere,
  type CatalogueFilters,
  type CatalogueSort,
} from "./query";
import { readTable, splitList, type CsvTable } from "./csv";

export const catalogueRouter = Router();
export const adminCatalogueRouter = Router();

// Every spec relation, included on every read. There are four of them and only
// one is ever non-null per product, so this is one join per table, not a fan-out.
const SPEC_INCLUDE = {
  racketSpec: true,
  stringSpec: true,
  shoeSpec: true,
  accessorySpec: true,
} as const;

type ProductWithSpecs = {
  id: string;
  category: string;
  brand: string;
  model: string;
  variant: string;
  releaseYear: number | null;
  msrpEur: number | null;
  imageUrl: string | null;
  source: string;
  sourceUrl: string;
  lastVerifiedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  racketSpec?: unknown;
  stringSpec?: unknown;
  shoeSpec?: unknown;
  accessorySpec?: unknown;
};

/**
 * Collapse the four possible spec relations into one `spec` field, and expose
 * the provenance as a `provenance` object so a client cannot render a product
 * without having the source in hand.
 */
function present(p: ProductWithSpecs) {
  const spec = p.racketSpec ?? p.stringSpec ?? p.shoeSpec ?? p.accessorySpec ?? null;
  return {
    id: p.id,
    category: p.category,
    brand: p.brand,
    model: p.model,
    // "" is the stored value for "no variant"; the API reports it as absent.
    variant: p.variant === "" ? undefined : p.variant,
    releaseYear: p.releaseYear ?? undefined,
    msrpEur: p.msrpEur ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    provenance: {
      source: p.source,
      sourceUrl: p.sourceUrl,
      // null means "nobody has confirmed this against the source". It is sent
      // as null on purpose so a UI can say so rather than imply freshness.
      lastVerifiedAt: p.lastVerifiedAt ? p.lastVerifiedAt.toISOString() : null,
    },
    spec,
  };
}

// ── Query-string parsing ────────────────────────────────────────────────────
// Express gives repeated params as arrays and single ones as strings; zod
// normalises both to string[].
const listParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]));

const numberParam = z.coerce.number().finite().optional();

const RANGE_FIELDS = [
  "headSizeIn2",
  "unstrungWeightG",
  "balanceMm",
  "stiffnessRa",
  "gaugeMm",
  "recommendedTensionKg",
  "weightG",
] as const;

const rangeShape = Object.fromEntries(
  RANGE_FIELDS.flatMap((f) => [
    [`min${f[0].toUpperCase()}${f.slice(1)}`, numberParam],
    [`max${f[0].toUpperCase()}${f.slice(1)}`, numberParam],
  ]),
) as Record<string, typeof numberParam>;

const filterSchema = z
  .object({
    category: z.enum(["racket", "string", "shoes", "balls", "accessories"]).optional(),
    brand: listParam,
    q: z.string().trim().min(1).max(120).optional(),
    material: listParam,
    shape: listParam,
    courtType: listParam,
    widthFit: listParam,
    targetLevel: listParam,
    sort: z.enum(["relevance", "weight", "price", "newest"]).optional(),
    page: numberParam,
    pageSize: numberParam,
    ...rangeShape,
  })
  .strip();

function toFilters(query: unknown): CatalogueFilters {
  const q = filterSchema.parse(query) as Record<string, unknown>;
  const range = (field: string) => {
    const cap = `${field[0].toUpperCase()}${field.slice(1)}`;
    const min = q[`min${cap}`] as number | undefined;
    const max = q[`max${cap}`] as number | undefined;
    return min === undefined && max === undefined ? undefined : { min, max };
  };
  return {
    category: q.category as string | undefined,
    brand: q.brand as string[] | undefined,
    q: q.q as string | undefined,
    material: q.material as string[] | undefined,
    shape: q.shape as string[] | undefined,
    courtType: q.courtType as string[] | undefined,
    widthFit: q.widthFit as string[] | undefined,
    targetLevel: q.targetLevel as string[] | undefined,
    sort: q.sort as CatalogueSort | undefined,
    page: q.page as number | undefined,
    pageSize: q.pageSize as number | undefined,
    headSizeIn2: range("headSizeIn2"),
    unstrungWeightG: range("unstrungWeightG"),
    balanceMm: range("balanceMm"),
    stiffnessRa: range("stiffnessRa"),
    gaugeMm: range("gaugeMm"),
    recommendedTensionKg: range("recommendedTensionKg"),
    weightG: range("weightG"),
  };
}

// ── GET /api/catalogue ──────────────────────────────────────────────────────
catalogueRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const filters = toFilters(req.query);
    const where = buildWhere(filters);
    const { skip, take, page, pageSize } = buildSkipTake(filters);

    const [items, total] = await Promise.all([
      prisma.equipmentProduct.findMany({
        where,
        orderBy: buildOrderBy(filters.sort, filters.category),
        skip,
        take,
        include: SPEC_INCLUDE,
      }),
      prisma.equipmentProduct.count({ where }),
    ]);

    return ok(res, { items: (items as ProductWithSpecs[]).map(present), total, page, pageSize });
  }),
);

// ── GET /api/catalogue/facets ───────────────────────────────────────────────
// Counts and ranges for the CURRENT filter, aggregated in the database. The
// table is small today; loading it into JS to count it would still be the wrong
// shape, and the wrong shape is what you cannot fix later under load.
//
// Note the deliberate choice: each facet is counted under the FULL current
// filter, including that facet's own selection. So selecting "Wilson" leaves
// Wilson as the only brand shown. That is the honest count of what is on
// screen; a UI that wants the other brands greyed-in should ask for facets
// without the brand filter.
catalogueRouter.get(
  "/facets",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const filters = toFilters(req.query);
    const where = buildWhere(filters);
    const specWhere = { product: where };

    const [brands, categories, materials, shapes, courtTypes, widthFits, targetLevels, racketAgg, stringAgg, shoeAgg] =
      await Promise.all([
        prisma.equipmentProduct.groupBy({ by: ["brand"], where, _count: { _all: true }, orderBy: { brand: "asc" } }),
        prisma.equipmentProduct.groupBy({ by: ["category"], where, _count: { _all: true }, orderBy: { category: "asc" } }),
        prisma.stringSpec.groupBy({ by: ["material"], where: specWhere, _count: { _all: true }, orderBy: { material: "asc" } }),
        prisma.stringSpec.groupBy({ by: ["shape"], where: specWhere, _count: { _all: true }, orderBy: { shape: "asc" } }),
        prisma.shoeSpec.groupBy({ by: ["courtType"], where: specWhere, _count: { _all: true }, orderBy: { courtType: "asc" } }),
        prisma.shoeSpec.groupBy({ by: ["widthFit"], where: specWhere, _count: { _all: true }, orderBy: { widthFit: "asc" } }),
        prisma.racketSpec.groupBy({ by: ["targetLevel"], where: specWhere, _count: { _all: true }, orderBy: { targetLevel: "asc" } }),
        prisma.racketSpec.aggregate({
          where: specWhere,
          _min: { headSizeIn2: true, unstrungWeightG: true, balanceMm: true, stiffnessRa: true, recommendedTensionMinKg: true },
          _max: { headSizeIn2: true, unstrungWeightG: true, balanceMm: true, stiffnessRa: true, recommendedTensionMaxKg: true },
        }),
        prisma.stringSpec.aggregate({
          where: specWhere,
          _min: { gaugeMm: true, recommendedTensionMinKg: true },
          _max: { gaugeMm: true, recommendedTensionMaxKg: true },
        }),
        prisma.shoeSpec.aggregate({ where: specWhere, _min: { weightG: true }, _max: { weightG: true } }),
      ]);

    type Grouped = Array<Record<string, unknown> & { _count: { _all: number } }>;
    const counts = (rows: Grouped, key: string) =>
      rows.map((r) => ({ value: r[key] as string, count: r._count._all }));

    /** Narrowest range that covers both halves, or nulls when nothing matched. */
    const span = (mins: Array<number | null>, maxes: Array<number | null>) => {
      const lo = mins.filter((v): v is number => v !== null && v !== undefined);
      const hi = maxes.filter((v): v is number => v !== null && v !== undefined);
      return { min: lo.length ? Math.min(...lo) : null, max: hi.length ? Math.max(...hi) : null };
    };

    return ok(res, {
      facets: {
        brand: counts(brands as Grouped, "brand"),
        category: counts(categories as Grouped, "category"),
        material: counts(materials as Grouped, "material"),
        shape: counts(shapes as Grouped, "shape"),
        courtType: counts(courtTypes as Grouped, "courtType"),
        widthFit: counts(widthFits as Grouped, "widthFit"),
        targetLevel: counts(targetLevels as Grouped, "targetLevel"),
      },
      ranges: {
        headSizeIn2: { min: racketAgg._min.headSizeIn2, max: racketAgg._max.headSizeIn2 },
        unstrungWeightG: { min: racketAgg._min.unstrungWeightG, max: racketAgg._max.unstrungWeightG },
        balanceMm: { min: racketAgg._min.balanceMm, max: racketAgg._max.balanceMm },
        stiffnessRa: { min: racketAgg._min.stiffnessRa, max: racketAgg._max.stiffnessRa },
        gaugeMm: { min: stringAgg._min.gaugeMm, max: stringAgg._max.gaugeMm },
        // Spans rackets AND strings: both publish a recommended range.
        recommendedTensionKg: span(
          [racketAgg._min.recommendedTensionMinKg, stringAgg._min.recommendedTensionMinKg],
          [racketAgg._max.recommendedTensionMaxKg, stringAgg._max.recommendedTensionMaxKg],
        ),
        weightG: { min: shoeAgg._min.weightG, max: shoeAgg._max.weightG },
      },
    });
  }),
);

// ── GET /api/catalogue/:id ──────────────────────────────────────────────────
catalogueRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const product = await prisma.equipmentProduct.findUnique({
      where: { id: req.params.id },
      include: SPEC_INCLUDE,
    });
    // A retired product is a 404 on this route as well as absent from listings.
    // It stays reachable through the links that already point at it, not by
    // browsing.
    if (!product || !product.isActive) throw new HttpError(404, "Product not found");
    return ok(res, present(product as ProductWithSpecs));
  }),
);

// ── POST /api/admin/catalogue/import ────────────────────────────────────────
// CSV column spec: docs/catalogue.md.

const LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
const MATERIALS = [
  "polyester",
  "co_polyester",
  "multifilament",
  "synthetic_gut",
  "natural_gut",
  "kevlar",
  "hybrid_set",
] as const;
const SHAPES = ["round", "hexagonal", "pentagonal", "octagonal", "twisted", "textured"] as const;
const COURTS = ["clay", "hard", "all_court", "grass", "carpet", "indoor"] as const;
const WIDTHS = ["narrow", "standard", "wide"] as const;
const STABILITY = ["low", "medium", "high"] as const;

const int = z.coerce.number().int();
const float = z.coerce.number().finite();
const rating = z.coerce.number().int().min(1).max(10);

const racketCsvSchema = z.object({
  headSizeCm2: int,
  headSizeIn2: int,
  lengthCm: float,
  unstrungWeightG: int,
  strungWeightG: int.optional(),
  balanceMm: int,
  balancePtsHL: int.optional(),
  swingweight: int.optional(),
  stiffnessRa: int.optional(),
  beamMm: z.string().min(1),
  stringPatternMains: int,
  stringPatternCrosses: int,
  recommendedTensionMinKg: float,
  recommendedTensionMaxKg: float,
  composition: z.string().optional(),
  gripSizes: z.array(z.string()),
  targetLevel: z.enum(LEVELS),
});

const stringCsvSchema = z.object({
  material: z.enum(MATERIALS),
  gaugeMm: float,
  gaugeLabel: z.string().min(1),
  shape: z.enum(SHAPES),
  coating: z.string().optional(),
  colour: z.string().optional(),
  power: rating,
  control: rating,
  spin: rating,
  comfort: rating,
  durability: rating,
  tensionMaintenance: rating,
  recommendedTensionMinKg: float,
  recommendedTensionMaxKg: float,
  hybridPartnerNote: z.string().optional(),
});

const shoeCsvSchema = z.object({
  courtType: z.enum(COURTS),
  weightG: int,
  dropMm: int.optional(),
  widthFit: z.enum(WIDTHS),
  cushioning: z.string().min(1),
  stability: z.enum(STABILITY),
  outsoleGuaranteeMonths: int.optional(),
  sizesEu: z.array(z.string()),
});

const productCsvSchema = z.object({
  category: z.enum(["racket", "string", "shoes", "balls", "accessories"]),
  brand: z.string().min(1),
  model: z.string().min(1),
  variant: z.string().default(""),
  releaseYear: int.optional(),
  msrpEur: float.optional(),
  // REQUIRED on every row. A spec without a traceable origin does not go in.
  source: z.string().min(1),
  sourceUrl: z.string().url(),
  lastVerifiedAt: z.coerce.date().optional(),
});

type ImportRejection = { row: number; reason: string };

/** First zod issue, rendered as one readable sentence. */
function zodReason(err: z.ZodError): string {
  const issue = err.issues[0];
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export async function importCatalogueCsv(
  table: CsvTable,
): Promise<{ imported: number; updated: number; rejected: ImportRejection[] }> {
  let imported = 0;
  let updated = 0;
  const rejected: ImportRejection[] = [];

  for (const row of table.rows) {
    try {
      const base = productCsvSchema.parse({
        category: row.get("category"),
        brand: row.get("brand"),
        model: row.get("model"),
        variant: row.get("variant") ?? "",
        releaseYear: row.get("releaseYear"),
        msrpEur: row.get("msrpEur"),
        source: row.get("source"),
        sourceUrl: row.get("sourceUrl"),
        lastVerifiedAt: row.get("lastVerifiedAt"),
      });

      // An image URL is accepted ONLY when the row explicitly asserts the image
      // is licensed. Absent that column the field is dropped, silently and on
      // purpose — the safe outcome for a copyright question is no image.
      const licensed = (row.get("licensed") ?? "").toLowerCase() === "true";
      const imageUrl = licensed ? (row.get("imageUrl") ?? null) : null;

      let specRelation: string;
      let specData: Record<string, unknown>;

      if (base.category === "racket") {
        specRelation = "racketSpec";
        specData = racketCsvSchema.parse({
          headSizeCm2: row.get("headSizeCm2"),
          headSizeIn2: row.get("headSizeIn2"),
          lengthCm: row.get("lengthCm"),
          unstrungWeightG: row.get("unstrungWeightG"),
          strungWeightG: row.get("strungWeightG"),
          balanceMm: row.get("balanceMm"),
          balancePtsHL: row.get("balancePtsHL"),
          swingweight: row.get("swingweight"),
          stiffnessRa: row.get("stiffnessRa"),
          beamMm: row.get("beamMm"),
          stringPatternMains: row.get("stringPatternMains"),
          stringPatternCrosses: row.get("stringPatternCrosses"),
          recommendedTensionMinKg: row.get("recommendedTensionMinKg"),
          recommendedTensionMaxKg: row.get("recommendedTensionMaxKg"),
          composition: row.get("composition"),
          gripSizes: splitList(row.get("gripSizes")),
          targetLevel: row.get("targetLevel"),
        });
      } else if (base.category === "string") {
        specRelation = "stringSpec";
        specData = stringCsvSchema.parse({
          material: row.get("material"),
          gaugeMm: row.get("gaugeMm"),
          gaugeLabel: row.get("gaugeLabel"),
          shape: row.get("shape"),
          coating: row.get("coating"),
          colour: row.get("colour"),
          power: row.get("power"),
          control: row.get("control"),
          spin: row.get("spin"),
          comfort: row.get("comfort"),
          durability: row.get("durability"),
          tensionMaintenance: row.get("tensionMaintenance"),
          recommendedTensionMinKg: row.get("recommendedTensionMinKg"),
          recommendedTensionMaxKg: row.get("recommendedTensionMaxKg"),
          hybridPartnerNote: row.get("hybridPartnerNote"),
        });
      } else if (base.category === "shoes") {
        specRelation = "shoeSpec";
        specData = shoeCsvSchema.parse({
          courtType: row.get("courtType"),
          weightG: row.get("weightG"),
          dropMm: row.get("dropMm"),
          widthFit: row.get("widthFit"),
          cushioning: row.get("cushioning"),
          stability: row.get("stability"),
          outsoleGuaranteeMonths: row.get("outsoleGuaranteeMonths"),
          sizesEu: splitList(row.get("sizesEu")),
        });
      } else {
        // balls + accessories: a JSON object with a `kind`.
        specRelation = "accessorySpec";
        const raw = row.get("attributesJson");
        if (!raw) throw new Error("attributesJson: required for balls and accessories");
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error("attributesJson: not valid JSON");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("attributesJson: must be a JSON object");
        }
        if (typeof (parsed as { kind?: unknown }).kind !== "string") {
          throw new Error('attributesJson: must include a string "kind"');
        }
        specData = { attributes: parsed as Record<string, unknown> };
      }

      const productData = {
        category: base.category,
        brand: base.brand,
        model: base.model,
        variant: base.variant,
        releaseYear: base.releaseYear ?? null,
        msrpEur: base.msrpEur ?? null,
        imageUrl,
        source: base.source,
        sourceUrl: base.sourceUrl,
        lastVerifiedAt: base.lastVerifiedAt ?? null,
      };

      const existing = await prisma.equipmentProduct.findUnique({
        where: { brand_model_variant: { brand: base.brand, model: base.model, variant: base.variant } },
        select: { id: true },
      });

      await prisma.equipmentProduct.upsert({
        where: { brand_model_variant: { brand: base.brand, model: base.model, variant: base.variant } },
        create: { ...productData, [specRelation]: { create: specData } },
        update: { ...productData, [specRelation]: { upsert: { create: specData, update: specData } } },
      });

      if (existing) updated++;
      else imported++;
    } catch (err) {
      rejected.push({
        row: row.line,
        reason: err instanceof z.ZodError ? zodReason(err) : err instanceof Error ? err.message : "Invalid row",
      });
    }
  }

  return { imported, updated, rejected };
}

adminCatalogueRouter.post(
  "/import",
  requireAuth,
  requireRole("admin"),
  // The 1 MB cap is applied HERE and nowhere else — this is the only route in
  // the API that accepts text/csv, and the global JSON parser does not cover
  // it. requireRole runs first, so a non-admin's body is never even read.
  textBody({ type: "text/csv", limit: "1mb" }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = typeof req.body === "string" ? req.body : "";
    if (!body.trim()) throw new HttpError(400, "Expected a text/csv body");

    let table: CsvTable;
    try {
      table = readTable(body);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "Could not read the CSV");
    }
    if (table.rows.length === 0) throw new HttpError(400, "The CSV has a header but no data rows");

    const result = await importCatalogueCsv(table);
    return ok(
      res,
      result,
      `${result.imported} imported, ${result.updated} updated, ${result.rejected.length} rejected`,
    );
  }),
);
