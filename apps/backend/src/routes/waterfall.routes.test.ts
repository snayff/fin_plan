import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError, ConflictError } from "../utils/errors";

const waterfallServiceMock = {
  getWaterfallSummary: mock(() =>
    Promise.resolve({
      income: { total: 0, byType: [], monthly: [], nonMonthly: [], oneOff: [] },
      committed: { monthlyTotal: 0, monthlyAvg12: 0, bills: [], nonMonthlyBills: [] },
      discretionary: { total: 0, categories: [], savings: { total: 0, allocations: [] } },
      surplus: { amount: 0, percentOfIncome: 0 },
    })
  ),
  listIncome: mock(() => Promise.resolve([])),
  createIncome: mock(() => Promise.resolve(null)),
  updateIncome: mock(() => Promise.resolve(null)),
  deleteIncome: mock(() => Promise.resolve()),
  confirmIncome: mock(() => Promise.resolve(null)),
  listCommitted: mock(() => Promise.resolve([])),
  createCommitted: mock(() => Promise.resolve(null)),
  updateCommitted: mock(() => Promise.resolve(null)),
  deleteCommitted: mock(() => Promise.resolve()),
  confirmCommitted: mock(() => Promise.resolve(null)),
  listYearly: mock(() => Promise.resolve([])),
  createYearly: mock(() => Promise.resolve(null)),
  updateYearly: mock(() => Promise.resolve(null)),
  deleteYearly: mock(() => Promise.resolve()),
  confirmYearly: mock(() => Promise.resolve(null)),
  listDiscretionary: mock(() => Promise.resolve([])),
  createDiscretionary: mock(() => Promise.resolve(null)),
  updateDiscretionary: mock(() => Promise.resolve(null)),
  deleteDiscretionary: mock(() => Promise.resolve()),
  confirmDiscretionary: mock(() => Promise.resolve(null)),
  listSavings: mock(() => Promise.resolve([])),
  createSavings: mock(() => Promise.resolve(null)),
  updateSavings: mock(() => Promise.resolve(null)),
  deleteSavings: mock(() => Promise.resolve()),
  confirmSavings: mock(() => Promise.resolve(null)),
  getHistory: mock(() => Promise.resolve([])),
  confirmBatch: mock(() => Promise.resolve()),
  deleteAll: mock(() => Promise.resolve()),
};

const snapshotServiceMock = {
  ensureJan1Snapshot: mock(() => Promise.resolve()),
  ensureTodayAutoSnapshot: mock(() => Promise.resolve()),
  ensureBaselineSnapshot: mock(() => Promise.resolve()),
  getFinancialSummary: mock(() =>
    Promise.resolve({
      current: { netWorth: null, income: 5000, committed: 1300, discretionary: 800, surplus: 2900 },
      sparklines: { netWorth: [], income: [], committed: [], discretionary: [], surplus: [] },
    })
  ),
};

const periodServiceMock = {
  listPeriods: mock(() => Promise.resolve([])),
  createPeriod: mock(() => Promise.resolve({ id: "p1", amount: 0 })),
  updatePeriod: mock(() => Promise.resolve({ id: "p1" })),
  deletePeriod: mock(() => Promise.resolve(undefined)),
  getCurrentAmount: mock(() => Promise.resolve(0)),
  getEffectiveAmountForMonth: mock(() => Promise.resolve(0)),
  getLifecycleState: mock(() => Promise.resolve("active")),
};

const computeLifecycleStateMock = mock(() => "active");
const findEffectivePeriodMock = mock(() => null);

mock.module("../services/waterfall.service", () => ({
  waterfallService: waterfallServiceMock,
}));

mock.module("../services/period.service.js", () => ({
  periodService: periodServiceMock,
  computeLifecycleState: computeLifecycleStateMock,
  findEffectivePeriod: findEffectivePeriodMock,
}));

