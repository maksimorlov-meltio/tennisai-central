// ============================================================================
// Unit tests — strings recommendation engine.
//
// Each case is one rule from docs/recommendations.md. The assertions are on
// the recommendation AND on the reason code that explains it: a rule that
// fires without saying so is a rule the player cannot check.
// ============================================================================

import { describe, it, expect } from "vitest";
import { recommendStrings, BREAKER_HOURS, DEFAULT_BAND_KG } from "./strings";
import {
  stringsInput,
  CATALOGUE_STRINGS,
  PRO_STAFF_97,
  DENSE_18x20,
  STIFF_FRAME,
  UNLINKED_RACKET,
  P1_HISTORY,
  BREAKER_HISTORY,
  ADULT_ADVANCED,
  JUNIOR_U14,
  PAIN_MENTIONED,
  UNKNOWN_PROFILE,
  HOT_THIN_PHYSICS,
  COLD_HEAVY_PHYSICS,
} from "./__fixtures__/strings";

const codes = (r: { reasons: { code: string }[] }) => r.reasons.map((x) => x.code);
const allText = (r: { reasons: { textEn: string }[]; cautions: { textEn: string }[]; material: { why: string }; alternatives: { why: string }[] }) =>
  [...r.reasons.map((x) => x.textEn), ...r.cautions.map((x) => x.textEn), r.material.why, ...r.alternatives.map((a) => a.why)].join(" ");

describe("recommendStrings — junior / comfort", () => {
  it("steers a U14 to a multifilament at the lower half of the frame's band, 1.30 gauge", () => {
    const r = recommendStrings(stringsInput({ profile: JUNIOR_U14 }));
    expect(r.material.material).toBe("multifilament");
    expect(r.gauge.mm).toBe(1.3);
    // Band 23–27: lower-half centre is 24, +0.5 for the open 16×19 → 24.5 → [24, 25].
    expect(r.tension.mainsKg).toEqual([24, 25]);
    expect(r.tension.mainsKg[1]).toBeLessThanOrEqual(25);
    expect(codes(r)).toContain("junior_comfort");
    expect(codes(r)).toContain("tension_lower_half");
    // A U14 is not offered a co-poly alternative.
    expect(r.alternatives.map((a) => a.material)).not.toContain("co_polyester");
  });

  it("treats a declared arm-comfort request like a comfort profile and picks only comfort-rated multis", () => {
    const r = recommendStrings(stringsInput({ prefs: { wantsArmComfort: true } }));
    expect(r.material.material).toBe("multifilament");
    expect(codes(r)).toContain("comfort_requested");
    for (const id of r.pickFromCatalogue.productIds) {
      const s = CATALOGUE_STRINGS.find((c) => c.id === id)!;
      expect(s.material).toBe("multifilament");
      expect(s.comfort).toBeGreaterThanOrEqual(7);
    }
    expect(r.pickFromCatalogue.productIds.length).toBeGreaterThan(0);
  });

  it("offers a hybrid when comfort and spin are both wanted, instead of a full poly bed", () => {
    const r = recommendStrings(stringsInput({ prefs: { wantsArmComfort: true, wantsMoreSpin: true } }));
    expect(r.material.material).toBe("multifilament");
    expect(r.hybrid).toBeDefined();
    expect(r.hybrid!.mains).toMatch(/co-polyester/);
    expect(codes(r)).toContain("spin_with_comfort");
  });
});

