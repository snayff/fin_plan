import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { periodService } = await import("./period.service.js");

const HH = "hh-1";

beforeEach(() => {
  resetPrismaMocks();
});

describe("periodService.listPeriods", () => {
  it("returns periods ordered by startDate ascending, scoped to the household", async () => {
    const periods = [
      {
        id: "p1",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2023-01-01"),
        amount: 7,
        createdAt: new Date(),
      },
      {
        id: "p2",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2023-01-01"),
        endDate: null,
        amount: 9,
        createdAt: new Date(),
      },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.listPeriods(HH, "committed_item", "item-1");

    expect(prismaMock.itemAmountPeriod.findMany).toHaveBeenCalledWith({
      where: { householdId: HH, itemType: "committed_item", itemId: "item-1" },
      orderBy: { startDate: "asc" },
    });
    expect(result).toHaveLength(2);
    expect(result[0].amount).toBe(7);
  });
});

describe("periodService.getCurrentAmount", () => {
  it("returns the amount from the current effective period", async () => {
    const now = new Date("2026-04-04");
    const periods = [
      { id: "p1", startDate: new Date("2020-01-01"), endDate: new Date("2025-01-01"), amount: 7 },
      { id: "p2", startDate: new Date("2025-01-01"), endDate: null, amount: 9 },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getCurrentAmount(HH, "committed_item", "item-1", now);

    expect(prismaMock.itemAmountPeriod.findMany).toHaveBeenCalledWith({
      where: { householdId: HH, itemType: "committed_item", itemId: "item-1" },
      orderBy: { startDate: "asc" },
    });
    expect(result).toBe(9);
  });

  it("returns 0 when no periods exist", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);

    const result = await periodService.getCurrentAmount(HH, "committed_item", "item-1", new Date());

    expect(result).toBe(0);
  });
});

describe("periodService.getEffectiveAmountForMonth", () => {
  it("returns the amount effective in a given month", async () => {
    const periods = [
      { id: "p1", startDate: new Date("2020-01-01"), endDate: new Date("2026-06-01"), amount: 7 },
      { id: "p2", startDate: new Date("2026-06-01"), endDate: null, amount: 9 },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    // August 2026 — should be in period 2
    const result = await periodService.getEffectiveAmountForMonth(
      HH,
      "committed_item",
      "item-1",
      2026,
      8
    );
    expect(result).toBe(9);

    // March 2026 — should be in period 1
    const result2 = await periodService.getEffectiveAmountForMonth(
      HH,
      "committed_item",
      "item-1",
      2026,
      3
    );
    expect(result2).toBe(7);
  });
});

describe("periodService.getLifecycleState", () => {
  it("returns active when a period covers today", async () => {
    const now = new Date("2026-04-04");
    const periods = [{ startDate: new Date("2020-01-01"), endDate: null, amount: 10 }];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getLifecycleState(HH, "committed_item", "item-1", now);
    expect(result).toBe("active");
  });

  it("returns future when all periods start after today", async () => {
    const now = new Date("2026-04-04");
    const periods = [{ startDate: new Date("2026-07-01"), endDate: null, amount: 10 }];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getLifecycleState(HH, "committed_item", "item-1", now);
    expect(result).toBe("future");
  });

  it("returns expired when all periods have ended", async () => {
    const now = new Date("2026-04-04");
    const periods = [
      { startDate: new Date("2020-01-01"), endDate: new Date("2025-12-31"), amount: 10 },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getLifecycleState(HH, "committed_item", "item-1", now);
    expect(result).toBe("expired");
  });
});

describe("periodService.createPeriod", () => {
  it("creates a period with the householdId and updates the adjacent period's endDate", async () => {
    const existingPeriods = [
      {
        id: "p1",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 7,
      },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(existingPeriods);
    prismaMock.itemAmountPeriod.create.mockResolvedValue({
      id: "p2",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2026-10-01"),
      endDate: null,
      amount: 9,
      createdAt: new Date(),
    });
    prismaMock.itemAmountPeriod.update.mockResolvedValue({});

    const result = await periodService.createPeriod(HH, {
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2026-10-01"),
      amount: 9,
    });

    // Should only consider this household's periods
    expect(prismaMock.itemAmountPeriod.findMany).toHaveBeenCalledWith({
      where: { householdId: HH, itemType: "committed_item", itemId: "item-1" },
      orderBy: { startDate: "asc" },
    });
    // Should update previous period's endDate
    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { endDate: new Date("2026-10-01") },
    });
    // Created row must carry the householdId
    expect(prismaMock.itemAmountPeriod.create).toHaveBeenCalledWith({
      data: {
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2026-10-01"),
        endDate: null,
        amount: 9,
      },
    });
    expect(result.amount).toBe(9);
  });
});

describe("periodService.updatePeriod", () => {
  it("rejects periods that belong to another household", async () => {
    // findFirst is scoped by householdId — a foreign period resolves to null
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(null);

    await expect(periodService.updatePeriod(HH, "p-foreign", { amount: 1 })).rejects.toThrow(
      "Period not found"
    );

    expect(prismaMock.itemAmountPeriod.findFirst).toHaveBeenCalledWith({
      where: { id: "p-foreign", householdId: HH },
    });
    expect(prismaMock.itemAmountPeriod.update).not.toHaveBeenCalled();
  });

  it("updates a period owned by the household", async () => {
    const period = {
      id: "p1",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2025-01-01"),
      endDate: null,
      amount: 7,
    };
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(period);
    prismaMock.itemAmountPeriod.update.mockResolvedValue({ ...period, amount: 11 });

    const result = await periodService.updatePeriod(HH, "p1", { amount: 11 });

    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p1", householdId: HH },
      data: { amount: 11 },
    });
    expect(result.amount).toBe(11);
  });
});

describe("periodService.deletePeriod", () => {
  it("deletes the period and extends the previous period", async () => {
    const periods = [
      {
        id: "p1",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2025-01-01"),
        amount: 7,
      },
      {
        id: "p2",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2025-01-01"),
        endDate: null,
        amount: 9,
      },
    ];
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(periods[1]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);
    prismaMock.itemAmountPeriod.delete.mockResolvedValue({});
    prismaMock.itemAmountPeriod.update.mockResolvedValue({});

    await periodService.deletePeriod(HH, "p2");

    expect(prismaMock.itemAmountPeriod.delete).toHaveBeenCalledWith({
      where: { id: "p2", householdId: HH },
    });
    // Previous period should now be open-ended
    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { endDate: null },
    });
  });

  it("returns deleteItem flag when deleting the last period", async () => {
    const period = {
      id: "p1",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2020-01-01"),
      endDate: null,
      amount: 7,
    };
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(period);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([period]);

    const result = await periodService.deletePeriod(HH, "p1");

    expect(result).toEqual({ deleteItem: true, itemType: "committed_item", itemId: "item-1" });
  });

  it("rejects periods that belong to another household", async () => {
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(null);

    await expect(periodService.deletePeriod(HH, "p-foreign")).rejects.toThrow("Period not found");

    expect(prismaMock.itemAmountPeriod.findFirst).toHaveBeenCalledWith({
      where: { id: "p-foreign", householdId: HH },
    });
    expect(prismaMock.itemAmountPeriod.delete).not.toHaveBeenCalled();
  });
});
