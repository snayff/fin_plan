import { createHmac, createHash, timingSafeEqual } from "crypto";
import { config } from "../config/env";

/**
 * Stateless password-reset tokens.
 *
 * Design (no new database table — see SEC-2):
 *   token = base64url(payload) "." base64url(signature)
 *   payload   = `${userId}.${expiresAtMs}`
 *   signature = HMAC-SHA256(JWT_SECRET, `${payload}.${passwordFingerprint}`)
 *
 * The signature binds the token to a *fingerprint of the user's current
 * password hash*. The fingerprint is never stored in the token — it is
 * recomputed from the live DB row at verify time. This gives single-use
 * semantics for free: the moment the password (and therefore its hash)
 * changes, the fingerprint changes, so any previously-issued token stops
 * validating. It also self-invalidates the token used to perform the reset.
 *
 * We reuse JWT_SECRET (already a validated strong secret) rather than requiring
 * a new env var. The token embeds only the userId and expiry — no password
 * material — and is safe to place in a reset link.
 */

/** Reset token lifetime: 1 hour. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const SEPARATOR = ".";

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

/**
 * A short, non-reversible fingerprint of the user's current password hash.
 * Binds a token to the exact password state at issue time.
 */
function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 32);
}

function sign(payload: string, passwordHash: string): string {
  return createHmac("sha256", config.JWT_SECRET)
    .update(`${payload}${SEPARATOR}${passwordFingerprint(passwordHash)}`)
    .digest("base64url");
}

/**
 * Generate a signed, expiring, single-use password-reset token.
 *
 * @param issuedAtMs Override the issue time (test hook). Defaults to now.
 *                   Expiry is always `issuedAtMs + PASSWORD_RESET_TOKEN_TTL_MS`.
 */
export function generatePasswordResetToken(
  userId: string,
  passwordHash: string,
  issuedAtMs: number = Date.now()
): string {
  const expiresAtMs = issuedAtMs + PASSWORD_RESET_TOKEN_TTL_MS;
  const payload = `${userId}${SEPARATOR}${expiresAtMs}`;
  const signature = sign(payload, passwordHash);
  return `${base64UrlEncode(payload)}${SEPARATOR}${signature}`;
}

/**
 * Extract the userId embedded in a reset token *without verifying* its
 * signature or expiry. Only used to locate the user row so the token can then
 * be verified against that user's live password hash. Never make a security
 * decision on this value — always follow it with `verifyPasswordResetToken`.
 */
export function peekPasswordResetTokenUserId(token: string): string | null {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) return null;
  const [encodedPayload] = parts as [string, string];
  if (!encodedPayload) return null;

  let payload: string;
  try {
    payload = base64UrlDecode(encodedPayload);
  } catch {
    return null;
  }

  const payloadParts = payload.split(SEPARATOR);
  if (payloadParts.length !== 2) return null;
  const [userId] = payloadParts as [string, string];
  return userId || null;
}

/** Constant-time comparison of two base64url signature strings. */
function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a password-reset token against the user's *current* password hash.
 * Returns the userId on success, or null for any failure (bad format, bad
 * signature, expired, or superseded by a password change). Never throws.
 */
export function verifyPasswordResetToken(
  token: string,
  passwordHash: string
): { userId: string } | null {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSignature] = parts as [string, string];
  if (!encodedPayload || !providedSignature) return null;

  let payload: string;
  try {
    payload = base64UrlDecode(encodedPayload);
  } catch {
    return null;
  }

  const payloadParts = payload.split(SEPARATOR);
  if (payloadParts.length !== 2) return null;

  const [userId, expiresAtRaw] = payloadParts as [string, string];
  if (!userId) return null;

  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  if (Date.now() > expiresAtMs) return null;

  const expectedSignature = sign(payload, passwordHash);
  if (!signaturesMatch(providedSignature, expectedSignature)) return null;

  return { userId };
}
