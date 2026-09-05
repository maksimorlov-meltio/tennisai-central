import { describe, it, expect } from "vitest";
import { ageBandFromYears, ageYearsAt, deriveProfileFacts, mentionsPain, normalisePlayingLevel } from "./profileFacts";

const NOW = "2026-09-04T12:00:00.000Z";

const emptyProfile = {
  dateOfBirth: null,
  playingLevel: null,
  preferredSurface: null,
  injuryRestrictions: null,
  physicalLimitations: [] as string[],
  styleAggression: null,
  suitClay: null,
  suitHard: null,
  suitGrass: null,
  suitIndoor: null,
};

describe("normalisePlayingLevel", () => {
  it("maps the onboarding picker's four options", () => {
    expect(normalisePlayingLevel("Beginner")).toBe("beginner");
    expect(normalisePlayingLevel("Intermediate")).toBe("intermediate");
    expect(normalisePlayingLevel("Advanced")).toBe("advanced");
    expect(normalisePlayingLevel("Competitive / tournament")).toBe("competitive");
  });

  it("returns undefined for empty or unrecognised text rather than guessing", () => {
    expect(normalisePlayingLevel(null)).toBeUndefined();
    expect(normalisePlayingLevel("   ")).toBeUndefined();
    expect(normalisePlayingLevel("weekend warrior")).toBeUndefined();
  });
});

describe("ageYearsAt / ageBandFromYears", () => {
  it("counts whole years, respecting the birthday", () => {
    expect(ageYearsAt("2012-09-05", NOW)).toBe(13); // birthday tomorrow
    expect(ageYearsAt("2012-09-04", NOW)).toBe(14); // birthday today
  });

  it("returns undefined for garbage", () => {
    expect(ageYearsAt("not-a-date", NOW)).toBeUndefined();
    expect(ageYearsAt(null, NOW)).toBeUndefined();
  });

  it("bands like tournament age categories", () => {
    expect(ageBandFromYears(11)).toBe("u12");
    expect(ageBandFromYears(13)).toBe("u14");
    expect(ageBandFromYears(15)).toBe("u16");
    expect(ageBandFromYears(18)).toBe("u18");
    expect(ageBandFromYears(19)).toBe("adult");
  });
});

describe("mentionsPain", () => {
  it("is true for any injuryRestrictions text", () => {
    expect(mentionsPain({ ...emptyProfile, injuryRestrictions: "avoid overhead serves" })).toBe(true);
  });

  it("matches limitation entries only on pain/injury words, word-bounded", () => {
    expect(mentionsPain({ ...emptyProfile, physicalLimitations: ["low stamina"] })).toBe(false);
    expect(mentionsPain({ ...emptyProfile, physicalLimitations: ["weak backhand"] })).toBe(false);
    expect(mentionsPain({ ...emptyProfile, physicalLimitations: ["sore shoulder"] })).toBe(true);
  });

  it("is false with no profile", () => {
    expect(mentionsPain(null)).toBe(false);
  });
});

describe("deriveProfileFacts", () => {
  it("handles a player with no profile and no DOB (p1 today)", () => {
    const f = deriveProfileFacts({ user: { dateOfBirth: null }, profile: null }, NOW);
    expect(f).toEqual({
      level: undefined,
      ageYears: undefined,
      ageBand: undefined,
      preferredSurface: undefined,
      styleAggression: undefined,
      suit: undefined,
      prefersComfort: false,
      painMentioned: false,
    });
  });

  it("falls back to the account's date of birth when the profile has none", () => {
    const f = deriveProfileFacts({ user: { dateOfBirth: "2011-01-01" }, profile: { ...emptyProfile, playingLevel: "Intermediate" } }, NOW);
    expect(f.ageYears).toBe(15);
    expect(f.ageBand).toBe("u16");
    expect(f.level).toBe("intermediate");
  });

  it("reduces injury text to two booleans and never carries the text", () => {
    const f = deriveProfileFacts({ user: null, profile: { ...emptyProfile, injuryRestrictions: "tennis elbow, left" } }, NOW);
    expect(f.prefersComfort).toBe(true);
    expect(f.painMentioned).toBe(true);
    expect(JSON.stringify(f)).not.toMatch(/elbow/);
  });

  it("collects the suitability scores only when at least one is set", () => {
    const none = deriveProfileFacts({ user: null, profile: emptyProfile }, NOW);
    expect(none.suit).toBeUndefined();
    const some = deriveProfileFacts({ user: null, profile: { ...emptyProfile, suitClay: 8 } }, NOW);
    expect(some.suit).toEqual({ clay: 8, hard: undefined, grass: undefined, indoor: undefined });
  });
});
