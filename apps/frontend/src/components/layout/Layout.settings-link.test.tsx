import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import Layout from "./Layout";

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector({
    user: { id: "u1", activeHouseholdId: "h1", name: "Jane Smith", email: "jane@example.com" },
    accessToken: "t",
    setUser: () => {},
    logout: async () => {},
  });
}
// Stub setState so the global afterEach teardown in setup.ts doesn't throw
useAuthStoreMock.setState = () => {};

mock.module("@/stores/authStore", () => ({ useAuthStore: useAuthStoreMock }));

mock.module("@/services/household.service", () => ({
  householdService: { getHouseholds: async () => ({ households: [] }) },
}));

describe("Layout top nav", () => {
  it("does not render a Settings nav link", () => {
    renderWithProviders(
      <Layout>
        <p>content</p>
      </Layout>
    );
    const link = screen.queryByRole("link", { name: "Settings" });
    expect(link).toBeNull();
  });

  it("renders the ProfileAvatar", () => {
    renderWithProviders(
      <Layout>
        <p>content</p>
      </Layout>
    );
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeTruthy();
  });
});
