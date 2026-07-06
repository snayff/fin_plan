/**
 * OverviewPage — realistic interaction (userEvent) + axe a11y coverage.
 *
 * OverviewPage.test.tsx exercises the error state; this file renders the happy
 * path from a real WaterfallSummary fixture, drives the item-detail *edit* flow
 * through real typing/clicking (asserting the confirm mutation fires with the
 * right item), and runs the serious/critical axe policy against both the
 * waterfall list view and the item-detail view — previously out of a11y scope.
 */
import { describe, it, expect, mock } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import type { WaterfallSummary } from "@finplan/shared";
import OverviewPage from "./OverviewPage";

const REVIEWED = new Date("2025-01-01T00:00:00Z");

// Minimal-but-complete summary: one resolvable income source (income-1) so the
// ?view=item:income-1 deep-link resolves into the ItemDetailPanel.
const summaryFixture: WaterfallSummary = {
  income: {
    total: 3000,
    byType: [
      {
        type: "salary",
        label: "Salary",
        monthlyTotal: 3000,
        sources: [
          {
            id: "income-1",
            householdId: "h-1",
            name: "Main Salary",
            amount: 3000,
            frequency: "monthly",
            incomeType: "salary",
            dueDate: REVIEWED,
            memberId: null,
            sortOrder: 0,
            lifecycleState: "active",
            lastReviewedAt: REVIEWED,
            createdAt: REVIEWED,
            updatedAt: REVIEWED,
            subcategoryId: null,
            notes: null,
          },
        ],
      },
    ],
    bySubcategory: [],
    monthly: [],
    nonMonthly: [],
    oneOff: [],
  },
  committed: {
    monthlyTotal: 1200,
    monthlyAvg12: 0,
    bySubcategory: [],
    bills: [],
    nonMonthlyBills: [],
  },
  discretionary: {
    total: 500,
    bySubcategory: [],
    categories: [],
    savings: { total: 0, allocations: [] },
  },
  surplus: { amount: 1300, percentOfIncome: 43 },
};

const confirmItemMutate = mock((_args: unknown, opts?: { onSuccess?: () => void }) => {
  opts?.onSuccess?.();
});

mock.module("@/hooks/useWaterfall", () => ({
  useWaterfallSummary: () => ({
    data: summaryFixture,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  useFinancialSummary: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  useItemHistory: () => ({ data: [], isLoading: false, isError: false, refetch: () => {} }),
  useConfirmItem: () => ({ mutate: confirmItemMutate, isPending: false }),
  useUpdateItem: () => ({ mutate: () => {}, isPending: false }),
  useEndIncome: () => ({ mutate: () => {}, isPending: false }),
}));

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false } }),
  useSnapshot: () => ({ data: undefined, isLoading: false, isError: false }),
  useSnapshots: () => ({ data: [], isLoading: false, isError: false, refetch: () => {} }),
  useCreateSnapshot: () => ({ mutate: () => {}, isPending: false }),
  getStalenessMonths: () => 12,
}));

mock.module("@/hooks/useShortfall", () => ({
  useTierShortfall: () => ({
    items: [],
    count: 0,
    daysToFirst: null,
    balanceToday: 0,
    lowest: null,
    isLive: false,
  }),
}));

mock.module("@/hooks/useNudge", () => ({
  useSavingsNudge: () => null,
}));

describe("OverviewPage — item edit flow (userEvent)", () => {
  it("confirms the item when the user edits an amount and saves", async () => {
    const user = userEvent.setup();
    confirmItemMutate.mockClear();
    renderWithProviders(<OverviewPage />, { initialEntries: ["/?view=item:income-1"] });

    // The item-detail panel resolves from the deep-linked view param.
    await screen.findByRole("heading", { name: "Main Salary" });

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const amountInput = await screen.findByLabelText(/new amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "3200");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(confirmItemMutate).toHaveBeenCalledTimes(1);
    });
    // Amount edits are persisted via the period system, so Save confirms the
    // reviewed item; assert the correct item id/type were sent.
    const firstArg = confirmItemMutate.mock.calls[0]![0] as { id: string; type: string };
    expect(firstArg.id).toBe("income-1");
    expect(firstArg.type).toBe("income");
  });

  it("marks the item still-correct via the 'Still correct' action", async () => {
    const user = userEvent.setup();
    confirmItemMutate.mockClear();
    renderWithProviders(<OverviewPage />, { initialEntries: ["/?view=item:income-1"] });

    await screen.findByRole("heading", { name: "Main Salary" });
    await user.click(screen.getByRole("button", { name: /still correct/i }));

    await waitFor(() => {
      expect(confirmItemMutate).toHaveBeenCalledTimes(1);
    });
  });
});

describe("OverviewPage — a11y (serious/critical)", () => {
  it("has no serious/critical axe violations in the waterfall list view", async () => {
    const { container } = renderWithProviders(<OverviewPage />, { initialEntries: ["/"] });
    await screen.findByText("Overview");
    await expectNoA11yViolations(container);
  });

  it("has no serious/critical axe violations in the item-detail view", async () => {
    const { container } = renderWithProviders(<OverviewPage />, {
      initialEntries: ["/?view=item:income-1"],
    });
    await screen.findByRole("heading", { name: "Main Salary" });
    await expectNoA11yViolations(container);
  });
});
