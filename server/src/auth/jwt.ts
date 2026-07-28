import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../env";

/** Sign a short access token carrying the user id in `sub`. */
export function signToken(userId: string): string {
  const opts: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId }, env.jwtSecret, opts);
}

/** Verify a token and return the user id, or null if invalid/expired. */
export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as { sub?: string };
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
