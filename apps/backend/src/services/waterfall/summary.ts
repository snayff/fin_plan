import { prisma } from "../../config/database.js";
import { toGBP, toMonthlyAmount } from "@finplan/shared";
import type { WaterfallSummary, IncomeType, IncomeByType, IncomeSourceRow } from "@finplan/shared";
import { computeLifecycleState } from "../period.service.js";
import { buildSubcategoryTotals, sumRoundedMonthly } from "./shared.js";

// ─── Summary ─────────────────────────────────────────────────────────────────

export async function getWaterfallSummary(householdId: string): Promise<WaterfallSummary> {
  const now = new Date();

  const [incomeSources, committedItems, discretionaryItems, allSubcategories] = await Promise.all([
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
  ]);

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

  const incomeTotal = sumRoundedMonthly(
    [...monthlyLikeIncome, ...nonMonthlyIncome],
    (i) => i.frequency
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
    monthlyTotal: sumRoundedMonthly(sources, (src) => src.frequency),
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
  const committedMonthlyTotal = sumRoundedMonthly(monthlyLikeCommitted, (b) => b.spendType);
  const nonMonthlyMonthlyAvg = sumRoundedMonthly(nonMonthlyCommitted, (b) => b.spendType);

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
  const discretionaryTotal = sumRoundedMonthly(activeDiscretionary, (c) => c.spendType);
  const savingsTotal = sumRoundedMonthly(savingsItems, (a) => a.spendType);

  // Derive surplus from the ALREADY-ROUNDED tier totals so the displayed parts
  // always add up to the displayed total — no penny drift between stages (#120).
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
        monthlyBudget: toGBP(toMonthlyAmount(c.amount, c.spendType ?? "monthly")),
      })),
      savings: {
        total: savingsTotal,
        allocations: savingsItems.map((a) => ({
          ...a,
          monthlyAmount: toGBP(toMonthlyAmount(a.amount, a.spendType ?? "monthly")),
        })),
      },
    },
    surplus: {
      amount: surplusAmount,
      percentOfIncome,
    },
  };
}
