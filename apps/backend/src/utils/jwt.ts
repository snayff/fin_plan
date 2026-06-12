import jwt, { type SignOptions } from "jsonwebtoken";
import { createHash, randomUUID } from "crypto";
import { config } from "../config/env";

export interface JwtPayload {
  userId: string;
  email: string;
  jti?: string;
  /** Unix epoch seconds; present on issued tokens. */
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenVersion?: number;
}

/** The only algorithm this service signs with or accepts during verification. */
const JWT_ALGORITHM = "HS256" as const;

type ExpiresIn = NonNullable<SignOptions["expiresIn"]>;

/**
 * Narrow an env-supplied lifetime string ("15m", "7d", "900") to the type
 * jsonwebtoken expects. Validated here so a malformed value fails at boot,
 * not on the first sign call.
 */
function toExpiresIn(value: string): ExpiresIn {
  if (!/^\d+(\.\d+)?\s*(ms|s|m|h|d|w|y)?$/i.test(value.trim())) {
    throw new Error(`Invalid JWT lifetime "${value}" (expected e.g. "15m", "7d", "900")`);
  }
  return value as ExpiresIn;
}

const ACCESS_TOKEN_EXPIRES_IN = toExpiresIn(config.JWT_EXPIRES_IN);
const REFRESH_TOKEN_EXPIRES_IN = toExpiresIn(config.JWT_REFRESH_EXPIRES_IN);

function isObjectPayload(decoded: unknown): decoded is Record<string, unknown> {
  return typeof decoded === "object" && decoded !== null;
}

function toAccessPayload(decoded: unknown): JwtPayload | null {
  if (!isObjectPayload(decoded)) return null;
  const { userId, email, jti, exp } = decoded;
  if (typeof userId !== "string" || typeof email !== "string") return null;
  const payload: JwtPayload = { userId, email };
  if (typeof jti === "string") payload.jti = jti;
  if (typeof exp === "number") payload.exp = exp;
  return payload;
}

/**
 * Generate an access token
 */
export function generateAccessToken(payload: Pick<JwtPayload, "userId" | "email">): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, config.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, config.JWT_REFRESH_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

/**
 * Verify an access token (signature, expiry, and pinned algorithm)
 */
export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    const payload = toAccessPayload(decoded);
    if (!payload) {
      throw new jwt.JsonWebTokenError("Unexpected token payload");
    }
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token expired", { cause: error });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token", { cause: error });
    }
    throw error;
  }
}

/**
 * Verify a refresh token (signature, expiry, and pinned algorithm)
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });
    if (!isObjectPayload(decoded) || typeof decoded.userId !== "string") {
      throw new jwt.JsonWebTokenError("Unexpected token payload");
    }
    const payload: RefreshTokenPayload = { userId: decoded.userId };
    if (typeof decoded.tokenVersion === "number") payload.tokenVersion = decoded.tokenVersion;
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Refresh token expired", { cause: error });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid refresh token", { cause: error });
    }
    throw error;
  }
}

/**
 * Decode an access token without verifying. Only safe for non-security
 * decisions on already-authenticated requests (e.g. reading jti/exp to
 * revoke the current token on logout).
 */
export function decodeToken(token: string): JwtPayload | null {
  return toAccessPayload(jwt.decode(token));
}

/**
 * Hash a refresh token for secure storage (SHA-256)
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a unique family ID for refresh token rotation tracking
 */
export function generateTokenFamily(): string {
  return randomUUID();
}
