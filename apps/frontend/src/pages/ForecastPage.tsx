import { useState } from "react";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import {
  ForecastSectionNavigator,
  type ForecastSection,
} from "@/components/forecast/ForecastSectionNavigator";
import { GrowthSectionPanel } from "@/components/forecast/GrowthSectionPanel";
import { CashflowSectionPanel } from "@/components/forecast/cashflow/CashflowSectionPanel";

export default function ForecastPage() {
  const [section, setSection] = useState<ForecastSection>("cashflow");

  const left = (
    <div className="flex flex-col h-full">
      <PageHeader title="Forecast" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ForecastSectionNavigator selected={section} onSelect={setSection} />
      </div>
    </div>
  );

  const right = section === "cashflow" ? <CashflowSectionPanel /> : <GrowthSectionPanel />;

  return (
    <div data-page="forecast" className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <TwoPanelLayout left={left} right={right} />
      </div>
    </div>
  );
}
