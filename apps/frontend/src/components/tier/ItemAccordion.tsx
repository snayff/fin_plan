import { isStale, getMonthsAgo, type SpendType } from "./formatAmount";
import ValueSparkline from "./ValueSparkline";
import type { TierConfig } from "./tierConfig";

interface ItemPeriod {
  id: string;
  startDate: string | Date;
  endDate?: string | Date | null;
  amount: number;
}

interface Item {
  id: string;
  name: string;
  amount: number;
  spendType: SpendType;
  subcategoryId: string;
  subcategoryName: string;
  notes: string | null;
  lastReviewedAt: Date;
  sortOrder: number;
  periods?: ItemPeriod[];
}

interface Props {
  item: Item;
  config: TierConfig;
  onEdit: () => void;
  now: Date;
  stalenessMonths?: number;
}

function formatReviewDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function ItemAccordion({ item, config, onEdit, now, stalenessMonths = 12 }: Props) {
  const stale = isStale(item.lastReviewedAt, now, stalenessMonths);
  const monthsAgo = stale ? getMonthsAgo(item.lastReviewedAt, now) : 0;

  return (
    <div
      className={[
        "border-t border-foreground/5 bg-foreground/[0.02] py-2.5 pr-4",
        `border-l-2 ${config.borderClass}`,
        "pl-[30px]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {/* Content */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Notes */}
          <div>
            <span className="block label-chart">Notes</span>
            {item.notes ? (
              <p className="text-xs italic text-text-tertiary">{item.notes}</p>
            ) : (
              <p className="text-xs text-text-muted">No notes</p>
            )}
          </div>

          {/* Last Reviewed — only when stale */}
          {stale && (
            <div>
              <span className="block label-chart">Last Reviewed</span>
              <span className="flex items-center gap-1.5 text-xs text-attention">
                <span className="h-[5px] w-[5px] rounded-full bg-attention shrink-0" aria-hidden />
                {formatReviewDate(item.lastReviewedAt)} · {monthsAgo} months ago
              </span>
            </div>
          )}
        </div>

        {/* Edit button — right-aligned, top-aligned */}
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-md border border-foreground/10 px-3 py-1 text-xs text-text-tertiary hover:bg-foreground/5 transition-colors"
        >
          Edit
        </button>
      </div>

      {/* Value history sparkline */}
      {item.periods && (
        <ValueSparkline
          periods={item.periods.map((p) => ({
            ...p,
            startDate: new Date(p.startDate),
            endDate: p.endDate ? new Date(p.endDate) : null,
          }))}
          color={config.color}
        />
      )}
    </div>
  );
}
