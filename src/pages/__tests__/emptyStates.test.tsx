// ============================================================================
// Empty states — the first-run branch of four list pages.
//
// What these prove, per page: the copy comes from the `empty.*` locale keys
// (asserted against en.json, not against literals typed twice), the single
// action points at a REAL route or opens the page's own dialog, and the
// action is role-aware — a parent never gets "Add an expense", a player
// without a coach is sent to Connections rather than to a form that cannot
// work yet. Filter/search-produced emptiness is a different message with no
// action, so nobody is told to "connect a player" they already have.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import en from "@/locales/en.json";
import type { ConnectedPlayer, ConnectionRequest, User, UserRole } from "@/types";

// ─── Controllable auth + connections ─────────────────────────────────────────

let currentUser: User | null = null;
let connectedPlayers: ConnectedPlayer[] = [];
let activeRelationships: ConnectionRequest[] = [];

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: currentUser,
    isAuthenticated: !!currentUser,
    isLoading: false,
    hasRole: (r: UserRole) => currentUser?.role === r,
    login: vi.fn(),
    signUp: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

vi.mock("@/store/ConnectionStore", () => ({
  useConnections: () => ({
    connectedPlayers,
    activeRelationships,
    requests: activeRelationships,
    sendRequest: vi.fn(),
    updateStatus: vi.fn(),
  }),
}));

// Every list query answers "loaded, nothing there"; every mutation is inert.
const emptyQuery = { data: [], isLoading: false, error: null, refetch: vi.fn() };
const inertMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock("@/hooks/api/queries", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/hooks/api/queries");
  return {
    ...actual,
    useFinanceEntries: () => emptyQuery,
    useFinanceSummary: () => ({ data: undefined, isLoading: false, error: null }),
    useCreateFinanceEntry: () => inertMutation,
    useTrainingRequests: () => emptyQuery,
    useCreateTrainingRequest: () => inertMutation,
    useApproveTrainingRequest: () => inertMutation,
    useRejectTrainingRequest: () => inertMutation,
    useRescheduleTrainingRequest: () => inertMutation,
    useCancelTrainingRequest: () => inertMutation,
  };
});

vi.mock("@/hooks/api/trainingPlans", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/hooks/api/trainingPlans");
  return { ...actual, useTrainingPlanList: () => emptyQuery };
});

// Drawers stay mounted (closed) on the Players page and run their own queries.
vi.mock("@/components/players/PlayerStatsDrawer", () => ({ PlayerStatsDrawer: () => null }));
vi.mock("@/components/equipment/PlayerEquipmentDrawer", () => ({ PlayerEquipmentDrawer: () => null }));

// ─── Pages under test (after mocks) ──────────────────────────────────────────

import PlayersPage from "@/pages/PlayersPage";
import FinancePage from "@/pages/FinancePage";
import TrainingRequestsPage from "@/pages/TrainingRequestsPage";
import TrainingPlansPage from "@/pages/trainingPlans/TrainingPlansPage";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const E = en.empty;

function user(role: UserRole, id = `${role}-1`): User {
  return {
    id,
    email: `${id}@example.com`,
    role,
    firstName: "Test",
    lastName: role,
    emailVerified: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  } as User;
}

function player(id = "p-9"): ConnectedPlayer {
  return { id, playerPublicId: "PL-0009", firstName: "Sam", lastName: "Nine", connectedSince: "2026-02-01T00:00:00Z" };
}

/** An active link between `userId` and a counterpart of `otherRole`. */
function activeLink(userId: string, otherRole: UserRole): ConnectionRequest {
  return {
    id: `rel-${otherRole}`,
    fromUserId: userId,
    fromUserName: "Test",
    fromUserRole: currentUser?.role ?? "player",
    toUserId: `${otherRole}-9`,
    toUserName: `Other ${otherRole}`,
    toUserRole: otherRole,
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function renderAt(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(() => {
  currentUser = null;
  connectedPlayers = [];
  activeRelationships = [];
});

afterEach(cleanup);

// ─── Players (coach) ─────────────────────────────────────────────────────────

describe("PlayersPage empty state", () => {
  it("with no roster: explains the page, and the one action goes to Connections", () => {
    currentUser = user("coach");
    renderAt(<PlayersPage />);
    expect(screen.getByText(E.players.title)).toBeInTheDocument();
    expect(screen.getByText(E.players.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: E.players.action })).toHaveAttribute("href", "/connections");
  });

  it("with a roster but a search miss: a different message and NO connect action", () => {
    currentUser = user("coach");
    connectedPlayers = [player()];
    renderAt(<PlayersPage />);
    fireEvent.change(screen.getByPlaceholderText(/Search players/), { target: { value: "zzz" } });
    expect(screen.getByText(E.players.filtered.title)).toBeInTheDocument();
    expect(screen.queryByText(E.players.title)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: E.players.action })).not.toBeInTheDocument();
  });
});

