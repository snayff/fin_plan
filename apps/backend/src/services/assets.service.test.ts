import { describe, it, expect, beforeEach, mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma.js";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));
mock.module("./audit.service.js", () => ({
  audited: mock(({ mutation }: { mutation: (tx: typeof prismaMock) => unknown }) =>
    mutation(prismaMock)
  ),
}));

const { assetsService } = await import("./assets.service.js");

const HOUSEHOLD_ID = "hh-1";
const USER_ID = "user-1";
const MEMBER_ID = "member-1";
const ASSET_ID = "asset-1";
const ACCOUNT_ID = "account-1";

const mockCtx = {
  householdId: HOUSEHOLD_ID,
  actorId: USER_ID,
  actorName: "Test User",
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

beforeEach(() => resetPrismaMocks());

// ── Assets ──────────────────────────────────────────────────────────────────

describe("assetsService.getSummary", () => {
  it("returns totals per type for both groups", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      {
        type: "Property",
        balances: [{ value: 100000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
      {
        type: "Vehicle",
        balances: [{ value: 9000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
    ] as any);
    prismaMock.account.findMany.mockResolvedValue([
      {
        type: "Savings",
        balances: [{ value: 5000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
    ] as any);

    const result = await assetsService.getSummary(HOUSEHOLD_ID);

    expect(result.assetTotals.Property).toBe(100000);
    expect(result.assetTotals.Vehicle).toBe(9000);
    expect(result.assetTotals.Other).toBe(0);
    expect(result.accountTotals.Savings).toBe(5000);
    expect(result.accountTotals.Pension).toBe(0);
    expect(result.grandTotal).toBe(114000);
  });

  it("grandTotal (net worth) EXCLUDES pension account balances (#164)", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      {
        type: "Property",
        balances: [{ value: 200000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
    ] as any);
    prismaMock.account.findMany.mockResolvedValue([
      {
        type: "Savings",
        balances: [{ value: 10000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
      {
        type: "StocksAndShares",
        balances: [{ value: 5000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
      {
        type: "Pension",
        balances: [{ value: 50000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
    ] as any);

    const result = await assetsService.getSummary(HOUSEHOLD_ID);

    // Pension still reported per-type for the Assets page breakdown...
    expect(result.accountTotals.Pension).toBe(50000);
    // ...but excluded from grandTotal so it reconciles with forecast year-0:
    // Property 200000 + Savings 10000 + S&S 5000 = 215000 (pension 50000 excluded).
    expect(result.grandTotal).toBe(215000);
  });
});

describe("assetsService.listAssetsByType", () => {
  it("returns assets with latest balance for given type", async () => {
    const mockAssets = [
      {
        id: ASSET_ID,
        name: "My House",
        type: "Property",
        householdId: HOUSEHOLD_ID,
        memberId: null,
        lastReviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        balances: [
          {
            id: "b1",
            value: 185000,
            date: new Date("2026-03-01"),
            createdAt: new Date(),
            assetId: ASSET_ID,
            note: null,
          },
          {
            id: "b2",
            value: 180000,
            date: new Date("2026-01-01"),
            createdAt: new Date(),
            assetId: ASSET_ID,
            note: null,
          },
        ],
      },
    ];
    prismaMock.asset.findMany.mockResolvedValue(mockAssets as any);

    const result = await assetsService.listAssetsByType(HOUSEHOLD_ID, "Property");

    expect(result).toHaveLength(1);
    expect(result[0]!.currentBalance).toBe(185000);
    expect(result[0]!.currentBalanceDate).toEqual(new Date("2026-03-01"));
  });
});

describe("assetsService.createAsset", () => {
  it("creates asset with valid memberId", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: MEMBER_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.create.mockResolvedValue({
      id: ASSET_ID,
      name: "Test House",
      type: "Property",
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_ID,
      lastReviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await assetsService.createAsset(
      HOUSEHOLD_ID,
      { name: "Test House", type: "Property", memberId: MEMBER_ID },
      mockCtx
    );

    expect(result.name).toBe("Test House");
    expect(prismaMock.member.findUnique).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      select: { id: true, householdId: true },
    });
  });

  it("throws ValidationError when memberId is from another household", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "foreign-member",
      householdId: "other-household",
    } as any);

    await expect(
      assetsService.createAsset(
        HOUSEHOLD_ID,
        { name: "Test House", type: "Property", memberId: "foreign-member" },
        mockCtx
      )
    ).rejects.toThrow("Member not found in household");
  });

  it("persists initialValueDate as the opening balance date when provided", async () => {
    prismaMock.asset.create.mockResolvedValue({
      id: ASSET_ID,
      name: "Family Home",
      type: "Property",
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.assetBalance.create.mockResolvedValue({ id: "bal-1" } as any);

    await assetsService.createAsset(
      HOUSEHOLD_ID,
      {
        name: "Family Home",
        type: "Property",
        initialValue: 250000,
        initialValueDate: "2026-01-15",
      },
      mockCtx
    );

    expect(prismaMock.assetBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: ASSET_ID,
        value: 250000,
        date: new Date("2026-01-15"),
      }),
    });
    // initialValueDate must NOT be passed to asset.create — it's not a column
    const assetCreateCall = prismaMock.asset.create.mock.calls.at(-1)?.[0] as { data: object };
    expect(assetCreateCall.data).not.toHaveProperty("initialValueDate");
  });
});

describe("assetsService.recordAssetBalance", () => {
  it("appends balance entry and updates lastReviewedAt", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.assetBalance.create.mockResolvedValue({
      id: "bal-1",
      assetId: ASSET_ID,
      value: 190000,
      date: new Date("2026-03-30"),
      note: null,
      createdAt: new Date(),
    } as any);
    prismaMock.asset.update.mockResolvedValue({} as any);

    const result = await assetsService.recordAssetBalance(
      HOUSEHOLD_ID,
      ASSET_ID,
      { value: 190000, date: "2026-03-30", note: null },
      mockCtx
    );

    expect(result.value).toBe(190000);
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: expect.objectContaining({ lastReviewedAt: expect.any(Date) }),
    });
  });

  it("throws NotFoundError when asset belongs to another household", async () => {
    prismaMock.asset.findUnique.mockResolvedValue(null);

    await expect(
      assetsService.recordAssetBalance(
        HOUSEHOLD_ID,
        "other-asset",
        { value: 100, date: "2026-03-30" },
        mockCtx
      )
    ).rejects.toThrow();
  });
});

// ── Accounts ─────────────────────────────────────────────────────────────────

describe("assetsService.listAccountsByType", () => {
  it("returns accounts with latest balance for given type", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: ACCOUNT_ID,
        name: "SIPP",
        type: "Pension",
        householdId: HOUSEHOLD_ID,
        memberId: USER_ID,
        growthRatePct: null,
        lastReviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        linkedItems: [],
        balances: [
          {
            id: "b1",
            value: 42100,
            date: new Date("2026-03-12"),
            createdAt: new Date(),
            accountId: ACCOUNT_ID,
            note: null,
          },
        ],
      },
    ] as any);

    const result = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Pension");

    expect(result[0]!.currentBalance).toBe(42100);
    expect(result[0]!.balances).toHaveLength(1);
    expect(result[0]!.monthlyContribution).toBe(0);
    expect(result[0]!.linkedItems).toEqual([]);
  });

  it("derives monthlyContribution from active ItemAmountPeriods of linked items", async () => {
    const ITEM_ID_1 = "item-1";
    const ITEM_ID_2 = "item-2";

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: ACCOUNT_ID,
        name: "ISA",
        type: "Savings",
        householdId: HOUSEHOLD_ID,
        memberId: null,
        growthRatePct: null,
        lastReviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        linkedItems: [
          { id: ITEM_ID_1, name: "ISA monthly", spendType: "monthly" },
          { id: ITEM_ID_2, name: "ISA yearly top-up", spendType: "yearly" },
        ],
        balances: [],
      },
    ] as any);

    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        id: "p1",
        itemType: "discretionary_item",
        itemId: ITEM_ID_1,
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 300,
        createdAt: new Date(),
      },
      {
        id: "p2",
        itemType: "discretionary_item",
        itemId: ITEM_ID_2,
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 1200,
        createdAt: new Date(),
      },
    ] as any);

    const result = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");

    // 300 monthly + 1200/12 yearly = 300 + 100 = 400
    expect(result[0]!.monthlyContribution).toBe(400);
    expect(result[0]!.linkedItems).toHaveLength(2);
    expect(result[0]!.linkedItems[0]!.amount).toBe(300);
    expect(result[0]!.linkedItems[1]!.amount).toBe(1200);
  });

  it("returns monthlyContribution 0 and does not query periods when no linked items", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: ACCOUNT_ID,
        name: "Current",
        type: "Current",
        householdId: HOUSEHOLD_ID,
        memberId: null,
        growthRatePct: null,
        lastReviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        linkedItems: [],
        balances: [],
      },
    ] as any);

    const result = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Current");

    expect(result[0]!.monthlyContribution).toBe(0);
    expect(prismaMock.itemAmountPeriod.findMany).not.toHaveBeenCalled();
  });
});

