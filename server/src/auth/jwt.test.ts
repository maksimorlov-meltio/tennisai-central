import { describe, it, expect } from "vitest";
import jsonwebtoken from "jsonwebtoken";
import {
  signToken,
  verifyToken,
  bearerFrom,
  signPurposeToken,
  verifyPurposeToken,
  signResetToken,
  verifyResetToken,
  RESET_PURPOSE,
  RESET_TTL,
} from "./jwt";

describe("jwt", () => {
  it("round-trips a user id", () => {
    const token = signToken("user-123");
    expect(verifyToken(token)).toBe("user-123");
  });

  it("rejects a tampered token", () => {
    const token = signToken("user-123");
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyToken(tampered)).toBeNull();
  });

  it("rejects garbage / empty tokens", () => {
    expect(verifyToken("")).toBeNull();
    expect(verifyToken("not-a-jwt")).toBeNull();
    expect(verifyToken("a.b.c")).toBeNull();
  });

  it("does not accept a token signed with a different secret", () => {
    // A token whose signature was produced elsewhere must not verify.
    const forged =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.this_signature_is_invalid_for_our_secret";
    expect(verifyToken(forged)).toBeNull();
  });
});

describe("purpose tokens (email verification)", () => {
  it("round-trips a purpose token", () => {
    const token = signPurposeToken("user-1", "verify_email", "1d");
    expect(verifyPurposeToken(token, "verify_email")).toBe("user-1");
  });

  it("rejects a token used for the wrong purpose", () => {
    const token = signPurposeToken("user-1", "verify_email", "1d");
    expect(verifyPurposeToken(token, "reset_password")).toBeNull();
  });

  it("does not accept a plain session token as a purpose token", () => {
    const session = signToken("user-1");
    expect(verifyPurposeToken(session, "verify_email")).toBeNull();
  });

  it("a purpose token is NOT accepted as a session token (missing typ:access)", () => {
    // A verification link token travels in a URL; it must never be replayable
    // as a session credential even though it verifies against the same secret.
    const token = signPurposeToken("user-9", "verify_email", "1d");
    expect(verifyToken(token)).toBeNull();
  });
});

describe("access-token typ claim", () => {
  it("accepts a freshly signed session token", () => {
    expect(verifyToken(signToken("user-42"))).toBe("user-42");
  });

  it("rejects a token that lacks the access typ claim", () => {
    // Simulate a legacy/hand-rolled token with only `sub` — no typ:access.
    const legacy = signPurposeToken("user-7", "not-access", "1d");
    expect(verifyToken(legacy)).toBeNull();
  });
});

describe("password-reset tokens", () => {
  it("verifies a freshly minted reset token and returns the user id", () => {
    const claims = verifyResetToken(signResetToken("user-reset-1"));
    expect(claims?.userId).toBe("user-reset-1");
  });

  it("reports the issued-at second, so the route can enforce single use", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const claims = verifyResetToken(signResetToken("user-reset-2"));
    expect(claims?.issuedAtSeconds).toBeGreaterThanOrEqual(nowSeconds - 2);
    expect(claims?.issuedAtSeconds).toBeLessThanOrEqual(nowSeconds + 2);
  });

  it("is scoped to the reset purpose and nothing else", () => {
    const token = signResetToken("user-reset-3");
    expect(verifyPurposeToken(token, RESET_PURPOSE)).toBe("user-reset-3");
    expect(verifyPurposeToken(token, "verify_email")).toBeNull();
  });

  it("rejects a token minted for a different purpose", () => {
    const verifyEmailToken = signPurposeToken("user-reset-4", "verify_email", "1d");
    expect(verifyResetToken(verifyEmailToken)).toBeNull();
  });

  it("is NOT accepted by verifyToken as a session credential", () => {
    // The reset token travels in a URL and may sit in a mail client / browser
    // history — it must never buy a session.
    const token = signResetToken("user-reset-5");
    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a session token as a reset token", () => {
    expect(verifyResetToken(signToken("user-reset-6"))).toBeNull();
  });

  it("rejects an expired reset token", () => {
    // Same purpose, already-elapsed TTL — the expiry check must fire.
    const expired = signPurposeToken("user-reset-7", RESET_PURPOSE, "-1s");
    expect(verifyResetToken(expired)).toBeNull();
  });

  it("rejects tampered / garbage reset tokens", () => {
    const token = signResetToken("user-reset-8");
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyResetToken(tampered)).toBeNull();
    expect(verifyResetToken("")).toBeNull();
    expect(verifyResetToken("not-a-jwt")).toBeNull();
  });

  it("expires within an hour (recovery rule: TTL ≤ 1h)", () => {
    const decoded = jsonwebtoken.decode(signResetToken("user-reset-9")) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(60 * 60);
    expect(RESET_TTL).toBe("1h");
  });
});

describe("bearerFrom", () => {
  it("extracts the token from a Bearer header", () => {
    expect(bearerFrom("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("returns empty for missing or malformed headers", () => {
    expect(bearerFrom(undefined)).toBe("");
    expect(bearerFrom("")).toBe("");
    expect(bearerFrom("Basic abc")).toBe("");
    expect(bearerFrom("abc.def.ghi")).toBe("");
  });
});
