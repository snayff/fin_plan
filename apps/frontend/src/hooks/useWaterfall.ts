import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { waterfallService } from "@/services/waterfall.service";
import { showError } from "@/lib/toast";
import { queryKeys } from "./queryKeys";
import { invalidateWaterfallDependents } from "./invalidation";
import type {
  CreatePeriodInput,
  UpdatePeriodInput,
  SpendType,
  IncomeFrequency,
  CreateIncomeSourceInput,
  UpdateIncomeSourceInput,
  CreateCommittedItemInput,
  UpdateCommittedItemInput,
  CreateDiscretionaryItemInput,
  UpdateDiscretionaryItemInput,
  IncomeSourceResponse,
  CommittedItemResponse,
  DiscretionaryItemResponse,
} from "@finplan/shared";

/**
 * Union of tier item response shapes. The waterfall mutation hooks below switch
 * across tiers, so React Query cannot infer a single `TData`. None of them
 * consume the mutation result (they only invalidate queries), so `TData` is
 * pinned to this union. Yearly maps to the committed shape and savings to the
 * discretionary shape server-side, so no extra members are needed.
 */
type WaterfallItemResponse =
  | IncomeSourceResponse
  | CommittedItemResponse
  | DiscretionaryItemResponse;

/**
 * Re-exported for existing consumers. Keys are sourced from the central
 * `queryKeys` module — values are unchanged.
 */
export const WATERFALL_KEYS = {
  summary: queryKeys.waterfall.summary,
  financialSummary: queryKeys.waterfall.financialSummary,
  history: queryKeys.waterfall.history,
  subcategories: queryKeys.waterfall.subcategories,
};

export function useWaterfallSummary() {
  return useQuery({
    queryKey: WATERFALL_KEYS.summary,
    queryFn: waterfallService.getSummary,
  });
}

export function useFinancialSummary() {
  return useQuery({
    queryKey: WATERFALL_KEYS.financialSummary,
    queryFn: waterfallService.getFinancialSummary,
  });
}

export function useItemHistory(type: string, id: string) {
  return useQuery({
    queryKey: WATERFALL_KEYS.history(type, id),
    queryFn: () => waterfallService.getHistory(type, id),
    enabled: !!id,
  });
}

type WaterfallItemType =
  | "income_source"
  | "committed_bill"
  | "yearly_bill"
  | "discretionary_category"
  | "savings_allocation";

function typeToUrlSegment(type: string): string {
  const map: Record<string, string> = {
    income_source: "income",
    committed_bill: "committed",
    yearly_bill: "yearly",
    discretionary_category: "discretionary",
    savings_allocation: "savings",
  };
  return map[type] ?? type;
}

