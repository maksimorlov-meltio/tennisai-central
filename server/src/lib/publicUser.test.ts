// The one place a user row is stripped before it goes to a client.
//
// There were two such places and they had drifted: guardian consent added a
// token digest, only the auth copy learned to strip it, and GET /api/me/profile
// began returning it. These tests exist to make the next such field impossible
// to add silently.

import { describe, it, expect } from "vitest";
import type { User } from "@prisma/client";
import { publicUser } from "./publicUser";

/**
 * Every column on User, as of this commit.
 *
 * This is the canary. Add a column to the Prisma schema and the last test here
 * fails until someone comes back and says, explicitly, whether the new field is
 * safe to send to a browser. That is the whole point: the failure is the
 * conversation.
 */
const KNOWN_USER_KEYS = [
  "id",
  "email",
  "publicId",
  "passwordHash",
  "role",
  "firstName",
  "lastName",
  "emailVerified",
  "onboarding",
  "onboardingCompletedAt",
  "termsAcceptedAt",
  "ageConfirmedAt",
  "dateOfBirth",
  "guardianConsentRequired",
  "guardianEmail",
  "guardianName",
  "guardianConsentAt",
  "guardianConsentToken",
  "guardianConsentSentAt",
  "passwordChangedAt",
  "createdAt",
  "updatedAt",
] as const;

/** Fields that must NEVER reach a client. */
const SECRET_KEYS = ["passwordHash", "guardianConsentToken"] as const;

function aUser(): User {
  const row: Record<string, unknown> = {};
  for (const k of KNOWN_USER_KEYS) row[k] = `value-of-${k}`;
  return row as unknown as User;
}

describe("publicUser", () => {
  it("removes the password hash", () => {
    expect(publicUser(aUser())).not.toHaveProperty("passwordHash");
  });

  it("removes the guardian consent token", () => {
    // Only a SHA-256 digest is stored, so this is not directly usable — but it
    // is credential-shaped and has no business leaving the server.
    expect(publicUser(aUser())).not.toHaveProperty("guardianConsentToken");
  });

  it("removes every secret, by name", () => {
    const out = publicUser(aUser()) as Record<string, unknown>;
    for (const k of SECRET_KEYS) expect(Object.keys(out)).not.toContain(k);
  });

  it("keeps the fields a client legitimately needs", () => {
    const out = publicUser(aUser()) as Record<string, unknown>;
    // Including the guardian fields: a parent-managed account has to be able to
    // tell the user it is waiting, which means the state has to be visible.
    for (const k of ["id", "email", "role", "firstName", "guardianConsentRequired", "guardianConsentAt"]) {
      expect(out).toHaveProperty(k);
    }
  });

  it("does not mutate the row it was given", () => {
    const row = aUser();
    publicUser(row);
    expect(row).toHaveProperty("passwordHash");
  });

  it("strips secrets even when the row carries unexpected extra columns", () => {
    const row = { ...aUser(), somethingNew: "x" } as unknown as User;
    const out = publicUser(row) as Record<string, unknown>;
    // A future column rides through by design — which is exactly why the
    // compile-time check below exists rather than a runtime one.
    expect(out).toHaveProperty("somethingNew");
    for (const k of SECRET_KEYS) expect(Object.keys(out)).not.toContain(k);
  });
});

// ── The canary ──────────────────────────────────────────────────────────────
//
// This has to be a TYPE-level check, not a test. The obvious runtime version —
// build a row from KNOWN_USER_KEYS, then assert its keys equal KNOWN_USER_KEYS
// — is a tautology: it constructs the thing it then verifies and passes
// forever, including the day someone adds an `apiSecret` column.
//
// These two aliases are both `never` only while KNOWN_USER_KEYS matches Prisma's
// User exactly. Add or remove a column and `npx tsc --noEmit` fails HERE, with
// the offending field named in the error. Then decide whether it is a secret:
// if so add it to SECRET_KEYS and to the destructure in publicUser.ts, and
// either way list it above. Do not widen these types to make the error go away.
type ListedKey = (typeof KNOWN_USER_KEYS)[number];
type ColumnsMissingFromList = Exclude<keyof User, ListedKey>;
type ListedButNotAColumn = Exclude<ListedKey, keyof User>;

/**
 * Compiles only when `T` is `never`.
 *
 * The constraint is the mechanism and it has to be this way round. The obvious
 * spelling — `const x: [Missing, Extra] = [undefined as never, undefined as
 * never]` — never fails, because `never` is the bottom type and is assignable
 * to absolutely anything. It looks like a check and is decoration. Verified by
 * adding a fake column and watching it not fire.
 */
type AssertNever<T extends never> = T;

// If either line errors, KNOWN_USER_KEYS has fallen out of step with Prisma's
// User. The error names the field.
export type _NoUnclassifiedColumns = AssertNever<ColumnsMissingFromList>;
export type _NoPhantomColumns = AssertNever<ListedButNotAColumn>;
