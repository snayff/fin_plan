import { useCallback } from "react";
import type React from "react";
import { useWaterfallSummary } from "@/hooks/useWaterfall";
import type { IncomeType } from "@finplan/shared";
import {
  INCOME_TYPES,
  resolveOverviewView,
  encodeViewParam,
  type ResolvedView,
} from "./OverviewPage.resolver";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { PanelError } from "@/components/common/PanelError";
import { PageHeader } from "@/components/common/PageHeader";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { WaterfallLeftPanel } from "@/components/overview/WaterfallLeftPanel";
import { ItemDetailPanel } from "@/components/overview/ItemDetailPanel";
import { IncomeTypePanel } from "@/components/overview/IncomeTypePanel";
import { CommittedBillsPanel } from "@/components/overview/CommittedBillsPanel";
import { FinancialSummaryPanel } from "@/components/overview/FinancialSummaryPanel";
import OverviewEmptyState from "@/components/overview/OverviewEmptyState";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function OverviewPage() {
  const { data: summary, isLoading, isError, refetch } = useWaterfallSummary();

  // Validator accepts any well-formed view string; resolution happens below.
  const validateView = useCallback((raw: string) => {
    if (raw === "committed-bills") return true;
    if (raw.startsWith("type:")) {
      return INCOME_TYPES.includes(raw.slice("type:".length) as IncomeType);
    }
    if (raw.startsWith("item:")) {
      // Item ids can't be validated before summary loads; accept and resolve below.
      // If unresolvable after summary loads, the view defaults to "none" and the
      // URL param is left in place. (Acceptable: the user can navigate back.)
      return true;
    }
    return false;
  }, []);

  const [rawView, setView, clearView] = useUrlSelection({ param: "view", validate: validateView });
  const view = resolveOverviewView(rawView, summary);
  const isMobile = useIsMobile();

  const selectView = useCallback((next: ResolvedView) => setView(encodeViewParam(next)), [setView]);

  // Build left panel content (below the header)
  const leftContent = isLoading ? (
    <SkeletonLoader variant="left-panel" />
  ) : isError && !summary ? (
    <PanelError variant="left" onRetry={refetch} message="Could not load your waterfall" />
  ) : summary ? (
    <WaterfallLeftPanel
      summary={summary}
      selectedItemId={
        view.type === "item"
          ? view.item.id
          : view.type === "income_type"
            ? `type:${view.incomeType}`
            : view.type === "committed_bills"
              ? "aggregate:committed_bills"
              : null
      }
      isSnapshot={false}
    />
  ) : (
    <OverviewEmptyState />
  );

  // On mobile with no specific item selection, stack the FinancialSummaryPanel
  // inline beneath the waterfall list so users can scroll the full overview in
  // one go (right panel push-nav stays reserved for item drill-ins).
  const showInlineSummary = isMobile && view.type === "none" && summary != null;

  const left = (
    <div className="flex h-full flex-col">
      <PageHeader title="Overview" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {leftContent}
        {showInlineSummary && (
          <div className="mt-4 border-t border-foreground/10">
            <FinancialSummaryPanel waterfallSummary={summary} isSnapshot={false} inline />
          </div>
        )}
      </div>
    </div>
  );

  // Build right panel
  let right: React.ReactNode;
  if (view.type === "item") {
    right = <ItemDetailPanel item={view.item} onBack={clearView} />;
  } else if (view.type === "income_type" && summary) {
    const group = summary.income.byType.find((g) => g.type === view.incomeType);
    right = (
      <IncomeTypePanel
        label={view.label}
        sources={group?.sources ?? []}
        onSelectSource={(item) => selectView({ type: "item", item })}
        onBack={clearView}
        selectedItemId={null}
      />
    );
  } else if (view.type === "committed_bills" && summary) {
    right = (
      <CommittedBillsPanel
        bills={summary.committed.bills}
        onSelectBill={(item) => selectView({ type: "item", item })}
        onBack={clearView}
        selectedItemId={null}
      />
    );
  } else {
    right = <FinancialSummaryPanel waterfallSummary={summary} isSnapshot={false} />;
  }

  // selectedKey drives mobile push-nav: null = show left, non-null = show right
  const selectedKey = view.type === "none" ? null : encodeViewParam(view);

  return (
    <div data-page="overview" data-testid="overview-page" className="h-full">
      <TwoPanelLayout left={left} right={right} selectedKey={selectedKey} />
    </div>
  );
}
