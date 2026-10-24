import { describe, it, expect, mock } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import { screen, waitFor } from "@testing-library/react";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import CommittedPage from "./CommittedPage";

mock.module("@/hooks/useWaterfall", () => ({
  useSubcategories: () => ({
    isLoading: false,
    data: [
      { id: "sub-housing", name: "Housing", tier: "committed", sortOrder: 0, isLocked: false },
    ],
  }),
  useTierItems: () => ({
    isLoading: false,
    data: [],
  }),
}));

describe("CommittedPage", () => {
  it("renders the tier page for committed", async () => {
    renderWithProviders(<CommittedPage />, { initialEntries: ["/committed"] });
    await waitFor(() => {
      expect(screen.getByTestId("tier-page-committed")).toBeTruthy();
    });
  });

  it("renders the Housing subcategory", async () => {
    renderWithProviders(<CommittedPage />, { initialEntries: ["/committed"] });
    await waitFor(() => {
      expect(screen.getAllByText("Housing").length).toBeGreaterThan(0);
    });
  });

  it("has no serious/critical axe violations", async () => {
    const { container } = renderWithProviders(<CommittedPage />, {
      initialEntries: ["/committed"],
    });
    await screen.findByTestId("tier-page-committed");
    await expectNoA11yViolations(container);
  });
});
