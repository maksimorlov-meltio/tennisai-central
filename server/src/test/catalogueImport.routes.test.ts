// ============================================================================
// HTTP route tests — POST /api/admin/catalogue/import
//
// The three things that must hold: only an admin gets in, a row with no
// provenance never lands, and a body big enough to hurt is refused with 413
// rather than a generic 500.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../db", async () => ({ prisma: (await import("./harness")).createPrismaMock() }));

import { prisma } from "../db";
import { adminCatalogueRouter } from "../catalogue/routes";
import { bearer, createTestApp, prismaMockFrom } from "./harness";

const db = prismaMockFrom(prisma);
const app = createTestApp([["/api/admin/catalogue", adminCatalogueRouter]]);

const ADMIN = "admin-1";
const COACH = "coach-1";

const HEADER =
  "category,brand,model,variant,source,sourceUrl,headSizeCm2,headSizeIn2,lengthCm,unstrungWeightG," +
  "balanceMm,beamMm,stringPatternMains,stringPatternCrosses,recommendedTensionMinKg," +
  "recommendedTensionMaxKg,gripSizes,targetLevel";

const racketRow = (brand: string, model: string, opts: { sourceUrl?: string } = {}) =>
  [
    "racket",
    brand,
    model,
    "",
    "Manufacturer specification page",
    opts.sourceUrl ?? "https://example.invalid/specs",
    "632",
    "98",
    "68.6",
    "305",
    "320",
    "21/23/21",
    "16",
    "19",
    "23",
    "27",
    "L1|L2|L3",
    "advanced",
  ].join(",");

function asAdmin() {
  db.user.findUnique.mockResolvedValue({ role: "admin" });
}

