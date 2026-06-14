import { describe, it, expect, beforeEach, mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

const waterfallServiceMock = {
  getWaterfallSummary: mock(() => Promise.resolve({ surplus: { amount: 1000 } })),
};

mock.module("../config/database.js", () => ({ prisma: prismaMock }));
mock.module("./waterfall.service.js", () => ({ waterfallService: waterfallServiceMock }));

const {
  forecastService,
  computeDisposalProceeds,
  __test__: forecastTest,
} = await import("./forecast.service.js");

beforeEach(() => {
  resetPrismaMocks();
  waterfallServiceMock.getWaterfallSummary.mockResolvedValue({
    surplus: { amount: 1000 },
  } as any);
});

// Helper to build a mock account with a latest balance
// monthlyContribution is now derived from linkedItems + ItemAmountPeriod at read time
function mockAccount(overrides: {
  id?: string;
  type: "Current" | "Savings" | "Pension" | "StocksAndShares" | "Other";
  balance: number;
  linkedItems?: Array<{ id: string; spendType: string }>;
  growthRatePct?: number | null;
  memberId?: string | null;
}) {
  return {
    id: overrides.id ?? "acc-1",
    householdId: "hh-1",
    type: overrides.type,
    growthRatePct: overrides.growthRatePct ?? null,
    memberId: overrides.memberId ?? null,
    linkedItems: overrides.linkedItems ?? [],
    balances: [{ value: overrides.balance, date: new Date("2026-01-01") }],
  };
}

// Helper to build a mock asset with a latest balance
function mockAsset(overrides: {
  id?: string;
  type: "Property" | "Vehicle" | "Other";
  balance: number;
  growthRatePct?: number | null;
}) {
  return {
    id: overrides.id ?? "asset-1",
    householdId: "hh-1",
    type: overrides.type,
    growthRatePct: overrides.growthRatePct ?? null,
    balances: [{ value: overrides.balance, date: new Date("2026-01-01") }],
  };
}

const defaultSettings = {
  currentRatePct: 0,
  savingsRatePct: 4,
  investmentRatePct: 7,
  pensionRatePct: 6,
  inflationRatePct: 2.5,
};

describe("forecastService.getProjections — net worth", () => {
  it("year 0 net worth = sum of non-pension account balances + all asset balances", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "Savings", balance: 10000 }),
      mockAccount({ id: "acc-2", type: "Pension", balance: 50000, memberId: "m-1" }),
      mockAccount({ id: "acc-3", type: "StocksAndShares", balance: 5000 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([
      mockAsset({ type: "Property", balance: 200000 }),
    ] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([
      {
        id: "m-1",
        householdId: "hh-1",
        userId: "user-1",
        retirementYear: 2055,
        user: { id: "user-1", name: "Alice" },
      },
    ] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Year 0: Savings (10000) + StocksAndShares (5000) + Property (200000) = 215000
    // Pension (50000) excluded
    expect(result.netWorth[0]!.nominal).toBe(215000);
    expect(result.netWorth[0]!.real).toBe(215000);
  });

  it("applies account growth rate with monthly contributions after year 1", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({
        type: "Savings",
        balance: 10000,
        linkedItems: [{ id: "item-contrib", spendType: "monthly" }],
      }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        id: "p-contrib",
        itemType: "discretionary_item",
        itemId: "item-contrib",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 100,
        createdAt: new Date(),
      },
    ] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Monthly compounding: FV(10000, 100pm, 4%, 1y) ≈ 11629.66 → 11630
    expect(result.netWorth[1]!.nominal).toBe(11630);
  });

  it("applies asset growth rate (no contributions)", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([
      mockAsset({ type: "Property", balance: 200000, growthRatePct: 3 }),
    ] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Monthly compounding: FV(200000, 0, 3%, 1y) ≈ 206083.19 → 206083
    expect(result.netWorth[1]!.nominal).toBe(206083);
  });

  it("applies depreciation (negative growthRatePct) on assets", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([
      mockAsset({ type: "Vehicle", balance: 20000, growthRatePct: -15 }),
    ] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Monthly compounding at -15%: FV(20000, 0, -15%, 1y) ≈ 17197.89 → 17198
    expect(result.netWorth[1]!.nominal).toBe(17198);
  });

  it("Current accounts use currentRatePct as default growth rate", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "Current", balance: 5000 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue({
      ...defaultSettings,
      currentRatePct: 2,
    } as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Monthly compounding: FV(5000, 0, 2%, 1y) ≈ 5100.92 → 5101
    expect(result.netWorth[1]!.nominal).toBe(5101);
  });

  it("Current account growthRatePct override takes precedence over currentRatePct", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "Current", balance: 5000, growthRatePct: 1 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue({
      ...defaultSettings,
      currentRatePct: 2,
    } as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Year 1 with 1% override: 5000 * 1.01 = 5050
    expect(result.netWorth[1]!.nominal).toBe(5050);
  });

  it("Current and Savings accounts use independent default rates", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ id: "c-1", type: "Current", balance: 1000 }),
      mockAccount({ id: "s-1", type: "Savings", balance: 1000 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue({
      ...defaultSettings,
      currentRatePct: 1,
      savingsRatePct: 5,
    } as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Monthly compounding: FV(1000,0,1%,1y)≈1010.05 + FV(1000,0,5%,1y)≈1051.16 → 2061
    expect(result.netWorth[1]!.nominal).toBe(2061);
  });

  it("uses per-account growthRatePct override over household default", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "Savings", balance: 10000, growthRatePct: 10 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Monthly compounding at 10% override: FV(10000, 0, 10%, 1y) ≈ 11047.13 → 11047
    expect(result.netWorth[1]!.nominal).toBe(11047);
  });

  it("real value deflates nominal by inflation", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "Savings", balance: 10000, growthRatePct: 0 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue({
      ...defaultSettings,
      currentRatePct: 0,
      savingsRatePct: 0,
      investmentRatePct: 0,
      pensionRatePct: 0,
      inflationRatePct: 2.5,
    } as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Year 1 nominal = 10000 (no growth), real = 10000 / 1.025 ≈ 9756
    expect(result.netWorth[1]!.real).toBe(9756);
  });

  it("falls back to DEFAULT_SETTINGS when householdSettings is null", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "Savings", balance: 10000 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // DEFAULT_SETTINGS savingsRatePct: 4, monthly compounding: FV(10000,0,4%,1y) ≈ 10407.42 → 10407
    expect(result.netWorth[1]!.nominal).toBe(10407);
  });
});

