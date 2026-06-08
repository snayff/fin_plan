import { describe, it, expect, beforeEach, mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { cashflowService } = await import("./cashflow.service.js");

beforeEach(() => resetPrismaMocks());

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysFromToday(n: number): Date {
  const d = todayUtc();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * These exercise the anchor-replay branches of getShortfallItems: when the
 * latest balance snapshot is dated in the past (anchor < today) it replays
 * forward to estimate today's balance; when it's dated in the future
 * (anchor > today) it replays backward. Each scenario uses a single monthly
 * committed bill whose one in-window occurrence makes today's balance exact.
 */
describe("cashflowService.getShortfallItems — anchor replay", () => {
  function mockNoPlan() {
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null as any);
  }

  it("replays forward when the latest balance is dated in the past", async () => {
    const anchor = daysFromToday(-20);
    const billDue = daysFromToday(-3); // single occurrence inside [anchor, today)

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 1000, date: anchor, createdAt: anchor }],
      } as any,
    ]);
    mockNoPlan();
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "c1", name: "Council Tax", spendType: "monthly", dueDate: billDue } as any,
    ]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 200,
      } as any,
    ]);

    const result = await cashflowService.getShortfallItems("hh-1", { windowDays: 30 });

    // Snapshot 1000 minus the 200 bill that already fell between the snapshot and today.
    expect(result.balanceToday).toBe(800);
  });

  it("replays backward when the latest balance is dated in the future", async () => {
    const anchor = daysFromToday(15);
    const billDue = daysFromToday(5); // single occurrence inside (today, anchor]

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 1000, date: anchor, createdAt: anchor }],
      } as any,
    ]);
    mockNoPlan();
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "c1", name: "Council Tax", spendType: "monthly", dueDate: billDue } as any,
    ]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 200,
      } as any,
    ]);

    const result = await cashflowService.getShortfallItems("hh-1", { windowDays: 30 });

    // The future snapshot already reflects the 200 bill, so today is 200 higher.
    expect(result.balanceToday).toBe(1200);
  });

  it("amortises the discretionary baseline across the past-replay window", async () => {
    const anchor = daysFromToday(-20);

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 1000, date: anchor, createdAt: anchor }],
      } as any,
    ]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "d1", name: "Spending", spendType: "monthly", subcategoryId: "sub-1" } as any,
    ]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "discretionary_item",
        itemId: "d1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 3000,
      } as any,
    ]);
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null as any);

    const result = await cashflowService.getShortfallItems("hh-1", { windowDays: 30 });

    // 20 days of daily discretionary spend were drawn down since the snapshot.
    expect(result.balanceToday).toBeLessThan(1000);
  });
});
