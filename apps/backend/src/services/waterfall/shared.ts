import { prisma } from "../../config/database.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { toGBP, toMonthlyAmount } from "@finplan/shared";
import type { WaterfallTier, SubcategoryTotal, SpendType, IncomeFrequency } from "@finplan/shared";
import { computeLifecycleState, periodService } from "../period.service.js";
import { assertMemberInHousehold } from "../ownership.js";
import type { PrismaClient, ItemAmountPeriod, WaterfallItemType } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LINKABLE_ACCOUNT_TYPES = ["Savings", "StocksAndShares", "Pension"] as const;

export async function validateLinkedAccount(
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
  if (!LINKABLE_ACCOUNT_TYPES.includes(account.type as (typeof LINKABLE_ACCOUNT_TYPES)[number])) {
    throw new ValidationError(
      "Linked account must be of type Savings, StocksAndShares, or Pension"
    );
  }
}

export async function getSavingsSubcategoryId(householdId: string): Promise<string | null> {
  const sub = await prisma.subcategory.findFirst({
    where: { householdId, tier: "discretionary", name: "Savings" },
  });
  return sub?.id ?? null;
}

export async function validateSubcategoryOwnership(
  householdId: string,
  subcategoryId: string,
  tier: WaterfallTier
) {
  const sub = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, householdId, tier },
  });
  if (!sub) throw new NotFoundError("Subcategory not found");
}

export async function validateSubcategoryNotPlannerLocked(
  householdId: string,
  subcategoryId: string
) {
  const sub = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, householdId, tier: "discretionary" },
  });
  if (!sub) throw new NotFoundError("Subcategory not found");
  if (sub.lockedByPlanner) {
    throw new ValidationError("This subcategory is managed by the Gifts planner");
  }
}

export function assertNotPlannerOwned(item: { isPlannerOwned?: boolean } | null) {
  if (item && item.isPlannerOwned) {
    throw new ValidationError("This item is managed by the Gifts planner");
  }
}

export async function validateMemberOwnership(householdId: string, memberId: string) {
  await assertMemberInHousehold(householdId, memberId, {
    query: "findFirst",
    error: "NotFoundError",
    message: "Household member not found",
  });
}

// ─── Period enrichment helper ────────────────────────────────────────────────

export async function enrichItemsWithPeriods<T extends { id: string }>(
  householdId: string,
  items: T[],
  itemType: WaterfallItemType
): Promise<Array<T & { amount: number; lifecycleState: string; periods: ItemAmountPeriod[] }>> {
  if (items.length === 0) return [];

  const now = new Date();
  const allPeriods = await prisma.itemAmountPeriod.findMany({
    where: {
      householdId,
      itemType,
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

export function buildSubcategoryTotals(
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
    const rawMonthly = freq ? toMonthlyAmount(item.amount, freq) : item.amount;
    // ONE rounding convention everywhere: round-then-sum (#120). Each line item
    // is displayed at its rounded monthly value, so summing the rounded values
    // guarantees the subcategory/tier totals equal the sum of the displayed parts.
    const monthlyAmount = toGBP(rawMonthly);

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

/**
 * Round-then-sum a set of items' monthly-equivalent amounts (#120).
 *
 * The waterfall rounds at the final-assembly stage only and uses ONE convention
 * everywhere: each item is rounded to GBP precision and the rounded values are
 * summed. Because every displayed line item shows its rounded monthly value,
 * summing those same rounded values keeps tier totals equal to the sum of the
 * visible parts (no penny drift between stages).
 */
export function sumRoundedMonthly<T extends { amount: number }>(
  items: T[],
  freqOf: (item: T) => SpendType | IncomeFrequency
): number {
  return toGBP(items.reduce((s, i) => s + toGBP(toMonthlyAmount(i.amount, freqOf(i))), 0));
}

// ─── Initial-period helper ───────────────────────────────────────────────────

/**
 * The opening amount period for a freshly-created item. Routes used to create
 * the item and then call periodService.createPeriod in a second request, which
 * could leave an item with no period if the second call failed (#130). Threading
 * this through the create mutation lets the item and its first period commit in
 * one transaction.
 */
export interface InitialPeriodInput {
  startDate: Date;
  endDate?: Date;
  amount: number;
}

/**
 * Create a brand-new item's opening period inside the item-create transaction.
 * A fresh item has no neighbours, so createPeriodTx degenerates to a plain
 * insert — but reusing it keeps the stitching/validation logic in one place.
 */
export async function createInitialPeriod(
  tx: PrismaClient,
  householdId: string,
  itemType: "income_source" | "committed_item" | "discretionary_item",
  itemId: string,
  initialPeriod: InitialPeriodInput
): Promise<void> {
  await periodService.createPeriodTx(tx, householdId, {
    itemType,
    itemId,
    startDate: initialPeriod.startDate,
    endDate: initialPeriod.endDate,
    amount: initialPeriod.amount,
  });
}