describe("forecastService.getProjections — surplus", () => {
  it("year 0 surplus is 0, year N is monthlySurplus * 12 * N", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);
    waterfallServiceMock.getWaterfallSummary.mockResolvedValue({
      surplus: { amount: 500 },
    } as any);

    const result = await forecastService.getProjections("hh-1", 3);

    expect(result.surplus[0]!.cumulative).toBe(0);
    expect(result.surplus[1]!.cumulative).toBe(6000);
    expect(result.surplus[3]!.cumulative).toBe(18000);
  });
});

describe("forecastService.getProjections — retirement", () => {
  it("pension series includes only pension accounts assigned to the member", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ id: "p1", type: "Pension", balance: 20000, memberId: "m-1" }),
      mockAccount({ id: "p2", type: "Pension", balance: 30000, memberId: "m-2" }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([
      {
        id: "m-1",
        householdId: "hh-1",
        userId: "user-1",
        retirementYear: 2055,
        user: { id: "user-1", name: "Alice" },
      },
      {
        id: "m-2",
        householdId: "hh-1",
        userId: "user-2",
        retirementYear: 2060,
        user: { id: "user-2", name: "Bob" },
      },
    ] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    const alice = result.retirement.find((m) => m.memberId === "m-1")!;
    const bob = result.retirement.find((m) => m.memberId === "m-2")!;

    expect(alice.series[0]!.pension).toBe(20000);
    expect(bob.series[0]!.pension).toBe(30000);
  });

  it("passes through null retirementYear", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([
      {
        id: "m-1",
        householdId: "hh-1",
        userId: "user-1",
        retirementYear: null,
        user: { id: "user-1", name: "Alice" },
      },
    ] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    expect(result.retirement[0]!.retirementYear).toBeNull();
  });

  it("returns all-zero series when no accounts or assets exist", async () => {
    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);
    waterfallServiceMock.getWaterfallSummary.mockResolvedValue({ surplus: { amount: 0 } } as any);

    const result = await forecastService.getProjections("hh-1", 3);

    expect(result.netWorth.every((p) => p.nominal === 0)).toBe(true);
    expect(result.surplus.every((p) => p.cumulative === 0)).toBe(true);
    expect(result.retirement).toHaveLength(0);
  });
});

