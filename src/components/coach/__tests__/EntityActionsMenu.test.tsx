// ============================================================================
// EntityActionsMenu — what a coach sees when they open a player's or a team's
// menu, and where each item takes them.
//
// The two kinds of item are the point: Schedule/Calendar NAVIGATE to a
// pre-filtered page, Stats/Equipment hand the entity back to the page so it
// can open a drawer. And an item with no handler must not be offered at all —
// a menu entry that does nothing is worse than no entry.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PlayerActionsMenu, TeamActionsMenu } from "@/components/coach/EntityActionsMenu";
import type { ConnectedPlayer, Team } from "@/types";

const ALICE: ConnectedPlayer = {
  id: "p1",
  playerPublicId: "PLR-0001",
  firstName: "Alice",
  lastName: "Adams",
  connectedSince: "2026-01-01T00:00:00.000Z",
};

const SQUAD: Team = {
  id: "t1",
  name: "U14 Squad",
  coachId: "c1",
  players: [ALICE],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Renders the current URL so a navigation is something we can read. */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function mount(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/players"]}>
      {ui}
      <LocationProbe />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("PlayerActionsMenu", () => {
  it("is named after the player and offers all four actions when both drawers are wired", async () => {
    const user = userEvent.setup();
    mount(<PlayerActionsMenu player={ALICE} onViewStats={() => {}} onViewEquipment={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Actions for Alice Adams" }));

    expect(await screen.findByRole("menuitem", { name: /schedule/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /stats/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /equipment/i })).toBeInTheDocument();
  });

  it("Schedule navigates to the trainings list scoped to this player", async () => {
    const user = userEvent.setup();
    mount(<PlayerActionsMenu player={ALICE} />);

    await user.click(screen.getByRole("button", { name: "Actions for Alice Adams" }));
    await user.click(await screen.findByRole("menuitem", { name: /schedule/i }));

    expect(screen.getByTestId("loc")).toHaveTextContent("/trainings?player=p1");
  });

  it("Calendar navigates to the calendar scoped to this player", async () => {
    const user = userEvent.setup();
    mount(<PlayerActionsMenu player={ALICE} />);

    await user.click(screen.getByRole("button", { name: "Actions for Alice Adams" }));
    await user.click(await screen.findByRole("menuitem", { name: /calendar/i }));

    expect(screen.getByTestId("loc")).toHaveTextContent("/calendar?player=p1");
  });

  it("Stats hands the player back to the page instead of navigating", async () => {
    const user = userEvent.setup();
    const onViewStats = vi.fn();
    mount(<PlayerActionsMenu player={ALICE} onViewStats={onViewStats} />);

    await user.click(screen.getByRole("button", { name: "Actions for Alice Adams" }));
    await user.click(await screen.findByRole("menuitem", { name: /stats/i }));

    expect(onViewStats).toHaveBeenCalledWith(ALICE);
    expect(screen.getByTestId("loc")).toHaveTextContent("/players");
  });

  it("does not offer Stats or Equipment when the page has not wired them", async () => {
    const user = userEvent.setup();
    mount(<PlayerActionsMenu player={ALICE} />);

    await user.click(screen.getByRole("button", { name: "Actions for Alice Adams" }));
    await screen.findByRole("menuitem", { name: /schedule/i });

    expect(screen.queryByRole("menuitem", { name: /stats/i })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /equipment/i })).toBeNull();
  });
});

describe("TeamActionsMenu", () => {
  it("offers Schedule, Calendar and Manage team — and no per-player items", async () => {
    const user = userEvent.setup();
    mount(<TeamActionsMenu team={SQUAD} compact />);

    await user.click(screen.getByRole("button", { name: "Actions for U14 Squad" }));

    expect(await screen.findByRole("menuitem", { name: /schedule/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /manage team/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /stats/i })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /equipment/i })).toBeNull();
  });

  it("Schedule navigates to the trainings list scoped to the team", async () => {
    const user = userEvent.setup();
    mount(<TeamActionsMenu team={SQUAD} />);

    await user.click(screen.getByRole("button", { name: "Actions for U14 Squad" }));
    await user.click(await screen.findByRole("menuitem", { name: /schedule/i }));

    expect(screen.getByTestId("loc")).toHaveTextContent("/trainings?team=t1");
  });

  it("Manage team uses the page's handler when given, else deep-links to /teams", async () => {
    const user = userEvent.setup();
    const onManage = vi.fn();
    const { unmount } = mount(<TeamActionsMenu team={SQUAD} onManage={onManage} />);

    await user.click(screen.getByRole("button", { name: "Actions for U14 Squad" }));
    await user.click(await screen.findByRole("menuitem", { name: /manage team/i }));
    expect(onManage).toHaveBeenCalledWith(SQUAD);
    expect(screen.getByTestId("loc")).toHaveTextContent("/players");
    unmount();

    mount(<TeamActionsMenu team={SQUAD} />);
    await user.click(screen.getByRole("button", { name: "Actions for U14 Squad" }));
    await user.click(await screen.findByRole("menuitem", { name: /manage team/i }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/teams?team=t1");
  });
});
