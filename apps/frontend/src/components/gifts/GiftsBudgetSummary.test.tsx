// apps/frontend/src/components/gifts/GiftsBudgetSummary.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";

let _showPence = false;
mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: _showPence } }),
}));

import { GiftsBudgetSummary } from "./GiftsBudgetSummary";

describe("GiftsBudgetSummary", () => {
  it("renders annual budget, planned, spent figures", () => {
    render(
      <GiftsBudgetSummary
        budget={{
          annualBudget: 1000,
          planned: 750,
          spent: 200,
          plannedOverBudgetBy: 0,
          spentOverBudgetBy: 0,
        }}
        readOnly={false}
      />
    );
    expect(screen.getByTestId("gifts-budget-annual")).toHaveTextContent("£1,000");
    expect(screen.getByTestId("gifts-budget-planned")).toHaveTextContent("£750");
    expect(screen.getByTestId("gifts-budget-spent")).toHaveTextContent("£200");
  });

  it("shows pence when showPence is true (#122)", () => {
    _showPence = true;
    try {
      render(
        <GiftsBudgetSummary
          budget={{
            annualBudget: 1000.5,
            planned: 750.25,
            spent: 200,
            plannedOverBudgetBy: 0,
            spentOverBudgetBy: 0,
          }}
          readOnly={false}
        />
      );
      expect(screen.getByTestId("gifts-budget-annual")).toHaveTextContent("£1,000.50");
      expect(screen.getByTestId("gifts-budget-planned")).toHaveTextContent("£750.25");
    } finally {
      _showPence = false;
    }
  });

  it("shows planned-over-budget signal when over", () => {
    render(
      <GiftsBudgetSummary
        budget={{
          annualBudget: 1000,
          planned: 1200,
          spent: 0,
          plannedOverBudgetBy: 200,
          spentOverBudgetBy: 0,
        }}
        readOnly={false}
      />
    );
    expect(screen.getByText(/planned more than budget by £200/i)).toBeInTheDocument();
  });

  it("shows spent-over-budget signal when over", () => {
    render(
      <GiftsBudgetSummary
        budget={{
          annualBudget: 1000,
          planned: 500,
          spent: 1100,
          plannedOverBudgetBy: 0,
          spentOverBudgetBy: 100,
        }}
        readOnly={false}
      />
    );
    expect(screen.getByText(/spent more than budget by £100/i)).toBeInTheDocument();
  });

  it("hides signals when under budget", () => {
    render(
      <GiftsBudgetSummary
        budget={{
          annualBudget: 1000,
          planned: 500,
          spent: 200,
          plannedOverBudgetBy: 0,
          spentOverBudgetBy: 0,
        }}
        readOnly={false}
      />
    );
    expect(screen.queryByText(/over budget/i)).toBeNull();
  });
});
