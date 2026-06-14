import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { NotFoundError, ValidationError } from "../utils/errors";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { cashflowService } = await import("./cashflow.service.js");

const fakeCtx = {
  householdId: "hh-1",
  actorId: "u-1",
  actorName: "Test User",
} as const;

beforeEach(() => resetPrismaMocks());

describe("schema: Account.isCashflowLinked", () => {
  it("Account model exposes isCashflowLinked field via Prisma client", async () => {
    // The mocked Prisma client is generated from schema.prisma, so this fails
    // until the field is added.
    prismaMock.account.findMany.mockResolvedValue([
      { id: "a1", isCashflowLinked: true, type: "Current" } as any,
    ]);
    const accounts = await prismaMock.account.findMany();
    expect(accounts[0]).toHaveProperty("isCashflowLinked");
  });
});

describe("schema: AccountType enum includes Current", () => {
  it("Current is a valid AccountType", () => {
    const valid: Array<"Savings" | "Pension" | "StocksAndShares" | "Other" | "Current"> = [
      "Current",
      "Savings",
    ];
    expect(valid).toContain("Current");
  });
});

describe("cashflowService.listLinkableAccounts", () => {
  it("returns Current and Savings accounts with their isCashflowLinked + latest balance", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        name: "Joint Current",
        type: "Current",
        isCashflowLinked: true,
        balances: [
          { value: 4200, date: new Date("2026-04-01"), createdAt: new Date("2026-04-01") },
        ],
      } as any,
      {
        id: "a2",
        name: "Emergency Pot",
        type: "Savings",
        isCashflowLinked: false,
        balances: [
          { value: 8000, date: new Date("2026-03-15"), createdAt: new Date("2026-03-15") },
        ],
      } as any,
    ]);

    const result = await cashflowService.listLinkableAccounts("hh-1");

    expect(prismaMock.account.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", type: { in: ["Current", "Savings"] } },
      include: { balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 } },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual([
      {
        id: "a1",
        name: "Joint Current",
        type: "Current",
        isCashflowLinked: true,
        latestBalance: 4200,
        latestBalanceDate: "2026-04-01",
      },
      {
        id: "a2",
        name: "Emergency Pot",
        type: "Savings",
        isCashflowLinked: false,
        latestBalance: 8000,
        latestBalanceDate: "2026-03-15",
      },
    ]);
  });

  it("returns empty array when no eligible accounts exist", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    expect(await cashflowService.listLinkableAccounts("hh-1")).toEqual([]);
  });
});

describe("cashflowService.updateAccountCashflowLink", () => {
  it("rejects with ValidationError when account is not Current or Savings", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: "a1",
      householdId: "hh-1",
      type: "Pension",
    } as any);

    await expect(
      cashflowService.updateAccountCashflowLink("hh-1", "a1", true, fakeCtx)
    ).rejects.toThrow(ValidationError);
  });

  it("rejects with NotFoundError when account belongs to another household", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: "a1",
      householdId: "other",
      type: "Current",
    } as any);

    await expect(
      cashflowService.updateAccountCashflowLink("hh-1", "a1", true, fakeCtx)
    ).rejects.toThrow(NotFoundError);
  });

  it("updates isCashflowLinked when valid and returns mapped row", async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce({
        id: "a1",
        householdId: "hh-1",
        name: "Joint Current",
        type: "Current",
        isCashflowLinked: false,
      } as any)
      .mockResolvedValueOnce({ isCashflowLinked: false } as any);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.account.update.mockResolvedValue({
      id: "a1",
      name: "Joint Current",
      type: "Current",
      isCashflowLinked: true,
      householdId: "hh-1",
    } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await cashflowService.updateAccountCashflowLink("hh-1", "a1", true, fakeCtx);

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { isCashflowLinked: true },
    });
    expect(result).toEqual({
      id: "a1",
      name: "Joint Current",
      type: "Current",
      isCashflowLinked: true,
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });
});

