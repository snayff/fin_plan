import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";

let currentRole: "owner" | "admin" | "member" = "admin";

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector({ user: { id: "me", activeHouseholdId: "h1" } });
}
useAuthStoreMock.setState = () => {};
mock.module("@/stores/authStore", () => ({ useAuthStore: useAuthStoreMock }));

mock.module("@/hooks/useSettings", () => ({
  useHouseholdDetails: () => ({
    data: {
      household: {
        name: "Test Household",
        memberProfiles: [{ id: "m1", userId: "me", role: currentRole, name: "Me" }],
        invites: [],
      },
    },
  }),
  useRenameHousehold: () => ({ mutateAsync: mock(async () => {}) }),
}));

import { HouseholdDetailsSection } from "./HouseholdDetailsSection";

describe("HouseholdDetailsSection", () => {
  it("lets an admin edit the household name", () => {
    currentRole = "admin";
    renderWithProviders(<HouseholdDetailsSection />);
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("shows a read-only name to a plain member", () => {
    currentRole = "member";
    renderWithProviders(<HouseholdDetailsSection />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
