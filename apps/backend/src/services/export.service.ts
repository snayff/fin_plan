import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AuthorizationError, NotFoundError } from "../utils/errors.js";
import {
  AuditAction,
  CURRENT_EXPORT_SCHEMA_VERSION,
  householdExportSchema,
  type HouseholdExport,
} from "@finplan/shared";
import type { ActorCtx } from "./audit.service.js";

/**
 * Assert that the requesting user is an owner of the household.
 * Export is owner-only — admins and members cannot trigger full data export.
 */
async function assertExportAccess(householdId: string, userId: string): Promise<void> {
  const member = await prisma.member.findFirst({ where: { householdId, userId } });
  if (!member || member.role !== "owner") {
    throw new AuthorizationError("Only household owners can export data");
  }
}

/**
 * Convert a DateTime (db.Date) to a YYYY-MM-DD string.
 */
function toDateString(date: Date): string {
  const iso = date.toISOString();
  const [day] = iso.split("T");
  return day ?? iso;
}

export const exportService = {
  /**
   * Assemble a complete, versioned JSON export of a household's data.
   *
   * Internal IDs (members, subcategories, items) are mapped to portable
   * name-based references so the export can be re-imported into a fresh
   * household without foreign-key collisions.
   *
   * Excludes audit logs, snapshots, and user account data.
   */
  async exportHousehold(
    householdId: string,
    userId: string,
    ctx?: ActorCtx
  ): Promise<HouseholdExport> {
    await assertExportAccess(householdId, userId);

    const result = await prisma.$transaction(
      async (tx) => {
        const household = await tx.household.findUnique({ where: { id: householdId } });
        if (!household) {
          throw new NotFoundError("Household not found");
        }

        const [
          settings,
          members,
          subcategories,
          incomeSources,
          committedItems,
          discretionaryItems,
          assets,
          accounts,
          purchaseItems,
          plannerYearBudgets,
          giftPlannerSettings,
          giftPeople,
          giftEvents,
          giftAllocations,
        ] = await Promise.all([
          tx.householdSettings.findUnique({ where: { householdId } }),
          tx.member.findMany({ where: { householdId }, orderBy: { joinedAt: "asc" } }),
          tx.subcategory.findMany({ where: { householdId }, orderBy: { sortOrder: "asc" } }),
          tx.incomeSource.findMany({
            where: { householdId },
            include: { subcategory: { select: { name: true } } },
          }),
          tx.committedItem.findMany({
            where: { householdId },
            include: { subcategory: { select: { name: true } } },
          }),
          tx.discretionaryItem.findMany({
            where: { householdId },
            include: { subcategory: { select: { name: true } } },
          }),
          tx.asset.findMany({ where: { householdId }, include: { balances: true } }),
          tx.account.findMany({ where: { householdId }, include: { balances: true } }),
          tx.purchaseItem.findMany({ where: { householdId } }),
          tx.plannerYearBudget.findMany({ where: { householdId } }),
          tx.giftPlannerSettings.findUnique({ where: { householdId } }),
          tx.giftPerson.findMany({ where: { householdId }, orderBy: { sortOrder: "asc" } }),
          tx.giftEvent.findMany({ where: { householdId }, orderBy: { sortOrder: "asc" } }),
          tx.giftAllocation.findMany({ where: { householdId } }),
        ]);

        // Build lookup map keyed by Member.id. Waterfall item memberId and
        // asset/account memberId both reference Member.id.
        const memberNameByMemberId = new Map<string, string>();
        for (const m of members) {
          memberNameByMemberId.set(m.id, m.name);
        }

        // Collect all waterfall item IDs so we can fetch their periods and history
        // in bulk (one query per table instead of N per item).
        const incomeIds = incomeSources.map((i) => i.id);
        const committedIds = committedItems.map((i) => i.id);
        const discretionaryIds = discretionaryItems.map((i) => i.id);
        const allItemIds = [...incomeIds, ...committedIds, ...discretionaryIds];

        const [periods, history] = await Promise.all([
          allItemIds.length > 0
            ? tx.itemAmountPeriod.findMany({
                where: { itemId: { in: allItemIds } },
                orderBy: { startDate: "asc" },
              })
            : Promise.resolve([] as Awaited<ReturnType<typeof tx.itemAmountPeriod.findMany>>),
          allItemIds.length > 0
            ? tx.waterfallHistory.findMany({
                where: { itemId: { in: allItemIds } },
                orderBy: { recordedAt: "asc" },
              })
            : Promise.resolve([] as Awaited<ReturnType<typeof tx.waterfallHistory.findMany>>),
        ]);

        // Build item name + type lookups for portable references in periods/history.
        const itemNameById = new Map<string, string>();
        const itemTypeById = new Map<
          string,
          "income_source" | "committed_item" | "discretionary_item"
        >();
        for (const i of incomeSources) {
          itemNameById.set(i.id, i.name);
          itemTypeById.set(i.id, "income_source");
        }
        for (const i of committedItems) {
          itemNameById.set(i.id, i.name);
          itemTypeById.set(i.id, "committed_item");
        }
        for (const i of discretionaryItems) {
          itemNameById.set(i.id, i.name);
          itemTypeById.set(i.id, "discretionary_item");
        }

        // Group periods by item ID so we can inline the per-item periods array on
        // each waterfall item in the export (in addition to the flat list).
        const periodsByItemId = new Map<string, typeof periods>();
        for (const p of periods) {
          const arr = periodsByItemId.get(p.itemId) ?? [];
          arr.push(p);
          periodsByItemId.set(p.itemId, arr);
        }

        function mapPeriods(itemId: string) {
          return (periodsByItemId.get(itemId) ?? []).map((p) => ({
            startDate: toDateString(p.startDate),
            endDate: p.endDate ? toDateString(p.endDate) : null,
            amount: p.amount,
          }));
        }

        const envelope: HouseholdExport = {
          schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          household: { name: household.name },
          settings: settings
            ? {
                surplusBenchmarkPct: settings.surplusBenchmarkPct,
                isaAnnualLimit: settings.isaAnnualLimit,
                isaYearStartMonth: settings.isaYearStartMonth,
                isaYearStartDay: settings.isaYearStartDay,
                stalenessThresholds: settings.stalenessThresholds as {
                  income_source: number;
                  committed_item: number;
                  discretionary_item: number;
                  asset_item: number;
                  account_item: number;
                },
                currentRatePct: settings.currentRatePct,
                savingsRatePct: settings.savingsRatePct,
                investmentRatePct: settings.investmentRatePct,
                pensionRatePct: settings.pensionRatePct,
                inflationRatePct: settings.inflationRatePct,
                showPence: settings.showPence,
              }
            : {},
          members: members.map((m) => ({
            name: m.name,
            role: m.role,
            dateOfBirth: m.dateOfBirth ? m.dateOfBirth.toISOString() : null,
            retirementYear: m.retirementYear,
          })),
          subcategories: subcategories.map((s) => ({
            tier: s.tier,
            name: s.name,
            sortOrder: s.sortOrder,
            isLocked: s.isLocked,
            isDefault: s.isDefault,
          })),
          incomeSources: incomeSources.map((i) => ({
            subcategoryName: i.subcategory.name,
            name: i.name,
            frequency: i.frequency,
            incomeType: i.incomeType,
            dueDate: i.dueDate,
            ownerName: i.memberId ? (memberNameByMemberId.get(i.memberId) ?? null) : null,
            sortOrder: i.sortOrder,
            lastReviewedAt: i.lastReviewedAt.toISOString(),
            notes: i.notes,
            periods: mapPeriods(i.id),
          })),
          committedItems: committedItems.map((i) => ({
            subcategoryName: i.subcategory.name,
            name: i.name,
            spendType: i.spendType,
            notes: i.notes,
            ownerName: i.memberId ? (memberNameByMemberId.get(i.memberId) ?? null) : null,
            dueDate: i.dueDate,
            sortOrder: i.sortOrder,
            lastReviewedAt: i.lastReviewedAt.toISOString(),
            periods: mapPeriods(i.id),
          })),
          discretionaryItems: discretionaryItems.map((i) => ({
            subcategoryName: i.subcategory.name,
            name: i.name,
            spendType: i.spendType,
            notes: i.notes,
            ownerName: i.memberId ? (memberNameByMemberId.get(i.memberId) ?? null) : null,
            dueDate: i.dueDate,
            sortOrder: i.sortOrder,
            lastReviewedAt: i.lastReviewedAt.toISOString(),
            periods: mapPeriods(i.id),
          })),
          itemAmountPeriods: periods.map((p) => ({
            itemType: itemTypeById.get(p.itemId) ?? "income_source",
            itemName: itemNameById.get(p.itemId) ?? "",
            startDate: toDateString(p.startDate),
            endDate: p.endDate ? toDateString(p.endDate) : null,
            amount: p.amount,
          })),
          waterfallHistory: history.map((h) => ({
            itemType: h.itemType,
            itemName: itemNameById.get(h.itemId) ?? "",
            value: h.value,
            recordedAt: h.recordedAt.toISOString(),
          })),
          assets: assets.map((a) => ({
            name: a.name,
            type: a.type,
            ownerName: a.memberId ? (memberNameByMemberId.get(a.memberId) ?? null) : null,
            growthRatePct: a.growthRatePct,
            lastReviewedAt: a.lastReviewedAt ? a.lastReviewedAt.toISOString() : null,
            balances: a.balances.map((b) => ({
              value: b.value,
              date: toDateString(b.date),
              note: b.note,
            })),
          })),
          accounts: accounts.map((a) => ({
            name: a.name,
            type: a.type,
            ownerName: a.memberId ? (memberNameByMemberId.get(a.memberId) ?? null) : null,
            growthRatePct: a.growthRatePct,
            isCashflowLinked: a.isCashflowLinked,
            isISA: a.isISA,
            isaYearContribution: a.isaYearContribution,
            lastReviewedAt: a.lastReviewedAt ? a.lastReviewedAt.toISOString() : null,
            balances: a.balances.map((b) => ({
              value: b.value,
              date: toDateString(b.date),
              note: b.note,
            })),
          })),
          purchaseItems: purchaseItems.map((p) => ({
            yearAdded: p.yearAdded,
            name: p.name,
            estimatedCost: p.estimatedCost,
            priority: p.priority,
            scheduledThisYear: p.scheduledThisYear,
            fundingSources: p.fundingSources,
            fundingAccountId: p.fundingAccountId,
            status: p.status,
            reason: p.reason,
            comment: p.comment,
          })),
          plannerYearBudgets: plannerYearBudgets.map((b) => ({
            year: b.year,
            purchaseBudget: b.purchaseBudget,
            giftBudget: b.giftBudget,
          })),
          gifts: {
            settings: giftPlannerSettings
              ? {
                  mode: giftPlannerSettings.mode,
                  syncedDiscretionaryItemId: giftPlannerSettings.syncedDiscretionaryItemId,
                }
              : { mode: "synced" as const, syncedDiscretionaryItemId: null },
            people: giftPeople.map((gp) => ({
              name: gp.name,
              notes: gp.notes,
              sortOrder: gp.sortOrder,
              isHouseholdMember: gp.memberId != null,
            })),
            events: giftEvents.map((ge) => ({
              name: ge.name,
              dateType: ge.dateType,
              dateMonth: ge.dateMonth,
              dateDay: ge.dateDay,
              isLocked: ge.isLocked,
              sortOrder: ge.sortOrder,
            })),
            allocations: giftAllocations.map((ga) => {
              const personName = giftPeople.find((p) => p.id === ga.giftPersonId)?.name ?? "";
              const eventName = giftEvents.find((e) => e.id === ga.giftEventId)?.name ?? "";
              return {
                personName,
                eventName,
                year: ga.year,
                planned: ga.planned,
                spent: ga.spent,
                status: ga.status,
                notes: ga.notes,
                dateMonth: ga.dateMonth,
                dateDay: ga.dateDay,
              };
            }),
          },
        };
        return householdExportSchema.parse(envelope);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );

    // Write a single audit row for this export (read-only operation — no transaction required)
    if (ctx) {
      await prisma.auditLog.create({
        data: {
          householdId: ctx.householdId,
          actorId: ctx.actorId,
          actorName: ctx.actorName,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          action: AuditAction.EXPORT_DATA,
          resource: "household",
          resourceId: householdId,
          metadata: {
            counts: {
              members: result.members.length,
              subcategories: result.subcategories.length,
              incomeSources: result.incomeSources.length,
              committedItems: result.committedItems.length,
              discretionaryItems: result.discretionaryItems.length,
              assets: result.assets.length,
              accounts: result.accounts.length,
              purchaseItems: result.purchaseItems.length,
              plannerYearBudgets: result.plannerYearBudgets.length,
              giftPeople: result.gifts?.people.length ?? 0,
              giftEvents: result.gifts?.events.length ?? 0,
              giftAllocations: result.gifts?.allocations.length ?? 0,
            },
          },
        },
      });
    }

    return result;
  },
};
