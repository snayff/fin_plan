import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toMonthlyAmount, toGBP } from "@finplan/shared";
import SubcategoryList from "./SubcategoryList";
import ItemArea, { type LockedManager } from "./ItemArea";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { PanelError } from "@/components/common/PanelError";
import { AnimatedCurrency } from "@/components/common/AnimatedCurrency";
import { AttentionStrip } from "@/components/common/AttentionStrip";
import { ShortfallTooltip } from "@/components/common/ShortfallTooltip";
import { useSubcategories, useTierItems, type TierItemRow } from "@/hooks/useWaterfall";
import {
  useHouseholdMembers,
  useSettings,
  getStalenessMonths,
  type StalenessItemType,
} from "@/hooks/useSettings";
import { useGiftPlannerSettings } from "@/hooks/useGifts";
import { useTierShortfall } from "@/hooks/useShortfall";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import { TIER_CONFIGS, type TierKey } from "./tierConfig";
import { useFocusParam } from "@/features/search/useFocusParam";
import { useAddParam } from "@/features/search/useAddParam";

interface TierPageProps {
  tier: TierKey;
}

interface SubcategorySummary {
  subcategoryId: string;
  name: string;
  total: number;
  items: TierItemRow[];
}

export default function TierPage({ tier }: TierPageProps) {
  const config = TIER_CONFIGS[tier];
  const [searchParams] = useSearchParams();
  const {
    data: subcategories,
    isLoading: subsLoading,
    isError: subsError,
    refetch: refetchSubs,
  } = useSubcategories(tier);
  const {
    data: allItems,
    isLoading: itemsLoading,
    isError: itemsError,
    refetch: refetchItems,
  } = useTierItems(tier);
  const { data: members } = useHouseholdMembers();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const TIER_STALENESS: Record<TierKey, StalenessItemType> = {
    income: "income_source",
    committed: "committed_item",
    discretionary: "discretionary_item",
  };
  const stalenessMonths = getStalenessMonths(settings, TIER_STALENESS[tier]);

  const hasAddParam = searchParams.get("add") === "1";
  useAddParam((_kind) => {
    // add param consumed — ItemArea initialIsAdding prop handles opening
  });
  useFocusParam((id) => {
    const el = document.querySelector(`[data-search-focus="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("search-focus-pulse");
      setTimeout(() => el.classList.remove("search-focus-pulse"), 1200);
    }
  });

  // Group items by subcategoryId and compute monthly totals
  const subcategoryTotals = useMemo<Record<string, SubcategorySummary>>(() => {
    if (!subcategories || !allItems) return {};
    const nameMap = Object.fromEntries(subcategories.map((s) => [s.id, s.name]));
    const groups: Record<string, SubcategorySummary> = {};
    for (const item of allItems) {
      const sid = item.subcategoryId;
      if (!groups[sid]) {
        groups[sid] = {
          subcategoryId: sid,
          name: nameMap[sid] ?? "",
          total: 0,
          items: [],
        };
      }
      const monthly = toMonthlyAmount(item.amount, item.spendType);
      groups[sid].total += monthly;
      groups[sid].items.push(item);
    }
    return groups;
  }, [subcategories, allItems]);

  const tierTotal = Object.values(subcategoryTotals).reduce((sum, s) => sum + s.total, 0);

  // URL is the single source of truth for selection.
  // Validator runs against loaded subcategories; invalid ids silently clear.
  // Defaults to the first subcategory when nothing is selected (desktop) but
  // stays `null` on mobile to render the left panel (list view) on load.
  const validateSubcategory = useCallback(
    // Until subcategories load, treat any id as valid so a deep-linked
    // ?subcategory= survives the first render instead of being stripped.
    (v: string) => (subcategories ? subcategories.some((s) => s.id === v) : true),
    [subcategories]
  );
  const [urlSelectedId, setSelectedId, clearSelection] = useUrlSelection({
    param: "subcategory",
    validate: validateSubcategory,
  });
  const fallbackId = subcategories?.[0]?.id ?? null;
  const resolvedSelectedId = urlSelectedId ?? fallbackId;

  const selectedSubcategory = subcategories?.find((s) => s.id === resolvedSelectedId) ?? null;
  const selectedSummary = resolvedSelectedId
    ? (subcategoryTotals[resolvedSelectedId] ?? null)
    : null;

  const isShortfallTier = tier === "committed" || tier === "discretionary";
  const shortfall = useTierShortfall(isShortfallTier ? tier : "committed", {
    isSnapshot: !isShortfallTier,
  });
  const showShortfallStrip = isShortfallTier && shortfall.isLive && shortfall.count > 0;

  const isGiftsSubcategory =
    tier === "discretionary" && selectedSubcategory?.name.toLowerCase().trim() === "gifts";
  const { data: giftSettings } = useGiftPlannerSettings({ enabled: isGiftsSubcategory });
  const lockedManager: LockedManager | undefined =
    isGiftsSubcategory && giftSettings?.mode === "synced"
      ? { label: "Gift Planner", path: "/gifts" }
      : undefined;

  const hasError = subsError || itemsError;
  const retry = useCallback(() => {
    void refetchSubs();
    void refetchItems();
  }, [refetchSubs, refetchItems]);

  return (
    <div data-page={tier} data-testid={`tier-page-${tier}`} className="h-full">
      <TwoPanelLayout
        selectedKey={urlSelectedId}
        left={
          <div className="flex h-full flex-col">
            <PageHeader
              title={config.label}
              colorClass={config.textClass}
              total={hasError ? null : tierTotal}
              totalColorClass={config.textClass}
            />
            {showShortfallStrip && shortfall.lowest && (
              <AttentionStrip
                ariaLabel={`Cashflow shortfall: ${shortfall.count} item${shortfall.count === 1 ? "" : "s"} in the next 30 days`}
                body={
                  <>
                    Cashflow won't cover{" "}
                    <strong>
                      {shortfall.count} item{shortfall.count === 1 ? "" : "s"}
                    </strong>
                  </>
                }
                tooltip={
                  <ShortfallTooltip
                    items={shortfall.items}
                    balanceToday={shortfall.balanceToday}
                    lowest={shortfall.lowest}
                    showPence={showPence}
                  />
                }
              />
            )}
            {hasError ? (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PanelError variant="left" onRetry={retry} message="Couldn't load this tier." />
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <SubcategoryList
                    tier={tier}
                    config={config}
                    subcategories={subcategories ?? []}
                    subcategoryTotals={subcategoryTotals}
                    selectedId={resolvedSelectedId}
                    onSelect={setSelectedId}
                    isLoading={subsLoading}
                  />
                </div>
                {!subsLoading && (
                  <div
                    data-testid="tier-total"
                    className="border-t border-foreground/10 px-4 py-3 flex justify-between text-sm"
                  >
                    <span className="text-foreground/50">Total</span>
                    <span className={`font-numeric font-semibold ${config.textClass}`}>
                      <AnimatedCurrency value={toGBP(tierTotal)} />
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        }
        right={
          hasError ? (
            <PanelError variant="right" onRetry={retry} message="Couldn't load this tier." />
          ) : (
            <ItemArea
              key={resolvedSelectedId}
              tier={tier}
              config={config}
              subcategory={selectedSubcategory}
              subcategories={(subcategories ?? []).map((s) => ({ id: s.id, name: s.name }))}
              members={members.map((m) => ({ id: m.id, firstName: m.firstName }))}
              items={selectedSummary?.items ?? []}
              isLoading={itemsLoading}
              stalenessMonths={stalenessMonths}
              initialIsAdding={hasAddParam}
              onSubcategorySelect={setSelectedId}
              lockedManager={lockedManager}
              onBack={clearSelection}
            />
          )
        }
      />
    </div>
  );
}
