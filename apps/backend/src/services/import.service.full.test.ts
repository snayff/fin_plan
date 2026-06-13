import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { buildMember } from "../test/fixtures";

mock.module("../config/database", () => ({ prisma: prismaMock }));
mock.module("./export.service", () => ({
  exportService: {
    exportHousehold: mock(() => Promise.resolve({ household: { name: "Backup" } })),
  },
}));

import { importService } from "./import.service";

const ISO = "2026-01-01T00:00:00.000Z";

/** A fully-populated export envelope exercising every restore section. */
function fullExport() {
  return {
    schemaVersion: 2 as const,
    exportedAt: ISO,
    household: { name: "Imported Household" },
    settings: { surplusBenchmarkPct: 10, showPence: true },
    members: [{ name: "Alice", role: "member" as const, dateOfBirth: ISO, retirementYear: 2050 }],
    subcategories: [
      { tier: "income" as const, name: "Salary", sortOrder: 0, isLocked: false, isDefault: true },
      { tier: "committed" as const, name: "Rent", sortOrder: 0, isLocked: false, isDefault: true },
      {
        tier: "discretionary" as const,
        name: "Fun",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
    ],
    incomeSources: [
      {
        subcategoryName: "Salary",
        name: "Day job",
        frequency: "monthly" as const,
        incomeType: "salary" as const,
        dueDate: new Date("2026-01-25"),
        ownerName: "Alice",
        sortOrder: 0,
        lastReviewedAt: ISO,
        notes: "primary",
        periods: [{ startDate: "2026-01-01", endDate: null, amount: 3000 }],
      },
    ],
    committedItems: [
      {
        subcategoryName: "Rent",
        name: "Flat",
        spendType: "monthly" as const,
        notes: null,
        ownerName: "Alice",
        dueDate: new Date("2026-01-01"),
        sortOrder: 0,
        lastReviewedAt: ISO,
        periods: [{ startDate: "2026-01-01", endDate: null, amount: 1200 }],
      },
    ],
    discretionaryItems: [
      {
        subcategoryName: "Fun",
        name: "Hobbies",
        spendType: "monthly" as const,
        notes: null,
        ownerName: null,
        dueDate: null,
        sortOrder: 0,
        lastReviewedAt: ISO,
        periods: [{ startDate: "2026-01-01", endDate: "2026-12-31", amount: 100 }],
      },
    ],
    itemAmountPeriods: [],
    waterfallHistory: [
      { itemType: "income_source" as const, itemName: "Day job", value: 3000, recordedAt: ISO },
      { itemType: "committed_item" as const, itemName: "Flat", value: 1200, recordedAt: ISO },
    ],
    assets: [
      {
        name: "House",
        type: "Property" as const,
        ownerName: "Alice",
        growthRatePct: 3,
        lastReviewedAt: ISO,
        balances: [{ value: 500000, date: "2026-01-01", note: "valuation" }],
      },
    ],
    accounts: [
      {
        name: "ISA",
        type: "StocksAndShares" as const,
        ownerName: "Alice",
        growthRatePct: 5,
        isCashflowLinked: true,
        isISA: true,
        isaYearContribution: 5000,
        lastReviewedAt: ISO,
        balances: [{ value: 20000, date: "2026-01-01", note: null }],
      },
    ],
    purchaseItems: [
      {
        yearAdded: 2026,
        name: "New roof",
        estimatedCost: 8000,
        priority: "high" as const,
        scheduledThisYear: true,
        fundingSources: ["savings"],
        status: "not_started" as const,
        reason: null,
        comment: null,
      },
    ],
    plannerYearBudgets: [{ year: 2026, purchaseBudget: 10000, giftBudget: 2000 }],
    gifts: {
      settings: { mode: "synced" as const, syncedDiscretionaryItemId: null },
      people: [{ name: "Mum", notes: null, sortOrder: 0, isHouseholdMember: false }],
      events: [
        {
          name: "Christmas",
          dateType: "shared" as const,
          dateMonth: 12,
          dateDay: 25,
          isLocked: false,
          sortOrder: 0,
        },
      ],
      allocations: [
        {
          personName: "Mum",
          eventName: "Christmas",
          year: 2026,
          planned: 100,
          spent: null,
          status: "planned" as const,
          notes: null,
          dateMonth: null,
          dateDay: null,
        },
      ],
    },
  };
}

/** Wire up create/upsert mocks so id lookups resolve by name. */
function wireCreateMocks() {
  prismaMock.user.findUnique.mockResolvedValue({ name: "Owner" } as any);
  prismaMock.household.create.mockResolvedValue({
    id: "hh-new",
    name: "Imported Household",
  } as any);
  prismaMock.household.update.mockResolvedValue({ id: "hh-existing" } as any);
  prismaMock.member.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `mem-${args.data.name}`, ...args.data })
  );
  prismaMock.member.findMany.mockResolvedValue([
    { id: "mem-Owner", name: "Owner" },
    { id: "mem-Alice", name: "Alice" },
  ] as any);
  prismaMock.householdSettings.upsert.mockResolvedValue({} as any);
  prismaMock.subcategory.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `sub-${args.data.name}` })
  );
  prismaMock.incomeSource.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `inc-${args.data.name}` })
  );
  prismaMock.committedItem.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `com-${args.data.name}` })
  );
  prismaMock.discretionaryItem.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `dis-${args.data.name}` })
  );
  prismaMock.itemAmountPeriod.create.mockResolvedValue({} as any);
  prismaMock.waterfallHistory.create.mockResolvedValue({} as any);
  prismaMock.asset.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `ast-${args.data.name}` })
  );
  prismaMock.assetBalance.create.mockResolvedValue({} as any);
  prismaMock.account.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `acc-${args.data.name}` })
  );
  prismaMock.accountBalance.create.mockResolvedValue({} as any);
  prismaMock.purchaseItem.create.mockResolvedValue({} as any);
  prismaMock.plannerYearBudget.create.mockResolvedValue({} as any);
  prismaMock.giftPlannerSettings.upsert.mockResolvedValue({} as any);
  prismaMock.giftPerson.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `gp-${args.data.name}` })
  );
  prismaMock.giftEvent.create.mockImplementation((args: any) =>
    Promise.resolve({ id: `ge-${args.data.name}` })
  );
  prismaMock.giftAllocation.create.mockResolvedValue({} as any);
  prismaMock.auditLog.create.mockResolvedValue({} as any);
}

