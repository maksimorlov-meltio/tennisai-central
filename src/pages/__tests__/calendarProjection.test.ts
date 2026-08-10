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
import { isProjected } from "../CalendarPage";

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
