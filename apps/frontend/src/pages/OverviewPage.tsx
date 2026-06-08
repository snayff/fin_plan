import { useState } from "react";
import type React from "react";
import { useWaterfallSummary } from "@/hooks/useWaterfall";
import type { IncomeType } from "@finplan/shared";
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

interface SelectedItem {
  id: string;
  type: string;
  name: string;
  amount: number;
  lastReviewedAt: Date;
}

type RightPanelView =
  | { type: "none" }
  | { type: "item"; item: SelectedItem }
  | { type: "income_type"; incomeType: IncomeType; label: string }
  | { type: "committed_bills" };

export default function OverviewPage() {
  const [view, setView] = useState<RightPanelView>({ type: "none" });

  const { data: summary, isLoading, isError, refetch } = useWaterfallSummary();

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

  const left = (
    <div className="flex flex-col h-full">
      <PageHeader title="Overview" />
      <div className="flex-1 min-h-0 overflow-y-auto">{leftContent}</div>
    </div>
  );

  // Build right panel
  let right: React.ReactNode;
  if (view.type === "item") {
    right = <ItemDetailPanel item={view.item} onBack={() => setView({ type: "none" })} />;
  } else if (view.type === "income_type" && summary) {
    const group = summary.income.byType.find((g) => g.type === view.incomeType);
    right = (
      <IncomeTypePanel
        label={view.label}
        sources={group?.sources ?? []}
        onSelectSource={(item) => setView({ type: "item", item })}
        onBack={() => setView({ type: "none" })}
        selectedItemId={null}
      />
    );
  } else if (view.type === "committed_bills" && summary) {
    right = (
      <CommittedBillsPanel
        bills={summary.committed.bills}
        onSelectBill={(item) => setView({ type: "item", item })}
        onBack={() => setView({ type: "none" })}
        selectedItemId={null}
      />
    );
  } else {
    right = <FinancialSummaryPanel waterfallSummary={summary} isSnapshot={false} />;
  }

  return (
    <div data-page="overview" data-testid="overview-page" className="h-full">
      <TwoPanelLayout left={left} right={right} />
    </div>
  );
}
