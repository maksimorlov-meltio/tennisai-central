import { describe, it, expect } from "vitest";
import { onboardingToPlayerProfile } from "./onboardingProfile";

describe("onboardingToPlayerProfile", () => {
  it("maps and normalises player answers into structured fields", () => {
    const pf = onboardingToPlayerProfile({
      playingLevel: "Intermediate",
      dominantHand: "Left",
      backhand: "Two-handed",
      preferredSurface: "Clay",
      strengths: ["Serve", "Forehand"],
      improve: ["Backhand", "Movement"],
      goal: "Win a tournament",
    });
    expect(pf.playingLevel).toBe("Intermediate");
    expect(pf.dominantHand).toBe("left");
    expect(pf.backhandType).toBe("two_handed");
    expect(pf.preferredSurface).toBe("clay");
    expect(pf.technicalStrengths).toEqual(["Serve", "Forehand"]);
    expect(pf.technicalWeaknesses).toEqual(["Backhand", "Movement"]);
    expect(pf.currentGoals).toBe("Win a tournament");
  });

  it("does NOT persist free-text injury / health data (GDPR Art.9)", () => {
    // Even if a stray health answer is present, it must never be mapped into a
    // structured profile field.
    const pf = onboardingToPlayerProfile({ injuries: "Recovering right shoulder" });
    expect(pf).not.toHaveProperty("injuryRestrictions");
    expect(pf).not.toHaveProperty("physicalLimitations");
  });

  it("handles missing / custom answers gracefully", () => {
    const pf = onboardingToPlayerProfile({ playingLevel: "My own level", strengths: "Serve" });
    expect(pf.playingLevel).toBe("My own level");
    expect(pf.dominantHand).toBeUndefined(); // unrecognised → left unset, not guessed
    expect(pf.technicalStrengths).toEqual(["Serve"]); // string coerced to array
    expect(pf.technicalWeaknesses).toEqual([]);
  });
});
