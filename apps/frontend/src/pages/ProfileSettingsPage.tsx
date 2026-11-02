import { useRef, useState, useCallback } from "react";
import { SettingsLeftPanel, type SettingsNavItem } from "@/components/settings/SettingsLeftPanel";
import {
  SettingsRightPanel,
  type SettingsRightPanelHandle,
} from "@/components/settings/SettingsRightPanel";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { DisplaySection } from "@/components/settings/DisplaySection";
import { ChangePasswordSection } from "@/components/settings/ChangePasswordSection";
import { SecurityActivitySection } from "@/components/settings/SecurityActivitySection";
import { useIsMobile } from "@/hooks/useIsMobile";

const ITEMS: SettingsNavItem[] = [
  { id: "account", label: "Account" },
  { id: "display", label: "Display" },
  { id: "change-password", label: "Change password" },
  { id: "security-activity", label: "Security activity" },
];

export default function ProfileSettingsPage() {
  const isMobile = useIsMobile();
  const [activeId, setActiveId] = useState<string>(ITEMS[0]?.id ?? "account");
  const [mobileOpen, setMobileOpen] = useState(false);
  const rightRef = useRef<SettingsRightPanelHandle | null>(null);

  const handleNavClick = useCallback((id: string) => {
    setActiveId(id);
    setMobileOpen(true);
    rightRef.current?.scrollToSection(id);
  }, []);

  return (
    <div data-page="settings" className="relative h-full">
      <TwoPanelLayout
        rightFill
        selectedKey={isMobile && mobileOpen ? activeId : null}
        left={
          <SettingsLeftPanel
            title="Profile"
            subLabel="Your personal preferences"
            activeId={activeId}
            items={ITEMS}
            onNavClick={handleNavClick}
          />
        }
        right={
          <SettingsRightPanel
            ref={rightRef}
            title="Profile"
            activeId={activeId}
            onActiveChange={setActiveId}
            onMobileBack={isMobile ? () => setMobileOpen(false) : undefined}
          >
            <ProfileSection />
            <DisplaySection />
            <ChangePasswordSection />
            <SecurityActivitySection />
          </SettingsRightPanel>
        }
      />
    </div>
  );
}
