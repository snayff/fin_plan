import { describe, it, expect, mock } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/helpers/render";
import { HouseholdSwitcher } from "./HouseholdSwitcher";

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector({
    user: { id: "u1", activeHouseholdId: "h1", name: "Josh", email: "j@example.com" },
    accessToken: "token",
    setUser: () => {},
  });
}
// Stub setState so the global afterEach teardown in setup.ts doesn't throw
useAuthStoreMock.setState = () => {};

mock.module("@/stores/authStore", () => ({ useAuthStore: useAuthStoreMock }));

mock.module("@/services/household.service", () => ({
  householdService: {
    getHouseholds: async () => ({
      households: [
        { household: { id: "h1", name: "Snaith" } },
        { household: { id: "h2", name: "Parents" } },
      ],
    }),
    switchHousehold: async () => ({}),
    createHousehold: async () => ({}),
  },
}));

describe("HouseholdSwitcher dropdown", () => {
  it("shows two groups with correct entries when open", async () => {
    renderWithProviders(<HouseholdSwitcher />);
    // Wait for the query to resolve and button to show the active household name
    const trigger = await screen.findByRole("button", { name: /snaith/i });
    fireEvent.click(trigger);
    // Group 1 header
    expect(await screen.findByText(/switch household/i)).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^snaith/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^parents/i })).toBeTruthy();
    // Group 2 actions
    expect(screen.getByRole("menuitem", { name: /household settings/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /create new household/i })).toBeTruthy();
  });

  it("menu is anchored right-0 to prevent viewport overflow", async () => {
    renderWithProviders(<HouseholdSwitcher />);
    // Wait for the query to resolve and button to show the active household name
    const trigger = await screen.findByRole("button", { name: /snaith/i });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(menu.className).toContain("right-0");
  });

  it("drops cached query data from the previous household when switching", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(["accounts"], [{ id: "ac1", name: "Old account" }]);
    qc.setQueryData(["waterfall", "summary"], { surplus: 100 });

    renderWithProviders(<HouseholdSwitcher />, { queryClient: qc });
    const trigger = await screen.findByRole("button", { name: /snaith/i });
    fireEvent.click(trigger);
    const item = await screen.findByRole("menuitem", { name: /^parents/i });
    fireEvent.click(item);

    await waitFor(() => {
      expect(qc.getQueryData(["accounts"])).toBeUndefined();
      expect(qc.getQueryData(["waterfall", "summary"])).toBeUndefined();
    });
  });
});