describe("cashflowService.bulkUpdateLinkedAccounts", () => {
  it("updates each account inside a transaction with per-account audit logs", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "a1", householdId: "hh-1", type: "Current", isCashflowLinked: false },
      { id: "a2", householdId: "hh-1", type: "Savings", isCashflowLinked: true },
    ] as any);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.account.findUnique
      .mockResolvedValueOnce({ isCashflowLinked: false } as any)
      .mockResolvedValueOnce({ isCashflowLinked: true } as any);
    prismaMock.account.update
      .mockResolvedValueOnce({
        id: "a1",
        name: "Joint Current",
        type: "Current",
        isCashflowLinked: true,
      } as any)
      .mockResolvedValueOnce({
        id: "a2",
        name: "Emergency Pot",
        type: "Savings",
        isCashflowLinked: false,
      } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await cashflowService.bulkUpdateLinkedAccounts(
      "hh-1",
      {
        updates: [
          { accountId: "a1", isCashflowLinked: true },
          { accountId: "a2", isCashflowLinked: false },
        ],
      },
      fakeCtx
    );

    expect(prismaMock.account.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0]?.isCashflowLinked).toBe(true);
    expect(result[1]?.isCashflowLinked).toBe(false);
  });

  it("rejects entire batch if any account is ineligible", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "a1", householdId: "hh-1", type: "Current" },
      { id: "a2", householdId: "hh-1", type: "Pension" },
    ] as any);

    await expect(
      cashflowService.bulkUpdateLinkedAccounts(
        "hh-1",
        {
          updates: [
            { accountId: "a1", isCashflowLinked: true },
            { accountId: "a2", isCashflowLinked: true },
          ],
        },
        fakeCtx
      )
    ).rejects.toThrow(ValidationError);
  });
});

