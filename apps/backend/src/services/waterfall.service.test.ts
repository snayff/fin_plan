import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { waterfallService } = await import("./waterfall.service.js");

/** Helper to create an ItemAmountPeriod mock for a given item */
function makePeriod(
  itemType: "income_source" | "committed_item" | "discretionary_item",
  itemId: string,
  amount: number
) {
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
  // Default: no subcategories and no periods (tests that need them can override)
  prismaMock.subcategory.findMany.mockResolvedValue([]);
  prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
});

describe("waterfallService.listIncome", () => {
  it("returns income sources with dueDate field", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "inc-1",
        householdId: "hh-1",
        name: "Salary",
        frequency: "monthly",
        dueDate: new Date("2026-04-25"),
        sortOrder: 0,
        subcategoryId: "sub-1",
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);
    const result = await waterfallService.listIncome("hh-1");
    expect(result[0]).toHaveProperty("dueDate");
    expect((result[0] as any).dueDate).toBeInstanceOf(Date);
  });
});

describe("waterfallService.confirmIncome", () => {
  it("updates lastReviewedAt to current timestamp", async () => {
    const id = "inc-1";
    const householdId = "hh-1";
    const now = new Date();

    prismaMock.incomeSource.findUnique.mockResolvedValue({ id, householdId, amount: 3000 } as any);
    prismaMock.incomeSource.update.mockResolvedValue({ id, lastReviewedAt: now } as any);

    const result = await waterfallService.confirmIncome(householdId, id);

    expect(prismaMock.incomeSource.update).toHaveBeenCalledWith({
      where: { id },
      data: { lastReviewedAt: expect.any(Date) },
    });
    expect(result).toMatchObject({ id });
  });
});

