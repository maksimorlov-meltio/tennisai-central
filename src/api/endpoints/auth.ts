// TODO: Replace mock with real API calls when backend is ready

import type {
  LoginRequest,
  SignUpRequest,
  AuthTokens,
  User,
  ApiResponse,
} from "@/types";
import { apiClient } from "@/api/client";
import { mockAuthService } from "@/mock/auth";

// Auth now talks to the real backend (server/) via the Vite /api proxy.
// Set VITE_MOCK_AUTH=true in a frontend .env to fall back to the in-memory
// mock (e.g. when running the frontend without the API server).
const USE_MOCK = import.meta.env.VITE_MOCK_AUTH === "true";

export const authApi = {
  login(data: LoginRequest): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    if (USE_MOCK) return mockAuthService.login(data);
    return apiClient.post("/auth/login", data);
  },

  signUp(data: SignUpRequest): Promise<ApiResponse<{ user: User }>> {
    if (USE_MOCK) return mockAuthService.signUp(data);
    return apiClient.post("/auth/signup", data);
  },

  logout(): Promise<ApiResponse<null>> {
    if (USE_MOCK) return mockAuthService.logout();
    return apiClient.post("/auth/logout");
  },

  getMe(): Promise<ApiResponse<User>> {
    if (USE_MOCK) return mockAuthService.getMe();
    return apiClient.get("/auth/me");
  },

  verifyEmail(token: string): Promise<ApiResponse<null>> {
    if (USE_MOCK) return mockAuthService.verifyEmail(token);
    return apiClient.post("/auth/verify-email", { token });
  },

  resendVerification(email: string): Promise<ApiResponse<null>> {
    if (USE_MOCK) return Promise.resolve({ data: null, message: "Verification link sent (mock)." });
    return apiClient.post("/auth/resend-verification", { email });
  },

  forgotPassword(email: string): Promise<ApiResponse<null>> {
    if (USE_MOCK) return mockAuthService.forgotPassword(email);
    return apiClient.post("/auth/forgot-password", { email });
  },

  resetPassword(token: string, password: string): Promise<ApiResponse<null>> {
    if (USE_MOCK) return mockAuthService.resetPassword(token, password);
    return apiClient.post("/auth/reset-password", { token, password });
  },
};
