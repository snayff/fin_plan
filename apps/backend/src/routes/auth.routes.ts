import type {
  FastifyInstance,
  FastifyRequest,
  RouteShorthandOptions,
  onRequestHookHandler,
} from "fastify";
import { z } from "zod";
import { authService } from "../services/auth.service";
import { auditEvent } from "../services/audit.service";
import { authMiddleware, userOnlyAuth } from "../middleware/auth.middleware";
import { blacklistToken } from "../utils/tokenBlacklist";
import { setRefreshTokenCookie, clearRefreshTokenCookie } from "../lib/refresh-cookie";
import { decodeToken } from "../utils/jwt";
import { NotFoundError, ValidationError } from "../utils/errors";
import { MAX_PASSWORD_LENGTH } from "../utils/password";
import { AuditAction } from "@finplan/shared";

function requestContext(request: FastifyRequest) {
  return { ipAddress: request.ip, userAgent: request.headers["user-agent"] };
}

/** Blacklist the access token from the current request so it can't be reused after logout. */
async function blacklistCurrentToken(request: FastifyRequest): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) return;
  const token = authHeader.split(" ")[1];
  if (!token) return;
  const payload = decodeToken(token);
  if (payload?.jti) {
    const expiresAt = payload.exp ? new Date(payload.exp * 1000) : undefined;
    await blacklistToken(payload.jti, expiresAt);
  }
}

const registerSchema = z.object({
  email: z.string().trim().max(254).email(),
  password: z.string().min(12).max(MAX_PASSWORD_LENGTH),
  name: z.string().trim().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().max(254).email(),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  rememberMe: z.boolean().optional().default(false),
});
const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

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

  // CSRF protection for cookie-authenticated state-changing endpoints.
  // Tokens are issued by GET /csrf-token and sent back in the X-CSRF-Token
  // header (the frontend ApiClient does this automatically).
  //
  // fastify.csrfProtection returns the (thenable) reply object when it
  // rejects a request, which makes the hook runner resume the lifecycle
  // after the 403 has already been sent. Wrapping it discards the return
  // value so a rejected request stops here.
  const csrfProtection: onRequestHookHandler = (request, reply, done) => {
    fastify.csrfProtection(request, reply, done);
  };

  const refreshOpts: RouteShorthandOptions = {
    onRequest: csrfProtection,
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
      // Attribute the failed attempt to the targeted account when the email
      // matches an existing user. Best-effort only — the client response
      // stays generic regardless.
      let targetUserId: string | undefined;
      try {
        const targetUser = await authService.findUserByEmail(body.email);
        targetUserId = targetUser?.id;
      } catch {
        // Attribution must never block the audit write or change the response
      }

      await auditEvent({
        ...(targetUserId ? { userId: targetUserId } : {}),
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
   * The refresh token is read from the httpOnly cookie only — it is never
   * accepted from the request body.
   */
  fastify.post("/refresh", refreshOpts, async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;

    if (!refreshToken) {
      throw new ValidationError("Refresh token required");
    }

    const ctx = requestContext(request);
    const result = await authService.refreshAccessToken(refreshToken, ctx);

    await auditEvent({
      userId: result.userId,
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
   * Requires a CSRF token in addition to the access token.
   */
  fastify.post(
    "/logout",
    { onRequest: csrfProtection, preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.user!.userId;

      // Blacklist the current access token so it can't be reused
      await blacklistCurrentToken(request);

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
    }
  );

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