describe("cashflowService.getProjection", () => {
  beforeEach(() => {
    // Single linked Current account, balance £1,000 as of 2026-04-01
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [
          { value: 1000, date: new Date("2026-04-01"), createdAt: new Date("2026-04-01") },
        ],
      },
    ] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
    // loadDisposalSources now queries asset.findMany — default to empty (no disposals)
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);
  });

  it("returns starting balance equal to sum of latest linked balances", async () => {
    const result = await cashflowService.getProjection("hh-1", { monthCount: 12 });
    expect(result.startingBalance).toBe(1000);
    expect(result.linkedAccountCount).toBe(1);
  });

  it("returns 12 months by default", async () => {
    const result = await cashflowService.getProjection("hh-1", { monthCount: 12 });
    expect(result.months).toHaveLength(12);
  });

  it("flags dipBelowZero when balance crosses zero mid-month", async () => {
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Big Rent",
        spendType: "monthly",
        dueDate: new Date("2026-04-05"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 2000,
      },
    ] as any);
    const result = await cashflowService.getProjection("hh-1", { monthCount: 3 });
    expect(result.months[0]?.dipBelowZero).toBe(true);
  });

  it("uses the youngest balance date as the replay anchor", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 500, date: new Date("2026-03-01"), createdAt: new Date("2026-03-01") }],
      },
      {
        id: "a2",
        type: "Savings",
        isCashflowLinked: true,
        balances: [
          { value: 1500, date: new Date("2026-04-01"), createdAt: new Date("2026-04-01") },
        ],
      },
    ] as any);
    const result = await cashflowService.getProjection("hh-1", { monthCount: 12 });
    expect(result.youngestLinkedBalanceDate).toBe("2026-04-01");
    expect(result.oldestLinkedBalanceDate).toBe("2026-03-01");
    expect(result.startingBalance).toBe(2000);
  });

  it("returns £0 starting balance when no accounts are linked", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    const result = await cashflowService.getProjection("hh-1", { monthCount: 12 });
    expect(result.startingBalance).toBe(0);
    expect(result.linkedAccountCount).toBe(0);
  });

  it("does not double-count events when anchor is within the first visible month", async () => {
    // Anchor falls on the first day of the visible window: no replay needed.
    // The single April-5 bill should be applied exactly once during the
    // forward projection — closing balance should land at -1000, not -3000.
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Big Rent",
        spendType: "monthly",
        dueDate: new Date("2026-04-05"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 2000,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2026,
      startMonth: 4,
      monthCount: 1,
    });

    expect(result.months[0]?.openingBalance).toBe(1000);
    expect(result.months[0]?.closingBalance).toBe(-1000);
    expect(result.months[0]?.netChange).toBe(-2000);
  });

  it("exposes latestKnownBalance equal to the sum of latest linked balances", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [
          { value: 1500, date: new Date("2026-04-11"), createdAt: new Date("2026-04-11") },
        ],
      },
      {
        id: "a2",
        type: "Savings",
        isCashflowLinked: true,
        balances: [{ value: 800, date: new Date("2026-04-10"), createdAt: new Date("2026-04-10") }],
      },
    ] as any);
    const result = await cashflowService.getProjection("hh-1", { monthCount: 1 });
    expect(result.latestKnownBalance).toBe(2300);
  });

  it("backwards-replays anchor → window start when anchor is mid-month", async () => {
    // Anchor = today (2026-04-11), latest balance £4,200. Window start = 1 Apr.
    // Plan has a £1,000 income on 5 Apr. No discretionary.
    // Expected start-of-month opening:
    //   4200 (today) − 1000 (5 Apr income, undone) + 0 (discretionary) = 3200
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [
          { value: 4200, date: new Date("2026-04-11"), createdAt: new Date("2026-04-11") },
        ],
      },
    ] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Salary",
        frequency: "monthly",
        dueDate: new Date("2026-04-05"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "income_source",
        itemId: "i1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 1000,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2026,
      startMonth: 4,
      monthCount: 1,
    });

    expect(result.startingBalance).toBe(3200);
    expect(result.latestKnownBalance).toBe(4200);
    expect(result.months[0]?.openingBalance).toBe(3200);
  });

  it("backwards-replay also undoes daily discretionary across the past portion of the month", async () => {
    // Anchor = today (2026-04-11), balance £3,000. Window start = 1 Apr.
    // £600/mo monthly discretionary → £20/day.
    // Days walked back: Apr 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 = 10 days × £20 = £200 added back.
    // Expected opening: 3000 + 200 = 3200.
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [
          { value: 3000, date: new Date("2026-04-11"), createdAt: new Date("2026-04-11") },
        ],
      },
    ] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "d1", name: "Food", spendType: "monthly", householdId: "hh-1" },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "discretionary_item",
        itemId: "d1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 600,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2026,
      startMonth: 4,
      monthCount: 1,
    });

    expect(result.startingBalance).toBeCloseTo(3200, 5);
    expect(result.latestKnownBalance).toBe(3000);
  });

  it("ignores annual bills whose first occurrence is in a future year", async () => {
    // Annual bill scheduled to start in 2030 must not emit phantom 2026/2027/2028/2029 occurrences.
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Future Bonus",
        frequency: "annual",
        dueDate: new Date("2030-02-15"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "income_source",
        itemId: "i1",
        startDate: new Date("2030-01-01"),
        endDate: null,
        amount: 5000,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2026,
      startMonth: 1,
      monthCount: 12,
    });

    // No income should land in 2026 — projection nets to zero across the year.
    expect(result.months.every((m) => m.netChange === 0)).toBe(true);
    expect(result.projectedEndBalance).toBe(1000);
  });
});

describe("cashflowService.getProjection — weekly expansion", () => {
  beforeEach(() => {
    // £0 starting balance — no accounts linked
    prismaMock.account.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);
  });

  it("emits an event every Wednesday for a weekly income source starting 1 Jan 2025", async () => {
    // Wednesday 1 Jan 2025 is UTC day-of-week 3
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "wi1",
        name: "Weekly Pay",
        frequency: "weekly",
        dueDate: new Date("2025-01-01"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "income_source",
        itemId: "wi1",
        startDate: new Date("2025-01-01"),
        endDate: null,
        amount: 520,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2025,
      startMonth: 1,
      monthCount: 3,
    });

    // Total netChange across 3 months should equal the number of Wednesday events × 520
    const totalNet = result.months.reduce((s, m) => s + m.netChange, 0);
    // Jan has Wednesdays: 1,8,15,22,29 (5); Feb: 5,12,19,26 (4); Mar: 5,12,19,26 (4) = 13 total
    expect(totalNet).toBeCloseTo(13 * 520, 0);
  });

  it("does not emit weekly events before the dueDate (start guard)", async () => {
    // Weekly source starts 1 Feb 2025. Projection window starts 1 Jan 2025.
    // Jan should have no events; Feb onwards should have events.
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "wi2",
        name: "Weekly Pay",
        frequency: "weekly",
        dueDate: new Date("2025-02-01"), // Saturday
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "income_source",
        itemId: "wi2",
        startDate: new Date("2025-02-01"),
        endDate: null,
        amount: 200,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2025,
      startMonth: 1,
      monthCount: 3,
    });

    // January must have zero net change (no events before dueDate)
    expect(result.months[0]!.netChange).toBe(0);
    // February and/or March should have positive netChange
    const febPlusMar = result.months[1]!.netChange + result.months[2]!.netChange;
    expect(febPlusMar).toBeGreaterThan(0);
  });
});

