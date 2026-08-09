import { describe, it, expect } from "vitest";
import { generateSession } from "../generateSession";
import { DRILL_LIBRARY } from "../drills";
import { LEVEL_RANK } from "../types";
import type { SessionPreferences } from "../types";

const base: SessionPreferences = {
  level: "intermediate",
  focusAreas: ["serve", "forehand"],
  durationMinutes: 90,
  intensity: "medium",
  format: "individual",
  playersCount: 1,
  surface: "hard",
  goal: "technical",
};

describe("generateSession", () => {
  it("block minutes sum exactly to the requested duration", () => {
    for (const d of [45, 60, 75, 90, 120]) {
      const s = generateSession({ ...base, durationMinutes: d });
      expect(s.totalMinutes).toBe(d);
      const sum = s.blocks.reduce((a, b) => a + b.minutes, 0);
      expect(sum).toBe(d);
    }
  });

  it("keeps blocks in the canonical warm-up → … → cool-down order", () => {
    const s = generateSession(base);
    const order = s.blocks.map((b) => b.kind);
    const rank = { warmup: 0, technical: 1, tactical: 2, live: 3, cooldown: 4 } as const;
    for (let i = 1; i < order.length; i++) {
      expect(rank[order[i]]).toBeGreaterThan(rank[order[i - 1]]);
    }
  });

  it("always includes a warm-up and a cool-down for a full-length session", () => {
    const s = generateSession(base);
    const kinds = s.blocks.map((b) => b.kind);
    expect(kinds).toContain("warmup");
    expect(kinds).toContain("cooldown");
  });

  it("every drill carries what-to-do, at least one how-to cue, and a success criterion", () => {
    const s = generateSession(base);
    const drills = s.blocks.flatMap((b) => b.drills);
    expect(drills.length).toBeGreaterThan(0);
    for (const d of drills) {
      expect(d.whatToDo.length).toBeGreaterThan(0);
      expect(d.howToDo.length).toBeGreaterThan(0);
      expect(d.successCriteria.length).toBeGreaterThan(0);
      expect(d.durationMinutes).toBeGreaterThan(0);
    }
  });

  it("the technical block reflects a chosen focus area", () => {
    const s = generateSession({ ...base, focusAreas: ["serve"], goal: "technical" });
    const tech = s.blocks.find((b) => b.kind === "technical");
    expect(tech).toBeDefined();
    // A serve-focused technical block should surface a serve drill.
    const names = tech!.drills.map((d) => d.name.toLowerCase()).join(" ");
    expect(names).toContain("serve");
  });

  it("keeps the technical block on-focus when enough matching drills exist", () => {
    const s = generateSession({ ...base, focusAreas: ["serve", "forehand"], goal: "technical", durationMinutes: 90 });
    const tech = s.blocks.find((b) => b.kind === "technical")!;
    for (const drill of tech.drills) {
      const tpl = DRILL_LIBRARY.find((d) => d.name === drill.name)!;
      const hitsFocus = tpl.focus.some((f) => (["serve", "forehand"] as string[]).includes(f));
      expect(hitsFocus).toBe(true); // no off-focus (e.g. backhand-only) drills sneak in
    }
  });

  it("recovery goal forces low intensity and a large cool-down share", () => {
    const s = generateSession({ ...base, goal: "recovery", intensity: "high", durationMinutes: 60 });
    expect(s.intensity).toBe("low");
    const cooldown = s.blocks.find((b) => b.kind === "cooldown")!;
    const live = s.blocks.find((b) => b.kind === "live");
    expect(cooldown.minutes).toBeGreaterThan(live?.minutes ?? 0);
  });

  it("group format never selects a drill that isn't group-suitable", () => {
    const s = generateSession({ ...base, format: "group", playersCount: 6 });
    const chosenNames = new Set(s.blocks.flatMap((b) => b.drills.map((d) => d.name)));
    for (const name of chosenNames) {
      const tpl = DRILL_LIBRARY.find((d) => d.name === name)!;
      expect(tpl.suitsGroup).toBe(true);
    }
  });

  it("beginner sessions never include drills above the player's level", () => {
    const s = generateSession({ ...base, level: "beginner" });
    const chosenNames = new Set(s.blocks.flatMap((b) => b.drills.map((d) => d.name)));
    for (const name of chosenNames) {
      const tpl = DRILL_LIBRARY.find((d) => d.name === name)!;
      expect(LEVEL_RANK[tpl.minLevel]).toBeLessThanOrEqual(LEVEL_RANK["beginner"]);
    }
  });

  it("is deterministic — identical preferences produce identical sessions", () => {
    expect(JSON.stringify(generateSession(base))).toBe(JSON.stringify(generateSession({ ...base })));
  });

  it("clamps an out-of-range duration into a sane bound", () => {
    expect(generateSession({ ...base, durationMinutes: 5 }).totalMinutes).toBe(20);
    expect(generateSession({ ...base, durationMinutes: 999 }).totalMinutes).toBe(180);
  });

  it("builds an equipment checklist from the chosen drills", () => {
    const s = generateSession(base);
    const fromDrills = new Set(s.blocks.flatMap((b) => b.drills.flatMap((d) => d.equipment)));
    for (const item of s.equipmentChecklist) expect(fromDrills.has(item)).toBe(true);
  });
});
