import { describe, it, expect, beforeEach, mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { waterfallService } = await import("./waterfall.service.js");

const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };

/** Build a single ItemAmountPeriod for an item (active now). */
function activePeriod(itemType: string, itemId: string, amount: number) {
  return {
    id: `p-${itemId}`,
    itemType,
    itemId,
    startDate: new Date("2020-01-01"),
    endDate: null,
    amount,
    createdAt: new Date(),
  };
}

beforeEach(() => {
  resetPrismaMocks();
  prismaMock.subcategory.findMany.mockResolvedValue([]);
  prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
  prismaMock.auditLog.create.mockResolvedValue({} as any);
  prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
});

// ─── List methods (period enrichment) ──────────────────────────────────────────

describe("waterfallService list methods enrich items with active period amounts", () => {
  it("listCommitted resolves the active period amount and lifecycle state", async () => {
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "ci-1", householdId: "hh-1", name: "Rent", spendType: "monthly" } as any,
    ]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      activePeriod("committed_item", "ci-1", 1200),
    ] as any);

    const result = await waterfallService.listCommitted("hh-1");

    expect(prismaMock.committedItem.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
      orderBy: { sortOrder: "asc" },
    });
    expect(result[0]).toMatchObject({ id: "ci-1", amount: 1200 });
    expect(result[0]).toHaveProperty("lifecycleState");
    expect(result[0]).toHaveProperty("periods");
  });

  it("listYearly filters to spendType=yearly", async () => {
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "ci-2", householdId: "hh-1", name: "Insurance", spendType: "yearly" } as any,
    ]);
    await waterfallService.listYearly("hh-1");
    expect(prismaMock.committedItem.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", spendType: "yearly" },
      orderBy: { sortOrder: "asc" },
    });
  });

  it("listDiscretionary includes the linked account", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "di-1", householdId: "hh-1", name: "Groceries", spendType: "monthly" } as any,
    ]);
    await waterfallService.listDiscretionary("hh-1");
    expect(prismaMock.discretionaryItem.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
      orderBy: { sortOrder: "asc" },
      include: { linkedAccount: { select: { id: true, name: true, type: true } } },
    });
  });

  it("listDiscretionaryStale excludes planner-owned items", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    await waterfallService.listDiscretionaryStale("hh-1");
    expect(prismaMock.discretionaryItem.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", isPlannerOwned: false },
      orderBy: { sortOrder: "asc" },
      include: { linkedAccount: { select: { id: true, name: true, type: true } } },
    });
  });

  it("listSavings returns [] when there is no Savings subcategory", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue(null);
    const result = await waterfallService.listSavings("hh-1");
    expect(result).toEqual([]);
    expect(prismaMock.discretionaryItem.findMany).not.toHaveBeenCalled();
  });

  it("listSavings queries items in the Savings subcategory when it exists", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-savings" } as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "di-s", householdId: "hh-1", name: "Emergency Fund", spendType: "monthly" } as any,
    ]);
    await waterfallService.listSavings("hh-1");
    expect(prismaMock.discretionaryItem.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", subcategoryId: "sub-savings" },
      orderBy: { sortOrder: "asc" },
      include: { linkedAccount: { select: { id: true, name: true, type: true } } },
    });
  });
});

// ─── Delete methods ─────────────────────────────────────────────────────────────

describe("waterfallService delete methods", () => {
  it("deleteIncome removes an owned income source", async () => {
    prismaMock.incomeSource.findUnique.mockResolvedValue({
      id: "inc-1",
      householdId: "hh-1",
    } as any);
    prismaMock.incomeSource.delete.mockResolvedValue({} as any);
    await waterfallService.deleteIncome("hh-1", "inc-1", ctx);
    expect(prismaMock.incomeSource.delete).toHaveBeenCalledWith({ where: { id: "inc-1" } });
  });

  it("deleteIncome throws NotFoundError when the item belongs to another household", async () => {
    prismaMock.incomeSource.findUnique.mockResolvedValue({
      id: "inc-1",
      householdId: "other",
    } as any);
    await expect(waterfallService.deleteIncome("hh-1", "inc-1", ctx)).rejects.toThrow(
      "Income source not found"
    );
    expect(prismaMock.incomeSource.delete).not.toHaveBeenCalled();
  });

  it("deleteCommitted removes an owned committed item", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "ci-1",
      householdId: "hh-1",
    } as any);
    prismaMock.committedItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteCommitted("hh-1", "ci-1", ctx);
    expect(prismaMock.committedItem.delete).toHaveBeenCalledWith({ where: { id: "ci-1" } });
  });

  it("deleteYearly removes an owned yearly committed item", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "ci-2",
      householdId: "hh-1",
    } as any);
    prismaMock.committedItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteYearly("hh-1", "ci-2", ctx);
    expect(prismaMock.committedItem.delete).toHaveBeenCalledWith({ where: { id: "ci-2" } });
  });

  it("deleteDiscretionary removes an owned, non-planner item", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
      isPlannerOwned: false,
    } as any);
    prismaMock.discretionaryItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteDiscretionary("hh-1", "di-1", ctx);
    expect(prismaMock.discretionaryItem.delete).toHaveBeenCalledWith({ where: { id: "di-1" } });
  });

  it("deleteDiscretionary refuses to delete a planner-owned item", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
      isPlannerOwned: true,
    } as any);
    await expect(waterfallService.deleteDiscretionary("hh-1", "di-1", ctx)).rejects.toThrow(
      "managed by the Gifts planner"
    );
    expect(prismaMock.discretionaryItem.delete).not.toHaveBeenCalled();
  });

  it("deleteSavings removes an owned savings allocation", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-s",
      householdId: "hh-1",
    } as any);
    prismaMock.discretionaryItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteSavings("hh-1", "di-s", ctx);
    expect(prismaMock.discretionaryItem.delete).toHaveBeenCalledWith({ where: { id: "di-s" } });
  });
});

