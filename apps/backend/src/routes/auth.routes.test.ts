import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

mock.module("../services/auth.service", () => {
  const fns = {
    register: mock(() => {}),
    login: mock(() => {}),
    findUserById: mock(() => {}),
    refreshAccessToken: mock(() => {}),
    revokeAllUserTokens: mock(() => Promise.resolve()),
    getUserSessions: mock(() => Promise.resolve([])),
    revokeSession: mock(() => Promise.resolve(true)),
    updateUserName: mock(() => {}),
  };
  return { ...fns, authService: fns };
});

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

const mockAuditLog = mock(() => {});
mock.module("../services/audit.service", () => ({
  auditService: { log: mockAuditLog },
}));

import { authService } from "../services/auth.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRoutes } from "./auth.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mockAuditLog.mockClear();
  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
  });
});

const mockAuthResponse = {
  user: { id: "user-1", email: "test@test.com", name: "Test User" },
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

const mockRefreshResponse = {
  accessToken: "new-token",
  refreshToken: "rotated-refresh-token",
  rememberMe: true,
  expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  sessionExpiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
};

describe("POST /api/auth/register", () => {
  it("returns 201 with valid input", async () => {
    (authService.register as any).mockResolvedValue(mockAuthResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "test@test.com", password: "password123456", name: "Test User" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.accessToken).toBe("access-token");
    expect(body.user.email).toBe("test@test.com");
  });

  it("does not expose refreshToken in response body", async () => {
    (authService.register as any).mockResolvedValue(mockAuthResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "test@test.com", password: "password123456", name: "Test User" },
    });

    const body = response.json();
    expect(body.refreshToken).toBeUndefined();
  });

  it("sets refreshToken cookie", async () => {
    (authService.register as any).mockResolvedValue(mockAuthResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "test@test.com", password: "password123456", name: "Test User" },
    });

    const cookies = response.cookies;
    const refreshCookie = cookies.find((c: any) => c.name === "refreshToken");
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.httpOnly).toBe(true);
  });

  it("returns 400 for invalid email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", password: "password123456", name: "Test User" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for short password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "test@test.com", password: "short", name: "Test User" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for missing name", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "test@test.com", password: "password123456" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("returns 200 with valid credentials", async () => {
    (authService.login as any).mockResolvedValue(mockAuthResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.com", password: "password123456" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBe("access-token");
    expect(body.user.email).toBe("test@test.com");
  });

  it("does not expose refreshToken in response body", async () => {
    (authService.login as any).mockResolvedValue(mockAuthResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.com", password: "password123456" },
    });

    const body = response.json();
    expect(body.refreshToken).toBeUndefined();
  });

  it("sets refreshToken cookie", async () => {
    (authService.login as any).mockResolvedValue(mockAuthResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.com", password: "password123456" },
    });

    const refreshCookie = response.cookies.find((c: any) => c.name === "refreshToken");
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.maxAge).toBeUndefined();
  });

  it("sets persistent refresh cookie when rememberMe=true", async () => {
    (authService.login as any).mockResolvedValue(mockAuthResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.com", password: "password123456", rememberMe: true },
    });

    const refreshCookie = response.cookies.find((c: any) => c.name === "refreshToken");
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.maxAge).toBeDefined();
  });

  it("passes rememberMe through to authService.login", async () => {
    (authService.login as any).mockResolvedValue(mockAuthResponse);

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.com", password: "password123456", rememberMe: true },
    });

    expect(authService.login).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@test.com",
        password: "password123456",
        rememberMe: true,
      })
    );
  });

  it("returns 400 for missing email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "password123456" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for missing password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.com" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 401 for invalid credentials", async () => {
    (authService.login as any).mockRejectedValue(new AuthenticationError("Invalid credentials"));

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@test.com", password: "wrongpassword1" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTH_ERROR");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 200 with user data when authenticated", async () => {
    const user = { id: "user-1", email: "test@test.com", name: "Test" };
    (authService.findUserById as any).mockResolvedValue(user);

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toEqual(user);
  });

  it("returns 401 without auth token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 404 when user not found", async () => {
    (authService.findUserById as any).mockResolvedValue(null);

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /api/auth/refresh", () => {
  it("returns 200 with new access token from body", async () => {
    (authService.refreshAccessToken as any).mockResolvedValue(mockRefreshResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: "valid-refresh-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBe("new-token");
  });

  it("sets persistent cookie on refresh when rememberMe=true", async () => {
    (authService.refreshAccessToken as any).mockResolvedValue(mockRefreshResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: "valid-refresh-token" },
    });

    const refreshCookie = response.cookies.find((c: any) => c.name === "refreshToken");
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.maxAge).toBeDefined();
  });

  it("returns 400 when no refresh token provided", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 for invalid refresh token", async () => {
    (authService.refreshAccessToken as any).mockRejectedValue(
      new AuthenticationError("Invalid or expired refresh token")
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: "expired-token" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 when authenticated", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toContain("Logged out");
  });

  it("clears refreshToken cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: "Bearer valid-token" },
    });

    const refreshCookie = response.cookies.find((c: any) => c.name === "refreshToken");
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.value).toBe("");
  });

  it("returns 401 without auth token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("PATCH /api/auth/me", () => {
  it("returns 200 with updated user when authenticated", async () => {
    const updatedUser = { id: "user-1", email: "test@test.com", name: "New Name" };
    (authService.updateUserName as any).mockResolvedValue(updatedUser);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: { Authorization: "Bearer valid-token" },
      payload: { name: "New Name" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.name).toBe("New Name");
    expect(authService.updateUserName).toHaveBeenCalledWith("user-1", "New Name");
  });

  it("returns 400 when name is empty", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: { Authorization: "Bearer valid-token" },
      payload: { name: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when name is whitespace only", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: { Authorization: "Bearer valid-token" },
      payload: { name: "   " },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    (authMiddleware as any).mockImplementationOnce(() => {
      throw new AuthenticationError("No authorization token provided");
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      payload: { name: "New Name" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("PATCH /api/auth/me writes UPDATE_PROFILE audit row with before/after name", async () => {
    const oldUser = { id: "user-1", email: "test@test.com", name: "Old Name" };
    const updatedUser = { id: "user-1", email: "test@test.com", name: "New Name" };
    (authService.findUserById as any).mockResolvedValueOnce(oldUser);
    (authService.updateUserName as any).mockResolvedValue(updatedUser);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers: { Authorization: "Bearer valid-token" },
      payload: { name: "New Name" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "UPDATE_PROFILE",
        resource: "user",
        resourceId: "user-1",
        metadata: { before: { name: "Old Name" }, after: { name: "New Name" } },
      })
    );
  });
});
