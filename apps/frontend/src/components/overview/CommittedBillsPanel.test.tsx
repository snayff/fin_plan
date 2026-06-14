import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CommittedBillRow } from "@finplan/shared";

// Mutable settings so individual tests can vary the committed_item threshold.
let _settings: { showPence: boolean; stalenessThresholds?: Record<string, number> } = {
  showPence: false,
  stalenessThresholds: { committed_item: 6 },
};

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: _settings }),
  // Real resolution logic so a custom threshold actually takes effect.
  getStalenessMonths: (
    settings: { stalenessThresholds?: Record<string, number> } | null | undefined,
    itemType: string
  ) => {
    const defaults: Record<string, number> = {
      income_source: 12,
      committed_item: 6,
      discretionary_item: 12,
      asset_item: 12,
      account_item: 3,
    };
    return settings?.stalenessThresholds?.[itemType] ?? defaults[itemType] ?? 12;
  },
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

  it("shows/hides the stale badge based on the custom committed_item threshold (#112)", () => {
    // Reviewed ~9 months before the test 'now'.
    const bill = buildBill({ lastReviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 280) });

    // Threshold 6 months -> stale -> badge visible.
    _settings = { showPence: false, stalenessThresholds: { committed_item: 6 } };
    const { unmount } = render(
      <CommittedBillsPanel
        bills={[bill]}
        onSelectBill={() => {}}
        onBack={() => {}}
        selectedItemId={null}
      />
    );
    expect(screen.getByText(/mo ago/)).toBeTruthy();
    unmount();

    // Threshold 24 months -> not stale -> no badge.
    _settings = { showPence: false, stalenessThresholds: { committed_item: 24 } };
    render(
      <CommittedBillsPanel
        bills={[bill]}
        onSelectBill={() => {}}
        onBack={() => {}}
        selectedItemId={null}
      />
    );
    expect(screen.queryByText(/mo ago/)).toBeNull();

    // Reset for any later tests.
    _settings = { showPence: false, stalenessThresholds: { committed_item: 6 } };
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