// ─── Confirm methods ────────────────────────────────────────────────────────────

describe("waterfallService confirm methods stamp lastReviewedAt", () => {
  const cases = [
    ["confirmCommitted", "committedItem"],
    ["confirmYearly", "committedItem"],
    ["confirmDiscretionary", "discretionaryItem"],
    ["confirmSavings", "discretionaryItem"],
  ] as const;

  for (const [method, model] of cases) {
    it(`${method} updates lastReviewedAt for an owned item`, async () => {
      (prismaMock as any)[model].findUnique.mockResolvedValue({ id: "x-1", householdId: "hh-1" });
      (prismaMock as any)[model].update.mockResolvedValue({ id: "x-1" });
      await (waterfallService as any)[method]("hh-1", "x-1");
      expect((prismaMock as any)[model].update).toHaveBeenCalledWith({
        where: { id: "x-1" },
        data: { lastReviewedAt: expect.any(Date) },
      });
    });

    it(`${method} throws when the item is missing`, async () => {
      (prismaMock as any)[model].findUnique.mockResolvedValue(null);
      await expect((waterfallService as any)[method]("hh-1", "x-1")).rejects.toThrow("not found");
    });
  }
});

// ─── Update yearly / savings ────────────────────────────────────────────────────

describe("waterfallService.updateYearly", () => {
  it("updates an owned yearly item and sets lastReviewedAt", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "ci-2",
      householdId: "hh-1",
    } as any);
    prismaMock.committedItem.update.mockResolvedValue({ id: "ci-2" } as any);
    await waterfallService.updateYearly("hh-1", "ci-2", { name: "Renewed" }, ctx);
    expect(prismaMock.committedItem.update).toHaveBeenCalledWith({
      where: { id: "ci-2" },
      data: { name: "Renewed", lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("waterfallService.updateSavings", () => {
  it("updates an owned savings allocation and sets lastReviewedAt", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-s",
      householdId: "hh-1",
    } as any);
    prismaMock.discretionaryItem.update.mockResolvedValue({ id: "di-s" } as any);
    await waterfallService.updateSavings("hh-1", "di-s", { name: "Bigger fund" }, ctx);
    expect(prismaMock.discretionaryItem.update).toHaveBeenCalledWith({
      where: { id: "di-s" },
      data: { name: "Bigger fund", lastReviewedAt: expect.any(Date) },
    });
  });
});

// ─── updateDiscretionary branches ───────────────────────────────────────────────

describe("waterfallService.updateDiscretionary branches", () => {
  it("rejects updates to a planner-owned item", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
      isPlannerOwned: true,
    } as any);
    await expect(
      waterfallService.updateDiscretionary("hh-1", "di-1", { name: "x" }, ctx)
    ).rejects.toThrow("managed by the Gifts planner");
  });

  it("validates a new linked account and validates the target subcategory", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
      isPlannerOwned: false,
      subcategoryId: "sub-savings",
    } as any);
    // subcategory.findFirst is used by validateSubcategoryOwnership, validateLinkedAccount
    // and getSavingsSubcategoryId — all happy paths return the Savings subcategory.
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-savings",
      name: "Savings",
    } as any);
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "Savings" } as any);
    prismaMock.discretionaryItem.update.mockResolvedValue({ id: "di-1" } as any);

    await waterfallService.updateDiscretionary(
      "hh-1",
      "di-1",
      { subcategoryId: "sub-savings", linkedAccountId: "acc-1" } as any,
      ctx
    );

    expect(prismaMock.account.findFirst).toHaveBeenCalled();
    expect(prismaMock.discretionaryItem.update).toHaveBeenCalled();
  });

  it("auto-nulls the linked account when moving an item out of Savings", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
      isPlannerOwned: false,
      subcategoryId: "sub-savings",
    } as any);
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-savings",
      name: "Savings",
    } as any);
    prismaMock.discretionaryItem.update.mockResolvedValue({ id: "di-1" } as any);

    await waterfallService.updateDiscretionary(
      "hh-1",
      "di-1",
      { subcategoryId: "sub-food" } as any,
      ctx
    );

    expect(prismaMock.discretionaryItem.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: expect.objectContaining({ linkedAccountId: null }),
    });
  });
});

