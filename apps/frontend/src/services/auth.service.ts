import { apiClient } from "../lib/api";

export interface User {
  id: string;
  email: string;
  name: string;
  activeHouseholdId: string | null;
  createdAt: string;
  updatedAt: string;
  preferences: {
    currency: string;
    dateFormat: string;
    theme: string;
    defaultInflationRate: number;
  };
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export const authService = {
  async register(data: RegisterData): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>("/api/auth/register", data);
  },

  async login(data: LoginData): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>("/api/auth/login", data);
  },

  async logout(token: string): Promise<void> {
    await apiClient.post("/api/auth/logout", {}, token);
  },

  async getCurrentUser(token: string): Promise<{ user: User }> {
    return apiClient.get<{ user: User }>("/api/auth/me", token);
  },

  async updateProfile(token: string, data: { name: string }): Promise<{ user: User }> {
    return apiClient.patch<{ user: User }>("/api/auth/me", data, token);
  },

  async refreshToken(): Promise<{ accessToken: string }> {
    // No longer pass refreshToken - it's in httpOnly cookie
    return apiClient.post<{ accessToken: string }>("/api/auth/refresh", {});
  },

  /**
   * Change the password for the signed-in user (SEC-2). On success the backend
   * revokes every session, so callers should treat this as a logout and route
   * the user back to /login.
   */
  async changePassword(
    token: string,
    data: { currentPassword: string; newPassword: string }
  ): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>("/api/auth/change-password", data, token);
  },

  /**
   * Request a password-reset email (SEC-2). Always resolves with the same
   * generic message whether or not the account exists — never surface account
   * existence to the caller.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>("/api/auth/forgot-password", { email });
  },

  /** Complete a password reset with the token from the reset email (SEC-2). */
  async resetPassword(data: { token: string; newPassword: string }): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>("/api/auth/reset-password", data);
  },
};
