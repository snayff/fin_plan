import { describe, it, expect, beforeEach, mock } from "bun:test";

// Single apiClient mock shared by every thin service wrapper below. Each test
// asserts the wrapper targets the right verb + URL (+ payload where it matters),
// mirroring services/household.service.endpoints.test.ts.
const api = {
  get: mock(() => Promise.resolve({} as any)),
  post: mock(() => Promise.resolve({} as any)),
  put: mock(() => Promise.resolve({} as any)),
  patch: mock(() => Promise.resolve({} as any)),
  delete: mock(() => Promise.resolve({} as any)),
};
mock.module("@/lib/api", () => ({ apiClient: api }));

const { waterfallService } = await import("./waterfall.service");
const { assetsApiService, getIsaAllowance } = await import("./assets.service");
const { giftsApi } = await import("./gifts.service");
const { plannerService } = await import("./planner.service");
const { cashflowService } = await import("./cashflow.service");
const { forecastService } = await import("./forecast.service");
const { settingsService } = await import("./settings.service");
const { snapshotService } = await import("./snapshot.service");
const { reviewSessionService } = await import("./review-session.service");
const { fetchAuditLog, updateMemberRole } = await import("./auditLog.service");
const { fetchSecurityActivity } = await import("./securityActivity.service");

beforeEach(() => {
  api.get.mockClear();
  api.post.mockClear();
  api.put.mockClear();
  api.patch.mockClear();
  api.delete.mockClear();
});

