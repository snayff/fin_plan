import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { subcategoryService } = await import("./subcategory.service.js");

beforeEach(() => {
  resetPrismaMocks();
});

describe("subcategoryService.seedDefaults", () => {
  it("seeds the Discretionary 'Savings' subcategory as locked", async () => {
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 16 });

    await subcategoryService.seedDefaults("hh-savings");

    const call = prismaMock.subcategory.createMany.mock.calls[0]![0] as any;
    const data = call.data as any[];
    const savings = data.find((r: any) => r.tier === "discretionary" && r.name === "Savings");
    expect(savings?.isLocked).toBe(true);
  });

  it("creates default subcategories for all three tiers", async () => {
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 16 });

    await subcategoryService.seedDefaults("hh-1");

    expect(prismaMock.subcategory.createMany).toHaveBeenCalledTimes(1);
    const call = prismaMock.subcategory.createMany.mock.calls[0]![0] as any;
    const data = call.data as any[];

    // Income: Salary, Dividends, Other = 3
    const incomeRows = data.filter((r: any) => r.tier === "income");
    expect(incomeRows).toHaveLength(3);
    expect(incomeRows.map((r: any) => r.name)).toEqual(["Salary", "Dividends", "Other"]);

    // Committed: Housing, Utilities, Services, Charity, Childcare, Vehicles, Other = 7
    const committedRows = data.filter((r: any) => r.tier === "committed");
    expect(committedRows).toHaveLength(7);

    // Discretionary: Food, Fun, Clothes, Gifts (locked), Savings, Other = 6
    const discRows = data.filter((r: any) => r.tier === "discretionary");
    expect(discRows).toHaveLength(6);
    const giftsRow = discRows.find((r: any) => r.name === "Gifts");
    expect(giftsRow.isLocked).toBe(true);
  });

  it("sets correct sortOrder per tier", async () => {
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 13 });

    await subcategoryService.seedDefaults("hh-1");

    const call = prismaMock.subcategory.createMany.mock.calls[0]![0] as any;
    const data = call.data as any[];
    const incomeRows = data.filter((r: any) => r.tier === "income");
    expect(incomeRows[0].sortOrder).toBe(0);
    expect(incomeRows[1].sortOrder).toBe(1);
    expect(incomeRows[2].sortOrder).toBe(2);
  });
});

describe("subcategoryService.ensureSubcategories", () => {
  it("seeds defaults when no subcategories exist", async () => {
    prismaMock.subcategory.count.mockResolvedValue(0);
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 16 });

    await subcategoryService.ensureSubcategories("hh-1");

    expect(prismaMock.subcategory.createMany).toHaveBeenCalledTimes(1);
  });

  it("does nothing when subcategories already exist", async () => {
    prismaMock.subcategory.count.mockResolvedValue(12);

    await subcategoryService.ensureSubcategories("hh-1");

    expect(prismaMock.subcategory.createMany).not.toHaveBeenCalled();
  });
});

describe("subcategoryService.listByTier", () => {
  it("returns subcategories for the specified tier", async () => {
    const subs = [
      { id: "sub-1", householdId: "hh-1", tier: "income", name: "Salary", sortOrder: 0 },
      { id: "sub-2", householdId: "hh-1", tier: "income", name: "Dividends", sortOrder: 1 },
    ];
    prismaMock.subcategory.findMany.mockResolvedValue(subs as any);

    const result = await subcategoryService.listByTier("hh-1", "income");

    expect(prismaMock.subcategory.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", tier: "income" },
      orderBy: { sortOrder: "asc" },
    });
    expect(result).toHaveLength(2);
  });
});

describe("subcategoryService.getDefaultSubcategoryId", () => {
  it("returns the 'Other' subcategory id for the tier", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-other",
      name: "Other",
      tier: "committed",
    } as any);

    const id = await subcategoryService.getDefaultSubcategoryId("hh-1", "committed");
    expect(id).toBe("sub-other");
  });

  it("throws when no 'Other' subcategory exists", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue(null as any);

    await expect(subcategoryService.getDefaultSubcategoryId("hh-1", "committed")).rejects.toThrow(
      "Default subcategory not found"
    );
  });
});

