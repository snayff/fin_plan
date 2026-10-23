import { describe, it, expect, beforeEach, mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { cashflowService } = await import("./cashflow.service.js");

/** Months (as "YYYY-M") that carry a non-zero net change, with that change. */
function eventMonths(result: {
  months: Array<{ year: number; month: number; netChange: number }>;
}) {
  return result.months
    .filter((m) => m.netChange !== 0)
    .map((m) => [`${m.year}-${m.month}`, m.netChange] as const);
}

describe("cashflowService.getProjection — a period can move the payment date", () => {
  beforeEach(() => {
    resetPrismaMocks();
    prismaMock.account.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "ins",
        name: "Insurance",
        spendType: "yearly",
        dueDate: new Date("2025-03-10"),
        householdId: "hh-1",
      },
    ] as any);
  });

  it("uses a period's dueDate for occurrences inside that period", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "ins",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2026-01-01"),
        amount: 600,
        dueDate: null,
      },
      {
        itemType: "committed_item",
        itemId: "ins",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 720,
        dueDate: new Date("2026-06-20"),
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2025,
      startMonth: 1,
      monthCount: 24,
    });

    expect(eventMonths(result)).toEqual([
      ["2025-3", -600],
      ["2026-6", -720],
    ]);
  });

  it("later periods without a dueDate inherit the moved payment date", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "ins",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2026-01-01"),
        amount: 600,
        dueDate: null,
      },
      {
        itemType: "committed_item",
        itemId: "ins",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
        amount: 720,
        dueDate: new Date("2026-06-20"),
      },
      {
        itemType: "committed_item",
        itemId: "ins",
        startDate: new Date("2027-01-01"),
        endDate: null,
        amount: 800,
        dueDate: null,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2025,
      startMonth: 1,
      monthCount: 36,
    });

    expect(eventMonths(result)).toEqual([
      ["2025-3", -600],
      ["2026-6", -720],
      ["2027-6", -800],
    ]);
  });

  it("is unchanged when no period sets a dueDate", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "ins",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2026-01-01"),
        amount: 600,
      },
      {
        itemType: "committed_item",
        itemId: "ins",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 720,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2025,
      startMonth: 1,
      monthCount: 24,
    });

    expect(eventMonths(result)).toEqual([
      ["2025-3", -600],
      ["2026-3", -720],
    ]);
  });
});
