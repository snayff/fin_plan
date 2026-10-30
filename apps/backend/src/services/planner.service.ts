import { prisma } from "../config/database.js";
import { NotFoundError } from "../utils/errors.js";
import { audited, auditEventTx } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import { AuditAction } from "@finplan/shared";
import type {
  CreatePurchaseInput,
  UpdatePurchaseInput,
  UpsertYearBudgetInput,
} from "@finplan/shared";
import { assertOwned } from "./ownership.js";

async function validateFundingAccount(householdId: string, fundingAccountId: string) {
  const account = await prisma.account.findFirst({
    where: { id: fundingAccountId, householdId },
  });
  if (!account) throw new NotFoundError("Account not found");
}

export const plannerService = {
  // ─── Purchases ────────────────────────────────────────────────────────────

  async listPurchases(householdId: string, year: number) {
    return prisma.purchaseItem.findMany({
      where: { householdId, yearAdded: year },
      orderBy: [{ scheduledThisYear: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
    });
  },

  async createPurchase(householdId: string, data: CreatePurchaseInput, ctx: ActorCtx) {
    if (data.fundingAccountId) {
      await validateFundingAccount(householdId, data.fundingAccountId);
    }
    return audited({
      db: prisma,
      ctx,
      action: AuditAction.CREATE_PLANNER_GOAL,
      resource: "planner-goal",
      resourceId: (after: { id: string }) => after.id,
      beforeFetch: async () => null,
      mutation: async (tx) =>
        tx.purchaseItem.create({
          data: { ...data, householdId, yearAdded: new Date().getFullYear() },
        }),
    });
  },

  async updatePurchase(householdId: string, id: string, data: UpdatePurchaseInput, ctx: ActorCtx) {
    const existing = await prisma.purchaseItem.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Purchase");
    if (data.fundingAccountId) {
      await validateFundingAccount(householdId, data.fundingAccountId);
    }
    return audited({
      db: prisma,
      ctx,
      action: AuditAction.UPDATE_PLANNER_GOAL,
      resource: "planner-goal",
      resourceId: id,
      beforeFetch: async (tx) =>
        tx.purchaseItem.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
      mutation: async (tx) => tx.purchaseItem.update({ where: { id }, data }),
    });
  },

  async deletePurchase(householdId: string, id: string, ctx: ActorCtx) {
    const existing = await prisma.purchaseItem.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Purchase");
    await audited({
      db: prisma,
      ctx,
      action: AuditAction.DELETE_PLANNER_GOAL,
      resource: "planner-goal",
      resourceId: id,
      beforeFetch: async (tx) =>
        tx.purchaseItem.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
      mutation: async (tx) => {
        await tx.purchaseItem.delete({ where: { id } });
        return null;
      },
    });
  },

  // ─── Year budget ──────────────────────────────────────────────────────────

  async getYearBudget(householdId: string, year: number) {
    const existing = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year } },
    });
    if (existing) return existing;
    // GET is read-only: never persist a row on read (#179). Return a transient
    // default with the same shape; the row is created lazily on PUT/upsert.
    return {
      id: null,
      householdId,
      year,
      purchaseBudget: 0,
      giftBudget: 0,
      createdAt: null,
      updatedAt: null,
    };
  },

  async upsertYearBudget(
    householdId: string,
    year: number,
    data: UpsertYearBudgetInput,
    ctx: ActorCtx
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.plannerYearBudget.findUnique({
        where: { householdId_year: { householdId, year } },
      });
      const isNew = existing === null;

      const result = await tx.plannerYearBudget.upsert({
        where: { householdId_year: { householdId, year } },
        create: { householdId, year, ...data },
        update: data,
      });

      // durable: committed atomically with the surrounding $transaction
      await auditEventTx(tx, {
        householdId: ctx.householdId,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        action: AuditAction.UPSERT_YEAR_BUDGET,
        resource: "year-budget",
        resourceId: String(year),
        metadata: { counts: { created: isNew ? 1 : 0, updated: isNew ? 0 : 1 } },
      });

      return result;
    });
  },
};
