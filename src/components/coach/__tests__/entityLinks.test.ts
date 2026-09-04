// The menus and the pages agree on these params by contract, not by luck.
// If a param name or path changes on one side, this is what fails first.
import { describe, it, expect } from "vitest";
import {
  playerCalendarHref, playerScheduleHref, readEntityParams,
  teamCalendarHref, teamManageHref, teamScheduleHref,
} from "@/components/coach/entityLinks";

describe("entity links", () => {
  it("points player actions at the pages that filter by ?player=", () => {
    expect(playerScheduleHref("p1")).toBe("/trainings?player=p1");
    expect(playerCalendarHref("p1")).toBe("/calendar?player=p1");
  });

  it("points team actions at the pages that filter by ?team=", () => {
    expect(teamScheduleHref("t1")).toBe("/trainings?team=t1");
    expect(teamCalendarHref("t1")).toBe("/calendar?team=t1");
    expect(teamManageHref("t1")).toBe("/teams?team=t1");
  });

  it("URL-encodes ids so an odd id cannot break the query string", () => {
    expect(playerScheduleHref("a b&c")).toBe("/trainings?player=a%20b%26c");
  });

  it("round-trips through readEntityParams", () => {
    const search = new URL(`https://x${teamScheduleHref("t 1")}`).searchParams;
    expect(readEntityParams(search)).toEqual({ playerId: null, teamId: "t 1" });
    expect(readEntityParams(new URLSearchParams("player=p1"))).toEqual({ playerId: "p1", teamId: null });
  });

  it("treats an empty param as absent", () => {
    expect(readEntityParams(new URLSearchParams("player=&team="))).toEqual({ playerId: null, teamId: null });
  });
});
