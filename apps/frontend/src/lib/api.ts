import { decodeAccessTokenExpMs } from "./jwt";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// If the supplied access token expires within this window, refresh it before
// issuing the request. Covers cases where the auth-store scheduler missed its
// fire (e.g. backgrounded tab with throttled timers).
const PREFLIGHT_REFRESH_WINDOW_MS = 5_000;

export interface ApiError {
  message: string;
  code?: string;
  statusCode: number;
}

/** Shape of a parsed response body we care about for error extraction. */
interface ResponseEnvelope {
  error?: { message?: string; code?: string };
  [key: string]: unknown;
}

export class ApiClient {
  private baseUrl: string;
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;
  private csrfToken: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch CSRF token from server
   */
  private async fetchCsrfToken(): Promise<string> {
    if (this.csrfToken) {
      return this.csrfToken;
    }

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1500;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${this.baseUrl}/api/auth/csrf-token`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const token: string = data.csrfToken || "";
        this.csrfToken = token;
        return token;
      }

      // Retry on 5xx (e.g. backend restarting due to hot-reload)
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      throw {
        message: "Failed to fetch CSRF token",
        code: "CSRF_FETCH_ERROR",
        statusCode: response.status,
      } as ApiError;
    }

    throw {
      message: "Failed to fetch CSRF token after retries",
      code: "CSRF_FETCH_ERROR",
      statusCode: 500,
    } as ApiError;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Automatically include auth token from store if not explicitly provided and not auth endpoint
    let authHeaders = {};
    const unauthenticated = [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/refresh",
      "/api/auth/csrf-token",
      "/api/auth/me",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
    ];
    const isAuthEndpoint =
      unauthenticated.some((p) => endpoint.startsWith(p)) ||
      (endpoint.startsWith("/api/auth/invite/") && !endpoint.endsWith("/join"));
    if (!isAuthEndpoint) {
      try {
        const { useAuthStore } = await import("../stores/authStore");
        const storedToken = useAuthStore.getState().accessToken;
        const token = await this.resolveAccessToken(storedToken);
        if (token) {
          authHeaders = { Authorization: `Bearer ${token}` };
        }
      } catch {
        // Store not available yet - continue without auth
      }
    }

    try {
      // Get CSRF token for all state-changing requests (including auth endpoints)
      let csrfToken: string | undefined;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method || "GET")) {
        csrfToken = await this.fetchCsrfToken();
      }

      const config: RequestInit = {
        ...options,
        credentials: "include", // CRITICAL: Send cookies
        headers: {
          ...(options.body !== undefined && { "Content-Type": "application/json" }),
          ...(csrfToken && { "X-CSRF-Token": csrfToken }),
          ...authHeaders,
          ...options.headers, // Allow explicit override
        },
      };

      const response = await fetch(url, config);
      // Tolerate empty and non-JSON bodies (e.g. 204, empty 401, 502 HTML).
      // `response.status` stays authoritative for the control-flow branches below.
      const data: ResponseEnvelope | undefined =
        response.status === 204 || response.headers.get("content-length") === "0"
          ? undefined
          : ((await response.json().catch(() => undefined)) as ResponseEnvelope | undefined);

      if (!response.ok) {
        const apiError: ApiError = {
          message: data?.error?.message || "Request failed",
          code: data?.error?.code,
          statusCode: response.status,
        };

        // Handle 401 errors - attempt to refresh token
        if (
          response.status === 401 &&
          !isRetry &&
          endpoint !== "/api/auth/refresh" &&
          endpoint !== "/api/auth/login"
        ) {
          const newAccessToken = await this.handleTokenRefresh();

          if (newAccessToken) {
            // Update authorization header and retry request
            const retryConfig: RequestInit = {
              ...config,
              headers: {
                ...config.headers,
                Authorization: `Bearer ${newAccessToken}`,
              },
            };
            return this.request<T>(endpoint, retryConfig, true);
          }
        }

        // Handle CSRF token errors
        if (response.status === 403 && data?.error?.code === "FST_CSRF_INVALID_TOKEN") {
          // Clear cached CSRF token and retry
          this.csrfToken = null;
          if (!isRetry) {
            return this.request<T>(endpoint, options, true);
          }
        }

        throw apiError;
      }

      return data as T;
    } catch (error) {
      if ((error as ApiError).statusCode) {
        throw error;
      }

      // Log the actual error in development for easier debugging
      if (import.meta.env.DEV) {
        console.error("Network request failed:", {
          url,
          error,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }

      throw {
        message: "Network error",
        statusCode: 0,
      } as ApiError;
    }
  }

  /**
   * Pre-flight check: if the supplied access token is missing an `exp` claim
   * we can decode, return it unchanged. If `exp` is within the refresh window
   * (or already past), trigger a single shared refresh and return the new token.
   *
   * SECURITY: The decoded `exp` is treated as a UX hint only. The backend
   * still validates the JWT signature and expiry on every request.
   */
  private async resolveAccessToken(token: string | null): Promise<string | null> {
    if (!token) return null;

    const expMs = decodeAccessTokenExpMs(token);
    if (expMs === null) return token;

    if (expMs - Date.now() > PREFLIGHT_REFRESH_WINDOW_MS) return token;

    const refreshed = await this.handleTokenRefresh();
    return refreshed ?? token;
  }

  private async handleTokenRefresh(): Promise<string | null> {
    // Prevent multiple simultaneous refresh requests
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;

    this.refreshPromise = (async () => {
      try {
        // Get auth store dynamically to avoid circular dependency
        const { useAuthStore } = await import("../stores/authStore");
        const authStore = useAuthStore.getState();

        // Call refresh endpoint - refreshToken is in httpOnly cookie
        const { authService } = await import("../services/auth.service");
        const { accessToken } = await authService.refreshToken();

        if (authStore.user) {
          authStore.updateAccessToken(accessToken);
        } else {
          // Cold-start refresh needs a user profile before we can mark auth as complete.
          const { user } = await authService.getCurrentUser(accessToken);
          authStore.setUser(user, accessToken);
        }

        return accessToken;
      } catch (error) {
        // Refresh failed - clear client auth state and force login.
        if (import.meta.env.DEV) console.error("Token refresh failed:", error);
        const { useAuthStore } = await import("../stores/authStore");
        useAuthStore.getState().setUnauthenticated();

        // Redirect to login
        window.location.href = "/login";
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async get<T>(endpoint: string, token?: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  async post<T>(endpoint: string, data?: unknown, token?: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown, token?: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown, token?: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, data?: unknown, token?: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

export const apiClient = new ApiClient();
