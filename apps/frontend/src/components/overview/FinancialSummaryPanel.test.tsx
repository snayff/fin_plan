import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import type { WaterfallSummary } from "@finplan/shared";

// Mock the financial summary hook
mock.module("@/hooks/useWaterfall", () => ({
  useFinancialSummary: () => ({
    data: {
      current: {
        netWorth: 50000,
        income: 5000,
        committed: 2000,
        discretionary: 1500,
        surplus: 1500,
      },
      sparklines: { netWorth: [], income: [], committed: [], discretionary: [], surplus: [] },
    },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

import { FinancialSummaryPanel } from "./FinancialSummaryPanel";

const mockSummary: WaterfallSummary = {
  income: { total: 5000, byType: [], bySubcategory: [], monthly: [], nonMonthly: [], oneOff: [] },
  committed: {
    monthlyTotal: 2000,
    monthlyAvg12: 2000,
    bySubcategory: [
      {
        id: "s1",
        name: "Housing",
        sortOrder: 0,
        monthlyTotal: 1200,
        oldestReviewedAt: null,
        itemCount: 1,
      },
      {
        id: "s2",
        name: "Transport",
        sortOrder: 1,
        monthlyTotal: 800,
        oldestReviewedAt: null,
        itemCount: 1,
      },
    ],
    bills: [
      {
        id: "b1",
        householdId: "h1",
        name: "Mortgage",
        amount: 1200,
        memberId: null,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "s1",
      },
    ],
    nonMonthlyBills: [],
  },
  discretionary: {
    total: 1500,
    bySubcategory: [
      {
        id: "d1",
        name: "Entertainment",
        sortOrder: 0,
        monthlyTotal: 1500,
        oldestReviewedAt: null,
        itemCount: 1,
      },
    ],
    categories: [
      {
        id: "c1",
        householdId: "h1",
        name: "Dining Out",
        monthlyBudget: 1500,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "d1",
      },
    ],
    savings: { total: 0, allocations: [] },
  },
  surplus: { amount: 1500, percentOfIncome: 30 },
};

describe("FinancialSummaryPanel with visualisations", () => {
  it("renders the Sankey diagram", () => {
    renderWithProviders(
      <FinancialSummaryPanel waterfallSummary={mockSummary} isSnapshot={false} />
    );
    expect(screen.getByLabelText("Waterfall flow diagram")).toBeTruthy();
  });

  it("renders committed and discretionary doughnut charts", () => {
    renderWithProviders(
      <FinancialSummaryPanel waterfallSummary={mockSummary} isSnapshot={false} />
    );
    // Legend entries from subcategories
    expect(screen.getByText("Housing")).toBeTruthy();
    expect(screen.getByText("Entertainment")).toBeTruthy();
  });

  it("committed doughnut centre includes the non-monthly average (monthlyTotal + monthlyAvg12)", () => {
    renderWithProviders(
      <FinancialSummaryPanel waterfallSummary={mockSummary} isSnapshot={false} />
    );
    // committed monthlyTotal 2000 + monthlyAvg12 2000 = 4000 in the doughnut centre.
    expect(screen.getByText("£4,000")).toBeTruthy();
  });

  it("renders the four sparkline tier cards", () => {
    renderWithProviders(
      <FinancialSummaryPanel waterfallSummary={mockSummary} isSnapshot={false} />
    );
    expect(screen.getByText("INCOME")).toBeTruthy();
    expect(screen.getByText("COMMITTED")).toBeTruthy();
    expect(screen.getByText("DISCRETIONARY")).toBeTruthy();
    expect(screen.getByText("SURPLUS")).toBeTruthy();
  });
});
