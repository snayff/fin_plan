import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { buildApp } from "../../app";
import { truncateAllTables } from "../helpers/test-db";
import type { FastifyInstance } from "fastify";

describe("Forecast Journey", () => {
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
    return { cookie: csrfCookie!.split(";")[0]!, token: body.csrfToken as string };
  }

  let emailCounter = 0;
  function uniqueEmail(prefix: string): string {
    emailCounter += 1;
    return `${prefix}-${Date.now()}-${emailCounter}@test.com`;
  }

  async function registerUser(email: string, name: string): Promise<{ accessToken: string }> {
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
    return { accessToken: JSON.parse(res.body).accessToken as string };
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
    return { householdId: JSON.parse(res.body).household.id as string };
  }

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
    return app.inject({ method: "GET", url, headers: { authorization: `Bearer ${accessToken}` } });
  }

  /** Fetch the first subcategory id for a tier (defaults are auto-seeded). */
  async function firstSubcategoryId(accessToken: string, tier: string): Promise<string> {
    const res = await authedGet(accessToken, `/api/waterfall/subcategories/${tier}`);
    expect(res.statusCode).toBe(200);
    const subs = JSON.parse(res.body);
    expect(subs.length).toBeGreaterThan(0);
    return subs[0].id as string;
  }

  /** Seed a minimal waterfall (income, committed, discretionary) + a savings account. */
  async function seedForecastData(accessToken: string): Promise<{ savingsBalance: number }> {
    // Income → surplus is positive.
    const incomeRes = await authedPost(accessToken, "/api/waterfall/income", {
      name: "Salary",
      amount: 4000,
      frequency: "monthly",
      dueDate: "2026-01-25",
    });
    expect(incomeRes.statusCode).toBe(201);

    // Committed bill (committed/discretionary require a subcategoryId).
    const committedSubId = await firstSubcategoryId(accessToken, "committed");
    const committedRes = await authedPost(accessToken, "/api/waterfall/committed", {
      name: "Rent",
      amount: 1200,
      spendType: "monthly",
      dueDate: "2026-01-01",
      subcategoryId: committedSubId,
    });
    expect(committedRes.statusCode).toBe(201);

    // Discretionary item.
    const discSubId = await firstSubcategoryId(accessToken, "discretionary");
    const discRes = await authedPost(accessToken, "/api/waterfall/discretionary", {
      name: "Dining Out",
      amount: 300,
      spendType: "monthly",
      dueDate: "2026-01-01",
      subcategoryId: discSubId,
    });
    expect(discRes.statusCode).toBe(201);

    // A savings account with a balance — drives netWorth/savings series.
    const savingsBalance = 20000;
    const acctRes = await authedPost(accessToken, "/api/assets/accounts", {
      name: "Emergency Fund",
      type: "Savings",
      initialValue: savingsBalance,
      initialValueDate: "2026-01-01",
    });
    expect(acctRes.statusCode).toBe(201);

    return { savingsBalance };
  }

  // ─── 1. Coherent projection shape ─────────────────────────────────────────

  it("returns a coherent projection over the requested horizon", async () => {
    const user = await registerUser(uniqueEmail("forecast"), "Forecast User");
    await createHousehold(user.accessToken, "Forecast Household");
    const { savingsBalance } = await seedForecastData(user.accessToken);

    const horizon = 10;
    const res = await authedGet(user.accessToken, `/api/forecast?horizonYears=${horizon}`);
    expect(res.statusCode).toBe(200);
    const projection = JSON.parse(res.body);

    // Every series spans horizon + 1 points (year 0 .. year horizon).
    expect(projection.netWorth).toHaveLength(horizon + 1);
    expect(projection.surplus).toHaveLength(horizon + 1);
    expect(projection.savings).toHaveLength(horizon + 1);
    expect(projection.stocksAndShares).toHaveLength(horizon + 1);

    // Years are sequential integers starting at the current year.
    const currentYear = new Date().getFullYear();
    expect(projection.netWorth[0].year).toBe(currentYear);
    expect(projection.netWorth[horizon].year).toBe(currentYear + horizon);
    for (let i = 1; i < projection.netWorth.length; i++) {
      expect(projection.netWorth[i].year).toBe(projection.netWorth[i - 1].year + 1);
    }

    // Year-0 net worth reconciles with the seeded liquid balance (Savings only,
    // no assets, no pension) — forecast year-0 == current holdings.
    expect(projection.netWorth[0].nominal).toBe(savingsBalance);
    expect(projection.savings[0].balance).toBe(savingsBalance);

    // Real value at year 0 equals nominal (no inflation discounting applied yet).
    expect(projection.netWorth[0].real).toBe(projection.netWorth[0].nominal);

    // Surplus accumulation starts at 0 and is non-decreasing given a positive surplus.
    expect(projection.surplus[0].cumulative).toBe(0);
    expect(projection.surplus[horizon].cumulative).toBeGreaterThan(0);

    // Contribution scope map is present and fully shaped.
    expect(projection.monthlyContributionsByScope).toMatchObject({
      netWorth: expect.any(Number),
      retirement: expect.any(Number),
      savings: expect.any(Number),
      stocksAndShares: expect.any(Number),
    });

    // Retirement projection has one entry per household member (owner only here).
    expect(Array.isArray(projection.retirement)).toBe(true);
    expect(projection.retirement).toHaveLength(1);
    expect(projection.retirement[0].series).toHaveLength(horizon + 1);
  });

  // ─── 2. Growth over time (savings compounds upward) ───────────────────────

  it("projects savings growth upward across the horizon", async () => {
    const user = await registerUser(uniqueEmail("growth"), "Growth User");
    await createHousehold(user.accessToken, "Growth Household");
    const { savingsBalance } = await seedForecastData(user.accessToken);

    const res = await authedGet(user.accessToken, `/api/forecast?horizonYears=30`);
    expect(res.statusCode).toBe(200);
    const projection = JSON.parse(res.body);

    // With a non-zero default savings rate, the final savings balance exceeds
    // the starting balance.
    expect(projection.savings[0].balance).toBe(savingsBalance);
    expect(projection.savings[30].balance).toBeGreaterThan(savingsBalance);
  });

  // ─── 3. Invalid horizon is rejected ───────────────────────────────────────

  it("rejects an unsupported horizon value", async () => {
    const user = await registerUser(uniqueEmail("badhorizon"), "Bad Horizon User");
    await createHousehold(user.accessToken, "Bad Horizon Household");

    const res = await authedGet(user.accessToken, `/api/forecast?horizonYears=7`);
    expect(res.statusCode).toBe(400);
  });

  // ─── 4. Tenant isolation ──────────────────────────────────────────────────

  it("a second household's forecast does not include the first household's balances", async () => {
    // User A: seeded household with a 20k savings balance.
    const userA = await registerUser(uniqueEmail("iso-fc-a"), "Forecast A");
    await createHousehold(userA.accessToken, "Forecast Household A");
    const { savingsBalance } = await seedForecastData(userA.accessToken);

    const projA = JSON.parse(
      (await authedGet(userA.accessToken, `/api/forecast?horizonYears=10`)).body
    );
    expect(projA.netWorth[0].nominal).toBe(savingsBalance);

    // User B: empty household — forecast must be all zeros, no leakage.
    const userB = await registerUser(uniqueEmail("iso-fc-b"), "Forecast B");
    await createHousehold(userB.accessToken, "Forecast Household B");

    const resB = await authedGet(userB.accessToken, `/api/forecast?horizonYears=10`);
    expect(resB.statusCode).toBe(200);
    const projB = JSON.parse(resB.body);

    expect(projB.netWorth[0].nominal).toBe(0);
    expect(projB.savings[0].balance).toBe(0);
    expect(projB.savings[10].balance).toBe(0);
    // No members' balances, no surplus (empty waterfall).
    expect(projB.surplus[10].cumulative).toBe(0);
    // B has exactly one member (its owner) — retirement series present but zeroed.
    expect(projB.retirement).toHaveLength(1);
    expect(projB.retirement[0].series[0].pension).toBe(0);
  });
});
