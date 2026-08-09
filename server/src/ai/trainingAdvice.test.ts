import { describe, it, expect } from "vitest";
import {
  buildEvidence,
  buildUserPrompt,
  evidenceHash,
  parseAdvice,
  restoreNames,
  adviceSchema,
  PROMPT_VERSION,
  type TrainingRow,
} from "./trainingAdvice";

// Pure — no database, no network. Everything here is the part of the feature
// that must hold regardless of which provider is plugged in.

function row(over: Partial<TrainingRow> = {}): TrainingRow {
  return {
    title: "Morning drills",
    trainingType: "individual",
    intensity: "medium",
    goal: "Backhand consistency",
    startDate: new Date("2026-07-01T09:00:00.000Z"),
    endDate: new Date("2026-07-01T10:30:00.000Z"),
    review: { rating: 4, workedOn: "Cross-court depth", nextSteps: "Add movement" },
    playerSessionFeedback: {
      feeling: "good",
      energyLevel: 3,
      tags: ["Good pace", "Learned a lot"],
      note: "Backhand felt better",
    },
    ...over,
  };
}

describe("buildEvidence", () => {
  it("keeps the coach review and the player feedback that the advice depends on", () => {
    const e = buildEvidence([row()], 1);
    expect(e.sessions).toHaveLength(1);
    expect(e.sessions[0]).toMatchObject({
      date: "2026-07-01",
      durationMinutes: 90,
      coachRating: 4,
      workedOn: "Cross-court depth",
      nextSteps: "Add movement",
      playerFeeling: "good",
      playerEnergy: 3,
      playerTags: ["Good pace", "Learned a lot"],
      playerNote: "Backhand felt better",
    });
    expect(e.reviewedCount).toBe(1);
    expect(e.feedbackCount).toBe(1);
  });

  it("carries no player identity — only positional labels", () => {
    const e = buildEvidence([row()], 3);
    expect(e.players).toEqual(["Player 1", "Player 2", "Player 3"]);
    expect(e.scope).toBe("group");
    // The whole payload that goes to the provider, searched for anything
    // resembling an identity.
    const payload = buildUserPrompt(e);
    expect(payload).not.toMatch(/@/); // no email
    expect(payload).not.toMatch(/\b(firstName|lastName|email|userId|playerId)\b/);
  });

  it("survives Json columns that are null, malformed, or the wrong type", () => {
    const e = buildEvidence(
      [
        row({ review: null, playerSessionFeedback: null }),
        row({ review: "not an object" as unknown, playerSessionFeedback: 42 as unknown }),
        row({ review: { rating: "four" }, playerSessionFeedback: { tags: "nope" } }),
      ],
      1,
    );
    expect(e.sessions).toHaveLength(3);
    expect(e.sessions.every((s) => Array.isArray(s.playerTags))).toBe(true);
    expect(e.sessions[1].coachRating).toBeNull();
    expect(e.sessions[2].coachRating).toBeNull(); // "four" is not a number
    expect(e.reviewedCount).toBe(0);
    expect(e.feedbackCount).toBe(0);
  });

  it("hashes identically for identical evidence and differently otherwise", () => {
    const a = buildEvidence([row()], 1);
    const b = buildEvidence([row()], 1);
    const c = buildEvidence([row({ goal: "Serve placement" })], 1);
    expect(evidenceHash(a, PROMPT_VERSION)).toBe(evidenceHash(b, PROMPT_VERSION));
    expect(evidenceHash(a, PROMPT_VERSION)).not.toBe(evidenceHash(c, PROMPT_VERSION));
    // A prompt change must invalidate the fingerprint too.
    expect(evidenceHash(a, PROMPT_VERSION)).not.toBe(evidenceHash(a, "other/9"));
  });
});

const validAdvice = {
  summary: "Player 1 is progressing on the backhand but tiring late in sessions.",
  focusAreas: ["Backhand depth", "Recovery"],
  suggestedSessions: [
    {
      title: "Backhand depth under movement",
      goal: "Hold depth cross-court while moving",
      trainingType: "individual",
      intensity: "medium",
      durationMinutes: 90,
      rationale: "Coach noted 'Add movement' as the next step for Player 1.",
      drills: ["Cross-court rally to target zone"],
    },
  ],
  cautions: ["Energy was rated 3/5 twice — keep the live block short."],
};

describe("parseAdvice", () => {
  it("accepts a clean JSON object", () => {
    expect(parseAdvice(JSON.stringify(validAdvice)).focusAreas).toEqual([
      "Backhand depth",
      "Recovery",
    ]);
  });

  it("tolerates a markdown fence and leading prose, which models add anyway", () => {
    expect(parseAdvice("```json\n" + JSON.stringify(validAdvice) + "\n```").summary).toContain(
      "backhand",
    );
    expect(
      parseAdvice("Here is the plan:\n" + JSON.stringify(validAdvice)).suggestedSessions,
    ).toHaveLength(1);
  });

  it("rejects a wrong shape rather than passing it through", () => {
    // An invented training type is the realistic failure: plausible, and wrong.
    const bad = {
      ...validAdvice,
      suggestedSessions: [{ ...validAdvice.suggestedSessions[0], trainingType: "yoga" }],
    };
    expect(() => parseAdvice(JSON.stringify(bad))).toThrow(/expected shape/i);
    expect(() => parseAdvice("not json at all")).toThrow();
    expect(() => parseAdvice(JSON.stringify({ summary: "hi" }))).toThrow();
  });

  it("rejects an empty recommendation set", () => {
    expect(adviceSchema.safeParse({ ...validAdvice, suggestedSessions: [] }).success).toBe(false);
  });
});

describe("restoreNames", () => {
  it("puts the coach's own player names back", () => {
    const out = restoreNames(adviceSchema.parse(validAdvice), ["Alex"]);
    expect(out.summary).toContain("Alex");
    expect(out.summary).not.toContain("Player 1");
    expect(out.suggestedSessions[0].rationale).toContain("Alex");
  });

  it("does not mangle Player 10 into Player 1 + '0'", () => {
    const advice = adviceSchema.parse({
      ...validAdvice,
      summary: "Player 1 and Player 10 both improved.",
    });
    const names = Array.from({ length: 10 }, (_, i) => `Name${i + 1}`);
    expect(restoreNames(advice, names).summary).toBe("Name1 and Name10 both improved.");
  });
});
