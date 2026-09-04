// ============================================================================
// Generation of `content/schema/drill.schema.json` from the zod schema.
//
// Kept in `src/` (not `scripts/`) so the drift spec can import it: the test
// regenerates the JSON and asserts it equals the committed file byte for byte.
// ============================================================================

import { zodToJsonSchema } from "zod-to-json-schema";
import { drillObjectSchema } from "./drillSchema";

export const DRILL_JSON_SCHEMA_PATH = "drill.schema.json";

/** The generated JSON Schema, pretty-printed with a trailing newline. */
export function buildDrillJsonSchema(): string {
  const schema = zodToJsonSchema(drillObjectSchema, {
    name: "Drill",
    $refStrategy: "none",
  });
  return `${JSON.stringify(schema, null, 2)}\n`;
}