// ─── createDiscretionary guard branches ─────────────────────────────────────────

describe("waterfallService.createDiscretionary guard branches", () => {
  it("rejects creation in a planner-locked subcategory", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-gifts",
      lockedByPlanner: true,
    } as any);
    await expect(
      waterfallService.createDiscretionary(
        "hh-1",
        { name: "x", amount: 10, subcategoryId: "sub-gifts" },
        ctx
      )
    ).rejects.toThrow("managed by the Gifts planner");
  });

  it("validates a linked account when one is provided", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-savings",
      name: "Savings",
    } as any);
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "Pension" } as any);
    prismaMock.discretionaryItem.create.mockResolvedValue({ id: "di-new" } as any);

    await waterfallService.createDiscretionary(
      "hh-1",
      {
        name: "Pension top-up",
        amount: 100,
        subcategoryId: "sub-savings",
        linkedAccountId: "acc-1",
      } as any,
      ctx
    );

    expect(prismaMock.account.findFirst).toHaveBeenCalled();
    expect(prismaMock.discretionaryItem.create).toHaveBeenCalled();
  });

  it("rejects a linked account of an unsupported type", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-savings",
      name: "Savings",
    } as any);
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "Current" } as any);
    await expect(
      waterfallService.createDiscretionary(
        "hh-1",
        { name: "x", amount: 10, subcategoryId: "sub-savings", linkedAccountId: "acc-1" } as any,
        ctx
      )
    ).rejects.toThrow("Savings, StocksAndShares, or Pension");
  });
});

// ─── getHistory ─────────────────────────────────────────────────────────────────

describe("waterfallService.getHistory", () => {
  it("returns history for an owned income source within the 24-month window", async () => {
    prismaMock.incomeSource.findUnique.mockResolvedValue({
      id: "inc-1",
      householdId: "hh-1",
    } as any);
    prismaMock.waterfallHistory.findMany.mockResolvedValue([{ id: "h1" }] as any);
    const result = await waterfallService.getHistory("hh-1", "income_source", "inc-1");
    expect(result).toEqual([{ id: "h1" }] as any);
    expect(prismaMock.waterfallHistory.findMany).toHaveBeenCalledWith({
      where: { itemType: "income_source", itemId: "inc-1", recordedAt: { gte: expect.any(Date) } },
      orderBy: { recordedAt: "asc" },
    });
  });

  it("verifies ownership for committed_item history", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "ci-1",
      householdId: "hh-1",
    } as any);
    prismaMock.waterfallHistory.findMany.mockResolvedValue([] as any);
    await waterfallService.getHistory("hh-1", "committed_item", "ci-1");
    expect(prismaMock.committedItem.findUnique).toHaveBeenCalledWith({ where: { id: "ci-1" } });
  });

  it("verifies ownership for discretionary_item history", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
    } as any);
    prismaMock.waterfallHistory.findMany.mockResolvedValue([] as any);
    await waterfallService.getHistory("hh-1", "discretionary_item", "di-1");
    expect(prismaMock.discretionaryItem.findUnique).toHaveBeenCalledWith({ where: { id: "di-1" } });
  });

  it("throws for an unknown item type", async () => {
    await expect(waterfallService.getHistory("hh-1", "mystery", "x")).rejects.toThrow(
      "Unknown item type"
    );
  });

  it("throws when the referenced item is not owned", async () => {
    prismaMock.incomeSource.findUnique.mockResolvedValue({
      id: "inc-1",
      householdId: "other",
    } as any);
    await expect(waterfallService.getHistory("hh-1", "income_source", "inc-1")).rejects.toThrow(
      "Income source not found"
    );
  });
});

// ─── confirmBatch — all item-type labels ────────────────────────────────────────

describe("waterfallService.confirmBatch routes every item-type label", () => {
  it("dispatches bill, yearly, discretionary and savings labels to the right models", async () => {
    await waterfallService.confirmBatch("hh-1", {
      items: [
        { type: "committed_bill", id: "b1" },
        { type: "yearly_bill", id: "b2" },
        { type: "discretionary_category", id: "d1" },
        { type: "savings_allocation", id: "s1" },
      ] as any,
    });

    expect(prismaMock.committedItem.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.discretionaryItem.updateMany).toHaveBeenCalledTimes(2);
  });
});

// ─── deleteAll — empty household ─────────────────────────────────────────────────

describe("waterfallService.deleteAll with no items", () => {
  it("skips period cleanup when there is nothing to delete", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);

    await waterfallService.deleteAll("hh-1");

    expect(prismaMock.itemAmountPeriod.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.incomeSource.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
    expect(prismaMock.subcategory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
  });
});