describe("waterfallService.confirmBatch", () => {
  it("updates lastReviewedAt on all specified items", async () => {
    const householdId = "hh-1";
    const items = [
      { type: "income_source" as const, id: "inc-1" },
      { type: "committed_item" as const, id: "bill-1" },
    ];

    await waterfallService.confirmBatch(householdId, { items });

    expect(prismaMock.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { id: "inc-1", householdId },
      data: { lastReviewedAt: expect.any(Date) },
    });
    expect(prismaMock.committedItem.updateMany).toHaveBeenCalledWith({
      where: { id: "bill-1", householdId },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("waterfallService.updateIncome", () => {
  it("updates the income source and sets lastReviewedAt", async () => {
    const id = "inc-1";
    const householdId = "hh-1";
    const ctx = { householdId, actorId: "user-1", actorName: "Test" };

    prismaMock.incomeSource.findUnique.mockResolvedValue({
      id,
      householdId,
    } as any);
    prismaMock.incomeSource.update.mockResolvedValue({ id, name: "Salary" } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.updateIncome(householdId, id, { name: "Salary" }, ctx);

    expect(prismaMock.incomeSource.update).toHaveBeenCalledWith({
      where: { id },
      data: { name: "Salary", lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("waterfallService.getWaterfallSummary — income.byType", () => {
  const makeSource = (overrides: object) => ({
    id: "s1",
    householdId: "hh-1",
    name: "Source",
    frequency: "monthly" as const,
    incomeType: "other" as const,
    dueDate: new Date("2026-01-01"),
    memberId: null,
    sortOrder: 0,
    endedAt: null,
    lastReviewedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
  });

  it("groups monthly and annual sources by incomeType", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "monthly", incomeType: "salary" }),
      makeSource({ id: "s2", frequency: "annual", incomeType: "dividends" }),
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 5000),
      makePeriod("income_source", "s2", 12000),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    const salaryGroup = summary.income.byType.find((g) => g.type === "salary");
    expect(salaryGroup).toBeDefined();
    expect(salaryGroup!.monthlyTotal).toBe(5000);
    expect(salaryGroup!.sources).toHaveLength(1);

    const divGroup = summary.income.byType.find((g) => g.type === "dividends");
    expect(divGroup).toBeDefined();
    expect(divGroup!.monthlyTotal).toBe(1000); // 12000 / 12
  });

  it("excludes one_off sources from byType", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "one_off", incomeType: "other" }),
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 2000),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");
    expect(summary.income.byType).toHaveLength(0);
  });

  it("uses canonical label for each type", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "monthly", incomeType: "freelance" }),
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 1000),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");
    expect(summary.income.byType[0]!.label).toBe("Freelance");
  });
});

describe("waterfallService.getWaterfallSummary — totals and surplus", () => {
  const makeSource = (overrides: object) => ({
    id: "s1",
    householdId: "hh-1",
    name: "Source",
    frequency: "monthly" as const,
    incomeType: "other" as const,
    dueDate: new Date("2026-01-01"),
    memberId: null,
    sortOrder: 0,
    endedAt: null,
    lastReviewedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it("counts monthly income at face value and annual income at amount/12", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "monthly" }),
      makeSource({ id: "s2", frequency: "annual" }),
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 3000),
      makePeriod("income_source", "s2", 24000),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // 3000 (monthly) + 24000/12 (annual) = 5000
    expect(summary.income.total).toBe(5000);
  });

  it("excludes one_off sources from income total", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "monthly" }),
      makeSource({ id: "s2", frequency: "one_off" }),
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 2000),
      makePeriod("income_source", "s2", 5000),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    expect(summary.income.total).toBe(2000);
    expect(summary.income.oneOff).toHaveLength(1);
  });

  it("calculates committed monthlyTotal and monthlyAvg12 correctly", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "b1", householdId: "hh-1", name: "Rent", spendType: "monthly" },
      { id: "b2", householdId: "hh-1", name: "Internet", spendType: "monthly" },
      {
        id: "y1",
        householdId: "hh-1",
        name: "Insurance",
        spendType: "yearly",
        dueDate: new Date("2026-03-15"),
      },
    ] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("committed_item", "b1", 1200),
      makePeriod("committed_item", "b2", 50),
      makePeriod("committed_item", "y1", 600),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    expect(summary.committed.monthlyTotal).toBe(1250); // 1200 + 50
    expect(summary.committed.monthlyAvg12).toBe(50); // 600 / 12
  });

  it("calculates surplus amount and percentOfIncome", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "monthly" }),
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "b1", householdId: "hh-1", name: "Rent", spendType: "monthly" },
      {
        id: "y1",
        householdId: "hh-1",
        name: "Car tax",
        spendType: "yearly",
        dueDate: new Date("2026-06-15"),
      },
    ] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      {
        id: "d1",
        householdId: "hh-1",
        name: "Groceries",
        spendType: "monthly",
      },
      {
        id: "sv1",
        householdId: "hh-1",
        name: "Emergency fund",
        spendType: "monthly",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 4000),
      makePeriod("committed_item", "b1", 1200),
      makePeriod("committed_item", "y1", 1200),
      makePeriod("discretionary_item", "d1", 500),
      makePeriod("discretionary_item", "sv1", 200),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // income: 4000
    // committed: 1200 (monthly) + 100 (1200/12 yearly) = 1300
    // discretionary: 500 + 200 = 700
    // surplus: 4000 - 1300 - 700 = 2000
    expect(summary.surplus.amount).toBe(2000);
    expect(summary.surplus.percentOfIncome).toBe(50); // 2000/4000 * 100
  });

  it("returns percentOfIncome of 0 when income total is 0", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    expect(summary.surplus.percentOfIncome).toBe(0);
  });
});