beforeEach(() => resetPrismaMocks());

describe("importService.importHousehold — full create_new restore", () => {
  it("restores every section and writes an audit row when ctx is supplied", async () => {
    wireCreateMocks();
    const ctx = { actorId: "u1", actorName: "Owner", ipAddress: "127.0.0.1", userAgent: "test" };

    const result = await importService.importHousehold(
      "ignored",
      "u1",
      fullExport(),
      "create_new",
      ctx as any
    );

    expect(result).toMatchObject({ success: true, householdId: "hh-new" });
    expect(result.backupId).toBeUndefined();

    // Member with owner name is skipped; Alice imported with DOB + retirement year.
    expect(prismaMock.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Alice", retirementYear: 2050 }),
      })
    );
    // Owner reference resolved to a memberId on the income source.
    expect(prismaMock.incomeSource.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ memberId: "mem-Alice" }) })
    );
    // Balances written for both asset and account.
    expect(prismaMock.assetBalance.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.accountBalance.create).toHaveBeenCalledTimes(1);
    // Gift graph imported.
    expect(prismaMock.giftAllocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ giftPersonId: "gp-Mum", giftEventId: "ge-Christmas" }),
      })
    );
    // Audit row written with counts.
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: expect.anything(), resource: "household" }),
      })
    );
  });

  it("skips the audit row when no ctx is supplied", async () => {
    wireCreateMocks();
    await importService.importHousehold("ignored", "u1", fullExport(), "create_new");
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("throws when a waterfall history entry references an unknown item", async () => {
    wireCreateMocks();
    const envelope = fullExport();
    envelope.waterfallHistory = [
      { itemType: "income_source", itemName: "Ghost", value: 1, recordedAt: ISO },
    ];
    await expect(
      importService.importHousehold("ignored", "u1", envelope, "create_new")
    ).rejects.toThrow(/no matching item/);
  });

  it("throws when a gift allocation references an unknown person", async () => {
    wireCreateMocks();
    const envelope = fullExport();
    envelope.gifts.allocations = [
      {
        personName: "Nobody",
        eventName: "Christmas",
        year: 2026,
        planned: 10,
        spent: null,
        status: "planned",
        notes: null,
        dateMonth: null,
        dateDay: null,
      },
    ];
    await expect(
      importService.importHousehold("ignored", "u1", envelope, "create_new")
    ).rejects.toThrow(/unknown person/);
  });
});

describe("importService.importHousehold — overwrite restore", () => {
  it("backs up, purges existing data, and re-imports into the target household", async () => {
    wireCreateMocks();
    // Caller is the owner of the target household.
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "owner" }));
    prismaMock.importBackup.create.mockResolvedValue({ id: "backup-1" } as any);
    prismaMock.importBackup.deleteMany.mockResolvedValue({ count: 0 } as any);
    // Existing waterfall items so the period/history purge branch runs.
    prismaMock.incomeSource.findMany.mockResolvedValue([{ id: "old-inc" }] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([{ id: "old-com" }] as any);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([] as any);

    const result = await importService.importHousehold(
      "hh-existing",
      "u1",
      fullExport(),
      "overwrite"
    );

    expect(result).toMatchObject({
      success: true,
      householdId: "hh-existing",
      backupId: "backup-1",
    });
    expect(prismaMock.importBackup.create).toHaveBeenCalled();
    expect(prismaMock.household.update).toHaveBeenCalledWith({
      where: { id: "hh-existing" },
      data: { name: "Imported Household" },
    });
    // Purge is scoped to the target household.
    expect(prismaMock.itemAmountPeriod.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-existing" },
    });
    expect(prismaMock.waterfallHistory.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-existing" },
    });
    // Non-caller members purged.
    expect(prismaMock.member.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "hh-existing", NOT: { userId: "u1" } },
    });
  });
});
