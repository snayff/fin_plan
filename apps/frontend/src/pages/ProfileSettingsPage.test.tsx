import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import ProfileSettingsPage from "./ProfileSettingsPage";

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

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({
    data: { showPence: false },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  useUpdateSettings: () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false }),
  useSecurityActivity: () => ({
    data: { pages: [{ entries: [], nextCursor: null }] },
    isLoading: false,
    isError: false,
    fetchNextPage: () => {},
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

mock.module("@/services/auth.service", () => ({
  authService: { updateProfile: async () => ({ user: { name: "Jane Smith" } }) },
}));

describe("ProfileSettingsPage", () => {
  it("renders Profile title and two nav items", () => {
    renderWithProviders(<ProfileSettingsPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Profile");
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Display" })).toBeTruthy();
  });

  it("renders Account and Display sections in the right panel", () => {
    renderWithProviders(<ProfileSettingsPage />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    const titles = headings.map((h) => h.textContent);
    expect(titles).toContain("Account");
    expect(titles).toContain("Display");
  });

  it("renders Security activity nav item and section", () => {
    renderWithProviders(<ProfileSettingsPage />);
    expect(screen.getByRole("button", { name: "Security activity" })).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 3 });
    const titles = headings.map((h) => h.textContent);
    expect(titles).toContain("Security activity");
  });
});
