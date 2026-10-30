import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import Fastify from "fastify";

const giftsServiceMock = {
  getPlannerState: mock(() =>
    Promise.resolve({
      mode: "synced",
      year: 2026,
      isReadOnly: false,
      budget: {
        annualBudget: 0,
        planned: 0,
        spent: 0,
        plannedOverBudgetBy: 0,
        spentOverBudgetBy: 0,
      },
      people: [],
      rolloverPending: false,
    })
  ),
  getPersonDetail: mock(() => Promise.resolve({ person: {} as any, allocations: [] })),
  getUpcoming: mock(() =>
    Promise.resolve({
      callouts: {
        thisMonth: { count: 0, total: 0 },
        nextThreeMonths: { count: 0, total: 0 },
        restOfYear: { count: 0, total: 0 },
        dateless: { count: 0, total: 0 },
      },
      groups: [],
    })
  ),
  listPeopleForConfig: mock(() => Promise.resolve([])),
  listEventsForConfig: mock(() => Promise.resolve([])),
  listYearsWithData: mock(() => Promise.resolve([2026])),
  createPerson: mock(() => Promise.resolve({ id: "p1" })),
  updatePerson: mock(() => Promise.resolve({ id: "p1" })),
  deletePerson: mock(() => Promise.resolve()),
  createEvent: mock(() => Promise.resolve({ id: "e1" })),
  updateEvent: mock(() => Promise.resolve({ id: "e1" })),
  deleteEvent: mock(() => Promise.resolve()),
  upsertAllocation: mock(() => Promise.resolve({ id: "a1" })),
  bulkUpsertAllocations: mock(() => Promise.resolve({ count: 0 })),
  setAnnualBudget: mock(() => Promise.resolve({ annualBudget: 1000 })),
  setMode: mock(() => Promise.resolve({ mode: "synced" })),
  dismissRolloverNotification: mock(() => Promise.resolve()),
  runRolloverIfNeeded: mock(() => Promise.resolve(false)),
  seedLockedEventsIfMissing: mock(() => Promise.resolve()),
  getOrCreateSettings: mock(() =>
    Promise.resolve({ mode: "synced", syncedDiscretionaryItemId: null })
  ),
};

mock.module("../services/gifts.service.js", () => ({ giftsService: giftsServiceMock }));
mock.module("../middleware/auth.middleware.js", () => ({
  authMiddleware: async (req: any) => {
    req.householdId = "hh-1";
    req.user = { userId: "user-1", email: "test@test.com", name: "User", role: "admin" };
  },
}));
mock.module("../lib/actor-ctx.js", () => ({
  actorCtx: () => ({ householdId: "hh-1", actorId: "user-1", actorName: "User" }),
}));

const { giftsRoutes } = await import("./gifts.routes.js");
const { errorHandler } = await import("../middleware/errorHandler.js");

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(giftsRoutes, { prefix: "/api/gifts" });
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(giftsServiceMock)) (fn as any).mockClear?.();
});

describe("gifts.routes", () => {
  it("GET /settings returns mode and syncedDiscretionaryItemId", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/gifts/settings" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mode: "synced", syncedDiscretionaryItemId: null });
    expect(giftsServiceMock.getOrCreateSettings).toHaveBeenCalledWith("hh-1");
  });

  it("GET /state delegates to getPlannerState with current year by default", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/gifts/state" });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.getPlannerState).toHaveBeenCalledWith(
      "hh-1",
      new Date().getFullYear(),
      "user-1"
    );
  });

  it("PUT /budget/:year forwards body", async () => {
    const app = await buildApp();
    const year = new Date().getFullYear();
    const res = await app.inject({
      method: "PUT",
      url: `/api/gifts/budget/${year}`,
      payload: { annualBudget: 1500 },
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.setAnnualBudget).toHaveBeenCalledWith("hh-1", year, {
      annualBudget: 1500,
    });
  });

  it("PUT /allocations/:personId/:eventId/:year upserts allocation", async () => {
    const app = await buildApp();
    const year = new Date().getFullYear();
    const res = await app.inject({
      method: "PUT",
      url: `/api/gifts/allocations/p1/e1/${year}`,
      payload: { planned: 50 },
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.upsertAllocation).toHaveBeenCalledWith("hh-1", "p1", "e1", year, {
      planned: 50,
    });
  });

  it("POST /allocations/bulk forwards cells", async () => {
    const app = await buildApp();
    const year = new Date().getFullYear();
    const res = await app.inject({
      method: "POST",
      url: "/api/gifts/allocations/bulk",
      payload: { cells: [{ personId: "p1", eventId: "e1", year, planned: 10 }] },
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.bulkUpsertAllocations).toHaveBeenCalled();
  });

  it("PUT /mode forwards mode", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/gifts/mode",
      payload: { mode: "independent" },
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.setMode).toHaveBeenCalled();
  });

  it("GET /people/:id returns 400 for a malformed (over-length) id", async () => {
    const app = await buildApp();
    const oversized = "x".repeat(65);
    const res = await app.inject({ method: "GET", url: `/api/gifts/people/${oversized}` });
    expect(res.statusCode).toBe(400);
    expect(giftsServiceMock.getPersonDetail).not.toHaveBeenCalled();
  });

  it("PATCH /people/:id returns 400 for a malformed (over-length) id", async () => {
    const app = await buildApp();
    const oversized = "x".repeat(65);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/gifts/people/${oversized}`,
      payload: { name: "New" },
    });
    expect(res.statusCode).toBe(400);
    expect(giftsServiceMock.updatePerson).not.toHaveBeenCalled();
  });

  it("GET /config/people returns 400 for an invalid filter value", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/gifts/config/people?filter=bogus",
    });
    expect(res.statusCode).toBe(400);
    expect(giftsServiceMock.listPeopleForConfig).not.toHaveBeenCalled();
  });

  it("GET /config/people accepts a valid filter value", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/gifts/config/people?filter=household",
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.listPeopleForConfig).toHaveBeenCalledWith(
      "hh-1",
      "household",
      new Date().getFullYear()
    );
  });
});
