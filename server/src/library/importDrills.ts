// ============================================================================
// TennisAI coaching library — importer.
//
// Moves validated YAML documents into Postgres. Three rules govern it:
//
//   1. The slug is the primary key, so an import is an UPSERT by id — the same
//      drill never appears twice, in any environment.
//   2. `contentHash` (sha256 of the canonical JSON of the document) decides
//      whether anything changed. Re-importing untouched content writes nothing
//      and, crucially, does not bump `version` — otherwise every deploy would
//      claim every drill had been revised.
//   3. `retired` HIDES a drill (status = retired); it never deletes one. A
//      player's finished plan may point at it, and history is not ours to edit.
//
// Only `approved` drills are imported by default. `--include-reviewed` also
// takes `reviewed` ones — which is what the seed uses, so a fresh demo database
// is not an empty library.
// ============================================================================

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { renderCue, type Drill } from "./drillSchema";

export interface ImportOptions {
  /** Also import `reviewed` drills, not only `approved` ones. */
  includeReviewed?: boolean;
}

export interface ImportSummary {
  created: number;
  updated: number;
  unchanged: number;
  retired: number;
  skipped: number;
}

/**
 * Canonical JSON: object keys sorted at every depth, so a re-ordered YAML
 * document (or a different YAML writer) does not masquerade as a content
 * change. Arrays keep their order — in a drill, order is meaning.
 */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = walk((v as Record<string, unknown>)[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export function contentHashOf(drill: Drill): string {
  return createHash("sha256").update(canonicalJson(drill)).digest("hex");
}

/** The scalar columns of `drills`, derived from the document. */
export function toDrillRow(drill: Drill, contentHash: string) {
  return {
    id: drill.id,
    status: drill.status,
    contentHash,
    domain: drill.taxonomy.domain,
    titleEn: drill.title.en,
    titleEs: drill.title.es,
    objectiveEn: drill.objective.en,
    objectiveEs: drill.objective.es,
    setupEn: drill.setup.en,
    setupEs: drill.setup.es,
    progressionEn: drill.progression.en,
    progressionEs: drill.progression.es,
    regressionEn: drill.regression.en,
    regressionEs: drill.regression.es,
    successCriteriaEn: drill.successCriteria.en,
    successCriteriaEs: drill.successCriteria.es,
    stepsEn: drill.steps.en,
    stepsEs: drill.steps.es,
    cuesEn: drill.cues.en.map(renderCue),
    cuesEs: drill.cues.es.map(renderCue),
    commonErrorsEn: drill.commonErrors.en,
    commonErrorsEs: drill.commonErrors.es,
    levelBands: drill.levelBands,
    ageBands: drill.ageBands,
    blockKinds: drill.blockKinds,
    playersMin: drill.players.min,
    playersMax: drill.players.max,
    courtsMin: drill.courts.min,
    courtsMax: drill.courts.max,
    equipment: drill.equipment,
    defaults: drill.defaults,
    ranges: drill.ranges,
    diagram: drill.diagram,
    requiresQualifiedSupervision: drill.requiresQualifiedSupervision,
    licence: drill.licence,
    authorAgent: drill.authorAgent,
  };
}

function sourceRows(drill: Drill) {
  return drill.sources.map((s) => ({
    coachOrBody: s.coachOrBody,
    title: s.title,
    medium: s.medium,
    publisherOrChannel: s.publisherOrChannel ?? null,
    url: s.url ?? null,
    year: s.year ?? null,
    timestamp: s.timestamp ?? null,
    note: s.note ?? null,
    fetchedAt: s.fetchedAt ? new Date(s.fetchedAt) : null,
  }));
}

function tagRows(drill: Drill) {
  return [
    ...drill.taxonomy.skills.map((tag) => ({ kind: "skill", tag })),
    ...drill.taxonomy.patterns.map((tag) => ({ kind: "pattern", tag })),
  ];
}

/** Which documents this run is allowed to write. */
export function importable(drill: Drill, options: ImportOptions): boolean {
  if (drill.status === "approved" || drill.status === "retired") return true;
  return drill.status === "reviewed" && options.includeReviewed === true;
}

/**
 * Upsert every importable drill. Takes the Prisma client as an argument so the
 * seed can pass its own instance and the specs can pass a mock.
 */
export async function importDrills(
  prisma: PrismaClient,
  drills: Drill[],
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, unchanged: 0, retired: 0, skipped: 0 };

  for (const drill of drills) {
    if (!importable(drill, options)) {
      summary.skipped += 1;
      continue;
    }

    const hash = contentHashOf(drill);
    const existing = await prisma.drill.findUnique({
      where: { id: drill.id },
      select: { id: true, contentHash: true, version: true, status: true },
    });

    // A retired document only ever flips the status — the row and everything
    // pointing at it stays exactly where it is.
    if (drill.status === "retired") {
      if (!existing) {
        summary.skipped += 1;
        continue;
      }
      if (existing.status !== "retired") {
        await prisma.drill.update({ where: { id: drill.id }, data: { status: "retired" } });
        summary.retired += 1;
      } else {
        summary.unchanged += 1;
      }
      continue;
    }

    if (existing && existing.contentHash === hash) {
      summary.unchanged += 1;
      continue;
    }

    const row = toDrillRow(drill, hash);

    await prisma.$transaction(async (tx) => {
      if (existing) {
        // Children are replaced wholesale: a source removed from the document
        // must disappear from the database, not linger as a stale citation.
        await tx.drillSource.deleteMany({ where: { drillId: drill.id } });
        await tx.drillTag.deleteMany({ where: { drillId: drill.id } });
        await tx.drill.update({
          where: { id: drill.id },
          data: {
            ...row,
            version: Math.max(drill.version, existing.version + 1),
            sources: { create: sourceRows(drill) },
            tags: { create: tagRows(drill) },
          },
        });
      } else {
        await tx.drill.create({
          data: {
            ...row,
            version: drill.version,
            sources: { create: sourceRows(drill) },
            tags: { create: tagRows(drill) },
          },
        });
      }
    });

    if (existing) summary.updated += 1;
    else summary.created += 1;
  }

  return summary;
}
