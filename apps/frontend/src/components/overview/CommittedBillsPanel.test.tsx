import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CommittedBillRow } from "@finplan/shared";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false, stalenessThresholds: { committed_bill: 6 } } }),
}));

import { CommittedBillsPanel } from "./CommittedBillsPanel";

function buildBill(overrides: Partial<CommittedBillRow> = {}): CommittedBillRow {
  return {
    id: "bill-1",
    householdId: "hh-1",
    name: "Rent",
    amount: 1200,
    memberId: null,
    sortOrder: 0,
    lastReviewedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as CommittedBillRow;
}

describe("CommittedBillsPanel", () => {
  it("renders an empty state when there are no bills", () => {
    render(
      <CommittedBillsPanel
        bills={[]}
        onSelectBill={() => {}}
        onBack={() => {}}
        selectedItemId={null}
      />
    );
    expect(screen.getByText("No monthly bills added yet")).toBeTruthy();
  });

  it("renders bills with formatted amounts", () => {
    render(
      <CommittedBillsPanel
        bills={[buildBill()]}
        onSelectBill={() => {}}
        onBack={() => {}}
        selectedItemId="bill-1"
      />
    );
    expect(screen.getByText("Rent")).toBeTruthy();
    expect(screen.getByText(/£1,200/)).toBeTruthy();
  });

  it("fires onSelectBill with the mapped item when a bill is clicked", () => {
    const onSelectBill = mock(() => {});
    render(
      <CommittedBillsPanel
        bills={[buildBill()]}
        onSelectBill={onSelectBill}
        onBack={() => {}}
        selectedItemId={null}
      />
    );
    fireEvent.click(screen.getByText("Rent"));
    expect(onSelectBill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "bill-1", type: "committed_bill", amount: 1200 })
    );
  });

  it("fires onBack from the breadcrumb button", () => {
    const onBack = mock(() => {});
    render(
      <CommittedBillsPanel
        bills={[]}
        onSelectBill={() => {}}
        onBack={onBack}
        selectedItemId={null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Committed/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