describe("forecastService.getProjections — monthlyContributionsByScope", () => {
  it("sums non-pension linked contributions into netWorth scope", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({
        id: "savings-1",
        type: "Savings",
        balance: 5000,
        linkedItems: [{ id: "item-savings", spendType: "monthly" }],
      }),
      mockAccount({
        id: "pension-1",
        type: "Pension",
        balance: 20000,
        linkedItems: [{ id: "item-pension", spendType: "monthly" }],
        memberId: "m-1",
      }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([
      {
        id: "m-1",
        householdId: "hh-1",
        userId: "user-1",
        retirementYear: null,
        user: { id: "user-1", name: "Alice" },
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        id: "p1",
        itemType: "discretionary_item",
        itemId: "item-savings",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 300,
        createdAt: new Date(),
      },
      {
        id: "p2",
        itemType: "discretionary_item",
        itemId: "item-pension",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 200,
        createdAt: new Date(),
      },
    ] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    expect(result.monthlyContributionsByScope.netWorth).toBe(300);
    expect(result.monthlyContributionsByScope.retirement).toBe(200);
    expect(result.monthlyContributionsByScope.savings).toBe(300);
    expect(result.monthlyContributionsByScope.stocksAndShares).toBe(0);
  });

  it("returns zeroes when no linked items exist", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "Savings", balance: 10000 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    expect(result.monthlyContributionsByScope.netWorth).toBe(0);
    expect(result.monthlyContributionsByScope.retirement).toBe(0);
    expect(result.monthlyContributionsByScope.savings).toBe(0);
    expect(result.monthlyContributionsByScope.stocksAndShares).toBe(0);
  });
});

describe("forecastService.getProjections — savings series", () => {
  it("year 0 balance equals current household savings, series length = horizon + 1", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ id: "s-1", type: "Savings", balance: 7000 }),
      mockAccount({ id: "s-2", type: "Savings", balance: 3000 }),
      mockAccount({ id: "ss-1", type: "StocksAndShares", balance: 5000 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 3);

    expect(result.savings).toHaveLength(4);
    expect(result.savings[0]!.balance).toBe(10000);
  });

  it("applies savingsRatePct growth and monthly contributions", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({
        type: "Savings",
        balance: 10000,
        linkedItems: [{ id: "item-contrib", spendType: "monthly" }],
      }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        id: "p-contrib",
        itemType: "discretionary_item",
        itemId: "item-contrib",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 100,
        createdAt: new Date(),
      },
    ] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    // Monthly compounding: FV(10000, 100pm, 4%, 1y) ≈ 11629.66 → 11630
    expect(result.savings[1]!.balance).toBe(11630);
  });

  it("all-zero series when no Savings accounts exist", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "Current", balance: 5000 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 3);

    expect(result.savings.every((p) => p.balance === 0)).toBe(true);
  });
});

// ── Disposal: unit tests for internal helpers ─────────────────────────────────

describe("forecastService.__test__.disposalYearOffset", () => {
  const { disposalYearOffset } = forecastTest;

  it("returns null when disposedAt is null", () => {
    expect(disposalYearOffset(null, new Date())).toBeNull();
  });

  it("returns 0 when disposal date is in the past", () => {
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    expect(disposalYearOffset(past, new Date())).toBe(0);
  });

  it("returns 0 when disposal date equals now", () => {
    const now = new Date();
    expect(disposalYearOffset(now, now)).toBe(0);
  });

  it("returns approximately 2 for a date ~2 years in the future", () => {
    const now = new Date("2026-01-01");
    const future = new Date("2028-01-01");
    expect(disposalYearOffset(future, now)).toBe(2);
  });

  it("returns at least 1 for any future date", () => {
    const now = new Date("2026-01-01");
    const nearFuture = new Date("2026-06-01");
    expect(disposalYearOffset(nearFuture, now)!).toBeGreaterThanOrEqual(1);
  });
});

