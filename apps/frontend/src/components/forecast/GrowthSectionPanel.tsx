import { useState } from "react";
import type { ForecastHorizon } from "@finplan/shared";
import { TimeHorizonSelector } from "@/components/forecast/TimeHorizonSelector";
import { NetWorthChart } from "@/components/forecast/NetWorthChart";
import { SurplusAccumulationChart } from "@/components/forecast/SurplusAccumulationChart";
import { AccountAccumulationChart } from "@/components/forecast/AccountAccumulationChart";
import { RetirementSummary } from "@/components/forecast/RetirementSummary";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import { useForecast } from "@/hooks/useForecast";

const CHART_SKELETON = (
  <div className="bg-card border border-border rounded-xl h-48 animate-pulse" />
);

const CHART_ERROR = (
  <div className="bg-card border border-border rounded-xl h-48 flex items-center justify-center">
    <p className="text-sm text-text-tertiary">Could not load forecast — try refreshing</p>
  </div>
);

export function GrowthSectionPanel() {
  const [horizon, setHorizon] = useState<ForecastHorizon>(10);
  const { data, isLoading, isError } = useForecast(horizon);

  const currentYear = new Date().getFullYear();
  const horizonEndYear = currentYear + horizon;

  const retirementMarkers = (data?.retirement ?? [])
    .filter((m) => m.retirementYear != null && m.retirementYear >= currentYear)
    .map((m) => ({
      year: Math.min(m.retirementYear!, horizonEndYear),
      name: m.memberName,
      beyondHorizon: m.retirementYear! > horizonEndYear,
    }));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5">
        <h2 className="font-heading text-base font-bold text-foreground">Growth</h2>
        <TimeHorizonSelector value={horizon} onChange={setHorizon} />
      </div>
      <div className="flex flex-col gap-4 p-4">
        {isLoading ? (
          CHART_SKELETON
        ) : isError ? (
          CHART_ERROR
        ) : (
          <NetWorthChart
            data={data?.netWorth ?? []}
            retirementMarkers={retirementMarkers}
            monthlyContributions={data?.monthlyContributionsByScope?.netWorth}
          />
        )}

        <div className="grid grid-cols-3 gap-4">
          {isLoading ? (
            <>
              {CHART_SKELETON}
              {CHART_SKELETON}
              {CHART_SKELETON}
            </>
          ) : isError ? (
            <>
              {CHART_ERROR}
              {CHART_ERROR}
              {CHART_ERROR}
            </>
          ) : (
            <>
              <SurplusAccumulationChart data={data?.surplus ?? []} />
              <AccountAccumulationChart
                label="Savings Accumulation"
                data={data?.savings ?? []}
                monthlyContributions={data?.monthlyContributionsByScope?.savings}
                accent={{ stroke: "#6366f1", gradId: "savingsGrad" }}
                emptyMessage={
                  <>
                    Add a savings account to see your{" "}
                    <GlossaryTermMarker entryId="projection">projection</GlossaryTermMarker>
                  </>
                }
              />
              <AccountAccumulationChart
                label="Stocks & Shares Accumulation"
                data={data?.stocksAndShares ?? []}
                monthlyContributions={data?.monthlyContributionsByScope?.stocksAndShares}
                accent={{ stroke: "#0ea5e9", gradId: "ssGrad" }}
                emptyMessage="Add a stocks & shares account to see your projection"
              />
            </>
          )}
        </div>

        {isLoading ? (
          CHART_SKELETON
        ) : isError ? (
          CHART_ERROR
        ) : (
          <RetirementSummary members={data?.retirement ?? []} horizonEndYear={horizonEndYear} />
        )}
      </div>
    </div>
  );
}
