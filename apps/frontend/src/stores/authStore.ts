import { create } from "zustand";
import {
  authService,
  type User,
  type LoginData,
  type RegisterData,
} from "../services/auth.service";
import type { ApiError } from "../lib/api";
import { decodeAccessTokenExpMs } from "../lib/jwt";
import { resetClientCaches } from "../lib/sessionCleanup";

export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  authStatus: AuthStatus;
  isLoading: boolean;
  error: string | null;

  register: (data: RegisterData) => Promise<void>;
  login: (data: LoginData) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User, accessToken: string) => void;
  setUnauthenticated: () => void;
  updateAccessToken: (accessToken: string) => void;
}

let initializationPromise: Promise<void> | null = null;

// Refresh the access token this many ms before its `exp` claim. The 60s buffer
// gives a comfortable window for the refresh round-trip and absorbs minor
// clock skew between client and server.
const REFRESH_BUFFER_MS = 60_000;

// Floor on the scheduled delay. Prevents a tight loop if the server ever
// hands out a token whose `exp` is permanently in the past.
const MIN_REFRESH_DELAY_MS = 5_000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function clearScheduledRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleProactiveRefresh(token: string): void {
  clearScheduledRefresh();

  const expMs = decodeAccessTokenExpMs(token);
  if (expMs === null) return;

  const naturalDelay = expMs - Date.now() - REFRESH_BUFFER_MS;
  const delay = naturalDelay <= 0 ? 0 : Math.max(naturalDelay, MIN_REFRESH_DELAY_MS);

  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void runScheduledRefresh();
  }, delay);
}

async function runScheduledRefresh(): Promise<void> {
  try {
    const { accessToken } = await authService.refreshToken();
    // Route through updateAccessToken so the next refresh is scheduled.
    useAuthStore.getState().updateAccessToken(accessToken);
  } catch {
    // Refresh failed — drop to unauthenticated and let the existing
    // mutation/redirect flow kick the user to /login on next interaction.
    useAuthStore.getState().setUnauthenticated();
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  authStatus: "initializing",
  isLoading: false,
  error: null,

  setUser: (user, accessToken) => {
    set({
      user,
      accessToken,
      isAuthenticated: true,
      authStatus: "authenticated",
      error: null,
    });
    scheduleProactiveRefresh(accessToken);
  },

  setUnauthenticated: () => {
    clearScheduledRefresh();
    // Every path out of an authenticated session lands here (manual logout,
    // refresh failure, session expiry), so this is the single place where
    // client-side caches holding user data are reset.
    resetClientCaches();
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      authStatus: "unauthenticated",
      isLoading: false,
      error: null,
    });
  },

  initializeAuth: async () => {
    if (get().authStatus !== "initializing") {
      return;
    }

    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      try {
        const { accessToken } = await authService.refreshToken();
        const { user } = await authService.getCurrentUser(accessToken);
        get().setUser(user, accessToken);
      } catch (error) {
        const apiError = error as ApiError;
        // 400 VALIDATION_ERROR (missing refresh token) is expected when no session exists — treat silently
        if (apiError.statusCode !== 400) {
          if (import.meta.env.DEV)
            console.warn("[auth] Unexpected error during token refresh:", error);
        }
        get().setUnauthenticated();
      } finally {
        initializationPromise = null;
      }
    })();

    return initializationPromise;
  },

  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register(data);
      get().setUser(response.user, response.accessToken);
      set({ isLoading: false });
    } catch (error) {
      const apiError = error as ApiError;
      set({
        isLoading: false,
        error: apiError.message || "Registration failed",
      });
      throw error;
    }
  },

  login: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(data);
      get().setUser(response.user, response.accessToken);
      set({ isLoading: false });
    } catch (error) {
      const apiError = error as ApiError;
      set({
        isLoading: false,
        error: apiError.message || "Login failed",
      });
      throw error;
    }
  },

  logout: async () => {
    const { accessToken } = get();
    if (accessToken) {
      try {
        await authService.logout(accessToken);
      } catch (error) {
        if (import.meta.env.DEV) console.error("Logout error:", error);
      }
    }

    get().setUnauthenticated();
  },

  clearError: () => set({ error: null }),

  updateAccessToken: (accessToken) => {
    set({ accessToken });
    scheduleProactiveRefresh(accessToken);
  },
}));