describe("waterfallService.getWaterfallSummary — toGBP rounding", () => {
  const makeSource = (overrides: object) => ({
    id: "s1",
    householdId: "hh-1",
    name: "Source",
    frequency: "monthly" as const,
    incomeType: "other" as const,
    dueDate: new Date("2026-01-01"),
    memberId: null,
    sortOrder: 0,
    endedAt: null,
    lastReviewedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it("rounds surplus amount to 2dp", async () => {
    // 1000/3 = 333.333... per month — surplus should be rounded
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "annual" }),
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 1000),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // income: 1000/12 = 83.333... → toGBP → 83.33
    expect(summary.income.total).toBe(83.33);
    expect(summary.surplus.amount).toBe(83.33);
  });

  it("rounds percentOfIncome to 2dp", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "monthly" }),
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "b1", householdId: "hh-1", name: "Rent", spendType: "monthly" },
      {
        id: "y1",
        householdId: "hh-1",
        name: "Insurance",
        spendType: "yearly",
        dueDate: new Date("2026-03-15"),
      },
    ] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 3000),
      makePeriod("committed_item", "b1", 1000),
      makePeriod("committed_item", "y1", 1000),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // income: 3000
    // committed: 1000 bills + 1000/12 yearly = 1083.33
    // surplus: 3000 - 1083.33 = 1916.67
    // percent: (1916.67 / 3000) * 100 = 63.89
    expect(summary.surplus.amount).toBe(1916.67);
    expect(summary.surplus.percentOfIncome).toBe(63.89);
  });
});

