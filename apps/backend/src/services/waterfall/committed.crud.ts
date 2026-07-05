import { prisma } from "../../config/database.js";
import { AuditAction } from "@finplan/shared";
import { audited } from "../audit.service.js";
import type { ActorCtx } from "../audit.service.js";
import type { CreateCommittedItemInput, UpdateCommittedItemInput } from "@finplan/shared";
import { periodService } from "../period.service.js";
import { assertOwned } from "../ownership.js";
import {
  createInitialPeriod,
  enrichItemsWithPeriods,
  validateMemberOwnership,
  validateSubcategoryOwnership,
} from "./shared.js";
import type { InitialPeriodInput } from "./shared.js";

// ─── Committed items ──────────────────────────────────────────────────────────

export async function listCommitted(householdId: string) {
  const items = await prisma.committedItem.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
  });
  return enrichItemsWithPeriods(householdId, items, "committed_item");
}

export async function createCommitted(
  householdId: string,
  data: CreateCommittedItemInput,
  ctx: ActorCtx,
  initialPeriod?: InitialPeriodInput
) {
  await validateSubcategoryOwnership(householdId, data.subcategoryId, "committed");
  if (data.memberId) {
    await validateMemberOwnership(householdId, data.memberId);
  }
  const { amount: _amount, startDate: _startDate, endDate: _endDate, ...itemData } = data as any;
  return audited({
    db: prisma,
    ctx,
    action: "CREATE_COMMITTED_ITEM",
    resource: "committed-item",
    resourceId: "",
    beforeFetch: async () => null,
    mutation: async (tx) => {
      const item = await tx.committedItem.create({
        data: {
          ...itemData,
          householdId,
          spendType: data.spendType ?? "monthly",
          lastReviewedAt: new Date(),
        },
      });
      if (initialPeriod) {
        await createInitialPeriod(tx, householdId, "committed_item", item.id, initialPeriod);
      }
      return item;
    },
  });
}

export async function updateCommitted(
  householdId: string,
  id: string,
  data: UpdateCommittedItemInput,
  ctx: ActorCtx
) {
  const existing = await prisma.committedItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Committed item");
  if (data.subcategoryId) {
    await validateSubcategoryOwnership(householdId, data.subcategoryId, "committed");
  }
  if (data.memberId) {
    await validateMemberOwnership(householdId, data.memberId);
  }

  const { amount, ...itemData } = data;

  return audited({
    db: prisma,
    ctx,
    action: "UPDATE_COMMITTED_ITEM",
    resource: "committed-item",
    resourceId: id,
    beforeFetch: async (tx) => {
      const row = await tx.committedItem.findUnique({ where: { id } });
      if (!row) return null;
      const before: Record<string, unknown> = { ...row };
      if (amount !== undefined) {
        before.amount = await periodService.getCurrentAmount(householdId, "committed_item", id);
      }
      return before;
    },
    mutation: async (tx) => {
      const updated = await tx.committedItem.update({
        where: { id },
        data: { ...itemData, lastReviewedAt: new Date() },
      });
      if (amount !== undefined) {
        await periodService.setCurrentAmount(tx, householdId, "committed_item", id, amount);
        return { ...updated, amount };
      }
      return updated;
    },
  });
}

export async function deleteCommitted(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.committedItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Committed item");
  await audited({
    db: prisma,
    ctx,
    action: "DELETE_COMMITTED_ITEM",
    resource: "committed-item",
    resourceId: id,
    beforeFetch: async (tx) =>
      tx.committedItem.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
    mutation: async (tx) => {
      // Periods and history reference items polymorphically (itemType/itemId)
      // with no FK, so they must be removed explicitly or they orphan.
      await tx.itemAmountPeriod.deleteMany({
        where: { householdId, itemType: "committed_item", itemId: id },
      });
      await tx.waterfallHistory.deleteMany({
        where: { householdId, itemType: "committed_item", itemId: id },
      });
      await tx.committedItem.delete({ where: { id } });
      return null;
    },
  });
}

