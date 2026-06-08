import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SubcategoryList from "./SubcategoryList";
import ItemArea, { type LockedManager } from "./ItemArea";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { AttentionStrip } from "@/components/common/AttentionStrip";
import { ShortfallTooltip } from "@/components/common/ShortfallTooltip";
import { useSubcategories, useTierItems, type TierItemRow } from "@/hooks/useWaterfall";
import { useHouseholdMembers, useSettings } from "@/hooks/useSettings";
import { useGiftPlannerSettings } from "@/hooks/useGifts";
import { useTierShortfall } from "@/hooks/useShortfall";
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
  const { data: subcategories, isLoading: subsLoading } = useSubcategories(tier);
  const { data: allItems, isLoading: itemsLoading } = useTierItems(tier);
  const { data: members } = useHouseholdMembers();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;

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
      const monthly = item.spendType === "monthly" ? item.amount : Math.round(item.amount / 12);
      groups[sid].total += monthly;
      groups[sid].items.push(item);
    }
    return groups;
  }, [subcategories, allItems]);

  const tierTotal = Object.values(subcategoryTotals).reduce((sum, s) => sum + s.total, 0);

  // Select subcategory: URL param → first in list
  const paramId = searchParams.get("subcategory");
  const defaultId = subcategories?.[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(paramId ?? defaultId);

  // Sync selected to default once subcategories load
  const resolvedSelectedId =
    selectedId && subcategories?.some((s) => s.id === selectedId)
      ? selectedId
      : (subcategories?.[0]?.id ?? null);

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

  return (
    <div data-page={tier} data-testid={`tier-page-${tier}`} className="h-full">
      <TwoPanelLayout
        left={
          <div className="flex flex-col h-full">
            <PageHeader
              title={config.label}
              colorClass={config.textClass}
              total={tierTotal}
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
            <div className="flex-1 overflow-y-auto">
              <SubcategoryList
                tier={tier}
                config={config}
                subcategories={subcategories ?? []}
                subcategoryTotals={subcategoryTotals}
                tierTotal={tierTotal}
                selectedId={resolvedSelectedId}
                onSelect={setSelectedId}
                isLoading={subsLoading}
              />
            </div>
          </div>
        }
        right={
          <ItemArea
            key={resolvedSelectedId}
            tier={tier}
            config={config}
            subcategory={selectedSubcategory}
            subcategories={(subcategories ?? []).map((s) => ({ id: s.id, name: s.name }))}
            members={members.map((m) => ({ id: m.id, firstName: m.firstName }))}
            items={selectedSummary?.items ?? []}
            isLoading={itemsLoading}
            initialIsAdding={hasAddParam}
            onSubcategorySelect={setSelectedId}
            lockedManager={lockedManager}
          />
        }
      />
    </div>
  );
}