const subcategoryServiceMock = {
  ensureSubcategories: mock(() => Promise.resolve()),
  listByTier: mock(() => Promise.resolve([])),
  seedDefaults: mock(() => Promise.resolve()),
  getDefaultSubcategoryId: mock(() => Promise.resolve("sub-other")),
  getSubcategoryIdByName: mock(() => Promise.resolve(null)),
  batchSave: mock(() => Promise.resolve()),
  getItemCounts: mock(() => Promise.resolve({})),
  resetToDefaults: mock(() => Promise.resolve()),
  create: mock(() =>
    Promise.resolve({
      id: "sub-new",
      householdId: "hh-1",
      tier: "committed",
      name: "Subscriptions",
      sortOrder: 7,
      isLocked: false,
      isDefault: false,
      lockedByPlanner: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  ),
  getDefaults: mock(() => ({
    income: [
      { name: "Salary", sortOrder: 0 },
      { name: "Dividends", sortOrder: 1 },
      { name: "Other", sortOrder: 2 },
    ],
    committed: [],
    discretionary: [],
  })),
};

mock.module("../services/snapshot.service", () => ({
  snapshotService: snapshotServiceMock,
}));

mock.module("../services/subcategory.service", () => ({
  subcategoryService: subcategoryServiceMock,
}));

mock.module("../config/database.js", () => ({
  prisma: {
    incomeSource: { findUnique: mock(() => Promise.resolve(null)) },
    committedItem: { findUnique: mock(() => Promise.resolve(null)) },
    discretionaryItem: { findUnique: mock(() => Promise.resolve(null)) },
  },
}));

mock.module("../lib/actor-ctx.js", () => ({
  actorCtx: mock(() => ({ userId: "user-1", email: "test@test.com" })),
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { waterfallRoutes } from "./waterfall.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(waterfallRoutes, { prefix: "/api/waterfall" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockSummary = {
  income: { total: 5000, byType: [], monthly: [], nonMonthly: [], oneOff: [] },
  committed: { monthlyTotal: 1000, monthlyAvg12: 100, bills: [], nonMonthlyBills: [] },
  discretionary: { total: 500, categories: [], savings: { total: 0, allocations: [] } },
  surplus: { amount: 3400, percentOfIncome: 68 },
};

const mockIncomeSource = {
  id: "inc-1",
  householdId: "hh-1",
  name: "Salary",
  frequency: "monthly",
  incomeType: "salary",
  dueDate: new Date("2026-01-01"),
  memberId: null,
  sortOrder: 0,
  lastReviewedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockCommittedBill = {
  id: "bill-1",
  householdId: "hh-1",
  name: "Rent",
  memberId: null,
  sortOrder: 0,
  lastReviewedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockYearlyBill = {
  id: "ybill-1",
  householdId: "hh-1",
  name: "Car Insurance",
  dueDate: new Date("2026-03-15"),
  sortOrder: 0,
  lastReviewedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockDiscretionaryCategory = {
  id: "disc-1",
  householdId: "hh-1",
  name: "Groceries",
  subcategoryId: "sub-food",
  sortOrder: 0,
  lastReviewedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockSavingsAllocation = {
  id: "sav-1",
  householdId: "hh-1",
  name: "Emergency Fund",
  subcategoryId: "sub-savings",
  sortOrder: 0,
  lastReviewedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  for (const method of Object.values(waterfallServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  for (const method of Object.values(snapshotServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  for (const method of Object.values(subcategoryServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  for (const method of Object.values(periodServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }

  waterfallServiceMock.getWaterfallSummary.mockResolvedValue(mockSummary as any);
  waterfallServiceMock.listIncome.mockResolvedValue([mockIncomeSource] as any);
  waterfallServiceMock.createIncome.mockResolvedValue(mockIncomeSource as any);
  waterfallServiceMock.updateIncome.mockResolvedValue(mockIncomeSource as any);
  waterfallServiceMock.deleteIncome.mockResolvedValue(undefined);
  waterfallServiceMock.confirmIncome.mockResolvedValue(mockIncomeSource as any);
  waterfallServiceMock.listCommitted.mockResolvedValue([mockCommittedBill] as any);
  waterfallServiceMock.createCommitted.mockResolvedValue(mockCommittedBill as any);
  waterfallServiceMock.updateCommitted.mockResolvedValue(mockCommittedBill as any);
  waterfallServiceMock.deleteCommitted.mockResolvedValue(undefined);
  waterfallServiceMock.confirmCommitted.mockResolvedValue(mockCommittedBill as any);
  waterfallServiceMock.listYearly.mockResolvedValue([mockYearlyBill] as any);
  waterfallServiceMock.createYearly.mockResolvedValue(mockYearlyBill as any);
  waterfallServiceMock.updateYearly.mockResolvedValue(mockYearlyBill as any);
  waterfallServiceMock.deleteYearly.mockResolvedValue(undefined);
  waterfallServiceMock.confirmYearly.mockResolvedValue(mockYearlyBill as any);
  waterfallServiceMock.listDiscretionary.mockResolvedValue([mockDiscretionaryCategory] as any);
  waterfallServiceMock.createDiscretionary.mockResolvedValue(mockDiscretionaryCategory as any);
  waterfallServiceMock.updateDiscretionary.mockResolvedValue(mockDiscretionaryCategory as any);
  waterfallServiceMock.deleteDiscretionary.mockResolvedValue(undefined);
  waterfallServiceMock.confirmDiscretionary.mockResolvedValue(mockDiscretionaryCategory as any);
  waterfallServiceMock.listSavings.mockResolvedValue([mockSavingsAllocation] as any);
  waterfallServiceMock.createSavings.mockResolvedValue(mockSavingsAllocation as any);
  waterfallServiceMock.updateSavings.mockResolvedValue(mockSavingsAllocation as any);
  waterfallServiceMock.deleteSavings.mockResolvedValue(undefined);
  waterfallServiceMock.confirmSavings.mockResolvedValue(mockSavingsAllocation as any);
  waterfallServiceMock.getHistory.mockResolvedValue([] as any);
  waterfallServiceMock.confirmBatch.mockResolvedValue(undefined);
  waterfallServiceMock.deleteAll.mockResolvedValue(undefined);

  snapshotServiceMock.ensureJan1Snapshot.mockResolvedValue(undefined as any);
  snapshotServiceMock.ensureTodayAutoSnapshot.mockResolvedValue(undefined as any);
  snapshotServiceMock.ensureBaselineSnapshot.mockResolvedValue(undefined as any);
  snapshotServiceMock.getFinancialSummary.mockResolvedValue({
    current: { netWorth: null, income: 5000, committed: 1300, discretionary: 800, surplus: 2900 },
    sparklines: { netWorth: [], income: [], committed: [], discretionary: [], surplus: [] },
  } as any);

  subcategoryServiceMock.ensureSubcategories.mockResolvedValue(undefined as any);
  subcategoryServiceMock.listByTier.mockResolvedValue([] as any);
  subcategoryServiceMock.seedDefaults.mockResolvedValue(undefined as any);
  subcategoryServiceMock.getDefaultSubcategoryId.mockResolvedValue("sub-other" as any);
  subcategoryServiceMock.getSubcategoryIdByName.mockResolvedValue(null as any);
  subcategoryServiceMock.create.mockResolvedValue({
    id: "sub-new",
    householdId: "hh-1",
    tier: "committed",
    name: "Subscriptions",
    sortOrder: 7,
    isLocked: false,
    isDefault: false,
    lockedByPlanner: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  periodServiceMock.listPeriods.mockResolvedValue([] as any);
  periodServiceMock.createPeriod.mockResolvedValue({ id: "p1", amount: 0 } as any);
  periodServiceMock.updatePeriod.mockResolvedValue({ id: "p1" } as any);
  periodServiceMock.deletePeriod.mockResolvedValue(undefined as any);
  periodServiceMock.getCurrentAmount.mockResolvedValue(0 as any);
  periodServiceMock.getEffectiveAmountForMonth.mockResolvedValue(0 as any);
  periodServiceMock.getLifecycleState.mockResolvedValue("active" as any);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────────

describe("GET /api/waterfall", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/waterfall" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with waterfall summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.surplus).toBeDefined();
    expect(body.income).toBeDefined();
  });
});

// ─── Income ───────────────────────────────────────────────────────────────────

describe("GET /api/waterfall/income", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/waterfall/income" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with income list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});

describe("POST /api/waterfall/income", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      payload: { name: "Salary", amount: 5000, frequency: "monthly" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created income source", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Salary",
        amount: 5000,
        frequency: "monthly",
        dueDate: "2026-01-01",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("Salary");
  });

  it("returns 400 for invalid frequency", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Salary", amount: 5000, frequency: "weekly" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for missing name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { amount: 5000, frequency: "monthly" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── PATCH: amount / frequency / dueDate survive schema parsing (bug #108) ──────

describe("PATCH update schemas accept amount and forward it to the service", () => {
  it("PATCH /api/waterfall/income forwards amount + frequency in data", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/waterfall/income/inc-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { amount: 1500, frequency: "annual" },
    });
    expect(res.statusCode).toBe(200);
    const data = waterfallServiceMock.updateIncome.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(data).toMatchObject({ amount: 1500, frequency: "annual" });
  });

  it("PATCH /api/waterfall/committed forwards amount in data", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/waterfall/committed/ci-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { amount: 350 },
    });
    expect(res.statusCode).toBe(200);
    const data = waterfallServiceMock.updateCommitted.mock.calls.at(-1)![2] as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({ amount: 350 });
  });

  it("PATCH /api/waterfall/discretionary forwards amount + dueDate in data", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/waterfall/discretionary/di-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { amount: 75, dueDate: "2026-09-01" },
    });
    expect(res.statusCode).toBe(200);
    const data = waterfallServiceMock.updateDiscretionary.mock.calls.at(-1)![2] as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({ amount: 75 });
    expect(data.dueDate).toBeInstanceOf(Date);
  });

  it("PATCH /api/waterfall/income rejects a non-positive amount", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/waterfall/income/inc-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { amount: -5 },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Committed Bills ──────────────────────────────────────────────────────────

describe("POST /api/waterfall/committed", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      payload: { name: "Rent", amount: 1000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created committed bill", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Rent",
        amount: 1000,
        subcategoryId: "sub-1",
        dueDate: "2026-01-01",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("Rent");
  });

  it("returns 400 for missing amount", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Rent" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Yearly Bills ─────────────────────────────────────────────────────────────

describe("POST /api/waterfall/yearly", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/yearly",
      payload: {
        name: "Car Insurance",
        amount: 600,
        subcategoryId: "sub-1",
        dueDate: "2026-03-15",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created yearly bill", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/yearly",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Car Insurance",
        amount: 600,
        subcategoryId: "sub-1",
        dueDate: "2026-03-15",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().dueDate).toBe("2026-03-15T00:00:00.000Z");
  });

  it("returns 400 for missing subcategoryId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/yearly",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Car Insurance", amount: 600 },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Discretionary ────────────────────────────────────────────────────────────

describe("POST /api/waterfall/discretionary", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/discretionary",
      payload: { name: "Groceries", amount: 400, subcategoryId: "sub-food" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created discretionary category", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/discretionary",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Groceries", amount: 400, subcategoryId: "sub-food" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("Groceries");
  });

  it("returns 400 for missing amount", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/discretionary",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Groceries" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Savings Allocations ──────────────────────────────────────────────────────

describe("POST /api/waterfall/savings", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/savings",
      payload: { name: "Emergency Fund", amount: 200, subcategoryId: "sub-savings" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created savings allocation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/savings",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Emergency Fund", amount: 200, subcategoryId: "sub-savings" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("Emergency Fund");
  });

  it("returns 400 for missing amount", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/savings",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Emergency Fund" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Confirm Batch ────────────────────────────────────────────────────────────

describe("POST /api/waterfall/confirm-batch", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/confirm-batch",
      payload: { items: [{ type: "income_source", id: "inc-1" }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 with valid batch", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/confirm-batch",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        items: [
          { type: "income_source", id: "inc-1" },
          { type: "committed_bill", id: "bill-1" },
          { type: "yearly_bill", id: "ybill-1" },
          { type: "discretionary_category", id: "disc-1" },
          { type: "savings_allocation", id: "sav-1" },
        ],
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it("returns 400 for invalid item type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/confirm-batch",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        items: [{ type: "unknown_type", id: "inc-1" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Delete all (SEC-1: owner/admin only + audited) ─────────────────────────────

describe("DELETE /api/waterfall/all", () => {
  // Re-arm the auth middleware to attach a specific household role so the
  // route's owner/admin gate can be exercised.
  function armRole(role: "owner" | "admin" | "member") {
    (authMiddleware as any).mockImplementation(async (request: any) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        throw new AuthenticationError("No authorization token provided");
      }
      request.user = { userId: "user-1", email: "test@test.com", name: "Tester", role };
      request.householdId = "hh-1";
    });
  }

  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/waterfall/all", payload: {} });
    expect(res.statusCode).toBe(401);
    expect(waterfallServiceMock.deleteAll).not.toHaveBeenCalled();
  });

  it("rejects a plain member with 403 and does not delete", async () => {
    armRole("member");
    const res = await app.inject({
      method: "DELETE",
      url: "/api/waterfall/all",
      headers: { authorization: "Bearer valid-token" },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    expect(waterfallServiceMock.deleteAll).not.toHaveBeenCalled();
  });

  it("allows an owner and forwards an actor context to the service", async () => {
    armRole("owner");
    const res = await app.inject({
      method: "DELETE",
      url: "/api/waterfall/all",
      headers: { authorization: "Bearer valid-token" },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(204);
    expect(waterfallServiceMock.deleteAll).toHaveBeenCalledTimes(1);
    // deleteAll(householdId, actorCtx)
    const call = waterfallServiceMock.deleteAll.mock.calls.at(-1)!;
    expect(call[0]).toBe("hh-1");
    expect(call[1]).toBeDefined();
  });

  it("allows an admin", async () => {
    armRole("admin");
    const res = await app.inject({
      method: "DELETE",
      url: "/api/waterfall/all",
      headers: { authorization: "Bearer valid-token" },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(204);
    expect(waterfallServiceMock.deleteAll).toHaveBeenCalledTimes(1);
  });
});

// ─── Subcategories ────────────────────────────────────────────────────────────

describe("GET /api/waterfall/subcategories/:tier", () => {
  it("returns subcategories for a valid tier", async () => {
    const mockSubs = [{ id: "sub-1", name: "Salary", tier: "income" }];
    subcategoryServiceMock.listByTier.mockResolvedValue(mockSubs as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/subcategories/income",
      headers: { authorization: "Bearer test" },
    });

    expect(res.statusCode).toBe(200);
    expect(subcategoryServiceMock.ensureSubcategories).toHaveBeenCalled();
    expect(subcategoryServiceMock.listByTier).toHaveBeenCalledWith("hh-1", "income");
  });

  it("POST /api/waterfall/committed sends valid payload with subcategoryId", async () => {
    waterfallServiceMock.createCommitted.mockResolvedValue({ id: "ci-1" } as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      headers: { authorization: "Bearer test" },
      payload: { name: "Rent", amount: 1200, subcategoryId: "sub-1", dueDate: "2026-01-01" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("POST /api/waterfall/yearly sends valid payload with subcategoryId and dueDate", async () => {
    waterfallServiceMock.createYearly.mockResolvedValue({ id: "ci-2" } as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/yearly",
      headers: { authorization: "Bearer test" },
      payload: { name: "Insurance", amount: 600, subcategoryId: "sub-1", dueDate: "2026-03-15" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("POST /api/waterfall/discretionary sends amount (not monthlyBudget)", async () => {
    waterfallServiceMock.createDiscretionary.mockResolvedValue({ id: "di-1" } as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/discretionary",
      headers: { authorization: "Bearer test" },
      payload: { name: "Groceries", amount: 400, subcategoryId: "sub-food" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("POST /api/waterfall/savings sends amount (not monthlyAmount)", async () => {
    waterfallServiceMock.createSavings.mockResolvedValue({ id: "di-2" } as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/savings",
      headers: { authorization: "Bearer test" },
      payload: { name: "Emergency Fund", amount: 200, subcategoryId: "sub-savings" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for invalid tier", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/subcategories/surplus",
      headers: { authorization: "Bearer test" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/waterfall/financial-summary", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/financial-summary",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with financial summary shape", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/financial-summary",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current).toBeDefined();
    expect(body.sparklines).toBeDefined();
    expect(snapshotServiceMock.getFinancialSummary.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("POST /api/waterfall/income — auto-snapshot hook", () => {
  it("triggers ensureTodayAutoSnapshot after a successful mutation", async () => {
    snapshotServiceMock.ensureTodayAutoSnapshot.mockClear();
    waterfallServiceMock.createIncome.mockResolvedValue(mockIncomeSource as any);
    await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Salary",
        amount: 5000,
        frequency: "monthly",
        subcategoryId: "sub-1",
        dueDate: "2026-01-01",
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(snapshotServiceMock.ensureTodayAutoSnapshot.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("POST /api/waterfall/income — baseline snapshot pre-handler", () => {
  it("triggers ensureBaselineSnapshot before the mutation handler", async () => {
    snapshotServiceMock.ensureBaselineSnapshot.mockClear();
    waterfallServiceMock.createIncome.mockResolvedValue(mockIncomeSource as any);
    await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Salary",
        amount: 5000,
        frequency: "monthly",
        subcategoryId: "sub-1",
        dueDate: "2026-01-01",
      },
    });
    expect(snapshotServiceMock.ensureBaselineSnapshot.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("PUT /api/waterfall/subcategories/:tier", () => {
  it("saves subcategories for a valid tier", async () => {
    subcategoryServiceMock.batchSave.mockResolvedValue(undefined as any);
    subcategoryServiceMock.listByTier.mockResolvedValue([
      { id: "sub-1", name: "Salary", sortOrder: 0 },
      { id: "sub-2", name: "Other", sortOrder: 1 },
    ] as any);

    const res = await app.inject({
      method: "PUT",
      url: "/api/waterfall/subcategories/income",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        subcategories: [
          { id: "sub-1", name: "Employment", sortOrder: 0 },
          { id: "sub-2", name: "Other", sortOrder: 1 },
        ],
        reassignments: [],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(subcategoryServiceMock.batchSave).toHaveBeenCalledWith("hh-1", "income", {
      subcategories: [
        { id: "sub-1", name: "Employment", sortOrder: 0 },
        { id: "sub-2", name: "Other", sortOrder: 1 },
      ],
      reassignments: [],
    });
  });

  it("returns 400 for invalid tier", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/waterfall/subcategories/surplus",
      headers: { authorization: "Bearer valid-token" },
      payload: { subcategories: [], reassignments: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/waterfall/subcategories/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { subcategories: "not-an-array" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/waterfall/subcategories/:tier/counts", () => {
  it("returns item counts for a tier", async () => {
    subcategoryServiceMock.getItemCounts.mockResolvedValue({
      "sub-1": 3,
      "sub-2": 1,
    } as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/subcategories/income/counts",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ "sub-1": 3, "sub-2": 1 });
  });

  it("returns 400 for invalid tier", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/subcategories/surplus/counts",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/waterfall/subcategories/:tier", () => {
  it("creates a new subcategory with unlocked/non-default flags", async () => {
    subcategoryServiceMock.create.mockResolvedValue({
      id: "sub-new",
      householdId: "hh-1",
      tier: "committed",
      name: "Subscriptions",
      sortOrder: 7,
      isLocked: false,
      isDefault: false,
      lockedByPlanner: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/committed",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Subscriptions" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Subscriptions");
    expect(body.tier).toBe("committed");
    expect(body.isLocked).toBe(false);
    expect(body.isDefault).toBe(false);
    expect(body.householdId).toBe("hh-1");
  });

  it("rejects duplicate names in same tier with 409", async () => {
    const dupErr = new ConflictError("A subcategory with that name already exists");
    subcategoryServiceMock.create.mockRejectedValue(dupErr);

    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/committed",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Subscriptions" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/income",
      payload: { name: "Foo" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid tier with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/surplus",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Foo" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects blank name with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "  " },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/waterfall/subcategories/reset", () => {
  it("resets subcategories to defaults", async () => {
    subcategoryServiceMock.resetToDefaults.mockResolvedValue(undefined as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/reset",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        reassignments: [{ fromSubcategoryId: "sub-custom", toSubcategoryId: "sub-other" }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(subcategoryServiceMock.resetToDefaults).toHaveBeenCalledWith("hh-1", {
      reassignments: [{ fromSubcategoryId: "sub-custom", toSubcategoryId: "sub-other" }],
    });
  });

  it("returns 400 for invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/reset",
      headers: { authorization: "Bearer valid-token" },
      payload: { reassignments: "not-an-array" },
    });

    expect(res.statusCode).toBe(400);
  });
});
