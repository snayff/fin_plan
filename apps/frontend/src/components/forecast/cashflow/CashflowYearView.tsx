import type { ReactNode } from "react";
import { format } from "date-fns";
import type { CashflowProjection, CashflowProjectionMonth } from "@finplan/shared";
import { CashflowYearBar } from "./CashflowYearBar";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import { cn } from "@/lib/utils";

interface CashflowYearViewProps {
  projection: CashflowProjection;
  onSelectMonth: (month: CashflowProjectionMonth) => void;
  onShiftWindow: (delta: number) => void;
  canShiftBack: boolean;
}

function HeadlineCard({
  label,
  value,
  amber,
  sub,
}: {
  label: ReactNode;
  value: string;
  amber?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="label-chart">{label}</div>
      <div
        className={cn("font-numeric text-base mt-1", amber ? "text-attention" : "text-foreground")}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-text-tertiary mt-0.5">{sub}</div>}
    </div>
  );
}

export function CashflowYearView({
  projection,
  onSelectMonth,
  onShiftWindow,
  canShiftBack,
}: CashflowYearViewProps) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const { months, latestKnownBalance, projectedEndBalance, tightestDip, avgMonthlySurplus } =
    projection;
  const maxAbsNet = Math.max(1, ...months.map((m) => Math.abs(m.netChange)));
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const range = `${format(new Date(first.year, first.month - 1, 1), "MMM yyyy")} — ${format(
    new Date(last.year, last.month - 1, 1),
    "MMM yyyy"
  )}`;
  const today = new Date();
  const todayLabel = format(today, "d MMM yyyy");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <HeadlineCard
          label="Starting balance"
          value={formatCurrency(latestKnownBalance, showPence)}
          sub={`as of ${todayLabel}`}
        />
        <HeadlineCard
          label="Projected end"
          value={formatCurrency(projectedEndBalance, showPence)}
        />
        <HeadlineCard
          label={<GlossaryTermMarker entryId="tightest-dip">Tightest dip</GlossaryTermMarker>}
          value={formatCurrency(tightestDip.value, showPence)}
          amber={tightestDip.value < 0}
          sub={format(new Date(tightestDip.date), "d MMM yyyy")}
        />
        <HeadlineCard
          label="Average monthly surplus"
          value={formatCurrency(avgMonthlySurplus, showPence)}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canShiftBack}
          onClick={() => onShiftWindow(-1)}
          aria-label="Shift window one month earlier"
          className="px-2 py-1 text-xs disabled:opacity-30 hover:text-page-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-page-accent rounded"
        >
          ←
        </button>
        <span className="text-xs text-text-tertiary">{range}</span>
        <button
          type="button"
          onClick={() => onShiftWindow(1)}
          aria-label="Shift window one month later"
          className="px-2 py-1 text-xs hover:text-page-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-page-accent rounded"
        >
          →
        </button>
        <button
          type="button"
          disabled={!canShiftBack}
          onClick={() => onShiftWindow(0)}
          className="ml-2 border border-foreground/10 rounded px-2 py-0.5 text-[10px] uppercase tracking-widest text-text-secondary disabled:opacity-30 hover:text-page-accent hover:border-page-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-page-accent transition-colors"
        >
          Today
        </button>
      </div>

      <div className="h-48 flex items-end gap-2 pb-6">
        {months.map((m) => {
          const isCurrent = m.year === today.getFullYear() && m.month === today.getMonth() + 1;
          const todayDayProportion = isCurrent
            ? today.getDate() / new Date(m.year, m.month, 0).getDate()
            : undefined;
          return (
            <div key={`${m.year}-${m.month}`} className="flex-1 h-full flex items-end">
              <CashflowYearBar
                month={m}
                maxAbsNet={maxAbsNet}
                onClick={onSelectMonth}
                todayDayProportion={todayDayProportion}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