describe("assetsService.createAccount", () => {
  it("creates account and persists initialValue as opening balance", async () => {
    prismaMock.account.create.mockResolvedValue({
      id: ACCOUNT_ID,
      name: "HSBC Current",
      type: "Current",
      householdId: HOUSEHOLD_ID,
      memberId: null,
      growthRatePct: null,
      isCashflowLinked: false,
      lastReviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    prismaMock.accountBalance.create.mockResolvedValue({
      id: "bal-1",
      accountId: ACCOUNT_ID,
      value: 1500,
      date: new Date(),
      note: null,
      createdAt: new Date(),
    } as any);

    await assetsService.createAccount(
      HOUSEHOLD_ID,
      { name: "HSBC Current", type: "Current", initialValue: 1500 },
      mockCtx
    );

    expect(prismaMock.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: HOUSEHOLD_ID,
        name: "HSBC Current",
        type: "Current",
      }),
    });
    expect(prismaMock.accountBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: ACCOUNT_ID,
        value: 1500,
      }),
    });
    // initialValue must NOT be passed to account.create — it's not a column
    const accountCreateCall = prismaMock.account.create.mock.calls[0]?.[0] as { data: object };
    expect(accountCreateCall.data).not.toHaveProperty("initialValue");
  });

  it("persists initialValueDate as the opening balance date when provided", async () => {
    prismaMock.account.create.mockResolvedValue({
      id: ACCOUNT_ID,
      name: "HSBC Current",
      type: "Current",
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.accountBalance.create.mockResolvedValue({ id: "bal-1" } as any);

    await assetsService.createAccount(
      HOUSEHOLD_ID,
      { name: "HSBC Current", type: "Current", initialValue: 1500, initialValueDate: "2026-01-15" },
      mockCtx
    );

    expect(prismaMock.accountBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: ACCOUNT_ID,
        value: 1500,
        date: new Date("2026-01-15"),
      }),
    });
    // initialValueDate must NOT be passed to account.create — it's not a column
    const accountCreateCall = prismaMock.account.create.mock.calls.at(-1)?.[0] as { data: object };
    expect(accountCreateCall.data).not.toHaveProperty("initialValueDate");
  });

  it("creates account without initialValue and skips balance insert", async () => {
    prismaMock.account.create.mockResolvedValue({
      id: ACCOUNT_ID,
      name: "Empty Savings",
      type: "Savings",
      householdId: HOUSEHOLD_ID,
    } as any);

    await assetsService.createAccount(
      HOUSEHOLD_ID,
      { name: "Empty Savings", type: "Savings" },
      mockCtx
    );

    expect(prismaMock.account.create).toHaveBeenCalled();
    expect(prismaMock.accountBalance.create).not.toHaveBeenCalled();
  });
});