// ─── Finance (player / parent) ───────────────────────────────────────────────

describe("FinancePage empty state", () => {
  it("a player is offered to add the first expense", () => {
    currentUser = user("player");
    renderAt(<FinancePage />);
    expect(screen.getByText(E.finance.title)).toBeInTheDocument();
    expect(screen.getByText(E.finance.player.description)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: E.finance.player.action })).toBeInTheDocument();
  });

  it("a parent with a linked child sees the read-only explanation and no add action", () => {
    currentUser = user("observer");
    connectedPlayers = [player()];
    renderAt(<FinancePage />);
    expect(screen.getByText(E.finance.title)).toBeInTheDocument();
    expect(screen.getByText(E.finance.observer.description)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: E.finance.player.action })).not.toBeInTheDocument();
  });

  it("a parent with nobody linked is sent to Connections first", () => {
    currentUser = user("observer");
    renderAt(<FinancePage />);
    expect(screen.getByText(E.finance.noPlayers.title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: E.finance.noPlayers.action })).toHaveAttribute("href", "/connections");
  });
});

// ─── Training requests (player / coach) ──────────────────────────────────────

describe("TrainingRequestsPage empty state", () => {
  it("a player WITHOUT a coach is sent to Connections, not to a request form", () => {
    currentUser = user("player");
    renderAt(<TrainingRequestsPage />);
    expect(screen.getByText(E.trainingRequests.title)).toBeInTheDocument();
    expect(screen.getByText(E.trainingRequests.player.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: E.trainingRequests.player.actionConnect })).toHaveAttribute("href", "/connections");
    expect(screen.queryByRole("button", { name: E.trainingRequests.player.actionRequest })).not.toBeInTheDocument();
  });

  it("a player WITH a coach can request a training right there", () => {
    currentUser = user("player");
    activeRelationships = [activeLink(currentUser.id, "coach")];
    renderAt(<TrainingRequestsPage />);
    expect(screen.getByRole("button", { name: E.trainingRequests.player.actionRequest })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: E.trainingRequests.player.actionConnect })).not.toBeInTheDocument();
  });

  it("a coach with no players is told to connect one; with players there is nothing to do but wait", () => {
    currentUser = user("coach");
    const { unmount } = renderAt(<TrainingRequestsPage />);
    expect(screen.getByText(E.trainingRequests.coach.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: E.trainingRequests.coach.actionConnect })).toHaveAttribute("href", "/connections");
    unmount();

    connectedPlayers = [player()];
    renderAt(<TrainingRequestsPage />);
    expect(screen.getByText(E.trainingRequests.title)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: E.trainingRequests.coach.actionConnect })).not.toBeInTheDocument();
  });

  it("a status filter that matches nothing is a filter message, not a first-run one", async () => {
    currentUser = user("coach");
    renderAt(<TrainingRequestsPage />);
    // Radix tabs switch on pointer-down, which a bare click event does not send.
    await userEvent.setup().click(screen.getByRole("tab", { name: /Approved/ }));
    expect(screen.getByText(E.trainingRequests.filtered.title)).toBeInTheDocument();
    expect(screen.queryByText(E.trainingRequests.title)).not.toBeInTheDocument();
  });
});

// ─── Training plans (coach / player) ─────────────────────────────────────────

describe("TrainingPlansPage empty state", () => {
  it("a coach is sent to the Session Builder", () => {
    currentUser = user("coach");
    renderAt(<TrainingPlansPage />);
    expect(screen.getByText(E.trainingPlans.title)).toBeInTheDocument();
    expect(screen.getByText(E.trainingPlans.coach.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: E.trainingPlans.coach.action })).toHaveAttribute("href", "/session-builder");
  });

  it("a player without a coach is sent to Connections; with one, there is no action (the coach builds plans)", () => {
    currentUser = user("player");
    const { unmount } = renderAt(<TrainingPlansPage />);
    expect(screen.getByText(E.trainingPlans.player.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: E.trainingPlans.player.actionConnect })).toHaveAttribute("href", "/connections");
    // A coach-only action never leaks to a player.
    expect(screen.queryByRole("link", { name: E.trainingPlans.coach.action })).not.toBeInTheDocument();
    unmount();

    activeRelationships = [activeLink(currentUser.id, "coach")];
    renderAt(<TrainingPlansPage />);
    expect(screen.getByText(E.trainingPlans.title)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: E.trainingPlans.player.actionConnect })).not.toBeInTheDocument();
  });
});
