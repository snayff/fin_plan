import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { ProfileSection } from "./ProfileSection";

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector({
    user: { id: "u1", name: "Jane Smith", email: "jane@example.com", activeHouseholdId: "h1" },
    accessToken: "t",
    setUser: () => {},
  });
}
// Stub setState so the global afterEach teardown in setup.ts doesn't throw
useAuthStoreMock.setState = () => {};

mock.module("@/stores/authStore", () => ({ useAuthStore: useAuthStoreMock }));

mock.module("@/services/auth.service", () => ({
  authService: { updateProfile: async () => ({ user: { name: "New" } }) },
}));

describe("ProfileSection", () => {
  it("renders without a Save button (auto-save)", () => {
    renderWithProviders(<ProfileSection />);
    const save = screen.queryByRole("button", { name: /^save$/i });
    expect(save).toBeNull();
  });

  it("wraps the name input in an AutoSaveField", () => {
    const { container } = renderWithProviders(<ProfileSection />);
    const field = container.querySelector(".autosave-field");
    expect(field).toBeTruthy();
  });
});
