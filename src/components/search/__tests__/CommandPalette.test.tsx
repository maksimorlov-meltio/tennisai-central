// ============================================================
// TennisAI — Command palette wiring
// ============================================================
//
// The logic lives in searchIndex.test.ts. This covers only what a pure test
// can't see: that the shortcut opens the dialog, that Escape closes it, that
// choosing a result navigates and dismisses, and — the one that matters — that
// the role reaching the index is the signed-in user's, so a player pressing
// ⌘K is never shown a coach route.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { UserRole } from "@/types";

const navigateSpy = vi.fn();
const authState = { role: "coach" as UserRole };
const tournamentState = { data: [] as unknown[], isLoading: false };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", firstName: "Aleksandr", lastName: "Kalinin", role: authState.role } }),
}));

vi.mock("@/store/ConnectionStore", () => ({
  useConnections: () => ({
    connectedPlayers: [
      { id: "p1", playerPublicId: "TAI-P-001", firstName: "Marco", lastName: "Rossi", connectedSince: "2025-01-01T00:00:00Z" },
    ],
  }),
}));

vi.mock("@/hooks/api/queries", () => ({
  useTournaments: () => tournamentState,
}));

import { CommandPalette } from "../CommandPalette";

// cmdk observes its list for resizes and jsdom ships no ResizeObserver. Set
// here rather than in the shared test setup, which isn't this task's to edit.
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/** cmdk scrolls its active row into view; jsdom has no such method. */
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  navigateSpy.mockClear();
  authState.role = "coach";
  tournamentState.data = [];
  tournamentState.isLoading = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The palette is controlled; this stands in for DashboardLayout's state. */
function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <MemoryRouter>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </MemoryRouter>
  );
}

function typeQuery(value: string) {
  const input = screen.getByPlaceholderText(/search pages, players, tournaments/i);
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("CommandPalette", () => {
  it("opens on Ctrl+K and closes on Escape", async () => {
    render(<Harness />);
    expect(screen.queryByPlaceholderText(/search pages/i)).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.getByPlaceholderText(/search pages/i)).toBeInTheDocument());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByPlaceholderText(/search pages/i)).not.toBeInTheDocument());
  });

  it("opens on Cmd+K for Mac keyboards", async () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.getByPlaceholderText(/search pages/i)).toBeInTheDocument());
  });

  it("opens on a Cyrillic layout, where the same key reports as 'л'", async () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: "л", code: "KeyK", ctrlKey: true });
    await waitFor(() => expect(screen.getByPlaceholderText(/search pages/i)).toBeInTheDocument());
  });

  it("lists the signed-in role's destinations before anything is typed", async () => {
    render(<Harness initialOpen />);
    expect(await screen.findByText("Go to")).toBeInTheDocument();
    expect(screen.getByText("Players")).toBeInTheDocument();
  });

  it("does not offer a player any coach destination", async () => {
    authState.role = "player";
    render(<Harness initialOpen />);
    await screen.findByText("Go to");

    typeQuery("team");
    await waitFor(() => {
      expect(screen.queryByText("Teams")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Session builder")).not.toBeInTheDocument();
  });

  it("navigates and closes when a result is chosen", async () => {
    render(<Harness initialOpen />);
    typeQuery("teams");

    const row = await screen.findByText("Teams");
    fireEvent.click(row);

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/teams"));
    await waitFor(() => expect(screen.queryByPlaceholderText(/search pages/i)).not.toBeInTheDocument());
  });

  it("says so rather than claiming no results while tournaments are loading", async () => {
    tournamentState.isLoading = true;
    render(<Harness initialOpen />);
    typeQuery("zzzzz");

    expect(await screen.findByText(/searching tournaments/i)).toBeInTheDocument();
    expect(screen.queryByText(/no matches for/i)).not.toBeInTheDocument();
  });

  it("shows an honest empty state once loading has finished", async () => {
    render(<Harness initialOpen />);
    typeQuery("zzzzz");

    expect(await screen.findByText(/no matches for/i)).toBeInTheDocument();
    expect(screen.queryByText(/searching tournaments/i)).not.toBeInTheDocument();
  });
});
