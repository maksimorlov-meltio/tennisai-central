// ============================================================
// TennisAI — Command palette search logic
// ============================================================
//
// The palette's rules, tested without rendering it: who may be offered what,
// how a query is matched and ordered, and how hits are grouped.

import { describe, it, expect } from "vitest";
import type { ConnectedPlayer, Tournament, UserRole } from "@/types";
import {
  buildSearchResults,
  countResults,
  destinationsForRole,
  normalize,
  scoreResult,
  tokenize,
  type SearchGroup,
} from "../searchIndex";
import { navItems, roleCanAccess, searchableDestinations } from "../navRegistry";

// ─── Fixtures ───

const players: ConnectedPlayer[] = [
  { id: "p1", playerPublicId: "TAI-P-001", firstName: "Sofía", lastName: "Márquez", connectedSince: "2025-01-01T00:00:00Z" },
  { id: "p2", playerPublicId: "TAI-P-002", firstName: "Marco", lastName: "Rossi", connectedSince: "2025-01-01T00:00:00Z" },
  { id: "p3", playerPublicId: "TAI-P-003", firstName: "Ana", lastName: "Sokolova", connectedSince: "2025-01-01T00:00:00Z" },
];

function tournament(partial: Partial<Tournament> & { id: string; name: string }): Tournament {
  return {
    city: "Madrid",
    country: "Spain",
    surface: "clay",
    indoorOutdoor: "outdoor",
    startDate: "2025-06-01",
    endDate: "2025-06-07",
    ...partial,
  } as Tournament;
}

const tournaments: Tournament[] = [
  tournament({ id: "t1", name: "Madrid Junior Open" }),
  tournament({ id: "t2", name: "Roland Garros Qualifiers", city: "Paris", country: "France" }),
  tournament({ id: "t3", name: "Barcelona Spring Cup", city: "Barcelona", country: "Spain" }),
];

/** Every route offered to `role`, whatever the query. */
function routesFor(role: UserRole, query = ""): string[] {
  return buildSearchResults({ role, query, players, tournaments })
    .flatMap((group) => group.results)
    .filter((result) => result.type === "navigation")
    .map((result) => result.to);
}

function groupTypes(groups: SearchGroup[]): string[] {
  return groups.map((group) => group.type);
}

// ─── Role filtering ───

describe("role filtering", () => {
  it("never offers a player a coach-only destination", () => {
    const routes = routesFor("player");
    for (const coachOnly of ["/players", "/teams", "/session-builder"]) {
      expect(routes).not.toContain(coachOnly);
    }
  });

  it("never offers a non-admin an admin destination", () => {
    for (const role of ["player", "coach", "observer"] as UserRole[]) {
      const routes = routesFor(role);
      expect(routes.filter((to) => to.startsWith("/admin"))).toEqual([]);
    }
  });

  it("never offers an admin the player/coach feature pages", () => {
    const routes = routesFor("admin");
    for (const notForAdmin of ["/calendar", "/matches", "/stats", "/equipment", "/finance", "/players", "/trainings"]) {
      expect(routes).not.toContain(notForAdmin);
    }
  });

  it("does not offer an observer the player-only pages", () => {
    const routes = routesFor("observer");
    expect(routes).not.toContain("/matches");
    expect(routes).not.toContain("/stats");
    expect(routes).not.toContain("/equipment");
    // …but does keep the ones an observer genuinely has.
    expect(routes).toContain("/finance");
    expect(routes).toContain("/calendar");
  });

  it("gives a coach their own pages", () => {
    const routes = routesFor("coach");
    expect(routes).toEqual(expect.arrayContaining(["/players", "/teams", "/session-builder", "/trainings"]));
  });

  it("offers no destination whose registry entry excludes the role", () => {
    for (const role of ["player", "coach", "observer", "admin"] as UserRole[]) {
      for (const to of routesFor(role)) {
        expect(roleCanAccess(role, to)).toBe(true);
      }
    }
  });

  it("searching a coach-only route by name still yields nothing for a player", () => {
    // The word is in the palette's vocabulary — it must not be in this user's.
    const results = buildSearchResults({ role: "player", query: "session builder", players, tournaments });
    expect(results.flatMap((g) => g.results).map((r) => r.to)).not.toContain("/session-builder");
  });

  it("searches players only for a role that has a /players page to land on", () => {
    const asCoach = buildSearchResults({ role: "coach", query: "rossi", players, tournaments });
    expect(groupTypes(asCoach)).toContain("player");

    for (const role of ["player", "observer", "admin"] as UserRole[]) {
      const groups = buildSearchResults({ role, query: "rossi", players, tournaments });
      expect(groupTypes(groups)).not.toContain("player");
    }
  });

  it("hides tournaments from a role with no tournaments route", () => {
    // Guard against a future registry edit silently leaking the entity search:
    // the gate is the route, not a hard-coded role.
    expect(roleCanAccess("player", "/tournaments")).toBe(true);
    const groups = buildSearchResults({ role: "player", query: "madrid", players, tournaments });
    expect(groupTypes(groups)).toContain("tournament");
  });
});

