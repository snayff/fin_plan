import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { useAuthStore } from "./authStore";
import { setAuthenticated, mockUser } from "../test/helpers/auth";
import { authService } from "../services/auth.service";
import { queryClient } from "../lib/queryClient";
import { SEARCH_RECENTS_STORAGE_PREFIX } from "../features/search/useSearchRecents";

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function tokenExpiringInMs(ms: number): string {
  const exp = Math.floor((Date.now() + ms) / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ sub: "user-1", exp }));
  return `${header}.${body}.signature`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const loginMock = mock(() => {});
const registerMock = mock(() => {});
const logoutMock = mock(() => {});
const refreshTokenMock = mock(() => {});
const getCurrentUserMock = mock(() => {});

beforeEach(() => {
  loginMock.mockReset();
  registerMock.mockReset();
  logoutMock.mockReset();
  refreshTokenMock.mockReset();
  getCurrentUserMock.mockReset();

  (authService as any).login = loginMock;
  (authService as any).register = registerMock;
  (authService as any).logout = logoutMock;
  (authService as any).refreshToken = refreshTokenMock;
  (authService as any).getCurrentUser = getCurrentUserMock;

  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    authStatus: "initializing",
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  // Clear any scheduled refresh timers between tests so they don't bleed across.
  useAuthStore.getState().setUnauthenticated();
});

