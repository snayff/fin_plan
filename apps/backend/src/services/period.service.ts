import { prisma } from "../config/database.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreatePeriodInput, UpdatePeriodInput, ItemLifecycleState } from "@finplan/shared";

/**
 * A Prisma client or an interactive-transaction client. `setCurrentAmount`
 * accepts either so the amount write can join an existing audited transaction.
 */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

export const periodService = {
  /**
   * Set the amount of the item's CURRENT effective period in place. If no
   * period covers `now` (e.g. the item has only future/expired periods, or
   * none at all), a new period starting today is created and stitched into the
   * timeline. Designed to run inside an existing transaction (pass the audited
   * `tx`) so the amount change commits atomically with the item mutation.
   */
  async setCurrentAmount(
    db: PrismaLike,
    householdId: string,
    itemType: string,
    itemId: string,
    amount: number,
    now: Date = new Date()
  ) {
    const periods = await db.itemAmountPeriod.findMany({
      where: { householdId, itemType: itemType as any, itemId },
      orderBy: { startDate: "asc" },
    });

    const current = findEffectivePeriod(periods, now);
    if (current) {
      return db.itemAmountPeriod.update({
        where: { id: current.id },
        data: { amount },
      });
    }

    // No effective period — create one starting today, closing the previous
    // period and inheriting the next period's start as our end (mirrors
    // createPeriod's stitching logic).
    const prevPeriod = findPreviousPeriod(periods, now);
    if (prevPeriod) {
      await db.itemAmountPeriod.update({
        where: { id: prevPeriod.id },
        data: { endDate: now },
      });
    }
    const nextPeriod = findNextPeriod(periods, now);
    return db.itemAmountPeriod.create({
      data: {
        householdId,
        itemType: itemType as any,
        itemId,
        startDate: now,
        endDate: nextPeriod?.startDate ?? null,
        amount,
      },
    });
  },

  async listPeriods(householdId: string, itemType: string, itemId: string) {
    return prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType: itemType as any, itemId },
      orderBy: { startDate: "asc" },
    });
  },

  async getCurrentAmount(
    householdId: string,
    itemType: string,
    itemId: string,
    now: Date = new Date()
  ): Promise<number> {
    const periods = await prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType: itemType as any, itemId },
      orderBy: { startDate: "asc" },
    });
    const current = findEffectivePeriod(periods, now);
    return current?.amount ?? 0;
  },

  async getEffectiveAmountForMonth(
    householdId: string,
    itemType: string,
    itemId: string,
    year: number,
    month: number
  ): Promise<number> {
    const periods = await prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType: itemType as any, itemId },
      orderBy: { startDate: "asc" },
    });
    // Use the 1st of the month as reference date
    const refDate = new Date(year, month - 1, 1);
    const effective = findEffectivePeriod(periods, refDate);
    return effective?.amount ?? 0;
  },

  async getLifecycleState(
    householdId: string,
    itemType: string,
    itemId: string,
    now: Date = new Date()
  ): Promise<ItemLifecycleState> {
    const periods = await prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType: itemType as any, itemId },
      orderBy: { startDate: "asc" },
    });
    return computeLifecycleState(periods, now);
  },

  async createPeriod(householdId: string, data: CreatePeriodInput) {
    const existing = await prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType: data.itemType as any, itemId: data.itemId },
      orderBy: { startDate: "asc" },
    });

    // Find the period that should have its endDate set to this new period's startDate
    const prevPeriod = findPreviousPeriod(existing, data.startDate);
    if (prevPeriod) {
      await prisma.itemAmountPeriod.update({
        where: { id: prevPeriod.id },
        data: { endDate: data.startDate },
      });
    }

    // Find the period after this one — set new period's endDate to that period's startDate
    const nextPeriod = findNextPeriod(existing, data.startDate);
    const endDate = data.endDate ?? nextPeriod?.startDate ?? null;

    return prisma.itemAmountPeriod.create({
      data: {
        householdId,
        itemType: data.itemType as any,
        itemId: data.itemId,
        startDate: data.startDate,
        endDate,
        amount: data.amount,
      },
    });
  },

  async updatePeriod(householdId: string, id: string, data: UpdatePeriodInput) {
    const period = await prisma.itemAmountPeriod.findFirst({ where: { id, householdId } });
    if (!period) throw new Error("Period not found");

    const updateData: Record<string, unknown> = {};
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;

    // If startDate changes, update the previous period's endDate
    if (data.startDate && data.startDate.getTime() !== period.startDate.getTime()) {
      const allPeriods = await prisma.itemAmountPeriod.findMany({
        where: { householdId, itemType: period.itemType, itemId: period.itemId },
        orderBy: { startDate: "asc" },
      });
      const prevPeriod = findPreviousPeriod(allPeriods, period.startDate);
      if (prevPeriod) {
        await prisma.itemAmountPeriod.update({
          where: { id: prevPeriod.id },
          data: { endDate: data.startDate },
        });
      }
    }

    return prisma.itemAmountPeriod.update({ where: { id, householdId }, data: updateData });
  },

  async deletePeriod(
    householdId: string,
    id: string
  ): Promise<{ deleteItem: boolean; itemType?: string; itemId?: string } | void> {
    const period = await prisma.itemAmountPeriod.findFirst({ where: { id, householdId } });
    if (!period) throw new Error("Period not found");

    const allPeriods = await prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType: period.itemType, itemId: period.itemId },
      orderBy: { startDate: "asc" },
    });

    // If this is the last period, signal item deletion
    if (allPeriods.length <= 1) {
      return { deleteItem: true, itemType: period.itemType, itemId: period.itemId };
    }

    const idx = allPeriods.findIndex((p) => p.id === id);
    const prevPeriod = idx > 0 ? allPeriods[idx - 1] : null;
    const nextPeriod = idx < allPeriods.length - 1 ? allPeriods[idx + 1] : null;

    // Adjust adjacent period to close the gap
    if (prevPeriod) {
      await prisma.itemAmountPeriod.update({
        where: { id: prevPeriod.id },
        data: { endDate: nextPeriod?.startDate ?? null },
      });
    }

    await prisma.itemAmountPeriod.delete({ where: { id, householdId } });
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PeriodLike {
  id: string;
  startDate: Date;
  endDate: Date | null;
  amount: number;
}

function findEffectivePeriod(periods: PeriodLike[], refDate: Date): PeriodLike | null {
  // Walk backwards through sorted periods to find the most recent one that has started
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i]!;
    if (p.startDate <= refDate && (p.endDate === null || p.endDate > refDate)) {
      return p;
    }
  }
  return null;
}

export function computeLifecycleState(
  periods: Array<{ startDate: Date; endDate: Date | null }>,
  now: Date
): ItemLifecycleState {
  if (periods.length === 0) return "expired";

  const allFuture = periods.every((p) => p.startDate > now);
  if (allFuture) return "future";

  const allExpired = periods.every((p) => p.endDate !== null && p.endDate <= now);
  if (allExpired) return "expired";

  return "active";
}

function findPreviousPeriod(periods: PeriodLike[], startDate: Date): PeriodLike | null {
  let prev: PeriodLike | null = null;
  for (const p of periods) {
    if (p.startDate < startDate) prev = p;
    else break;
  }
  return prev;
}

function findNextPeriod(periods: PeriodLike[], startDate: Date): PeriodLike | null {
  for (const p of periods) {
    if (p.startDate > startDate) return p;
  }
  return null;
}

export { findEffectivePeriod };