describe("waterfallService.createCommitted (CommittedItem)", () => {
  it("creates a committed item with subcategoryId and notes", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1" } as any);
    prismaMock.committedItem.create.mockResolvedValue({
      id: "ci-1",
      householdId: "hh-1",
      subcategoryId: "sub-1",
      name: "Rent",
      amount: 1200,
      spendType: "monthly",
      notes: "Fixed rate until 2027",
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await waterfallService.createCommitted(
      "hh-1",
      {
        name: "Rent",
        amount: 1200,
        subcategoryId: "sub-1",
        notes: "Fixed rate until 2027",
      },
      ctx
    );

    expect(result.subcategoryId).toBe("sub-1");
    expect(result.notes).toBe("Fixed rate until 2027");
    expect(prismaMock.committedItem.create).toHaveBeenCalled();
  });
});

describe("waterfallService.createYearly (CommittedItem with spendType=yearly)", () => {
  it("creates a committed item with spendType=yearly and dueDate", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1" } as any);
    prismaMock.committedItem.create.mockResolvedValue({
      id: "ci-2",
      householdId: "hh-1",
      name: "Insurance",
      amount: 600,
      spendType: "yearly",
      dueDate: new Date("2026-03-15"),
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await waterfallService.createYearly(
      "hh-1",
      {
        name: "Insurance",
        amount: 600,
        subcategoryId: "sub-1",
        dueDate: new Date("2026-03-15"),
      },
      ctx
    );

    expect(result.spendType).toBe("yearly");
    expect((result as any).dueDate).toEqual(new Date("2026-03-15"));
  });
});

describe("waterfallService.updateCommitted (CommittedItem)", () => {
  it("updates the committed item and sets lastReviewedAt", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.committedItem.findUnique.mockResolvedValue({
      id: "ci-1",
      householdId: "hh-1",
    } as any);
    prismaMock.committedItem.update.mockResolvedValue({ id: "ci-1", name: "Updated Rent" } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.updateCommitted("hh-1", "ci-1", { name: "Updated Rent" }, ctx);

    expect(prismaMock.committedItem.update).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { name: "Updated Rent", lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("waterfallService.createDiscretionary (DiscretionaryItem)", () => {
  it("creates a discretionary item with subcategoryId", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-food" } as any);
    prismaMock.discretionaryItem.create.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
      subcategoryId: "sub-food",
      name: "Groceries",
      amount: 500,
      spendType: "monthly",
      notes: null,
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await waterfallService.createDiscretionary(
      "hh-1",
      {
        name: "Groceries",
        amount: 500,
        subcategoryId: "sub-food",
      },
      ctx
    );

    expect(result.subcategoryId).toBe("sub-food");
    expect(prismaMock.discretionaryItem.create).toHaveBeenCalled();
  });
});

describe("waterfallService.createSavings (DiscretionaryItem)", () => {
  it("creates a discretionary item", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-savings" } as any);
    prismaMock.discretionaryItem.create.mockResolvedValue({
      id: "di-2",
      householdId: "hh-1",
      subcategoryId: "sub-savings",
      name: "Emergency Fund",
      amount: 200,
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await waterfallService.createSavings(
      "hh-1",
      {
        name: "Emergency Fund",
        amount: 200,
        subcategoryId: "sub-savings",
      },
      ctx
    );

    expect(result.id).toBe("di-2");
  });
});

describe("waterfallService.updateDiscretionary (DiscretionaryItem)", () => {
  it("updates the discretionary item and sets lastReviewedAt", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "di-1",
      householdId: "hh-1",
    } as any);
    prismaMock.discretionaryItem.update.mockResolvedValue({
      id: "di-1",
      name: "Updated Groceries",
    } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.updateDiscretionary("hh-1", "di-1", { name: "Updated Groceries" }, ctx);

    expect(prismaMock.discretionaryItem.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: { name: "Updated Groceries", lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("waterfallService.getWaterfallSummary — consolidated models", () => {
  const makeSource = (overrides: object) => ({
    id: "s1",
    householdId: "hh-1",
    name: "Source",
    frequency: "monthly" as const,
    incomeType: "other" as const,
    dueDate: new Date("2026-01-01"),
    memberId: null,
    sortOrder: 0,
    endedAt: null,
    lastReviewedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    subcategoryId: "sub-other-inc",
    notes: null,
    ...overrides,
  });

  beforeEach(() => {
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.subcategory.findFirst.mockResolvedValue(null);
  });

  it("splits committed items into bills and yearlyBills by spendType", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "ci-1",
        householdId: "hh-1",
        name: "Rent",
        spendType: "monthly",
        dueDate: new Date("2026-01-01"),
        memberId: null,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "sub-1",
        notes: null,
      },
      {
        id: "ci-2",
        householdId: "hh-1",
        name: "Insurance",
        spendType: "yearly",
        dueDate: new Date("2026-03-15"),
        memberId: null,
        sortOrder: 1,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "sub-2",
        notes: null,
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("committed_item", "ci-1", 1200),
      makePeriod("committed_item", "ci-2", 600),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    expect(summary.committed.bills).toHaveLength(1);
    expect(summary.committed.bills[0]!.name).toBe("Rent");
    expect(summary.committed.nonMonthlyBills).toHaveLength(1);
    expect(summary.committed.nonMonthlyBills[0]!.name).toBe("Insurance");
  });

  it("splits discretionary items into categories and savings", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      {
        id: "di-1",
        householdId: "hh-1",
        name: "Groceries",
        spendType: "monthly",
        subcategoryId: "sub-food",
        notes: null,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "di-2",
        householdId: "hh-1",
        name: "Emergency Fund",
        spendType: "monthly",
        subcategoryId: "sub-savings",
        notes: null,
        sortOrder: 1,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);
    prismaMock.subcategory.findMany.mockResolvedValue([
      { id: "sub-food", name: "Food", tier: "discretionary", sortOrder: 0 },
      { id: "sub-savings", name: "Savings", tier: "discretionary", sortOrder: 1 },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("discretionary_item", "di-1", 500),
      makePeriod("discretionary_item", "di-2", 200),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    expect(summary.discretionary.categories).toHaveLength(1);
    expect(summary.discretionary.categories[0]!.name).toBe("Groceries");
    expect(summary.discretionary.savings.allocations).toHaveLength(1);
    expect(summary.discretionary.savings.allocations[0]!.name).toBe("Emergency Fund");
  });

  it("calculates correct totals with consolidated models", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "monthly" }),
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "ci-1",
        householdId: "hh-1",
        name: "Rent",
        spendType: "monthly",
        dueDate: new Date("2026-01-01"),
        memberId: null,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "sub-1",
        notes: null,
      },
      {
        id: "ci-2",
        householdId: "hh-1",
        name: "Car tax",
        spendType: "yearly",
        dueDate: new Date("2026-06-15"),
        memberId: null,
        sortOrder: 1,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "sub-2",
        notes: null,
      },
    ] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      {
        id: "di-1",
        householdId: "hh-1",
        name: "Groceries",
        spendType: "monthly",
        subcategoryId: "sub-food",
        notes: null,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "di-2",
        householdId: "hh-1",
        name: "Emergency fund",
        spendType: "monthly",
        subcategoryId: "sub-savings",
        notes: null,
        sortOrder: 1,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-savings",
      name: "Savings",
    } as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "s1", 4000),
      makePeriod("committed_item", "ci-1", 1200),
      makePeriod("committed_item", "ci-2", 1200),
      makePeriod("discretionary_item", "di-1", 500),
      makePeriod("discretionary_item", "di-2", 200),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // income: 4000, committed: 1200 (monthly) + 100 (1200/12 yearly) = 1300, discretionary: 500 + 200 = 700, surplus: 2000
    expect(summary.committed.monthlyTotal).toBe(1200);
    expect(summary.committed.monthlyAvg12).toBe(100);
    expect(summary.surplus.amount).toBe(2000);
  });
});

describe("waterfallService.getWaterfallSummary — rounding consistency (#120)", () => {
  it("subcategory total and tier total equal the sum of the rounded displayed parts", async () => {
    // Three items of £33.333… each. With round-then-sum the displayed parts
    // (33.33 each) sum to 99.99 and BOTH the subcategory total and the tier
    // total must equal exactly that — never 100.00 from sum-then-round drift.
    const third = 100 / 3; // 33.3333…
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      {
        id: "d1",
        householdId: "hh-1",
        name: "A",
        spendType: "monthly",
        subcategoryId: "sub-food",
        sortOrder: 0,
        lastReviewedAt: new Date(),
      },
      {
        id: "d2",
        householdId: "hh-1",
        name: "B",
        spendType: "monthly",
        subcategoryId: "sub-food",
        sortOrder: 1,
        lastReviewedAt: new Date(),
      },
      {
        id: "d3",
        householdId: "hh-1",
        name: "C",
        spendType: "monthly",
        subcategoryId: "sub-food",
        sortOrder: 2,
        lastReviewedAt: new Date(),
      },
    ] as any);
    prismaMock.subcategory.findMany.mockResolvedValue([
      { id: "sub-food", name: "Food", tier: "discretionary", sortOrder: 0 },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("discretionary_item", "d1", third),
      makePeriod("discretionary_item", "d2", third),
      makePeriod("discretionary_item", "d3", third),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    const parts = summary.discretionary.categories.map((c) => c.monthlyBudget);
    const partsSum = parts.reduce((s, v) => s + v, 0);

    // Each displayed part is rounded to 33.33; three of them sum to 99.99.
    expect(parts).toEqual([33.33, 33.33, 33.33]);
    expect(partsSum).toBe(99.99);
    // Tier total equals the sum of the displayed parts (no penny drift).
    expect(summary.discretionary.total).toBe(99.99);
    // Subcategory total likewise equals the displayed parts' sum.
    const foodSub = summary.discretionary.bySubcategory.find((s) => s.name === "Food")!;
    expect(foodSub.monthlyTotal).toBe(99.99);
  });
});

describe("waterfallService.deleteAll — with subcategories", () => {
  it("deletes all items, periods, and subcategories", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.deleteMany.mockResolvedValue({ count: 0 });

    await waterfallService.deleteAll("hh-1");

    expect(prismaMock.incomeSource.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
    expect(prismaMock.committedItem.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
    expect(prismaMock.discretionaryItem.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
    expect(prismaMock.subcategory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
    });
  });
});

describe("waterfallService.confirmBatch — consolidated models", () => {
  it("updates lastReviewedAt using new model names", async () => {
    const items = [
      { type: "income_source" as const, id: "inc-1" },
      { type: "committed_item" as const, id: "ci-1" },
      { type: "discretionary_item" as const, id: "di-1" },
    ];

    await waterfallService.confirmBatch("hh-1", { items });

    expect(prismaMock.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { id: "inc-1", householdId: "hh-1" },
      data: { lastReviewedAt: expect.any(Date) },
    });
    expect(prismaMock.committedItem.updateMany).toHaveBeenCalledWith({
      where: { id: "ci-1", householdId: "hh-1" },
      data: { lastReviewedAt: expect.any(Date) },
    });
    expect(prismaMock.discretionaryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "di-1", householdId: "hh-1" },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });
});

describe("waterfallService.createCommitted with audited()", () => {
  const actor = {
    householdId: "hh_1",
    actorId: "user_1",
    actorName: "Alice",
  };

  it("writes an AuditLog entry on committed item creation", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1" } as any);
    prismaMock.committedItem.create.mockResolvedValue({
      id: "ci_1",
      amount: 1200,
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.createCommitted(
      "hh_1",
      { name: "Rent", amount: 1200, subcategoryId: "sub-1" },
      actor
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE_COMMITTED_ITEM",
          resource: "committed-item",
          actorId: "user_1",
        }),
      })
    );
  });

  it("always writes AuditLog (ctx is required)", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1" } as any);
    prismaMock.committedItem.create.mockResolvedValue({
      id: "ci_1",
      amount: 1200,
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.createCommitted(
      "hh_1",
      { name: "Rent", amount: 1200, subcategoryId: "sub-1" },
      actor
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });
});

describe("waterfallService.createDiscretionary with audited()", () => {
  const actor = {
    householdId: "hh_1",
    actorId: "user_1",
    actorName: "Alice",
  };

  it("writes an AuditLog entry on discretionary item creation", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-food" } as any);
    prismaMock.discretionaryItem.create.mockResolvedValue({
      id: "di_1",
      amount: 500,
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.createDiscretionary(
      "hh_1",
      { name: "Groceries", amount: 500, subcategoryId: "sub-food" },
      actor
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE_DISCRETIONARY_ITEM",
          resource: "discretionary-item",
          actorId: "user_1",
        }),
      })
    );
  });

  it("always writes AuditLog (ctx is required)", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-food" } as any);
    prismaMock.discretionaryItem.create.mockResolvedValue({
      id: "di_1",
      amount: 500,
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.createDiscretionary(
      "hh_1",
      { name: "Groceries", amount: 500, subcategoryId: "sub-food" },
      actor
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });
});

describe("waterfallService.getWaterfallSummary — fixture scenarios", () => {
  it("returns zeroed summary for emptyHousehold", async () => {
    const { emptyHousehold } = await import("../test/fixtures/scenarios.js");

    prismaMock.incomeSource.findMany.mockResolvedValue(emptyHousehold.incomeSources);
    prismaMock.committedItem.findMany.mockResolvedValue(emptyHousehold.committedItems);
    prismaMock.discretionaryItem.findMany.mockResolvedValue(emptyHousehold.discretionaryItems);
    // No periods needed — empty household has no items

    const summary = await waterfallService.getWaterfallSummary("hh-empty");

    expect(summary.income.total).toBe(0);
    expect(summary.surplus.amount).toBe(0);
  });

  it("computes correct totals for dualIncomeHousehold", async () => {
    const { dualIncomeHousehold } = await import("../test/fixtures/scenarios.js");

    prismaMock.incomeSource.findMany.mockResolvedValue(dualIncomeHousehold.incomeSources as any);
    prismaMock.committedItem.findMany.mockResolvedValue(dualIncomeHousehold.committedItems as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue(
      dualIncomeHousehold.discretionaryItems as any
    );
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "inc-alice", 3500),
      makePeriod("income_source", "inc-bob", 2800),
      makePeriod("committed_item", "bill-rent", 1200),
      makePeriod("committed_item", "bill-internet", 45),
      makePeriod("committed_item", "yearly-insurance", 600),
      makePeriod("discretionary_item", "disc-groceries", 500),
      makePeriod("discretionary_item", "disc-dining", 150),
      makePeriod("discretionary_item", "sav-emergency", 200),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-dual");

    // 2 salaries: 3500 + 2800 = 6300
    expect(summary.income.total).toBe(6300);
    // committed monthly: 1200 + 45 = 1245, yearly avg: 600/12 = 50
    // discretionary: 500 + 150 + 200 = 850
    // surplus: 6300 - 1245 - 50 - 850 = 4155
    expect(summary.surplus.amount).toBe(4155);
  });
});

describe("waterfallService.createIncome with audited()", () => {
  const actor = {
    householdId: "hh_1",
    actorId: "user_1",
    actorName: "Alice",
  };

  it("writes an AuditLog entry on income creation", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1" } as any);
    prismaMock.incomeSource.create.mockResolvedValue({
      id: "inc_1",
      amount: 1000,
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.createIncome(
      "hh_1",
      { name: "Salary", amount: 1000, subcategoryId: "sub-1" },
      actor
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE_INCOME_SOURCE",
          resource: "income-source",
          actorId: "user_1",
        }),
      })
    );
  });

  it("always writes AuditLog (ctx is required)", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1" } as any);
    prismaMock.incomeSource.create.mockResolvedValue({
      id: "inc_1",
      amount: 1000,
    } as any);
    prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await waterfallService.createIncome(
      "hh_1",
      { name: "Salary", amount: 1000, subcategoryId: "sub-1" },
      actor
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });
});

