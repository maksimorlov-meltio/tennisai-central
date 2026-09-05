// ============================================================================
// Unit tests — tournament fit engine.
//
// Each case is one rule from docs/recommendations.md. Assertions are on the
// score AND on the component / reason that explains it.
// ============================================================================

import { describe, it, expect } from "vitest";
import { recommendTournaments, haversineKm, parseMaxAge, ownCostHistory, WEIGHTS, TOP_N, OTHERS_CAP } from "./tournaments";
import {
  tournamentsInput,
  ADULT_INTERMEDIATE,
  JUNIOR_15,
  UTR_PLAYER,
  UNKNOWN_PROFILE,
  BERLIN,
  MUNICH,
  OPEN_UTR,
  STRONG_UTR,
  ITF_JUNIOR,
  U14,
  PRO_500,
  DEADLINE_PASSED,
  CLASHES_ENTRY,
  CLASHES_TRAINING,
  ENTERED,
  USER_HIDDEN,
  TIE_A,
  TIE_B,
  TIE_C,
  NO_COORDS,
  FINANCE_WITH_HISTORY,
  iso,
} from "./__fixtures__/tournaments";

type Out = ReturnType<typeof recommendTournaments>;
const all = (r: Out) => [...r.top, ...r.others];
const find = (r: Out, id: string) => all(r).find((x) => x.tournamentId === id);
const hiddenOf = (r: Out, id: string) => r.hidden.find((x) => x.tournamentId === id);
const component = (r: Out, id: string, code: string) => find(r, id)!.components.find((c) => c.code === code)!;
const globalCodes = (r: Out) => r.reasonsGlobal.map((x) => x.code);

describe("recommendTournaments — age eligibility (hard filter)", () => {
  it("hides a 14 & Under event from a 15-year-old with a why-not, never silently", () => {
    const r = recommendTournaments(tournamentsInput({ profile: JUNIOR_15 }));
    const h = hiddenOf(r, U14.id)!;
    expect(h).toBeDefined();
    expect(h.code).toBe("age_ineligible");
    expect(h.textEn).toMatch(/14 & Under/);
    expect(h.textEn).toMatch(/you will be 15/);
    expect(find(r, U14.id)).toBeUndefined();
  });

  it("keeps an eligible junior in and says so", () => {
    const r = recommendTournaments(tournamentsInput({ profile: JUNIOR_15 }));
    const fit = find(r, ITF_JUNIOR.id)!;
    expect(fit).toBeDefined();
    expect(fit.reasons.map((x) => x.code)).toContain("age_eligible");
  });

  it("takes the age AT THE EVENT'S START, not today", () => {
    // Turns 16 on 2027-03-01; a 15 & Under event starting after that is out.
    const later = { ...U14, id: "u15-later", ageCategory: "15 & Under", startDate: "2027-03-02T00:00:00.000Z", endDate: "2027-03-03T00:00:00.000Z", entryDeadline: "2027-02-01T00:00:00.000Z" };
    const sooner = { ...later, id: "u15-sooner", startDate: "2027-02-20T00:00:00.000Z", endDate: "2027-02-21T00:00:00.000Z" };
    const r = recommendTournaments(tournamentsInput({ profile: JUNIOR_15, candidates: [later, sooner], horizonDays: 365 }));
    expect(hiddenOf(r, "u15-later")?.code).toBe("age_ineligible");
    expect(find(r, "u15-sooner")).toBeDefined();
  });

  it("does NOT hide an age-restricted event when the date of birth is unknown — it says the check was skipped", () => {
    const r = recommendTournaments(tournamentsInput({ profile: { level: "advanced" } }));
    expect(hiddenOf(r, U14.id)).toBeUndefined();
    expect(find(r, U14.id)!.reasons.map((x) => x.code)).toContain("age_unchecked");
    expect(globalCodes(r)).toContain("profile_age_unknown");
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.raisedBy).toMatch(/date of birth/);
  });

  it("reads only the exact 'N & Under' shape", () => {
    expect(parseMaxAge("18 & Under")).toBe(18);
    expect(parseMaxAge("12 and under")).toBe(12);
    expect(parseMaxAge("Under 14")).toBeUndefined();
    expect(parseMaxAge("Open")).toBeUndefined();
    expect(parseMaxAge(undefined)).toBeUndefined();
  });
});

