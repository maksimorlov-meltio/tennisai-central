// ============================================================
// Mock User Directory — Simulates ID-based user lookup
// TODO: Replace with real API
// ============================================================

import type { UserRole } from "@/types";

export interface DirectoryEntry {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

// All discoverable users in the platform
export const DIRECTORY: DirectoryEntry[] = [
  // Players
  { id: "p1", publicId: "TAI-P-001", firstName: "Alex", lastName: "Rivera", role: "player" },
  { id: "p2", publicId: "TAI-P-002", firstName: "Sam", lastName: "Chen", role: "player" },
  { id: "p3", publicId: "TAI-P-003", firstName: "Lena", lastName: "Petrova", role: "player" },
  { id: "p4", publicId: "TAI-P-004", firstName: "Kai", lastName: "Tanaka", role: "player" },
  { id: "p5", publicId: "TAI-P-005", firstName: "Sofia", lastName: "Navarro", role: "player" },
  { id: "p6", publicId: "TAI-P-006", firstName: "Enzo", lastName: "Moretti", role: "player" },
  // Coaches
  { id: "c1", publicId: "TAI-C-001", firstName: "Jordan", lastName: "Smith", role: "coach" },
  { id: "c2", publicId: "TAI-C-002", firstName: "Dana", lastName: "Wilson", role: "coach" },
  // Observers (Fans)
  { id: "o1", publicId: "TAI-F-001", firstName: "Morgan", lastName: "Lee", role: "observer" },
  { id: "o2", publicId: "TAI-F-002", firstName: "Casey", lastName: "Brooks", role: "observer" },
];

// Allowed connection directions
const ALLOWED_CONNECTIONS: Record<UserRole, UserRole[]> = {
  coach: ["player"],          // Coach can request players
  player: ["coach", "observer"], // Player can request coaches or fans
  observer: ["player"],       // Observer can request players
  admin: [],                  // Admin doesn't connect
};

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export const mockDirectoryService = {
  /** Look up a user by their public ID (e.g. TAI-P-001) */
  async lookupByPublicId(publicId: string): Promise<DirectoryEntry | null> {
    const normalized = publicId.trim().toUpperCase();
    // Real mode: query the live users directory. Lazy import avoids a cycle.
    if (import.meta.env.VITE_API_BASE_URL) {
      try {
        const { usersApi } = await import("@/api/endpoints/users");
        // Look the user up by public ID directly — the server scopes the
        // unfiltered directory to the caller's existing relationships.
        const dir = await usersApi.getDirectory(normalized);
        return dir.find((u) => u.publicId === normalized) ?? null;
      } catch {
        return null;
      }
    }
    await delay();
    return DIRECTORY.find((u) => u.publicId === normalized) ?? null;
  },

  /** Get allowed target roles for a given role */
  getAllowedTargetRoles(fromRole: UserRole): UserRole[] {
    return ALLOWED_CONNECTIONS[fromRole] ?? [];
  },

  /** Validate whether a connection request is allowed */
  validateConnection(
    fromRole: UserRole,
    toRole: UserRole
  ): { valid: boolean; reason?: string } {
    const allowed = ALLOWED_CONNECTIONS[fromRole];
    if (!allowed || allowed.length === 0) {
      return { valid: false, reason: "Your role cannot send connection requests." };
    }
    if (!allowed.includes(toRole)) {
      const labels: Record<UserRole, string> = {
        player: "Players",
        coach: "Coaches",
        observer: "Parents",
        admin: "Admins",
      };
      return {
        valid: false,
        reason: `As a ${fromRole}, you can only connect with: ${allowed.map((r) => labels[r]).join(", ")}.`,
      };
    }
    return { valid: true };
  },
};
