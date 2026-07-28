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
      injuries: "Recovering right shoulder",
    });
    expect(pf.playingLevel).toBe("Intermediate");
    expect(pf.dominantHand).toBe("left");
    expect(pf.backhandType).toBe("two_handed");
    expect(pf.preferredSurface).toBe("clay");
    expect(pf.technicalStrengths).toEqual(["Serve", "Forehand"]);
    expect(pf.technicalWeaknesses).toEqual(["Backhand", "Movement"]);
    expect(pf.currentGoals).toBe("Win a tournament");
    expect(pf.injuryRestrictions).toBe("Recovering right shoulder");
  });

  it("handles missing / custom answers gracefully", () => {
    const pf = onboardingToPlayerProfile({ playingLevel: "My own level", strengths: "Serve" });
    expect(pf.playingLevel).toBe("My own level");
    expect(pf.dominantHand).toBeUndefined(); // unrecognised → left unset, not guessed
    expect(pf.technicalStrengths).toEqual(["Serve"]); // string coerced to array
    expect(pf.technicalWeaknesses).toEqual([]);
  });
});
