import { OverBudgetSignal } from "./OverBudgetSignal";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import type { GiftBudgetSummary } from "@finplan/shared";

type Props = { budget: GiftBudgetSummary; readOnly: boolean };

export function GiftsBudgetSummary({ budget }: Props) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  return (
    <div className="space-y-3 px-4 py-4">
      <div>
        <div className="label-section">
          <GlossaryTermMarker entryId="gifts-annual-budget">Annual budget</GlossaryTermMarker>
        </div>
        <div
          data-testid="gifts-budget-annual"
          className="font-mono text-2xl tabular-nums text-foreground"
        >
          {formatCurrency(budget.annualBudget, showPence)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label-section">
            <GlossaryTermMarker entryId="gifts-planned">Planned</GlossaryTermMarker>
          </div>
          <div
            data-testid="gifts-budget-planned"
            className="font-mono text-base tabular-nums text-foreground/65"
          >
            {formatCurrency(budget.planned, showPence)}
          </div>
        </div>
        <div>
          <div className="label-section">
            <GlossaryTermMarker entryId="gifts-spent">Spent</GlossaryTermMarker>
          </div>
          <div
            data-testid="gifts-budget-spent"
            className="font-mono text-base tabular-nums text-foreground/65"
          >
            {formatCurrency(budget.spent, showPence)}
          </div>
        </div>
      </div>
      <OverBudgetSignal kind="planned" amountOver={budget.plannedOverBudgetBy} />
      <OverBudgetSignal kind="spent" amountOver={budget.spentOverBudgetBy} />
    </div>
  );
}
