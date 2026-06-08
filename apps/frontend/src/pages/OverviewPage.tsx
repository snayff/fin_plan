import { useCallback } from "react";
import type React from "react";
import { useWaterfallSummary } from "@/hooks/useWaterfall";
import type { IncomeType, WaterfallSummary } from "@finplan/shared";
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

/**
 * Composite URL param schema for the right panel:
 *   ?view=item:<id>         → item detail (id resolved against summary)
 *   ?view=type:<incomeType> → income type panel (e.g. type:salary)
 *   ?view=committed-bills   → committed bills panel
 *   (absent)                → no detail; left-only on mobile, summary on desktop
 *
 * URL is the single source of truth — supports refresh, deep-link, and OS
 * back to clear selection. See docs/4. planning/mobile-accessibility/plan.md
 * § Decision 5 + Item 1 amendment.
 */

const INCOME_TYPES: IncomeType[] = [
  "salary",
  "dividends",
  "freelance",
  "rental",
  "benefits",
  "other",
];

interface SelectedItem {
  id: string;
  type: string;
  name: string;
  amount: number;
  lastReviewedAt: Date;
}

type ResolvedView =
  | { type: "none" }
  | { type: "item"; item: SelectedItem }
  | { type: "income_type"; incomeType: IncomeType; label: string }
  | { type: "committed_bills" };

const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  salary: "Salary",
  dividends: "Dividends",
  freelance: "Freelance",
  rental: "Rental",
  benefits: "Benefits",
  other: "Other",
};

/**
 * Resolve `?view=...` URL value into the right-panel discriminated union.
 * Returns `{ type: "none" }` when value is null/unresolvable so the page renders
 * the default summary panel. Re-derives item snapshots from `summary` so edits
 * to the underlying record are reflected (fixes the latent staleness bug
 * called out in the plan).
 */
export function resolveOverviewView(
  raw: string | null,
  summary: WaterfallSummary | undefined
): ResolvedView {
  if (raw == null) return { type: "none" };

  if (raw === "committed-bills") return { type: "committed_bills" };

  if (raw.startsWith("type:")) {
    const t = raw.slice("type:".length) as IncomeType;
    if (INCOME_TYPES.includes(t)) {
      return { type: "income_type", incomeType: t, label: INCOME_TYPE_LABEL[t] };
    }
    return { type: "none" };
  }

  if (raw.startsWith("item:") && summary) {
    const id = raw.slice("item:".length);

    // Search across income sources, committed bills, and discretionary items.
    for (const group of summary.income.byType) {
      const source = group.sources.find((s) => s.id === id);
      if (source) {
        return {
          type: "item",
          item: {
            id: source.id,
            type: "income",
            name: source.name,
            amount: source.amount,
            lastReviewedAt: new Date(source.lastReviewedAt),
          },
        };
      }
    }
    const bill = summary.committed.bills.find((b) => b.id === id);
    if (bill) {
      return {
        type: "item",
        item: {
          id: bill.id,
          type: "committed",
          name: bill.name,
          amount: bill.amount,
          lastReviewedAt: new Date(bill.lastReviewedAt),
        },
      };
    }
    return { type: "none" };
  }

  return { type: "none" };
}

function encodeViewParam(view: ResolvedView): string | null {
  switch (view.type) {
    case "none":
      return null;
    case "item":
      return `item:${view.item.id}`;
    case "income_type":
      return `type:${view.incomeType}`;
    case "committed_bills":
      return "committed-bills";
  }
}

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
