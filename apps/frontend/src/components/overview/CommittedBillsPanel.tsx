import type { CommittedBillRow } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/lib/utils";
import { StalenessIndicator } from "@/components/common/StalenessIndicator";
import { useSettings } from "@/hooks/useSettings";

const ROW_CLASS =
  "flex items-center justify-between py-2 px-3 rounded cursor-pointer hover:bg-accent/50 transition-colors text-[13px] font-body text-text-secondary";

interface SelectedItem {
  id: string;
  type: string;
  name: string;
  amount: number;
  lastReviewedAt: Date;
}

interface CommittedBillsPanelProps {
  bills: CommittedBillRow[];
  onSelectBill: (item: SelectedItem) => void;
  onBack: () => void;
  selectedItemId: string | null;
}

export function CommittedBillsPanel({
  bills,
  onSelectBill,
  onBack,
  selectedItemId,
}: CommittedBillsPanelProps) {
  const { data: settings } = useSettings();
  const threshold = settings?.stalenessThresholds?.committed_bill ?? 6;
  const showPence = settings?.showPence ?? false;

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onBack}
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          ← Committed
        </button>
        <span>/</span>
        <span className="text-foreground font-medium">Monthly bills</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {bills.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">No monthly bills added yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {bills.map((bill) => (
              <div
                key={bill.id}
                className={cn(ROW_CLASS, selectedItemId === bill.id && "bg-accent")}
                onClick={() =>
                  onSelectBill({
                    id: bill.id,
                    type: "committed_bill",
                    name: bill.name,
                    amount: bill.amount,
                    lastReviewedAt: new Date(bill.lastReviewedAt),
                  })
                }
              >
                <span>{bill.name}</span>
                <div className="flex items-center gap-2">
                  <StalenessIndicator
                    lastReviewedAt={bill.lastReviewedAt}
                    thresholdMonths={threshold}
                  />
                  <span className="font-numeric text-foreground/60">
                    {formatCurrency(bill.amount, showPence)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
