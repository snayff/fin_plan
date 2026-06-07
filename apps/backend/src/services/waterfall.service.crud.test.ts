import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));
mock.module("./audit.service.js", () => ({
  audited: mock(({ mutation }: { mutation: (tx: typeof prismaMock) => unknown }) =>
    mutation(prismaMock)
  ),
}));

const { waterfallService } = await import("./waterfall.service.js");

const HH = "hh-1";
const ctx = { householdId: HH, actorId: "u-1", actorName: "Alice" };

beforeEach(() => {
  resetPrismaMocks();
  prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
});

// ─── Yearly (CommittedItem spendType=yearly) ──────────────────────────────────

describe("waterfallService yearly items", () => {
  it("listYearly returns enriched yearly committed items", async () => {
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "y1", householdId: HH, spendType: "yearly" },
    ] as any);
    const rows = await waterfallService.listYearly(HH);
    expect(rows[0]).toMatchObject({ id: "y1", amount: 0 });
    expect(prismaMock.committedItem.findMany).toHaveBeenCalledWith({
      where: { householdId: HH, spendType: "yearly" },
      orderBy: { sortOrder: "asc" },
    });
  });

  it("createYearly forces spendType yearly", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1", householdId: HH } as any);
    prismaMock.committedItem.create.mockResolvedValue({ id: "y1" } as any);
    await waterfallService.createYearly(
      HH,
      { subcategoryId: "sub-1", name: "Insurance" } as any,
      ctx
    );
    const call = (prismaMock.committedItem.create.mock.calls[0] as any)[0];
    expect(call.data.spendType).toBe("yearly");
  });

  it("updateYearly updates an owned item", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({ id: "y1", householdId: HH } as any);
    prismaMock.committedItem.update.mockResolvedValue({ id: "y1" } as any);
    await waterfallService.updateYearly(HH, "y1", { name: "Renamed" } as any, ctx);
    expect(prismaMock.committedItem.update).toHaveBeenCalled();
  });

  it("deleteYearly deletes an owned item", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({ id: "y1", householdId: HH } as any);
    prismaMock.committedItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteYearly(HH, "y1", ctx);
    expect(prismaMock.committedItem.delete).toHaveBeenCalledWith({ where: { id: "y1" } });
  });

  it("confirmYearly touches lastReviewedAt", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({ id: "y1", householdId: HH } as any);
    prismaMock.committedItem.update.mockResolvedValue({ id: "y1" } as any);
    await waterfallService.confirmYearly(HH, "y1");
    expect(prismaMock.committedItem.update).toHaveBeenCalledWith({
      where: { id: "y1" },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });

  it("confirmYearly rejects an item from another household", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "y1",
      householdId: "other",
    } as any);
    await expect(waterfallService.confirmYearly(HH, "y1")).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });
});

// ─── Committed delete/confirm ─────────────────────────────────────────────────

describe("waterfallService committed delete/confirm", () => {
  it("deleteCommitted deletes an owned item", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({ id: "c1", householdId: HH } as any);
    prismaMock.committedItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteCommitted(HH, "c1", ctx);
    expect(prismaMock.committedItem.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("confirmCommitted touches lastReviewedAt", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({ id: "c1", householdId: HH } as any);
    prismaMock.committedItem.update.mockResolvedValue({ id: "c1" } as any);
    await waterfallService.confirmCommitted(HH, "c1");
    expect(prismaMock.committedItem.update).toHaveBeenCalled();
  });
});

// ─── Discretionary list/update/delete/confirm ─────────────────────────────────

describe("waterfallService discretionary list/update/delete/confirm", () => {
  it("listDiscretionary enriches with linked account", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "d1", householdId: HH, linkedAccount: null },
    ] as any);
    const rows = await waterfallService.listDiscretionary(HH);
    expect(rows[0]).toMatchObject({ id: "d1", amount: 0 });
  });

  it("listDiscretionaryStale filters out planner-owned items", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([] as any);
    await waterfallService.listDiscretionaryStale(HH);
    const call = (prismaMock.discretionaryItem.findMany.mock.calls[0] as any)[0];
    expect(call.where.isPlannerOwned).toBe(false);
  });

  it("updateDiscretionary updates an owned item", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({ id: "d1", householdId: HH } as any);
    prismaMock.discretionaryItem.update.mockResolvedValue({ id: "d1" } as any);
    await waterfallService.updateDiscretionary(HH, "d1", { name: "X" } as any, ctx);
    expect(prismaMock.discretionaryItem.update).toHaveBeenCalled();
  });

  it("deleteDiscretionary deletes an owned item", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({ id: "d1", householdId: HH } as any);
    prismaMock.discretionaryItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteDiscretionary(HH, "d1", ctx);
    expect(prismaMock.discretionaryItem.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
  });

  it("confirmDiscretionary touches lastReviewedAt", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({ id: "d1", householdId: HH } as any);
    prismaMock.discretionaryItem.update.mockResolvedValue({ id: "d1" } as any);
    await waterfallService.confirmDiscretionary(HH, "d1");
    expect(prismaMock.discretionaryItem.update).toHaveBeenCalled();
  });
});

