import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showError } from "@/lib/toast";
import { waterfallService } from "@/services/waterfall.service";
import { queryKeys } from "./queryKeys";
import type {
  BatchSaveSubcategoriesInput,
  ResetSubcategoriesInput,
  WaterfallTier,
} from "@finplan/shared";

/**
 * Re-exported for existing consumers. Sourced from the central `queryKeys`
 * module; values are unchanged.
 */
export const SUBCATEGORY_SETTINGS_KEYS = {
  counts: queryKeys.subcategorySettings.counts,
};

export function useSubcategoryCounts(tier: WaterfallTier) {
  return useQuery({
    queryKey: SUBCATEGORY_SETTINGS_KEYS.counts(tier),
    queryFn: () => waterfallService.getSubcategoryCounts(tier),
  });
}

export function useSaveSubcategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tier, data }: { tier: WaterfallTier; data: BatchSaveSubcategoriesInput }) =>
      waterfallService.saveSubcategories(tier, data),
    onSuccess: (_data, { tier }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.waterfall.subcategories(tier) });
      void qc.invalidateQueries({ queryKey: SUBCATEGORY_SETTINGS_KEYS.counts(tier) });
      void qc.invalidateQueries({ queryKey: queryKeys.waterfall.summary });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to save subcategories");
    },
  });
}

export function useResetSubcategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ResetSubcategoriesInput) => waterfallService.resetSubcategories(data),
    onSuccess: () => {
      for (const tier of ["income", "committed", "discretionary"]) {
        void qc.invalidateQueries({ queryKey: queryKeys.waterfall.subcategories(tier) });
        void qc.invalidateQueries({ queryKey: SUBCATEGORY_SETTINGS_KEYS.counts(tier) });
      }
      void qc.invalidateQueries({ queryKey: queryKeys.waterfall.summary });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to reset subcategories");
    },
  });
}
