import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { buildApp } from "../../app";
import { truncateAllTables } from "../helpers/test-db";
import type { FastifyInstance } from "fastify";

describe("Household Journey", () => {
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
   */
  async function getCsrfToken(): Promise<{ cookie: string; token: string }> {
    const res = await app.inject({ method: "GET", url: "/api/auth/csrf-token" });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    const raw = res.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : [raw];
    const csrfCookie = cookies.find((c) => c?.startsWith("_csrf="));
    expect(csrfCookie).toBeDefined();

    const cookieValue = csrfCookie!.split(";")[0]!;
    return { cookie: cookieValue, token: body.csrfToken as string };
  }

  /**
   * Registers a new user and returns their accessToken and userId.
   */
  async function registerUser(
    email: string,
    name: string
  ): Promise<{ accessToken: string; userId: string }> {
    const csrf = await getCsrfToken();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf.token,
        cookie: csrf.cookie,
      },
      payload: { email, password: "SecurePass123!", name },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    return { accessToken: body.accessToken as string, userId: body.user.id as string };
  }

  /**
   * Creates a household for the given user and returns the household id.
   * Also sets activeHouseholdId on the user.
   */
  async function createHousehold(
    accessToken: string,
    name: string
  ): Promise<{ householdId: string }> {
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
    const body = JSON.parse(res.body);
    return { householdId: body.household.id as string };
  }

  /**
   * Switches the user's active household.
   */
  async function switchHousehold(accessToken: string, householdId: string): Promise<void> {
    const csrf = await getCsrfToken();
    const res = await app.inject({
      method: "POST",
      url: `/api/households/${householdId}/switch`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-csrf-token": csrf.token,
        cookie: csrf.cookie,
      },
    });

    expect(res.statusCode).toBe(200);
  }

  // ─── 1. Create household and verify membership ──────────────────────────

  it("creating a household gives the user an owner membership", async () => {
    // Register user (starts with no household)
    const { accessToken } = await registerUser("owner@test.com", "Owner User");

    // Create a household
    const { householdId } = await createHousehold(accessToken, "Test Household");

    // List households — should have exactly 1 with owner role
    const listRes = await app.inject({
      method: "GET",
      url: "/api/households",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.households).toHaveLength(1);
    expect(listBody.households[0].householdId).toBe(householdId);
    expect(listBody.households[0].role).toBe("owner");
  });

  // ─── 2. Create additional household and switch ──────────────────────────

  it("user can create a second household and switch to it", async () => {
    const { accessToken } = await registerUser("multi@test.com", "Multi User");

    // Create first household
    const { householdId: hh1 } = await createHousehold(accessToken, "Household One");

    // Create second household
    const { householdId: hh2 } = await createHousehold(accessToken, "Household Two");

    // User should now be on hh2 (createHousehold sets activeHouseholdId)
    // Switch back to hh1
    await switchHousehold(accessToken, hh1);

    // Verify activeHouseholdId changed via /me
    const meRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user.activeHouseholdId).toBe(hh1);

    // Switch to hh2
    await switchHousehold(accessToken, hh2);

    const meRes2 = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(meRes2.statusCode).toBe(200);
    const meBody2 = JSON.parse(meRes2.body);
    expect(meBody2.user.activeHouseholdId).toBe(hh2);

    // List should show 2 households
    const listRes = await app.inject({
      method: "GET",
      url: "/api/households",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.households).toHaveLength(2);
  });

  // ─── 3. Household data isolation (zero-trust validation) ────────────────

  it("users cannot see other households' waterfall data", async () => {
    // Register user A and create a household
    const userA = await registerUser("usera@test.com", "User A");
    const { householdId: hhA } = await createHousehold(userA.accessToken, "Household A");

    // Create an income source in user A's household
    const csrfIncome = await getCsrfToken();
    const incomeRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
        "x-csrf-token": csrfIncome.token,
        cookie: csrfIncome.cookie,
      },
      payload: {
        name: "User A Salary",
        amount: 5000,
        frequency: "monthly",
        dueDate: "2026-01-15",
      },
    });

    expect(incomeRes.statusCode).toBe(201);

    // Verify user A can see it
    const incomeListA = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: { authorization: `Bearer ${userA.accessToken}` },
    });

    expect(incomeListA.statusCode).toBe(200);
    const incomeBodyA = JSON.parse(incomeListA.body);
    expect(incomeBodyA.length).toBeGreaterThanOrEqual(1);
    const found = incomeBodyA.find((s: { name: string }) => s.name === "User A Salary");
    expect(found).toBeDefined();

    // Register user B and create their own household
    const userB = await registerUser("userb@test.com", "User B");
    const { householdId: _hhB } = await createHousehold(userB.accessToken, "Household B");

    // User B lists income — should NOT see user A's data
    const incomeListB = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: { authorization: `Bearer ${userB.accessToken}` },
    });

    expect(incomeListB.statusCode).toBe(200);
    const incomeBodyB = JSON.parse(incomeListB.body);

    // User B's household should have zero income sources
    expect(incomeBodyB).toHaveLength(0);

    // Double-check: no item from user A leaked
    const leaked = incomeBodyB.find((s: { name: string }) => s.name === "User A Salary");
    expect(leaked).toBeUndefined();
  });

  // ─── 4. Invite flow ────────────────────────────────────────────────────

  it("owner invites user, invitee joins, both see same household data", async () => {
    // Register user A (owner) and create a household
    const userA = await registerUser("owner-invite@test.com", "Owner");
    const { householdId: hhA } = await createHousehold(userA.accessToken, "Shared Household");

    // Create an invite for user B's email — now carries a name for the placeholder
    const inviteeEmail = "invitee@test.com";
    const placeholderName = "Invited Partner";
    const csrfInvite = await getCsrfToken();
    const inviteRes = await app.inject({
      method: "POST",
      url: `/api/households/${hhA}/invite`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
        "x-csrf-token": csrfInvite.token,
        cookie: csrfInvite.cookie,
      },
      payload: { email: inviteeEmail, name: placeholderName },
    });

    expect(inviteRes.statusCode).toBe(201);
    const inviteBody = JSON.parse(inviteRes.body);
    const inviteToken = inviteBody.token as string;
    expect(inviteToken).toBeDefined();
    expect(typeof inviteToken).toBe("string");

    // Inviting immediately creates a placeholder member (userId null) in the roster
    const preJoinDetails = await app.inject({
      method: "GET",
      url: `/api/households/${hhA}`,
      headers: { authorization: `Bearer ${userA.accessToken}` },
    });
    const preJoinBody = JSON.parse(preJoinDetails.body);
    const placeholder = preJoinBody.household.memberProfiles.find(
      (m: { name: string }) => m.name === placeholderName
    );
    expect(placeholder).toBeDefined();
    expect(placeholder.userId).toBeNull();

    // Validate the invite token (public endpoint)
    const validateRes = await app.inject({
      method: "GET",
      url: `/api/auth/invite/${inviteToken}`,
    });

    expect(validateRes.statusCode).toBe(200);
    const validateBody = JSON.parse(validateRes.body);
    expect(validateBody.householdName).toBe("Shared Household");

    // Register user B with the same email the invite was sent to
    const userB = await registerUser(inviteeEmail, "Invitee");
    await createHousehold(userB.accessToken, "Invitee Household");

    // User B joins via invite token
    const csrfJoin = await getCsrfToken();
    const joinRes = await app.inject({
      method: "POST",
      url: `/api/auth/invite/${inviteToken}/join`,
      headers: {
        authorization: `Bearer ${userB.accessToken}`,
        "x-csrf-token": csrfJoin.token,
        cookie: csrfJoin.cookie,
      },
    });

    expect(joinRes.statusCode).toBe(200);

    // User B's active household should now be the shared household
    // Switch to the shared household to ensure active
    await switchHousehold(userB.accessToken, hhA);

    // Verify household details show 2 members
    const detailsRes = await app.inject({
      method: "GET",
      url: `/api/households/${hhA}`,
      headers: { authorization: `Bearer ${userA.accessToken}` },
    });

    expect(detailsRes.statusCode).toBe(200);
    const detailsBody = JSON.parse(detailsRes.body);
    // memberProfiles includes linked user-members
    expect(detailsBody.household.memberProfiles.length).toBeGreaterThanOrEqual(2);

    // Joining linked user B to the existing placeholder rather than creating a
    // duplicate: the placeholder row now carries user B's id and there is still
    // exactly one member with the placeholder name.
    const linked = detailsBody.household.memberProfiles.filter(
      (m: { name: string }) => m.name === placeholderName
    );
    expect(linked).toHaveLength(1);
    expect(linked[0].userId).toBe(userB.userId);

    // Create income in the shared household as user A
    const csrfIncome = await getCsrfToken();
    const incomeRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
        "x-csrf-token": csrfIncome.token,
        cookie: csrfIncome.cookie,
      },
      payload: {
        name: "Shared Income",
        amount: 3000,
        frequency: "monthly",
        dueDate: "2026-02-01",
      },
    });

    expect(incomeRes.statusCode).toBe(201);

    // Both users should see the same income when viewing the shared household
    const incomeListA = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: { authorization: `Bearer ${userA.accessToken}` },
    });

    expect(incomeListA.statusCode).toBe(200);
    const incomeA = JSON.parse(incomeListA.body);
    const sharedIncomeA = incomeA.find((s: { name: string }) => s.name === "Shared Income");
    expect(sharedIncomeA).toBeDefined();

    const incomeListB = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: { authorization: `Bearer ${userB.accessToken}` },
    });

    expect(incomeListB.statusCode).toBe(200);
    const incomeB = JSON.parse(incomeListB.body);
    const sharedIncomeB = incomeB.find((s: { name: string }) => s.name === "Shared Income");
    expect(sharedIncomeB).toBeDefined();
  });

  // ─── 5. Member removal blocks access ──────────────────────────────────

  it("removed member can no longer access the household's data", async () => {
    // Register user A (owner) and create a household
    const userA = await registerUser("owner-remove@test.com", "Owner");
    const { householdId: hhA } = await createHousehold(userA.accessToken, "Removable Household");

    // Create invite for user B
    const inviteeEmail = "removable@test.com";
    const csrfInvite = await getCsrfToken();
    const inviteRes = await app.inject({
      method: "POST",
      url: `/api/households/${hhA}/invite`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userA.accessToken}`,
        "x-csrf-token": csrfInvite.token,
        cookie: csrfInvite.cookie,
      },
      payload: { email: inviteeEmail, name: "Removable Member" },
    });

    expect(inviteRes.statusCode).toBe(201);
    const inviteToken = JSON.parse(inviteRes.body).token as string;

    // Register user B with matching email
    const userB = await registerUser(inviteeEmail, "Removable Member");
    await createHousehold(userB.accessToken, "Removable Member Household");

    // User B joins
    const csrfJoin = await getCsrfToken();
    const joinRes = await app.inject({
      method: "POST",
      url: `/api/auth/invite/${inviteToken}/join`,
      headers: {
        authorization: `Bearer ${userB.accessToken}`,
        "x-csrf-token": csrfJoin.token,
        cookie: csrfJoin.cookie,
      },
    });

    expect(joinRes.statusCode).toBe(200);

    // Switch user B to the shared household
    await switchHousehold(userB.accessToken, hhA);

    // Verify user B can access waterfall
    const waterfallBeforeRes = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: { authorization: `Bearer ${userB.accessToken}` },
    });

    expect(waterfallBeforeRes.statusCode).toBe(200);

    // Get household details to find user B's member ID
    const detailsRes = await app.inject({
      method: "GET",
      url: `/api/households/${hhA}`,
      headers: { authorization: `Bearer ${userA.accessToken}` },
    });

    expect(detailsRes.statusCode).toBe(200);
    const detailsBody = JSON.parse(detailsRes.body);
    const memberB = detailsBody.household.memberProfiles.find(
      (m: { userId: string | null }) => m.userId === userB.userId
    );
    expect(memberB).toBeDefined();

    // Owner removes user B
    const csrfRemove = await getCsrfToken();
    const removeRes = await app.inject({
      method: "DELETE",
      url: `/api/households/${hhA}/members/${memberB.id}`,
      headers: {
        authorization: `Bearer ${userA.accessToken}`,
        "x-csrf-token": csrfRemove.token,
        cookie: csrfRemove.cookie,
      },
    });

    expect(removeRes.statusCode).toBe(200);

    // User B can no longer switch back to household A
    const csrfSwitch = await getCsrfToken();
    const switchRes = await app.inject({
      method: "POST",
      url: `/api/households/${hhA}/switch`,
      headers: {
        authorization: `Bearer ${userB.accessToken}`,
        "x-csrf-token": csrfSwitch.token,
        cookie: csrfSwitch.cookie,
      },
    });
    expect(switchRes.statusCode).toBeGreaterThanOrEqual(400);

    // User B's waterfall still works (falls back to their own household)
    // but must not contain data from household A
    const waterfallAfterRes = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: { authorization: `Bearer ${userB.accessToken}` },
    });
    expect(waterfallAfterRes.statusCode).toBe(200);
    const incomeAfter = JSON.parse(waterfallAfterRes.body) as Array<{ id: string }>;
    expect(incomeAfter).toHaveLength(0);
  });
});