// ─── Savings (DiscretionaryItem in Savings subcategory) ───────────────────────

describe("waterfallService savings", () => {
  it("listSavings returns [] when no Savings subcategory exists", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue(null);
    const rows = await waterfallService.listSavings(HH);
    expect(rows).toEqual([]);
    expect(prismaMock.discretionaryItem.findMany).not.toHaveBeenCalled();
  });

  it("listSavings enriches items in the Savings subcategory", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-sav", householdId: HH } as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "s1", householdId: HH, linkedAccount: null },
    ] as any);
    const rows = await waterfallService.listSavings(HH);
    expect(rows[0]).toMatchObject({ id: "s1" });
  });

  it("createSavings defaults spendType to monthly", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-sav", householdId: HH } as any);
    prismaMock.discretionaryItem.create.mockResolvedValue({ id: "s1" } as any);
    await waterfallService.createSavings(HH, { subcategoryId: "sub-sav", name: "Pot" } as any, ctx);
    const call = (prismaMock.discretionaryItem.create.mock.calls[0] as any)[0];
    expect(call.data.spendType).toBe("monthly");
  });

  it("updateSavings updates an owned allocation", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({ id: "s1", householdId: HH } as any);
    prismaMock.discretionaryItem.update.mockResolvedValue({ id: "s1" } as any);
    await waterfallService.updateSavings(HH, "s1", { name: "X" } as any, ctx);
    expect(prismaMock.discretionaryItem.update).toHaveBeenCalled();
  });

  it("deleteSavings deletes an owned allocation", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({ id: "s1", householdId: HH } as any);
    prismaMock.discretionaryItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteSavings(HH, "s1", ctx);
    expect(prismaMock.discretionaryItem.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("confirmSavings touches lastReviewedAt", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({ id: "s1", householdId: HH } as any);
    prismaMock.discretionaryItem.update.mockResolvedValue({ id: "s1" } as any);
    await waterfallService.confirmSavings(HH, "s1");
    expect(prismaMock.discretionaryItem.update).toHaveBeenCalled();
  });

  it("confirmSavings rejects an allocation from another household", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "other",
    } as any);
    await expect(waterfallService.confirmSavings(HH, "s1")).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });
});

// ─── History ──────────────────────────────────────────────────────────────────

describe("waterfallService.getHistory", () => {
  it("returns history for an income source after verifying ownership", async () => {
    prismaMock.incomeSource.findUnique.mockResolvedValue({ id: "i1", householdId: HH } as any);
    prismaMock.waterfallHistory.findMany.mockResolvedValue([{ id: "h1" }] as any);
    const rows = await waterfallService.getHistory(HH, "income_source", "i1");
    expect(rows).toHaveLength(1);
    const call = (prismaMock.waterfallHistory.findMany.mock.calls[0] as any)[0];
    expect(call.where.itemId).toBe("i1");
  });

  it("returns history for a committed item", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({ id: "c1", householdId: HH } as any);
    prismaMock.waterfallHistory.findMany.mockResolvedValue([] as any);
    await waterfallService.getHistory(HH, "committed_item", "c1");
    expect(prismaMock.committedItem.findUnique).toHaveBeenCalled();
  });

  it("returns history for a discretionary item", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({ id: "d1", householdId: HH } as any);
    prismaMock.waterfallHistory.findMany.mockResolvedValue([] as any);
    await waterfallService.getHistory(HH, "discretionary_item", "d1");
    expect(prismaMock.discretionaryItem.findUnique).toHaveBeenCalled();
  });

  it("throws for an unknown item type", async () => {
    await expect(waterfallService.getHistory(HH, "bogus", "x")).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });

  it("rejects history for an item owned by another household", async () => {
    prismaMock.incomeSource.findUnique.mockResolvedValue({ id: "i1", householdId: "other" } as any);
    await expect(waterfallService.getHistory(HH, "income_source", "i1")).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });
});
