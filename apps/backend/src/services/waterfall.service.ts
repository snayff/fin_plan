import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { subcategoryService } from "./subcategory.service.js";
import { toGBP, toMonthlyAmount } from "@finplan/shared";
import { audited } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import type {
  CreateIncomeSourceInput,
  UpdateIncomeSourceInput,
  ConfirmBatchInput,
  WaterfallSummary,
  IncomeType,
  IncomeByType,
  IncomeSourceRow,
  CreateCommittedItemInput,
  UpdateCommittedItemInput,
  CreateDiscretionaryItemInput,
  UpdateDiscretionaryItemInput,
  WaterfallTier,
  SubcategoryTotal,
  SpendType,
  IncomeFrequency,
} from "@finplan/shared";
import { computeLifecycleState, periodService } from "./period.service.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LINKABLE_ACCOUNT_TYPES = ["Savings", "StocksAndShares", "Pension"] as const;

async function validateLinkedAccount(
  householdId: string,
  subcategoryId: string,
  linkedAccountId: string,
  opts: { isPlannerOwned?: boolean } = {}
): Promise<void> {
  if (opts.isPlannerOwned) {
    throw new ValidationError("Planner-owned items cannot be linked to an account");
  }
  const subcategory = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, householdId, tier: "discretionary" },
  });
  if (!subcategory || subcategory.name !== "Savings") {
    throw new ValidationError("Only items in the Savings subcategory can be linked to an account");
  }
  const account = await prisma.account.findFirst({
    where: { id: linkedAccountId, householdId },
  });
  if (!account) throw new NotFoundError("Account not found");
  if (!LINKABLE_ACCOUNT_TYPES.includes(account.type as any)) {
    throw new ValidationError(
      "Linked account must be of type Savings, StocksAndShares, or Pension"
    );
  }
}

async function getSavingsSubcategoryId(householdId: string): Promise<string | null> {
  const sub = await prisma.subcategory.findFirst({
    where: { householdId, tier: "discretionary", name: "Savings" },
  });
  return sub?.id ?? null;
}

function assertOwned(item: { householdId: string } | null, householdId: string, label: string) {
  if (!item) throw new NotFoundError(`${label} not found`);
  if (item.householdId !== householdId) throw new NotFoundError(`${label} not found`);
}

async function validateSubcategoryOwnership(
  householdId: string,
  subcategoryId: string,
  tier: WaterfallTier
) {
  const sub = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, householdId, tier },
  });
  if (!sub) throw new NotFoundError("Subcategory not found");
}

async function validateSubcategoryNotPlannerLocked(householdId: string, subcategoryId: string) {
  const sub = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, householdId, tier: "discretionary" },
  });
  if (!sub) throw new NotFoundError("Subcategory not found");
  if ((sub as any).lockedByPlanner) {
    throw new ValidationError("This subcategory is managed by the Gifts planner");
  }
}

function assertNotPlannerOwned(item: { isPlannerOwned?: boolean } | null) {
  if (item && (item as any).isPlannerOwned) {
    throw new ValidationError("This item is managed by the Gifts planner");
  }
}

async function validateMemberOwnership(householdId: string, memberId: string) {
  const member = await prisma.member.findFirst({
    where: { householdId, id: memberId },
  });
  if (!member) throw new NotFoundError("Household member not found");
}

// ─── Period enrichment helper ────────────────────────────────────────────────

async function enrichItemsWithPeriods<T extends { id: string }>(
  householdId: string,
  items: T[],
  itemType: string
): Promise<Array<T & { amount: number; lifecycleState: string; periods: any[] }>> {
  if (items.length === 0) return [];

  const now = new Date();
  const allPeriods = await prisma.itemAmountPeriod.findMany({
    where: {
      householdId,
      itemType: itemType as any,
      itemId: { in: items.map((i) => i.id) },
    },
    orderBy: { startDate: "asc" },
  });

  const periodsByItem = new Map<string, typeof allPeriods>();
  for (const period of allPeriods) {
    const existing = periodsByItem.get(period.itemId) ?? [];
    existing.push(period);
    periodsByItem.set(period.itemId, existing);
  }

  return items.map((item) => {
    const periods = periodsByItem.get(item.id) ?? [];
    let amount = 0;
    for (let i = periods.length - 1; i >= 0; i--) {
      const p = periods[i]!;
      if (p.startDate <= now && (p.endDate === null || p.endDate > now)) {
        amount = p.amount;
        break;
      }
    }
    const lifecycleState = computeLifecycleState(periods, now);
    return { ...item, amount, lifecycleState, periods };
  });
}

