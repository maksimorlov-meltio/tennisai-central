import { describe, it, expect } from "vitest";
import { signToken, verifyToken, bearerFrom, signPurposeToken, verifyPurposeToken } from "./jwt";

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
