import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, afterEach, beforeAll, expect } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers);
import pkg from "../../../../package.json";
import { server } from "./msw/server";

// Start MSW before all tests; reset per-test handler overrides after each; close after all
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(async () => {
  server.resetHandlers();
  document.body.innerHTML = "";
  // Reset location.href so MSW can still resolve relative handler paths correctly
  // (auth error handlers set window.location.href = '/login' which breaks URL resolution)
  (globalThis as any).location = { href: "http://localhost:3001", pathname: "/" };
  // Reset the singleton apiClient's CSRF cache so each test starts clean
  const { apiClient } = await import("../lib/api");
  (apiClient as any).csrfToken = null;
  (apiClient as any).isRefreshing = false;
  (apiClient as any).refreshPromise = null;
  // Reset the auth store to unauthenticated state so tests don't leak auth state
  const { useAuthStore } = await import("../stores/authStore");
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    authStatus: "unauthenticated",
    isLoading: false,
    error: null,
  });
});
afterAll(() => server.close());

// Set environment variable so api.ts uses http://localhost:3001 as base URL
process.env.VITE_API_URL = "http://localhost:3001";
// Mirrors vite.config.ts `define` so import.meta.env.VITE_APP_VERSION
// (aliased to process.env in bun test) resolves the same value at runtime.
process.env.VITE_APP_VERSION = pkg.version;

// Mock window.location — href must match VITE_API_URL so MSW resolves relative
// handler paths (e.g. '/api/accounts') against the same origin the API client uses.
Object.defineProperty(window, "location", {
  value: { href: "http://localhost:3001", pathname: "/" },
  writable: true,
});