export async function confirmCommitted(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.committedItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Committed item");
  return audited({
    db: prisma,
    ctx,
    action: AuditAction.CONFIRM_WATERFALL_ITEM,
    resource: "committed-item",
    resourceId: id,
    beforeFetch: async () => null,
    mutation: async (tx) =>
      tx.committedItem.update({ where: { id }, data: { lastReviewedAt: new Date() } }),
  });
}

// ─── Yearly items (CommittedItem with spendType=yearly) ─────────────────────

export async function listYearly(householdId: string) {
  const items = await prisma.committedItem.findMany({
    where: { householdId, spendType: "yearly" },
    orderBy: { sortOrder: "asc" },
  });
  return enrichItemsWithPeriods(householdId, items, "committed_item");
}

export async function createYearly(
  householdId: string,
  data: CreateCommittedItemInput,
  ctx: ActorCtx,
  initialPeriod?: InitialPeriodInput
) {
  await validateSubcategoryOwnership(householdId, data.subcategoryId, "committed");
  if (data.memberId) {
    await validateMemberOwnership(householdId, data.memberId);
  }
  const { amount: _amount, startDate: _startDate, endDate: _endDate, ...itemData } = data as any;
  return audited({
    db: prisma,
    ctx,
    action: "CREATE_COMMITTED_ITEM",
    resource: "committed-item",
    resourceId: "",
    beforeFetch: async () => null,
    mutation: async (tx) => {
      const item = await tx.committedItem.create({
        data: {
          ...itemData,
          householdId,
          spendType: "yearly",
          lastReviewedAt: new Date(),
        },
      });
      if (initialPeriod) {
        await createInitialPeriod(tx, householdId, "committed_item", item.id, initialPeriod);
      }
      return item;
    },
  });
}

export async function updateYearly(
  householdId: string,
  id: string,
  data: UpdateCommittedItemInput,
  ctx: ActorCtx
) {
  const existing = await prisma.committedItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Committed item");
  if (data.subcategoryId) {
    await validateSubcategoryOwnership(householdId, data.subcategoryId, "committed");
  }
  if (data.memberId) {
    await validateMemberOwnership(householdId, data.memberId);
  }

  const { amount, ...itemData } = data;

  return audited({
    db: prisma,
    ctx,
    action: "UPDATE_COMMITTED_ITEM",
    resource: "committed-item",
    resourceId: id,
    beforeFetch: async (tx) => {
      const row = await tx.committedItem.findUnique({ where: { id } });
      if (!row) return null;
      const before: Record<string, unknown> = { ...row };
      if (amount !== undefined) {
        before.amount = await periodService.getCurrentAmount(householdId, "committed_item", id);
      }
      return before;
    },
    mutation: async (tx) => {
      const updated = await tx.committedItem.update({
        where: { id },
        data: { ...itemData, lastReviewedAt: new Date() },
      });
      if (amount !== undefined) {
        await periodService.setCurrentAmount(tx, householdId, "committed_item", id, amount);
        return { ...updated, amount };
      }
      return updated;
    },
  });
}

export async function deleteYearly(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.committedItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Committed item");
  await audited({
    db: prisma,
    ctx,
    action: "DELETE_COMMITTED_ITEM",
    resource: "committed-item",
    resourceId: id,
    beforeFetch: async (tx) =>
      tx.committedItem.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
    mutation: async (tx) => {
      // Yearly items are CommittedItem rows, so periods/history use the
      // committed_item itemType. No FK → delete explicitly to avoid orphans.
      await tx.itemAmountPeriod.deleteMany({
        where: { householdId, itemType: "committed_item", itemId: id },
      });
      await tx.waterfallHistory.deleteMany({
        where: { householdId, itemType: "committed_item", itemId: id },
      });
      await tx.committedItem.delete({ where: { id } });
      return null;
    },
  });
}

export async function confirmYearly(householdId: string, id: string, ctx: ActorCtx) {
  const existing = await prisma.committedItem.findUnique({ where: { id } });
  assertOwned(existing, householdId, "Committed item");
  return audited({
    db: prisma,
    ctx,
    action: AuditAction.CONFIRM_WATERFALL_ITEM,
    resource: "committed-item",
    resourceId: id,
    beforeFetch: async () => null,
    mutation: async (tx) =>
      tx.committedItem.update({ where: { id }, data: { lastReviewedAt: new Date() } }),
  });
}
