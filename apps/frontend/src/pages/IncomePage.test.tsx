import { describe, it, expect, mock } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import { screen, waitFor } from "@testing-library/react";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import IncomePage from "./IncomePage";

mock.module("@/hooks/useWaterfall", () => ({
  useSubcategories: () => ({
    isLoading: false,
    data: [{ id: "sub-salary", name: "Salary", tier: "income", sortOrder: 0, isLocked: false }],
  }),
  useTierItems: () => ({
    isLoading: false,
    data: [],
  }),
}));

describe("IncomePage", () => {
  it("renders the tier page for income", async () => {
    renderWithProviders(<IncomePage />, { initialEntries: ["/income"] });
    await waitFor(() => {
      expect(screen.getByTestId("tier-page-income")).toBeTruthy();
    });
  });

  it("renders the Salary subcategory", async () => {
    renderWithProviders(<IncomePage />, { initialEntries: ["/income"] });
    await waitFor(() => {
      expect(screen.getAllByText("Salary").length).toBeGreaterThan(0);
    });
  });

  it("has no serious/critical axe violations", async () => {
    const { container } = renderWithProviders(<IncomePage />, { initialEntries: ["/income"] });
    await screen.findByTestId("tier-page-income");
    await expectNoA11yViolations(container);
  });
});