describe("subcategoryService.getItemCounts", () => {
  it("returns item counts per subcategory for income tier", async () => {
    prismaMock.incomeSource.groupBy.mockResolvedValue([
      { subcategoryId: "sub-salary", _count: { id: 3 } },
      { subcategoryId: "sub-other", _count: { id: 1 } },
    ] as any);

    const result = await subcategoryService.getItemCounts("hh-1", "income");

    expect(prismaMock.incomeSource.groupBy).toHaveBeenCalledWith({
      by: ["subcategoryId"],
      where: { householdId: "hh-1" },
      _count: { id: true },
    });
    expect(result).toEqual({
      "sub-salary": 3,
      "sub-other": 1,
    });
  });

  it("returns item counts for committed tier", async () => {
    prismaMock.committedItem.groupBy.mockResolvedValue([
      { subcategoryId: "sub-housing", _count: { id: 2 } },
    ] as any);

    const result = await subcategoryService.getItemCounts("hh-1", "committed");

    expect(prismaMock.committedItem.groupBy).toHaveBeenCalled();
    expect(result).toEqual({ "sub-housing": 2 });
  });

  it("returns item counts for discretionary tier", async () => {
    prismaMock.discretionaryItem.groupBy.mockResolvedValue([
      { subcategoryId: "sub-food", _count: { id: 5 } },
    ] as any);

    const result = await subcategoryService.getItemCounts("hh-1", "discretionary");

    expect(prismaMock.discretionaryItem.groupBy).toHaveBeenCalled();
    expect(result).toEqual({ "sub-food": 5 });
  });

  it("returns empty object when no items exist", async () => {
    prismaMock.incomeSource.groupBy.mockResolvedValue([] as any);

    const result = await subcategoryService.getItemCounts("hh-1", "income");
    expect(result).toEqual({});
  });
});

describe("subcategoryService.batchSave", () => {
  it("creates new subcategories and updates existing ones in a transaction", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-2",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);
    prismaMock.subcategory.update.mockResolvedValue({} as any);
    prismaMock.subcategory.create.mockResolvedValue({} as any);

    await subcategoryService.batchSave("hh-1", "income", {
      subcategories: [
        { id: "sub-1", name: "Employment", sortOrder: 0 },
        { name: "Freelance", sortOrder: 1 },
        { id: "sub-2", name: "Other", sortOrder: 2 },
      ],
      reassignments: [],
    });

    expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { name: "Employment", sortOrder: 0 },
    });
    expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
      where: { id: "sub-2" },
      data: { name: "Other", sortOrder: 2 },
    });
    expect(prismaMock.subcategory.create).toHaveBeenCalledWith({
      data: {
        householdId: "hh-1",
        tier: "income",
        name: "Freelance",
        sortOrder: 1,
        isLocked: false,
        isDefault: false,
      },
    });
  });

  it("deletes removed subcategories and reassigns items", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-2",
        householdId: "hh-1",
        tier: "income",
        name: "Dividends",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-3",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 2,
        isLocked: false,
        isDefault: true,
      },
    ] as any);
    prismaMock.incomeSource.updateMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.subcategory.delete.mockResolvedValue({} as any);
    prismaMock.subcategory.update.mockResolvedValue({} as any);

    await subcategoryService.batchSave("hh-1", "income", {
      subcategories: [
        { id: "sub-1", name: "Salary", sortOrder: 0 },
        { id: "sub-3", name: "Other", sortOrder: 1 },
      ],
      reassignments: [{ fromSubcategoryId: "sub-2", toSubcategoryId: "sub-1" }],
    });

    expect(prismaMock.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { subcategoryId: "sub-2", householdId: "hh-1" },
      data: { subcategoryId: "sub-1" },
    });
    expect(prismaMock.subcategory.delete).toHaveBeenCalledWith({
      where: { id: "sub-2" },
    });
  });

  it("rejects if Other is missing from desired state", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [{ id: "sub-1", name: "Salary", sortOrder: 0 }],
        reassignments: [],
      })
    ).rejects.toThrow("Other");
  });

  it("rejects if locked subcategory is renamed", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-gifts",
        householdId: "hh-1",
        tier: "discretionary",
        name: "Gifts",
        sortOrder: 0,
        isLocked: true,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "discretionary",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "discretionary", {
        subcategories: [
          { id: "sub-gifts", name: "Presents", sortOrder: 0 },
          { id: "sub-other", name: "Other", sortOrder: 1 },
        ],
        reassignments: [],
      })
    ).rejects.toThrow("locked");
  });

  it("rejects if locked subcategory is removed", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-gifts",
        householdId: "hh-1",
        tier: "discretionary",
        name: "Gifts",
        sortOrder: 0,
        isLocked: true,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "discretionary",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "discretionary", {
        subcategories: [{ id: "sub-other", name: "Other", sortOrder: 0 }],
        reassignments: [{ fromSubcategoryId: "sub-gifts", toSubcategoryId: "sub-other" }],
      })
    ).rejects.toThrow("locked");
  });

  it("rejects duplicate names (case-insensitive)", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [
          { id: "sub-1", name: "salary", sortOrder: 0 },
          { name: "Salary", sortOrder: 1 },
          { id: "sub-other", name: "Other", sortOrder: 2 },
        ],
        reassignments: [],
      })
    ).rejects.toThrow("unique");
  });

  it("rejects more than 7 subcategories", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: Array.from({ length: 8 }, (_, i) => ({
          name: i === 7 ? "Other" : `Cat ${i}`,
          sortOrder: i,
        })),
        reassignments: [],
      })
    ).rejects.toThrow("7");
  });

  it("rejects if a new subcategory is named 'Other' (case-insensitive)", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [
          { name: "other", sortOrder: 0 },
          { id: "sub-other", name: "Other", sortOrder: 1 },
        ],
        reassignments: [],
      })
    ).rejects.toThrow("reserved");
  });

  it("rejects if Other is not last in sortOrder", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [
          { id: "sub-other", name: "Other", sortOrder: 0 },
          { id: "sub-1", name: "Salary", sortOrder: 1 },
        ],
        reassignments: [],
      })
    ).rejects.toThrow("last");
  });

  it("rejects reassignment from subcategory not owned by household", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [
          { id: "sub-1", name: "Salary", sortOrder: 0 },
          { id: "sub-other", name: "Other", sortOrder: 1 },
        ],
        reassignments: [{ fromSubcategoryId: "sub-foreign", toSubcategoryId: "sub-1" }],
      })
    ).rejects.toThrow();
  });
});

