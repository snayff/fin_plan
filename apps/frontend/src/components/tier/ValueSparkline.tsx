import { useMemo } from "react";
import { SummarySparkline } from "@/components/overview/SummarySparkline";
import { buildChartData } from "./buildValueChartData";

interface Period {
  id: string;
  startDate: Date;
  endDate: Date | null;
  amount: number;
}

interface Props {
  periods: Period[];
  color: string;
  now?: Date;
}

export default function ValueSparkline({ periods, color, now = new Date() }: Props) {
  const chartData = useMemo(() => buildChartData(periods, now), [periods, now]);

  const currentValue = periods[periods.length - 1]?.amount ?? 0;

  return (
    <div className="mt-3">
      <span className="block label-chart mb-1.5">Value History</span>
      <SummarySparkline data={chartData} color={color} currentValue={currentValue} />
    </div>
  );
}
