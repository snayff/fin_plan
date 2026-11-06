import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { prisma } from "../config/database.js";
import { householdService } from "./household.service.js";
import type { ActorCtx } from "./audit.service.js";
import { assertTestEnvironment } from "../test/helpers/test-db.js";

/**
 * Real-database test: deleting a household must remove every
 * household-scoped row, including tables that have no FK to households
 * and tables that are only reachable via items (amount periods, history).
 */
describe("householdService.delete — full data removal", () => {
  let userId: string;
  let householdId: string;
  let controlHouseholdId: string;
  let ctx: ActorCtx;

  // ids of indirectly-scoped rows (no householdId column)
  let itemIds: string[];
  let assetId: string;
  let accountId: string;

  beforeEach(async () => {
    assertTestEnvironment();

    const user = await prisma.user.create({
      data: {
        email: `delete-cascade-${Date.now()}@test.local`,
        passwordHash: "x",
        name: "Cascade Owner",
      },
    });
    userId = user.id;

    const household = await prisma.household.create({ data: { name: "Cascade HH" } });
    householdId = household.id;
    await prisma.user.update({ where: { id: userId }, data: { activeHouseholdId: householdId } });

    const member = await prisma.member.create({
      data: { householdId, userId, name: "Cascade Owner", role: "owner" },
    });

    await prisma.householdSettings.create({ data: { householdId } });
    await prisma.householdInvite.create({
      data: {
        householdId,
        email: "invitee@test.local",
        tokenHash: `cascade-token-${Date.now()}`,
        expiresAt: new Date(Date.now() + 60_000),
        createdByUserId: userId,
      },
    });

    const incomeSub = await prisma.subcategory.create({
      data: { householdId, tier: "income", name: "Salary" },
    });
    const committedSub = await prisma.subcategory.create({
      data: { householdId, tier: "committed", name: "Housing" },
    });
    const discretionarySub = await prisma.subcategory.create({
      data: { householdId, tier: "discretionary", name: "Savings" },
    });

    const income = await prisma.incomeSource.create({
      data: {
        householdId,
        subcategoryId: incomeSub.id,
        name: "Job",
        frequency: "monthly",
        dueDate: new Date("2026-01-01"),
        memberId: member.id,
      },
    });
    const committed = await prisma.committedItem.create({
      data: {
        householdId,
        subcategoryId: committedSub.id,
        name: "Rent",
        dueDate: new Date("2026-01-01"),
      },
    });

    accountId = (
      await prisma.account.create({ data: { householdId, name: "ISA", type: "Savings" } })
    ).id;
    await prisma.accountBalance.create({
      data: { accountId, value: 1000, date: new Date("2026-01-01") },
    });

    const discretionary = await prisma.discretionaryItem.create({
      data: {
        householdId,
        subcategoryId: discretionarySub.id,
        name: "ISA top-up",
        linkedAccountId: accountId,
      },
    });

    itemIds = [income.id, committed.id, discretionary.id];
    for (const [itemType, itemId] of [
      ["income_source", income.id],
      ["committed_item", committed.id],
      ["discretionary_item", discretionary.id],
    ] as const) {
      await prisma.itemAmountPeriod.create({
        data: { householdId, itemType, itemId, startDate: new Date("2026-01-01"), amount: 100 },
      });
      await prisma.waterfallHistory.create({
        data: { householdId, itemType, itemId, value: 100, recordedAt: new Date("2026-01-01") },
      });
    }

    assetId = (await prisma.asset.create({ data: { householdId, name: "Car", type: "Vehicle" } }))
      .id;
    await prisma.assetBalance.create({
      data: { assetId, value: 9000, date: new Date("2026-01-01") },
    });

    await prisma.purchaseItem.create({
      data: { householdId, yearAdded: 2026, name: "Laptop", estimatedCost: 1200 },
    });
    await prisma.plannerYearBudget.create({ data: { householdId, year: 2026 } });
    await prisma.giftPlannerSettings.create({ data: { householdId } });
    const giftPerson = await prisma.giftPerson.create({
      data: { householdId, name: "Friend", memberId: member.id },
    });
    const giftEvent = await prisma.giftEvent.create({
      data: { householdId, name: "Birthday", dateType: "personal" },
    });
    await prisma.giftAllocation.create({
      data: {
        householdId,
        giftPersonId: giftPerson.id,
        giftEventId: giftEvent.id,
        year: 2026,
        planned: 50,
      },
    });
    await prisma.giftRolloverDismissal.create({ data: { householdId, userId, year: 2026 } });

    await prisma.snapshot.create({ data: { householdId, name: "baseline", data: {} } });
    await prisma.importBackup.create({
      data: { householdId, data: {}, expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.reviewSession.create({ data: { householdId } });

    // Control household — must be untouched by the deletion
    const control = await prisma.household.create({ data: { name: "Control HH" } });
    controlHouseholdId = control.id;
    await prisma.householdSettings.create({ data: { householdId: controlHouseholdId } });
    await prisma.subcategory.create({
      data: { householdId: controlHouseholdId, tier: "income", name: "Salary" },
    });
    await prisma.snapshot.create({
      data: { householdId: controlHouseholdId, name: "baseline", data: {} },
    });

    ctx = {
      householdId,
      actorId: userId,
      actorName: "Cascade Owner",
      ipAddress: null,
      userAgent: null,
    };
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
    await prisma.snapshot.deleteMany({ where: { householdId: controlHouseholdId } });
    await prisma.subcategory.deleteMany({ where: { householdId: controlHouseholdId } });
    await prisma.householdSettings.deleteMany({ where: { householdId: controlHouseholdId } });
    await prisma.household.deleteMany({
      where: { id: { in: [householdId, controlHouseholdId] } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("removes every household-scoped row, including non-FK and item-scoped tables", async () => {
    await householdService.delete(householdId, ctx);

    const scopedCounts = await Promise.all([
      prisma.household.count({ where: { id: householdId } }),
      prisma.member.count({ where: { householdId } }),
      prisma.householdInvite.count({ where: { householdId } }),
      prisma.householdSettings.count({ where: { householdId } }),
      prisma.subcategory.count({ where: { householdId } }),
      prisma.incomeSource.count({ where: { householdId } }),
      prisma.committedItem.count({ where: { householdId } }),
      prisma.discretionaryItem.count({ where: { householdId } }),
      prisma.asset.count({ where: { householdId } }),
      prisma.account.count({ where: { householdId } }),
      prisma.purchaseItem.count({ where: { householdId } }),
      prisma.plannerYearBudget.count({ where: { householdId } }),
      prisma.giftPlannerSettings.count({ where: { householdId } }),
      prisma.giftPerson.count({ where: { householdId } }),
      prisma.giftEvent.count({ where: { householdId } }),
      prisma.giftAllocation.count({ where: { householdId } }),
      prisma.giftRolloverDismissal.count({ where: { householdId } }),
      prisma.snapshot.count({ where: { householdId } }),
      prisma.importBackup.count({ where: { householdId } }),
      prisma.reviewSession.count({ where: { householdId } }),
    ]);
    expect(scopedCounts.every((c) => c === 0)).toBe(true);

    // Indirectly-scoped rows (no householdId column)
    expect(await prisma.itemAmountPeriod.count({ where: { itemId: { in: itemIds } } })).toBe(0);
    expect(await prisma.waterfallHistory.count({ where: { itemId: { in: itemIds } } })).toBe(0);
    expect(await prisma.assetBalance.count({ where: { assetId } })).toBe(0);
    expect(await prisma.accountBalance.count({ where: { accountId } })).toBe(0);
  });

  it("leaves other households' data untouched", async () => {
    await householdService.delete(householdId, ctx);

    expect(await prisma.household.count({ where: { id: controlHouseholdId } })).toBe(1);
    expect(
      await prisma.householdSettings.count({ where: { householdId: controlHouseholdId } })
    ).toBe(1);
    expect(await prisma.subcategory.count({ where: { householdId: controlHouseholdId } })).toBe(1);
    expect(await prisma.snapshot.count({ where: { householdId: controlHouseholdId } })).toBe(1);
  });

  it("retains the deletion audit row and clears the user's active household", async () => {
    await householdService.delete(householdId, ctx);

    const auditRow = await prisma.auditLog.findFirst({
      where: { actorId: userId, action: "DELETE_HOUSEHOLD", resourceId: householdId },
    });
    expect(auditRow).not.toBeNull();
    // FK to the deleted household is set null; the row itself survives
    expect(auditRow?.householdId).toBeNull();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.activeHouseholdId).toBeNull();
  });
});
