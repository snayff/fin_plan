import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useFinancialSummary } from "@/hooks/useWaterfall";
import { NetWorthCard } from "./NetWorthCard";
import { TierSummaryCard } from "./TierSummaryCard";
import { WaterfallSankey } from "./WaterfallSankey";
import { TierDoughnut } from "./TierDoughnut";
import { extractDrillItems } from "@/utils/doughnutData";
import type { WaterfallSummary } from "@finplan/shared";

interface FinancialSummaryPanelProps {
  waterfallSummary: WaterfallSummary | undefined;
  isSnapshot: boolean;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 1, 0.5, 1] as const },
  },
};

const cardVariantsReduced = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

function SkeletonCard({ large = false }: { large?: boolean }) {
  return (
    <div
      className="rounded-xl p-6 animate-pulse"
      style={{ background: "#0d1120", border: "1px solid #1a1f35" }}
    >
      <div className="h-3 w-20 rounded bg-white/10 mx-auto mb-3" />
      <div className={`${large ? "h-9 w-32" : "h-5 w-24"} rounded bg-white/10 mx-auto mb-3`} />
      <div className="h-10 w-full rounded bg-white/10" />
    </div>
  );
}

export function FinancialSummaryPanel({
  waterfallSummary,
  isSnapshot,
}: FinancialSummaryPanelProps) {
  const shouldReduce = useReducedMotion();
  const { data, isLoading, isError, refetch } = useFinancialSummary();

  const committedItems = useMemo(
    () => (waterfallSummary ? extractDrillItems("committed", waterfallSummary) : []),
    [waterfallSummary]
  );

  const discretionaryItems = useMemo(
    () => (waterfallSummary ? extractDrillItems("discretionary", waterfallSummary) : []),
    [waterfallSummary]
  );

  const cv = shouldReduce ? cardVariantsReduced : cardVariants;

  if (isLoading) {
    return (
      <div
        data-testid="financial-summary-panel"
        role="status"
        aria-busy="true"
        aria-label="Loading financial summary"
        className="flex flex-col items-center justify-start h-full overflow-y-auto py-8"
      >
        <div className="flex flex-col gap-3 w-[62%]">
          <SkeletonCard large />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        data-testid="financial-summary-panel"
        className="flex h-full items-center justify-center"
      >
        <div className="text-center">
          <p className="text-sm text-foreground/40 mb-2">Could not load summary</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs text-foreground/30 hover:text-foreground/50 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      data-testid="financial-summary-panel"
      className="flex flex-col h-full overflow-y-auto py-8 px-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Net Worth — centred above the split */}
      <motion.div variants={cv} className="max-w-sm mx-auto w-full mb-6">
        <NetWorthCard netWorth={data.current.netWorth} sparklineData={data.sparklines.netWorth} />
      </motion.div>

      {/* Split layout: visualisations left, sparklines right */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left column: Sankey + Doughnuts */}
        <div className="flex flex-col gap-6 flex-1 min-w-0">
          <motion.div variants={cv}>
            <WaterfallSankey
              income={data.current.income}
              committed={data.current.committed}
              discretionary={data.current.discretionary}
              surplus={data.current.surplus}
            />
          </motion.div>

          {waterfallSummary && (
            <>
              <motion.div variants={cv}>
                <p className="label-detail mb-2 text-tier-committed">Committed</p>
                <TierDoughnut
                  tier="committed"
                  tierTotal={waterfallSummary.committed.monthlyTotal}
                  subcategories={waterfallSummary.committed.bySubcategory}
                  items={committedItems}
                  isSnapshot={isSnapshot}
                />
              </motion.div>

              <motion.div variants={cv}>
                <p className="label-detail mb-2 text-tier-discretionary">Discretionary</p>
                <TierDoughnut
                  tier="discretionary"
                  tierTotal={waterfallSummary.discretionary.total}
                  subcategories={waterfallSummary.discretionary.bySubcategory}
                  items={discretionaryItems}
                  isSnapshot={isSnapshot}
                />
              </motion.div>
            </>
          )}
        </div>

        {/* Right column: Sparkline tier cards */}
        <div className="flex flex-col gap-3 w-[200px] shrink-0">
          <motion.div variants={cv}>
            <TierSummaryCard
              tier="income"
              amount={data.current.income}
              sparklineData={data.sparklines.income}
            />
          </motion.div>
          <motion.div variants={cv}>
            <TierSummaryCard
              tier="committed"
              amount={data.current.committed}
              sparklineData={data.sparklines.committed}
            />
          </motion.div>
          <motion.div variants={cv}>
            <TierSummaryCard
              tier="discretionary"
              amount={data.current.discretionary}
              sparklineData={data.sparklines.discretionary}
            />
          </motion.div>
          <motion.div variants={cv}>
            <TierSummaryCard
              tier="surplus"
              amount={data.current.surplus}
              sparklineData={data.sparklines.surplus}
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
