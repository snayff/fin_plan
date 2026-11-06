/**
 * Persistent denylist for revoked access tokens, keyed by JWT ID (jti).
 *
 * Backed by Postgres so revocations survive process restarts and apply across
 * all instances. Lookups hit the primary key; expired rows are purged by a
 * periodic cleanup job (see startRevocationCleanup).
 */

import { prisma } from "../config/database";

// Fallback retention when the token's own expiry is unknown — matches the
// default access-token lifetime so entries never outlive their usefulness.
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Add a token's jti to the denylist.
 * @param expiresAt when the token itself expires — the entry is pointless
 *                  beyond that. Defaults to now + 15 minutes.
 */
export async function blacklistToken(jti: string, expiresAt?: Date): Promise<void> {
  const effectiveExpiry = expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS);
  await prisma.revokedAccessToken.upsert({
    where: { jti },
    create: { jti, expiresAt: effectiveExpiry },
    update: { expiresAt: effectiveExpiry },
  });
}

/**
 * Check if a token's jti is denylisted (indexed primary-key lookup).
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const entry = await prisma.revokedAccessToken.findUnique({
    where: { jti },
    select: { expiresAt: true },
  });
  if (!entry) return false;
  return entry.expiresAt.getTime() > Date.now();
}

/**
 * Remove entries whose underlying token has expired anyway.
 * Returns the number of rows removed.
 */
export async function purgeExpiredRevocations(): Promise<number> {
  const { count } = await prisma.revokedAccessToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

let cleanupStarted = false;

/**
 * Start the periodic cleanup of expired denylist entries.
 * Idempotent; the timer never keeps the process alive.
 */
export function startRevocationCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(() => {
    purgeExpiredRevocations().catch((err) =>
      console.error("Revoked-token cleanup failed:", err instanceof Error ? err.message : err)
    );
  }, CLEANUP_INTERVAL_MS).unref();
}