describe("useAuthStore", () => {
  describe("initial state", () => {
    it("has correct initial state", () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.authStatus).toBe("initializing");
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("setUser", () => {
    it("sets user and token", () => {
      useAuthStore.getState().setUser(mockUser, "test-token");
      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.accessToken).toBe("test-token");
    });

    it("sets authenticated status", () => {
      useAuthStore.getState().setUser(mockUser, "test-token");
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.authStatus).toBe("authenticated");
    });

    it("clears error", () => {
      useAuthStore.setState({ error: "some error" });
      useAuthStore.getState().setUser(mockUser, "test-token");
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe("initializeAuth", () => {
    it("hydrates auth state on refresh-token success", async () => {
      (authService.refreshToken as any).mockResolvedValue({ accessToken: "new-access-token" });
      (authService.getCurrentUser as any).mockResolvedValue({ user: mockUser });

      await useAuthStore.getState().initializeAuth();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe("new-access-token");
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.authStatus).toBe("authenticated");
    });

    it("sets unauthenticated state when refresh fails", async () => {
      (authService.refreshToken as any).mockRejectedValue({ message: "Refresh failed" });

      await useAuthStore.getState().initializeAuth();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.authStatus).toBe("unauthenticated");
    });
  });

  describe("login", () => {
    it("sets isLoading during request", async () => {
      let loadingDuringRequest = false;
      (authService.login as any).mockImplementation(async () => {
        loadingDuringRequest = useAuthStore.getState().isLoading;
        return { user: mockUser, accessToken: "token" };
      });

      await useAuthStore.getState().login({ email: "test@test.com", password: "password123456" });
      expect(loadingDuringRequest).toBe(true);
    });

    it("sets user and token on success", async () => {
      (authService.login as any).mockResolvedValue({
        user: mockUser,
        accessToken: "access-token",
      });

      await useAuthStore.getState().login({ email: "test@test.com", password: "password123456" });

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.accessToken).toBe("access-token");
      expect(state.isAuthenticated).toBe(true);
      expect(state.authStatus).toBe("authenticated");
      expect(state.isLoading).toBe(false);
    });

    it("sets error on failure", async () => {
      (authService.login as any).mockRejectedValue({ message: "Invalid credentials" });

      try {
        await useAuthStore.getState().login({ email: "test@test.com", password: "wrong" });
      } catch {
        // expected
      }

      expect(useAuthStore.getState().error).toBe("Invalid credentials");
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("re-throws error for callers", async () => {
      const error = { message: "Invalid credentials" };
      (authService.login as any).mockRejectedValue(error);

      await expect(
        useAuthStore.getState().login({ email: "test@test.com", password: "wrong" })
      ).rejects.toEqual(error);
    });
  });

  describe("logout", () => {
    it("clears all auth state", async () => {
      setAuthenticated();
      (authService.logout as any).mockResolvedValue(undefined);

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.authStatus).toBe("unauthenticated");
    });

    it("calls authService.logout", async () => {
      setAuthenticated();
      (authService.logout as any).mockResolvedValue(undefined);

      await useAuthStore.getState().logout();
      expect(authService.logout).toHaveBeenCalled();
    });

    it("handles logout API failure gracefully", async () => {
      setAuthenticated();
      (authService.logout as any).mockRejectedValue(new Error("Network error"));

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().authStatus).toBe("unauthenticated");
    });
  });

  describe("setUnauthenticated", () => {
    it("clears state and sets unauthenticated status", () => {
      setAuthenticated();
      useAuthStore.getState().setUnauthenticated();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.authStatus).toBe("unauthenticated");
    });
  });

  describe("client cache reset on session end", () => {
    const recentsKey = `${SEARCH_RECENTS_STORAGE_PREFIX}${mockUser.id}`;

    afterEach(() => {
      localStorage.clear();
      sessionStorage.clear();
      queryClient.clear();
    });

    it("empties the query cache and removes persisted recents on logout", async () => {
      setAuthenticated();
      (authService.logout as any).mockResolvedValue(undefined);
      queryClient.setQueryData(["waterfall", "summary"], { surplus: 1234 });
      queryClient.setQueryData(["accounts"], [{ id: "ac1", name: "Current account" }]);
      localStorage.setItem(recentsKey, JSON.stringify([{ kind: "data", id: "ac1" }]));

      await useAuthStore.getState().logout();

      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(localStorage.getItem(recentsKey)).toBeNull();
    });

    it("empties caches on any transition to unauthenticated (e.g. session expiry)", () => {
      setAuthenticated();
      queryClient.setQueryData(["forecast"], { years: [] });
      localStorage.setItem(recentsKey, "[]");
      sessionStorage.setItem(`${SEARCH_RECENTS_STORAGE_PREFIX}other-user`, "[]");

      useAuthStore.getState().setUnauthenticated();

      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(localStorage.getItem(recentsKey)).toBeNull();
      expect(sessionStorage.getItem(`${SEARCH_RECENTS_STORAGE_PREFIX}other-user`)).toBeNull();
    });

    it("clears caches even when the logout API call fails", async () => {
      setAuthenticated();
      (authService.logout as any).mockRejectedValue(new Error("Network error"));
      queryClient.setQueryData(["accounts"], [{ id: "ac1", name: "Current account" }]);
      localStorage.setItem(recentsKey, "[]");

      await useAuthStore.getState().logout();

      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(localStorage.getItem(recentsKey)).toBeNull();
    });

    it("clears caches when session restore fails on startup", async () => {
      (authService.refreshToken as any).mockRejectedValue({ message: "Refresh failed" });
      queryClient.setQueryData(["accounts"], [{ id: "ac1", name: "Current account" }]);
      localStorage.setItem(recentsKey, "[]");

      await useAuthStore.getState().initializeAuth();

      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(localStorage.getItem(recentsKey)).toBeNull();
    });

    it("clears caches when a scheduled token refresh fails", async () => {
      setAuthenticated(mockUser, tokenExpiringInMs(60 * 60 * 1000));
      (authService.refreshToken as any).mockRejectedValue({ message: "expired" });
      queryClient.setQueryData(["forecast"], { years: [2026] });
      localStorage.setItem(recentsKey, "[]");

      useAuthStore.getState().updateAccessToken(tokenExpiringInMs(50));
      await wait(50);

      expect(useAuthStore.getState().authStatus).toBe("unauthenticated");
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(localStorage.getItem(recentsKey)).toBeNull();
    });

    it("leaves non-user-data storage keys untouched", () => {
      setAuthenticated();
      localStorage.setItem("finplan.theme", "dark");

      useAuthStore.getState().setUnauthenticated();

      expect(localStorage.getItem("finplan.theme")).toBe("dark");
    });
  });

  describe("clearError", () => {
    it("clears the error state", () => {
      useAuthStore.setState({ error: "some error" });
      useAuthStore.getState().clearError();
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe("updateAccessToken", () => {
    it("updates the access token", () => {
      useAuthStore.getState().updateAccessToken("new-token");
      expect(useAuthStore.getState().accessToken).toBe("new-token");
    });
  });

  describe("proactive refresh scheduling", () => {
    it("triggers refresh almost immediately when setUser receives a near-expiry token", async () => {
      const replacement = tokenExpiringInMs(60 * 60 * 1000);
      (authService.refreshToken as any).mockResolvedValue({ accessToken: replacement });

      useAuthStore.getState().setUser(mockUser, tokenExpiringInMs(50));

      await wait(50);
      expect(refreshTokenMock).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().accessToken).toBe(replacement);
    });

    it("does not refresh when the token has plenty of life left", async () => {
      useAuthStore.getState().setUser(mockUser, tokenExpiringInMs(60 * 60 * 1000));

      await wait(50);
      expect(refreshTokenMock).not.toHaveBeenCalled();
    });

    it("cancels the scheduled refresh on setUnauthenticated", async () => {
      useAuthStore.getState().setUser(mockUser, tokenExpiringInMs(50));
      useAuthStore.getState().setUnauthenticated();

      await wait(50);
      expect(refreshTokenMock).not.toHaveBeenCalled();
    });

    it("reschedules when updateAccessToken receives a new near-expiry token", async () => {
      const replacement = tokenExpiringInMs(60 * 60 * 1000);
      (authService.refreshToken as any).mockResolvedValue({ accessToken: replacement });

      useAuthStore.getState().setUser(mockUser, tokenExpiringInMs(60 * 60 * 1000));
      useAuthStore.getState().updateAccessToken(tokenExpiringInMs(50));

      await wait(50);
      expect(refreshTokenMock).toHaveBeenCalledTimes(1);
    });

    it("clears auth state when the scheduled refresh fails", async () => {
      setAuthenticated(mockUser, tokenExpiringInMs(60 * 60 * 1000));
      (authService.refreshToken as any).mockRejectedValue({ message: "expired" });

      useAuthStore.getState().updateAccessToken(tokenExpiringInMs(50));

      await wait(50);
      expect(useAuthStore.getState().authStatus).toBe("unauthenticated");
    });

    it("ignores tokens with no exp claim (no infinite reschedule loop)", async () => {
      const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const body = base64url(JSON.stringify({ sub: "user-1" }));
      const noExpToken = `${header}.${body}.sig`;

      useAuthStore.getState().setUser(mockUser, noExpToken);

      await wait(50);
      expect(refreshTokenMock).not.toHaveBeenCalled();
    });
  });
});
