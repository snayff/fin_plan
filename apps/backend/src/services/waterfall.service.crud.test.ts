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
    prismaMock.itemAmountPeriod.deleteMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.waterfallHistory.deleteMany.mockResolvedValue({ count: 1 } as any);
    await waterfallService.deleteIncome("hh-1", "inc-1", ctx);
    expect(prismaMock.incomeSource.delete).toHaveBeenCalledWith({ where: { id: "inc-1" } });
    // #132: polymorphic period/history rows are cleaned up by itemType/itemId.
    expect(prismaMock.itemAmountPeriod.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "income_source", itemId: "inc-1" },
    });
    expect(prismaMock.waterfallHistory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "income_source", itemId: "inc-1" },
    });
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
    expect(prismaMock.itemAmountPeriod.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "committed_item", itemId: "ci-1" },
    });
    expect(prismaMock.waterfallHistory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "committed_item", itemId: "ci-1" },
    });
  });

  it("deleteYearly removes an owned yearly committed item", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "ci-2",
      householdId: "hh-1",
    } as any);
    prismaMock.committedItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteYearly("hh-1", "ci-2", ctx);
    expect(prismaMock.committedItem.delete).toHaveBeenCalledWith({ where: { id: "ci-2" } });
    // Yearly items are CommittedItem rows → committed_item itemType.
    expect(prismaMock.itemAmountPeriod.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "committed_item", itemId: "ci-2" },
    });
    expect(prismaMock.waterfallHistory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "committed_item", itemId: "ci-2" },
    });
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
    expect(prismaMock.itemAmountPeriod.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "discretionary_item", itemId: "di-1" },
    });
    expect(prismaMock.waterfallHistory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "discretionary_item", itemId: "di-1" },
    });
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
      isPlannerOwned: false,
    } as any);
    prismaMock.discretionaryItem.delete.mockResolvedValue({} as any);
    await waterfallService.deleteSavings("hh-1", "di-s", ctx);
    expect(prismaMock.discretionaryItem.delete).toHaveBeenCalledWith({ where: { id: "di-s" } });
    expect(prismaMock.itemAmountPeriod.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "discretionary_item", itemId: "di-s" },
    });
    expect(prismaMock.waterfallHistory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", itemType: "discretionary_item", itemId: "di-s" },
    });
  });

  // #129: planner-owned items (e.g. the synced Gifts item) must not be
  // mutable through the /savings path.
  it("deleteSavings refuses to delete a planner-owned item", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-s",
      householdId: "hh-1",
      isPlannerOwned: true,
    } as any);
    await expect(waterfallService.deleteSavings("hh-1", "di-s", ctx)).rejects.toThrow(
      "managed by the Gifts planner"
    );
    expect(prismaMock.discretionaryItem.delete).not.toHaveBeenCalled();
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

  const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };

  for (const [method, model] of cases) {
    it(`${method} updates lastReviewedAt for an owned item`, async () => {
      (prismaMock as any)[model].findUnique.mockResolvedValue({ id: "x-1", householdId: "hh-1" });
      (prismaMock as any)[model].update.mockResolvedValue({ id: "x-1" });
      prismaMock.auditLog.create.mockResolvedValue({} as any);
      await (waterfallService as any)[method]("hh-1", "x-1", ctx);
      expect((prismaMock as any)[model].update).toHaveBeenCalledWith({
        where: { id: "x-1" },
        data: { lastReviewedAt: expect.any(Date) },
      });
    });

    it(`${method} throws when the item is missing`, async () => {
      (prismaMock as any)[model].findUnique.mockResolvedValue(null);
      await expect((waterfallService as any)[method]("hh-1", "x-1", ctx)).rejects.toThrow(
        "not found"
      );
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

  // #129: planner-owned items must not be editable through the /savings path.
  it("rejects updates to a planner-owned item", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-s",
      householdId: "hh-1",
      isPlannerOwned: true,
    } as any);
    await expect(
      waterfallService.updateSavings("hh-1", "di-s", { name: "x" }, ctx)
    ).rejects.toThrow("managed by the Gifts planner");
    expect(prismaMock.discretionaryItem.update).not.toHaveBeenCalled();
  });
});

// ─── createSavings guard (#129) ─────────────────────────────────────────────────

