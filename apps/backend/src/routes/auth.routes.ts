import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from "fastify";
import { z } from "zod";
import { authService } from "../services/auth.service";
import { auditEvent } from "../services/audit.service";
import { authMiddleware, userOnlyAuth } from "../middleware/auth.middleware";
import { config } from "../config/env";
import { blacklistToken } from "../utils/tokenBlacklist";
import { decodeToken } from "../utils/jwt";
import { NotFoundError, ValidationError } from "../utils/errors";
import { MAX_PASSWORD_LENGTH } from "../utils/password";
import { AuditAction } from "@finplan/shared";

function requestContext(request: FastifyRequest) {
  return { ipAddress: request.ip, userAgent: request.headers["user-agent"] };
}

/** Blacklist the access token from the current request so it can't be reused after logout. */
function blacklistCurrentToken(request: FastifyRequest): void {
  const authHeader = request.headers.authorization;
  if (!authHeader) return;
  const token = authHeader.split(" ")[1];
  if (!token) return;
  const payload = decodeToken(token);
  if (payload?.jti) {
    blacklistToken(payload.jti);
  }
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(MAX_PASSWORD_LENGTH),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  rememberMe: z.boolean().optional().default(false),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

/**
 * Set refresh token as httpOnly cookie
 * Provides security by making token inaccessible to JavaScript
 */
function setRefreshTokenCookie(
  reply: FastifyReply,
  refreshToken: string,
  options?: { rememberMe?: boolean; maxAgeSeconds?: number }
) {
  const rememberMe = options?.rememberMe ?? false;
  const maxAgeSeconds =
    options?.maxAgeSeconds && options.maxAgeSeconds > 0 ? options.maxAgeSeconds : 7 * 24 * 60 * 60;

  reply.setCookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/refresh",
    ...(rememberMe ? { maxAge: maxAgeSeconds } : {}),
  });
}

/**
 * Clear refresh token cookie on logout
 */
function clearRefreshTokenCookie(reply: FastifyReply) {
  reply.clearCookie("refreshToken", {
    path: "/api/auth/refresh",
  });
}

