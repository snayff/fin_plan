import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { MobileUnsupportedNotice } from "@/components/common/MobileUnsupportedNotice";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * Planned-feature state for Goals. The feature is not yet built, so this page
 * intentionally communicates what Goals will do rather than rendering a
 * dead-end. It still conforms to the standard TwoPanelLayout + PageHeader
 * anatomy so navigation and layout behave like every other page.
 */

const PLANNED_CAPABILITIES: Array<{ title: string; description: string }> = [
  {
    title: "Set targets",
    description: "Name a goal and the amount you want to reach — an emergency fund, a deposit, a trip.",
  },
  {
    title: "Fund from surplus",
    description: "Direct part of your monthly surplus toward each goal so progress follows the waterfall.",
  },
  {
    title: "Track progress",
    description: "See how close each goal is and when, at your current rate, you can expect to reach it.",
  },
];

export default function GoalsPage() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileUnsupportedNotice pageName="Goals" />;
  return (
    <div data-page="goals" data-testid="goals-page" className="relative h-full">
      <TwoPanelLayout
        left={
          <div className="flex flex-col h-full">
            <PageHeader title="Goals" />
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="flex flex-col gap-4 px-4 pb-4">
                <p className="text-xs text-foreground/50">
                  Goals let you turn surplus into progress toward the things you are saving for.
                  This area is planned and not yet available.
                </p>
                <div className="flex flex-col divide-y divide-foreground/[0.07]">
                  {PLANNED_CAPABILITIES.map((cap) => (
                    <div key={cap.title} className="flex flex-col gap-1 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                        {cap.title}
                      </span>
                      <span className="text-[11px] text-foreground/50">{cap.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        }
        right={
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="rounded-full border border-foreground/15 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-foreground/50">
              Planned
            </span>
            <p className="text-sm font-medium text-foreground/60">Goals are on the way</p>
            <p className="max-w-xs text-xs text-foreground/40">
              You will be able to set savings targets, fund them from your monthly surplus, and
              track how close each one is. Nothing to set up yet — check back in a future update.
            </p>
          </div>
        }
      />
    </div>
  );
}
