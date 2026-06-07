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
const ASSET_ID = "asset-1";
const ACCOUNT_ID = "account-1";

const mockCtx = {
  householdId: HOUSEHOLD_ID,
  actorId: "user-1",
  actorName: "Test User",
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

beforeEach(() => resetPrismaMocks());

describe("assetsService.createAsset — initial balance insert", () => {
  it("creates an opening AssetBalance when initialValue is provided", async () => {
    prismaMock.asset.create.mockResolvedValue({ id: ASSET_ID } as any);
    prismaMock.assetBalance.create.mockResolvedValue({} as any);

    await assetsService.createAsset(
      HOUSEHOLD_ID,
      { name: "House", type: "Property", initialValue: 250000 } as any,
      mockCtx
    );

    expect(prismaMock.assetBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: ASSET_ID, value: 250000 }),
    });
  });
});

describe("assetsService.updateAsset", () => {
  it("updates an owned asset", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.update.mockResolvedValue({ id: ASSET_ID, name: "New" } as any);

    await assetsService.updateAsset(HOUSEHOLD_ID, ASSET_ID, { name: "New" } as any, mockCtx);

    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: expect.objectContaining({ name: "New" }),
    });
  });

  it("rejects an asset owned by another household", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({ id: ASSET_ID, householdId: "other" } as any);
    await expect(
      assetsService.updateAsset(HOUSEHOLD_ID, ASSET_ID, { name: "x" } as any, mockCtx)
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("validates a new memberId belongs to the household", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", householdId: "other" } as any);
    await expect(
      assetsService.updateAsset(HOUSEHOLD_ID, ASSET_ID, { memberId: "m1" } as any, mockCtx)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("assetsService.deleteAsset", () => {
  it("deletes an owned asset", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.delete.mockResolvedValue({} as any);
    await assetsService.deleteAsset(HOUSEHOLD_ID, ASSET_ID, mockCtx);
    expect(prismaMock.asset.delete).toHaveBeenCalledWith({ where: { id: ASSET_ID } });
  });

  it("rejects deleting an asset from another household", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({ id: ASSET_ID, householdId: "other" } as any);
    await expect(assetsService.deleteAsset(HOUSEHOLD_ID, ASSET_ID, mockCtx)).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });
});

describe("assetsService.confirmAsset", () => {
  it("touches lastReviewedAt on an owned asset", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.update.mockResolvedValue({ id: ASSET_ID } as any);
    await assetsService.confirmAsset(HOUSEHOLD_ID, ASSET_ID, mockCtx);
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("assetsService.recordAccountBalance", () => {
  it("appends a balance row and touches lastReviewedAt", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.accountBalance.create.mockResolvedValue({ id: "ab-1" } as any);
    prismaMock.account.update.mockResolvedValue({} as any);

    await assetsService.recordAccountBalance(
      HOUSEHOLD_ID,
      ACCOUNT_ID,
      { value: 1234, date: "2026-06-01", note: "topup" } as any,
      mockCtx
    );

    expect(prismaMock.accountBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accountId: ACCOUNT_ID, value: 1234, note: "topup" }),
    });
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });

  it("rejects an account from another household", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: "other",
    } as any);
    await expect(
      assetsService.recordAccountBalance(
        HOUSEHOLD_ID,
        ACCOUNT_ID,
        { value: 1, date: "2026-06-01" } as any,
        mockCtx
      )
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });
});

describe("assetsService.confirmAccount", () => {
  it("touches lastReviewedAt on an owned account", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.account.update.mockResolvedValue({ id: ACCOUNT_ID } as any);
    await assetsService.confirmAccount(HOUSEHOLD_ID, ACCOUNT_ID, mockCtx);
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("assetsService.updateAccount — full mutation body", () => {
  it("nulls the contribution limit when the type changes away from Savings", async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce({ id: ACCOUNT_ID, householdId: HOUSEHOLD_ID } as any) // assertAccountOwned
      .mockResolvedValueOnce({
        id: ACCOUNT_ID,
        type: "Savings",
        monthlyContributionLimit: 500,
      } as any); // existing inside mutation
    prismaMock.account.update.mockResolvedValue({ id: ACCOUNT_ID } as any);

    await assetsService.updateAccount(
      HOUSEHOLD_ID,
      ACCOUNT_ID,
      { type: "Current" } as any,
      mockCtx
    );

    const call = (prismaMock.account.update.mock.calls[0] as any)[0];
    expect(call.data.monthlyContributionLimit).toBe(null);
  });
});

describe("assetsService.getIsaAllowanceSummary", () => {
  const today = new Date("2026-06-01T00:00:00Z");

  it("returns an empty member list when there are no ISA accounts", async () => {
    prismaMock.householdSettings.findUnique.mockResolvedValue({ isaAnnualLimit: 20000 } as any);
    prismaMock.account.findMany.mockResolvedValue([] as any);

    const summary = await assetsService.getIsaAllowanceSummary(HOUSEHOLD_ID, today);

    expect(summary.annualLimit).toBe(20000);
    expect(summary.byMember).toEqual([]);
    expect(summary.taxYearStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // no linked-item period lookup when there are no accounts
    expect(prismaMock.itemAmountPeriod.findMany).not.toHaveBeenCalled();
  });

  it("aggregates used allowance and forecast per member", async () => {
    prismaMock.householdSettings.findUnique.mockResolvedValue({ isaAnnualLimit: 20000 } as any);
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "acc-1",
        memberId: "m1",
        member: { id: "m1", name: "Alice" },
        isaYearContribution: 5000,
        growthRatePct: null,
        linkedItems: [{ id: "li-1", spendType: "monthly", dueDate: today }],
      },
      {
        id: "acc-2",
        memberId: "m2",
        member: { id: "m2", name: "Bob" },
        isaYearContribution: 1000,
        growthRatePct: null,
        linkedItems: [],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      { itemId: "li-1", amount: 200 },
    ] as any);

    const summary = await assetsService.getIsaAllowanceSummary(HOUSEHOLD_ID, today);

    expect(summary.byMember).toHaveLength(2);
    const alice = summary.byMember.find((m) => m.memberId === "m1")!;
    expect(alice.used).toBe(5000);
    expect(alice.forecast).toBeGreaterThan(0);
    expect(alice.forecastedYearTotal).toBe(alice.used + alice.forecast);
    // sorted alphabetically: Alice before Bob
    expect(summary.byMember[0]!.name).toBe("Alice");
  });

  it("skips ISA accounts that have no member attached", async () => {
    prismaMock.householdSettings.findUnique.mockResolvedValue(null); // default limit path
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "acc-1",
        memberId: null,
        member: null,
        isaYearContribution: 5000,
        growthRatePct: null,
        linkedItems: [],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);

    const summary = await assetsService.getIsaAllowanceSummary(HOUSEHOLD_ID, today);
    expect(summary.annualLimit).toBe(20000); // default when settings missing
    expect(summary.byMember).toEqual([]);
  });
});