describe("assetsService.deleteAccount", () => {
  it("deletes account owned by household", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.account.delete.mockResolvedValue({} as any);

    await assetsService.deleteAccount(HOUSEHOLD_ID, ACCOUNT_ID, mockCtx);

    expect(prismaMock.account.delete).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
    });
  });
});

describe("assetsService.listAccountsByType — derived limit fields", () => {
  it("derives spareMonthly, hasSpareCapacityNudge, higherRateTarget, and isOverCap", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a-low",
        name: "Lloyds Club",
        type: "Savings",
        memberId: "m-1",
        growthRatePct: 3.5,
        monthlyContributionLimit: 200,
        balances: [],
        linkedItems: [{ id: "li-1", name: "Saver", spendType: "monthly" }],
      },
      {
        id: "a-high",
        name: "Marcus Easy Access",
        type: "Savings",
        memberId: "m-1",
        growthRatePct: 4.6,
        monthlyContributionLimit: null,
        balances: [],
        linkedItems: [],
      },
      {
        id: "a-other",
        name: "Bob's Saver",
        type: "Savings",
        memberId: "m-2",
        growthRatePct: 6.0,
        monthlyContributionLimit: null,
        balances: [],
        linkedItems: [],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      { itemId: "li-1", amount: 125 },
    ] as any);

    const accounts = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");
    const low = accounts.find((a) => a.id === "a-low")!;
    expect(low.monthlyContribution).toBe(125);
    expect(low.spareMonthly).toBe(75);
    expect(low.isOverCap).toBe(false);
    expect(low.hasSpareCapacityNudge).toBe(true);
    expect(low.higherRateTarget?.id).toBe("a-high");
    expect(low.higherRateTarget?.growthRatePct).toBe(4.6);

    const high = accounts.find((a) => a.id === "a-high")!;
    expect(high.spareMonthly).toBeNull();
    expect(high.hasSpareCapacityNudge).toBe(false);
    expect(high.higherRateTarget).toBeNull();
  });

  it("flags a single linked item whose raw amount exceeds the cap", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a-1",
        name: "Lloyds Club",
        type: "Savings",
        memberId: null,
        growthRatePct: 3.5,
        monthlyContributionLimit: 200,
        balances: [],
        linkedItems: [{ id: "li-yearly", name: "ISA top-up", spendType: "annual" }],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      { itemId: "li-yearly", amount: 1200 },
    ] as any);
    const [acc] = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");
    expect(acc!.linkedItems[0]!.lumpSumExceedsCap).toBe(true);
    expect(acc!.monthlyContribution).toBeCloseTo(100);
    expect(acc!.isOverCap).toBe(false);
  });

  it("computes isOverCap and suppresses spare-capacity nudge when over-cap", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a-1",
        name: "Lloyds Club",
        type: "Savings",
        memberId: null,
        growthRatePct: 3.5,
        monthlyContributionLimit: 200,
        balances: [],
        linkedItems: [{ id: "li-1", name: "Saver", spendType: "monthly" }],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      { itemId: "li-1", amount: 250 },
    ] as any);
    const [acc] = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");
    expect(acc!.isOverCap).toBe(true);
    expect(acc!.hasSpareCapacityNudge).toBe(false);
    expect(acc!.spareMonthly).toBe(-50);
  });

  it("excludes candidates whose effective rate cannot be resolved", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a-low",
        name: "L",
        type: "Savings",
        memberId: null,
        growthRatePct: 3.5,
        monthlyContributionLimit: 200,
        balances: [],
        linkedItems: [],
      },
      {
        id: "a-norate",
        name: "N",
        type: "Savings",
        memberId: null,
        growthRatePct: null,
        monthlyContributionLimit: null,
        balances: [],
        linkedItems: [],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null as any);
    const [low] = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");
    expect(low!.higherRateTarget).toBeNull();
    expect(low!.hasSpareCapacityNudge).toBe(false);
  });
});

