import { describe, it, expect } from "vitest";
import { questionsForRole, ROLE_ONBOARDING_TITLE } from "../questions";
import type { UserRole } from "@/types";

const ROLES: UserRole[] = ["player", "coach", "observer", "admin"];

describe("onboarding questions", () => {
  it("every role has at least one question and a title", () => {
    for (const r of ROLES) {
      expect(questionsForRole(r).length).toBeGreaterThan(0);
      expect(ROLE_ONBOARDING_TITLE[r].length).toBeGreaterThan(0);
    }
  });

  it("each question is well-formed and choice questions have options", () => {
    for (const r of ROLES) {
      const ids = new Set<string>();
      for (const q of questionsForRole(r)) {
        expect(q.id.length).toBeGreaterThan(0);
        expect(q.prompt.length).toBeGreaterThan(0);
        expect(["single", "multi", "text"]).toContain(q.type);
        if (q.type === "single" || q.type === "multi") {
          expect(Array.isArray(q.options) && q.options.length >= 2).toBe(true);
        }
        expect(ids.has(q.id)).toBe(false); // ids unique within a role
        ids.add(q.id);
      }
    }
  });

  it("players are asked the core profile questions", () => {
    const ids = questionsForRole("player").map((q) => q.id);
    for (const key of ["playingLevel", "dominantHand", "backhand", "preferredSurface", "goal"]) {
      expect(ids).toContain(key);
    }
  });
});
