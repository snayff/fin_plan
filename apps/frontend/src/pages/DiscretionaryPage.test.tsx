import { describe, it, expect, mock } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import { screen, waitFor } from "@testing-library/react";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import DiscretionaryPage from "./DiscretionaryPage";

mock.module("@/hooks/useWaterfall", () => ({
  useSubcategories: () => ({
    isLoading: false,
    data: [
      {
        id: "sub-dining",
        name: "Dining Out",
        tier: "discretionary",
        sortOrder: 0,
        isLocked: false,
      },
    ],
  }),
  useTierItems: () => ({
    isLoading: false,
    data: [],
  }),
}));

describe("DiscretionaryPage", () => {
  it("renders the tier page for discretionary", async () => {
    renderWithProviders(<DiscretionaryPage />, { initialEntries: ["/discretionary"] });
    await waitFor(() => {
      expect(screen.getByTestId("tier-page-discretionary")).toBeTruthy();
    });
  });

  it("renders the Dining Out subcategory", async () => {
    renderWithProviders(<DiscretionaryPage />, { initialEntries: ["/discretionary"] });
    await waitFor(() => {
      expect(screen.getAllByText("Dining Out").length).toBeGreaterThan(0);
    });
  });

  it("has no serious/critical axe violations", async () => {
    const { container } = renderWithProviders(<DiscretionaryPage />, {
      initialEntries: ["/discretionary"],
    });
    await screen.findByTestId("tier-page-discretionary");
    await expectNoA11yViolations(container);
  });
});