describe("recommendTournaments — other hidden reasons", () => {
  const r = recommendTournaments(tournamentsInput());

  it("hides an event whose entry deadline has passed", () => {
    expect(hiddenOf(r, DEADLINE_PASSED.id)?.code).toBe("entry_deadline_passed");
    // NOW is 12:00 UTC and the deadline was 00:00 the day before → 1.5 days, floored to 2.
    expect(hiddenOf(r, DEADLINE_PASSED.id)?.textEn).toMatch(/passed 2 days ago/);
  });

  it("hides an event the player already entered", () => {
    expect(hiddenOf(r, ENTERED.id)?.code).toBe("already_entered");
  });

  it("hides an event the player hid themselves", () => {
    expect(hiddenOf(r, USER_HIDDEN.id)?.code).toBe("hidden_by_you");
  });

  it("counts every hidden event in totals and keeps hidden[] date-ordered", () => {
    // deadline passed + already entered + hidden by you + the two age-restricted events an adult cannot enter.
    expect(r.totals.hidden).toBe(5);
    expect(hiddenOf(r, ITF_JUNIOR.id)?.code).toBe("age_ineligible");
    expect(r.totals.candidates).toBe(14);
    expect(r.totals.scored + r.totals.hidden).toBe(r.totals.candidates);
    const dates = r.hidden.map((h) => h.startDate);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("recommendTournaments — distance and origin", () => {
  it("with no origin the distance component is unknown, its weight is redistributed, and the gap is stated", () => {
    const r = recommendTournaments(tournamentsInput());
    const c = component(r, OPEN_UTR.id, "distance");
    expect(c.score).toBeNull();
    expect(c.textEn).toMatch(/home location is not known/);
    expect(find(r, OPEN_UTR.id)!.distanceKm).toBeNull();
    expect(globalCodes(r)).toContain("origin_unknown");
    // Level and age known, origin not → medium, and raisedBy is honest that the user cannot fix it in v1.
    expect(r.confidence.level).toBe("medium");
    expect(r.confidence.raisedBy).toMatch(/no home location/);
  });

  it("with an origin it computes the distance and scores nearer events higher", () => {
    const r = recommendTournaments(tournamentsInput({ origin: BERLIN }));
    const near = find(r, OPEN_UTR.id)!;
    const far = find(r, PRO_500.id)!;
    expect(near.distanceKm).toBeLessThan(10);
    expect(far.distanceKm).toBeGreaterThan(480);
    expect(far.distanceKm).toBeLessThan(530);
    expect(component(r, OPEN_UTR.id, "distance").score).toBeGreaterThan(component(r, PRO_500.id, "distance").score!);
    expect(r.confidence.level).toBe("high");
  });

  it("an event without coordinates is unknown for distance even when the origin is known", () => {
    const r = recommendTournaments(tournamentsInput({ origin: BERLIN }));
    expect(component(r, NO_COORDS.id, "distance").score).toBeNull();
    expect(component(r, NO_COORDS.id, "distance").textEn).toMatch(/no coordinates/);
  });

  it("haversine: Berlin–Munich is about 504 km", () => {
    expect(Math.round(haversineKm(BERLIN, MUNICH))).toBeGreaterThan(495);
    expect(Math.round(haversineKm(BERLIN, MUNICH))).toBeLessThan(515);
  });
});

describe("recommendTournaments — level fit", () => {
  it("a UTR inside the event's range scores 100; outside is penalised per point", () => {
    const r = recommendTournaments(tournamentsInput({ profile: UTR_PLAYER }));
    expect(component(r, OPEN_UTR.id, "level_fit").score).toBe(100);
    // 7.5 vs 8–12 → 0.5 outside → 80.
    expect(component(r, STRONG_UTR.id, "level_fit").score).toBe(80);
    expect(component(r, STRONG_UTR.id, "level_fit").textEn).toMatch(/0\.5 outside/);
    expect(globalCodes(r)).toContain("profile_utr");
  });

  it("without a UTR the profile level becomes a wide band and the overlap is scored", () => {
    const r = recommendTournaments(tournamentsInput({ profile: ADULT_INTERMEDIATE }));
    // intermediate = 3–6: fully inside 1–16 → 100; no overlap with 8–12 → 0.
    expect(component(r, OPEN_UTR.id, "level_fit").score).toBe(100);
    expect(component(r, STRONG_UTR.id, "level_fit").score).toBe(0);
    expect(globalCodes(r)).toContain("profile_level_band");
  });

  it("a professional tour event scores low for a club player and says why", () => {
    const r = recommendTournaments(tournamentsInput({ profile: ADULT_INTERMEDIATE }));
    expect(component(r, PRO_500.id, "level_fit").score).toBe(5);
    expect(find(r, PRO_500.id)!.reasons.map((x) => x.code)).toContain("pro_tour_event");
  });

  it("with no level at all, level fit is unknown everywhere except professional tour events, and confidence is low with a profile fix", () => {
    const r = recommendTournaments(tournamentsInput({ profile: UNKNOWN_PROFILE }));
    for (const fit of all(r)) {
      const level = fit.components.find((c) => c.code === "level_fit")!;
      if (fit.tournamentId === PRO_500.id) expect(level.score).toBe(5);
      else expect(level.score).toBeNull();
    }
    // An empty profile must not put an ATP event at the top of the list.
    expect(r.top.map((x) => x.tournamentId)).not.toContain(PRO_500.id);
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.raisedBy).toMatch(/playing level/);
    expect(globalCodes(r)).toContain("profile_level_unknown");
  });
});

describe("recommendTournaments — surface, conflicts, deadline", () => {
  const r = recommendTournaments(tournamentsInput());

  it("scores surface from the profile's suitability numbers when present", () => {
    // Hard 5/10 → 44; Clay 8/10 → 78.
    expect(component(r, OPEN_UTR.id, "surface_fit").score).toBe(44);
    expect(component(r, PRO_500.id, "surface_fit").score).toBe(78);
  });

  it("falls back to the preferred surface, and is unknown with neither", () => {
    const pref = recommendTournaments(tournamentsInput({ profile: JUNIOR_15 }));
    expect(component(pref, OPEN_UTR.id, "surface_fit").score).toBe(80);
    expect(component(pref, PRO_500.id, "surface_fit").score).toBe(40);
    const none = recommendTournaments(tournamentsInput({ profile: { level: "advanced", dateOfBirth: "2000-01-01" } }));
    expect(component(none, OPEN_UTR.id, "surface_fit").score).toBeNull();
    expect(globalCodes(none)).toContain("surface_preference_unknown");
  });

  it("an overlap with an existing tournament entry scores 0; with a training 40; nothing 100", () => {
    expect(component(r, CLASHES_ENTRY.id, "calendar_conflicts").score).toBe(0);
    expect(component(r, CLASHES_ENTRY.id, "calendar_conflicts").textEn).toMatch(/already entered/);
    expect(component(r, CLASHES_TRAINING.id, "calendar_conflicts").score).toBe(40);
    expect(component(r, OPEN_UTR.id, "calendar_conflicts").score).toBe(100);
  });

  it("scores the entry deadline by days left and is unknown when none is listed", () => {
    // Deadline at 00:00 ten days on, from a 12:00 now → 9.5 days, floored.
    expect(find(r, OPEN_UTR.id)!.daysToDeadline).toBe(9);
    expect(component(r, OPEN_UTR.id, "entry_deadline").score).toBe(80);
    const jr = recommendTournaments(tournamentsInput({ profile: JUNIOR_15 }));
    expect(find(jr, ITF_JUNIOR.id)!.daysToDeadline).toBe(14);
    expect(component(jr, ITF_JUNIOR.id, "entry_deadline").score).toBe(100);
    expect(component(r, PRO_500.id, "entry_deadline").score).toBeNull();
    expect(find(r, PRO_500.id)!.daysToDeadline).toBeNull();
  });
});

describe("recommendTournaments — cost", () => {
  it("uses the player's own averages per category only with ≥3 rows in ONE currency, never mixing", () => {
    const h = ownCostHistory(FINANCE_WITH_HISTORY)!;
    expect(h.currency).toBe("EUR");
    expect(h.categories).toEqual(["travel", "accommodation"]);
    expect(h.amount).toBe(240); // avg travel 150 + avg accommodation 90; the USD flight and single food row are ignored
    const r = recommendTournaments(tournamentsInput({ finance: FINANCE_WITH_HISTORY }));
    expect(find(r, OPEN_UTR.id)!.estimatedCost).toMatchObject({ currency: "EUR", amount: 240, basis: "own_history" });
    expect(globalCodes(r)).toContain("cost_from_own_history");
  });

  it("falls back to a clearly labelled rough default only when a distance is known", () => {
    const withOrigin = recommendTournaments(tournamentsInput({ origin: BERLIN }));
    const est = find(withOrigin, PRO_500.id)!.estimatedCost!;
    expect(est.basis).toBe("rough_default");
    expect(est.textEn).toMatch(/rough default/);
    expect(est.amount).toBe(400);
    const noOrigin = recommendTournaments(tournamentsInput());
    expect(find(noOrigin, PRO_500.id)!.estimatedCost).toBeNull();
    expect(component(noOrigin, PRO_500.id, "estimated_cost").score).toBeNull();
  });

  it("says once, globally, that entry fees are unknown", () => {
    const r = recommendTournaments(tournamentsInput());
    expect(globalCodes(r).filter((c) => c === "fee_unknown")).toHaveLength(1);
  });
});

describe("recommendTournaments — scoring arithmetic and ordering", () => {
  it("weights only the KNOWN components and says how many were unknown", () => {
    const r = recommendTournaments(tournamentsInput());
    const fit = find(r, OPEN_UTR.id)!;
    const known = fit.components.filter((c) => c.score !== null);
    const expected = Math.round(known.reduce((s, c) => s + c.weight * c.score!, 0) / known.reduce((s, c) => s + c.weight, 0));
    expect(fit.score).toBe(expected);
    // level 100×30 + surface 44×15 + conflicts 100×15 + deadline 80×10 over 70 → 85.
    expect(fit.score).toBe(85);
    const unknown = fit.reasons.find((x) => x.code === "components_unknown")!;
    expect(unknown.params.count).toBe(2);
    expect(unknown.params.codes).toBe("distance,estimated_cost");
    expect(Object.values(WEIGHTS).reduce((s, w) => s + w, 0)).toBe(100);
  });

  it("orders by score desc, then start date, then id — and is deterministic", () => {
    const r = recommendTournaments(tournamentsInput({ profile: UNKNOWN_PROFILE }));
    const ties = all(r).filter((x) => x.tournamentId.startsWith("tie-"));
    expect(ties.map((x) => x.score)).toEqual([ties[0].score, ties[0].score, ties[0].score]);
    expect(ties.map((x) => x.tournamentId)).toEqual([TIE_C.id, TIE_A.id, TIE_B.id]);
    expect(recommendTournaments(tournamentsInput({ profile: UNKNOWN_PROFILE }))).toEqual(r);
  });

  it("puts the highest score first", () => {
    const r = recommendTournaments(tournamentsInput());
    const scores = all(r).map((x) => x.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("caps top at five and others at the cap, reporting what was omitted", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ ...OPEN_UTR, id: `bulk-${String(i).padStart(3, "0")}`, name: `Bulk ${i}` }));
    const r = recommendTournaments(tournamentsInput({ candidates: many, enteredTournamentIds: [], userHiddenIds: [] }));
    expect(r.top).toHaveLength(TOP_N);
    expect(r.others).toHaveLength(OTHERS_CAP);
    expect(r.totals).toEqual({ candidates: 70, scored: 70, hidden: 0, othersOmitted: 70 - TOP_N - OTHERS_CAP, hiddenOmitted: 0 });
  });

  it("copes with no candidates at all", () => {
    const r = recommendTournaments(tournamentsInput({ candidates: [] }));
    expect(r.top).toEqual([]);
    expect(r.others).toEqual([]);
    expect(r.hidden).toEqual([]);
    expect(r.totals.candidates).toBe(0);
    expect(r.reasonsGlobal.find((x) => x.code === "horizon")!.textEn).toMatch(/0 events/);
  });

  it("never quotes a number it did not have: no distance text without an origin, no UTR text without a UTR", () => {
    const r = recommendTournaments(tournamentsInput({ profile: UNKNOWN_PROFILE }));
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/km from home/);
    expect(text).not.toMatch(/your UTR \d/);
    expect(text).not.toMatch(/you will be \d/);
    expect(iso(0)).toBe("2026-09-04T00:00:00.000Z");
  });
});
