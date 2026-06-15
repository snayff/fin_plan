import { describe, it, expect, beforeEach, mock } from "bun:test";
import Fastify from "fastify";
import { buildTestApp } from "../test/helpers/fastify.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { errorHandler } from "../middleware/errorHandler.js";

const mockAssetsService = {
  getSummary: mock(() => Promise.resolve({ assetTotals: {}, accountTotals: {}, grandTotal: 0 })),
  listAssetsByType: mock(() => Promise.resolve([])),
  createAsset: mock(() => Promise.resolve({ id: "a-1", name: "Test", type: "Property" })),
  updateAsset: mock(() => Promise.resolve({ id: "a-1", name: "Updated" })),
  deleteAsset: mock(() => Promise.resolve({ id: "a-1" })),
  recordAssetBalance: mock(() => Promise.resolve({ id: "b-1", value: 100 })),
  confirmAsset: mock(() => Promise.resolve({ id: "a-1" })),
  listAccountsByType: mock(() => Promise.resolve([])),
  createAccount: mock(() => Promise.resolve({ id: "ac-1", name: "SIPP", type: "Pension" })),
  updateAccount: mock(() => Promise.resolve({ id: "ac-1", name: "Updated" })),
  deleteAccount: mock(() => Promise.resolve({ id: "ac-1" })),
  recordAccountBalance: mock(() => Promise.resolve({ id: "b-1", value: 500 })),
  confirmAccount: mock(() => Promise.resolve({ id: "ac-1" })),
  getIsaAllowanceSummary: mock(() =>
    Promise.resolve({
      annualLimit: 20000,
      byMember: [],
    })
  ),
};

const mockAuthMiddleware = mock(async (req: any) => {
  req.user = { userId: "user-1", email: "test@test.com", name: "Test User" };
  req.householdId = "hh-1";
});

mock.module("../services/assets.service.js", () => ({ assetsService: mockAssetsService }));
mock.module("../middleware/auth.middleware.js", () => ({
  authMiddleware: mockAuthMiddleware,
}));
mock.module("../lib/actor-ctx.js", () => ({
  actorCtx: mock(() => ({
    householdId: "hh-1",
    actorId: "user-1",
    actorName: "Test",
    ipAddress: "127.0.0.1",
    userAgent: "test",
  })),
}));

const { assetsRoutes } = await import("./assets.routes.js");

beforeEach(() => {
  Object.values(mockAssetsService).forEach((m) => (m as ReturnType<typeof mock>).mockClear());
});

describe("GET /api/assets/summary", () => {
  it("returns 200 with summary", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/assets/summary" });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.getSummary).toHaveBeenCalledWith("hh-1");
  });
});

describe("GET /api/assets/assets/:type", () => {
  it("returns 200 with items for type", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/assets/assets/Property" });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.listAssetsByType).toHaveBeenCalledWith("hh-1", "Property", {
      includeDisposed: false,
    });
  });

  it("includes disposed when disposed=true", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/assets/assets/Property?disposed=true",
    });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.listAssetsByType).toHaveBeenCalledWith("hh-1", "Property", {
      includeDisposed: true,
    });
  });

  it("rejects a non-boolean disposed value with 400", async () => {
    const app = await buildTestApp();
    app.setErrorHandler(errorHandler);
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/assets/assets/Property?disposed=yes",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/assets/assets", () => {
  it("creates asset and returns 201", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/assets/assets",
      payload: { name: "Test", type: "Property" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAssetsService.createAsset).toHaveBeenCalled();
  });
});

describe("POST /api/assets/assets/:assetId/balance", () => {
  it("records balance and returns 201", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/assets/assets/a-1/balance",
      payload: { value: 190000, date: "2026-03-30" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAssetsService.recordAssetBalance).toHaveBeenCalledWith(
      "hh-1",
      "a-1",
      expect.objectContaining({ value: 190000 }),
      expect.any(Object)
    );
  });
});

describe("POST /api/assets/accounts", () => {
  it("creates account with initialValue and forwards to service", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/assets/accounts",
      payload: { name: "HSBC Current", type: "Current", initialValue: 1500 },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAssetsService.createAccount).toHaveBeenCalledWith(
      "hh-1",
      expect.objectContaining({ name: "HSBC Current", type: "Current", initialValue: 1500 }),
      expect.any(Object)
    );
  });
});

describe("GET /api/assets/accounts/:type", () => {
  it("returns 200 with accounts for type", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/assets/accounts/Pension" });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.listAccountsByType).toHaveBeenCalledWith("hh-1", "Pension", {
      includeDisposed: false,
    });
  });

  it("includes disposed when disposed=true", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/assets/accounts/Pension?disposed=true",
    });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.listAccountsByType).toHaveBeenCalledWith("hh-1", "Pension", {
      includeDisposed: true,
    });
  });

  it("rejects a non-boolean disposed value with 400", async () => {
    const app = await buildTestApp();
    app.setErrorHandler(errorHandler);
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/assets/accounts/Pension?disposed=yes",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/assets/assets/:assetId", () => {
  it("deletes asset and returns 200", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "DELETE", url: "/api/assets/assets/a-1" });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.deleteAsset).toHaveBeenCalledWith("hh-1", "a-1", expect.any(Object));
  });
});

describe("PATCH /api/assets/accounts/:id — monthlyContributionLimit guard", () => {
  it("returns 400 when service rejects a non-null limit on a non-Savings account", async () => {
    mockAssetsService.updateAccount.mockImplementationOnce(() => {
      throw new ValidationError("monthlyContributionLimit is only valid on Savings accounts");
    });
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "PATCH",
      url: "/api/assets/accounts/ac-1",
      payload: { monthlyContributionLimit: 200 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 when setting a limit on a Savings account", async () => {
    mockAssetsService.updateAccount.mockResolvedValueOnce({
      id: "ac-1",
      type: "Savings",
      monthlyContributionLimit: 200,
    } as any);
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "PATCH",
      url: "/api/assets/accounts/ac-1",
      payload: { monthlyContributionLimit: 200 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().monthlyContributionLimit).toBe(200);
  });
});

describe("GET /api/assets/accounts/isa-allowance", () => {
  it("returns 401 without JWT", async () => {
    mockAuthMiddleware.mockImplementationOnce(async () => {
      throw new AuthenticationError("No authorization token provided");
    });
    const app = await buildTestApp();
    app.setErrorHandler(errorHandler);
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/assets/accounts/isa-allowance" });
    expect(res.statusCode).toBe(401);
  });

  it("returns the household's ISA allowance summary", async () => {
    mockAssetsService.getIsaAllowanceSummary.mockResolvedValueOnce({
      annualLimit: 20000,
      byMember: [{ memberId: "m-1", memberName: "Alice", contributed: 5000, remaining: 15000 }],
    } as any);
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/assets/accounts/isa-allowance",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("annualLimit", 20000);
    expect(body).toHaveProperty("byMember");
    expect(Array.isArray(body.byMember)).toBe(true);
    expect(mockAssetsService.getIsaAllowanceSummary).toHaveBeenCalledWith("hh-1");
  });

  it("only passes the middleware-scoped householdId to the service", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    await app.inject({
      method: "GET",
      url: "/api/assets/accounts/isa-allowance",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(mockAssetsService.getIsaAllowanceSummary).toHaveBeenCalledWith("hh-1");
  });
});
