/**
 * Mint a password-reset link for one account, and print it.
 *
 *   npm run reset-link -- someone@example.com
 *
 * This exists because password reset otherwise depends entirely on email: with
 * no mail transport configured, or with a provider having a bad day, a person
 * who forgets their password has no way back into their account and no way to
 * ask for one. This is the operator's way back.
 *
 * DELIBERATELY NOT AN HTTP ENDPOINT. The link it prints is a working
 * account-takeover credential for whoever holds it, which is acceptable for a
 * command that already requires shell access to the server and nowhere else.
 * Do not "helpfully" expose this over the API.
 *
 * Hand the link to the person over a channel you trust. It expires the same way
 * an emailed one does, and is invalidated by the next password change.
 */
import { prisma } from "../src/db";
import { env } from "../src/env";
import { signResetToken } from "../src/auth/jwt";

async function main() {
  const input = process.argv[2]?.trim().toLowerCase();
  if (!input) {
    console.error("Usage: npm run reset-link -- <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: input } });
  if (!user) {
    // No uniform-response games here: this is an operator tool, and an operator
    // typing a wrong address needs to be told it was wrong.
    console.error(`No account found for ${input}`);
    process.exit(1);
  }

  const url = `${env.appUrl}/reset-password?token=${encodeURIComponent(signResetToken(user.id))}`;
  console.log(`\nReset link for ${user.firstName} ${user.lastName} <${user.email}> (${user.role}):\n`);
  console.log(`  ${url}\n`);
  console.log("Single use. Give it to them directly — anyone holding it can set their password.\n");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