describe("waterfallService.createSavings guard branches", () => {
  it("rejects creation in a planner-locked subcategory", async () => {
    // validateSubcategoryOwnership and validateSubcategoryNotPlannerLocked both
    // call subcategory.findFirst; the locked flag short-circuits with a 400.
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-gifts",
      lockedByPlanner: true,
    } as any);
    await expect(
      waterfallService.createSavings(
        "hh-1",
        { name: "x", amount: 10, subcategoryId: "sub-gifts" },
        ctx
      )
    ).rejects.toThrow("managed by the Gifts planner");
    expect(prismaMock.discretionaryItem.create).not.toHaveBeenCalled();
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

// ─── Bug #108: amount / frequency / dueDate edits persist via update ────────────

describe("waterfallService update methods persist amount to the current period (bug #108)", () => {
  /** A single active (open-ended) period covering `now`. */
  function currentPeriod(itemType: string, itemId: string, amount: number) {
    return {
      id: `p-${itemId}`,
      householdId: "hh-1",
      itemType,
      itemId,
      startDate: new Date("2020-01-01"),
      endDate: null,
      amount,
      createdAt: new Date(),
    };
  }

  it("updateIncome writes amount to the current period and never forwards it to incomeSource.update", async () => {
    prismaMock.incomeSource.findUnique.mockResolvedValue({
      id: "inc-1",
      householdId: "hh-1",
    } as any);
    prismaMock.incomeSource.update.mockResolvedValue({ id: "inc-1" } as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      currentPeriod("income_source", "inc-1", 1000),
    ] as any);
    prismaMock.itemAmountPeriod.update.mockResolvedValue({} as any);

    await waterfallService.updateIncome(
      "hh-1",
      "inc-1",
      { amount: 1500, frequency: "annual" } as any,
      ctx
    );

    // frequency is a real income column → forwarded to the item update
    expect(prismaMock.incomeSource.update).toHaveBeenCalledWith({
      where: { id: "inc-1" },
      data: { frequency: "annual", lastReviewedAt: expect.any(Date) },
    });
    // amount must NOT leak into the item update (no `amount` column on the row)
    const incomeUpdateArg = prismaMock.incomeSource.update.mock.calls[0]![0] as any;
    expect(incomeUpdateArg.data).not.toHaveProperty("amount");
    // amount goes to the current effective period
    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p-inc-1" },
      data: { amount: 1500 },
    });
  });

  it("updateCommitted writes amount to the current period and keeps it off committedItem.update", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "ci-1",
      householdId: "hh-1",
    } as any);
    prismaMock.committedItem.update.mockResolvedValue({ id: "ci-1" } as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      currentPeriod("committed_item", "ci-1", 200),
    ] as any);
    prismaMock.itemAmountPeriod.update.mockResolvedValue({} as any);

    await waterfallService.updateCommitted("hh-1", "ci-1", { amount: 350 } as any, ctx);

    const arg = prismaMock.committedItem.update.mock.calls[0]![0] as any;
    expect(arg.data).not.toHaveProperty("amount");
    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p-ci-1" },
      data: { amount: 350 },
    });
  });

  it("updateDiscretionary persists amount AND dueDate (dueDate is a real column)", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
      isPlannerOwned: false,
      subcategoryId: "sub-food",
    } as any);
    // getSavingsSubcategoryId → no Savings subcategory, so no auto-null branch
    prismaMock.subcategory.findFirst.mockResolvedValue(null);
    prismaMock.discretionaryItem.update.mockResolvedValue({ id: "di-1" } as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      currentPeriod("discretionary_item", "di-1", 50),
    ] as any);
    prismaMock.itemAmountPeriod.update.mockResolvedValue({} as any);

    const due = new Date("2026-09-01");
    await waterfallService.updateDiscretionary(
      "hh-1",
      "di-1",
      { amount: 75, dueDate: due } as any,
      ctx
    );

    const arg = prismaMock.discretionaryItem.update.mock.calls[0]![0] as any;
    expect(arg.data).not.toHaveProperty("amount");
    expect(arg.data).toMatchObject({ dueDate: due });
    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p-di-1" },
      data: { amount: 75 },
    });
  });

  it("creates a period starting today when no effective period exists", async () => {
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "ci-9",
      householdId: "hh-1",
    } as any);
    prismaMock.committedItem.update.mockResolvedValue({ id: "ci-9" } as any);
    // No periods at all → setCurrentAmount must create one
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.create.mockResolvedValue({} as any);

    await waterfallService.updateCommitted("hh-1", "ci-9", { amount: 99 } as any, ctx);

    expect(prismaMock.itemAmountPeriod.update).not.toHaveBeenCalled();
    expect(prismaMock.itemAmountPeriod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: "hh-1",
        itemType: "committed_item",
        itemId: "ci-9",
        amount: 99,
      }),
    });
  });

  it("does not touch periods when amount is omitted", async () => {
    prismaMock.incomeSource.findUnique.mockResolvedValue({
      id: "inc-2",
      householdId: "hh-1",
    } as any);
    prismaMock.incomeSource.update.mockResolvedValue({ id: "inc-2" } as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);

    await waterfallService.updateIncome("hh-1", "inc-2", { name: "Renamed" } as any, ctx);

    expect(prismaMock.itemAmountPeriod.update).not.toHaveBeenCalled();
    expect(prismaMock.itemAmountPeriod.create).not.toHaveBeenCalled();
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
      where: {
        householdId: "hh-1",
        itemType: "income_source",
        itemId: "inc-1",
        recordedAt: { gte: expect.any(Date) },
      },
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
    prismaMock.auditLog.create.mockResolvedValue({} as any);
    await waterfallService.confirmBatch(
      "hh-1",
      {
        items: [
          { type: "committed_bill", id: "b1" },
          { type: "yearly_bill", id: "b2" },
          { type: "discretionary_category", id: "d1" },
          { type: "savings_allocation", id: "s1" },
        ] as any,
      },
      { householdId: "hh-1", actorId: "user-1", actorName: "Test" }
    );

    expect(prismaMock.committedItem.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.discretionaryItem.updateMany).toHaveBeenCalledTimes(2);
  });
});