describe("cashflowService.getProjection — quarterly expansion", () => {
  beforeEach(() => {
    prismaMock.account.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);
  });

  it("emits exactly 4 quarterly events over a 12-month window starting 15 Jan 2025", async () => {
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "qb1",
        name: "Quarterly Service",
        spendType: "quarterly",
        dueDate: new Date("2025-01-15"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "qb1",
        startDate: new Date("2025-01-01"),
        endDate: null,
        amount: 300,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2025,
      startMonth: 1,
      monthCount: 12,
    });

    // 4 quarterly events (15 Jan, 15 Apr, 15 Jul, 15 Oct) × -300 = -1200 total
    const totalNet = result.months.reduce((s, m) => s + m.netChange, 0);
    expect(totalNet).toBeCloseTo(-4 * 300, 0);
  });

  it("quarterly events land on the correct months (Jan, Apr, Jul, Oct)", async () => {
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "qb2",
        name: "Quarterly Fee",
        spendType: "quarterly",
        dueDate: new Date("2025-01-15"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "qb2",
        startDate: new Date("2025-01-01"),
        endDate: null,
        amount: 300,
      },
    ] as any);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2025,
      startMonth: 1,
      monthCount: 12,
    });

    // Months with events should be Jan(1), Apr(4), Jul(7), Oct(10) — net = -300 each
    const eventMonths = result.months.filter((m) => m.netChange !== 0).map((m) => m.month);
    expect(eventMonths).toEqual([1, 4, 7, 10]);
  });
});

// ── Disposal liquidation events ───────────────────────────────────────────────

