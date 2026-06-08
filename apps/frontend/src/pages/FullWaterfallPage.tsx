import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useFullWaterfall, useCreateSubcategory } from "@/hooks/useWaterfall";
import { useSettings, useDismissWaterfallTip, useHouseholdMembers } from "@/hooks/useSettings";
import { waterfallService } from "@/services/waterfall.service";
import { formatCurrency } from "@/utils/format";
import { WaterfallTierTable } from "@/components/waterfall/WaterfallTierTable";
import { SurplusStrip } from "@/components/waterfall/SurplusStrip";
import { TipBanner } from "@/components/waterfall/TipBanner";
import { NetworkStatusBanner } from "@/components/waterfall/NetworkStatusBanner";
import { WaterfallConnector } from "@/components/overview/WaterfallConnector";
import type { PeriodItemType } from "@finplan/shared";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tierToItemType(tier: "income" | "committed" | "discretionary"): PeriodItemType {
  if (tier === "income") return "income_source";
  if (tier === "committed") return "committed_item";
  return "discretionary_item";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FullWaterfallPage() {
  const navigate = useNavigate();
  const waterfall = useFullWaterfall();
  const settings = useSettings();
  const dismissTip = useDismissWaterfallTip();
  const members = useHouseholdMembers();

  const createIncomeSub = useCreateSubcategory("income");
  const createCommittedSub = useCreateSubcategory("committed");
  const createDiscretionarySub = useCreateSubcategory("discretionary");

  const [hasSaveFailures, setHasSaveFailures] = useState(false);

  // ── Refetch on tab focus ──────────────────────────────────────────────────
  useEffect(() => {
    const handleFocus = () => {
      void waterfall.summary.refetch();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [waterfall.summary]);

  // ── Hash-scroll on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const hash = window.location?.hash?.replace("#", "") ?? "";
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, []);

  // ── Close / back ──────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/overview");
    }
  }, [navigate]);

  // ── Save callbacks (service-layer, no per-item hooks) ─────────────────────
  const makeSaveName =
    (tier: "income" | "committed" | "discretionary") =>
    async (id: string, name: string): Promise<unknown> => {
      try {
        if (tier === "income") return await waterfallService.updateIncome(id, { name });
        if (tier === "committed") return await waterfallService.updateCommitted(id, { name });
        return await waterfallService.updateDiscretionary(id, { name });
      } catch (err) {
        setHasSaveFailures(true);
        throw err;
      }
    };

  const makeSaveAmount =
    (tier: "income" | "committed" | "discretionary") =>
    async (id: string, amount: number): Promise<unknown> => {
      try {
        const itemType = tierToItemType(tier);
        return await waterfallService.createPeriod({
          itemType,
          itemId: id,
          amount,
          startDate: new Date(),
        });
      } catch (err) {
        setHasSaveFailures(true);
        throw err;
      }
    };

  const makeDeleteItem =
    (tier: "income" | "committed" | "discretionary") =>
    async (id: string): Promise<unknown> => {
      try {
        if (tier === "income") return await waterfallService.deleteIncome(id);
        if (tier === "committed") return await waterfallService.deleteCommitted(id);
        return await waterfallService.deleteDiscretionary(id);
      } catch (err) {
        setHasSaveFailures(true);
        throw err;
      }
    };

  // ── Derived state ─────────────────────────────────────────────────────────
  const memberList = members.data;

  const summaryData = waterfall.summary.data;
  const incomeTotal = summaryData?.income.total ?? 0;
  const committedTotal = summaryData?.committed.monthlyTotal ?? 0;
  const discretionaryTotal = summaryData?.discretionary.total ?? 0;

  const allItems = [
    ...waterfall.items.income,
    ...waterfall.items.committed,
    ...waterfall.items.discretionary,
  ];
  const allSubcategories = [
    ...waterfall.subcategories.income,
    ...waterfall.subcategories.committed,
    ...waterfall.subcategories.discretionary,
  ];
  const isEmpty = allItems.length === 0 && allSubcategories.length === 0;
  const showTip = isEmpty && !settings.data?.waterfallTipDismissed;

  return (
    <div data-testid="full-waterfall-page" className="flex flex-col h-full min-h-0 bg-background">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3 shrink-0">
        <h1 className="font-heading text-base font-bold text-foreground">Waterfall</h1>
        <button
          type="button"
          onClick={handleClose}
          className="text-sm text-text-secondary hover:text-foreground transition-colors"
          aria-label="Close waterfall view"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-4">
          {/* Banners */}
          <NetworkStatusBanner hasFailures={hasSaveFailures} />
          {showTip && <TipBanner onDismiss={() => dismissTip.mutate()} />}

          {/* Income tier */}
          <WaterfallTierTable
            tier="income"
            subcategories={waterfall.subcategories.income}
            items={waterfall.items.income}
            members={memberList}
            total={incomeTotal}
            onCreateSubcategory={(name) => createIncomeSub.mutateAsync(name)}
            onSaveName={makeSaveName("income")}
            onSaveAmount={makeSaveAmount("income")}
            onDeleteItem={makeDeleteItem("income")}
          />

          <WaterfallConnector text={`−  ${formatCurrency(committedTotal)}  committed`} />

          {/* Committed tier */}
          <WaterfallTierTable
            tier="committed"
            subcategories={waterfall.subcategories.committed}
            items={waterfall.items.committed}
            members={memberList}
            total={committedTotal}
            onCreateSubcategory={(name) => createCommittedSub.mutateAsync(name)}
            onSaveName={makeSaveName("committed")}
            onSaveAmount={makeSaveAmount("committed")}
            onDeleteItem={makeDeleteItem("committed")}
          />

          <WaterfallConnector text={`−  ${formatCurrency(discretionaryTotal)}  discretionary`} />

          {/* Discretionary tier */}
          <WaterfallTierTable
            tier="discretionary"
            subcategories={waterfall.subcategories.discretionary}
            items={waterfall.items.discretionary}
            members={memberList}
            total={discretionaryTotal}
            onCreateSubcategory={(name) => createDiscretionarySub.mutateAsync(name)}
            onSaveName={makeSaveName("discretionary")}
            onSaveAmount={makeSaveAmount("discretionary")}
            onDeleteItem={makeDeleteItem("discretionary")}
          />

          {/* Surplus strip */}
          <SurplusStrip
            income={incomeTotal}
            committed={committedTotal}
            discretionary={discretionaryTotal}
          />
        </div>
      </div>
    </div>
  );
}