describe("recommendStrings — frequent breaker", () => {
  it("answers a declared breaker with a thicker gauge and a durable co-poly, never a higher tension", () => {
    const r = recommendStrings(stringsInput({ history: P1_HISTORY, prefs: { breaksOften: true } }));
    expect(r.material.material).toBe("co_polyester");
    expect(r.gauge.mm).toBe(1.3);
    expect(codes(r)).toContain("breaker_declared");
    expect(codes(r)).toContain("gauge_thicker_for_breaks");
    expect(codes(r)).toContain("breaker_no_tension_increase");
    // Anchored to the 22.5 kg last job (clamped to 23) — the top of the window must not exceed it by more than the half-kilo window.
    const last = P1_HISTORY[P1_HISTORY.length - 1].tensionMainsKg;
    expect(r.tension.mainsKg[0]).toBeLessThanOrEqual(Math.max(last, PRO_STAFF_97.bandKg![0]));
    // Picks are durability-rated.
    for (const id of r.pickFromCatalogue.productIds) {
      expect(CATALOGUE_STRINGS.find((c) => c.id === id)!.durability).toBeGreaterThanOrEqual(7);
    }
  });

  it("detects a breaker from history alone when breaks average under the threshold", () => {
    const r = recommendStrings(stringsInput({ history: BREAKER_HISTORY }));
    expect(codes(r)).toContain("breaker_history");
    const reason = r.reasons.find((x) => x.code === "breaker_history")!;
    expect(reason.params.avgHours).toBe(7);
    expect(Number(reason.params.avgHours)).toBeLessThan(BREAKER_HOURS);
    expect(r.gauge.mm).toBe(1.3);
    expect(codes(r)).toContain("breaker_no_tension_increase");
  });

  it("does NOT call p1 a breaker — one break at 14 h is above the threshold", () => {
    const r = recommendStrings(stringsInput({ history: P1_HISTORY }));
    expect(codes(r)).not.toContain("breaker_history");
    expect(r.gauge.mm).toBe(1.25);
  });

  it("keeps a breaking junior on a multifilament but thicker, with a durable-mains hybrid", () => {
    const r = recommendStrings(stringsInput({ profile: JUNIOR_U14, prefs: { breaksOften: true } }));
    expect(r.material.material).toBe("multifilament");
    expect(r.gauge.mm).toBe(1.35);
    expect(r.hybrid?.mains).toMatch(/durable co-polyester/);
  });
});

describe("recommendStrings — frame pattern and stiffness", () => {
  it("drops half a kilo for a dense 18×20 and adds half for an open 16×19 (no history)", () => {
    const dense = recommendStrings(stringsInput({ racket: DENSE_18x20 }));
    const open = recommendStrings(stringsInput({ racket: PRO_STAFF_97 }));
    expect(codes(dense)).toContain("pattern_dense");
    expect(codes(open)).toContain("pattern_open");
    // Same band, same profile: the open frame sits a full kilo above the dense one.
    expect(open.tension.mainsKg[0] - dense.tension.mainsKg[0]).toBe(1);
    expect(dense.tension.mainsKg).toEqual([24, 25]); // midpoint 25 − 0.5 → [24, 25]
    expect(open.tension.mainsKg).toEqual([25, 26]); // midpoint 25 + 0.5 → [25, 26]
  });

  it("does not re-apply the pattern rule when a history anchor exists", () => {
    const r = recommendStrings(stringsInput({ racket: DENSE_18x20, history: P1_HISTORY }));
    expect(codes(r)).toContain("anchor_history");
    expect(codes(r)).not.toContain("pattern_dense");
  });

  it("softens for a stiff frame (RA ≥ 68): lower tension, comfort-rated co-poly picks, a hybrid card", () => {
    const r = recommendStrings(stringsInput({ racket: STIFF_FRAME }));
    expect(codes(r)).toContain("frame_stiff");
    expect(codes(r)).toContain("tension_stiff_frame");
    expect(r.hybrid).toBeDefined();
    for (const id of r.pickFromCatalogue.productIds) {
      expect(CATALOGUE_STRINGS.find((c) => c.id === id)!.comfort).toBeGreaterThanOrEqual(6);
    }
    // ALU Power (comfort 3) is not offered against a stiff frame.
    expect(r.pickFromCatalogue.productIds).not.toContain("prod-luxilon-alu-power-125");
  });
});

describe("recommendStrings — conditions at the next tournament", () => {
  const base = stringsInput({ history: P1_HISTORY });

  it("adds tension for hot, thin air", () => {
    const plain = recommendStrings(base);
    const hot = recommendStrings({ ...base, nextTournament: { name: "Denver Open", startDate: "2026-09-20T00:00:00.000Z", physics: HOT_THIN_PHYSICS } });
    expect(HOT_THIN_PHYSICS.densityVsReferencePct).toBeLessThan(-3);
    expect(codes(hot)).toContain("conditions_hot_thin");
    expect(hot.tension.mainsKg[0]).toBeGreaterThan(plain.tension.mainsKg[0]);
    const delta = hot.reasons.find((x) => x.code === "conditions_hot_thin")!.params.deltaKg;
    expect([0.5, 1]).toContain(delta);
  });

  it("removes tension for cold, heavy air", () => {
    const plain = recommendStrings(base);
    const cold = recommendStrings({ ...base, nextTournament: { name: "Winter Indoor", startDate: "2026-12-01T00:00:00.000Z", physics: COLD_HEAVY_PHYSICS } });
    expect(COLD_HEAVY_PHYSICS.densityVsReferencePct).toBeGreaterThan(3);
    expect(codes(cold)).toContain("conditions_cold_heavy");
    expect(cold.tension.mainsKg[0]).toBeLessThanOrEqual(plain.tension.mainsKg[0]);
    // Clamped by the band floor of 23 → says so.
    expect(codes(cold)).toContain("band_clamped");
  });

  it("says so when the conditions are ordinary", () => {
    const mild = recommendStrings({
      ...base,
      nextTournament: { name: "Home Club Open", startDate: "2026-09-20T00:00:00.000Z", physics: { airDensity: 1.2, densityVsReferencePct: 0.4, pressureHPa: 1013, speed: "neutral", bounce: "neutral", drivers: [] } },
    });
    expect(codes(mild)).toContain("conditions_neutral");
  });
});

