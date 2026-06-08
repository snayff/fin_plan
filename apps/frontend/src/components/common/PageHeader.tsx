import { toGBP } from "@finplan/shared";
import { AnimatedCurrency } from "@/components/common/AnimatedCurrency";

interface PageHeaderProps {
  title: string;
  colorClass?: string;
  total?: number | null;
  totalColorClass?: string;
  contextName?: string;
}

export function PageHeader({
  title,
  colorClass = "text-page-accent",
  total,
  totalColorClass,
  contextName,
}: PageHeaderProps) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between">
        <h1 className={`font-heading text-lg font-bold uppercase tracking-tier ${colorClass}`}>
          {title}
          {contextName && (
            <>
              <span className="font-normal text-foreground/25 mx-1.5">/</span>
              <span className="font-body text-xs font-normal normal-case tracking-normal text-foreground/45">
                {contextName}
              </span>
            </>
          )}
        </h1>
        {total != null && (
          <span className={`font-numeric text-lg font-semibold ${totalColorClass ?? colorClass}`}>
            <AnimatedCurrency value={toGBP(total)} />
          </span>
        )}
      </div>
    </div>
  );
}
