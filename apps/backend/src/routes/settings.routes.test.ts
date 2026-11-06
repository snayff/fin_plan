import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const settingsServiceMock = {
  getSettings: mock(() => Promise.resolve(null)),
  updateSettings: mock(() => Promise.resolve(null)),
};

mock.module("../services/settings.service", () => ({
  settingsService: settingsServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

// The growth-rate gate reads the caller's role from request.user (attached by
// the auth middleware), so the middleware mock supplies it directly.
let callerRole = "owner";

import { authMiddleware } from "../middleware/auth.middleware";
import { settingsRoutes } from "./settings.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockSettings = {
  id: "s-1",
  householdId: "hh-1",
  surplusBenchmarkPct: 10,
  isaAnnualLimit: 20000,
  isaYearStartMonth: 4,
  isaYearStartDay: 6,
  stalenessThresholds: {},
};

beforeEach(() => {
  for (const method of Object.values(settingsServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  settingsServiceMock.getSettings.mockResolvedValue(mockSettings as any);
  settingsServiceMock.updateSettings.mockResolvedValue(mockSettings as any);

  callerRole = "owner";

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com", role: callerRole };
    request.householdId = "hh-1";
  });
});

describe("GET /api/settings", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with settings when authenticated", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().surplusBenchmarkPct).toBe(10);
  });
});

describe("PATCH /api/settings", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { surplusBenchmarkPct: 15 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with updated settings", async () => {
    const updated = { ...mockSettings, surplusBenchmarkPct: 15 };
    settingsServiceMock.updateSettings.mockResolvedValue(updated as any);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { surplusBenchmarkPct: 15 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().surplusBenchmarkPct).toBe(15);
  });

  it("returns 400 for invalid surplusBenchmarkPct", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { surplusBenchmarkPct: 200 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/settings — growth rate role gate", () => {
  it("allows owner to update growth rate fields", async () => {
    callerRole = "owner";
    const updated = { ...mockSettings, savingsRatePct: 5 };
    settingsServiceMock.updateSettings.mockResolvedValue(updated as any);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { savingsRatePct: 5 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("allows admin to update growth rate fields", async () => {
    callerRole = "admin";
    const updated = { ...mockSettings, investmentRatePct: 7 };
    settingsServiceMock.updateSettings.mockResolvedValue(updated as any);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { investmentRatePct: 7 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("allows owner to update currentRatePct", async () => {
    callerRole = "owner";
    const updated = { ...mockSettings, currentRatePct: 1.5 };
    settingsServiceMock.updateSettings.mockResolvedValue(updated as any);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { currentRatePct: 1.5 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects member role from setting currentRatePct", async () => {
    callerRole = "member";

    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { currentRatePct: 1.5 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects member role from setting growth rate fields", async () => {
    callerRole = "member";

    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { savingsRatePct: 5 },
    });
    expect(res.statusCode).toBe(403);
  });

  it.each(["propertyRatePct", "vehicleRatePct", "otherAssetRatePct"] as const)(
    "rejects member role from setting %s",
    async (field) => {
      callerRole = "member";

      const res = await app.inject({
        method: "PATCH",
        url: "/api/settings",
        headers: { authorization: "Bearer valid-token" },
        payload: { [field]: 4 },
      });
      expect(res.statusCode).toBe(403);
    }
  );

  it("allows member to update non-growth-rate fields", async () => {
    callerRole = "member";
    const updated = { ...mockSettings, surplusBenchmarkPct: 15 };
    settingsServiceMock.updateSettings.mockResolvedValue(updated as any);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { surplusBenchmarkPct: 15 },
    });
    expect(res.statusCode).toBe(200);
  });
});