export async function authRoutes(fastify: FastifyInstance) {
  // Rate limit configurations for auth endpoints
  const loginOpts: RouteShorthandOptions = {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
      },
    },
  };

  const registerOpts: RouteShorthandOptions = {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 hour",
      },
    },
  };

  const refreshOpts: RouteShorthandOptions = {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
      },
    },
  };

  /**
   * POST /api/auth/register
   * Register a new user
   * Rate limit: 10 attempts per hour per IP
   */
  fastify.post("/register", registerOpts, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await authService.register(body);

    await auditEvent({
      userId: result.user.id,
      action: "REGISTER",
      resource: "user",
      resourceId: result.user.id,
      ...requestContext(request),
    });

    // Set refresh token in httpOnly cookie
    setRefreshTokenCookie(reply, result.refreshToken, { rememberMe: false });

    const { refreshToken: _rt, ...publicResult } = result;
    return reply.status(201).send(publicResult);
  });

  /**
   * POST /api/auth/login
   * Login user
   * Rate limit: 5 attempts per 15 minutes per IP
   */
  fastify.post("/login", loginOpts, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const ctx = requestContext(request);

    try {
      const result = await authService.login({
        ...body,
        ...ctx,
      });

      // Durability trade-off: if auditEvent exhausts retries it rethrows, returning a 500
      // even though login succeeded. Accepted — silent audit loss is worse than a transient 500.
      await auditEvent({
        userId: result.user.id,
        action: "LOGIN_SUCCESS",
        resource: "session",
        ...ctx,
      });

      // Set refresh token in httpOnly cookie
      setRefreshTokenCookie(reply, result.refreshToken, {
        rememberMe: body.rememberMe,
      });

      const { refreshToken: _rt, ...publicResult } = result;
      return reply.status(200).send(publicResult);
    } catch (error) {
      await auditEvent({
        action: "LOGIN_FAILED",
        resource: "session",
        metadata: { email: body.email },
        ...ctx,
      });
      throw error;
    }
  });

  /**
   * GET /api/auth/me
   * Get current user (protected route).
   *
   * Uses userOnlyAuth (not authMiddleware) because a freshly-registered user has
   * no household yet — they sit on /welcome to create one. The frontend's session
   * restore calls /me on every hard navigation/reload and routes on the returned
   * `activeHouseholdId` (null → /welcome). Requiring an active household here would
   * 401 those users and break session restore.
   */
  fastify.get("/me", { preHandler: userOnlyAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const user = await authService.findUserById(userId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return reply.status(200).send({ user });
  });

  /**
   * PATCH /api/auth/me
   * Update current user profile (name). User-scoped — no active household required
   * (see GET /me rationale above).
   */
  fastify.patch("/me", { preHandler: userOnlyAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const body = updateProfileSchema.parse(request.body);
    const existingUser = await authService.findUserById(userId);
    const oldName = existingUser?.name ?? null;
    const user = await authService.updateUserName(userId, body.name);
    await auditEvent({
      userId,
      action: AuditAction.UPDATE_PROFILE,
      resource: "user",
      resourceId: userId,
      metadata: { before: { name: oldName }, after: { name: body.name } },
      ...requestContext(request),
    });
    return reply.status(200).send({ user });
  });

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   * Rate limit: 10 attempts per 15 minutes per IP
   * Supports BOTH cookie and request body for backward compatibility
   */
  fastify.post("/refresh", refreshOpts, async (request, reply) => {
    const body = refreshSchema.parse(request.body);

    // Try cookie first, then body (backward compatibility)
    const refreshToken = request.cookies.refreshToken || body.refreshToken;

    if (!refreshToken) {
      throw new ValidationError("Refresh token required");
    }

    const ctx = requestContext(request);
    const result = await authService.refreshAccessToken(refreshToken, ctx);

    await auditEvent({
      action: "TOKEN_REFRESH",
      resource: "session",
      ...ctx,
    });

    const maxAgeSeconds = Math.max(1, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000));

    // Always set the rotated refresh token as a new cookie.
    setRefreshTokenCookie(reply, result.refreshToken, {
      rememberMe: result.rememberMe,
      maxAgeSeconds,
    });

    // Only return the access token to the client
    return reply.status(200).send({ accessToken: result.accessToken });
  });

  /**
   * GET /api/auth/csrf-token
   * Get CSRF token for state-changing requests
   */
  fastify.get("/csrf-token", async (_request, reply) => {
    const token = await reply.generateCsrf();
    return reply.send({ csrfToken: token });
  });

  /**
   * POST /api/auth/logout
   * Logout user - clears refresh token cookie
   */
  fastify.post("/logout", { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.userId;

    // Blacklist the current access token so it can't be reused
    blacklistCurrentToken(request);

    // Revoke all refresh tokens for this user
    await authService.revokeAllUserTokens(userId);

    await auditEvent({
      userId,
      action: "LOGOUT",
      resource: "session",
      ...requestContext(request),
    });

    // Clear refresh token cookie
    clearRefreshTokenCookie(reply);

    return reply.status(200).send({ message: "Logged out successfully" });
  });

  /**
   * GET /api/auth/sessions
   * List active sessions for the current user
   */
  fastify.get("/sessions", { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.userId;
    const sessions = await authService.getUserSessions(userId);
    return reply.send({ sessions });
  });

  /**
   * DELETE /api/auth/sessions/:familyId
   * Revoke a specific session
   */
  fastify.delete("/sessions/:familyId", { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.userId;
    const { familyId } = request.params as { familyId: string };

    const revoked = await authService.revokeSession(familyId, userId);
    if (!revoked) {
      throw new NotFoundError("Session not found");
    }

    await auditEvent({
      userId,
      action: "SESSION_REVOKED",
      resource: "session",
      resourceId: familyId,
      ...requestContext(request),
    });

    return reply.send({ message: "Session revoked" });
  });

  /**
   * DELETE /api/auth/sessions
   * Revoke all sessions (logout everywhere)
   */
  fastify.delete("/sessions", { preHandler: authMiddleware }, async (request, reply) => {
    const userId = request.user!.userId;

    await authService.revokeAllUserTokens(userId);

    await auditEvent({
      userId,
      action: "ALL_SESSIONS_REVOKED",
      resource: "session",
      ...requestContext(request),
    });

    clearRefreshTokenCookie(reply);
    return reply.send({ message: "All sessions revoked" });
  });
}
