import type { SparklinePoint } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { SummarySparkline } from "./SummarySparkline";

const TIER_COLORS = {
  income: "#0ea5e9",
  committed: "#6366f1",
  discretionary: "#a855f7",
  surplus: "#4adcd0",
} as const;

const TIER_LABELS = {
  income: "INCOME",
  committed: "COMMITTED",
  discretionary: "DISCRETIONARY",
  surplus: "SURPLUS",
} as const;

interface TierSummaryCardProps {
  tier: keyof typeof TIER_COLORS;
  amount: number;
  sparklineData: SparklinePoint[];
}

export function TierSummaryCard({ tier, amount, sparklineData }: TierSummaryCardProps) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const color = TIER_COLORS[tier];

  return (
    <div className="rounded-xl py-4" style={{ background: "#0d1120", border: "1px solid #1a1f35" }}>
      <p
        className="text-center mb-2"
        style={{
          color,
          fontSize: "13px",
          fontFamily: "var(--font-heading, 'Outfit', sans-serif)",
          fontWeight: 600,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
        }}
      >
        {TIER_LABELS[tier]}
      </p>
      <p
        className="text-center mb-3 tabular-nums"
        style={{
          color: "rgba(238,242,255,0.92)",
          fontSize: "19px",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
        }}
      >
        {formatCurrency(amount, showPence)}
      </p>
      <SummarySparkline data={sparklineData} color={color} currentValue={amount} paddingX={14} />
    </div>
  );
}