describe("forecastService.__test__.projectBalanceSeries — disposal cut-off", () => {
  const { projectBalanceSeries } = forecastTest;

  it("disposalYear=null → no proceeds, normal compounding series", () => {
    const { series, proceeds } = projectBalanceSeries(10000, 0, 0.05, 2, null);
    expect(proceeds).toBeNull();
    expect(series[0]).toBe(10000);
    // Monthly compounding at 5%: year 1 ≈ 10511.62, year 2 ≈ 11049.41
    expect(series[1]).toBeCloseTo(10511.62, 1);
    expect(series[2]).toBeCloseTo(11049.41, 1);
  });

  it("disposalYear=0 → all-zero series, no proceeds (already disposed)", () => {
    const { series, proceeds } = projectBalanceSeries(50000, 100, 0.05, 3, 0);
    expect(proceeds).toBeNull();
    expect(series.every((v) => v === 0)).toBe(true);
    expect(series).toHaveLength(4); // years + 1
  });

  it("disposalYear=2 → series drops to 0 at year 2, proceeds captured", () => {
    // 10000 at 10%/yr (monthly compounding), no contributions, disposed at year 2
    const { series, proceeds } = projectBalanceSeries(10000, 0, 0.1, 3, 2);
    expect(series[0]).toBe(10000);
    expect(series[1]).toBeCloseTo(11047.13, 1); // year 1: still active
    expect(series[2]).toBe(0); // year 2: dropped to 0
    expect(series[3]).toBe(0); // year 3: still 0
    expect(proceeds).not.toBeNull();
    expect(proceeds!.yearOffset).toBe(2);
    expect(proceeds!.amount).toBeCloseTo(12203.91, 1); // FV(10000,0,10%,2y)
  });

  it("disposalYear=1 → series is [balance, 0], proceeds captured at year 1", () => {
    const { series, proceeds } = projectBalanceSeries(5000, 0, 0.0, 2, 1);
    expect(series[0]).toBe(5000);
    expect(series[1]).toBe(0);
    expect(proceeds!.yearOffset).toBe(1);
    expect(proceeds!.amount).toBe(5000); // 0% growth, so proceeds = initial
  });
});

describe("forecastService.getProjections — disposal integration", () => {
  it("asset with future disposal drops to 0 and adds proceeds to target account", async () => {
    // Asset: £100k property, 0% growth, disposed at year 2
    // Target: Savings account with £0 balance, 0% growth
    // Expected: year 2 net worth = 0 (property gone) + £100k (target gained proceeds)
    const now = new Date("2026-01-01");
    const disposalDate = new Date("2028-01-01"); // ~2 years from now

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "target-acc",
        householdId: "hh-1",
        type: "Savings",
        growthRatePct: 0,
        memberId: null,
        disposedAt: null,
        disposalAccountId: null,
        linkedItems: [],
        balances: [{ value: 0, date: now }],
      },
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "house-1",
        householdId: "hh-1",
        type: "Property",
        growthRatePct: 0,
        disposedAt: disposalDate,
        disposalAccountId: "target-acc",
        balances: [{ value: 100000, date: now }],
      },
    ] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue({
      ...defaultSettings,
      savingsRatePct: 0,
    } as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 3);

    // Year 0: property £100k, savings £0 → net worth £100k
    expect(result.netWorth[0]!.nominal).toBe(100000);
    // Year 1: property still active (disposal at year 2), savings £0 → £100k
    expect(result.netWorth[1]!.nominal).toBe(100000);
    // Year 2: property drops to 0, proceeds (£100k) added to target savings
    expect(result.netWorth[2]!.nominal).toBe(100000);
    // Year 3: savings still holds £100k (0% rate), property still 0
    expect(result.netWorth[3]!.nominal).toBe(100000);
  });

  it("asset with past disposal (disposalYear=0) contributes 0 from year 0", async () => {
    const yesterday = new Date(Date.now() - 86400_000);

    prismaMock.account.findMany.mockResolvedValue([] as any);
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "old-boat",
        householdId: "hh-1",
        type: "Vehicle",
        growthRatePct: 0,
        disposedAt: yesterday,
        disposalAccountId: "some-acc",
        balances: [{ value: 20000, date: new Date("2025-01-01") }],
      },
    ] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 2);

    // Already disposed → 0 at every data point
    expect(result.netWorth[0]!.nominal).toBe(0);
    expect(result.netWorth[1]!.nominal).toBe(0);
    expect(result.netWorth[2]!.nominal).toBe(0);
  });
});

