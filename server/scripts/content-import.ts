// ============================================================================
// `npm run content:import [-- --include-reviewed]`
//
// Validates the library first (an invalid document is never written), then
// upserts every `approved` drill — plus `reviewed` ones with --include-reviewed
// — into Postgres by slug. `retired` documents hide their row; nothing is ever
// deleted. See `src/library/importDrills.ts` for the rules.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { importDrills } from "../src/library/importDrills";
import { formatIssue, validateContent } from "../src/library/validate";
import { DRILLS_DIR } from "../src/library/vocab";

async function main() {
  const includeReviewed = process.argv.includes("--include-reviewed");
  const { drills, issues } = validateContent(DRILLS_DIR);

  if (issues.length > 0) {
    for (const issue of issues) console.error(formatIssue(issue));
    console.error(`\n✖ refusing to import — ${issues.length} problem(s) in the content.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const summary = await importDrills(prisma, drills, { includeReviewed });
    console.log(
      `✓ library import: ${summary.created} created, ${summary.updated} updated, ` +
        `${summary.unchanged} unchanged, ${summary.retired} retired, ${summary.skipped} skipped` +
        `${includeReviewed ? " (reviewed included)" : ""}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
