import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cashflowService } from "@/services/cashflow.service";
import { queryKeys } from "./queryKeys";
import type {
  CashflowShortfall,
  CashflowShortfallQuery,
  ShortfallItem,
  ShortfallTierKey,
} from "@finplan/shared";

const SHORTFALL_KEY = queryKeys.cashflow.shortfallQuery;

export function useShortfall(query: CashflowShortfallQuery = { windowDays: 30 }) {
  return useQuery({
    queryKey: SHORTFALL_KEY(query),
    queryFn: () => cashflowService.getShortfall(query),
  });
}

interface UseTierShortfallOptions {
  isSnapshot?: boolean;
  windowDays?: number;
}

export interface TierShortfallResult {
  items: ShortfallItem[];
  count: number;
  daysToFirst: number | null;
  balanceToday: number;
  lowest: CashflowShortfall["lowest"] | null;
  isLive: boolean;
}

export function useTierShortfall(
  tierKey: ShortfallTierKey,
  options: UseTierShortfallOptions = {}
): TierShortfallResult {
  const isSnapshot = options.isSnapshot ?? false;
  const windowDays = options.windowDays ?? 30;
  const enabled = !isSnapshot;

  const query = useQuery({
    queryKey: SHORTFALL_KEY({ windowDays }),
    queryFn: () => cashflowService.getShortfall({ windowDays }),
    enabled,
  });

  return useMemo<TierShortfallResult>(() => {
    if (!enabled || !query.data || query.data.linkedAccountCount === 0) {
      return {
        items: [],
        count: 0,
        daysToFirst: null,
        balanceToday: query.data?.balanceToday ?? 0,
        lowest: query.data?.lowest ?? null,
        isLive: false,
      };
    }
    const items = query.data.items.filter((i) => i.tierKey === tierKey);
    let daysToFirst: number | null = null;
    if (items.length > 0) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const due = new Date(items[0]!.dueDate + "T00:00:00.000Z");
      daysToFirst = Math.max(
        0,
        Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      );
    }
    return {
      items,
      count: items.length,
      daysToFirst,
      balanceToday: query.data.balanceToday,
      lowest: query.data.lowest,
      isLive: items.length > 0,
    };
  }, [enabled, query.data, tierKey]);
}
