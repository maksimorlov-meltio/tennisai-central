import type { User } from "@prisma/client";

/**
 * A user row with every secret removed, ready to send to a client.
 *
 * One implementation, deliberately. There used to be two — one in auth, one in
 * profile — and they had already drifted: when guardian consent added a token
 * digest, only the auth copy learned to strip it, so `GET /api/me/profile`
 * quietly started returning it. The second copy is not a duplicate so much as a
 * standing invitation to leak the next sensitive field somebody adds.
 *
 * Destructuring rather than an allowlist is a considered trade-off. An
 * allowlist fails safe for new columns but silently drops new harmless ones,
 * which is how a profile field goes missing from the UI with no error. The
 * mitigation is that this is the ONLY place the choice is made, and the test
 * beside it fails when a new field appears that nobody has classified.
 */
export function publicUser(u: User) {
  const {
    passwordHash,
    // Only the SHA-256 digest is ever stored, so this is not directly usable —
    // but it is a credential-shaped secret and has no business leaving the box.
    guardianConsentToken,
    ...rest
  } = u;
  return rest;
}
