import type { AssetType, AccountType } from "@finplan/shared";
import type { AssetsSummary } from "../../services/assets.service.js";
import { PageHeader } from "@/components/common/PageHeader";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";

const ASSET_TYPES: AssetType[] = ["Property", "Vehicle", "Other"];
const ACCOUNT_TYPES: AccountType[] = ["Current", "Savings", "Pension", "StocksAndShares", "Other"];

const TYPE_LABELS: Record<AssetType | AccountType, string> = {
  Property: "Property",
  Vehicle: "Vehicle",
  Other: "Other",
  Current: "Current",
  Savings: "Savings",
  Pension: "Pension",
  StocksAndShares: "Stocks & Shares",
};

interface Props {
  summary: AssetsSummary | undefined;
  selected: AssetType | AccountType;
  onSelect: (type: AssetType | AccountType) => void;
  staleCountByType?: Partial<Record<AssetType | AccountType, number>>;
}

export function AssetsLeftPanel({ summary, selected, onSelect, staleCountByType = {} }: Props) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  // The Assets page total reflects ALL holdings shown in the list (pensions
  // included). `summary.grandTotal` now means net worth EXCLUDING pensions (#164)
  // — used by the Overview/Forecast — so we sum the displayed type rows here to
  // keep the footer reconciled with the rows above it.
  const grandTotal =
    Object.values(summary?.assetTotals ?? {}).reduce((s, v) => s + v, 0) +
    Object.values(summary?.accountTotals ?? {}).reduce((s, v) => s + v, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Assets" total={grandTotal} />

      {/* List */}
      <nav aria-label="Assets and accounts" className="flex-1 min-h-0 overflow-y-auto">
        {/* Assets group */}
        <p className="label-chart px-4 py-1.5">Assets</p>
        {ASSET_TYPES.map((type) => {
          const isSelected = selected === type;
          const total = summary?.assetTotals[type] ?? 0;
          const staleCount = staleCountByType[type] ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              aria-current={isSelected ? "true" : undefined}
              className={[
                "relative flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors",
                isSelected
                  ? "font-medium text-page-accent"
                  : "text-foreground/60 hover:bg-page-accent/5",
              ].join(" ")}
            >
              {isSelected && (
                <div className="absolute inset-0 bg-page-accent/14 border-l-2 border-page-accent rounded-r-sm" />
              )}
              <div className="relative z-10 flex items-center gap-2">
                <span>{TYPE_LABELS[type]}</span>
                {staleCount > 0 && (
                  <span className="text-[10px] text-attention">● {staleCount} stale</span>
                )}
              </div>
              <span className="relative z-10 font-numeric text-xs text-foreground/50">
                {formatCurrency(total, showPence)}
              </span>
            </button>
          );
        })}

        {/* Accounts group */}
        <p className="label-chart px-4 pt-3.5 pb-1.5">Accounts</p>
        {ACCOUNT_TYPES.map((type) => {
          const isSelected = selected === type;
          const total = summary?.accountTotals[type] ?? 0;
          const staleCount = staleCountByType[type] ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              aria-current={isSelected ? "true" : undefined}
              className={[
                "relative flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors",
                isSelected
                  ? "font-medium text-page-accent"
                  : "text-foreground/60 hover:bg-page-accent/5",
              ].join(" ")}
            >
              {isSelected && (
                <div className="absolute inset-0 bg-page-accent/14 border-l-2 border-page-accent rounded-r-sm" />
              )}
              <div className="relative z-10 flex items-center gap-2">
                <span>{TYPE_LABELS[type]}</span>
                {staleCount > 0 && (
                  <span className="text-[10px] text-attention">● {staleCount} stale</span>
                )}
              </div>
              <span className="relative z-10 font-numeric text-xs text-foreground/50">
                {formatCurrency(total, showPence)}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-foreground/10 px-4 py-3 flex justify-between text-sm">
        <span className="text-foreground/50">Total</span>
        <span className="font-numeric font-semibold text-page-accent">
          {formatCurrency(grandTotal, showPence)}
        </span>
      </div>
    </div>
  );
}
