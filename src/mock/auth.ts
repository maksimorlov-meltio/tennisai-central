// ============================================================
// Mock Auth Service — Replace with real API
// ============================================================

import type {
  LoginRequest,
  SignUpRequest,
  AuthTokens,
  User,
  ApiResponse,
  PlayerProfile,
  CoachProfile,
  ObserverProfile,
  AdminProfile,
} from "@/types";

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

const MOCK_USERS: Record<string, User & { password: string }> = {
  "player@test.com": {
    id: "p1",
    email: "player@test.com",
    role: "player",
    firstName: "Alex",
    lastName: "Rivera",
    emailVerified: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    password: "password123",
  } as PlayerProfile & { password: string },
  "coach@test.com": {
    id: "c1",
    email: "coach@test.com",
    role: "coach",
    firstName: "Jordan",
    lastName: "Smith",
    emailVerified: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    password: "password123",
  } as CoachProfile & { password: string },
  "observer@test.com": {
    id: "o1",
    email: "observer@test.com",
    role: "observer",
    firstName: "Morgan",
    lastName: "Lee",
    emailVerified: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    password: "password123",
  } as ObserverProfile & { password: string },
  "admin@test.com": {
    id: "a1",
    email: "admin@test.com",
    role: "admin",
    firstName: "Admin",
    lastName: "User",
    emailVerified: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    password: "password123",
  } as AdminProfile & { password: string },
};

let currentUser: User | null = null;

/**
 * Outstanding mock reset tokens (token → email). Mirrors the real flow's rules:
 * short-lived and single-use. The token is logged to the console — the same dev
 * affordance the server gives when Gmail is not configured.
 */
const MOCK_RESET_TOKENS = new Map<string, { email: string; expiresAt: number }>();
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour, matching the server
const MIN_PASSWORD_LENGTH = 8;
const RESET_INVALID_MESSAGE =
  "This password reset link is invalid or has expired. Please request a new one.";

function makeTokens(): AuthTokens {
  return { accessToken: "mock-access-token", refreshToken: "mock-refresh-token" };
}

function stripPassword(u: User & { password: string }): User {
  const { password, ...rest } = u;
  return rest;
}

export const mockAuthService = {
  async login(data: LoginRequest): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    await delay();
    const email = data.email.trim().toLowerCase();
    const found = MOCK_USERS[email];
    if (!found || found.password !== data.password) {
      throw { status: 401, message: "Invalid email or password" };
    }
    currentUser = stripPassword(found);
    return { data: { user: currentUser, tokens: makeTokens() } };
  },

  async signUp(data: SignUpRequest): Promise<ApiResponse<{ user: User }>> {
    await delay();
    const email = data.email.trim().toLowerCase();
    if (MOCK_USERS[email]) {
      throw { status: 409, message: "Email already registered" };
    }
    const newUser: User & { password: string } = {
      id: `u-${Date.now()}`,
      email,
      role: data.role,
      firstName: data.firstName,
      lastName: data.lastName,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      password: data.password,
    };
    // Persist the new account so the user can actually sign in afterwards.
    // (Previously the new user was discarded, so signup → login always failed.)
    MOCK_USERS[email] = newUser;
    return { data: { user: stripPassword(newUser) }, message: "Check your email to verify your account" };
  },

  async logout(): Promise<ApiResponse<null>> {
    await delay(200);
    currentUser = null;
    return { data: null };
  },

  async getMe(): Promise<ApiResponse<User>> {
    await delay(300);
    if (!currentUser) throw { status: 401, message: "Not authenticated" };
    return { data: currentUser };
  },

  async verifyEmail(_token: string): Promise<ApiResponse<null>> {
    await delay();
    return { data: null, message: "Email verified successfully" };
  },

  /**
   * Mock forgot-password. Returns the SAME generic message whether or not the
   * account exists — no enumeration, exactly like the real endpoint.
   */
  async forgotPassword(email: string): Promise<ApiResponse<null>> {
    await delay();
    const normalized = email.trim().toLowerCase();
    if (MOCK_USERS[normalized]) {
      const token = `mock-reset-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      MOCK_RESET_TOKENS.set(token, { email: normalized, expiresAt: Date.now() + RESET_TTL_MS });
      // Stand-in for the email the server would send (dev-only convenience).
      console.log(`[mock auth] password reset link: /reset-password?token=${token}`);
    }
    return { data: null, message: "If that email is registered, a reset link is on its way." };
  },

  /** Mock reset-password: validates length, consumes the token (single-use), swaps the password. */
  async resetPassword(token: string, password: string): Promise<ApiResponse<null>> {
    await delay();
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw { status: 400, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
    }
    const entry = MOCK_RESET_TOKENS.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      MOCK_RESET_TOKENS.delete(token);
      throw { status: 400, message: RESET_INVALID_MESSAGE };
    }
    const user = MOCK_USERS[entry.email];
    if (!user) throw { status: 400, message: RESET_INVALID_MESSAGE };
    user.password = password;
    MOCK_RESET_TOKENS.delete(token); // single-use
    return { data: null, message: "Your password has been updated. You can sign in with it now." };
  },
};
