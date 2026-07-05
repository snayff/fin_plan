/**
 * Cross-domain cache-invalidation helpers.
 *
 * These bundle the exact sets of query keys that a mutation must refresh so the
 * same multi-key block isn't duplicated across mutations. The key sets here are
 * byte-identical to the inline invalidations they replace — behaviour is
 * unchanged (see PERF-3 tuning in the waterfall hooks).
 */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

/**
 * Invalidate every cache that depends on a monetary change to a waterfall item
 * (create / edit / delete / period change / delete-all): the waterfall summary
 * and financial summary, the forecast, and the full cashflow set
 * (projection + month + shortfall).
 *
 * Note: this is for value-changing mutations only. Confirm mutations bump
 * `lastReviewedAt` without changing any number and must NOT call this — they
 * invalidate only review-state surfaces (see the confirm hooks).
 */
export function invalidateWaterfallDependents(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.waterfall.summary });
  void queryClient.invalidateQueries({ queryKey: queryKeys.waterfall.financialSummary });
  void queryClient.invalidateQueries({ queryKey: queryKeys.forecast.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.projectionAll });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.monthAll });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
}

/**
 * Invalidate every cache that depends on a change to an asset or account: the
 * whole assets tree, the forecast, and the full cashflow set (shortfall +
 * projection + month). Key set and order are byte-identical to the inline
 * invalidations the asset mutations previously used.
 */
export function invalidateAssetDependents(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.forecast.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.projectionAll });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.monthAll });
}
