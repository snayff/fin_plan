import { prisma } from "../../config/database.js";
import type { WaterfallItemType } from "@prisma/client";
import { NotFoundError } from "../../utils/errors.js";
import { AuditAction } from "@finplan/shared";
import { auditEventTx } from "../audit.service.js";
import type { ActorCtx } from "../audit.service.js";
import type { ConfirmBatchInput } from "@finplan/shared";
import { assertOwned } from "../ownership.js";

// ─── History ──────────────────────────────────────────────────────────────────

export async function getHistory(householdId: string, type: string, id: string) {
  // Verify ownership and narrow the free-text `type` to the enum.
  let itemType: WaterfallItemType;
  switch (type) {
    case "income_source": {
      const item = await prisma.incomeSource.findUnique({ where: { id } });
      assertOwned(item, householdId, "Income source");
      itemType = "income_source";
      break;
    }
    case "committed_item": {
      const item = await prisma.committedItem.findUnique({ where: { id } });
      assertOwned(item, householdId, "Committed item");
      itemType = "committed_item";
      break;
    }
    case "discretionary_item": {
      const item = await prisma.discretionaryItem.findUnique({ where: { id } });
      assertOwned(item, householdId, "Discretionary item");
      itemType = "discretionary_item";
      break;
    }
    default:
      throw new NotFoundError("Unknown item type");
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);

  return prisma.waterfallHistory.findMany({
    where: { householdId, itemType, itemId: id, recordedAt: { gte: cutoff } },
    orderBy: { recordedAt: "asc" },
  });
}

// ─── Batch confirm ────────────────────────────────────────────────────────────

export async function confirmBatch(householdId: string, data: ConfirmBatchInput, ctx: ActorCtx) {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const item of data.items) {
      switch (item.type) {
        case "income_source":
          await tx.incomeSource.updateMany({
            where: { id: item.id, householdId },
            data: { lastReviewedAt: now },
          });
          break;
        case "committed_bill":
        case "yearly_bill":
        case "committed_item":
          await tx.committedItem.updateMany({
            where: { id: item.id, householdId },
            data: { lastReviewedAt: now },
          });
          break;
        case "discretionary_category":
        case "savings_allocation":
        case "discretionary_item":
          await tx.discretionaryItem.updateMany({
            where: { id: item.id, householdId },
            data: { lastReviewedAt: now },
          });
          break;
      }
    }

    // One durable audit row for the whole batch confirm, committed atomically
    // with the lastReviewedAt updates (#123).
    await auditEventTx(tx, {
      householdId,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: AuditAction.CONFIRM_WATERFALL_ITEM,
      resource: "review-session",
      resourceId: householdId,
      metadata: { count: data.items.length },
    });
  });
}

// ─── Delete all ───────────────────────────────────────────────────────────────

export async function deleteAll(householdId: string, ctx: ActorCtx) {
  await prisma.$transaction(async (tx) => {
    await tx.itemAmountPeriod.deleteMany({ where: { householdId } });
    await tx.incomeSource.deleteMany({ where: { householdId } });
    await tx.committedItem.deleteMany({ where: { householdId } });
    await tx.discretionaryItem.deleteMany({ where: { householdId } });
    await tx.subcategory.deleteMany({ where: { householdId } });

    // One durable audit row for the whole-household wipe, committed atomically
    // with the deletes (SEC-1).
    await auditEventTx(tx, {
      householdId,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: AuditAction.DELETE_ALL_WATERFALL,
      resource: "waterfall",
      resourceId: householdId,
    });
  });
}
