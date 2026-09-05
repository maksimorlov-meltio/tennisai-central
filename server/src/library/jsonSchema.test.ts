// ============================================================================
// Drift check: `content/schema/drill.schema.json` is generated, not written.
//
// Editors and non-TypeScript tooling read the JSON Schema; zod is the source of
// truth. If someone edits the zod schema and forgets `npm run content:schema`,
// the committed contract quietly describes the old shape — and nothing else in
// the suite would notice. This spec notices.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { buildDrillJsonSchema, DRILL_JSON_SCHEMA_PATH } from "./jsonSchema";
import { SCHEMA_DIR } from "./vocab";

describe("drill.schema.json", () => {
  it("matches what the zod schema generates", () => {
    const committed = readFileSync(resolve(SCHEMA_DIR, DRILL_JSON_SCHEMA_PATH), "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(buildDrillJsonSchema());
  });

  it("describes the fields the importer depends on", () => {
    const schema = JSON.parse(buildDrillJsonSchema());
    const props = schema.definitions.Drill.properties;
    for (const key of ["id", "title", "taxonomy", "blockKinds", "diagram", "sources", "licence", "authorAgent"]) {
      expect(props).toHaveProperty(key);
    }
  });
});
