// Forgetting rows a source has stopped listing.
//
// The rule that matters is the guard, not the delete: pruning after a source
// returned nothing would wipe a real calendar because of one bad night, and the
// app would look empty rather than a day stale.

import { describe, it, expect, vi } from "vitest";
import { pruneStale } from "./index";

function fakePrisma(deleted = 0) {
  const deleteMany = vi.fn().mockResolvedValue({ count: deleted });
  return { prisma: { tournament: { deleteMany } } as never, deleteMany };
}

describe("pruneStale", () => {
  it("removes rows the source has not listed for a week", async () => {
    const { prisma, deleteMany } = fakePrisma(3);

    const count = await pruneStale(prisma, "itf-juniors", 135);

    expect(count).toBe(3);
    const where = deleteMany.mock.calls[0][0].where;
    expect(where.source).toBe("itf-juniors");

    // Seven days back, give or take the moment the test ran.
    const cutoff: Date = where.OR[0].lastSeenAt.lt;
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("also removes rows that predate provenance tracking", async () => {
    const { prisma, deleteMany } = fakePrisma();
    await pruneStale(prisma, "itf-juniors", 10);
    expect(deleteMany.mock.calls[0][0].where.OR).toContainEqual({ lastSeenAt: null });
  });

  it("deletes NOTHING when the import brought nothing back", async () => {
    // The failure this prevents: a source has an outage, returns zero rows, and
    // the prune quietly empties a calendar a coach is planning a season on.
    const { prisma, deleteMany } = fakePrisma();

    expect(await pruneStale(prisma, "itf-juniors", 0)).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("only ever touches the source that just ran", async () => {
    // A UTR import must never be able to delete ITF rows.
    const { prisma, deleteMany } = fakePrisma();
    await pruneStale(prisma, "utr-events", 3248);
    expect(deleteMany.mock.calls[0][0].where.source).toBe("utr-events");
  });
});