// ─── deleteAll ───────────────────────────────────────────────────────────────────

describe("waterfallService.deleteAll", () => {
  it("scopes every delete to the household", async () => {
    await waterfallService.deleteAll("hh-1");

    expect(prismaMock.itemAmountPeriod.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
    expect(prismaMock.incomeSource.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
    expect(prismaMock.subcategory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
  });
});

// ─── #130: item + initial period created atomically ────────────────────────────

describe("waterfallService create methods create the opening period atomically", () => {
  it("createIncome writes the initial period inside the same transaction", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-income" } as any);
    prismaMock.incomeSource.create.mockResolvedValue({ id: "inc-new" } as any);
    prismaMock.itemAmountPeriod.create.mockResolvedValue({ id: "p-new" } as any);

    await waterfallService.createIncome(
      "hh-1",
      { name: "Salary", amount: 1000, frequency: "monthly", subcategoryId: "sub-income" } as any,
      ctx,
      { startDate: new Date("2026-01-01"), amount: 1000 }
    );

    expect(prismaMock.incomeSource.create).toHaveBeenCalled();
    expect(prismaMock.itemAmountPeriod.create).toHaveBeenCalledWith({
      data: {
        householdId: "hh-1",
        itemType: "income_source",
        itemId: "inc-new",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 1000,
      },
    });
  });

  it("rolls the item back when the initial period fails (error propagates)", async () => {
    // $transaction runs the callback against the same mock; a rejected period
    // create rejects the whole audited transaction, so the item never commits.
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-income" } as any);
    prismaMock.incomeSource.create.mockResolvedValue({ id: "inc-new" } as any);
    prismaMock.itemAmountPeriod.create.mockRejectedValue(new Error("period insert failed"));

    await expect(
      waterfallService.createIncome(
        "hh-1",
        { name: "Salary", amount: 1000, frequency: "monthly", subcategoryId: "sub-income" } as any,
        ctx,
        { startDate: new Date("2026-01-01"), amount: 1000 }
      )
    ).rejects.toThrow("period insert failed");
  });

  it("does not create any period when no initialPeriod is supplied", async () => {
    prismaMock.committedItem.create.mockResolvedValue({ id: "ci-new" } as any);
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1" } as any);

    await waterfallService.createCommitted(
      "hh-1",
      { name: "Rent", amount: 500, subcategoryId: "sub-1", spendType: "monthly" } as any,
      ctx
    );

    expect(prismaMock.itemAmountPeriod.create).not.toHaveBeenCalled();
  });
});