describe("recommendStrings — band clamping and unknown band", () => {
  it("clamps a history tension above the frame's band back into it and says so", () => {
    const r = recommendStrings(stringsInput({ history: [{ strungAt: "2026-08-01T00:00:00.000Z", tensionMainsKg: 29, mainsName: "Something" }] }));
    expect(r.tension.mainsKg[1]).toBeLessThanOrEqual(27);
    expect(r.tension.mainsKg[0]).toBeGreaterThanOrEqual(23);
    expect(codes(r)).toContain("band_clamped");
  });

  it("falls back to the default band, says so, and reports low confidence when the racket is not linked", () => {
    const r = recommendStrings(stringsInput({ racket: UNLINKED_RACKET, history: P1_HISTORY }));
    expect(codes(r)).toContain("band_unknown");
    expect(r.tension.racketBandKg).toBeNull();
    expect(r.tension.mainsKg[0]).toBeGreaterThanOrEqual(DEFAULT_BAND_KG[0]);
    expect(r.tension.mainsKg[1]).toBeLessThanOrEqual(DEFAULT_BAND_KG[1]);
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.raisedBy).toMatch(/Link your racket/);
  });

  it("copes with no racket at all", () => {
    const r = recommendStrings(stringsInput({ racket: undefined }));
    expect(r.tension.anchoredTo).toBe("default_band");
    expect(codes(r)).toContain("band_unknown");
  });
});

describe("recommendStrings — history, cadence, confidence", () => {
  it("is low confidence with no history and names logging as the way up", () => {
    const r = recommendStrings(stringsInput({ history: [] }));
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.raisedBy).toMatch(/Log your finished string jobs/);
    expect(codes(r)).toContain("history_none");
    expect(r.restringCadence).toBeUndefined();
  });

  it("quotes a cadence from two finished jobs with hours (p1: 14 h and 22 h → 18 h) and is medium confidence", () => {
    const r = recommendStrings(stringsInput({ history: P1_HISTORY }));
    expect(r.restringCadence).toEqual({ hours: 18, basis: "based on your last 2 finished string jobs" });
    expect(codes(r)).toContain("current_setup_hours");
    expect(r.confidence.level).toBe("medium");
    expect(r.confidence.raisedBy).toBe("Log 1 more finished string job with hours played and this becomes high.");
  });

  it("does not quote a cadence from a single finished job", () => {
    const r = recommendStrings(stringsInput({ history: P1_HISTORY.slice(0, 1) }));
    expect(r.restringCadence).toBeUndefined();
  });

  it("reaches high confidence with three finished jobs, a known band and a known level", () => {
    const three = [...P1_HISTORY.slice(0, 2), { ...P1_HISTORY[2], retiredAt: "2026-09-01T00:00:00.000Z", retiredReason: "dead" as const, hoursPlayed: 20 }];
    const r = recommendStrings(stringsInput({ history: three }));
    expect(r.confidence.level).toBe("high");
  });

  it("is low confidence when the level is unknown even with a good history, and says what to add", () => {
    const r = recommendStrings(stringsInput({ profile: UNKNOWN_PROFILE, history: P1_HISTORY }));
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.raisedBy).toMatch(/playing level/);
    expect(codes(r)).toContain("profile_level_unknown");
    // Still a concrete recommendation — "we don't know enough" is not advice.
    expect(r.material.material).toBe("co_polyester");
    expect(r.tension.mainsKg).toHaveLength(2);
    expect(r.pickFromCatalogue.productIds.length).toBeGreaterThan(0);
  });
});

