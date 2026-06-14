import { PageHeader } from "@/components/common/PageHeader";
import { GiftsBudgetSummary } from "./GiftsBudgetSummary";
import type { GiftBudgetSummary } from "@finplan/shared";

export type GiftsMode = "gifts" | "upcoming" | "config";

type Props = {
  mode: GiftsMode;
  onModeChange: (mode: GiftsMode) => void;
  budget: GiftBudgetSummary;
  readOnly: boolean;
};

const TABS: { id: GiftsMode; label: string }[] = [
  { id: "gifts", label: "Gifts" },
  { id: "upcoming", label: "Upcoming" },
  { id: "config", label: "Config" },
];

export function GiftsLeftAside({ mode, onModeChange, budget, readOnly }: Props) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Gifts" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <GiftsBudgetSummary budget={budget} readOnly={readOnly} />
        <nav aria-label="Gift modes" className="mt-2 flex flex-col">
          {TABS.map((tab) => {
            const isActive = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-active={isActive}
                aria-current={isActive || undefined}
                onClick={() => onModeChange(tab.id)}
                className={[
                  "relative flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors",
                  isActive
                    ? "font-medium text-tier-discretionary"
                    : "text-foreground/60 hover:bg-tier-discretionary/5",
                ].join(" ")}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-tier-discretionary/14 border-l-2 border-tier-discretionary rounded-r-sm" />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
