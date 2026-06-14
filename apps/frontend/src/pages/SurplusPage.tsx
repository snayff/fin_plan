import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { useWaterfallSummary } from "@/hooks/useWaterfall";
import { useSettings } from "@/hooks/useSettings";
import { toGBP } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";

export default function SurplusPage() {
  const { data, isLoading } = useWaterfallSummary();
  const { data: settings } = useSettings();
  const benchmarkPct = settings?.surplusBenchmarkPct ?? 10;
  const showPence = settings?.showPence ?? false;

  const income = data?.income.total ?? 0;
  const committed = (data?.committed.monthlyTotal ?? 0) + (data?.committed.monthlyAvg12 ?? 0);
  const discretionary = data?.discretionary.total ?? 0;
  const surplus = data?.surplus.amount ?? income - committed - discretionary;
  const surplusPct = data?.surplus.percentOfIncome ?? (income > 0 ? (surplus / income) * 100 : 0);
  const showBenchmarkWarning = !isLoading && income > 0 && surplusPct < benchmarkPct;

  return (
    <div data-page="surplus" data-testid="surplus-page" className="h-full">
      <TwoPanelLayout
        left={
          <div className="flex flex-col h-full">
            <PageHeader
              title="Surplus"
              colorClass="text-tier-surplus"
              total={!isLoading ? surplus : null}
              totalColorClass="text-tier-surplus"
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="flex flex-col gap-6 px-4 pb-4">
                {!isLoading && (
                  <>
                    <div className="flex flex-col divide-y divide-foreground/[0.07]">
                      <div className="flex flex-col gap-1 py-3">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-tier-income">
                            Income
                          </span>
                          <span className="font-numeric text-[11px] font-medium text-tier-income">
                            {formatCurrency(toGBP(income), showPence)}
                          </span>
                        </div>
                        <div className="text-[11px] text-foreground/50">
                          Total monthly income across all members
                        </div>
                        <div className="flex justify-between items-baseline mt-0.5">
                          <span className="label-chart">Balance</span>
                          <span className="font-numeric text-[13px] font-semibold text-body-secondary">
                            {formatCurrency(toGBP(income), showPence)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 py-3">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-tier-committed">
                            Committed
                          </span>
                          <span className="font-numeric text-[11px] font-medium text-tier-committed">
                            − {formatCurrency(toGBP(committed), showPence)}
                          </span>
                        </div>
                        <div className="text-[11px] text-foreground/50">
                          Fixed obligations deducted from income
                        </div>
                        <div className="flex justify-between items-baseline mt-0.5">
                          <span className="label-chart">Remaining</span>
                          <span className="font-numeric text-[13px] font-semibold text-body-secondary">
                            {formatCurrency(toGBP(income - committed), showPence)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 py-3">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-tier-discretionary">
                            Discretionary
                          </span>
                          <span className="font-numeric text-[11px] font-medium text-tier-discretionary">
                            − {formatCurrency(toGBP(discretionary), showPence)}
                          </span>
                        </div>
                        <div className="text-[11px] text-foreground/50">
                          Planned variable spend deducted
                        </div>
                        <div className="flex justify-between items-baseline mt-0.5">
                          <span className="label-chart">Remaining</span>
                          <span className="font-numeric text-[13px] font-semibold text-body-secondary">
                            {formatCurrency(toGBP(surplus), showPence)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 py-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-tier-surplus">
                          Surplus
                        </span>
                        <div className="text-[11px] text-foreground/50">
                          What remains at the end of each month
                        </div>
                        <div className="flex justify-between items-baseline mt-0.5">
                          <span className="label-chart">Monthly</span>
                          <span className="font-numeric text-base font-semibold text-tier-surplus">
                            {formatCurrency(toGBP(surplus), showPence)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {showBenchmarkWarning && (
                      <div
                        data-testid="surplus-benchmark-warning"
                        className="flex items-start gap-2 rounded-lg border border-attention/20 bg-attention/5 p-3 text-xs text-attention"
                      >
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-attention" />
                        <span>
                          Your surplus is below your {benchmarkPct}%{" "}
                          <GlossaryTermMarker entryId="surplus-benchmark">
                            benchmark
                          </GlossaryTermMarker>
                          . A monthly surplus of around {benchmarkPct}% of income is a common
                          planning benchmark.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        }
        right={
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            {!isLoading && (
              <>
                <p className="text-sm text-foreground/50">
                  At the end of each month, you should have
                </p>
                <p className="font-numeric text-4xl font-bold text-tier-surplus">
                  {formatCurrency(toGBP(surplus), showPence)}
                </p>
                <p className="text-sm text-foreground/50">left over.</p>
                <p className="mt-1 text-xs text-foreground/30">
                  {surplusPct.toFixed(1)}%{" "}
                  <GlossaryTermMarker entryId="surplus-percentage">surplus rate</GlossaryTermMarker>
                </p>
              </>
            )}
          </div>
        }
      />
    </div>
  );
}