// ─── Subcategory totals helper ────────────────────────────────────────────────

function buildSubcategoryTotals(
  subcategories: Array<{ id: string; name: string; sortOrder: number }>,
  items: Array<{
    subcategoryId: string | null;
    amount: number;
    spendType?: SpendType;
    frequency?: IncomeFrequency;
    lastReviewedAt: Date;
  }>,
  otherSubcategoryId: string | null
): SubcategoryTotal[] {
  const map = new Map<string, { total: number; oldest: Date | null; count: number }>();

  for (const sub of subcategories) {
    map.set(sub.id, { total: 0, oldest: null, count: 0 });
  }

  for (const item of items) {
    const subId = item.subcategoryId ?? otherSubcategoryId;
    if (!subId || !map.has(subId)) continue;
    const entry = map.get(subId)!;

    const freq = item.spendType ?? item.frequency;
    const monthlyAmount = freq ? toMonthlyAmount(item.amount, freq) : item.amount;

    entry.total += monthlyAmount;
    entry.count += 1;

    const reviewDate = new Date(item.lastReviewedAt);
    if (!entry.oldest || reviewDate < entry.oldest) {
      entry.oldest = reviewDate;
    }
  }

  return subcategories.map((sub) => {
    const entry = map.get(sub.id)!;
    return {
      id: sub.id,
      name: sub.name,
      sortOrder: sub.sortOrder,
      monthlyTotal: toGBP(entry.total),
      oldestReviewedAt: entry.oldest,
      itemCount: entry.count,
    };
  });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export const waterfallService = {
  async getWaterfallSummary(householdId: string): Promise<WaterfallSummary> {
    const now = new Date();

    const [incomeSources, committedItems, discretionaryItems, allSubcategories] = await Promise.all(
      [
        prisma.incomeSource.findMany({
          where: { householdId },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.committedItem.findMany({ where: { householdId }, orderBy: { sortOrder: "asc" } }),
        prisma.discretionaryItem.findMany({
          where: { householdId },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.subcategory.findMany({
          where: { householdId },
          orderBy: { sortOrder: "asc" },
        }),
      ]
    );

    const allItemIds = [
      ...incomeSources.map((s) => ({ type: "income_source" as const, id: s.id })),
      ...committedItems.map((s) => ({ type: "committed_item" as const, id: s.id })),
      ...discretionaryItems.map((s) => ({ type: "discretionary_item" as const, id: s.id })),
    ];

    const allPeriods =
      allItemIds.length > 0
        ? await prisma.itemAmountPeriod.findMany({
            where: {
              householdId,
              OR: allItemIds.map((item) => ({ itemType: item.type, itemId: item.id })),
            },
            orderBy: { startDate: "asc" },
          })
        : [];

    const periodsByItem = new Map<string, typeof allPeriods>();
    for (const period of allPeriods) {
      const key = `${period.itemType}:${period.itemId}`;
      const existing = periodsByItem.get(key) ?? [];
      existing.push(period);
      periodsByItem.set(key, existing);
    }

    function getCurrentAmountFromPeriods(periods: typeof allPeriods, now: Date): number {
      for (let i = periods.length - 1; i >= 0; i--) {
        const p = periods[i]!;
        if (p.startDate <= now && (p.endDate === null || p.endDate > now)) {
          return p.amount;
        }
      }
      return 0;
    }

    // Enrich items with period-derived amounts and filter by lifecycle
    const enrichedIncome = incomeSources.map((s) => {
      const periods = periodsByItem.get(`income_source:${s.id}`) ?? [];
      const amount = getCurrentAmountFromPeriods(periods, now);
      const lifecycleState = computeLifecycleState(periods, now);
      return { ...s, amount, lifecycleState };
    });
    const activeIncome = enrichedIncome.filter((s) => s.lifecycleState === "active");

    const enrichedCommitted = committedItems.map((s) => {
      const periods = periodsByItem.get(`committed_item:${s.id}`) ?? [];
      const amount = getCurrentAmountFromPeriods(periods, now);
      const lifecycleState = computeLifecycleState(periods, now);
      return { ...s, amount, lifecycleState };
    });
    const activeCommitted = enrichedCommitted.filter((s) => s.lifecycleState === "active");

    const enrichedDiscretionary = discretionaryItems.map((s) => {
      const periods = periodsByItem.get(`discretionary_item:${s.id}`) ?? [];
      const amount = getCurrentAmountFromPeriods(periods, now);
      const lifecycleState = computeLifecycleState(periods, now);
      return { ...s, amount, lifecycleState };
    });
    const activeDiscretionary = enrichedDiscretionary.filter((s) => s.lifecycleState === "active");

    const monthlyLikeIncome = activeIncome.filter(
      (s) => s.frequency === "monthly" || s.frequency === "weekly"
    );
    const nonMonthlyIncome = activeIncome.filter(
      (s) => s.frequency === "annual" || s.frequency === "quarterly"
    );
    const oneOffIncome = activeIncome.filter((s) => s.frequency === "one_off");

    const incomeTotal = toGBP(
      [...monthlyLikeIncome, ...nonMonthlyIncome].reduce(
        (s, i) => s + toMonthlyAmount(i.amount, i.frequency),
        0
      )
    );

    // Group active non-oneOff sources by incomeType for left panel navigation
    const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
      salary: "Salary",
      dividends: "Dividends",
      freelance: "Freelance",
      rental: "Rental",
      benefits: "Benefits",
      other: "Other",
    };

    const activeNonOneOff: IncomeSourceRow[] = [...monthlyLikeIncome, ...nonMonthlyIncome];
    const typeMap = new Map<IncomeType, IncomeSourceRow[]>();
    for (const src of activeNonOneOff) {
      const group = typeMap.get(src.incomeType) ?? [];
      group.push(src);
      typeMap.set(src.incomeType, group);
    }

    const byType: IncomeByType[] = Array.from(typeMap.entries()).map(([type, sources]) => ({
      type,
      label: INCOME_TYPE_LABELS[type],
      monthlyTotal: sources.reduce(
        (sum, src) => sum + toMonthlyAmount(src.amount, src.frequency),
        0
      ),
      sources,
    }));

    // one_off committed items are excluded from the recurring total — they appear in cashflow only
    // Committed: monthly-like items at monthly equivalent, non-monthly items averaged
    const monthlyLikeCommitted = activeCommitted.filter(
      (i) => i.spendType === "monthly" || i.spendType === "weekly"
    );
    const nonMonthlyCommitted = activeCommitted.filter(
      (i) => i.spendType === "yearly" || i.spendType === "quarterly"
    );
    const committedMonthlyTotal = monthlyLikeCommitted.reduce(
      (s, b) => s + toMonthlyAmount(b.amount, b.spendType),
      0
    );
    const nonMonthlyMonthlyAvg = toGBP(
      nonMonthlyCommitted.reduce((s, b) => s + toMonthlyAmount(b.amount, b.spendType), 0)
    );

    // Detect savings subcategory to split discretionary items
    const savingsSubcategory =
      allSubcategories.find((s) => s.tier === "discretionary" && s.name === "Savings") ?? null;

    const savingsItems = savingsSubcategory
      ? activeDiscretionary.filter((i) => i.subcategoryId === savingsSubcategory.id)
      : [];
    const categoryItems = savingsSubcategory
      ? activeDiscretionary.filter((i) => i.subcategoryId !== savingsSubcategory.id)
      : activeDiscretionary;

    // Discretionary: all items summed for waterfall total
    const discretionaryTotal = activeDiscretionary.reduce(
      (s, c) => s + toMonthlyAmount(c.amount, c.spendType),
      0
    );
    const savingsTotal = savingsItems.reduce(
      (s, a) => s + toMonthlyAmount(a.amount, a.spendType),
      0
    );

    const surplusAmount = toGBP(
      incomeTotal - committedMonthlyTotal - nonMonthlyMonthlyAvg - discretionaryTotal
    );
    const percentOfIncome = toGBP(incomeTotal > 0 ? (surplusAmount / incomeTotal) * 100 : 0);

    // Build subcategory totals per tier
    const incomeSubs = allSubcategories.filter((s) => s.tier === "income");
    const committedSubs = allSubcategories.filter((s) => s.tier === "committed");
    const discretionarySubs = allSubcategories.filter((s) => s.tier === "discretionary");

    const incomeOtherId = incomeSubs.find((s) => s.name === "Other")?.id ?? null;
    const committedOtherId = committedSubs.find((s) => s.name === "Other")?.id ?? null;
    const discretionaryOtherId = discretionarySubs.find((s) => s.name === "Other")?.id ?? null;

    // Exclude one-off income (consistent with incomeTotal calculation)
    const incomeForSubcategories = enrichedIncome.filter((s) => s.frequency !== "one_off");

    const incomeBySubcategory = buildSubcategoryTotals(
      incomeSubs,
      incomeForSubcategories,
      incomeOtherId
    );
    const committedBySubcategory = buildSubcategoryTotals(
      committedSubs,
      enrichedCommitted,
      committedOtherId
    );
    const discretionaryBySubcategory = buildSubcategoryTotals(
      discretionarySubs,
      enrichedDiscretionary,
      discretionaryOtherId
    );

    return {
      income: {
        total: incomeTotal,
        byType,
        bySubcategory: incomeBySubcategory,
        monthly: monthlyLikeIncome,
        nonMonthly: nonMonthlyIncome,
        oneOff: oneOffIncome,
      },
      committed: {
        monthlyTotal: committedMonthlyTotal,
        monthlyAvg12: nonMonthlyMonthlyAvg,
        bySubcategory: committedBySubcategory,
        bills: monthlyLikeCommitted,
        nonMonthlyBills: nonMonthlyCommitted,
      },
      discretionary: {
        total: discretionaryTotal,
        bySubcategory: discretionaryBySubcategory,
        categories: categoryItems.map((c) => ({
          ...c,
          monthlyBudget: toMonthlyAmount(c.amount, c.spendType ?? "monthly"),
        })),
        savings: {
          total: savingsTotal,
          allocations: savingsItems.map((a) => ({
            ...a,
            monthlyAmount: toMonthlyAmount(a.amount, a.spendType ?? "monthly"),
          })),
        },
      },
      surplus: {
        amount: surplusAmount,
        percentOfIncome,
      },
    };
  },

  // ─── Income sources ──────────────────────────────────────────────────────────

  async listIncome(householdId: string) {
    const items = await prisma.incomeSource.findMany({
      where: { householdId },
      orderBy: { sortOrder: "asc" },
    });
    return enrichItemsWithPeriods(householdId, items, "income_source");
  },

  async createIncome(householdId: string, data: CreateIncomeSourceInput, ctx: ActorCtx) {
    const subcategoryId =
      data.subcategoryId ??
      (await subcategoryService.getDefaultSubcategoryId(householdId, "income"));
    if (data.subcategoryId) {
      await validateSubcategoryOwnership(householdId, data.subcategoryId, "income");
    }
    if (data.memberId) {
      await validateMemberOwnership(householdId, data.memberId);
    }
    const { amount: _amount, startDate: _startDate, endDate: _endDate, ...itemData } = data as any;
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
        return s;
      },
    });
  },

  async updateIncome(
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
  },

  async deleteIncome(householdId: string, id: string, ctx: ActorCtx) {
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
  },

  async confirmIncome(householdId: string, id: string) {
    const existing = await prisma.incomeSource.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Income source");
    return prisma.incomeSource.update({ where: { id }, data: { lastReviewedAt: new Date() } });
  },

  // ─── Committed items ──────────────────────────────────────────────────────────

  async listCommitted(householdId: string) {
    const items = await prisma.committedItem.findMany({
      where: { householdId },
      orderBy: { sortOrder: "asc" },
    });
    return enrichItemsWithPeriods(householdId, items, "committed_item");
  },

  async createCommitted(householdId: string, data: CreateCommittedItemInput, ctx: ActorCtx) {
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
        return item;
      },
    });
  },

  async updateCommitted(
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
  },

  async deleteCommitted(householdId: string, id: string, ctx: ActorCtx) {
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
  },

  async confirmCommitted(householdId: string, id: string) {
    const existing = await prisma.committedItem.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Committed item");
    return prisma.committedItem.update({ where: { id }, data: { lastReviewedAt: new Date() } });
  },

  // ─── Yearly items (CommittedItem with spendType=yearly) ─────────────────────

  async listYearly(householdId: string) {
    const items = await prisma.committedItem.findMany({
      where: { householdId, spendType: "yearly" },
      orderBy: { sortOrder: "asc" },
    });
    return enrichItemsWithPeriods(householdId, items, "committed_item");
  },

  async createYearly(householdId: string, data: CreateCommittedItemInput, ctx: ActorCtx) {
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
        return item;
      },
    });
  },

  async updateYearly(
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
  },

  async deleteYearly(householdId: string, id: string, ctx: ActorCtx) {
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
  },

  async confirmYearly(householdId: string, id: string) {
    const existing = await prisma.committedItem.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Committed item");
    return prisma.committedItem.update({ where: { id }, data: { lastReviewedAt: new Date() } });
  },

  // ─── Discretionary items ─────────────────────────────────────────────────────

  async listDiscretionary(householdId: string) {
    const items = await prisma.discretionaryItem.findMany({
      where: { householdId },
      orderBy: { sortOrder: "asc" },
      include: { linkedAccount: { select: { id: true, name: true, type: true } } },
    });
    return enrichItemsWithPeriods(householdId, items, "discretionary_item");
  },

  async listDiscretionaryStale(householdId: string) {
    const items = await prisma.discretionaryItem.findMany({
      where: { householdId, isPlannerOwned: false },
      orderBy: { sortOrder: "asc" },
      include: { linkedAccount: { select: { id: true, name: true, type: true } } },
    });
    return enrichItemsWithPeriods(householdId, items, "discretionary_item");
  },

  async createDiscretionary(
    householdId: string,
    data: CreateDiscretionaryItemInput,
    ctx: ActorCtx
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
        return item;
      },
    });
  },

  async updateDiscretionary(
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
          before.amount = await periodService.getCurrentAmount(
            householdId,
            "discretionary_item",
            id
          );
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
  },

  async deleteDiscretionary(householdId: string, id: string, ctx: ActorCtx) {
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
        tx.discretionaryItem.findUnique({ where: { id } }) as Promise<Record<
          string,
          unknown
        > | null>,
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
  },

  async confirmDiscretionary(householdId: string, id: string) {
    const existing = await prisma.discretionaryItem.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Discretionary item");
    return prisma.discretionaryItem.update({
      where: { id },
      data: { lastReviewedAt: new Date() },
    });
  },

  // ─── Savings (DiscretionaryItem in Savings subcategory) ─────────────────────

  async listSavings(householdId: string) {
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
  },

  async createSavings(householdId: string, data: CreateDiscretionaryItemInput, ctx: ActorCtx) {
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
        return item;
      },
    });
  },

  async updateSavings(
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
          before.amount = await periodService.getCurrentAmount(
            householdId,
            "discretionary_item",
            id
          );
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
  },

  async deleteSavings(householdId: string, id: string, ctx: ActorCtx) {
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
        tx.discretionaryItem.findUnique({ where: { id } }) as Promise<Record<
          string,
          unknown
        > | null>,
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
  },

  async confirmSavings(householdId: string, id: string) {
    const existing = await prisma.discretionaryItem.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Savings allocation");
    return prisma.discretionaryItem.update({
      where: { id },
      data: { lastReviewedAt: new Date() },
    });
  },

  // ─── History ──────────────────────────────────────────────────────────────────

  async getHistory(householdId: string, type: string, id: string) {
    // Verify ownership
    switch (type) {
      case "income_source": {
        const item = await prisma.incomeSource.findUnique({ where: { id } });
        assertOwned(item, householdId, "Income source");
        break;
      }
      case "committed_item": {
        const item = await prisma.committedItem.findUnique({ where: { id } });
        assertOwned(item, householdId, "Committed item");
        break;
      }
      case "discretionary_item": {
        const item = await prisma.discretionaryItem.findUnique({ where: { id } });
        assertOwned(item, householdId, "Discretionary item");
        break;
      }
      default:
        throw new NotFoundError("Unknown item type");
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 24);

    return prisma.waterfallHistory.findMany({
      where: { householdId, itemType: type as any, itemId: id, recordedAt: { gte: cutoff } },
      orderBy: { recordedAt: "asc" },
    });
  },

  // ─── Batch confirm ────────────────────────────────────────────────────────────

  async confirmBatch(householdId: string, data: ConfirmBatchInput) {
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
    });
  },

  // ─── Delete all ───────────────────────────────────────────────────────────────

  async deleteAll(householdId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.itemAmountPeriod.deleteMany({ where: { householdId } });
      await tx.incomeSource.deleteMany({ where: { householdId } });
      await tx.committedItem.deleteMany({ where: { householdId } });
      await tx.discretionaryItem.deleteMany({ where: { householdId } });
      await tx.subcategory.deleteMany({ where: { householdId } });
    });
  },
};
