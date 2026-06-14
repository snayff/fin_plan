import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

type ActiveView = "purchases";

interface PlannerLeftPanelProps {
  year: number;
  budget: any | null;
  purchases: any[];
  activeView: ActiveView;
  onSelectView: (v: ActiveView) => void;
}

export function PlannerLeftPanel({
  budget,
  purchases,
  activeView,
  onSelectView,
}: PlannerLeftPanelProps) {
  const scheduledTotal = purchases
    .filter((p) => p.scheduledThisYear === true && p.status !== "done")
    .reduce((sum: number, p) => sum + (p.estimatedCost ?? 0), 0);

  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const purchaseBudget = budget?.purchaseBudget ?? 0;
  const purchasesOverBudget = scheduledTotal > purchaseBudget;

  return (
    <div className="space-y-1">
      {/* PURCHASES section */}
      <div className="mb-1">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="label-section">Purchases</span>
          <span className="text-sm font-medium">{formatCurrency(purchaseBudget, showPence)}</span>
        </div>

        <div className="flex items-center justify-between px-2 py-0.5 text-sm">
          <span className="text-muted-foreground">Scheduled</span>
          <span>{formatCurrency(scheduledTotal, showPence)}</span>
        </div>

        {purchasesOverBudget && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-attention shrink-0" />
            <span className="text-attention">over budget</span>
          </div>
        )}

        <button
          className={cn(
            "w-full text-left px-2 py-1.5 rounded text-sm transition-colors hover:bg-accent mt-0.5",
            activeView === "purchases" && "bg-accent font-medium"
          )}
          onClick={() => onSelectView("purchases")}
        >
          View purchases →
        </button>
      </div>
    </div>
  );
}
