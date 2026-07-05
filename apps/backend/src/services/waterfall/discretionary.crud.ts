import { prisma } from "../../config/database.js";
import { AuditAction } from "@finplan/shared";
import { audited } from "../audit.service.js";
import type { ActorCtx } from "../audit.service.js";
import type { CreateDiscretionaryItemInput, UpdateDiscretionaryItemInput } from "@finplan/shared";
import { periodService } from "../period.service.js";
import { assertOwned } from "../ownership.js";
import {
  assertNotPlannerOwned,
  createInitialPeriod,
  enrichItemsWithPeriods,
  getSavingsSubcategoryId,
  validateLinkedAccount,
  validateMemberOwnership,
  validateSubcategoryNotPlannerLocked,
  validateSubcategoryOwnership,
} from "./shared.js";
import type { InitialPeriodInput } from "./shared.js";

// ─── Discretionary items ─────────────────────────────────────────────────────

export async function listDiscretionary(householdId: string) {
  const items = await prisma.discretionaryItem.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
    include: { linkedAccount: { select: { id: true, name: true, type: true } } },
  });
  return enrichItemsWithPeriods(householdId, items, "discretionary_item");
}

export async function listDiscretionaryStale(householdId: string) {
  const items = await prisma.discretionaryItem.findMany({
    where: { householdId, isPlannerOwned: false },
    orderBy: { sortOrder: "asc" },
    include: { linkedAccount: { select: { id: true, name: true, type: true } } },
  });
  return enrichItemsWithPeriods(householdId, items, "discretionary_item");
}

export async function createDiscretionary(
  householdId: string,
  data: CreateDiscretionaryItemInput,
  ctx: ActorCtx,
  initialPeriod?: InitialPeriodInput
) {
  await validateSubcategoryOwnership(householdId, data.subcategoryId, "discretionary");
  await validateSubcategoryNotPlannerLocked(householdId, data.subcategoryId);
  if ((data as any).linkedAccountId) {
    await validateLinkedAccount(householdId, data.subcategoryId, (data as any).linkedAccountId);
  }
  if ((data as any).memberId) {
    await validateMemberOwnership(householdId, (data as any).memberId);
  }
  const { amount: _amount, startDate: _startDate, endDate: _endDate, ...itemData } = data as any;
  return audited({
    db: prisma,
    ctx,
    action: "CREATE_DISCRETIONARY_ITEM",
    resource: "discretionary-item",
    resourceId: "",
    beforeFetch: async () => null,
    mutation: async (tx) => {
      const item = await tx.discretionaryItem.create({
        data: {
          ...itemData,
          householdId,
          spendType: data.spendType ?? "monthly",
          lastReviewedAt: new Date(),
        },
      });
      if (initialPeriod) {
        await createInitialPeriod(tx, householdId, "discretionary_item", item.id, initialPeriod);
      }
      return item;
    },
  });
}

export async function updateDiscretionary(
  householdId: string,
  id: string,
  data: UpdateDiscretionaryItemInput,
  ctx: ActorCtx
) {
  const existing = await prisma.discretionaryItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Discretionary item");
  assertNotPlannerOwned(existing as any);
  if (data.subcategoryId) {
    await validateSubcategoryOwnership(householdId, data.subcategoryId, "discretionary");
  }
  if ((data as any).memberId) {
    await validateMemberOwnership(householdId, (data as any).memberId);
  }

  // Validate linkedAccountId if being set
  if ((data as any).linkedAccountId) {
    const targetSubcategoryId = data.subcategoryId ?? existing!.subcategoryId ?? "";
    await validateLinkedAccount(householdId, targetSubcategoryId, (data as any).linkedAccountId, {
      isPlannerOwned: !!(existing as any).isPlannerOwned,
    });
  }

  // Auto-null linkedAccountId when item is moved out of Savings subcategory
  const savingsSubId = await getSavingsSubcategoryId(householdId);
  const isMovingOutOfSavings =
    data.subcategoryId != null &&
    data.subcategoryId !== savingsSubId &&
    existing!.subcategoryId === savingsSubId;
  const effectiveData: typeof data = isMovingOutOfSavings
    ? { ...data, linkedAccountId: null }
    : data;

  const { amount, ...itemData } = effectiveData;

  return audited({
    db: prisma,
    ctx,
    action: "UPDATE_DISCRETIONARY_ITEM",
    resource: "discretionary-item",
    resourceId: id,
    beforeFetch: async (tx) => {
      const row = await tx.discretionaryItem.findUnique({ where: { id } });
      if (!row) return null;
      const before: Record<string, unknown> = { ...row };
      if (amount !== undefined) {
        before.amount = await periodService.getCurrentAmount(householdId, "discretionary_item", id);
      }
      return before;
    },
    mutation: async (tx) => {
      const updated = await tx.discretionaryItem.update({
        where: { id },
        data: { ...itemData, lastReviewedAt: new Date() },
      });
      if (amount !== undefined) {
        await periodService.setCurrentAmount(tx, householdId, "discretionary_item", id, amount);
        return { ...updated, amount };
      }
      return updated;
    },
  });
}

export async function deleteDiscretionary(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.discretionaryItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Discretionary item");
  assertNotPlannerOwned(existing as any);
  await audited({
    db: prisma,
    ctx,
    action: "DELETE_DISCRETIONARY_ITEM",
    resource: "discretionary-item",
    resourceId: id,
    beforeFetch: async (tx) =>
      tx.discretionaryItem.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
    mutation: async (tx) => {
      // Periods and history reference items polymorphically (itemType/itemId)
      // with no FK, so they must be removed explicitly or they orphan.
      await tx.itemAmountPeriod.deleteMany({
        where: { householdId, itemType: "discretionary_item", itemId: id },
      });
      await tx.waterfallHistory.deleteMany({
        where: { householdId, itemType: "discretionary_item", itemId: id },
      });
      await tx.discretionaryItem.delete({ where: { id } });
      return null;
    },
  });
}