describe("recommendStrings — pain mentioned", () => {
  it("emits exactly one caution, names no condition, and leans to comfort", () => {
    const r = recommendStrings(stringsInput({ profile: PAIN_MENTIONED, history: P1_HISTORY }));
    expect(r.cautions).toHaveLength(1);
    expect(r.cautions[0].code).toBe("seek_qualified_assessment");
    expect(allText(r)).not.toMatch(/elbow|tendin|injur|shoulder|wrist|\bpain\b/i);
    expect(r.material.material).toBe("multifilament");
    expect(codes(r)).toContain("comfort_profile");
  });

  it("emits no caution when nothing is mentioned", () => {
    expect(recommendStrings(stringsInput()).cautions).toEqual([]);
  });
});

describe("recommendStrings — priorities and spin", () => {
  it("spin priority → shaped co-poly picks", () => {
    const r = recommendStrings(stringsInput({ prefs: { wantsMoreSpin: true } }));
    expect(r.material.material).toBe("co_polyester");
    expect(codes(r)).toContain("spin_priority");
    for (const id of r.pickFromCatalogue.productIds) {
      const s = CATALOGUE_STRINGS.find((c) => c.id === id)!;
      expect(s.shape !== "round" || s.spin >= 8).toBe(true);
    }
    // Advanced, no comfort ask, not a breaker → thinner gauge.
    expect(r.gauge.mm).toBe(1.2);
    expect(r.pickFromCatalogue.productIds[0]).toBe("prod-solinco-tour-bite-125");
  });

  it("an aggressive baseliner profile counts as a spin signal without being asked", () => {
    const r = recommendStrings(stringsInput({ profile: { ...ADULT_ADVANCED, styleAggression: 8 } }));
    expect(codes(r)).toContain("spin_priority");
  });

  it("control → co-poly, half a kilo up; power → multifilament, lower half", () => {
    const control = recommendStrings(stringsInput({ prefs: { priority: "control" } }));
    const power = recommendStrings(stringsInput({ prefs: { priority: "power" } }));
    expect(control.material.material).toBe("co_polyester");
    expect(codes(control)).toContain("tension_control");
    expect(power.material.material).toBe("multifilament");
    expect(codes(power)).toContain("tension_lower_half");
    expect(power.tension.mainsKg[0]).toBeLessThan(control.tension.mainsKg[0]);
  });

  it("balanced → soft co-poly with a hybrid card", () => {
    const r = recommendStrings(stringsInput({ prefs: { priority: "balanced" } }));
    expect(r.material.material).toBe("co_polyester");
    expect(r.hybrid).toBeDefined();
    expect(codes(r)).toContain("priority_balanced");
  });
});

describe("recommendStrings — output hygiene", () => {
  it("is deterministic", () => {
    const input = stringsInput({ history: P1_HISTORY, prefs: { wantsMoreSpin: true }, nextTournament: { name: "X", startDate: "2026-10-01T00:00:00.000Z", physics: HOT_THIN_PHYSICS } });
    expect(recommendStrings(input)).toEqual(recommendStrings(input));
  });

  it("never returns more than two alternatives, quotes kg only, and crosses equal mains", () => {
    const r = recommendStrings(stringsInput({ history: P1_HISTORY }));
    expect(r.alternatives.length).toBeLessThanOrEqual(2);
    expect(r.tension.crossesKg).toEqual(r.tension.mainsKg);
    expect(r.tension.mainsKg[0]).toBeLessThan(r.tension.mainsKg[1]);
    expect(JSON.stringify(r)).not.toMatch(/lbs|pounds/i);
  });

  it("says the catalogue ratings are estimates whenever it used them", () => {
    const r = recommendStrings(stringsInput({ prefs: { wantsArmComfort: true } }));
    expect(codes(r)).toContain("ratings_are_estimates");
    expect(r.reasons.find((x) => x.code === "ratings_are_estimates")!.textEn).toMatch(/rated, not measured/);
  });

  it("still returns picks when no product matches the gauge, by relaxing the filters", () => {
    const r = recommendStrings(stringsInput({ profile: JUNIOR_U14, prefs: { breaksOften: true } })); // 1.35 mm multi — none in the catalogue
    expect(r.gauge.mm).toBe(1.35);
    expect(r.pickFromCatalogue.productIds.length).toBeGreaterThan(0);
    for (const id of r.pickFromCatalogue.productIds) {
      expect(CATALOGUE_STRINGS.find((c) => c.id === id)!.material).toBe("multifilament");
    }
  });

  it("returns an empty pick list rather than a wrong one when the material is absent from the slice", () => {
    const r = recommendStrings(stringsInput({ prefs: { wantsArmComfort: true }, catalogue: CATALOGUE_STRINGS.filter((s) => s.material !== "multifilament") }));
    expect(r.pickFromCatalogue.productIds).toEqual([]);
  });
});
