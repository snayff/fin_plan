import { Link } from "react-router-dom";
import type { SparklinePoint } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import { SummarySparkline } from "./SummarySparkline";

interface NetWorthCardProps {
  netWorth: number | null;
  sparklineData: SparklinePoint[];
}

// Callout gradient card — indigo→purple at low opacity (design-system.md §1.2
// "Callout Gradient Cards"). Uses the dedicated --callout-card-* tokens so no
// raw hex/rgba lives in component code.
const SHELL_STYLE = {
  background:
    "linear-gradient(135deg, hsl(var(--callout-card-from) / 0.08) 0%, hsl(var(--callout-card-to) / 0.05) 100%)",
  border: "1px solid hsl(var(--callout-card-from) / 0.1)",
} as const;

const LABEL_CLASS =
  "text-center font-heading text-[13px] font-semibold uppercase tracking-tier text-text-secondary";

export function NetWorthCard({ netWorth, sparklineData }: NetWorthCardProps) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;

  if (netWorth === null) {
    return (
      <div className="rounded-xl pt-5 pb-4 px-4 overflow-hidden" style={SHELL_STYLE}>
        <p className={`${LABEL_CLASS} mb-3`}>NET WORTH (EXCL. PENSIONS)</p>
        <div className="flex flex-col items-center text-center">
          <h3 className="font-heading text-sm font-semibold text-foreground mb-1">
            Track your wealth over time
          </h3>
          <p className="text-xs text-text-tertiary mb-3 max-w-xs">
            Add a savings, investment or pension account to see your{" "}
            <GlossaryTermMarker entryId="net-worth">net worth</GlossaryTermMarker>.
          </p>
          <Link
            to="/assets"
            className="inline-block rounded-md bg-page-accent/15 border border-page-accent/40 px-3 py-1.5 text-xs font-medium text-page-accent hover:bg-page-accent/25 transition-colors"
          >
            Add wealth account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl pt-5 pb-4 overflow-hidden" style={SHELL_STYLE}>
      <p className={`${LABEL_CLASS} mb-2`}>NET WORTH (EXCL. PENSIONS)</p>
      <p className="text-center font-numeric text-[36px] font-medium leading-[1.1] tabular-nums text-foreground">
        {formatCurrency(netWorth, showPence)}
      </p>
      <div className="mt-3">
        <SummarySparkline
          data={sparklineData}
          color="#818cf8"
          currentValue={netWorth}
          paddingX={0}
        />
      </div>
    </div>
  );
}
