import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { usePrefersReducedMotion } from "@/utils/motion";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import type { NetWorthPoint } from "@finplan/shared";

interface RetirementMarker {
  year: number;
  name: string;
  beyondHorizon?: boolean;
}

interface NetWorthChartProps {
  data: NetWorthPoint[];
  retirementMarkers: RetirementMarker[];
  monthlyContributions?: number;
}

export function NetWorthChart({
  data,
  retirementMarkers,
  monthlyContributions,
}: NetWorthChartProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const isEmpty = data.length === 0 || data.every((d) => d.nominal === 0);
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <div className="bg-surface border border-surface-elevated rounded-xl overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <span className="label-chart">Net Worth (excl. pensions)</span>
      </div>

      {isEmpty ? (
        <div className="h-48 flex items-center justify-center px-6">
          <p className="text-sm text-text-tertiary text-center">
            Add assets in the Assets section to see your projection
          </p>
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="nominalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="realGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "rgba(238,242,255,0.4)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `£${Math.round(v / 1000)}k`}
                tick={{ fontSize: 11, fill: "rgba(238,242,255,0.4)" }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value, showPence),
                  name === "nominal" ? "Ignoring Inflation" : "Real Terms",
                ]}
                contentStyle={{
                  background: "#141b2e",
                  border: "1px solid #222c45",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {retirementMarkers.map((m) => (
                <ReferenceLine
                  key={`${m.year}-${m.name}`}
                  x={m.year}
                  stroke="#8b5cf6"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: m.beyondHorizon ? `${m.name} →` : m.name,
                    position: "top",
                    fontSize: 11,
                    fill: "#8b5cf6",
                  }}
                />
              ))}
              <Area
                type="monotone"
                dataKey="nominal"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#nominalGrad)"
                dot={false}
                isAnimationActive={!prefersReducedMotion}
              />
              <Area
                type="monotone"
                dataKey="real"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="url(#realGrad)"
                dot={false}
                isAnimationActive={!prefersReducedMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stat row */}
      {!isEmpty && first && last && (
        <div className="px-5 py-3 border-t border-surface-elevated flex items-center gap-6">
          <div>
            <span className="text-xs text-text-tertiary">Today</span>
            <p className="font-numeric text-sm text-text-primary tabular-nums">
              {formatCurrency(first.nominal, showPence)}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary">Ignoring Inflation ({last.year})</span>
            <p className="font-numeric text-sm text-page-accent tabular-nums">
              {formatCurrency(last.nominal, showPence)}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary">
              <GlossaryTermMarker entryId="real-terms">Real Terms</GlossaryTermMarker> ({last.year})
            </span>
            <p className="font-numeric text-sm text-text-secondary tabular-nums">
              {formatCurrency(last.real, showPence)}
            </p>
          </div>
          {monthlyContributions != null && monthlyContributions > 0 && (
            <div className="ml-auto">
              <span className="text-xs text-text-tertiary">Contributions</span>
              <p className="font-numeric text-sm text-page-accent/80 tabular-nums">
                +{formatCurrency(monthlyContributions, showPence)}/mo
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
