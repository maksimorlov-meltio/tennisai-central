// ============================================================================
// TennisAI coaching library — content validation.
//
// Walks `content/drills/**/*.yaml`, parses each document with the zod schema
// (which carries the geometry, cue-length, vocabulary and provenance rules) and
// adds the checks that only make sense across FILES: the id must match the file
// name and the folder must match the domain, and no id may appear twice.
//
// Pure: no Prisma, no env. It runs in CI where DATABASE_URL is a dummy string.
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { drillDocumentSchema, type Drill } from "./drillSchema";
import { DRILLS_DIR, REPO_ROOT } from "./vocab";

/** Drill documents are YAML — both spellings, because both get typed. */
const DRILL_FILE_EXTENSIONS = [".yaml", ".yml"];

export interface ContentIssue {
  /** Repo-relative path, so the message can be pasted into an editor. */
  file: string;
  /** Dotted path inside the document, or "" for a whole-file problem. */
  path: string;
  message: string;
}

export interface ValidationResult {
  drills: Drill[];
  issues: ContentIssue[];
  /** Repo-relative paths, in the order they were read. */
  files: string[];
}

/** Every `*.yaml` / `*.yml` under `dir`, recursively, sorted for determinism. */
export function listDrillFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries.sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listDrillFiles(full));
    } else if (DRILL_FILE_EXTENSIONS.includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file: string) => relative(REPO_ROOT, file).split(sep).join("/");

/**
 * Validate every drill document under `dir` (default: `content/drills`).
 * Returns the parsed drills AND the issues — the caller decides what to do
 * with a partial result (the CLI exits non-zero, the importer refuses).
 */
export function validateContent(dir: string = DRILLS_DIR): ValidationResult {
  const files = listDrillFiles(dir);
  const issues: ContentIssue[] = [];
  const drills: Drill[] = [];
  const seen = new Map<string, string>(); // id → first file that claimed it

  for (const file of files) {
    const relPath = rel(file);
    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(file, "utf8"));
    } catch (e) {
      issues.push({ file: relPath, path: "", message: `YAML did not parse: ${(e as Error).message}` });
      continue;
    }

    const parsed = drillDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ file: relPath, path: issue.path.join("."), message: issue.message });
      }
      continue;
    }

    const drill = parsed.data;

    // The id is the primary key in Postgres and the file name on disk; if they
    // drift, `content-import` starts writing rows nobody can find again.
    const expectedName = `${drill.id}.yaml`;
    if (basename(file) !== expectedName && basename(file) !== `${drill.id}.yml`) {
      issues.push({ file: relPath, path: "id", message: `id "${drill.id}" does not match the file name` });
    }

    // Domain folders keep the library browsable without a database.
    const folder = relative(dir, file).split(sep)[0];
    if (folder !== drill.taxonomy.domain) {
      issues.push({
        file: relPath,
        path: "taxonomy.domain",
        message: `domain "${drill.taxonomy.domain}" does not match the folder "${folder}"`,
      });
    }

    const first = seen.get(drill.id);
    if (first) {
      issues.push({ file: relPath, path: "id", message: `duplicate id "${drill.id}" — already defined in ${first}` });
      continue;
    }
    seen.set(drill.id, relPath);
    drills.push(drill);
  }

  return { drills, issues, files: files.map(rel) };
}

/** `file:path:message`, the shape an editor or a CI log can jump from. */
export function formatIssue(issue: ContentIssue): string {
  return `${issue.file}:${issue.path || "-"}: ${issue.message}`;
}