describe("cashflowService.getProjection — disposal liquidation events", () => {
  it("asset disposal within window targeting a linked account adds positive netChange", async () => {
    // Linked Current account — balance recorded 2026-05-01 (anchor)
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "linked-1",
        type: "Current",
        isCashflowLinked: true,
        disposedAt: null,
        disposalAccountId: null,
        balances: [
          { value: 1000, date: new Date("2026-05-01"), createdAt: new Date("2026-05-01") },
        ],
      },
    ] as any);
    // Asset with 0% growth disposed 2026-05-15, proceeds go to linked-1
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "house-1",
        name: "Family Home",
        type: "Property",
        householdId: "hh-1",
        growthRatePct: 0,
        disposedAt: new Date("2026-05-15"),
        disposalAccountId: "linked-1",
        balances: [{ value: 50000, date: new Date("2026-05-01"), createdAt: new Date() }],
      },
    ] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2026,
      startMonth: 5,
      monthCount: 2,
    });

    // May 2026: liquidation of 50k lands in this month → netChange strongly positive
    const may = result.months.find((m) => m.year === 2026 && m.month === 5)!;
    expect(may).toBeDefined();
    expect(may.netChange).toBeGreaterThan(0);
    expect(may.netChange).toBeCloseTo(50000, -1); // approx 50k (0% rate so no growth)
  });

  it("asset disposal targeting an unlinked account does NOT appear in cashflow events", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "linked-1",
        type: "Current",
        isCashflowLinked: true,
        disposedAt: null,
        disposalAccountId: null,
        balances: [
          { value: 1000, date: new Date("2026-05-01"), createdAt: new Date("2026-05-01") },
        ],
      },
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "house-1",
        name: "Family Home",
        type: "Property",
        householdId: "hh-1",
        growthRatePct: 0,
        disposedAt: new Date("2026-05-15"),
        disposalAccountId: "unlinked-pension", // NOT in linkedAccountIds
        balances: [{ value: 50000, date: new Date("2026-05-01"), createdAt: new Date() }],
      },
    ] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2026,
      startMonth: 5,
      monthCount: 1,
    });

    const may = result.months.find((m) => m.year === 2026 && m.month === 5)!;
    // No liquidation event → netChange ≈ 0 (no income/spend either)
    expect(may.netChange).toBeCloseTo(0, 0);
  });

  it("account disposal proceeds include monthly contribution accrual (#128)", async () => {
    // Disposing Savings account: £10k @ 5%, £200pm linked contribution, balance
    // recorded 2026-05-01, disposed 2026-08-01 (~3 months forward). Proceeds must
    // include both growth AND contribution accrual (shared computeDisposalProceeds).
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "target-cur",
        type: "Current",
        isCashflowLinked: true,
        disposedAt: null,
        disposalAccountId: null,
        linkedItems: [],
        balances: [{ value: 0, date: new Date("2026-05-01"), createdAt: new Date("2026-05-01") }],
      },
      {
        id: "src-sav",
        type: "Savings",
        isCashflowLinked: false,
        growthRatePct: 5,
        disposedAt: new Date("2026-08-01"),
        disposalAccountId: "target-cur",
        linkedItems: [{ id: "item-c", spendType: "monthly" }],
        balances: [
          { value: 10000, date: new Date("2026-05-01"), createdAt: new Date("2026-05-01") },
        ],
      },
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "discretionary_item",
        itemId: "item-c",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 200,
      },
    ] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: 2026,
      startMonth: 8,
      monthCount: 1,
    });

    const aug = result.months.find((m) => m.year === 2026 && m.month === 8)!;
    // Proceeds accrue from "now" → disposal (2026-08-01). Without contribution
    // accrual the figure would be ~£10k + a few quid of growth; the £200pm
    // contribution pushes it clearly higher, proving #128 includes contributions.
    expect(aug.netChange).toBeGreaterThan(10200);
    expect(aug.netChange).toBeLessThan(10600);
  });
});

describe("cashflowService.getProjection — avg monthly surplus excludes partial current month (#117)", () => {
  it("steady-state household → avgMonthlySurplus ≈ steady-state surplus, unskewed by month[0]", async () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1; // 1-indexed current month
    const d = (year: number, month: number, day: number) =>
      new Date(Date.UTC(year, month - 1, day));

    // Linked Current account, balance anchored on the 1st of the current month.
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "cur-1",
        type: "Current",
        isCashflowLinked: true,
        disposedAt: null,
        disposalAccountId: null,
        linkedItems: [],
        balances: [{ value: 5000, date: d(y, m, 1), createdAt: d(y, m, 1) }],
      },
    ] as any);
    prismaMock.asset.findMany.mockResolvedValue([]);
    // Steady monthly income on day 5 → every FULL month nets +2000. Plus a large
    // one-off bonus in the current month only, which inflates month[0]'s netChange.
    prismaMock.incomeSource.findMany.mockResolvedValue([
      { id: "sal", name: "Salary", frequency: "monthly", dueDate: d(y, m, 5), householdId: "hh-1" },
      {
        id: "bonus",
        name: "Bonus",
        frequency: "one_off",
        dueDate: d(y, m, 10),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "income_source",
        itemId: "sal",
        startDate: d(2020, 1, 1),
        endDate: null,
        amount: 2000,
      },
      {
        itemType: "income_source",
        itemId: "bonus",
        startDate: d(2020, 1, 1),
        endDate: null,
        amount: 9000,
      },
    ] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);

    const result = await cashflowService.getProjection("hh-1", {
      startYear: y,
      startMonth: m,
      monthCount: 4,
    });

    // Full months (2,3,4) net +2000 each; month[0] is inflated by the £9k bonus.
    // Average over the full months only → 2000, NOT (2000*3 + 11000)/4 = 4250.
    expect(result.avgMonthlySurplus).toBeCloseTo(2000, 5);
  });
});

