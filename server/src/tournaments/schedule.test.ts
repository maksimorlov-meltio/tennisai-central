// When the calendar refresh runs.
//
// The bug these pin: a fresh install had an empty tournament catalog and no
// reachable way to fill it. The only trigger was an admin-only endpoint, and
// `admin` is not a role anyone can sign up as — so the calendar said "No events
// found" on day one and would have gone on saying it forever.

import { describe, it, expect, vi } from "vitest";
import { importIfEmpty, msUntilNextRun } from "./schedule";

vi.mock("./feed", () => ({
  importTournaments: vi.fn().mockResolvedValue({ imported: 26, source: "utr-events", results: [] }),
}));
import { importTournaments } from "./feed";

function prismaWith(count: number) {
  return { tournament: { count: vi.fn().mockResolvedValue(count) } } as never;
}

describe("importIfEmpty", () => {
  it("imports straight away when the catalog is empty", async () => {
    vi.mocked(importTournaments).mockClear();

    expect(await importIfEmpty(prismaWith(0))).toBe(true);
    expect(importTournaments).toHaveBeenCalledOnce();
  });

  it("does NOTHING when the catalog already has rows", async () => {
    // A redeploy must not re-import: several restarts in an afternoon would
    // hammer the source for rows we already hold.
    vi.mocked(importTournaments).mockClear();

    expect(await importIfEmpty(prismaWith(3248))).toBe(false);
    expect(importTournaments).not.toHaveBeenCalled();
  });
});

describe("msUntilNextRun", () => {
  it("waits until later today when the hour has not passed", () => {
    const at = new Date("2026-09-02T01:00:00Z");
    expect(msUntilNextRun(at, 4)).toBe(3 * 3_600_000);
  });

  it("rolls to tomorrow once the hour has passed", () => {
    const at = new Date("2026-09-02T06:00:00Z");
    expect(msUntilNextRun(at, 4)).toBe(22 * 3_600_000);
  });

  it("rolls to tomorrow when it is exactly the hour, rather than firing twice", () => {
    const at = new Date("2026-09-02T04:00:00.000Z");
    expect(msUntilNextRun(at, 4)).toBe(24 * 3_600_000);
  });
});
