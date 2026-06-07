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
const ctx = {
  householdId: HOUSEHOLD_ID,
  actorId: "user-1",
  actorName: "Test User",
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

beforeEach(() => resetPrismaMocks());

// ── Asset mutations ───────────────────────────────────────────────────────────

describe("assetsService.updateAsset", () => {
  it("updates an owned asset", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.update.mockResolvedValue({ id: ASSET_ID, name: "New name" } as any);

    const result = await assetsService.updateAsset(
      HOUSEHOLD_ID,
      ASSET_ID,
      { name: "New name" },
      ctx
    );

    expect(result).toMatchObject({ id: ASSET_ID });
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: expect.objectContaining({ name: "New name" }),
    });
  });

  it("validates the member when memberId is supplied", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.member.findUnique.mockResolvedValue({ id: "m-x", householdId: "other" } as any);

    await expect(
      assetsService.updateAsset(HOUSEHOLD_ID, ASSET_ID, { memberId: "m-x" } as any, ctx)
    ).rejects.toThrow("Member not found in household");
  });

  it("throws NotFoundError for an asset owned by another household", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({ id: ASSET_ID, householdId: "other" } as any);
    await expect(
      assetsService.updateAsset(HOUSEHOLD_ID, ASSET_ID, { name: "x" }, ctx)
    ).rejects.toThrow("Asset not found");
  });
});

describe("assetsService.deleteAsset", () => {
  it("deletes an owned asset", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.delete.mockResolvedValue({ id: ASSET_ID } as any);
    await assetsService.deleteAsset(HOUSEHOLD_ID, ASSET_ID, ctx);
    expect(prismaMock.asset.delete).toHaveBeenCalledWith({ where: { id: ASSET_ID } });
  });
});

describe("assetsService.recordAssetBalance", () => {
  it("creates a balance row and stamps lastReviewedAt", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.assetBalance.create.mockResolvedValue({ id: "ab-1", value: 1000 } as any);
    prismaMock.asset.update.mockResolvedValue({} as any);

    const result = await assetsService.recordAssetBalance(
      HOUSEHOLD_ID,
      ASSET_ID,
      { value: 1000, date: "2026-01-01" },
      ctx
    );

    expect(result).toMatchObject({ id: "ab-1" });
    expect(prismaMock.assetBalance.create).toHaveBeenCalledWith({
      data: { assetId: ASSET_ID, value: 1000, date: new Date("2026-01-01"), note: null },
    });
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("assetsService.confirmAsset", () => {
  it("stamps lastReviewedAt on an owned asset", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.update.mockResolvedValue({ id: ASSET_ID } as any);
    await assetsService.confirmAsset(HOUSEHOLD_ID, ASSET_ID, ctx);
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });
});

// ── Account mutations ─────────────────────────────────────────────────────────

describe("assetsService.updateAccount", () => {
  it("clears the contribution limit when the account is no longer Savings", async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce({ id: ACCOUNT_ID, householdId: HOUSEHOLD_ID }) // assertAccountOwned
      .mockResolvedValueOnce({
        id: ACCOUNT_ID,
        type: "Savings",
        monthlyContributionLimit: 300,
      }); // mutation read
    prismaMock.account.update.mockResolvedValue({ id: ACCOUNT_ID } as any);

    await assetsService.updateAccount(HOUSEHOLD_ID, ACCOUNT_ID, { type: "Current" } as any, ctx);

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: expect.objectContaining({ type: "Current", monthlyContributionLimit: null }),
    });
  });

  it("throws NotFoundError when the account is not owned", async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);
    await expect(
      assetsService.updateAccount(HOUSEHOLD_ID, ACCOUNT_ID, { name: "x" } as any, ctx)
    ).rejects.toThrow("Account not found");
  });
});

describe("assetsService.recordAccountBalance", () => {
  it("creates a balance row and stamps lastReviewedAt", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.accountBalance.create.mockResolvedValue({ id: "acb-1", value: 2500 } as any);
    prismaMock.account.update.mockResolvedValue({} as any);

    const result = await assetsService.recordAccountBalance(
      HOUSEHOLD_ID,
      ACCOUNT_ID,
      { value: 2500, date: "2026-02-02", note: "payday" },
      ctx
    );

    expect(result).toMatchObject({ id: "acb-1" });
    expect(prismaMock.accountBalance.create).toHaveBeenCalledWith({
      data: { accountId: ACCOUNT_ID, value: 2500, date: new Date("2026-02-02"), note: "payday" },
    });
  });
});

describe("assetsService.confirmAccount", () => {
  it("stamps lastReviewedAt on an owned account", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.account.update.mockResolvedValue({ id: ACCOUNT_ID } as any);
    await assetsService.confirmAccount(HOUSEHOLD_ID, ACCOUNT_ID, ctx);
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });
});

// ── ISA allowance — empty branch ──────────────────────────────────────────────

describe("assetsService.getIsaAllowanceSummary", () => {
  it("returns an empty byMember list when there are no ISA accounts", async () => {
    prismaMock.householdSettings.findUnique.mockResolvedValue({ isaAnnualLimit: 20000 } as any);
    prismaMock.account.findMany.mockResolvedValue([]);

    const result = await assetsService.getIsaAllowanceSummary(HOUSEHOLD_ID, new Date("2026-06-01"));

    expect(result.byMember).toEqual([]);
    expect(result.annualLimit).toBe(20000);
    expect(result.taxYearStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