describe("waterfallService endpoints", () => {
  it("income endpoints", () => {
    waterfallService.getSummary();
    expect(api.get).toHaveBeenCalledWith("/api/waterfall");
    waterfallService.listIncome();
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/income");
    waterfallService.createIncome({ name: "Pay" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/income", { name: "Pay" });
    waterfallService.updateIncome("i1", { name: "Pay2" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/waterfall/income/i1", { name: "Pay2" });
    waterfallService.deleteIncome("i1");
    expect(api.delete).toHaveBeenCalledWith("/api/waterfall/income/i1");
    waterfallService.confirmIncome("i1");
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/income/i1/confirm");
  });

  it("committed + yearly endpoints", () => {
    waterfallService.listCommitted();
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/committed");
    waterfallService.createCommitted({ name: "Rent" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/committed", { name: "Rent" });
    waterfallService.updateCommitted("c1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/waterfall/committed/c1", { name: "x" });
    waterfallService.deleteCommitted("c1");
    expect(api.delete).toHaveBeenCalledWith("/api/waterfall/committed/c1");
    waterfallService.confirmCommitted("c1");
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/committed/c1/confirm");

    waterfallService.listYearly();
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/yearly");
    waterfallService.createYearly({ name: "Insurance" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/yearly", { name: "Insurance" });
    waterfallService.updateYearly("y1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/waterfall/yearly/y1", { name: "x" });
    waterfallService.deleteYearly("y1");
    expect(api.delete).toHaveBeenCalledWith("/api/waterfall/yearly/y1");
    waterfallService.confirmYearly("y1");
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/yearly/y1/confirm");
  });

  it("discretionary + savings endpoints", () => {
    waterfallService.listDiscretionary();
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/discretionary");
    waterfallService.createDiscretionary({ name: "Food" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/discretionary", { name: "Food" });
    waterfallService.updateDiscretionary("d1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/waterfall/discretionary/d1", { name: "x" });
    waterfallService.deleteDiscretionary("d1");
    expect(api.delete).toHaveBeenCalledWith("/api/waterfall/discretionary/d1");
    waterfallService.confirmDiscretionary("d1");
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/discretionary/d1/confirm");

    waterfallService.listSavings();
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/savings");
    waterfallService.createSavings({ name: "Pot" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/savings", { name: "Pot" });
    waterfallService.updateSavings("s1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/waterfall/savings/s1", { name: "x" });
    waterfallService.deleteSavings("s1");
    expect(api.delete).toHaveBeenCalledWith("/api/waterfall/savings/s1");
    waterfallService.confirmSavings("s1");
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/savings/s1/confirm");
  });

  it("history, batch, subcategory, period, budget endpoints", () => {
    waterfallService.getHistory("income_source", "i1");
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/history/income_source/i1");
    waterfallService.confirmBatch({ items: [] } as any);
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/confirm-batch", { items: [] });
    waterfallService.deleteAll();
    expect(api.delete).toHaveBeenCalledWith("/api/waterfall/all", { confirm: true });

    waterfallService.getSubcategories("income");
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/subcategories/income");
    waterfallService.getSubcategoryCounts("committed");
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/subcategories/committed/counts");
    waterfallService.createSubcategory("discretionary", "Fun");
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/subcategories/discretionary", {
      name: "Fun",
    });
    waterfallService.saveSubcategories("income", { subcategories: [] } as any);
    expect(api.put).toHaveBeenCalledWith("/api/waterfall/subcategories/income", {
      subcategories: [],
    });
    waterfallService.resetSubcategories({ tier: "income" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/subcategories/reset", { tier: "income" });

    waterfallService.getYearBudget(2026);
    expect(api.get).toHaveBeenCalledWith("/api/planner/budget/2026");
    waterfallService.upsertYearBudget(2026, { giftBudget: 1 } as any);
    expect(api.put).toHaveBeenCalledWith("/api/planner/budget/2026", { giftBudget: 1 });
    waterfallService.getFinancialSummary();
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/financial-summary");

    waterfallService.listPeriods("income_source", "i1");
    expect(api.get).toHaveBeenCalledWith("/api/waterfall/periods/income_source/i1");
    waterfallService.createPeriod({ amount: 1 } as any);
    expect(api.post).toHaveBeenCalledWith("/api/waterfall/periods", { amount: 1 });
    waterfallService.updatePeriod("p1", { amount: 2 } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/waterfall/periods/p1", { amount: 2 });
    waterfallService.deletePeriod("p1");
    expect(api.delete).toHaveBeenCalledWith("/api/waterfall/periods/p1");
  });
});

describe("assetsApiService endpoints", () => {
  it("asset endpoints (incl. disposed query)", () => {
    assetsApiService.getSummary();
    expect(api.get).toHaveBeenCalledWith("/api/assets/summary");
    assetsApiService.listAssetsByType("Property");
    expect(api.get).toHaveBeenCalledWith("/api/assets/assets/Property");
    assetsApiService.listAssetsByType("Vehicle", { includeDisposed: true });
    expect(api.get).toHaveBeenCalledWith("/api/assets/assets/Vehicle?disposed=true");
    assetsApiService.createAsset({ name: "House" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/assets/assets", { name: "House" });
    assetsApiService.updateAsset("a1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/assets/assets/a1", { name: "x" });
    assetsApiService.deleteAsset("a1");
    expect(api.delete).toHaveBeenCalledWith("/api/assets/assets/a1");
    assetsApiService.recordAssetBalance("a1", { value: 1, date: "2026-01-01" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/assets/assets/a1/balance", {
      value: 1,
      date: "2026-01-01",
    });
    assetsApiService.confirmAsset("a1");
    expect(api.post).toHaveBeenCalledWith("/api/assets/assets/a1/confirm", {});
  });

  it("account endpoints + isa allowance", () => {
    assetsApiService.listAccountsByType("Savings");
    expect(api.get).toHaveBeenCalledWith("/api/assets/accounts/Savings");
    assetsApiService.listAccountsByType("Current", { includeDisposed: true });
    expect(api.get).toHaveBeenCalledWith("/api/assets/accounts/Current?disposed=true");
    assetsApiService.createAccount({ name: "ISA" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/assets/accounts", { name: "ISA" });
    assetsApiService.updateAccount("ac1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/assets/accounts/ac1", { name: "x" });
    assetsApiService.deleteAccount("ac1");
    expect(api.delete).toHaveBeenCalledWith("/api/assets/accounts/ac1");
    assetsApiService.recordAccountBalance("ac1", { value: 2, date: "2026-01-01" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/assets/accounts/ac1/balance", {
      value: 2,
      date: "2026-01-01",
    });
    assetsApiService.confirmAccount("ac1");
    expect(api.post).toHaveBeenCalledWith("/api/assets/accounts/ac1/confirm", {});
    getIsaAllowance();
    expect(api.get).toHaveBeenCalledWith("/api/assets/accounts/isa-allowance");
  });
});

describe("giftsApi endpoints", () => {
  it("query endpoints", () => {
    giftsApi.getState(2026);
    expect(api.get).toHaveBeenCalledWith("/api/gifts/state?year=2026");
    giftsApi.getSettings();
    expect(api.get).toHaveBeenCalledWith("/api/gifts/settings");
    giftsApi.getPerson("p1", 2026);
    expect(api.get).toHaveBeenCalledWith("/api/gifts/people/p1?year=2026");
    giftsApi.getUpcoming(2026);
    expect(api.get).toHaveBeenCalledWith("/api/gifts/upcoming?year=2026");
    giftsApi.listYears();
    expect(api.get).toHaveBeenCalledWith("/api/gifts/years");
    giftsApi.listConfigPeople("household", 2026);
    expect(api.get).toHaveBeenCalledWith("/api/gifts/config/people?filter=household&year=2026");
    giftsApi.listConfigEvents();
    expect(api.get).toHaveBeenCalledWith("/api/gifts/config/events");
    giftsApi.getQuickAddMatrix(2026);
    expect(api.get).toHaveBeenCalledWith("/api/gifts/config/quick-add-matrix?year=2026");
  });

  it("mutation endpoints", () => {
    giftsApi.createPerson({ name: "Mum" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/gifts/people", { name: "Mum" });
    giftsApi.updatePerson("p1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/gifts/people/p1", { name: "x" });
    giftsApi.deletePerson("p1");
    expect(api.delete).toHaveBeenCalledWith("/api/gifts/people/p1");
    giftsApi.createEvent({ name: "Bday" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/gifts/events", { name: "Bday" });
    giftsApi.updateEvent("e1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/gifts/events/e1", { name: "x" });
    giftsApi.deleteEvent("e1");
    expect(api.delete).toHaveBeenCalledWith("/api/gifts/events/e1");
    giftsApi.upsertAllocation("p1", "e1", 2026, { planned: 50 } as any);
    expect(api.put).toHaveBeenCalledWith("/api/gifts/allocations/p1/e1/2026", { planned: 50 });
    giftsApi.bulkUpsert({ allocations: [] } as any);
    expect(api.post).toHaveBeenCalledWith("/api/gifts/allocations/bulk", { allocations: [] });
    giftsApi.setBudget(2026, { annualBudget: 500 } as any);
    expect(api.put).toHaveBeenCalledWith("/api/gifts/budget/2026", { annualBudget: 500 });
    giftsApi.setMode({ mode: "synced" } as any);
    expect(api.put).toHaveBeenCalledWith("/api/gifts/mode", { mode: "synced" });
    giftsApi.dismissRollover(2026);
    expect(api.delete).toHaveBeenCalledWith("/api/gifts/rollover-banner/2026");
  });
});

describe("plannerService endpoints", () => {
  it("purchase endpoints", () => {
    plannerService.listPurchases(2026);
    expect(api.get).toHaveBeenCalledWith("/api/planner/purchases?year=2026");
    plannerService.createPurchase({ name: "TV" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/planner/purchases", { name: "TV" });
    plannerService.updatePurchase("pu1", { name: "x" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/planner/purchases/pu1", { name: "x" });
    plannerService.deletePurchase("pu1");
    expect(api.delete).toHaveBeenCalledWith("/api/planner/purchases/pu1");
  });
});

describe("cashflowService endpoints", () => {
  it("builds query strings and targets the right routes", () => {
    cashflowService.getProjection();
    expect(api.get).toHaveBeenCalledWith("/api/cashflow/projection?monthCount=12");
    cashflowService.getProjection({ startYear: 2026, startMonth: 3, monthCount: 6 });
    expect(api.get).toHaveBeenCalledWith(
      "/api/cashflow/projection?startYear=2026&startMonth=3&monthCount=6"
    );
    cashflowService.getMonthDetail(2026, 4);
    expect(api.get).toHaveBeenCalledWith("/api/cashflow/month?year=2026&month=4");
    cashflowService.listLinkableAccounts();
    expect(api.get).toHaveBeenCalledWith("/api/cashflow/linkable-accounts");
    cashflowService.updateLinkedAccount("ac1", true);
    expect(api.patch).toHaveBeenCalledWith("/api/cashflow/linkable-accounts/ac1", {
      isCashflowLinked: true,
    });
    cashflowService.bulkUpdateLinkedAccounts({ accounts: [] } as any);
    expect(api.post).toHaveBeenCalledWith("/api/cashflow/linkable-accounts/bulk", { accounts: [] });
    cashflowService.getShortfall();
    expect(api.get).toHaveBeenCalledWith("/api/cashflow/shortfall?windowDays=30");
    cashflowService.getShortfall({ windowDays: 7 });
    expect(api.get).toHaveBeenCalledWith("/api/cashflow/shortfall?windowDays=7");
  });
});

describe("misc service endpoints", () => {
  it("forecastService", () => {
    forecastService.getProjections(10 as any);
    expect(api.get).toHaveBeenCalledWith("/api/forecast?horizonYears=10");
  });

  it("settingsService", () => {
    settingsService.getSettings();
    expect(api.get).toHaveBeenCalledWith("/api/settings");
    settingsService.updateSettings({ showPence: true } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/settings", { showPence: true });
    settingsService.dismissWaterfallTip();
    expect(api.patch).toHaveBeenCalledWith("/api/settings", { waterfallTipDismissed: true });
  });

  it("snapshotService", () => {
    snapshotService.listSnapshots();
    expect(api.get).toHaveBeenCalledWith("/api/snapshots");
    snapshotService.getSnapshot("sn1");
    expect(api.get).toHaveBeenCalledWith("/api/snapshots/sn1");
    snapshotService.createSnapshot({ label: "x" } as any);
    expect(api.post).toHaveBeenCalledWith("/api/snapshots", { label: "x" });
    snapshotService.renameSnapshot("sn1", { label: "y" } as any);
    expect(api.patch).toHaveBeenCalledWith("/api/snapshots/sn1", { label: "y" });
    snapshotService.deleteSnapshot("sn1");
    expect(api.delete).toHaveBeenCalledWith("/api/snapshots/sn1");
  });

  it("reviewSessionService", () => {
    reviewSessionService.getSession();
    expect(api.get).toHaveBeenCalledWith("/api/review-session");
    reviewSessionService.createSession();
    expect(api.post).toHaveBeenCalledWith("/api/review-session", {});
    reviewSessionService.updateSession({ currentStep: 2 });
    expect(api.patch).toHaveBeenCalledWith("/api/review-session", { currentStep: 2 });
    reviewSessionService.deleteSession();
    expect(api.delete).toHaveBeenCalledWith("/api/review-session");
  });

  it("auditLog service builds filtered query strings", () => {
    fetchAuditLog({});
    expect(api.get).toHaveBeenCalledWith("/api/audit-log");
    fetchAuditLog({ actorId: "u1", resource: "asset", limit: 50, cursor: "c1" });
    const url = api.get.mock.calls.at(-1)![0] as string;
    expect(url.startsWith("/api/audit-log?")).toBe(true);
    expect(url).toContain("actorId=u1");
    expect(url).toContain("resource=asset");
    expect(url).toContain("limit=50");
    expect(url).toContain("cursor=c1");

    updateMemberRole("u1", "admin", "h1");
    expect(api.patch).toHaveBeenCalledWith("/api/households/h1/members/u1/role", { role: "admin" });
  });

  it("securityActivity service builds query strings", () => {
    fetchSecurityActivity({});
    expect(api.get).toHaveBeenCalledWith("/api/security-activity");
    fetchSecurityActivity({ cursor: "c1", limit: 25 });
    const url = api.get.mock.calls.at(-1)![0] as string;
    expect(url).toContain("cursor=c1");
    expect(url).toContain("limit=25");
  });
});
