import { describe, it, expect, beforeEach, mock } from "bun:test";
import Fastify from "fastify";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { errorHandler } from "../middleware/errorHandler";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));
mock.module("../config/database", () => ({ prisma: prismaMock }));

mock.module("../middleware/auth.middleware.js", () => ({
  authMiddleware: async (req: any) => {
    req.householdId = "hh-1";
    req.userId = "u-1";
    req.user = { userId: "u-1", email: "test@test.com" };
  },
}));
mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: async (req: any) => {
    req.householdId = "hh-1";
    req.userId = "u-1";
    req.user = { userId: "u-1", email: "test@test.com" };
  },
}));

mock.module("../lib/actor-ctx.js", () => ({
  actorCtx: () => ({
    householdId: "hh-1",
    actorId: "u-1",
    actorName: undefined,
    ipAddress: undefined,
    userAgent: undefined,
  }),
}));
mock.module("../lib/actor-ctx", () => ({
  actorCtx: () => ({
    householdId: "hh-1",
    actorId: "u-1",
    actorName: undefined,
    ipAddress: undefined,
    userAgent: undefined,
  }),
}));

// Audit service is called from cashflowService.updateAccountCashflowLink when ctx provided.
mock.module("../services/audit.service.js", () => ({
  audited: async ({ mutation }: any) => mutation(prismaMock),
  auditEventTx: async (tx: any, entry: any) => tx.auditLog.create({ data: entry }),
  computeDiff: () => [],
}));
mock.module("../services/audit.service", () => ({
  audited: async ({ mutation }: any) => mutation(prismaMock),
  auditEventTx: async (tx: any, entry: any) => tx.auditLog.create({ data: entry }),
  computeDiff: () => [],
}));

const { cashflowRoutes } = await import("./cashflow.routes.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  await app.register(cashflowRoutes, { prefix: "/api/cashflow" });
  await app.ready();
  return app;
}

beforeEach(() => resetPrismaMocks());

describe("GET /api/cashflow/projection", () => {
  it("returns projection for default 12 months", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/cashflow/projection" });
    expect(res.statusCode).toBe(200);
    expect(res.json().months).toHaveLength(12);
  });

  it("validates monthCount bounds", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/cashflow/projection?monthCount=99",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/cashflow/month", () => {
  it("returns month detail for valid year/month", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);

    const app = await buildApp();
    const now = new Date();
    const res = await app.inject({
      method: "GET",
      url: `/api/cashflow/month?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("dailyTrace");
  });
});

describe("GET /api/cashflow/linkable-accounts", () => {
  it("returns array of linkable accounts", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/cashflow/linkable-accounts" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe("PATCH /api/cashflow/linkable-accounts/:id", () => {
  it("updates a single account's isCashflowLinked", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: "a1",
      householdId: "hh-1",
      type: "Current",
      isCashflowLinked: false,
    } as any);
    prismaMock.account.update.mockResolvedValue({ id: "a1", isCashflowLinked: true } as any);

    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/cashflow/linkable-accounts/a1",
      payload: { isCashflowLinked: true },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/cashflow/linkable-accounts/bulk", () => {
  it("updates multiple accounts in one request", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "a1", householdId: "hh-1", type: "Current", name: "Main" },
      { id: "a2", householdId: "hh-1", type: "Savings", name: "Saver" },
    ] as any);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.account.update.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/cashflow/linkable-accounts/bulk",
      payload: {
        updates: [
          { accountId: "a1", isCashflowLinked: true },
          { accountId: "a2", isCashflowLinked: false },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /api/cashflow/shortfall", () => {
  it("returns shortfall payload for authenticated user", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/cashflow/shortfall?windowDays=30",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("balanceToday");
    expect(body).toHaveProperty("lowest");
    expect(body).toHaveProperty("linkedAccountCount");
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("rejects windowDays > 90", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/cashflow/shortfall?windowDays=120",
    });
    expect(res.statusCode).toBe(400);
  });
});