describe("forecastService.getProjections — stocksAndShares series", () => {
  it("year 0 balance equals current household S&S, uses investmentRatePct", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({ type: "StocksAndShares", balance: 10000 }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    expect(result.stocksAndShares[0]!.balance).toBe(10000);
    // Monthly compounding at investmentRatePct 7%: FV(10000,0,7%,1y) ≈ 10722.90 → 10723
    expect(result.stocksAndShares[1]!.balance).toBe(10723);
  });

  it("sums linked contributions into stocksAndShares scope only", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({
        id: "ss-1",
        type: "StocksAndShares",
        balance: 5000,
        linkedItems: [{ id: "item-ss", spendType: "monthly" }],
      }),
      mockAccount({
        id: "sav-1",
        type: "Savings",
        balance: 5000,
        linkedItems: [{ id: "item-sav", spendType: "monthly" }],
      }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        id: "p-ss",
        itemType: "discretionary_item",
        itemId: "item-ss",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 150,
        createdAt: new Date(),
      },
      {
        id: "p-sav",
        itemType: "discretionary_item",
        itemId: "item-sav",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 75,
        createdAt: new Date(),
      },
    ] as any);

    const result = await forecastService.getProjections("hh-1", 1);

    expect(result.monthlyContributionsByScope.stocksAndShares).toBe(150);
    expect(result.monthlyContributionsByScope.savings).toBe(75);
  });
});

describe("forecastService.getProjections — monthly compounding parity (#163)", () => {
  it("year-10 of £0 start / £500pm / 6% ≈ £81,939.67 (matches Help calculator)", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      mockAccount({
        type: "Savings",
        balance: 0,
        growthRatePct: 6,
        linkedItems: [{ id: "item-pm", spendType: "monthly" }],
      }),
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(defaultSettings as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        id: "p-pm",
        itemType: "discretionary_item",
        itemId: "item-pm",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 500,
        createdAt: new Date(),
      },
    ] as any);

    const result = await forecastService.getProjections("hh-1", 10);

    // Monthly-compounding annuity FV(0, 500pm, 6%, 10y) = 81939.67 (rounded to £)
    expect(result.savings[10]!.balance).toBe(81940);
  });
});

describe("computeDisposalProceeds (#128)", () => {
  const now = new Date("2026-01-01");

  it("zero contributions → pure monthly-compounded growth", () => {
    // 10000 at 5% from balance date == now to disposal in exactly 1 year
    const v = computeDisposalProceeds({
      startBalance: 10000,
      startBalanceDate: now,
      disposedAt: new Date("2027-01-01"),
      annualRate: 0.05,
      monthlyContribution: 0,
      now,
    });
    // 365 days / 365.25 ≈ 0.99932 yr at 5% monthly compounding → ≈ 10511.26
    expect(v!).toBeCloseTo(10511.26, 1);
  });

  it("partial-year accrual (10k / 5% / £200pm / ~3 months)", () => {
    // forecast and cashflow share this helper → identical proceeds
    const startBalanceDate = now;
    const disposedAt = new Date("2026-04-02"); // ~0.25 year (91 days)
    const v = computeDisposalProceeds({
      startBalance: 10000,
      startBalanceDate,
      disposedAt,
      annualRate: 0.05,
      monthlyContribution: 200,
      now,
    });
    // Some growth on 10000 plus ~3 months of £200 contributions
    expect(v!).toBeGreaterThan(10000 + 200 * 2);
    expect(v!).toBeLessThan(10800);
  });

  it("past disposal (before now) yields the starting balance unchanged", () => {
    const v = computeDisposalProceeds({
      startBalance: 10000,
      startBalanceDate: new Date("2025-01-01"),
      disposedAt: new Date("2025-06-01"),
      annualRate: 0.05,
      monthlyContribution: 200,
      now,
    });
    expect(v).toBe(10000);
  });

  it("null start balance date → null (cannot project from nothing)", () => {
    const v = computeDisposalProceeds({
      startBalance: 10000,
      startBalanceDate: null,
      disposedAt: new Date("2027-01-01"),
      annualRate: 0.05,
      monthlyContribution: 200,
      now,
    });
    expect(v).toBeNull();
  });
});
