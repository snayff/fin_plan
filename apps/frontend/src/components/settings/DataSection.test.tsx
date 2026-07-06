import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector({ user: { activeHouseholdId: "h1" } });
}
useAuthStoreMock.setState = () => {};

mock.module("@/stores/authStore", () => ({ useAuthStore: useAuthStoreMock }));

const noopMutation = { mutate: () => {}, isPending: false };
mock.module("@/hooks/useExportImport", () => ({
  useExportHousehold: () => noopMutation,
  useImportHousehold: () => noopMutation,
  useValidateImport: () => noopMutation,
}));
mock.module("@/hooks/useSettings", () => ({
  useDeleteHousehold: () => noopMutation,
  useHouseholdDetails: () => ({ data: { household: { name: "My Household" } } }),
}));

import { DataSection } from "./DataSection";

describe("DataSection delete copy (FEAT-1)", () => {
  it("lists only real deleted data and no longer mentions goals", () => {
    renderWithProviders(<DataSection />);
    const copy = screen.getByText(/permanently remove this household and all its data/i);
    expect(copy.textContent).toContain("members, accounts, assets, and snapshots");
    expect(copy.textContent?.toLowerCase()).not.toContain("goals");
  });
});
