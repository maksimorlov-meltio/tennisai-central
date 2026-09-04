// ============================================================================
// The content gate — `npm run content:validate` in library form.
//
// Two claims worth proving: the committed library actually passes (otherwise CI
// is green on a promise, not a check), and a duplicate id is caught. A duplicate
// slug is the one mistake that cannot be seen in a diff — two files, both valid,
// and the importer silently overwrites one with the other.
// ============================================================================

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, it, expect } from "vitest";
import { formatIssue, validateContent } from "./validate";
import { DRILLS_DIR } from "./vocab";

const scratch: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tennisai-content-"));
  scratch.push(dir);
  return dir;
}

describe("validateContent", () => {
  it("passes over the committed library", () => {
    const { drills, issues, files } = validateContent();
    expect(issues.map(formatIssue)).toEqual([]);
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(drills.length).toBe(files.length);
    // One drill per domain at minimum — the library must not be all tactics.
    expect(new Set(drills.map((d) => d.taxonomy.domain)).size).toBeGreaterThanOrEqual(8);
  });

  it("reports every domain folder as matching its documents", () => {
    const { drills } = validateContent();
    for (const drill of drills) expect(drill.status).toMatch(/draft|reviewed|approved|retired/);
    expect(drills.some((d) => d.ageBands.includes("u10"))).toBe(true);
    expect(drills.some((d) => d.requiresQualifiedSupervision)).toBe(true);
  });

  it("fails on a duplicate id", () => {
    const dir = fixtureDir();
    mkdirSync(join(dir, "tactics"), { recursive: true });
    const source = readFileSync(resolve(DRILLS_DIR, "tactics", "serve-plus-one-open-court.yaml"), "utf8");
    writeFileSync(join(dir, "tactics", "serve-plus-one-open-court.yaml"), source, "utf8");
    writeFileSync(join(dir, "tactics", "serve-plus-one-open-court-copy.yaml"), source, "utf8");

    const { drills, issues } = validateContent(dir);

    expect(drills).toHaveLength(1);
    expect(issues.map((i) => i.message).join("\n")).toMatch(/duplicate id "serve-plus-one-open-court"/);
  });

  it("fails on a document whose folder does not match its domain", () => {
    const dir = fixtureDir();
    mkdirSync(join(dir, "mental"), { recursive: true });
    const source = readFileSync(resolve(DRILLS_DIR, "tactics", "serve-plus-one-open-court.yaml"), "utf8");
    writeFileSync(join(dir, "mental", "serve-plus-one-open-court.yaml"), source, "utf8");

    const { issues } = validateContent(dir);
    expect(issues.map((i) => i.message).join("\n")).toMatch(/domain "tactics" does not match the folder "mental"/);
  });

  it("formats an issue as file:path:message", () => {
    expect(formatIssue({ file: "content/drills/x.yaml", path: "cues.en.0", message: "too long" })).toBe(
      "content/drills/x.yaml:cues.en.0: too long",
    );
  });
});