function post(csv: string, userId = ADMIN) {
  return request(app)
    .post("/api/admin/catalogue/import")
    .set("Authorization", bearer(userId))
    .set("Content-Type", "text/csv")
    .send(csv);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/admin/catalogue/import", () => {
  it("401s an unauthenticated caller and never writes", async () => {
    const res = await request(app)
      .post("/api/admin/catalogue/import")
      .set("Content-Type", "text/csv")
      .send(`${HEADER}\n${racketRow("Head", "Radical MP")}`);

    expect(res.status).toBe(401);
    expect(db.equipmentProduct.upsert).not.toHaveBeenCalled();
  });

  it("403s a NON-ADMIN and never writes", async () => {
    db.user.findUnique.mockResolvedValue({ role: "coach" });
    const res = await post(`${HEADER}\n${racketRow("Head", "Radical MP")}`, COACH);

    expect(res.status).toBe(403);
    expect(db.equipmentProduct.upsert).not.toHaveBeenCalled();
  });

  it("imports a well-formed 3-row CSV as 3 imported, 0 updated, 0 rejected", async () => {
    asAdmin();
    db.equipmentProduct.findUnique.mockResolvedValue(null);
    db.equipmentProduct.upsert.mockResolvedValue({ id: "p" });

    const csv = [
      HEADER,
      racketRow("Head", "Radical MP"),
      racketRow("Wilson", "Blade 98"),
      racketRow("Yonex", "EZONE 98"),
    ].join("\n");

    const res = await post(csv);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ imported: 3, updated: 0, rejected: [] });
    expect(db.equipmentProduct.upsert).toHaveBeenCalledTimes(3);
  });

  it("counts a row whose (brand, model, variant) already exists as UPDATED, not imported", async () => {
    asAdmin();
    db.equipmentProduct.findUnique.mockResolvedValue({ id: "already-here" });
    db.equipmentProduct.upsert.mockResolvedValue({ id: "already-here" });

    const res = await post(`${HEADER}\n${racketRow("Head", "Radical MP")}`);

    expect(res.body.data).toEqual({ imported: 0, updated: 1, rejected: [] });
    // Upserted on the natural key, not on an id the CSV supplied.
    const arg = db.equipmentProduct.upsert.mock.calls[0][0] as { where: unknown };
    expect(arg.where).toEqual({
      brand_model_variant: { brand: "Head", model: "Radical MP", variant: "" },
    });
  });

  it("rejects a row missing sourceUrl, WITH ITS ROW NUMBER, and imports the others", async () => {
    asAdmin();
    db.equipmentProduct.findUnique.mockResolvedValue(null);
    db.equipmentProduct.upsert.mockResolvedValue({ id: "p" });

    const csv = [
      HEADER,
      racketRow("Head", "Radical MP"),
      racketRow("Wilson", "Blade 98", { sourceUrl: "" }),
      racketRow("Yonex", "EZONE 98"),
    ].join("\n");

    const res = await post(csv);

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(2);
    // Row 3: the header is row 1, so the bad row is the one a spreadsheet
    // labels 3 — a rejection you cannot locate is barely a rejection.
    expect(res.body.data.rejected).toEqual([{ row: 3, reason: expect.stringContaining("sourceUrl") }]);
    expect(db.equipmentProduct.upsert).toHaveBeenCalledTimes(2);
  });

  it("rejects a row missing a required spec number and names the field", async () => {
    asAdmin();
    db.equipmentProduct.findUnique.mockResolvedValue(null);
    db.equipmentProduct.upsert.mockResolvedValue({ id: "p" });

    const broken = racketRow("Head", "Radical MP").replace(",320,", ",,"); // balanceMm
    const res = await post(`${HEADER}\n${broken}`);

    expect(res.body.data.imported).toBe(0);
    expect(res.body.data.rejected[0].row).toBe(2);
    expect(res.body.data.rejected[0].reason).toContain("balanceMm");
    expect(db.equipmentProduct.upsert).not.toHaveBeenCalled();
  });

  it("DROPS imageUrl unless the row asserts licensed=true", async () => {
    asAdmin();
    db.equipmentProduct.findUnique.mockResolvedValue(null);
    db.equipmentProduct.upsert.mockResolvedValue({ id: "p" });

    const header = `${HEADER},imageUrl,licensed`;
    const withoutLicence = `${racketRow("Head", "Radical MP")},https://example.invalid/a.jpg,`;
    const withLicence = `${racketRow("Wilson", "Blade 98")},https://example.invalid/b.jpg,true`;

    await post([header, withoutLicence, withLicence].join("\n"));

    const calls = db.equipmentProduct.upsert.mock.calls as Array<[{ create: { imageUrl: string | null } }]>;
    // No licence assertion → no image. The safe answer to a copyright question
    // is to store nothing.
    expect(calls[0][0].create.imageUrl).toBeNull();
    expect(calls[1][0].create.imageUrl).toBe("https://example.invalid/b.jpg");
  });

  it("parses a quoted field containing a comma without shifting every later column", async () => {
    asAdmin();
    db.equipmentProduct.findUnique.mockResolvedValue(null);
    db.equipmentProduct.upsert.mockResolvedValue({ id: "p" });

    const row = racketRow("Head", "Radical, MP").replace("Radical, MP", '"Radical, MP"');
    const res = await post(`${HEADER}\n${row}`);

    expect(res.body.data.rejected).toEqual([]);
    const arg = db.equipmentProduct.upsert.mock.calls[0][0] as { create: { model: string; balanceMm?: number } };
    expect(arg.create.model).toBe("Radical, MP");
  });

  it("requires a kind in attributesJson for an accessory", async () => {
    asAdmin();
    db.equipmentProduct.findUnique.mockResolvedValue(null);
    db.equipmentProduct.upsert.mockResolvedValue({ id: "p" });

    const header = "category,brand,model,source,sourceUrl,attributesJson";
    const good = 'accessories,Wilson,Pro Overgrip,Spec page,https://example.invalid/x,"{""kind"":""grip""}"';
    const bad = 'accessories,Head,Xtra Damp,Spec page,https://example.invalid/y,"{""packCount"":2}"';

    const res = await post([header, good, bad].join("\n"));

    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.rejected).toEqual([{ row: 3, reason: expect.stringContaining("kind") }]);
  });

  it("400s a CSV with a header but no data rows", async () => {
    asAdmin();
    const res = await post(HEADER);
    expect(res.status).toBe(400);
    expect(db.equipmentProduct.upsert).not.toHaveBeenCalled();
  });

  it("413s an oversize body instead of falling through to a generic 500", async () => {
    asAdmin();
    // Just over the 1 MB cap declared on this route.
    const oversize = `${HEADER}\n${"x".repeat(1024 * 1024 + 1024)}`;
    const res = await post(oversize);

    expect(res.status).toBe(413);
    expect(res.body.message).toBe("Request body too large");
    expect(db.equipmentProduct.upsert).not.toHaveBeenCalled();
  });
});
