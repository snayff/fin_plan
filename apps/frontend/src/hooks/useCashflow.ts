import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cashflowService } from "@/services/cashflow.service";
import type { BulkUpdateLinkedAccountsInput, CashflowProjectionQuery } from "@finplan/shared";
import { showError } from "@/lib/toast";
import { queryKeys } from "./queryKeys";

/**
 * Re-exported for existing consumers. Sourced from the central `queryKeys`
 * module; values are unchanged.
 */
export const CASHFLOW_KEYS = {
  projection: queryKeys.cashflow.projection,
  month: queryKeys.cashflow.month,
  linkable: queryKeys.cashflow.linkable,
};

export function useCashflowProjection(query: CashflowProjectionQuery = { monthCount: 12 }) {
  return useQuery({
    queryKey: CASHFLOW_KEYS.projection(query),
    queryFn: () => cashflowService.getProjection(query),
  });
}

export function useCashflowMonth(year: number, month: number, enabled = true) {
  return useQuery({
    queryKey: CASHFLOW_KEYS.month(year, month),
    queryFn: () => cashflowService.getMonthDetail(year, month),
    enabled,
  });
}

export function useLinkableAccounts() {
  return useQuery({
    queryKey: CASHFLOW_KEYS.linkable,
    queryFn: () => cashflowService.listLinkableAccounts(),
  });
}

type LinkableAccount = { id: string; isCashflowLinked: boolean; [key: string]: unknown };

export function useUpdateLinkedAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      isCashflowLinked,
    }: {
      accountId: string;
      isCashflowLinked: boolean;
    }) => cashflowService.updateLinkedAccount(accountId, isCashflowLinked),
    onMutate: async ({ accountId, isCashflowLinked }) => {
      await qc.cancelQueries({ queryKey: CASHFLOW_KEYS.linkable });
      const snapshot = qc.getQueryData<LinkableAccount[]>(CASHFLOW_KEYS.linkable);
      if (snapshot) {
        qc.setQueryData<LinkableAccount[]>(CASHFLOW_KEYS.linkable, (prev) =>
          (prev ?? []).map((a) => (a.id === accountId ? { ...a, isCashflowLinked } : a))
        );
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(CASHFLOW_KEYS.linkable, ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to update linked account");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.linkable });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.projectionAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.monthAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
    },
  });
}

export function useBulkUpdateLinkedAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkUpdateLinkedAccountsInput) =>
      cashflowService.bulkUpdateLinkedAccounts(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: CASHFLOW_KEYS.linkable });
      const snapshot = qc.getQueryData<LinkableAccount[]>(CASHFLOW_KEYS.linkable);
      if (snapshot) {
        const updates = new Map(input.updates.map((u) => [u.accountId, u.isCashflowLinked]));
        qc.setQueryData<LinkableAccount[]>(CASHFLOW_KEYS.linkable, (prev) =>
          (prev ?? []).map((a) =>
            updates.has(a.id) ? { ...a, isCashflowLinked: updates.get(a.id)! } : a
          )
        );
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(CASHFLOW_KEYS.linkable, ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to update linked accounts");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.linkable });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.projectionAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.monthAll });
      void qc.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
    },
  });
}
