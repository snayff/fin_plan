import { useCallback } from "react";
import { ChevronLeftIcon } from "lucide-react";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import {
  ForecastSectionNavigator,
  type ForecastSection,
} from "@/components/forecast/ForecastSectionNavigator";
import { GrowthSectionPanel } from "@/components/forecast/GrowthSectionPanel";
import { CashflowSectionPanel } from "@/components/forecast/cashflow/CashflowSectionPanel";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import { useIsMobile } from "@/hooks/useIsMobile";

const SECTIONS = ["cashflow", "growth"] as const;
const SECTION_LABELS: Record<ForecastSection, string> = {
  cashflow: "Cashflow",
  growth: "Growth",
};

export default function ForecastPage() {
  const validateSection = useCallback(
    (v: string) => (SECTIONS as readonly string[]).includes(v),
    []
  );
  const [urlSection, setSection, clearSection] = useUrlSelection({
    param: "section",
    validate: validateSection,
  });
  const isMobile = useIsMobile();

  // Desktop default: cashflow. Mobile default: null (show nav list only —
  // user picks Cashflow or Growth which push-navs into the right panel).
  const section: ForecastSection = (urlSection as ForecastSection) ?? "cashflow";

  const left = (
    <div className="flex h-full flex-col">
      <PageHeader title="Forecast" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ForecastSectionNavigator selected={section} onSelect={(s) => setSection(s)} />
      </div>
    </div>
  );

  const sectionBody = section === "cashflow" ? <CashflowSectionPanel /> : <GrowthSectionPanel />;

  // On mobile, wrap the section content with a back-chevron header that returns
  // to the section list (clears `?section=`). On desktop the section panels
  // render unchanged.
  const right = isMobile ? (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-foreground/5 px-4 py-3">
        <button
          type="button"
          onClick={clearSection}
          aria-label="Back to sections"
          className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground/70 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="font-heading text-base font-bold text-foreground">
          {SECTION_LABELS[section]}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{sectionBody}</div>
    </div>
  ) : (
    sectionBody
  );

  return (
    <div data-page="forecast" className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <TwoPanelLayout left={left} right={right} selectedKey={urlSection} />
      </div>
    </div>
  );
}
