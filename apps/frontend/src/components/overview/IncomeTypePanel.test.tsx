import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import type { IncomeSourceRow } from "@finplan/shared";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false, stalenessThresholds: { income_source: 12 } } }),
}));
mock.module("@/components/help/GlossaryTermMarker", () => ({
  GlossaryTermMarker: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { IncomeTypePanel } from "./IncomeTypePanel";

function buildRow(overrides: Partial<IncomeSourceRow> = {}): IncomeSourceRow {
  return {
    id: "inc-1",
    householdId: "hh-1",
    name: "Salary",
    amount: 3000,
    frequency: "monthly",
    incomeType: "salary",
    dueDate: new Date("2026-01-25"),
    memberId: null,
    sortOrder: 0,
    lifecycleState: "active",
    lastReviewedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    subcategoryId: null,
    notes: null,
    ...overrides,
  } as IncomeSourceRow;
}

describe("IncomeTypePanel", () => {
  it("renders an empty state when there are no sources", () => {
    render(
      <IncomeTypePanel
        label="Monthly"
        sources={[]}
        onSelectSource={() => {}}
        onBack={() => {}}
        selectedItemId={null}
      />
    );
    expect(screen.getByText("No monthly sources")).toBeTruthy();
  });

  it("renders rows with amortisation markers for non-monthly frequencies", () => {
    render(
      <IncomeTypePanel
        label="All"
        sources={[
          buildRow({ id: "a", name: "Annual bonus", frequency: "annual" }),
          buildRow({ id: "q", name: "Quarterly", frequency: "quarterly" }),
          buildRow({ id: "w", name: "Weekly gig", frequency: "weekly" }),
        ]}
        onSelectSource={() => {}}
        onBack={() => {}}
        selectedItemId="a"
      />
    );
    expect(screen.getByText("÷12")).toBeTruthy();
    expect(screen.getByText("÷3")).toBeTruthy();
    expect(screen.getByText("/wk")).toBeTruthy();
  });

  it("fires onSelectSource with the mapped item when a row is clicked", () => {
    const onSelectSource = mock(() => {});
    render(
      <IncomeTypePanel
        label="Monthly"
        sources={[buildRow()]}
        onSelectSource={onSelectSource}
        onBack={() => {}}
        selectedItemId={null}
      />
    );
    fireEvent.click(screen.getByText("Salary"));
    expect(onSelectSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inc-1", type: "income_source", name: "Salary", amount: 3000 })
    );
  });

  it("fires onBack from the breadcrumb button", () => {
    const onBack = mock(() => {});
    render(
      <IncomeTypePanel
        label="Monthly"
        sources={[]}
        onSelectSource={() => {}}
        onBack={onBack}
        selectedItemId={null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Income/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
