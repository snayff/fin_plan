import type { FastifyReply } from "fastify";
import { config } from "../config/env";

/** Cookie name and path scope shared by every refresh-token cookie operation. */
const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Set the refresh token as an httpOnly cookie.
 *
 * This is the single source of truth for the refresh-cookie contract (attributes
 * and lifetime). Making the token inaccessible to JavaScript guards against XSS
 * token theft. Without `rememberMe`, the cookie is a session cookie (no maxAge).
 */
export function setRefreshTokenCookie(
  reply: FastifyReply,
  refreshToken: string,
  options?: { rememberMe?: boolean; maxAgeSeconds?: number }
) {
  const rememberMe = options?.rememberMe ?? false;
  const maxAgeSeconds =
    options?.maxAgeSeconds && options.maxAgeSeconds > 0
      ? options.maxAgeSeconds
      : DEFAULT_MAX_AGE_SECONDS;

  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    ...(rememberMe ? { maxAge: maxAgeSeconds } : {}),
  });
}

/** Clear the refresh token cookie on logout, matching its set-time path scope. */
export function clearRefreshTokenCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_PATH,
  });
}