describe("waterfallService discretionary guards (planner-owned)", () => {
  const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };

  it("createDiscretionary rejects items in a planner-locked subcategory", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-gifts",
      householdId: "hh-1",
      tier: "discretionary",
      name: "Gifts",
      lockedByPlanner: true,
    } as any);
    await expect(
      waterfallService.createDiscretionary(
        "hh-1",
        { subcategoryId: "sub-gifts", name: "X" } as any,
        ctx
      )
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("updateDiscretionary rejects edits to planner-owned items", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "d1",
      householdId: "hh-1",
      isPlannerOwned: true,
    } as any);
    await expect(
      waterfallService.updateDiscretionary("hh-1", "d1", { name: "Renamed" } as any, ctx)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("deleteDiscretionary rejects planner-owned items", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "d1",
      householdId: "hh-1",
      isPlannerOwned: true,
    } as any);
    await expect(waterfallService.deleteDiscretionary("hh-1", "d1", ctx)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});

describe("waterfallService.getWaterfallSummary — weekly income", () => {
  const makeWeeklySource = () => ({
    id: "sw1",
    householdId: "hh-1",
    name: "Weekly Salary",
    frequency: "weekly" as const,
    incomeType: "salary" as const,
    dueDate: new Date("2026-01-07"),
    memberId: null,
    sortOrder: 0,
    endedAt: null,
    lastReviewedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    subcategoryId: "sub-1",
    notes: null,
  });

  beforeEach(() => {
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
  });

  it("includes weekly income in income.total as monthly equivalent (amount × 52/12)", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([makeWeeklySource()] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "sw1", 520),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // 520 × 52 / 12 = 2253.333... → toGBP → 2253.33
    expect(summary.income.total).toBe(2253.33);
  });

  it("places weekly income source in income.monthly (monthlyLike bucket)", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([makeWeeklySource()] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("income_source", "sw1", 520),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    expect(summary.income.monthly).toHaveLength(1);
    expect(summary.income.monthly[0]!.frequency).toBe("weekly");
    expect(summary.income.nonMonthly).toHaveLength(0);
  });
});

describe("waterfallService.getWaterfallSummary — quarterly committed", () => {
  it("includes quarterly committed item in nonMonthlyBills and monthlyAvg12 (amount/3)", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "qc1",
        householdId: "hh-1",
        name: "Quarterly Service",
        spendType: "quarterly",
        dueDate: new Date("2026-01-15"),
        memberId: null,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "sub-1",
        notes: null,
      },
    ] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      makePeriod("committed_item", "qc1", 300),
    ]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // quarterly item: 300/3 = 100/month avg
    expect(summary.committed.monthlyAvg12).toBe(100);
    expect(summary.committed.monthlyTotal).toBe(0);
    expect(summary.committed.nonMonthlyBills).toHaveLength(1);
    expect(summary.committed.nonMonthlyBills[0]!.name).toBe("Quarterly Service");
  });
});

describe("waterfallService staleness exclusion", () => {
  it("getDiscretionaryItems excludes planner-owned items from staleness aggregation", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);
    await waterfallService.listDiscretionaryStale("hh-1");
    const call = (prismaMock.discretionaryItem.findMany.mock.calls[0] as any)[0];
    expect(call.where).toMatchObject({ householdId: "hh-1", isPlannerOwned: false });
  });
});
