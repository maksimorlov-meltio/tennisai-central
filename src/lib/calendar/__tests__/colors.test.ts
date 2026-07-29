// ============================================================
// Tests the STABLE LOGIC CONTRACT of the calendar colour helpers, not the
// literal colour values — colors.ts is being made theme-aware in parallel and
// may start returning CSS `var(--...)` strings instead of raw hex. Assertions
// compare against the module's own exported colour maps rather than hardcoded
// hex, so they hold regardless of what a colour "is".
// ============================================================

import { describe, it, expect } from "vitest";
import {
  federationOf,
  eventBaseColor,
  entityColor,
  EVENT_TYPE_COLOR,
  FEDERATION_COLOR,
} from "../colors";
import type { CalendarEventType, TournamentFederation } from "@/types";

const ALL_EVENT_TYPES: CalendarEventType[] = ["training", "tournament", "match", "travel", "recovery"];
const ALL_FEDERATIONS: TournamentFederation[] = ["ATP", "WTA", "ITF", "UTR", "USTA"];

describe("federationOf", () => {
  it("extracts a recognised federation tag from the front of a title", () => {
    expect(federationOf("[ATP] Miami Open")).toBe("ATP");
    expect(federationOf("[WTA] Indian Wells")).toBe("WTA");
    expect(federationOf("[ITF] Futures")).toBe("ITF");
    expect(federationOf("[UTR] Local Open")).toBe("UTR");
    expect(federationOf("[USTA] Sectional")).toBe("USTA");
  });

  it("returns null when the title carries no federation tag", () => {
    expect(federationOf("Miami Open")).toBeNull();
    expect(federationOf("")).toBeNull();
  });

  it("returns null for an unrecognised or malformed tag", () => {
    expect(federationOf("[XYZ] Some Event")).toBeNull(); // not a known federation
    expect(federationOf("Untagged [ATP] Miami Open")).toBeNull(); // tag must lead the title
    expect(federationOf("[atp] lowercase tag")).toBeNull(); // federation codes are case-sensitive
  });
});

describe("eventBaseColor", () => {
  it("gives the federation tag precedence over the event type when both apply", () => {
    for (const type of ALL_EVENT_TYPES) {
      expect(eventBaseColor(type, "[ATP] Miami Open")).toBe(FEDERATION_COLOR.ATP);
    }
  });

  it("resolves the right federation colour for every known federation, regardless of event type", () => {
    for (const fed of ALL_FEDERATIONS) {
      expect(eventBaseColor("training", `[${fed}] Some tournament`)).toBe(FEDERATION_COLOR[fed]);
    }
  });

  it("falls back to the event-type colour when the title carries no federation tag", () => {
    for (const type of ALL_EVENT_TYPES) {
      expect(eventBaseColor(type, "Weekly session")).toBe(EVENT_TYPE_COLOR[type]);
    }
  });
});

describe("entityColor", () => {
  it("is deterministic — the same id always yields the same colour", () => {
    expect(entityColor("player-123")).toBe(entityColor("player-123"));
    expect(entityColor("team-alpha")).toBe(entityColor("team-alpha"));
  });

  it("differs across different ids (not a blanket constant)", () => {
    const ids = ["player-1", "player-2", "coach-a", "team-alpha", "team-beta"];
    const colors = new Set(ids.map((id) => entityColor(id)));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("handles an empty id without throwing, and stays stable for it", () => {
    expect(() => entityColor("")).not.toThrow();
    expect(typeof entityColor("")).toBe("string");
    expect(entityColor("")).toBe(entityColor(""));
  });
});
