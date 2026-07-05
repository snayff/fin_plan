import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { arc as d3Arc, pie as d3Pie, type PieArcDatum } from "d3-shape";
import type { SubcategoryTotal } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { generateTierColours } from "@/utils/tierColours";
import { DoughnutLegend } from "./DoughnutLegend";

interface DrillItem {
  id: string;
  name: string;
  amount: number;
  subcategoryId: string;
}

interface TierDoughnutProps {
  tier: "committed" | "discretionary";
  tierTotal: number;
  subcategories: SubcategoryTotal[];
  items: DrillItem[];
  isSnapshot: boolean;
}

const SIZE = 160;
const OUTER_R = SIZE / 2;
const INNER_R = OUTER_R * 0.62;
const CENTRE = SIZE / 2;

type ViewState =
  | { mode: "subcategory" }
  | { mode: "drilldown"; subcategoryId: string; subcategoryName: string; subcategoryTotal: number };

export function TierDoughnut({
  tier,
  tierTotal,
  subcategories,
  items,
  isSnapshot,
}: TierDoughnutProps) {
  const shouldReduce = useReducedMotion();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const [view, setView] = useState<ViewState>({ mode: "subcategory" });

  const sorted = useMemo(
    () => [...subcategories].sort((a, b) => b.monthlyTotal - a.monthlyTotal),
    [subcategories]
  );

  const colours = useMemo(() => generateTierColours(tier, sorted.length), [tier, sorted.length]);

  const arc = useMemo(
    () =>
      d3Arc<PieArcDatum<{ value: number }>>()
        .innerRadius(INNER_R)
        .outerRadius(OUTER_R)
        .padAngle(subcategories.length > 1 ? 0.02 : 0)
        .cornerRadius(2),
    [subcategories.length]
  );

  // Empty state
  if (subcategories.length === 0) {
    return (
      <div className="flex items-center gap-4">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle
            cx={CENTRE}
            cy={CENTRE}
            r={(OUTER_R + INNER_R) / 2}
            fill="none"
            stroke="rgba(238,242,255,0.1)"
            strokeWidth={OUTER_R - INNER_R}
          />
          <text
            x={CENTRE}
            y={CENTRE}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(238,242,255,0.4)"
            fontSize="13"
            fontFamily="var(--font-body, 'Nunito Sans', sans-serif)"
          >
            No items
          </text>
        </svg>
      </div>
    );
  }

  if (view.mode === "drilldown") {
    const subItems = items
      .filter((it) => it.subcategoryId === view.subcategoryId)
      .sort((a, b) => b.amount - a.amount);

    const drillColours = generateTierColours(tier, subItems.length);
    const pieData = d3Pie<{ value: number }>()
      .sort(null)
      .value((d) => d.value)(subItems.map((it) => ({ value: it.amount })));

    const legendEntries = subItems.map((it, i) => ({
      colour: drillColours[i] ?? "#818cf8",
      label: it.name,
    }));

    return (
      <div className="flex items-center gap-4">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <g transform={`translate(${CENTRE},${CENTRE})`}>
            {pieData.map((d, i) => {
              const item = subItems[i]!;
              const colour = drillColours[i] ?? "#818cf8";
              return (
                <motion.path
                  key={item.id}
                  d={arc(d) ?? ""}
                  fill={colour}
                  initial={shouldReduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                />
              );
            })}
          </g>
          <text
            x={CENTRE}
            y={CENTRE}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(238,242,255,0.92)"
            fontSize="16"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight={500}
          >
            {formatCurrency(view.subcategoryTotal, showPence)}
          </text>
        </svg>
        <div className="flex flex-col gap-2">
          <DoughnutLegend entries={legendEntries} />
          <button
            type="button"
            onClick={() => setView({ mode: "subcategory" })}
            className="text-xs mt-1 self-start rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            style={{ color: "rgba(238,242,255,0.5)" }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Subcategory view
  const pieData = d3Pie<{ value: number }>()
    .sort(null)
    .value((d) => d.value)(sorted.map((s) => ({ value: s.monthlyTotal })));

  const legendEntries = sorted.map((s, i) => ({
    colour: colours[i] ?? "#818cf8",
    label: s.name,
  }));

  return (
    <div className="flex items-center gap-4">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <g transform={`translate(${CENTRE},${CENTRE})`}>
          {pieData.map((d, i) => {
            const sub = sorted[i]!;
            const colour = colours[i] ?? "#818cf8";
            const pathD = arc(d) ?? "";

            if (isSnapshot) {
              return <path key={sub.id} d={pathD} fill={colour} />;
            }

            return (
              <motion.path
                key={sub.id}
                role="button"
                aria-label={`${sub.name}: ${formatCurrency(sub.monthlyTotal, showPence)}`}
                tabIndex={0}
                d={pathD}
                fill={colour}
                style={{ cursor: "pointer" }}
                whileHover={{ scale: 1.04 }}
                onClick={() =>
                  setView({
                    mode: "drilldown",
                    subcategoryId: sub.id,
                    subcategoryName: sub.name,
                    subcategoryTotal: sub.monthlyTotal,
                  })
                }
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setView({
                      mode: "drilldown",
                      subcategoryId: sub.id,
                      subcategoryName: sub.name,
                      subcategoryTotal: sub.monthlyTotal,
                    });
                  }
                }}
                initial={shouldReduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, delay: i * 0.04, ease: [0.25, 1, 0.5, 1] }}
              />
            );
          })}
        </g>
        <text
          x={CENTRE}
          y={CENTRE}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(238,242,255,0.92)"
          fontSize="16"
          fontFamily="'JetBrains Mono', monospace"
          fontWeight={500}
        >
          {formatCurrency(tierTotal, showPence)}
        </text>
      </svg>
      <DoughnutLegend entries={legendEntries} />
    </div>
  );
}
