import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const plannerServiceMock = {
  listPurchases: mock(() => Promise.resolve([])),
  createPurchase: mock(() => Promise.resolve(null)),
  updatePurchase: mock(() => Promise.resolve(null)),
  deletePurchase: mock(() => Promise.resolve()),
  getYearBudget: mock(() => Promise.resolve(null)),
  upsertYearBudget: mock(() => Promise.resolve(null)),
};

mock.module("../services/planner.service", () => ({
  plannerService: plannerServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { plannerRoutes } from "./planner.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(plannerRoutes, { prefix: "/api/planner" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockPurchase = {
  id: "pur-1",
  householdId: "hh-1",
  name: "New Laptop",
  estimatedCost: 1200,
  priority: "medium",
  scheduledThisYear: false,
  fundingSources: [],
  fundingAccountId: null,
  status: "not_started",
  reason: null,
  comment: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockYearBudget = {
  id: "yb-1",
  householdId: "hh-1",
  year: 2026,
  purchaseBudget: 5000,
  giftBudget: 1000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  for (const method of Object.values(plannerServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }

  plannerServiceMock.listPurchases.mockResolvedValue([mockPurchase] as any);
  plannerServiceMock.createPurchase.mockResolvedValue(mockPurchase as any);
  plannerServiceMock.updatePurchase.mockResolvedValue(mockPurchase as any);
  plannerServiceMock.deletePurchase.mockResolvedValue(undefined);
  plannerServiceMock.getYearBudget.mockResolvedValue(mockYearBudget as any);
  plannerServiceMock.upsertYearBudget.mockResolvedValue(mockYearBudget as any);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

// ─── Purchases ────────────────────────────────────────────────────────────────

describe("GET /api/planner/purchases", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/planner/purchases" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with purchases", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/planner/purchases",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    expect(res.json()).toHaveLength(1);
  });
});

describe("POST /api/planner/purchases", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/planner/purchases",
      payload: { name: "New Laptop", estimatedCost: 1200 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created purchase", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/planner/purchases",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "New Laptop", estimatedCost: 1200 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("New Laptop");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/planner/purchases",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "New Laptop" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/planner/purchases/:id", () => {
  it("returns 200 with updated purchase", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/planner/purchases/pur-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Renamed Laptop" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("pur-1");
  });
});

describe("DELETE /api/planner/purchases/:id", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/planner/purchases/pur-1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 when deleting", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/planner/purchases/pur-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(204);
  });
});

// ─── Year budget ──────────────────────────────────────────────────────────────

describe("GET /api/planner/budget/:year", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/planner/budget/2026" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with budget", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/planner/budget/2026",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().year).toBe(2026);
  });

  it("returns 400 for a non-numeric year (#134)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/planner/budget/NaN",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(400);
    expect(plannerServiceMock.getYearBudget).not.toHaveBeenCalled();
  });

  it("returns 400 for an out-of-range year (#134)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/planner/budget/999999999",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(400);
    expect(plannerServiceMock.getYearBudget).not.toHaveBeenCalled();
  });
});

describe("PUT /api/planner/budget/:year", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/planner/budget/2026",
      payload: { purchaseBudget: 5000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with upserted budget", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/planner/budget/2026",
      headers: { authorization: "Bearer valid-token" },
      payload: { purchaseBudget: 5000, giftBudget: 1000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().purchaseBudget).toBe(5000);
  });
});
