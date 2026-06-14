import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { SettingsRightPanel } from "./SettingsRightPanel";
import { SettingsSection } from "./SettingsSection";

describe("SettingsRightPanel", () => {
  it("renders sticky header with title", () => {
    renderWithProviders(
      <SettingsRightPanel title="Profile" activeId="account" onActiveChange={() => {}}>
        <SettingsSection id="account" title="Account">
          content
        </SettingsSection>
      </SettingsRightPanel>
    );
    const header = screen.getByRole("heading", { level: 2 });
    expect(header.textContent).toBe("Profile");
    expect(header.closest(".sticky")).toBeTruthy();
  });

  it("renders children inside the scrolling body", () => {
    renderWithProviders(
      <SettingsRightPanel title="Profile" activeId="account" onActiveChange={() => {}}>
        <SettingsSection id="account" title="Account">
          content A
        </SettingsSection>
        <SettingsSection id="display" title="Display">
          content B
        </SettingsSection>
      </SettingsRightPanel>
    );
    expect(screen.getByText("content A")).toBeTruthy();
    expect(screen.getByText("content B")).toBeTruthy();
  });

  it("exposes a scrollToSection method via ref", () => {
    const ref = { current: null as any };
    const onActiveChange = mock(() => {});
    renderWithProviders(
      <SettingsRightPanel
        ref={ref}
        title="Profile"
        activeId="account"
        onActiveChange={onActiveChange}
      >
        <SettingsSection id="account" title="Account">
          A
        </SettingsSection>
        <SettingsSection id="display" title="Display">
          B
        </SettingsSection>
      </SettingsRightPanel>
    );
    expect(typeof ref.current?.scrollToSection).toBe("function");
  });
});
