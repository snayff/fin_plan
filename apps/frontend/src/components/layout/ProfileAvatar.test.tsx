import { describe, it, expect, mock } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { ProfileAvatar } from "./ProfileAvatar";

const mockState = {
  user: { name: "Josh Snaith", email: "snaith2@gmail.com", id: "u1", activeHouseholdId: "h1" },
  logout: async () => {},
};

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector(mockState);
}
// Stub setState so the global afterEach teardown in setup.ts doesn't throw
useAuthStoreMock.setState = () => {};

const mockAuth = { useAuthStore: useAuthStoreMock };

mock.module("@/stores/authStore", () => mockAuth);

describe("ProfileAvatar", () => {
  it("renders initials from user name", () => {
    renderWithProviders(<ProfileAvatar />);
    const trigger = screen.getByRole("button", { name: /profile menu/i });
    expect(trigger.textContent).toBe("JS");
  });

  it("includes the visible initials in its accessible name (WCAG 2.5.3 label in name)", () => {
    renderWithProviders(<ProfileAvatar />);
    const trigger = screen.getByRole("button", { name: /profile menu/i });
    const name = trigger.getAttribute("aria-label") ?? "";
    expect(name).toContain(trigger.textContent ?? "");
  });

  it("opens dropdown on click", () => {
    renderWithProviders(<ProfileAvatar />);
    fireEvent.click(screen.getByRole("button", { name: /profile menu/i }));
    expect(screen.getByText("Josh Snaith")).toBeTruthy();
    expect(screen.getByText("snaith2@gmail.com")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /profile settings/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeTruthy();
  });

  it("closes on Escape", () => {
    renderWithProviders(<ProfileAvatar />);
    fireEvent.click(screen.getByRole("button", { name: /profile menu/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Josh Snaith")).toBeNull();
  });

  it("dropdown is anchored right-0", () => {
    renderWithProviders(<ProfileAvatar />);
    fireEvent.click(screen.getByRole("button", { name: /profile menu/i }));
    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("right-0");
  });
});
