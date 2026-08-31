// ============================================================================
// The calendar shows events it does not own — international tournaments from
// the public feed, and trainings that belong to the Trainings page. Editing,
// deleting or dragging one of those ends in a PATCH/DELETE against an id the
// calendar API has never heard of, which 404s.
//
// `isProjected` is the single guard on all three paths, so it is worth pinning
// down: a false negative puts the 404 back, and a false positive would make a
// real event uneditable.
// ============================================================================

import { describe, it, expect } from "vitest";
import { isProjected, withRecurrenceException } from "../CalendarPage";

describe("isProjected", () => {
  it("recognises a training projected from the Trainings page", () => {
    expect(isProjected("training-cmsnjpxn3000o9tgdigtv5exp-cmsnjpx3a000g9tgd627nr0pk")).toBe(true);
    // A coach's own block of time has no participant suffix.
    expect(isProjected("training-cmsnjpxn3000o9tgdigtv5exp")).toBe(true);
  });

  it("recognises an international tournament from the public feed", () => {
    expect(isProjected("intl-12345")).toBe(true);
  });

  it("leaves a real calendar event editable", () => {
    // Real ids are cuids: "c" + base36, no dash anywhere — which is exactly why
    // a dash-bearing prefix is safe to key off.
    expect(isProjected("cmsnjpxn3000o9tgdigtv5exp")).toBe(false);
    expect(isProjected("cmsne6szv000012ykysphw049")).toBe(false);
  });

  it("does not fire on an event that merely mentions training", () => {
    // The prefix must anchor at the start; a recurring occurrence id built from
    // a real event must stay editable.
    expect(isProjected("ctrainingXYZ")).toBe(false);
    expect(isProjected("cmsnjpxn3000o9tgd_occ_3")).toBe(false);
  });
});

// ============================================================================
// Removing ONE occurrence of a repeating event.
//
// This used to write the skipped date into the browser's mock store and send an
// empty PATCH, so against the real API nothing was saved: the toast said the
// occurrence had been removed and it reappeared on the next load. The date now
// goes onto the series' own rule, which is what the server reads when it
// expands the series.
// ============================================================================

describe("withRecurrenceException", () => {
  const weekly = { frequency: "weekly", endType: "count", count: 6 } as const;

  it("records the skipped date on a rule that had none", () => {
    expect(withRecurrenceException(weekly, "2026-09-02")).toEqual({
      ...weekly,
      exceptions: ["2026-09-02"],
    });
  });

  it("keeps the occurrences already removed", () => {
    // The whole rule is written back on every single-occurrence delete, so
    // dropping earlier exceptions would resurrect occurrences the coach removed.
    const rule = { ...weekly, exceptions: ["2026-09-02", "2026-09-09"] };
    expect(withRecurrenceException(rule, "2026-09-16").exceptions).toEqual([
      "2026-09-02",
      "2026-09-09",
      "2026-09-16",
    ]);
  });

  it("is idempotent — removing the same occurrence twice adds one entry", () => {
    const once = withRecurrenceException(weekly, "2026-09-02");
    expect(withRecurrenceException(once, "2026-09-02").exceptions).toEqual(["2026-09-02"]);
  });

  it("leaves the rest of the rule untouched", () => {
    const result = withRecurrenceException(weekly, "2026-09-02");
    expect(result.frequency).toBe("weekly");
    expect(result.endType).toBe("count");
    expect(result.count).toBe(6);
  });
});
