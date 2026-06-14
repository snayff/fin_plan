import { describe, it, expect, mock } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import { screen, waitFor } from "@testing-library/react";
import FullWaterfallPage from "./FullWaterfallPage";

// Mutable holder so individual tests can supply a populated summary.
const summaryHolder: { data: unknown } = { data: null };

mock.module("@/hooks/useWaterfall", () => ({
  useFullWaterfall: () => ({
    summary: {
      get data() {
        return summaryHolder.data;
      },
      isLoading: false,
      isError: false,
      refetch: () => {},
    },
    subcategories: { income: [], committed: [], discretionary: [] },
    items: { income: [], committed: [], discretionary: [] },
    isLoading: false,
    isError: false,
  }),
  useCreateSubcategory: () => ({ mutateAsync: async () => {} }),
}));

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: null, isLoading: false }),
  useDismissWaterfallTip: () => ({ mutate: () => {} }),
  useHouseholdMembers: () => ({ data: [] }),
}));

describe("FullWaterfallPage", () => {
  it("is a valid React component (function)", () => {
    expect(typeof FullWaterfallPage).toBe("function");
  });

  it("renders without crashing at /waterfall", async () => {
    renderWithProviders(<FullWaterfallPage />, { initialEntries: ["/waterfall"] });
    await waitFor(() => {
      expect(screen.getByTestId("full-waterfall-page")).toBeTruthy();
    });
  });

  it("renders all three tier tables", async () => {
    renderWithProviders(<FullWaterfallPage />, { initialEntries: ["/waterfall"] });
    await waitFor(() => {
      expect(screen.getByTestId("waterfall-tier-income")).toBeTruthy();
      expect(screen.getByTestId("waterfall-tier-committed")).toBeTruthy();
      expect(screen.getByTestId("waterfall-tier-discretionary")).toBeTruthy();
    });
  });

  it("renders the surplus strip", async () => {
    renderWithProviders(<FullWaterfallPage />, { initialEntries: ["/waterfall"] });
    await waitFor(() => {
      expect(screen.getByTestId("surplus-strip")).toBeTruthy();
    });
  });

  it("includes non-monthly committed average in committed deduction and surplus", async () => {
    // income 2000; committed monthlyTotal 500 + monthlyAvg12 100 (a yearly £1200 bill)
    // => committed 600; discretionary 400 => surplus 1000.
    summaryHolder.data = {
      income: { total: 2000 },
      committed: { monthlyTotal: 500, monthlyAvg12: 100 },
      discretionary: { total: 400 },
      surplus: { amount: 1000, percentOfIncome: 50 },
    };
    try {
      renderWithProviders(<FullWaterfallPage />, { initialEntries: ["/waterfall"] });
      await waitFor(() => {
        // Connector shows the full committed deduction (£600, not £500).
        expect(screen.getByText(/£600\s+committed/)).toBeTruthy();
      });
      // Surplus strip reflects the amortised committed total: £1,000.
      const strip = screen.getByTestId("surplus-strip");
      expect(strip.textContent).toMatch(/£1,000/);
    } finally {
      summaryHolder.data = null;
    }
  });
});