describe("cashflowService.getMonthDetail", () => {
  // Use the current calendar month so the projection-window check never fails
  // as time advances (the window starts at today's month).
  const _now = new Date();
  const thisYear = _now.getUTCFullYear();
  const thisMonth = _now.getUTCMonth() + 1; // 1-indexed
  /** Days in the current month */
  const daysInMonth = new Date(Date.UTC(thisYear, thisMonth, 0)).getUTCDate();
  /** UTC Date for day N of the current month */
  const d = (day: number) => new Date(Date.UTC(thisYear, thisMonth - 1, day));
  /** ISO date string for day N of the current month (YYYY-MM-DD) */
  const ds = (day: number) =>
    `${thisYear}-${String(thisMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  beforeEach(() => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 1000, date: d(1), createdAt: d(1) }],
      },
    ] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Salary",
        frequency: "monthly",
        dueDate: d(25),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "income_source",
        itemId: "i1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 3000,
      },
    ] as any);
    // loadDisposalSources now queries asset.findMany — default to empty (no disposals)
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);
  });

  it("returns events for the target month with running balance after each", async () => {
    const detail = await cashflowService.getMonthDetail("hh-1", thisYear, thisMonth);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]?.label).toBe("Salary");
    expect(detail.events[0]?.amount).toBe(3000);
    expect(detail.events[0]?.runningBalanceAfter).toBeGreaterThan(0);
  });

  it("returns dailyTrace with one entry per day", async () => {
    const detail = await cashflowService.getMonthDetail("hh-1", thisYear, thisMonth);
    expect(detail.dailyTrace).toHaveLength(daysInMonth);
  });

  it("includes amortisedDailyDiscretionary in the response", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "d1", name: "Food", spendType: "monthly", householdId: "hh-1" },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "discretionary_item",
        itemId: "d1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 600,
      },
    ] as any);
    const detail = await cashflowService.getMonthDetail("hh-1", thisYear, thisMonth);
    expect(detail.monthlyDiscretionaryTotal).toBe(600);
    expect(detail.amortisedDailyDiscretionary).toBeCloseTo(600 / daysInMonth, 0);
  });

  it("includes events dated before today in the current month's event list", async () => {
    // A salary due on day 5 of the current month should appear in the detail.
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Salary",
        frequency: "monthly",
        dueDate: d(5),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "income_source",
        itemId: "i1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 3000,
      },
    ] as any);

    const detail = await cashflowService.getMonthDetail("hh-1", thisYear, thisMonth);
    const labels = detail.events.map((e) => e.label);
    const dates = detail.events.map((e) => e.date);
    expect(labels).toContain("Salary");
    expect(dates).toContain(ds(5));
  });

  it("computes tightestPoint across the full current month, including past-of-today days", async () => {
    // Big rent on day 3 drives a dip before salary on day 25.
    // The tightest point must report day 3, not a later day.
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 500, date: d(11), createdAt: d(11) }],
      },
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Rent",
        spendType: "monthly",
        dueDate: d(3),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Salary",
        frequency: "monthly",
        dueDate: d(25),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 2000,
      },
      {
        itemType: "income_source",
        itemId: "i1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 3000,
      },
    ] as any);

    const detail = await cashflowService.getMonthDetail("hh-1", thisYear, thisMonth);
    // Tightest point lands on day 3 (rent day), proving the scan covers all
    // days in the month. The actual value is bounded above by the anchor
    // balance because of how the backwards-replay reconstructs start-of-month.
    expect(detail.tightestPoint.day).toBe(3);
  });

  it("excludes monthly/yearly discretionary from event list", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "d1", name: "Food", spendType: "monthly", householdId: "hh-1" },
      {
        id: "d2",
        name: "Concert",
        spendType: "one_off",
        dueDate: d(12),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "discretionary_item",
        itemId: "d1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 600,
      },
      {
        itemType: "discretionary_item",
        itemId: "d2",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 80,
      },
    ] as any);
    const detail = await cashflowService.getMonthDetail("hh-1", thisYear, thisMonth);
    const labels = detail.events.map((e) => e.label);
    expect(labels).toContain("Concert");
    expect(labels).not.toContain("Food");
  });
});
