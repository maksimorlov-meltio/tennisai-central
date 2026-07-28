import { describe, it, expect } from "vitest";
import { generateSession } from "../generateSession";
import { sessionToTrainingPlanInput } from "../toTrainingPlan";
import type { SessionPreferences } from "../types";

const prefs: SessionPreferences = {
  level: "intermediate",
  focusAreas: ["serve", "forehand"],
  durationMinutes: 90,
  intensity: "high",
  format: "individual",
  playersCount: 1,
  surface: "clay",
  goal: "technical",
};

describe("sessionToTrainingPlanInput", () => {
  const session = generateSession(prefs);
  const input = sessionToTrainingPlanInput(session, "player-123");

  it("targets the given player and carries the session title", () => {
    expect(input.playerId).toBe("player-123");
    expect(input.title).toBe(session.title);
  });

  it("flattens every session drill into a plan drill", () => {
    const drillCount = session.blocks.reduce((n, b) => n + b.drills.length, 0);
    expect(input.drills.length).toBe(drillCount);
  });

  it("preserves what AND how in each drill's instructions", () => {
    for (const d of input.drills) {
      expect(d.objective.length).toBeGreaterThan(0);
      expect(d.instructions).toContain("How:");
      expect(d.successCriteria.length).toBeGreaterThan(0);
      expect(d.intensity).toBe("high");
    }
  });

  it("joins equipment into a single string", () => {
    const withGear = input.drills.find((d) => d.equipment);
    if (withGear) expect(typeof withGear.equipment).toBe("string");
  });
});
