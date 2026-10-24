import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { buildApp } from "../../app";
import { truncateAllTables } from "../helpers/test-db";
import type { FastifyInstance } from "fastify";

describe("Assets Journey", () => {
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

  // Unique email per test avoids cross-test collisions on the shared DB.
  let emailCounter = 0;
  function uniqueEmail(prefix: string): string {
    emailCounter += 1;
    return `${prefix}-${Date.now()}-${emailCounter}@test.com`;
  }

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

  /** Authenticated POST with CSRF handling. */
  async function authedPost(accessToken: string, url: string, payload?: unknown) {
    const csrf = await getCsrfToken();
    return app.inject({
      method: "POST",
      url,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-csrf-token": csrf.token,
        cookie: csrf.cookie,
      },
      payload: payload ?? {},
    });
  }

  function authedGet(accessToken: string, url: string) {
    return app.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  async function setup(prefix: string, householdName: string) {
    const user = await registerUser(uniqueEmail(prefix), `${prefix} User`);
    const { householdId } = await createHousehold(user.accessToken, householdName);
    return { ...user, householdId };
  }

  // ─── 1. Full asset lifecycle: create → balance → summary ──────────────────

  it("creates an asset, records balances, and reflects them in the summary", async () => {
    const user = await setup("asset-owner", "Assets Household");

    // Create a Property asset with an initial value.
    const createRes = await authedPost(user.accessToken, "/api/assets/assets", {
      name: "Family Home",
      type: "Property",
      initialValue: 300000,
      initialValueDate: "2026-01-01",
    });
    expect(createRes.statusCode).toBe(201);
    const asset = JSON.parse(createRes.body);
    expect(asset.id).toBeString();
    expect(asset.name).toBe("Family Home");
    expect(asset.type).toBe("Property");

    // List by type reflects the initial balance as currentBalance.
    const listRes = await authedGet(user.accessToken, "/api/assets/assets/Property");
    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.body);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(asset.id);
    expect(list[0].currentBalance).toBe(300000);

    // Record a newer balance — latest-by-date wins.
    const balRes = await authedPost(user.accessToken, `/api/assets/assets/${asset.id}/balance`, {
      value: 325000,
      date: "2026-06-01",
    });
    expect(balRes.statusCode).toBe(201);

    const listAfter = JSON.parse(
      (await authedGet(user.accessToken, "/api/assets/assets/Property")).body
    );
    expect(listAfter[0].currentBalance).toBe(325000);

    // Summary aggregates the latest balance into the Property bucket and grand total.
    const summaryRes = await authedGet(user.accessToken, "/api/assets/summary");
    expect(summaryRes.statusCode).toBe(200);
    const summary = JSON.parse(summaryRes.body);
    expect(summary.assetTotals.Property).toBe(325000);
    expect(summary.grandTotal).toBe(325000);
  });

  // ─── 2. Accounts + grand-total behaviour (pensions excluded) ──────────────

  it("aggregates accounts into the summary and excludes pensions from the grand total", async () => {
    const user = await setup("acct-owner", "Accounts Household");

    // Current account contributes to grand total.
    const currentRes = await authedPost(user.accessToken, "/api/assets/accounts", {
      name: "Main Current",
      type: "Current",
      initialValue: 5000,
      initialValueDate: "2026-01-01",
    });
    expect(currentRes.statusCode).toBe(201);

    // Pension account is summed in its bucket but excluded from grand total (#164).
    const pensionMemberList = JSON.parse(
      (await authedGet(user.accessToken, `/api/households/${user.householdId}`)).body
    );
    const ownerMemberId = pensionMemberList.household.memberProfiles[0].id as string;

    const pensionRes = await authedPost(user.accessToken, "/api/assets/accounts", {
      name: "Workplace Pension",
      type: "Pension",
      memberId: ownerMemberId,
      initialValue: 80000,
      initialValueDate: "2026-01-01",
    });
    expect(pensionRes.statusCode).toBe(201);

    const summary = JSON.parse((await authedGet(user.accessToken, "/api/assets/summary")).body);
    expect(summary.accountTotals.Current).toBe(5000);
    expect(summary.accountTotals.Pension).toBe(80000);
    // Grand total = 5000 (Current) only; pension excluded.
    expect(summary.grandTotal).toBe(5000);
  });

  // ─── 3. Disposal removes an asset from the active/default list ────────────

  it("disposed assets drop out of the default list but appear with ?disposed=true", async () => {
    const user = await setup("disposal-owner", "Disposal Household");

    // A destination account is required for disposal.
    const acctRes = await authedPost(user.accessToken, "/api/assets/accounts", {
      name: "Sale Proceeds",
      type: "Current",
      initialValue: 100,
      initialValueDate: "2026-01-01",
    });
    expect(acctRes.statusCode).toBe(201);
    const disposalAccountId = JSON.parse(acctRes.body).id as string;

    // Create a Vehicle already disposed in the past.
    const vehicleRes = await authedPost(user.accessToken, "/api/assets/assets", {
      name: "Old Car",
      type: "Vehicle",
      initialValue: 8000,
      initialValueDate: "2026-01-01",
      disposedAt: "2026-02-01",
      disposalAccountId,
    });
    expect(vehicleRes.statusCode).toBe(201);
    const vehicleId = JSON.parse(vehicleRes.body).id as string;

    // Default list excludes past-disposed items.
    const activeList = JSON.parse(
      (await authedGet(user.accessToken, "/api/assets/assets/Vehicle")).body
    );
    expect(activeList.find((a: { id: string }) => a.id === vehicleId)).toBeUndefined();

    // With ?disposed=true, the item is included.
    const disposedList = JSON.parse(
      (await authedGet(user.accessToken, "/api/assets/assets/Vehicle?disposed=true")).body
    );
    expect(disposedList.find((a: { id: string }) => a.id === vehicleId)).toBeDefined();

    // Summary reflects active holdings only — disposed vehicle not counted.
    const summary = JSON.parse((await authedGet(user.accessToken, "/api/assets/summary")).body);
    expect(summary.assetTotals.Vehicle).toBe(0);
  });

  // ─── 4. Latest-balance selection prefers the newest date ──────────────────

  it("currentBalance reflects the newest-dated balance, not insertion order", async () => {
    const user = await setup("balance-owner", "Balance Household");

    const acctRes = await authedPost(user.accessToken, "/api/assets/accounts", {
      name: "Savings Pot",
      type: "Savings",
      initialValue: 1000,
      initialValueDate: "2026-03-01",
    });
    expect(acctRes.statusCode).toBe(201);
    const accountId = JSON.parse(acctRes.body).id as string;

    // Record an OLDER-dated balance after the initial one — must NOT win.
    const olderRes = await authedPost(
      user.accessToken,
      `/api/assets/accounts/${accountId}/balance`,
      { value: 500, date: "2026-01-01" }
    );
    expect(olderRes.statusCode).toBe(201);

    // Record a NEWER-dated balance — should win.
    const newerRes = await authedPost(
      user.accessToken,
      `/api/assets/accounts/${accountId}/balance`,
      { value: 2000, date: "2026-06-01" }
    );
    expect(newerRes.statusCode).toBe(201);

    const list = JSON.parse(
      (await authedGet(user.accessToken, "/api/assets/accounts/Savings")).body
    );
    const acct = list.find((a: { id: string }) => a.id === accountId);
    expect(acct.currentBalance).toBe(2000);
  });

  // ─── 5. Tenant isolation (zero-trust) ─────────────────────────────────────

  it("a second user cannot see or mutate the first user's assets/accounts", async () => {
    // User A creates an asset and an account.
    const userA = await setup("iso-a", "Household A");
    const assetRes = await authedPost(userA.accessToken, "/api/assets/assets", {
      name: "A's House",
      type: "Property",
      initialValue: 400000,
      initialValueDate: "2026-01-01",
    });
    expect(assetRes.statusCode).toBe(201);
    const assetId = JSON.parse(assetRes.body).id as string;

    const acctRes = await authedPost(userA.accessToken, "/api/assets/accounts", {
      name: "A's Current",
      type: "Current",
      initialValue: 10000,
      initialValueDate: "2026-01-01",
    });
    expect(acctRes.statusCode).toBe(201);
    const accountId = JSON.parse(acctRes.body).id as string;

    // User A sees their data.
    const listA = JSON.parse(
      (await authedGet(userA.accessToken, "/api/assets/assets/Property")).body
    );
    expect(listA.find((a: { name: string }) => a.name === "A's House")).toBeDefined();

    // User B has their own household and must see NOTHING of A's.
    const userB = await setup("iso-b", "Household B");

    const listB = JSON.parse(
      (await authedGet(userB.accessToken, "/api/assets/assets/Property")).body
    );
    expect(listB).toHaveLength(0);

    const summaryB = JSON.parse((await authedGet(userB.accessToken, "/api/assets/summary")).body);
    expect(summaryB.grandTotal).toBe(0);
    expect(summaryB.assetTotals.Property).toBe(0);

    // Masking: B cannot read/patch/delete A's asset by id — surfaces as 404
    // (resource existence must not be revealed to unauthorised callers).
    const patchCsrf = await getCsrfToken();
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/assets/assets/${assetId}`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userB.accessToken}`,
        "x-csrf-token": patchCsrf.token,
        cookie: patchCsrf.cookie,
      },
      payload: { name: "Hijacked" },
    });
    expect(patchRes.statusCode).toBe(404);

    // B cannot record a balance against A's account.
    const balCsrf = await getCsrfToken();
    const balRes = await app.inject({
      method: "POST",
      url: `/api/assets/accounts/${accountId}/balance`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userB.accessToken}`,
        "x-csrf-token": balCsrf.token,
        cookie: balCsrf.cookie,
      },
      payload: { value: 999999, date: "2026-06-01" },
    });
    expect(balRes.statusCode).toBe(404);

    // A's data is untouched.
    const listAAfter = JSON.parse(
      (await authedGet(userA.accessToken, "/api/assets/assets/Property")).body
    );
    expect(listAAfter.find((a: { name: string }) => a.name === "A's House")).toBeDefined();
    expect(listAAfter.find((a: { name: string }) => a.name === "Hijacked")).toBeUndefined();
  });
});
