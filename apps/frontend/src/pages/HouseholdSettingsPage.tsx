import { useMemo, useRef, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { SettingsLeftPanel, type SettingsNavItem } from "@/components/settings/SettingsLeftPanel";
import {
  SettingsRightPanel,
  type SettingsRightPanelHandle,
} from "@/components/settings/SettingsRightPanel";
import { HouseholdDetailsSection } from "@/components/settings/HouseholdDetailsSection";
import { HouseholdMembersSection } from "@/components/settings/HouseholdMembersSection";
import { SurplusSection } from "@/components/settings/SurplusSection";
import { IsaSection } from "@/components/settings/IsaSection";
import { StalenessSection } from "@/components/settings/StalenessSection";
import { GrowthRatesSection } from "@/components/settings/GrowthRatesSection";
import { SubcategoriesSection } from "@/components/settings/SubcategoriesSection";
import { DataSection } from "@/components/settings/DataSection";
import { AuditLogSection } from "@/components/settings/AuditLogSection";
import { RebuildWaterfallSection } from "@/components/settings/RebuildWaterfallSection";
import { useAuthStore } from "@/stores/authStore";
import { useHouseholdDetails } from "@/hooks/useSettings";

type Role = "owner" | "admin" | "member";

function useRole(): Role | null {
  const user = useAuthStore((s) => s.user);
  const { data } = useHouseholdDetails(user?.activeHouseholdId ?? "");
  const member = data?.household?.memberProfiles.find((m) => m.userId === user?.id);
  return (member?.role as Role | undefined) ?? null;
}

export default function HouseholdSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId;
  const role = useRole();
  const { data } = useHouseholdDetails(householdId ?? "");
  const householdName = data?.household?.name ?? "";

  const items = useMemo<SettingsNavItem[]>(() => {
    const base: SettingsNavItem[] = [
      { id: "details", label: "Details", group: "General" },
      { id: "members", label: "Members & invites", group: "General" },
      { id: "surplus", label: "Surplus benchmark", group: "Financial" },
      { id: "isa", label: "ISA settings", group: "Financial" },
      { id: "staleness", label: "Staleness thresholds", group: "Financial" },
    ];
    if (role === "owner" || role === "admin") {
      base.push({ id: "growth-rates", label: "Growth rates", group: "Financial" });
    }
    base.push({ id: "subcategories", label: "Subcategories", group: "Structure" });
    if (role === "owner") {
      base.push({ id: "data", label: "Data", group: "Advanced" });
      base.push({ id: "rebuild-waterfall", label: "Rebuild waterfall", group: "Advanced" });
    }
    if (role === "owner" || role === "admin") {
      base.push({ id: "audit-log", label: "Audit log", group: "Advanced" });
    }
    return base;
  }, [role]);

  const [activeId, setActiveId] = useState<string>("details");
  const rightRef = useRef<SettingsRightPanelHandle | null>(null);
  const handleNavClick = useCallback((id: string) => {
    setActiveId(id);
    rightRef.current?.scrollToSection(id);
  }, []);

  if (!householdId) return <Navigate to="/settings/profile" replace />;

  return (
    <div data-page="settings" className="relative flex h-full overflow-hidden">
      <SettingsLeftPanel
        title="Household"
        contextName={householdName}
        activeId={activeId}
        items={items}
        onNavClick={handleNavClick}
      />
      <SettingsRightPanel
        ref={rightRef}
        title="Household"
        activeId={activeId}
        onActiveChange={setActiveId}
      >
        <HouseholdDetailsSection />
        <HouseholdMembersSection />
        <SurplusSection />
        <IsaSection />
        <StalenessSection />
        {(role === "owner" || role === "admin") && <GrowthRatesSection />}
        <SubcategoriesSection />
        {role === "owner" && <DataSection />}
        {role === "owner" && <RebuildWaterfallSection />}
        {(role === "owner" || role === "admin") && <AuditLogSection />}
      </SettingsRightPanel>
    </div>
  );
}
