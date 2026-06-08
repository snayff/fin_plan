import { toGBP } from "@finplan/shared";
import { ChevronLeftIcon } from "lucide-react";
import { AnimatedCurrency } from "@/components/common/AnimatedCurrency";
import { useIsMobile } from "@/hooks/useIsMobile";

interface PageHeaderProps {
  title: string;
  colorClass?: string;
  total?: number | null;
  totalColorClass?: string;
  contextName?: string;
  /**
   * Mobile-only back affordance. When supplied AND `useIsMobile()` is true,
   * a 44px chevron button renders to the left of the title; tapping calls
   * `onBack`. Desktop ignores the prop. Use this to clear right-panel
   * selection (typically via the `clear()` from `useUrlSelection`).
   * See docs/4. planning/mobile-accessibility/plan.md § Phase 2.
   */
  onBack?: () => void;
}

export function PageHeader({
  title,
  colorClass = "text-page-accent",
  total,
  totalColorClass,
  contextName,
  onBack,
}: PageHeaderProps) {
  const isMobile = useIsMobile();
  const showBack = isMobile && onBack != null;

  return (
    <div className="shrink-0 px-4 pb-3 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {showBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground/70 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <h1
            className={`truncate font-heading text-lg font-bold uppercase tracking-tier ${colorClass}`}
          >
            {title}
            {contextName && (
              <>
                <span className="mx-1.5 font-normal text-foreground/25">/</span>
                <span className="font-body text-xs font-normal normal-case tracking-normal text-foreground/45">
                  {contextName}
                </span>
              </>
            )}
          </h1>
        </div>
        {total != null && (
          <span
            className={`shrink-0 font-numeric text-lg font-semibold ${totalColorClass ?? colorClass}`}
          >
            <AnimatedCurrency value={toGBP(total)} />
          </span>
        )}
      </div>
    </div>
  );
}
