import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { buildApp } from "../../app";
import { truncateAllTables } from "../helpers/test-db";
import { prisma } from "../../config/database";
import type { FastifyInstance } from "fastify";

describe("Auth Journey", () => {
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

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Fetches a CSRF token and its accompanying cookie from the server.
   * Returns the cookie string to forward in subsequent requests and the token value for the header.
   */
  async function getCsrfToken(): Promise<{ cookie: string; token: string }> {
    const res = await app.inject({ method: "GET", url: "/api/auth/csrf-token" });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    const raw = res.headers["set-cookie"];

    // set-cookie may be a single string or an array — normalise to array
    const cookies = Array.isArray(raw) ? raw : [raw];
    const csrfCookie = cookies.find((c) => c?.startsWith("_csrf="));
    expect(csrfCookie).toBeDefined();

    // Extract just the cookie key=value portion (before any ;)
    const cookieValue = csrfCookie!.split(";")[0]!;

    return { cookie: cookieValue, token: body.csrfToken as string };
  }

  /**
   * Creates a household so the user has an activeHouseholdId (required by authMiddleware).
   */
  async function createHousehold(accessToken: string, name: string): Promise<void> {
    const csrf = await getCsrfToken();
    const res = await app.inject({
      method: "POST",
      url: "/api/households",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-csrf-token": csrf.token,
        cookie: csrf.cookie,
      },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
  }

  const TEST_USER = {
    email: "journey@test.com",
    password: "SecurePass123!",
    name: "Journey User",
  };

  // ─── 1. Register → Login → Me → Logout ──────────────────────────────────

  it("register → login → me → logout → me (blacklisted)", async () => {
    const csrf = await getCsrfToken();

    // ── Register ──
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
    const registerBody = JSON.parse(registerRes.body);
    expect(registerBody.user).toBeDefined();
    expect(registerBody.user.email).toBe(TEST_USER.email);
    expect(registerBody.user.name).toBe(TEST_USER.name);
    expect(registerBody.accessToken).toBeString();
    expect(registerBody.refreshToken).toBeUndefined();
    // Sensitive fields must not leak
    expect(registerBody.user.passwordHash).toBeUndefined();

    // Create a household so authMiddleware passes on subsequent requests
    await createHousehold(registerBody.accessToken as string, "Auth Test Household");

    // ── Login ──
    const csrfLogin = await getCsrfToken();
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfLogin.token,
        cookie: csrfLogin.cookie,
      },
      payload: { email: TEST_USER.email, password: TEST_USER.password },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    expect(loginBody.user).toBeDefined();
    expect(loginBody.user.email).toBe(TEST_USER.email);
    expect(loginBody.accessToken).toBeString();
    expect(loginBody.refreshToken).toBeUndefined();

    const accessToken = loginBody.accessToken as string;

    // ── Me (authenticated) ──
    const meRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user.email).toBe(TEST_USER.email);
    expect(meBody.user.name).toBe(TEST_USER.name);

    // ── Logout ──
    const csrfLogout = await getCsrfToken();
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-csrf-token": csrfLogout.token,
        cookie: csrfLogout.cookie,
      },
    });

    expect(logoutRes.statusCode).toBe(200);

    // ── Me after logout (token blacklisted) ──
    const meAfterLogoutRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(meAfterLogoutRes.statusCode).toBe(401);
  });

  // ─── 2. Token Refresh ────────────────────────────────────────────────────

  it("refresh token returns a new access token that works", async () => {
    const csrf = await getCsrfToken();

    // Register to get tokens
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

    // Create a household so authMiddleware passes on subsequent requests
    const regBody = JSON.parse(registerRes.body);
    await createHousehold(regBody.accessToken as string, "Refresh Test Household");

    // Extract refreshToken cookie from the register response
    const rawCookies = registerRes.headers["set-cookie"];
    const cookieArr = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    const refreshCookie = cookieArr.find((c) => c?.startsWith("refreshToken="));
    expect(refreshCookie).toBeDefined();
    const refreshCookieValue = refreshCookie!.split(";")[0]!;

    // ── Refresh ──
    const csrfRefresh = await getCsrfToken();
    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfRefresh.token,
        cookie: `${csrfRefresh.cookie}; ${refreshCookieValue}`,
      },
      payload: {},
    });

    expect(refreshRes.statusCode).toBe(200);
    const refreshBody = JSON.parse(refreshRes.body);
    expect(refreshBody.accessToken).toBeString();

    // ── Use new access token ──
    const meRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${refreshBody.accessToken}` },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user.email).toBe(TEST_USER.email);
  });

  // ─── 3. Security: duplicate registration ─────────────────────────────────

  it("duplicate registration fails with a generic error", async () => {
    // First registration
    const csrf1 = await getCsrfToken();
    const firstRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf1.token,
        cookie: csrf1.cookie,
      },
      payload: TEST_USER,
    });
    expect(firstRes.statusCode).toBe(201);

    // Second registration — same email
    const csrf2 = await getCsrfToken();
    const secondRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf2.token,
        cookie: csrf2.cookie,
      },
      payload: TEST_USER,
    });

    // Should not be a success
    expect(secondRes.statusCode).toBeGreaterThanOrEqual(400);

    // Error message must NOT reveal that the account already exists
    const body = JSON.parse(secondRes.body);
    const message = JSON.stringify(body).toLowerCase();
    expect(message).not.toContain("already exists");
    expect(message).not.toContain("duplicate");
    expect(message).not.toContain("taken");
  });

  // ─── 4. Security: wrong password ─────────────────────────────────────────

  it("login with wrong password fails with a generic error", async () => {
    // Register first
    const csrf1 = await getCsrfToken();
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf1.token,
        cookie: csrf1.cookie,
      },
      payload: TEST_USER,
    });

    // Attempt login with wrong password
    const csrf2 = await getCsrfToken();
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf2.token,
        cookie: csrf2.cookie,
      },
      payload: { email: TEST_USER.email, password: "WrongPassword123!" },
    });

    expect(loginRes.statusCode).toBe(401);

    // Message must be generic — not revealing whether the email exists
    const body = JSON.parse(loginRes.body);
    const message = JSON.stringify(body).toLowerCase();
    expect(message).not.toContain("password");
    expect(message).not.toContain("not found");
  });

  // ─── 5. Security: user response never contains sensitive fields ──────────

  it("user response excludes passwordHash, twoFactorSecret, twoFactorEnabled", async () => {
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
    const registerBody = JSON.parse(registerRes.body);
    const user = registerBody.user;

    expect(user.passwordHash).toBeUndefined();
    expect(user.twoFactorSecret).toBeUndefined();
    expect(user.twoFactorEnabled).toBeUndefined();

    // Create a household so authMiddleware passes on /me
    await createHousehold(registerBody.accessToken as string, "Sensitive Fields Household");

    // Also verify via /me
    const meRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${registerBody.accessToken}` },
    });

    expect(meRes.statusCode).toBe(200);
    const meUser = JSON.parse(meRes.body).user;

    expect(meUser.passwordHash).toBeUndefined();
    expect(meUser.twoFactorSecret).toBeUndefined();
    expect(meUser.twoFactorEnabled).toBeUndefined();
  });

  // ─── 6. Audit trail: mutations create audit logs ─────────────────────────

  it("registration creates an audit log entry", async () => {
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
    const registerBody = JSON.parse(registerRes.body);
    const userId = registerBody.user.id as string;

    // auditService.log is intentionally fire-and-forget (see audit.service.ts),
    // so the REGISTER row may land a few ms after the response. Poll briefly.
    let registerLog: Awaited<ReturnType<typeof prisma.auditLog.findFirst>> = null;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      registerLog = await prisma.auditLog.findFirst({
        where: { userId, action: "REGISTER" },
      });
      if (registerLog) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(registerLog).not.toBeNull();
    expect(registerLog!.resource).toBe("user");
    expect(registerLog!.resourceId).toBe(userId);
  });
});
