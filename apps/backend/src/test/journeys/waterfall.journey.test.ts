import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { buildApp } from "../../app";
import { truncateAllTables } from "../helpers/test-db";
import { prisma } from "../../config/database";
import type { FastifyInstance } from "fastify";

describe("Waterfall Journey", () => {
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

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

  function authHeaders(accessToken: string) {
    return { authorization: `Bearer ${accessToken}` };
  }

  async function authedMutationHeaders(accessToken: string) {
    const csrf = await getCsrfToken();
    return {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-csrf-token": csrf.token,
      cookie: csrf.cookie,
    };
  }

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

  /** Fetch default subcategories for a tier — the API auto-creates them. */
  async function getDefaultSubcategoryId(
    accessToken: string,
    tier: "income" | "committed" | "discretionary"
  ): Promise<string> {
    const res = await app.inject({
      method: "GET",
      url: `/api/waterfall/subcategories/${tier}`,
      headers: authHeaders(accessToken),
    });
    expect(res.statusCode).toBe(200);
    const subcategories = JSON.parse(res.body) as Array<{ id: string; isDefault: boolean }>;
    const defaultSub = subcategories.find((s) => s.isDefault);
    expect(defaultSub).toBeDefined();
    return defaultSub!.id;
  }

  // ─── 1. Full waterfall flow ─────────────────────────────────────────────

  it("register → create items → verify waterfall summary arithmetic", async () => {
    const { accessToken } = await registerUser("waterfall@test.com", "Waterfall User");
    await createHousehold(accessToken, "Waterfall Household");

    // ── Empty summary ──
    const emptyRes = await app.inject({
      method: "GET",
      url: "/api/waterfall",
      headers: authHeaders(accessToken),
    });
    expect(emptyRes.statusCode).toBe(200);
    const emptySummary = JSON.parse(emptyRes.body);
    expect(emptySummary.income.total).toBe(0);
    expect(emptySummary.surplus.amount).toBe(0);

    // ── Fetch default subcategory IDs (needed for committed & discretionary) ──
    const incomeSubId = await getDefaultSubcategoryId(accessToken, "income");
    const committedSubId = await getDefaultSubcategoryId(accessToken, "committed");
    const discretionarySubId = await getDefaultSubcategoryId(accessToken, "discretionary");

    // ── Create income: Main Salary £5,000/month ──
    const incomeHeaders = await authedMutationHeaders(accessToken);
    const incomeRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: incomeHeaders,
      payload: {
        name: "Main Salary",
        amount: 5000,
        frequency: "monthly",
        incomeType: "salary",
        dueDate: new Date().toISOString(),
        subcategoryId: incomeSubId,
      },
    });
    expect(incomeRes.statusCode).toBe(201);

    // ── Create committed: Rent £1,500/month ──
    const rentHeaders = await authedMutationHeaders(accessToken);
    const rentRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      headers: rentHeaders,
      payload: {
        name: "Rent",
        amount: 1500,
        spendType: "monthly",
        subcategoryId: committedSubId,
        dueDate: new Date().toISOString(),
      },
    });
    expect(rentRes.statusCode).toBe(201);

    // ── Create committed: Insurance £600/year ──
    const insuranceHeaders = await authedMutationHeaders(accessToken);
    const insuranceRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      headers: insuranceHeaders,
      payload: {
        name: "Insurance",
        amount: 600,
        spendType: "yearly",
        subcategoryId: committedSubId,
        dueDate: new Date().toISOString(),
      },
    });
    expect(insuranceRes.statusCode).toBe(201);

    // ── Create discretionary: Groceries £400/month ──
    const groceriesHeaders = await authedMutationHeaders(accessToken);
    const groceriesRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/discretionary",
      headers: groceriesHeaders,
      payload: {
        name: "Groceries",
        amount: 400,
        spendType: "monthly",
        subcategoryId: discretionarySubId,
        dueDate: new Date().toISOString(),
      },
    });
    expect(groceriesRes.statusCode).toBe(201);

    // ── Verify waterfall summary arithmetic ──
    const summaryRes = await app.inject({
      method: "GET",
      url: "/api/waterfall",
      headers: authHeaders(accessToken),
    });
    expect(summaryRes.statusCode).toBe(200);
    const summary = JSON.parse(summaryRes.body);

    // Monthly income = 5000
    expect(summary.income.total).toBe(5000);

    // Monthly committed = 1500 (bills) + 600/12 = 50 (yearly averaged)
    expect(summary.committed.monthlyTotal).toBe(1500);
    expect(summary.committed.monthlyAvg12).toBe(50);

    // Monthly discretionary = 400
    expect(summary.discretionary.total).toBe(400);

    // Surplus = 5000 - 1500 - 50 - 400 = 3050
    expect(summary.surplus.amount).toBe(3050);

    // Percent of income = (3050 / 5000) * 100 = 61
    expect(summary.surplus.percentOfIncome).toBe(61);
  });

  // ─── 2. Item CRUD ───────────────────────────────────────────────────────

  it("create → list → update amount via period → delete income source", async () => {
    const { accessToken } = await registerUser("crud@test.com", "CRUD User");
    await createHousehold(accessToken, "CRUD Household");
    const incomeSubId = await getDefaultSubcategoryId(accessToken, "income");

    // ── Create ──
    const createHeaders = await authedMutationHeaders(accessToken);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: createHeaders,
      payload: {
        name: "Freelance",
        amount: 2000,
        frequency: "monthly",
        incomeType: "freelance",
        dueDate: new Date().toISOString(),
        subcategoryId: incomeSubId,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    const incomeId = created.id as string;

    // ── List → verify present ──
    const listRes = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: authHeaders(accessToken),
    });
    expect(listRes.statusCode).toBe(200);
    const incomeList = JSON.parse(listRes.body) as Array<{ id: string; name: string }>;
    expect(incomeList.some((i) => i.id === incomeId && i.name === "Freelance")).toBe(true);

    // ── Update name via PATCH ──
    const patchHeaders = await authedMutationHeaders(accessToken);
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/waterfall/income/${incomeId}`,
      headers: patchHeaders,
      payload: { name: "Freelance Updated" },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = JSON.parse(patchRes.body);
    expect(patched.name).toBe("Freelance Updated");

    // ── Update amount via period ──
    // First, list periods for this income source
    const periodsRes = await app.inject({
      method: "GET",
      url: `/api/waterfall/periods/income_source/${incomeId}`,
      headers: authHeaders(accessToken),
    });
    expect(periodsRes.statusCode).toBe(200);
    const periods = JSON.parse(periodsRes.body) as Array<{ id: string; amount: number }>;
    expect(periods.length).toBeGreaterThanOrEqual(1);
    const periodId = periods[0]!.id;

    const periodPatchHeaders = await authedMutationHeaders(accessToken);
    const periodPatchRes = await app.inject({
      method: "PATCH",
      url: `/api/waterfall/periods/${periodId}`,
      headers: periodPatchHeaders,
      payload: { amount: 2500 },
    });
    expect(periodPatchRes.statusCode).toBe(200);
    const updatedPeriod = JSON.parse(periodPatchRes.body);
    expect(updatedPeriod.amount).toBe(2500);

    // Verify the summary reflects the updated amount
    const summaryRes = await app.inject({
      method: "GET",
      url: "/api/waterfall",
      headers: authHeaders(accessToken),
    });
    expect(summaryRes.statusCode).toBe(200);
    const summary = JSON.parse(summaryRes.body);
    expect(summary.income.total).toBe(2500);

    // ── Delete ──
    const csrfDelete = await getCsrfToken();
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/waterfall/income/${incomeId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-csrf-token": csrfDelete.token,
        cookie: csrfDelete.cookie,
      },
    });
    expect(deleteRes.statusCode).toBe(204);

    // ── List → verify gone ──
    const listAfterRes = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: authHeaders(accessToken),
    });
    expect(listAfterRes.statusCode).toBe(200);
    const incomeListAfter = JSON.parse(listAfterRes.body) as Array<{ id: string }>;
    expect(incomeListAfter.some((i) => i.id === incomeId)).toBe(false);
  });

  // ─── 3. Household isolation ─────────────────────────────────────────────

  it("user B cannot see user A's waterfall items", async () => {
    // ── Register two separate users (each gets their own household) ──
    const userA = await registerUser("usera@test.com", "User A");
    await createHousehold(userA.accessToken, "Household A");
    const userB = await registerUser("userb@test.com", "User B");
    await createHousehold(userB.accessToken, "Household B");

    // ── User A creates an income source ──
    const subIdA = await getDefaultSubcategoryId(userA.accessToken, "income");
    const createHeaders = await authedMutationHeaders(userA.accessToken);
    const createRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: createHeaders,
      payload: {
        name: "User A Salary",
        amount: 4000,
        frequency: "monthly",
        incomeType: "salary",
        dueDate: new Date().toISOString(),
        subcategoryId: subIdA,
      },
    });
    expect(createRes.statusCode).toBe(201);

    // ── User A sees their income ──
    const listA = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: authHeaders(userA.accessToken),
    });
    expect(listA.statusCode).toBe(200);
    const incomeA = JSON.parse(listA.body) as Array<{ name: string }>;
    expect(incomeA.some((i) => i.name === "User A Salary")).toBe(true);

    // ── User B does NOT see User A's income ──
    const listB = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: authHeaders(userB.accessToken),
    });
    expect(listB.statusCode).toBe(200);
    const incomeB = JSON.parse(listB.body) as Array<{ name: string }>;
    expect(incomeB.some((i) => i.name === "User A Salary")).toBe(false);

    // ── User B's waterfall summary should have zero income ──
    const summaryB = await app.inject({
      method: "GET",
      url: "/api/waterfall",
      headers: authHeaders(userB.accessToken),
    });
    expect(summaryB.statusCode).toBe(200);
    const summaryBBody = JSON.parse(summaryB.body);
    expect(summaryBBody.income.total).toBe(0);
  });

  it("amount periods and value history are scoped to the owning household", async () => {
    const userA = await registerUser("perioda@test.com", "Period A");
    await createHousehold(userA.accessToken, "Period Household A");
    const userB = await registerUser("periodb@test.com", "Period B");
    await createHousehold(userB.accessToken, "Period Household B");

    // ── User A creates an income source (auto-creates its first period) ──
    const subIdA = await getDefaultSubcategoryId(userA.accessToken, "income");
    const createRes = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: await authedMutationHeaders(userA.accessToken),
      payload: {
        name: "Scoped Salary",
        amount: 3000,
        frequency: "monthly",
        incomeType: "salary",
        dueDate: new Date().toISOString(),
        subcategoryId: subIdA,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const incomeId = JSON.parse(createRes.body).id as string;

    // ── The persisted period row carries household A's id ──
    const householdA = await prisma.household.findFirst({
      where: { name: "Period Household A" },
    });
    expect(householdA).not.toBeNull();
    const periodRow = await prisma.itemAmountPeriod.findFirst({ where: { itemId: incomeId } });
    expect(periodRow).not.toBeNull();
    expect(periodRow!.householdId).toBe(householdA!.id);

    // ── User B cannot list user A's periods ──
    const listAsB = await app.inject({
      method: "GET",
      url: `/api/waterfall/periods/income_source/${incomeId}`,
      headers: authHeaders(userB.accessToken),
    });
    expect(listAsB.statusCode).toBe(404);

    // ── User B cannot update or delete user A's period ──
    const patchAsB = await app.inject({
      method: "PATCH",
      url: `/api/waterfall/periods/${periodRow!.id}`,
      headers: await authedMutationHeaders(userB.accessToken),
      payload: { amount: 1 },
    });
    expect(patchAsB.statusCode).toBe(404);

    const csrfDelete = await getCsrfToken();
    const deleteAsB = await app.inject({
      method: "DELETE",
      url: `/api/waterfall/periods/${periodRow!.id}`,
      headers: {
        authorization: `Bearer ${userB.accessToken}`,
        "x-csrf-token": csrfDelete.token,
        cookie: csrfDelete.cookie,
      },
    });
    expect(deleteAsB.statusCode).toBe(404);

    // Period unchanged after the rejected mutations.
    const periodAfter = await prisma.itemAmountPeriod.findFirst({ where: { id: periodRow!.id } });
    expect(periodAfter).not.toBeNull();
    expect(periodAfter!.amount).toBe(3000);

    // ── Value history is household-scoped too ──
    await prisma.waterfallHistory.create({
      data: {
        householdId: householdA!.id,
        itemType: "income_source",
        itemId: incomeId,
        value: 3000,
        recordedAt: new Date(),
      },
    });

    const historyAsA = await app.inject({
      method: "GET",
      url: `/api/waterfall/history/income_source/${incomeId}`,
      headers: authHeaders(userA.accessToken),
    });
    expect(historyAsA.statusCode).toBe(200);
    expect(JSON.parse(historyAsA.body)).toHaveLength(1);

    const historyAsB = await app.inject({
      method: "GET",
      url: `/api/waterfall/history/income_source/${incomeId}`,
      headers: authHeaders(userB.accessToken),
    });
    expect(historyAsB.statusCode).toBe(404);
  });
});