describe("subcategoryService.resetToDefaults", () => {
  it("deletes non-default subcategories, reassigns items, and restores defaults", async () => {
    const existing = [
      {
        id: "sub-custom",
        householdId: "hh-1",
        tier: "income",
        name: "Custom",
        sortOrder: 0,
        isLocked: false,
        isDefault: false,
      },
      {
        id: "sub-salary",
        householdId: "hh-1",
        tier: "income",
        name: "Wages",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other-i",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 2,
        isLocked: false,
        isDefault: true,
      },
    ];
    // 3 calls for initial tier fetches + 1 call for post-reseed lookup
    const newDefaults = [
      {
        id: "new-salary",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "new-div",
        householdId: "hh-1",
        tier: "income",
        name: "Dividends",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "new-other-i",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 2,
        isLocked: false,
        isDefault: true,
      },
    ];
    prismaMock.subcategory.findMany
      .mockResolvedValueOnce(existing as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce(newDefaults as any);

    prismaMock.incomeSource.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.subcategory.deleteMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 3 } as any);
    // Pre-check groupBy: the only item-holding subcategory is the reassignment
    // source, which is allowed (it gets emptied before deletion).
    prismaMock.incomeSource.groupBy.mockResolvedValue([
      { subcategoryId: "sub-custom", _count: { id: 1 } },
    ] as any);
    prismaMock.committedItem.groupBy.mockResolvedValue([] as any);
    prismaMock.discretionaryItem.groupBy.mockResolvedValue([] as any);

    await subcategoryService.resetToDefaults("hh-1", {
      reassignments: [{ fromSubcategoryId: "sub-custom", toSubcategoryId: "sub-other-i" }],
    });

    // First reassign items from custom to old Other
    expect(prismaMock.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { subcategoryId: "sub-custom", householdId: "hh-1" },
      data: { subcategoryId: "sub-other-i" },
    });

    expect(prismaMock.subcategory.deleteMany).toHaveBeenCalled();
    expect(prismaMock.subcategory.createMany).toHaveBeenCalled();

    // Then remap items from old Other ID to new Other ID
    expect(prismaMock.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { subcategoryId: "sub-other-i", householdId: "hh-1" },
      data: { subcategoryId: "new-other-i" },
    });
  });

  it("validates reassignment source IDs exist in the household", async () => {
    prismaMock.subcategory.findMany
      .mockResolvedValueOnce([
        {
          id: "sub-1",
          householdId: "hh-1",
          tier: "income",
          name: "Salary",
          sortOrder: 0,
          isLocked: false,
          isDefault: true,
        },
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await expect(
      subcategoryService.resetToDefaults("hh-1", {
        reassignments: [{ fromSubcategoryId: "sub-foreign", toSubcategoryId: "sub-1" }],
      })
    ).rejects.toThrow();
  });

  // #136: a subcategory that still holds items but is neither a reassignment
  // source nor target would trigger a P2003 FK RESTRICT on deleteMany. Reject
  // up front with a 400 instead.
  it("rejects when an item-holding subcategory was not reassigned", async () => {
    const existing = [
      {
        id: "sub-stuck",
        householdId: "hh-1",
        tier: "committed",
        name: "Subscriptions",
        sortOrder: 0,
        isLocked: false,
        isDefault: false,
      },
    ];
    prismaMock.subcategory.findMany
      .mockResolvedValueOnce([] as any) // income
      .mockResolvedValueOnce(existing as any) // committed
      .mockResolvedValueOnce([] as any); // discretionary

    prismaMock.incomeSource.groupBy.mockResolvedValue([] as any);
    // sub-stuck still holds an item and is not referenced by any reassignment.
    prismaMock.committedItem.groupBy.mockResolvedValue([
      { subcategoryId: "sub-stuck", _count: { id: 2 } },
    ] as any);
    prismaMock.discretionaryItem.groupBy.mockResolvedValue([] as any);

    await expect(subcategoryService.resetToDefaults("hh-1", { reassignments: [] })).rejects.toThrow(
      "still hold items"
    );
    // The destructive deleteMany must never run.
    expect(prismaMock.subcategory.deleteMany).not.toHaveBeenCalled();
  });
});