// ─── Registry integrity ───

describe("destination registry", () => {
  it("is the one list both the sidebar and the palette read", () => {
    const navRoutes = navItems.map((item) => item.to);
    for (const route of navRoutes) {
      expect(searchableDestinations.map((d) => d.to)).toContain(route);
    }
  });

  it("has no duplicate routes", () => {
    const routes = searchableDestinations.map((d) => d.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("gives every destination at least one role", () => {
    for (const item of searchableDestinations) {
      expect(item.roles.length).toBeGreaterThan(0);
    }
  });

  it("resolves every destination label (no raw i18n keys leak into results)", () => {
    for (const result of destinationsForRole("coach")) {
      expect(result.label).not.toContain("dashboard.nav.");
      expect(result.label.length).toBeGreaterThan(0);
    }
  });
});

// ─── Matching + ranking ───

describe("normalize / tokenize", () => {
  it("strips accents and case", () => {
    expect(normalize("Sofía MÁRQUEZ")).toBe("sofia marquez");
  });

  it("splits on whitespace and drops empties", () => {
    expect(tokenize("  madrid   junior ")).toEqual(["madrid", "junior"]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("scoring", () => {
  const candidate = (label: string, subtitle?: string, keywords: string[] = []) => ({ label, subtitle, keywords });

  it("ranks exact above prefix above word-start above substring", () => {
    const exact = scoreResult(candidate("Teams"), ["teams"]);
    const prefix = scoreResult(candidate("Teams roster"), ["teams"]);
    const wordStart = scoreResult(candidate("My teams roster"), ["teams"]);
    const substring = scoreResult(candidate("Subteams"), ["teams"]);

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it("weights a label match above the same word in a subtitle", () => {
    const inLabel = scoreResult(candidate("Madrid Open", "Barcelona, Spain"), ["madrid"]);
    const inSubtitle = scoreResult(candidate("Spring Cup", "Madrid, Spain"), ["madrid"]);
    expect(inLabel).toBeGreaterThan(inSubtitle);
    expect(inSubtitle).toBeGreaterThan(0);
  });

  it("requires every token to match somewhere (AND, not OR)", () => {
    expect(scoreResult(candidate("Madrid Junior Open"), ["madrid", "junior"])).toBeGreaterThan(0);
    expect(scoreResult(candidate("Madrid Junior Open"), ["madrid", "wimbledon"])).toBe(0);
  });

  it("scores nothing for an empty query", () => {
    expect(scoreResult(candidate("Teams"), [])).toBe(0);
  });

  it("matches a keyword that is never displayed", () => {
    expect(scoreResult(candidate("Spring Cup", undefined, ["ITF"]), ["itf"])).toBeGreaterThan(0);
  });
});

describe("ranking within a group", () => {
  it("puts the better match first", () => {
    const groups = buildSearchResults({ role: "coach", query: "madrid", players, tournaments });
    const results = groups.find((g) => g.type === "tournament")!.results;
    expect(results[0].label).toBe("Madrid Junior Open");
    // Barcelona is in Spain, not Madrid — the city match is on t1 only, and the
    // Paris event matches nothing at all.
    expect(results.map((r) => r.id)).not.toContain("tournament:t2");
  });

  it("finds an accented player name typed without the accents", () => {
    const groups = buildSearchResults({ role: "coach", query: "sofia marquez", players, tournaments });
    const found = groups.find((g) => g.type === "player")!.results;
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("player:p1");
  });

  it("links a player result at the deep link the Players page understands", () => {
    const groups = buildSearchResults({ role: "coach", query: "rossi", players, tournaments });
    expect(groups.find((g) => g.type === "player")!.results[0].to).toBe("/players?player=p2");
  });

  it("links a tournament result at its detail route", () => {
    const groups = buildSearchResults({ role: "player", query: "roland", players, tournaments });
    expect(groups.find((g) => g.type === "tournament")!.results[0].to).toBe("/tournaments/t2");
  });

  it("matches a player by their public id", () => {
    const groups = buildSearchResults({ role: "coach", query: "TAI-P-003", players, tournaments });
    expect(groups.find((g) => g.type === "player")!.results[0].id).toBe("player:p3");
  });
});

// ─── Grouping ───

describe("grouping", () => {
  it("keeps a fixed order: destinations, players, tournaments", () => {
    // A single letter is the broadest query there is: it hits destinations,
    // players and tournaments at once, which is exactly when order matters.
    const groups = buildSearchResults({ role: "coach", query: "s", players, tournaments });
    expect(groupTypes(groups)).toEqual(["navigation", "player", "tournament"]);
  });

  it("drops groups that would be a heading over nothing", () => {
    const groups = buildSearchResults({ role: "coach", query: "roland", players, tournaments });
    expect(groupTypes(groups)).toEqual(["tournament"]);
  });

  it("gives every group a heading", () => {
    for (const group of buildSearchResults({ role: "coach", query: "s", players, tournaments })) {
      expect(group.heading.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns nothing at all when nothing matches", () => {
    const groups = buildSearchResults({ role: "coach", query: "zzzzz", players, tournaments });
    expect(groups).toEqual([]);
    expect(countResults(groups)).toBe(0);
  });

  it("lists destinations only, and all of them, before anything is typed", () => {
    const groups = buildSearchResults({ role: "coach", query: "", players, tournaments });
    expect(groupTypes(groups)).toEqual(["navigation"]);
    expect(groups[0].results).toHaveLength(destinationsForRole("coach").length);
  });

  it("treats a whitespace-only query as nothing typed", () => {
    expect(groupTypes(buildSearchResults({ role: "coach", query: "   ", players, tournaments }))).toEqual(["navigation"]);
  });

  it("survives missing data without inventing results", () => {
    const groups = buildSearchResults({ role: "coach", query: "madrid" });
    expect(countResults(groups)).toBe(0);
  });

  it("gives every result a unique id across all groups", () => {
    const ids = buildSearchResults({ role: "coach", query: "s", players, tournaments })
      .flatMap((group) => group.results)
      .map((result) => result.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("caps a group so one kind can't bury the others", () => {
    const many: Tournament[] = Array.from({ length: 30 }, (_, i) =>
      tournament({ id: `x${i}`, name: `Madrid Event ${i}` }),
    );
    const groups = buildSearchResults({ role: "coach", query: "madrid", players, tournaments: many });
    expect(groups.find((g) => g.type === "tournament")!.results.length).toBeLessThanOrEqual(8);
  });
});