export async function confirmDiscretionary(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.discretionaryItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Discretionary item");
  return audited({
    db: prisma,
    ctx,
    action: AuditAction.CONFIRM_WATERFALL_ITEM,
    resource: "discretionary-item",
    resourceId: id,
    beforeFetch: async () => null,
    mutation: async (tx) =>
      tx.discretionaryItem.update({ where: { id }, data: { lastReviewedAt: new Date() } }),
  });
}

// ─── Savings (DiscretionaryItem in Savings subcategory) ─────────────────────

export async function listSavings(householdId: string) {
  const savingsSubcategory = await prisma.subcategory.findFirst({
    where: { householdId, tier: "discretionary", name: "Savings" },
  });
  if (!savingsSubcategory) return [];
  const items = await prisma.discretionaryItem.findMany({
    where: { householdId, subcategoryId: savingsSubcategory.id },
    orderBy: { sortOrder: "asc" },
    include: { linkedAccount: { select: { id: true, name: true, type: true } } },
  });
  return enrichItemsWithPeriods(householdId, items, "discretionary_item");
}

export async function createSavings(
  householdId: string,
  data: CreateDiscretionaryItemInput,
  ctx: ActorCtx,
  initialPeriod?: InitialPeriodInput
) {
  await validateSubcategoryOwnership(householdId, data.subcategoryId, "discretionary");
  await validateSubcategoryNotPlannerLocked(householdId, data.subcategoryId);
  if ((data as any).linkedAccountId) {
    await validateLinkedAccount(householdId, data.subcategoryId, (data as any).linkedAccountId);
  }
  if ((data as any).memberId) {
    await validateMemberOwnership(householdId, (data as any).memberId);
  }
  const { amount: _amount, startDate: _startDate, endDate: _endDate, ...itemData } = data as any;
  return audited({
    db: prisma,
    ctx,
    action: "CREATE_DISCRETIONARY_ITEM",
    resource: "discretionary-item",
    resourceId: "",
    beforeFetch: async () => null,
    mutation: async (tx) => {
      const item = await tx.discretionaryItem.create({
        data: {
          ...itemData,
          householdId,
          spendType: data.spendType ?? "monthly",
          lastReviewedAt: new Date(),
        },
      });
      if (initialPeriod) {
        await createInitialPeriod(tx, householdId, "discretionary_item", item.id, initialPeriod);
      }
      return item;
    },
  });
}

export async function updateSavings(
  householdId: string,
  id: string,
  data: UpdateDiscretionaryItemInput,
  ctx: ActorCtx
) {
  const existing = await prisma.discretionaryItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Savings allocation");
  assertNotPlannerOwned(existing as any);
  if (data.subcategoryId) {
    await validateSubcategoryOwnership(householdId, data.subcategoryId, "discretionary");
  }
  if ((data as any).memberId) {
    await validateMemberOwnership(householdId, (data as any).memberId);
  }

  // Validate linkedAccountId if being set (same guard as the discretionary path)
  if ((data as any).linkedAccountId) {
    const targetSubcategoryId = data.subcategoryId ?? existing!.subcategoryId ?? "";
    await validateLinkedAccount(householdId, targetSubcategoryId, (data as any).linkedAccountId, {
      isPlannerOwned: !!(existing as any).isPlannerOwned,
    });
  }

  const { amount, ...itemData } = data;

  return audited({
    db: prisma,
    ctx,
    action: "UPDATE_DISCRETIONARY_ITEM",
    resource: "discretionary-item",
    resourceId: id,
    beforeFetch: async (tx) => {
      const row = await tx.discretionaryItem.findUnique({ where: { id } });
      if (!row) return null;
      const before: Record<string, unknown> = { ...row };
      if (amount !== undefined) {
        before.amount = await periodService.getCurrentAmount(householdId, "discretionary_item", id);
      }
      return before;
    },
    mutation: async (tx) => {
      const updated = await tx.discretionaryItem.update({
        where: { id },
        data: { ...itemData, lastReviewedAt: new Date() },
      });
      if (amount !== undefined) {
        await periodService.setCurrentAmount(tx, householdId, "discretionary_item", id, amount);
        return { ...updated, amount };
      }
      return updated;
    },
  });
}

export async function deleteSavings(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.discretionaryItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Savings allocation");
  assertNotPlannerOwned(existing as any);
  await audited({
    db: prisma,
    ctx,
    action: "DELETE_DISCRETIONARY_ITEM",
    resource: "discretionary-item",
    resourceId: id,
    beforeFetch: async (tx) =>
      tx.discretionaryItem.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
    mutation: async (tx) => {
      // Savings allocations are DiscretionaryItem rows; periods/history use the
      // discretionary_item itemType. No FK → delete explicitly to avoid orphans.
      await tx.itemAmountPeriod.deleteMany({
        where: { householdId, itemType: "discretionary_item", itemId: id },
      });
      await tx.waterfallHistory.deleteMany({
        where: { householdId, itemType: "discretionary_item", itemId: id },
      });
      await tx.discretionaryItem.delete({ where: { id } });
      return null;
    },
  });
}

export async function confirmSavings(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.discretionaryItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Savings allocation");
  return audited({
    db: prisma,
    ctx,
    action: AuditAction.CONFIRM_WATERFALL_ITEM,
    resource: "discretionary-item",
    resourceId: id,
    beforeFetch: async () => null,
    mutation: async (tx) =>
      tx.discretionaryItem.update({ where: { id }, data: { lastReviewedAt: new Date() } }),
  });
}
