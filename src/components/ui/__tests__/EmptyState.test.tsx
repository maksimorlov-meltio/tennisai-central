// ============================================================================
// EmptyState — the one component every list page renders when it has nothing
// to show. What matters: the copy is rendered, the single next action is
// rendered, legacy `children` callers keep working, and the dashboard path
// resolves to the very same component (no second implementation to drift).
// ============================================================================

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Link } from "react-router-dom";
import { EmptyState } from "@/components/ui/shared";
import { EmptyState as DashboardEmptyState } from "@/components/dashboard/EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders title, description and the action slot", () => {
    render(
      <MemoryRouter>
        <EmptyState
          title="No sessions yet"
          description="Trainings is where sessions are planned."
          action={<Link to="/session-builder">Plan a session</Link>}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("No sessions yet")).toBeInTheDocument();
    expect(screen.getByText("Trainings is where sessions are planned.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan a session" })).toHaveAttribute("href", "/session-builder");
  });

  it("still renders legacy children alongside the action", () => {
    render(
      <EmptyState title="Nothing here" action={<button type="button">Primary</button>}>
        <span>extra hint</span>
      </EmptyState>,
    );
    expect(screen.getByRole("button", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByText("extra hint")).toBeInTheDocument();
  });

  it("omits the action container when no action is given", () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    // Title container + (no action div): exactly two element children — the icon
    // wrapper and the text block.
    expect(container.firstElementChild?.children).toHaveLength(2);
  });

  it("the dashboard path is the same component, not a second implementation", () => {
    expect(DashboardEmptyState).toBe(EmptyState);
  });
});
