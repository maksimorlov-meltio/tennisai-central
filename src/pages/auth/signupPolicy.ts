// ============================================================================
// The sign-up rules the form has to state BEFORE anything is submitted.
//
// Both values are enforced by the server and are deployment-specific: the age
// of digital consent varies by member state (13-16 under GDPR Art. 8) and is
// set with MINOR_AGE_THRESHOLD. Hardcoding either here would mean a form that
// asks for the wrong things and a server that rejects the result — so they are
// fetched from GET /api/auth/signup-policy, with these values as the fallback
// for the moment before the answer lands (and for mock mode, where the endpoint
// does not exist).
// ============================================================================

import { apiClient } from "@/api/client";
import type { ApiResponse } from "@/types";

export interface SignupPolicy {
  /** Below this age a parent or guardian must approve the account. */
  minorAgeThreshold: number;
  passwordMinLength: number;
}

/**
 * Matches the server's defaults. The form renders with these immediately rather
 * than waiting on the network — a sign-up form that shows a spinner before it
 * will show you a password box is worse than one that corrects itself.
 */
export const FALLBACK_SIGNUP_POLICY: SignupPolicy = {
  minorAgeThreshold: 16,
  passwordMinLength: 8,
};

/** Never rejects: a form that cannot render because a hint failed to load is a bug. */
export async function fetchSignupPolicy(): Promise<SignupPolicy> {
  try {
    const res = await apiClient.get<ApiResponse<SignupPolicy>>("/auth/signup-policy");
    const data = res?.data;
    if (
      typeof data?.minorAgeThreshold === "number" &&
      typeof data?.passwordMinLength === "number" &&
      Number.isFinite(data.minorAgeThreshold) &&
      Number.isFinite(data.passwordMinLength)
    ) {
      return { minorAgeThreshold: data.minorAgeThreshold, passwordMinLength: data.passwordMinLength };
    }
  } catch {
    /* offline, mock mode, or an older server — the fallback is correct enough. */
  }
  return FALLBACK_SIGNUP_POLICY;
}