describe("assetsService.createAccount — monthlyContributionLimit guard", () => {
  it("rejects a non-null limit on a non-Savings account", async () => {
    await expect(
      assetsService.createAccount(
        HOUSEHOLD_ID,
        { name: "Halifax", type: "Current", monthlyContributionLimit: 200 } as any,
        mockCtx
      )
    ).rejects.toThrow(/Savings/);
  });

  it("accepts a non-null limit on a Savings account", async () => {
    prismaMock.account.create.mockResolvedValue({ id: "a-1" } as any);
    await expect(
      assetsService.createAccount(
        HOUSEHOLD_ID,
        { name: "Marcus", type: "Savings", monthlyContributionLimit: 200 } as any,
        mockCtx
      )
    ).resolves.toBeDefined();
  });
});

describe("assetsService.updateAccount — monthlyContributionLimit guard", () => {
  it("nulls the limit when type changes away from Savings", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
      type: "Savings",
      monthlyContributionLimit: 200,
    } as any);
    prismaMock.account.update.mockResolvedValue({ id: ACCOUNT_ID } as any);
    await assetsService.updateAccount(HOUSEHOLD_ID, ACCOUNT_ID, { type: "Other" } as any, mockCtx);
    const call = prismaMock.account.update.mock.calls.at(-1)?.[0];
    expect(call?.data.monthlyContributionLimit).toBe(null);
  });

  it("rejects setting a non-null limit on a non-Savings account", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
      type: "Current",
    } as any);
    await expect(
      assetsService.updateAccount(
        HOUSEHOLD_ID,
        ACCOUNT_ID,
        { monthlyContributionLimit: 200 } as any,
        mockCtx
      )
    ).rejects.toThrow(/Savings/);
  });
});

