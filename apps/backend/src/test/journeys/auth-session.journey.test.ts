import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { buildApp } from "../../app";
import { truncateAllTables } from "../helpers/test-db";
import { prisma } from "../../config/database";
import {
  blacklistToken,
  isTokenBlacklisted,
  purgeExpiredRevocations,
} from "../../utils/tokenBlacklist";
import type { FastifyInstance } from "fastify";

/**
 * Session-hardening journeys that hit the real database: concurrent refresh
 * rotation and denylist purge semantics. Kept in their own file so the
 * per-file isolated runner gives them a fresh app instance (and a fresh
 * rate-limit bucket) rather than competing with the broad auth journey.
 */
describe("Auth Session Hardening Journey", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  async function getCsrfToken(): Promise<{ cookie: string; token: string }> {
    const res = await app.inject({ method: "GET", url: "/api/auth/csrf-token" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const raw = res.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : [raw];
    const csrfCookie = cookies.find((c) => c?.startsWith("_csrf="))!.split(";")[0]!;
    return { cookie: csrfCookie, token: body.csrfToken as string };
  }

  const TEST_USER = {
    email: "session-journey@test.com",
    password: "SecurePass123!",
    name: "Session Journey User",
  };

  // Concurrent refresh of the SAME token must let exactly one request win; the
  // loser is treated as token reuse and the whole family is revoked. Exercised
  // against the real database so the atomic claim (guarded updateMany inside a
  // transaction) is what enforces the invariant, not a mock.
  it("two concurrent refreshes of one token: exactly one wins, family revoked", async () => {
    const csrf = await getCsrfToken();
    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf.token,
        cookie: csrf.cookie,
      },
      payload: TEST_USER,
    });
    expect(registerRes.statusCode).toBe(201);

    const rawCookies = registerRes.headers["set-cookie"];
    const cookieArr = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    const refreshCookie = cookieArr.find((c) => c?.startsWith("refreshToken="))!.split(";")[0]!;

    const familyBefore = await prisma.refreshToken.findFirst();
    const familyId = familyBefore!.familyId;

    // Fire both refreshes with the identical refresh cookie.
    const csrfA = await getCsrfToken();
    const csrfB = await getCsrfToken();
    const [resA, resB] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfA.token,
          cookie: `${csrfA.cookie}; ${refreshCookie}`,
        },
        payload: {},
      }),
      app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfB.token,
          cookie: `${csrfB.cookie}; ${refreshCookie}`,
        },
        payload: {},
      }),
    ]);

    const statuses = [resA.statusCode, resB.statusCode].sort();
    // Exactly one success; the other is rejected (reuse → 401).
    expect(statuses).toEqual([200, 401]);

    // The reuse path revokes the entire family, so no token in the family is
    // left active — even the winner's freshly-issued replacement is dead.
    const activeInFamily = await prisma.refreshToken.count({
      where: { familyId, isRevoked: false },
    });
    expect(activeInFamily).toBe(0);
  });

  // The cleanup job must only remove revocations whose underlying access token
  // has already expired — a still-valid revocation must survive a purge, or a
  // logged-out token could be silently un-revoked.
  it("purge removes expired denylist entries but keeps still-valid ones", async () => {
    const liveJti = "live-jti";
    const deadJti = "dead-jti";

    await blacklistToken(liveJti, new Date(Date.now() + 10 * 60 * 1000));
    await blacklistToken(deadJti, new Date(Date.now() - 1_000));

    const removed = await purgeExpiredRevocations();
    expect(removed).toBeGreaterThanOrEqual(1);

    // The still-valid revocation survives and is still enforced.
    expect(await isTokenBlacklisted(liveJti)).toBe(true);
    expect(await prisma.revokedAccessToken.findUnique({ where: { jti: liveJti } })).not.toBeNull();

    // The expired one is gone.
    expect(await prisma.revokedAccessToken.findUnique({ where: { jti: deadJti } })).toBeNull();
  });
});