export function useConfirmItem() {
  const queryClient = useQueryClient();

  return useMutation<WaterfallItemResponse, Error, { type: WaterfallItemType; id: string }>({
    mutationFn: ({ type, id }) => {
      const segment = typeToUrlSegment(type);
      switch (segment) {
        case "income":
          return waterfallService.confirmIncome(id);
        case "committed":
          return waterfallService.confirmCommitted(id);
        case "yearly":
          return waterfallService.confirmYearly(id);
        case "discretionary":
          return waterfallService.confirmDiscretionary(id);
        case "savings":
          return waterfallService.confirmSavings(id);
        default:
          return Promise.reject(new Error(`Unknown type: ${type}`));
      }
    },
    onSuccess: () => {
      // Confirming only bumps lastReviewedAt — no monetary value changes — so we
      // refresh the review-state surfaces only. Invalidating financial-summary,
      // forecast, or cashflow here would trigger needless refetches of unchanged
      // data (see PERF-3).
      void queryClient.invalidateQueries({ queryKey: WATERFALL_KEYS.summary });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to confirm item");
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();

  return useMutation<
    WaterfallItemResponse,
    Error,
    { type: WaterfallItemType; id: string; data: { name?: string } }
  >({
    mutationFn: ({ type, id, data }) => {
      const segment = typeToUrlSegment(type);
      switch (segment) {
        case "income":
          return waterfallService.updateIncome(id, data);
        case "committed":
          return waterfallService.updateCommitted(id, data);
        case "yearly":
          return waterfallService.updateYearly(id, data);
        case "discretionary":
          return waterfallService.updateDiscretionary(id, data);
        case "savings":
          return waterfallService.updateSavings(id, data);
        default:
          return Promise.reject(new Error(`Unknown type: ${type}`));
      }
    },
    onSuccess: () => {
      invalidateWaterfallDependents(queryClient);
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to update item");
    },
  });
}

/**
 * Re-exported for existing consumers. Values are sourced from the central
 * `queryKeys` module and are unchanged.
 */
export const TIER_ITEM_KEYS = {
  items: queryKeys.waterfall.tierItems,
};

export function useSubcategories(tier: "income" | "committed" | "discretionary") {
  return useQuery({
    queryKey: WATERFALL_KEYS.subcategories(tier),
    queryFn: () => waterfallService.getSubcategories(tier),
    staleTime: 10 * 60 * 1000,
  });
}

const spendTypeToFrequency: Record<string, IncomeFrequency> = {
  monthly: "monthly",
  yearly: "annual",
  weekly: "weekly",
  quarterly: "quarterly",
  one_off: "one_off",
};

export function useCreateItem(tier: "income" | "committed" | "discretionary") {
  const qc = useQueryClient();
  return useMutation<WaterfallItemResponse, Error, Record<string, unknown>>({
    mutationFn: (data) => {
      if (tier === "income") {
        const { spendType, ...rest } = data;
        return waterfallService.createIncome({
          ...rest,
          frequency: spendTypeToFrequency[spendType as string] ?? "monthly",
        } as CreateIncomeSourceInput);
      }
      if (tier === "committed")
        return waterfallService.createCommitted(data as CreateCommittedItemInput);
      return waterfallService.createDiscretionary(data as CreateDiscretionaryItemInput);
    },
    onSuccess: () => {
      invalidateWaterfallDependents(qc);
      void qc.invalidateQueries({ queryKey: TIER_ITEM_KEYS.items(tier) });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : ((error as Record<string, unknown>)?.message as string | undefined);
      showError(message ?? "Failed to save item");
    },
  });
}

export function useConfirmWaterfallItem(
  tier: "income" | "committed" | "discretionary",
  id: string
) {
  const qc = useQueryClient();
  return useMutation<WaterfallItemResponse, Error, void, { snapshot: TierItemRow[] | undefined }>({
    mutationFn: () => {
      if (tier === "income") return waterfallService.confirmIncome(id);
      if (tier === "committed") return waterfallService.confirmCommitted(id);
      return waterfallService.confirmDiscretionary(id);
    },
    onMutate: async () => {
      const itemsKey = TIER_ITEM_KEYS.items(tier);
      await qc.cancelQueries({ queryKey: itemsKey });
      const snapshot = qc.getQueryData<TierItemRow[]>(itemsKey);
      if (snapshot) {
        const now = new Date();
        qc.setQueryData<TierItemRow[]>(itemsKey, (prev) =>
          (prev ?? []).map((r) => (r.id === id ? { ...r, lastReviewedAt: now } : r))
        );
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(TIER_ITEM_KEYS.items(tier), ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to confirm item");
    },
    onSettled: () => {
      // Confirming only bumps lastReviewedAt — no monetary value changes — so we
      // refresh the review-state surfaces only (summary + the tier-items row).
      // financial-summary/forecast/cashflow are intentionally left untouched
      // (see PERF-3).
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.summary });
      void qc.invalidateQueries({ queryKey: TIER_ITEM_KEYS.items(tier) });
    },
  });
}

export function useDeleteItem(tier: "income" | "committed" | "discretionary", id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!id) return Promise.reject(new Error("No item ID provided for delete"));
      if (tier === "income") return waterfallService.deleteIncome(id);
      if (tier === "committed") return waterfallService.deleteCommitted(id);
      return waterfallService.deleteDiscretionary(id);
    },
    onSuccess: () => {
      invalidateWaterfallDependents(qc);
      void qc.invalidateQueries({ queryKey: TIER_ITEM_KEYS.items(tier) });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to delete item");
    },
  });
}

