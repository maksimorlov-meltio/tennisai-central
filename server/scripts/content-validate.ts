// ============================================================================
// `npm run content:validate` — the content gate.
//
// Validates every drill document under `content/drills/` and exits non-zero on
// the first problem, so CI fails on a bad diagram, an over-long cue, an unknown
// skill tag, a duplicate id or a reviewed drill with no https source.
//
// Prints `file:path:message` per issue. No database, no env — it runs in CI's
// backend job where DATABASE_URL is a dummy string.
//
// Optional argument: a directory to validate instead of `content/drills`
// (used by the specs to point at a fixture).
// ============================================================================

import { DRILLS_DIR } from "../src/library/vocab";
import { formatIssue, validateContent } from "../src/library/validate";

const dir = process.argv[2] ?? DRILLS_DIR;
const { drills, issues, files } = validateContent(dir);

if (issues.length > 0) {
  for (const issue of issues) console.error(formatIssue(issue));
  console.error(`\n✖ ${issues.length} problem(s) in ${files.length} drill document(s).`);
  process.exit(1);
}

const byStatus = drills.reduce<Record<string, number>>((acc, d) => {
  acc[d.status] = (acc[d.status] ?? 0) + 1;
  return acc;
}, {});
const byDomain = drills.reduce<Record<string, number>>((acc, d) => {
  acc[d.taxonomy.domain] = (acc[d.taxonomy.domain] ?? 0) + 1;
  return acc;
}, {});

console.log(`✓ ${drills.length} drill document(s) valid.`);
console.log(`  status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(" ") || "—"}`);
console.log(`  domain: ${Object.entries(byDomain).map(([k, v]) => `${k}=${v}`).join(" ") || "—"}`);