// ── Disposal fields ───────────────────────────────────────────────────────────

describe("assetsService.listAssetsByType — disposal filtering", () => {
  const activeAsset = {
    id: "active-1",
    name: "Active House",
    type: "Property",
    householdId: HOUSEHOLD_ID,
    memberId: null,
    growthRatePct: null,
    disposedAt: null,
    disposalAccountId: null,
    lastReviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    balances: [
      {
        id: "b1",
        value: 200000,
        date: new Date("2026-01-01"),
        createdAt: new Date(),
        assetId: "active-1",
        note: null,
      },
    ],
  };
  const disposedAsset = {
    id: "disposed-1",
    name: "Old Boat",
    type: "Vehicle",
    householdId: HOUSEHOLD_ID,
    memberId: null,
    growthRatePct: null,
    // Disposed yesterday (in the past)
    disposedAt: new Date(Date.now() - 86400_000),
    disposalAccountId: ACCOUNT_ID,
    lastReviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    balances: [
      {
        id: "b2",
        value: 5000,
        date: new Date("2025-06-01"),
        createdAt: new Date(),
        assetId: "disposed-1",
        note: null,
      },
    ],
  };

  it("default (no opts) applies active filter — Prisma called with OR disposedAt condition", async () => {
    prismaMock.asset.findMany.mockResolvedValue([activeAsset] as any);

    await assetsService.listAssetsByType(HOUSEHOLD_ID, "Property");

    const call = prismaMock.asset.findMany.mock.calls[0]?.[0] as { where: object };
    expect(call.where).toMatchObject({ OR: expect.any(Array) });
  });

  it("includeDisposed: true omits the active filter from where clause", async () => {
    prismaMock.asset.findMany.mockResolvedValue([activeAsset, disposedAsset] as any);

    const result = await assetsService.listAssetsByType(HOUSEHOLD_ID, "Property", {
      includeDisposed: true,
    });

    const call = prismaMock.asset.findMany.mock.calls[0]?.[0] as { where: object };
    // The OR clause should NOT be present when includeDisposed is true
    expect(call.where).not.toHaveProperty("OR");
    expect(result).toHaveLength(2);
  });
});

