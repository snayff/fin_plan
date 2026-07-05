import { describe, it, expect, mock } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import { screen } from "@testing-library/react";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import SurplusPage from "./SurplusPage";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { surplusBenchmarkPct: 10 } }),
  useUpdateSettings: () => ({ mutate: () => {}, isPending: false }),
}));

mock.module("@/hooks/useWaterfall", () => ({
  useWaterfallSummary: () => ({
    isLoading: false,
    isError: false,
    data: {
      income: { total: 4000 },
      committed: { monthlyTotal: 1000, monthlyAvg12: 500 },
      discretionary: { total: 800, savings: { total: 300 } },
      surplus: { amount: 1700, percentOfIncome: 42.5 },
    },
  }),
}));

describe("SurplusPage", () => {
  it("renders the surplus page", () => {
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    expect(screen.getByTestId("surplus-page")).toBeTruthy();
  });

  it("shows the surplus amount", () => {
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    expect(screen.getAllByText(/1,700/).length).toBeGreaterThan(0);
  });

  it("shows discretionary as the savings-inclusive total, not double-counted", () => {
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    // discretionary.total (800) already includes savings.total (300).
    // Adding them would render 1,100 — guard against regression of that bug.
    expect(screen.queryByText(/1,100/)).toBeNull();
    expect(screen.getAllByText(/£800/).length).toBeGreaterThan(0);
  });

  it("shows the waterfall breakdown line items", () => {
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    expect(screen.getAllByText(/income/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/committed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/discretionary/i).length).toBeGreaterThan(0);
  });

  it("shows the right-panel message", () => {
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    expect(screen.getAllByText(/at the end of each month/i).length).toBeGreaterThan(0);
  });

  it("does not show benchmark warning when surplus is above threshold", () => {
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    expect(screen.queryByTestId("surplus-benchmark-warning")).toBeNull();
  });

  it("sets data-page attribute to surplus", () => {
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    const page = screen.getByTestId("surplus-page");
    expect(page.getAttribute("data-page")).toBe("surplus");
  });

  it("has no serious/critical axe violations", async () => {
    const { container } = renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    await expectNoA11yViolations(container);
  });
});

describe("SurplusPage — benchmark warning", () => {
  it("shows amber benchmark warning when surplus is below threshold", () => {
    mock.module("@/hooks/useWaterfall", () => ({
      useWaterfallSummary: () => ({
        isLoading: false,
        data: {
          income: { total: 4000 },
          committed: { monthlyTotal: 3000, monthlyAvg12: 500 },
          discretionary: { total: 800, savings: { total: 0 } },
          surplus: { amount: -300, percentOfIncome: -7.5 },
        },
      }),
    }));
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    expect(screen.getByTestId("surplus-benchmark-warning")).toBeTruthy();
  });

  it("does not show benchmark warning when income is 0", () => {
    mock.module("@/hooks/useWaterfall", () => ({
      useWaterfallSummary: () => ({
        isLoading: false,
        data: {
          income: { total: 0 },
          committed: { monthlyTotal: 0, monthlyAvg12: 0 },
          discretionary: { total: 0, savings: { total: 0 } },
          surplus: { amount: 0, percentOfIncome: 0 },
        },
      }),
    }));
    renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
    expect(screen.queryByTestId("surplus-benchmark-warning")).toBeNull();
  });
});
