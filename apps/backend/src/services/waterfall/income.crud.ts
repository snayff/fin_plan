import { prisma } from "../../config/database.js";
import { AuditAction } from "@finplan/shared";
import { audited } from "../audit.service.js";
import type { ActorCtx } from "../audit.service.js";
import type { CreateIncomeSourceInput, UpdateIncomeSourceInput } from "@finplan/shared";
import { periodService } from "../period.service.js";
import { assertOwned } from "../ownership.js";
import { subcategoryService } from "../subcategory.service.js";
import {
  createInitialPeriod,
  enrichItemsWithPeriods,
  validateMemberOwnership,
  validateSubcategoryOwnership,
} from "./shared.js";
import type { InitialPeriodInput } from "./shared.js";

// ─── Income sources ──────────────────────────────────────────────────────────

export async function listIncome(householdId: string) {
  const items = await prisma.incomeSource.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
  });
  return enrichItemsWithPeriods(householdId, items, "income_source");
}

export async function createIncome(
  householdId: string,
  data: CreateIncomeSourceInput,
  ctx: ActorCtx,
  initialPeriod?: InitialPeriodInput
) {
  const subcategoryId =
    data.subcategoryId ?? (await subcategoryService.getDefaultSubcategoryId(householdId, "income"));
  if (data.subcategoryId) {
    await validateSubcategoryOwnership(householdId, data.subcategoryId, "income");
  }
  if (data.memberId) {
    await validateMemberOwnership(householdId, data.memberId);
  }
  const { amount: _amount, startDate: _startDate, endDate: _endDate, ...itemData } = data;
  return audited({
    db: prisma,
    ctx,
    action: "CREATE_INCOME_SOURCE",
    resource: "income-source",
    resourceId: "",
    beforeFetch: async () => null,
    mutation: async (tx) => {
      const s = await tx.incomeSource.create({
        data: { ...itemData, subcategoryId, householdId, lastReviewedAt: new Date() },
      });
      if (initialPeriod) {
        await createInitialPeriod(tx, householdId, "income_source", s.id, initialPeriod);
      }
      return s;
    },
  });
}

export async function updateIncome(
  householdId: string,
  id: string,
  data: UpdateIncomeSourceInput,
  ctx: ActorCtx
) {
  const existing = await prisma.incomeSource.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Income source");
  if (data.subcategoryId) {
    await validateSubcategoryOwnership(householdId, data.subcategoryId, "income");
  }
  if (data.memberId) {
    await validateMemberOwnership(householdId, data.memberId);
  }

  const { amount, ...itemData } = data;

  return audited({
    db: prisma,
    ctx,
    action: "UPDATE_INCOME_SOURCE",
    resource: "income-source",
    resourceId: id,
    beforeFetch: async (tx) => {
      const row = await tx.incomeSource.findUnique({ where: { id } });
      if (!row) return null;
      const before: Record<string, unknown> = { ...row };
      if (amount !== undefined) {
        before.amount = await periodService.getCurrentAmount(householdId, "income_source", id);
      }
      return before;
    },
    mutation: async (tx) => {
      const updated = await tx.incomeSource.update({
        where: { id },
        data: { ...itemData, lastReviewedAt: new Date() },
      });
      if (amount !== undefined) {
        await periodService.setCurrentAmount(tx, householdId, "income_source", id, amount);
        return { ...updated, amount };
      }
      return updated;
    },
  });
}

export async function deleteIncome(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.incomeSource.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Income source");
  await audited({
    db: prisma,
    ctx,
    action: "DELETE_INCOME_SOURCE",
    resource: "income-source",
    resourceId: id,
    beforeFetch: async (tx) =>
      tx.incomeSource.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
    mutation: async (tx) => {
      // Periods and history reference items polymorphically (itemType/itemId)
      // with no FK, so they must be removed explicitly or they orphan.
      await tx.itemAmountPeriod.deleteMany({
        where: { householdId, itemType: "income_source", itemId: id },
      });
      await tx.waterfallHistory.deleteMany({
        where: { householdId, itemType: "income_source", itemId: id },
      });
      await tx.incomeSource.delete({ where: { id } });
      return null;
    },
  });
}

export async function confirmIncome(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.incomeSource.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Income source");
  return audited({
    db: prisma,
    ctx,
    action: AuditAction.CONFIRM_WATERFALL_ITEM,
    resource: "income-source",
    resourceId: id,
    beforeFetch: async () => null,
    mutation: async (tx) =>
      tx.incomeSource.update({ where: { id }, data: { lastReviewedAt: new Date() } }),
  });
}
