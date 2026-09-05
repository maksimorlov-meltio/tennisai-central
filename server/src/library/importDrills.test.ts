// ============================================================================
// The importer — what it writes, and (mostly) what it refuses to write.
//
// The three claims that matter:
//   • a new slug is CREATED with a content hash derived from the document;
//   • re-importing identical content writes NOTHING (no version churn on every
//     deploy, no false "revised" timestamps);
//   • a retired document HIDES its row and never deletes it — a finished plan
//     may still point at it.
//
// Assertions are on the arguments handed to Prisma, not on values the mock was
// told to return.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { contentHashOf, importDrills, canonicalJson } from "./importDrills";
import { validateContent } from "./validate";
import type { Drill } from "./drillSchema";

const library = validateContent().drills;
const exemplar = library.find((d) => d.id === "serve-plus-one-open-court")!;

function approved(overrides: Partial<Drill> = {}): Drill {
  return { ...exemplar, status: "approved", ...overrides } as Drill;
}

interface Harness {
  prisma: PrismaClient;
  drill: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tx: {
    drill: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    drillSource: { deleteMany: ReturnType<typeof vi.fn> };
    drillTag: { deleteMany: ReturnType<typeof vi.fn> };
  };
}

function harness(): Harness {
  const tx = {
    drill: { create: vi.fn(), update: vi.fn() },
    drillSource: { deleteMany: vi.fn() },
    drillTag: { deleteMany: vi.fn() },
  };
  const drill = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  const prisma = {
    drill,
    // The real client hands the callback a transactional client; the mock hands
    // it the same delegates, so the spec still sees every call the code makes.
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
  return { prisma, drill, tx };
}

describe("importDrills", () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it("creates an unseen drill with a content hash of the document", async () => {
    h.drill.findUnique.mockResolvedValue(null);
    const doc = approved();

    const summary = await importDrills(h.prisma, [doc]);

    expect(summary).toMatchObject({ created: 1, updated: 0, unchanged: 0 });
    expect(h.tx.drill.create).toHaveBeenCalledTimes(1);
    const arg = h.tx.drill.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.id).toBe(doc.id);
    expect(arg.data.contentHash).toBe(contentHashOf(doc));
    expect(arg.data.domain).toBe("tactics");
    expect(arg.data.titleEs).toBe(doc.title.es);
    // Tags are normalised out of the taxonomy so the assembler can select on them.
    const tags = (arg.data.tags as { create: Array<{ kind: string; tag: string }> }).create;
    expect(tags.filter((t) => t.kind === "skill").map((t) => t.tag)).toEqual(doc.taxonomy.skills);
    expect(tags.filter((t) => t.kind === "pattern").map((t) => t.tag)).toEqual(doc.taxonomy.patterns);
    expect((arg.data.sources as { create: unknown[] }).create).toHaveLength(doc.sources.length);
  });

  it("is a no-op when the stored content hash already matches", async () => {
    const doc = approved();
    h.drill.findUnique.mockResolvedValue({
      id: doc.id,
      contentHash: contentHashOf(doc),
      version: 1,
      status: "approved",
    });

    const summary = await importDrills(h.prisma, [doc]);

    expect(summary).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(h.tx.drill.create).not.toHaveBeenCalled();
    expect(h.tx.drill.update).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("updates and bumps the version when the content changed", async () => {
    const doc = approved();
    h.drill.findUnique.mockResolvedValue({ id: doc.id, contentHash: "stale", version: 3, status: "approved" });

    const summary = await importDrills(h.prisma, [doc]);

    expect(summary).toMatchObject({ created: 0, updated: 1 });
    expect(h.tx.drillSource.deleteMany).toHaveBeenCalledWith({ where: { drillId: doc.id } });
    expect(h.tx.drillTag.deleteMany).toHaveBeenCalledWith({ where: { drillId: doc.id } });
    const arg = h.tx.drill.update.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> };
    expect(arg.where).toEqual({ id: doc.id });
    expect(arg.data.version).toBe(4);
    expect(arg.data.contentHash).toBe(contentHashOf(doc));
  });

  it("hides a retired drill without deleting it", async () => {
    const doc = approved({ status: "retired" });
    h.drill.findUnique.mockResolvedValue({ id: doc.id, contentHash: "anything", version: 2, status: "approved" });

    const summary = await importDrills(h.prisma, [doc]);

    expect(summary).toMatchObject({ retired: 1 });
    expect(h.drill.update).toHaveBeenCalledWith({ where: { id: doc.id }, data: { status: "retired" } });
    expect((h.prisma as unknown as { drill: { delete?: unknown } }).drill.delete).toBeUndefined();
    expect(h.tx.drill.update).not.toHaveBeenCalled();
  });

  it("skips reviewed drills unless --include-reviewed was passed", async () => {
    h.drill.findUnique.mockResolvedValue(null);
    const doc = approved({ status: "reviewed" });

    expect(await importDrills(h.prisma, [doc])).toMatchObject({ skipped: 1, created: 0 });
    expect(h.tx.drill.create).not.toHaveBeenCalled();

    const h2 = harness();
    h2.drill.findUnique.mockResolvedValue(null);
    expect(await importDrills(h2.prisma, [doc], { includeReviewed: true })).toMatchObject({ created: 1 });
  });
});

describe("canonicalJson", () => {
  it("ignores key order but preserves array order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it("gives every committed drill a distinct hash", () => {
    const hashes = new Set(library.map(contentHashOf));
    expect(hashes.size).toBe(library.length);
  });
});
