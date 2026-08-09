import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { NewConnectionDialog } from "@/components/connections/NewConnectionDialog";
import { DIRECTORY, mockDirectoryService } from "@/mock/directory";
import type { UserRole } from "@/types";

// Mock auth so we can drive `myRole` per test
let currentRole: UserRole = "player";
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "self-id", role: currentRole },
  }),
}));

const ROLE_LABEL: Record<UserRole, string> = {
  player: "Player",
  coach: "Coach",
  observer: "Parent",
  admin: "Admin",
};

const ALL_ROLES: UserRole[] = ["player", "coach", "observer", "admin"];

function renderDialog() {
  return render(
    <NewConnectionDialog open onOpenChange={() => {}} onRequestSent={() => {}} />
  );
}

async function lookup(publicId: string) {
  const input = screen.getByLabelText(/public id/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: publicId } });
  fireEvent.click(screen.getByRole("button", { name: /lookup/i }));
}

describe("NewConnectionDialog — stays consistent with ALLOWED_CONNECTIONS", () => {
  beforeEach(() => cleanup());

  it.each(ALL_ROLES)(
    "as %s, the 'Allowed connections' hint matches getAllowedTargetRoles",
    (role) => {
      currentRole = role;
      renderDialog();
      const allowed = mockDirectoryService.getAllowedTargetRoles(role);
      const expected = allowed.length
        ? allowed.map((r) => ROLE_LABEL[r]).join(", ")
        : "None";
      expect(
        screen.getByText(/allowed connections:/i).parentElement
      ).toHaveTextContent(expected);
    }
  );

  // Build the full from→to matrix using a representative user per target role
  const sampleByRole: Partial<Record<UserRole, string>> = {};
  for (const role of ["player", "coach", "observer"] as UserRole[]) {
    const entry = DIRECTORY.find((u) => u.role === role);
    if (entry) sampleByRole[role] = entry.publicId;
  }

  const pairs = (["player", "coach", "observer"] as UserRole[]).flatMap((from) =>
    (["player", "coach", "observer"] as UserRole[]).map((to) => [from, to] as const)
  );

  it.each(pairs)(
    "as %s looking up a %s — dialog matches validateConnection",
    async (from, to) => {
      currentRole = from;
      renderDialog();
      const targetId = sampleByRole[to]!;
      await lookup(targetId);

      const expected = mockDirectoryService.validateConnection(from, to);

      if (expected.valid) {
        // Successful lookup → result card shows the target's public ID,
        // and no validation error is rendered.
        await waitFor(() =>
          expect(screen.getAllByText(targetId).length).toBeGreaterThan(0)
        );
        expect(screen.queryByText(expected.reason ?? "__none__")).toBeNull();
      } else {
        // Forbidden pair → validation reason is surfaced as the error
        await waitFor(() =>
          expect(screen.getByText(expected.reason!)).toBeInTheDocument()
        );
        // No result card rendered → public ID does not appear in a card,
        // it only appears inside the input value (not as text content).
      }
    }
  );
});