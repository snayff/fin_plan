import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { usePrefersReducedMotion } from "@/utils/motion";
import type { CashflowEvent, CashflowMonthDetail } from "@finplan/shared";
import { CashflowEventList } from "./CashflowEventList";

interface CashflowMonthViewProps {
  detail: CashflowMonthDetail;
  amberMonths: Set<number>;
  windowStart: { year: number; month: number };
  windowEnd: { year: number; month: number };
  onBack: () => void;
  onSelectMonth: (month: number) => void;
}

const STRIP = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const FULL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKey(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function CashflowMonthView({
  detail,
  amberMonths,
  windowStart,
  windowEnd,
  onBack,
  onSelectMonth,
}: CashflowMonthViewProps) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const monthLabel = format(new Date(detail.year, detail.month - 1, 1), "MMMM yyyy");
  const openingDateLabel = format(new Date(detail.year, detail.month - 1, 1), "d MMM yyyy");
  const startKey = monthKey(windowStart.year, windowStart.month);
  const endKey = monthKey(windowEnd.year, windowEnd.month);

  const today = new Date();
  const isCurrentMonth =
    detail.year === today.getFullYear() && detail.month === today.getMonth() + 1;
  const todayDay = isCurrentMonth ? today.getDate() : null;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-page-accent rounded px-1"
      >
        ← Cashflow / <span className="text-foreground font-medium">{monthLabel}</span>
      </button>

      <div className="flex items-center gap-1">
        {STRIP.map((letter, idx) => {
          const m = idx + 1;
          const active = m === detail.month;
          const amber = amberMonths.has(m);
          const letterKey = monthKey(detail.year, m);
          const inWindow = letterKey >= startKey && letterKey <= endKey;
          return (
            <button
              key={`${letter}-${idx}`}
              type="button"
              onClick={inWindow ? () => onSelectMonth(m) : undefined}
              disabled={!inWindow}
              aria-disabled={!inWindow}
              aria-label={FULL[idx]}
              aria-current={active ? "true" : undefined}
              title={inWindow ? undefined : "Outside the 24-month projection window"}
              className={cn(
                "w-7 h-7 rounded text-[10px] font-heading uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-page-accent",
                !inWindow && "opacity-30 cursor-not-allowed",
                inWindow && active && "bg-page-accent text-background",
                inWindow && !active && amber && "bg-attention/20 text-attention",
                inWindow && !active && !amber && "text-text-tertiary hover:text-foreground"
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Opening balance"
          value={formatCurrency(detail.startingBalance, showPence)}
          sub={openingDateLabel}
        />
        <StatCard label="End balance" value={formatCurrency(detail.endBalance, showPence)} />
        <StatCard
          label="Tightest point"
          value={formatCurrency(detail.tightestPoint.value, showPence)}
          amber={detail.tightestPoint.value < 0}
        />
        <StatCard label="Net change" value={formatCurrency(detail.netChange, showPence)} />
      </div>

      <CashflowMonthChart detail={detail} todayDay={todayDay} />

      <div className="flex items-center justify-between px-2 py-2 text-xs border-b border-border">
        <span className="text-text-tertiary">Discretionary · amortised evenly across month</span>
        <span className="font-numeric text-text-secondary">
          {formatCurrency(detail.monthlyDiscretionaryTotal, showPence)}/mo
        </span>
      </div>

      <CashflowEventList events={detail.events} />
    </div>
  );
}

function StatCard({
  label,
  value,
  amber,
  sub,
}: {
  label: string;
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

interface ChartPoint {
  day: number;
  balance: number;
  eventBalance: number | null;
}

function CashflowMonthChart({
  detail,
  todayDay,
}: {
  detail: CashflowMonthDetail;
  todayDay: number | null;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;

  if (detail.dailyTrace.length === 0) return null;

  const eventsByDay = new Map<number, CashflowEvent[]>();
  for (const ev of detail.events) {
    const day = parseInt(ev.date.slice(8, 10), 10);
    const list = eventsByDay.get(day) ?? [];
    list.push(ev);
    eventsByDay.set(day, list);
  }

  const chartData: ChartPoint[] = [
    { day: 0, balance: detail.startingBalance, eventBalance: null },
    ...detail.dailyTrace.map((p) => ({
      day: p.day,
      balance: p.balance,
      eventBalance: eventsByDay.has(p.day) ? p.balance : null,
    })),
  ];

  const lastDay = detail.dailyTrace[detail.dailyTrace.length - 1]!.day;
  const showZeroBaseline = detail.tightestPoint.value < 0;

  const baseTicks = [1, 5, 10, 15, 20, 25];
  const ticks = Array.from(new Set([...baseTicks.filter((t) => t < lastDay), lastDay]));

  return (
    <div
      className="rounded-md border border-border bg-card p-4 h-56"
      role="img"
      aria-label="Daily projected balance trace. Detailed values are listed in the events below."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, lastDay]}
            ticks={ticks}
            tick={{ fontSize: 11, fill: "rgba(238,242,255,0.4)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v, showPence)}
            tick={{ fontSize: 11, fill: "rgba(238,242,255,0.4)" }}
            tickLine={false}
            axisLine={false}
            width={64}
            domain={
              showZeroBaseline
                ? [(min: number) => Math.min(min, 0), (max: number) => Math.max(max, 0)]
                : ["auto", "auto"]
            }
          />
          {showZeroBaseline && (
            <ReferenceLine
              y={0}
              stroke="hsl(var(--attention))"
              strokeOpacity={0.4}
              strokeDasharray="2 2"
            />
          )}
          {todayDay !== null && (
            <ReferenceLine
              x={todayDay}
              stroke="hsl(var(--attention))"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={({ viewBox }) => {
                const { x } = viewBox as { x: number };
                return (
                  <text x={x} y={12} textAnchor="middle" fill="hsl(var(--attention))" fontSize={11}>
                    today
                  </text>
                );
              }}
            />
          )}
          <Tooltip
            cursor={{ stroke: "rgba(238,242,255,0.15)", strokeWidth: 1 }}
            content={(props) => {
              if (!props.active || !props.payload || props.payload.length === 0) return null;
              const point = props.payload[0]?.payload as ChartPoint | undefined;
              if (!point) return null;
              return (
                <CashflowChartTooltip
                  point={point}
                  year={detail.year}
                  month={detail.month}
                  eventsByDay={eventsByDay}
                />
              );
            }}
          />
          <Line
            type="stepAfter"
            dataKey="balance"
            stroke="hsl(var(--page-accent))"
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              fill: "hsl(var(--page-accent))",
              stroke: "hsl(var(--background))",
              strokeWidth: 2,
            }}
            isAnimationActive={!prefersReducedMotion}
          />
          <Line
            type="stepAfter"
            dataKey="eventBalance"
            stroke="transparent"
            connectNulls={false}
            dot={{
              r: 3,
              fill: "hsl(var(--page-accent))",
              stroke: "hsl(var(--background))",
              strokeWidth: 1,
            }}
            activeDot={false}
            isAnimationActive={!prefersReducedMotion}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CashflowChartTooltipProps {
  point: ChartPoint;
  year: number;
  month: number;
  eventsByDay: Map<number, CashflowEvent[]>;
}

function CashflowChartTooltip({ point, year, month, eventsByDay }: CashflowChartTooltipProps) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const label =
    point.day === 0
      ? `${format(new Date(year, month - 1, 1), "d MMM")} · start`
      : format(new Date(year, month - 1, point.day), "d MMM");
  const dayEvents = eventsByDay.get(point.day) ?? [];

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg min-w-[140px]">
      <div className="label-chart">{label}</div>
      <div className="font-numeric text-foreground mt-1">
        {formatCurrency(point.balance, showPence)}
      </div>
      {dayEvents.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-border pt-2">
          {dayEvents.map((ev, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="text-text-tertiary">{ev.label}</span>
              <span className="font-numeric text-foreground">
                {ev.amount >= 0 ? "+" : ""}
                {formatCurrency(ev.amount, showPence)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
