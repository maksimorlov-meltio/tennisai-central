// ============================================================================
// `npm run content:schema` — regenerate `content/schema/drill.schema.json`.
//
// The JSON Schema is GENERATED from the zod schema so the two cannot drift:
// editors and any non-TypeScript tooling read the JSON, but zod stays the one
// place the shape is defined. A spec asserts that regenerating produces exactly
// the committed file, so a forgotten regeneration fails the suite rather than
// quietly shipping a stale contract.
//
// Cross-field rules (diagram bounds, cue length, vocabulary, provenance) live
// in zod's `superRefine` and have no JSON Schema equivalent — the generated
// file describes the SHAPE, `npm run content:validate` enforces the RULES.
// ============================================================================

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDrillJsonSchema, DRILL_JSON_SCHEMA_PATH } from "../src/library/jsonSchema";
import { SCHEMA_DIR } from "../src/library/vocab";

const target = resolve(SCHEMA_DIR, DRILL_JSON_SCHEMA_PATH);
writeFileSync(target, buildDrillJsonSchema(), "utf8");
console.log(`✓ wrote ${target}`);