describe("assetsService.createAsset — disposal validation", () => {
  it("throws ValidationError when disposedAt is set without disposalAccountId", async () => {
    await expect(
      assetsService.createAsset(
        HOUSEHOLD_ID,
        { name: "Test House", type: "Property", disposedAt: "2028-01-01" },
        mockCtx
      )
    ).rejects.toThrow("disposedAt and disposalAccountId must be set or cleared together");
  });

  it("throws ValidationError when disposalAccountId is set without disposedAt", async () => {
    await expect(
      assetsService.createAsset(
        HOUSEHOLD_ID,
        { name: "Test House", type: "Property", disposalAccountId: ACCOUNT_ID },
        mockCtx
      )
    ).rejects.toThrow("disposedAt and disposalAccountId must be set or cleared together");
  });

  it("throws NotFoundError when disposal target account does not exist", async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);

    await expect(
      assetsService.createAsset(
        HOUSEHOLD_ID,
        {
          name: "Test House",
          type: "Property",
          disposedAt: "2028-01-01",
          disposalAccountId: "nonexistent",
        },
        mockCtx
      )
    ).rejects.toThrow("Account not found");
  });

  it("creates asset with valid disposal pair", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.create.mockResolvedValue({
      id: ASSET_ID,
      name: "Future Sale House",
      type: "Property",
      householdId: HOUSEHOLD_ID,
      memberId: null,
      disposedAt: new Date("2028-01-01"),
      disposalAccountId: ACCOUNT_ID,
      lastReviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await assetsService.createAsset(
      HOUSEHOLD_ID,
      {
        name: "Future Sale House",
        type: "Property",
        disposedAt: "2028-01-01",
        disposalAccountId: ACCOUNT_ID,
      },
      mockCtx
    );

    expect(result.name).toBe("Future Sale House");
    expect(prismaMock.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        disposedAt: new Date("2028-01-01"),
        disposalAccountId: ACCOUNT_ID,
      }),
    });
  });
});

describe("assetsService.createAccount — disposal validation", () => {
  const TARGET_ID = "target-acc";

  it("throws ValidationError when disposedAt and disposalAccountId are not both set", async () => {
    await expect(
      assetsService.createAccount(
        HOUSEHOLD_ID,
        { name: "ISA", type: "Savings", disposedAt: "2030-06-01" },
        mockCtx
      )
    ).rejects.toThrow("disposedAt and disposalAccountId must be set or cleared together");
  });

  it("throws ValidationError when an account tries to dispose into itself", async () => {
    // createAccount doesn't have the account id yet (it's being created), so self-referential
    // disposal can only happen on update. Skip this for create and verify it's tested on update.
    // Instead test that a foreign-household target account fails:
    prismaMock.account.findUnique.mockResolvedValue({
      id: TARGET_ID,
      householdId: "other-hh",
    } as any);

    await expect(
      assetsService.createAccount(
        HOUSEHOLD_ID,
        { name: "SIPP", type: "Pension", disposedAt: "2030-06-01", disposalAccountId: TARGET_ID },
        mockCtx
      )
    ).rejects.toThrow("Account not found");
  });
});

describe("assetsService.updateAccount — disposal self-reference guard", () => {
  it("throws ValidationError when an account is set to dispose into itself", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    await expect(
      assetsService.updateAccount(
        HOUSEHOLD_ID,
        ACCOUNT_ID,
        { disposedAt: "2030-06-01", disposalAccountId: ACCOUNT_ID },
        mockCtx
      )
    ).rejects.toThrow("An account cannot dispose into itself");
  });
});
