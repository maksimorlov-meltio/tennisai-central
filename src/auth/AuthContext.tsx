// ============================================================
// TennisAI — Auth Context (JWT-based, no Supabase)
// TODO: Integrate with AWS backend token refresh
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, UserRole, LoginRequest, SignUpRequest } from "@/types";
import { authApi } from "@/api/endpoints/auth";
import { setAccessToken } from "@/api/client";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginRequest) => Promise<void>;
  signUp: (data: SignUpRequest) => Promise<string | undefined>;
  logout: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  /** Re-fetch the current user (e.g. after completing onboarding). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Try to restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem("tennisai_token");
    if (stored) {
      setAccessToken(stored);
      authApi
        .getMe()
        .then((res) => {
          setState({ user: res.data, isLoading: false, isAuthenticated: true });
        })
        .catch(() => {
          localStorage.removeItem("tennisai_token");
          setAccessToken(null);
          setState({ user: null, isLoading: false, isAuthenticated: false });
        });
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    const res = await authApi.login(data);
    const { user, tokens } = res.data;
    setAccessToken(tokens.accessToken);
    localStorage.setItem("tennisai_token", tokens.accessToken);
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);

  const signUp = useCallback(async (data: SignUpRequest): Promise<string | undefined> => {
    const res = await authApi.signUp(data);
    return res.message;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setAccessToken(null);
    localStorage.removeItem("tennisai_token");
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  const hasRole = useCallback(
    (role: UserRole) => state.user?.role === role,
    [state.user]
  );

  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.getMe();
      setState((s) => ({ ...s, user: res.data }));
    } catch {
      // A failed refresh shouldn't tear down the session here; the api client
      // already handles 401s by logging the user out.
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, signUp, logout, hasRole, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
