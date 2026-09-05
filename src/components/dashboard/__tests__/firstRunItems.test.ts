// ============================================================================
// First-run checklist builders — one describe per role.
//
// What these prove: every `done` flag is a pure function of the facts a
// dashboard already has (connections, plans, tournaments, onboarding answers).
// No builder reads storage, and the single `manual` item (the parent's consent
// review) is the only one that is not derivable — and it says so.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  adminItems,
  coachItems,
  hasCoachCounterpart,
  isProfileComplete,
  observerItems,
  playerItems,
} from "@/components/dashboard/firstRunItems";
import { questionsForRole } from "@/lib/onboarding/questions";
import type { ConnectionRequest } from "@/types";

/** Identity translator — tests assert on keys, not on English copy. */
const t = (key: string) => key;

function rel(over: Partial<ConnectionRequest>): ConnectionRequest {
  return {
    id: "r1",
    fromUserId: "p1",
    fromUserName: "Alex",
    fromUserRole: "player",
    toUserId: "c1",
    toUserName: "Jordan",
    toUserRole: "coach",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** Every required question for a role answered with something non-empty. */
function fullAnswers(role: "player" | "coach" | "observer" | "admin") {
  const answers: Record<string, string | string[]> = {};
  for (const q of questionsForRole(role)) {
    if (q.optional) continue;
    answers[q.id] = q.type === "multi" ? ["x"] : "x";
  }
  return answers;
}

describe("isProfileComplete", () => {
  it("is false for a fresh account (no answers) and for a null payload", () => {
    expect(isProfileComplete("player", null)).toBe(false);
    expect(isProfileComplete("player", undefined)).toBe(false);
    expect(isProfileComplete("player", {})).toBe(false);
  });

  it("is true only when every REQUIRED question has a non-empty answer", () => {
    const answers = fullAnswers("player");
    expect(isProfileComplete("player", answers)).toBe(true);
    // Blank a required one — whitespace does not count as an answer.
    const first = questionsForRole("player").find((q) => !q.optional)!;
    expect(isProfileComplete("player", { ...answers, [first.id]: "   " })).toBe(false);
    // An empty multi-select does not count either.
    const multi = questionsForRole("player").find((q) => q.type === "multi" && !q.optional)!;
    expect(isProfileComplete("player", { ...answers, [multi.id]: [] })).toBe(false);
  });

  it("ignores optional questions (a coach need not name a club)", () => {
    const answers = fullAnswers("coach");
    expect(questionsForRole("coach").some((q) => q.optional)).toBe(true);
    expect(isProfileComplete("coach", answers)).toBe(true);
  });
});

describe("hasCoachCounterpart", () => {
  it("needs an ACTIVE relationship whose other side is a coach", () => {
    expect(hasCoachCounterpart([rel({})], "p1")).toBe(true);
    expect(hasCoachCounterpart([rel({ status: "pending" })], "p1")).toBe(false);
    // A parent link is not a coach.
    expect(hasCoachCounterpart([rel({ toUserId: "o1", toUserRole: "observer" })], "p1")).toBe(false);
    // Direction does not matter — the coach may have sent the request.
    expect(
      hasCoachCounterpart(
        [rel({ fromUserId: "c1", fromUserRole: "coach", toUserId: "p1", toUserRole: "player" })],
        "p1",
      ),
    ).toBe(true);
    expect(hasCoachCounterpart([], "p1")).toBe(false);
  });
});

describe("player checklist", () => {
  it("derives every tick from the facts and links each step to where it is done", () => {
    const none = playerItems(t, { profileComplete: false, hasCoach: false, tournamentCount: 0 });
    expect(none.map((i) => [i.id, i.done, i.to])).toEqual([
      ["complete-profile", false, "/profile"],
      ["connect-coach", false, "/connections"],
      ["add-tournament", false, "/tournaments"],
    ]);
    expect(none.every((i) => i.manual === undefined)).toBe(true);
    expect(none[0].label).toBe("firstRun.player.completeProfile.label");

    const some = playerItems(t, { profileComplete: true, hasCoach: false, tournamentCount: 2 });
    expect(some.map((i) => i.done)).toEqual([true, false, true]);
  });
});

describe("coach checklist", () => {
  it("is add a player / plan a session / create a team, each derived from a count", () => {
    const none = coachItems(t, { playerCount: 0, planCount: 0, teamCount: 0 });
    expect(none.map((i) => [i.id, i.done, i.to])).toEqual([
      ["add-player", false, "/connections"],
      ["plan-session", false, "/session-builder"],
      ["create-team", false, "/teams"],
    ]);
    const done = coachItems(t, { playerCount: 1, planCount: 1, teamCount: 1 });
    expect(done.every((i) => i.done)).toBe(true);
    const partial = coachItems(t, { playerCount: 3, planCount: 0, teamCount: 1 });
    expect(partial.map((i) => i.done)).toEqual([true, false, true]);
  });
});

describe("observer (parent) checklist", () => {
  it("derives link-child and see-week; consent review is the one manual step and says why", () => {
    const items = observerItems(t, { linkedPlayerCount: 0, eventCount: 0 });
    expect(items.map((i) => [i.id, i.done, i.to])).toEqual([
      ["link-child", false, "/connections"],
      ["review-consent", false, "/privacy"],
      ["see-week", false, "/calendar"],
    ]);
    const consent = items.find((i) => i.id === "review-consent")!;
    expect(consent.manual).toBeDefined();
    expect(consent.manual!.reason).toMatch(/server-side/i);
    // The derived ones are not manual.
    expect(items.filter((i) => i.id !== "review-consent").every((i) => i.manual === undefined)).toBe(true);

    const linked = observerItems(t, { linkedPlayerCount: 1, eventCount: 4 });
    expect(linked.map((i) => i.done)).toEqual([true, false, true]);
  });
});

describe("admin checklist", () => {
  it("has the one step that is provable today — the academy questionnaire", () => {
    expect(adminItems(t, { profileComplete: false })).toMatchObject([
      { id: "set-up-academy", done: false, to: "/profile" },
    ]);
    expect(adminItems(t, { profileComplete: true })[0].done).toBe(true);
  });
});
