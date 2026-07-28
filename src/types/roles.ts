// ============================================================
// TennisAI — Roles & Tenancy Types (Stage 2)
// Additive mapping onto the existing UserRole strings:
//   observer = Parent/guardian, admin = Academy administrator.
// Mirrors server/prisma/schema.prisma (Academy, AcademyMembership,
// CoachAssignment, Guardianship) + server/src/authz.ts.
// ============================================================

/** Role a member holds inside an academy. */
export type AcademyRole = "admin" | "coach" | "player";

export interface Academy {
  id: string;
  name: string;
  branding?: { logoUrl?: string; primaryColor?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcademyMembership {
  id: string;
  academyId: string;
  userId: string;
  role: AcademyRole;
  createdAt: string;
}

/** An active link is required for a coach to manage a player's data. */
export interface CoachAssignment {
  id: string;
  coachId: string;
  playerId: string;
  status: "active" | "ended";
  createdAt: string;
}

/** Parent/guardian ↔ junior link. `parentalConsent` gates all junior access. */
export interface Guardianship {
  id: string;
  guardianId: string;
  juniorPlayerId: string;
  parentalConsent: boolean;
  consentAt?: string;
  createdAt: string;
  updatedAt: string;
}