export function useTierUpdateItem(tier: "income" | "committed" | "discretionary", id: string) {
  const qc = useQueryClient();
  return useMutation<WaterfallItemResponse, Error, Record<string, unknown>>({
    mutationFn: (data) => {
      if (tier === "income") {
        // Income is modelled with `frequency`, but the shared item form emits
        // `spendType`. Translate it so the change is not silently dropped by the
        // income update schema (which has no `spendType` field).
        const { spendType, ...rest } = data;
        return waterfallService.updateIncome(id, {
          ...rest,
          ...(spendType !== undefined
            ? { frequency: spendTypeToFrequency[spendType as string] ?? "monthly" }
            : {}),
        } as UpdateIncomeSourceInput);
      }
      if (tier === "committed")
        return waterfallService.updateCommitted(id, data as UpdateCommittedItemInput);
      return waterfallService.updateDiscretionary(id, data as UpdateDiscretionaryItemInput);
    },
    onSuccess: () => {
      invalidateWaterfallDependents(qc);
      void qc.invalidateQueries({ queryKey: TIER_ITEM_KEYS.items(tier) });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to update item");
    },
  });
}

export interface TierItemRow {
  id: string;
  name: string;
  amount: number;
  spendType: SpendType;
  subcategoryId: string;
  notes: string | null;
  /** Required for income/committed; nullable for discretionary (only set on one_off). */
  dueDate: Date | null;
  lastReviewedAt: Date;
  createdAt: Date;
  sortOrder: number;
  /** References Member.id. null = no specific member ("Household"). */
  memberId: string | null;
  lifecycleState?: "active" | "future" | "expired";
  periods?: Array<{ id: string; startDate: Date; endDate: Date | null; amount: number }>;
  nextPeriod?: { amount: number; startDate: Date } | null;
  /** Populated for discretionary items in the Savings subcategory. */
  linkedAccountId?: string | null;
  linkedAccount?: { id: string; name: string; type: string } | null;
}

function normaliseIncomeFrequency(frequency: string): SpendType {
  if (frequency === "annual") return "yearly";
  if (frequency === "one_off") return "one_off";
  if (frequency === "weekly") return "weekly";
  if (frequency === "quarterly") return "quarterly";
  return "monthly";
}

/** Raw period row as returned by the waterfall service before date coercion. */
interface RawPeriod {
  id: string;
  startDate: string | Date;
  endDate?: string | Date | null;
  amount: number;
}

/**
 * Superset of the fields the tier mappers read from a waterfall item row.
 * Income rows carry `frequency`; committed/discretionary rows carry `spendType`.
 * Declared locally because the waterfall service response types are in flux.
 */
interface TierItemSource {
  id: string;
  name: string;
  amount: number;
  subcategoryId?: string | null;
  notes?: string | null;
  dueDate?: string | Date | null;
  lastReviewedAt: string | Date;
  createdAt: string | Date;
  sortOrder?: number | null;
  memberId?: string | null;
  lifecycleState?: TierItemRow["lifecycleState"] | null;
  periods?: RawPeriod[] | null;
  linkedAccountId?: string | null;
  linkedAccount?: TierItemRow["linkedAccount"] | null;
  frequency?: string;
  spendType?: string;
}

function mapTierItem(r: TierItemSource, spendType: string): TierItemRow {
  const periods = (r.periods ?? []).map((p) => ({
    id: p.id,
    startDate: new Date(p.startDate),
    endDate: p.endDate ? new Date(p.endDate) : null,
    amount: p.amount,
  }));

  // Find next future period for scheduled change indicator
  const now = new Date();
  const nextPeriod = periods.find((p: { startDate: Date }) => p.startDate > now) ?? null;

  return {
    id: r.id,
    name: r.name,
    amount: r.amount,
    spendType: spendType as SpendType,
    subcategoryId: r.subcategoryId ?? "",
    notes: r.notes ?? null,
    dueDate: r.dueDate ? new Date(r.dueDate) : null,
    lastReviewedAt: new Date(r.lastReviewedAt),
    createdAt: new Date(r.createdAt),
    sortOrder: r.sortOrder ?? 0,
    memberId: r.memberId ?? null,
    lifecycleState: r.lifecycleState ?? "active",
    periods,
    nextPeriod,
    linkedAccountId: r.linkedAccountId ?? null,
    linkedAccount: r.linkedAccount ?? null,
  };
}

