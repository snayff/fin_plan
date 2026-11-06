import { describe, it, expect, beforeEach } from "bun:test";
import { http, HttpResponse } from "msw";
import { server } from "../test/msw/server";
import { setAuthenticated } from "../test/helpers/auth";
import { mockUser } from "../test/msw/handlers";
import { authService } from "./auth.service";

// Ensures authStore.user is non-null so handleTokenRefresh takes the
// updateAccessToken path rather than the cold-start getCurrentUser path,
// which would deadlock when /api/auth/me is overridden to return 401.
beforeEach(() => setAuthenticated());

// ─── login ────────────────────────────────────────────────────────────────────

describe("authService.login", () => {
  it("returns user and tokens on valid credentials", async () => {
    const result = await authService.login({ email: "test@example.com", password: "password" });
    expect(result.user.id).toBe(mockUser.id);
    expect(result.user.email).toBe(mockUser.email);
    expect(result.accessToken).toBe("test-token");
  });

  it("throws on 401 response from server", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json(
          { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } },
          { status: 401 }
        )
      )
    );
    await expect(
      authService.login({ email: "wrong@example.com", password: "bad" })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ─── register ─────────────────────────────────────────────────────────────────

describe("authService.register", () => {
  it("returns user and tokens on successful registration", async () => {
    const result = await authService.register({
      email: "new@example.com",
      password: "password",
      name: "New User",
    });
    expect(result.user.id).toBe(mockUser.id);
    expect(result.accessToken).toBe("test-token");
  });

  it("throws on 409 conflict when email already exists", async () => {
    server.use(
      http.post("/api/auth/register", () =>
        HttpResponse.json(
          { error: { code: "EMAIL_ALREADY_EXISTS", message: "Email in use" } },
          { status: 409 }
        )
      )
    );
    await expect(
      authService.register({ email: "existing@example.com", password: "password", name: "User" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe("authService.logout", () => {
  it("resolves without error on success", async () => {
    // Override: the default handler returns null body which apiClient cannot parse;
    // return empty JSON so the underlying client succeeds.
    server.use(http.post("/api/auth/logout", () => HttpResponse.json({})));
    // Simply resolving without throwing is the success condition for a void method
    const result = await authService.logout("mock-access-token");
    expect(result).toBeUndefined();
  });

  it("throws on 500 server error", async () => {
    server.use(
      http.post("/api/auth/logout", () =>
        HttpResponse.json(
          { error: { code: "INTERNAL_ERROR", message: "Server error" } },
          { status: 500 }
        )
      )
    );
    await expect(authService.logout("mock-access-token")).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

// ─── getCurrentUser ───────────────────────────────────────────────────────────

describe("authService.getCurrentUser", () => {
  it("returns the current user when authenticated", async () => {
    const result = await authService.getCurrentUser("mock-access-token");
    expect(result.user.id).toBe(mockUser.id);
    expect(result.user.email).toBe(mockUser.email);
  });

  it("throws on 401 when token is invalid", async () => {
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json(
          { error: { code: "AUTHENTICATION_ERROR", message: "Invalid token" } },
          { status: 401 }
        )
      )
    );
    await expect(authService.getCurrentUser("mock-access-token")).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

// ─── updateProfile ────────────────────────────────────────────────────────────

describe("authService.updateProfile", () => {
  it("returns updated user on success", async () => {
    const result = await authService.updateProfile("mock-access-token", { name: "Updated Name" });
    expect(result.user.id).toBe(mockUser.id);
  });

  it("throws on 400 validation error", async () => {
    server.use(
      http.patch("/api/auth/me", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Name is required" } },
          { status: 400 }
        )
      )
    );
    await expect(
      authService.updateProfile("mock-access-token", { name: "" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─── refreshToken ─────────────────────────────────────────────────────────────

describe("authService.refreshToken", () => {
  it("returns a new accessToken on success", async () => {
    const result = await authService.refreshToken();
    expect(result.accessToken).toBe("new-access-token");
  });

  it("throws on 401 when refresh token is expired", async () => {
    server.use(
      http.post("/api/auth/refresh", () =>
        HttpResponse.json(
          { error: { code: "AUTHENTICATION_ERROR", message: "Refresh token expired" } },
          { status: 401 }
        )
      )
    );
    await expect(authService.refreshToken()).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ─── changePassword ───────────────────────────────────────────────────────────

describe("authService.changePassword", () => {
  it("resolves with the success message on 200", async () => {
    server.use(
      http.post("/api/auth/change-password", () =>
        HttpResponse.json({ message: "Password changed successfully" })
      )
    );
    const result = await authService.changePassword("mock-access-token", {
      currentPassword: "old-password-1",
      newPassword: "brand-new-password-1",
    });
    expect(result.message).toBe("Password changed successfully");
  });

  it("throws on 401 when the current password is wrong", async () => {
    server.use(
      http.post("/api/auth/change-password", () =>
        HttpResponse.json(
          { error: { code: "AUTH_ERROR", message: "Current password is incorrect" } },
          { status: 401 }
        )
      )
    );
    await expect(
      authService.changePassword("mock-access-token", {
        currentPassword: "wrong",
        newPassword: "brand-new-password-1",
      })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ─── forgotPassword ───────────────────────────────────────────────────────────

describe("authService.forgotPassword", () => {
  it("resolves with the generic message on 200", async () => {
    server.use(
      http.post("/api/auth/forgot-password", () =>
        HttpResponse.json({
          message: "If an account exists for that email, a reset link has been sent.",
        })
      )
    );
    const result = await authService.forgotPassword("user@example.com");
    expect(result.message).toContain("reset link");
  });

  it("throws on 400 for a malformed email", async () => {
    server.use(
      http.post("/api/auth/forgot-password", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Invalid email" } },
          { status: 400 }
        )
      )
    );
    await expect(authService.forgotPassword("nope")).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─── resetPassword ────────────────────────────────────────────────────────────

describe("authService.resetPassword", () => {
  it("resolves with the success message on 200", async () => {
    server.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json({
          message: "Password reset successfully. Please log in with your new password.",
        })
      )
    );
    const result = await authService.resetPassword({
      token: "valid-token",
      newPassword: "brand-new-password-1",
    });
    expect(result.message).toContain("reset successfully");
  });

  it("throws on 400 for an invalid or expired token", async () => {
    server.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "This reset link is invalid or has expired",
            },
          },
          { status: 400 }
        )
      )
    );
    await expect(
      authService.resetPassword({ token: "bad", newPassword: "brand-new-password-1" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
