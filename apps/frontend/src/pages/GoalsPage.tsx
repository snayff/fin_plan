import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";

export default function GoalsPage() {
  return (
    <div data-testid="goals-page" className="relative h-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 20% 20%, rgba(139,92,246,0.08) 0%, transparent 70%)",
        }}
      />
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