async function fetchTierItems(
  tier: "income" | "committed" | "discretionary"
): Promise<TierItemRow[]> {
  if (tier === "income") {
    const rows = (await waterfallService.listIncome()) as TierItemSource[];
    return rows.map((r) => mapTierItem(r, normaliseIncomeFrequency(r.frequency ?? "monthly")));
  }
  if (tier === "committed") {
    const rows = (await waterfallService.listCommitted()) as TierItemSource[];
    return rows.map((r) => mapTierItem(r, r.spendType ?? "monthly"));
  }
  // discretionary
  const rows = (await waterfallService.listDiscretionary()) as TierItemSource[];
  return rows.map((r) => mapTierItem(r, r.spendType ?? "monthly"));
}

export function useTierItems(tier: "income" | "committed" | "discretionary") {
  return useQuery({
    queryKey: TIER_ITEM_KEYS.items(tier),
    queryFn: () => fetchTierItems(tier),
  });
}

export function useCreateSubcategory(tier: "income" | "committed" | "discretionary") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => waterfallService.createSubcategory(tier, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.subcategories(tier) });
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.summary });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : ((error as Record<string, unknown>)?.message as string | undefined);
      showError(message ?? "Failed to create subcategory");
    },
  });
}

export function useFullWaterfall() {
  const summary = useWaterfallSummary();
  const incomeSubs = useSubcategories("income");
  const committedSubs = useSubcategories("committed");
  const discretionarySubs = useSubcategories("discretionary");
  const incomeItems = useTierItems("income");
  const committedItems = useTierItems("committed");
  const discretionaryItems = useTierItems("discretionary");

  return {
    summary,
    subcategories: {
      income: incomeSubs.data ?? [],
      committed: committedSubs.data ?? [],
      discretionary: discretionarySubs.data ?? [],
    },
    items: {
      income: incomeItems.data ?? [],
      committed: committedItems.data ?? [],
      discretionary: discretionaryItems.data ?? [],
    },
    isLoading:
      summary.isLoading ||
      incomeSubs.isLoading ||
      committedSubs.isLoading ||
      discretionarySubs.isLoading ||
      incomeItems.isLoading ||
      committedItems.isLoading ||
      discretionaryItems.isLoading,
    isError:
      summary.isError ||
      incomeSubs.isError ||
      committedSubs.isError ||
      discretionarySubs.isError ||
      incomeItems.isError ||
      committedItems.isError ||
      discretionaryItems.isError,
  };
}

// ─── Period hooks ─────────────────────────────────────────────────────────────

/**
 * Re-exported for existing consumers. Sourced from the central `queryKeys`
 * module; values are unchanged.
 */
export const PERIOD_KEYS = {
  list: queryKeys.periods.list,
};

export function usePeriods(itemType: string, itemId: string) {
  return useQuery({
    queryKey: PERIOD_KEYS.list(itemType, itemId),
    queryFn: () => waterfallService.listPeriods(itemType, itemId),
    enabled: !!itemId,
  });
}

export function useCreatePeriod(itemType: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CreatePeriodInput, "itemType" | "itemId">) =>
      waterfallService.createPeriod({ ...data, itemType, itemId } as CreatePeriodInput),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PERIOD_KEYS.list(itemType, itemId) });
      void qc.invalidateQueries({ queryKey: queryKeys.waterfall.summary });
      void qc.invalidateQueries({ queryKey: queryKeys.forecast.all });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.projectionAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.monthAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to create period");
    },
  });
}

export function useUpdatePeriod(itemType: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePeriodInput }) =>
      waterfallService.updatePeriod(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PERIOD_KEYS.list(itemType, itemId) });
      void qc.invalidateQueries({ queryKey: queryKeys.waterfall.summary });
      void qc.invalidateQueries({ queryKey: queryKeys.forecast.all });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.projectionAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.monthAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to update period");
    },
  });
}

export function useDeletePeriod(itemType: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => waterfallService.deletePeriod(periodId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PERIOD_KEYS.list(itemType, itemId) });
      void qc.invalidateQueries({ queryKey: queryKeys.waterfall.summary });
      void qc.invalidateQueries({ queryKey: queryKeys.forecast.all });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.projectionAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.monthAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to delete period");
    },
  });
}

export function useDeleteAllWaterfall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => waterfallService.deleteAll(),
    onSuccess: () => {
      invalidateWaterfallDependents(qc);
    },
  });
}
