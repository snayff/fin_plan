import type { IncomeSourceRow } from "@finplan/shared";
import { toMonthlyAmount } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/lib/utils";
import { StalenessIndicator } from "@/components/common/StalenessIndicator";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
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

interface IncomeTypePanelProps {
  label: string;
  sources: IncomeSourceRow[];
  onSelectSource: (item: SelectedItem) => void;
  onBack: () => void;
  selectedItemId: string | null;
}

export function IncomeTypePanel({
  label,
  sources,
  onSelectSource,
  onBack,
  selectedItemId,
}: IncomeTypePanelProps) {
  const { data: settings } = useSettings();
  const threshold = settings?.stalenessThresholds?.income_source ?? 12;
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
          ← Income
        </button>
        <span>/</span>
        <span className="text-foreground font-medium">{label}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sources.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">No {label.toLowerCase()} sources</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sources.map((src) => {
              const displayAmount = toMonthlyAmount(src.amount, src.frequency);
              const amortisationMarker =
                src.frequency === "annual" ? "÷12" :
                src.frequency === "quarterly" ? "÷3" :
                src.frequency === "weekly" ? "/wk" :
                null;
              return (
                <div
                  key={src.id}
                  className={cn(ROW_CLASS, selectedItemId === src.id && "bg-accent")}
                  onClick={() =>
                    onSelectSource({
                      id: src.id,
                      type: "income_source",
                      name: src.name,
                      amount: src.amount,
                      lastReviewedAt: new Date(src.lastReviewedAt),
                    })
                  }
                >
                  <span>{src.name}</span>
                  <div className="flex items-center gap-2">
                    <StalenessIndicator
                      lastReviewedAt={src.lastReviewedAt}
                      thresholdMonths={threshold}
                    />
                    <div className="flex items-center gap-1 font-numeric text-foreground/60">
                      {amortisationMarker && (
                        src.frequency === "weekly" ? (
                          <span className="text-xs text-muted-foreground">{amortisationMarker}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            <GlossaryTermMarker entryId="amortised">{amortisationMarker}</GlossaryTermMarker>
                          </span>
                        )
                      )}
                      <span>{formatCurrency(displayAmount, showPence)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
