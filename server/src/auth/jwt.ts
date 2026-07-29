import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../env";

/** Marks a token as a session access token — distinguishes it from purpose */
/** tokens (email verification, …) that travel in URLs and must never be reused */
/** as a session credential. */
const ACCESS_TYP = "access";

/** Sign a short access token carrying the user id in `sub` and a `typ` marker. */
export function signToken(userId: string): string {
  const opts: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId, typ: ACCESS_TYP }, env.jwtSecret, opts);
}

/**
 * Verify a session token and return the user id, or null if invalid/expired.
 * REJECTS any token whose `typ` is not "access" — a purpose token (which lacks
 * this claim) cannot be replayed as a session token even though it verifies
 * against the same secret.
 */
export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as { sub?: string; typ?: string };
    if (decoded.typ !== ACCESS_TYP) return null;
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

/** Pull a Bearer token out of an Authorization header. */
export function bearerFrom(header: string | undefined): string {
  if (!header) return "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/**
 * Sign a single-purpose token (e.g. email verification), scoped so it can only
 * be used for that purpose and cannot be used as a session access token.
 */
export function signPurposeToken(userId: string, purpose: string, expiresIn: string): string {
  const opts: SignOptions = { expiresIn: expiresIn as SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId, purpose }, env.jwtSecret, opts);
}

/** Verify a purpose token and return the user id, or null if invalid/expired/wrong-purpose. */
export function verifyPurposeToken(token: string, purpose: string): string | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as { sub?: string; purpose?: string };
    if (decoded.purpose !== purpose) return null;
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}
