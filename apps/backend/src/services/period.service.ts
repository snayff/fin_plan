import { prisma } from "../config/database.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CreatePeriodInput,
  UpdatePeriodInput,
  ItemLifecycleState,
  PeriodItemType,
} from "@finplan/shared";
import { AuditAction } from "@finplan/shared";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";
import { auditEventTx } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";

/** Narrow a thrown value to a Prisma unique-constraint (P2002) error. */
function isUniqueViolation(err: unknown): boolean {
  return err !== null && typeof err === "object" && (err as { code?: unknown }).code === "P2002";
}

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
    itemType: PeriodItemType,
    itemId: string,
    amount: number,
    now: Date = new Date()
  ) {
    const periods = await db.itemAmountPeriod.findMany({
      where: { householdId, itemType, itemId },
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
        itemType,
        itemId,
        startDate: now,
        endDate: nextPeriod?.startDate ?? null,
        amount,
      },
    });
  },

  async listPeriods(householdId: string, itemType: PeriodItemType, itemId: string) {
    return prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType, itemId },
      orderBy: { startDate: "asc" },
    });
  },

  async getCurrentAmount(
    householdId: string,
    itemType: PeriodItemType,
    itemId: string,
    now: Date = new Date()
  ): Promise<number> {
    const periods = await prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType, itemId },
      orderBy: { startDate: "asc" },
    });
    const current = findEffectivePeriod(periods, now);
    return current?.amount ?? 0;
  },

  async getEffectiveAmountForMonth(
    householdId: string,
    itemType: PeriodItemType,
    itemId: string,
    year: number,
    month: number
  ): Promise<number> {
    const periods = await prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType, itemId },
      orderBy: { startDate: "asc" },
    });
    // Use the 1st of the month as reference date (UTC to avoid timezone drift)
    const refDate = new Date(Date.UTC(year, month - 1, 1));
    const effective = findEffectivePeriod(periods, refDate);
    return effective?.amount ?? 0;
  },

  async getLifecycleState(
    householdId: string,
    itemType: PeriodItemType,
    itemId: string,
    now: Date = new Date()
  ): Promise<ItemLifecycleState> {
    const periods = await prisma.itemAmountPeriod.findMany({
      where: { householdId, itemType, itemId },
      orderBy: { startDate: "asc" },
    });
    return computeLifecycleState(periods, now);
  },

  /**
   * Insert a new amount period, stitching it into the existing timeline. The
   * core logic runs against the supplied `db` (a Prisma client or transaction
   * client) so callers can compose it into a larger transaction — e.g. creating
   * an item and its initial period atomically (#130).
   *
   * Boundary rules (#144):
   *  - only close the previous period when it is still open (endDate === null)
   *    or its endDate extends past the new start — never resurrect a period that
   *    was already closed before the new start;
   *  - if an explicit endDate is supplied it must be after the start, and must
   *    not overrun the next period's start.
   */
  async createPeriodTx(db: PrismaLike, householdId: string, data: CreatePeriodInput) {
    const existing = await db.itemAmountPeriod.findMany({
      where: { householdId, itemType: data.itemType, itemId: data.itemId },
      orderBy: { startDate: "asc" },
    });

    const nextPeriod = findNextPeriod(existing, data.startDate);

    // Validate an explicit endDate before mutating anything.
    if (data.endDate) {
      if (data.endDate <= data.startDate) {
        throw new ValidationError("Period end date must be after its start date");
      }
      if (nextPeriod && data.endDate > nextPeriod.startDate) {
        throw new ValidationError("Period end date overlaps the following period");
      }
    }

    // Close the previous period only if it is still open or extends past the
    // new start — don't reopen a period that already closed before this start.
    const prevPeriod = findPreviousPeriod(existing, data.startDate);
    if (prevPeriod && (prevPeriod.endDate === null || prevPeriod.endDate > data.startDate)) {
      await db.itemAmountPeriod.update({
        where: { id: prevPeriod.id },
        data: { endDate: data.startDate },
      });
    }

    const endDate = data.endDate ?? nextPeriod?.startDate ?? null;

    return db.itemAmountPeriod.create({
      data: {
        householdId,
        itemType: data.itemType,
        itemId: data.itemId,
        startDate: data.startDate,
        endDate,
        amount: data.amount,
      },
    });
  },

  async createPeriod(householdId: string, data: CreatePeriodInput, ctx: ActorCtx) {
    try {
      return await prisma.$transaction(async (tx) => {
        const period = await this.createPeriodTx(tx, householdId, data);
        await auditEventTx(tx, {
          householdId,
          actorId: ctx.actorId,
          actorName: ctx.actorName,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          action: AuditAction.CREATE_ITEM_PERIOD,
          resource: "item-period",
          resourceId: period.id,
          metadata: { itemType: data.itemType, itemId: data.itemId },
        });
        return period;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("A period already starts on that date");
      }
      throw err;
    }
  },

  async updatePeriod(householdId: string, id: string, data: UpdatePeriodInput, ctx: ActorCtx) {
    try {
      return await prisma.$transaction(async (tx) => {
        const period = await tx.itemAmountPeriod.findFirst({ where: { id, householdId } });
        if (!period) throw new NotFoundError("Period not found");

        const updateData: Record<string, unknown> = {};
        if (data.amount !== undefined) updateData.amount = data.amount;
        if (data.startDate !== undefined) updateData.startDate = data.startDate;
        if (data.endDate !== undefined) updateData.endDate = data.endDate;

        // Merge requested changes onto the current row to validate the result.
        const mergedStart = data.startDate ?? period.startDate;
        const mergedEnd = data.endDate !== undefined ? data.endDate : period.endDate;

        if (mergedEnd !== null && mergedEnd <= mergedStart) {
          throw new ValidationError("Period end date must be after its start date");
        }

        const startMoved =
          data.startDate !== undefined && data.startDate.getTime() !== period.startDate.getTime();

        // Neighbour overlap / previous-period stitching only matters when the
        // start moves; fetch the timeline once and reuse it.
        if (startMoved) {
          const allPeriods = await tx.itemAmountPeriod.findMany({
            where: { householdId, itemType: period.itemType, itemId: period.itemId },
            orderBy: { startDate: "asc" },
          });

          const prevPeriod = findPreviousPeriod(allPeriods, period.startDate);
          const nextPeriod = findNextPeriod(allPeriods, period.startDate);

          // Reject moving the start on or before the previous period's start, or
          // on/after the next period's start — either would overlap a neighbour.
          if (prevPeriod && mergedStart <= prevPeriod.startDate) {
            throw new ValidationError("Period overlaps the preceding period");
          }
          if (nextPeriod && mergedStart >= nextPeriod.startDate) {
            throw new ValidationError("Period overlaps the following period");
          }
          // An explicit end must also not overrun the next period's start.
          if (mergedEnd !== null && nextPeriod && mergedEnd > nextPeriod.startDate) {
            throw new ValidationError("Period end date overlaps the following period");
          }

          if (prevPeriod) {
            await tx.itemAmountPeriod.update({
              where: { id: prevPeriod.id },
              data: { endDate: mergedStart },
            });
          }
        }

        const updated = await tx.itemAmountPeriod.update({
          where: { id, householdId },
          data: updateData,
        });

        await auditEventTx(tx, {
          householdId,
          actorId: ctx.actorId,
          actorName: ctx.actorName,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          action: AuditAction.UPDATE_ITEM_PERIOD,
          resource: "item-period",
          resourceId: id,
          metadata: { itemType: period.itemType, itemId: period.itemId },
        });

        return updated;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("A period already starts on that date");
      }
      throw err;
    }
  },

  async deletePeriod(
    householdId: string,
    id: string,
    ctx: ActorCtx
  ): Promise<{ deleteItem: boolean; itemType?: string; itemId?: string } | void> {
    return prisma.$transaction(async (tx) => {
      const period = await tx.itemAmountPeriod.findFirst({ where: { id, householdId } });
      if (!period) throw new NotFoundError("Period not found");

      const allPeriods = await tx.itemAmountPeriod.findMany({
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
        await tx.itemAmountPeriod.update({
          where: { id: prevPeriod.id },
          data: { endDate: nextPeriod?.startDate ?? null },
        });
      }

      await tx.itemAmountPeriod.delete({ where: { id, householdId } });

      await auditEventTx(tx, {
        householdId,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        action: AuditAction.DELETE_ITEM_PERIOD,
        resource: "item-period",
        resourceId: id,
        metadata: { itemType: period.itemType, itemId: period.itemId },
      });
    });
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
