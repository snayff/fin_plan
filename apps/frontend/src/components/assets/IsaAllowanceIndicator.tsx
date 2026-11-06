import { useIsaAllowance } from "@/hooks/useIsaAllowance";
import { useSettings } from "@/hooks/useSettings";
import { IsaMemberBar } from "./IsaMemberBar";
import { NudgeCard } from "@/components/common/NudgeCard";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { PanelError } from "@/components/common/PanelError";
import { formatCurrency } from "@/utils/format";
import type { IsaMemberPosition } from "@finplan/shared";

export function IsaAllowanceIndicator() {
  const { data, isLoading, isError, refetch } = useIsaAllowance();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;

  if (isLoading) return <SkeletonLoader variant="right-panel" />;
  if (isError && !data) return <PanelError variant="right" onRetry={() => void refetch()} />;
  if (!data || data.byMember.length === 0) return null;

  const { byMember, annualLimit, daysRemaining, taxYearStart, taxYearEnd } = data;
  const startYear = taxYearStart.slice(0, 4);
  const endYear = taxYearEnd.slice(0, 4);
  const taxYearLabel = `${startYear}/${endYear.slice(-2)}`;
  const overForecastMembers = byMember.filter(
    (m) => m.used <= annualLimit && m.forecastedYearTotal > annualLimit
  );
  const mostOver: IsaMemberPosition | null = overForecastMembers.length
    ? overForecastMembers.reduce((best, m) =>
        m.forecastedYearTotal - annualLimit > best.forecastedYearTotal - annualLimit ? m : best
      )
    : null;
  const showName = byMember.length > 1;

  return (
    <div
      data-testid="isa-allowance-indicator"
      className="flex flex-col gap-2 px-4 pb-4 pt-2 border-t border-foreground/5"
    >
      <div className="label-chart">ISA allowance · {taxYearLabel} tax year</div>
      <div className="divide-y divide-foreground/[0.05]">
        {byMember.map((m) => (
          <IsaMemberBar
            key={m.memberId}
            pos={m}
            annualLimit={annualLimit}
            showName={showName}
            showPence={showPence}
          />
        ))}
      </div>
      <div className="label-chart text-center">Resets 6 April · {daysRemaining} days remaining</div>
      {mostOver && (
        <NudgeCard
          message={`${mostOver.name}'s planned contributions would reach ${formatCurrency(
            mostOver.forecastedYearTotal,
            showPence
          )} by 5 April — ${formatCurrency(
            mostOver.forecastedYearTotal - annualLimit,
            showPence
          )} over the ${formatCurrency(annualLimit, showPence)} limit.`}
        />
      )}
    </div>
  );
}
