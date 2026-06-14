import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { MobileUnsupportedNotice } from "@/components/common/MobileUnsupportedNotice";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function GoalsPage() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileUnsupportedNotice pageName="Goals" />;
  return (
    <div data-page="goals" data-testid="goals-page" className="relative h-full">
      <TwoPanelLayout
        left={
          <div className="flex flex-col h-full">
            <PageHeader title="Goals" />
            <div className="flex-1 min-h-0 overflow-y-auto p-6" />
          </div>
        }
        right={
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-foreground/50">Coming soon</p>
            <p className="max-w-xs text-xs text-foreground/30">
              Goal planning and tracking will be available in a future update.
            </p>
          </div>
        }
      />
    </div>
  );
}
