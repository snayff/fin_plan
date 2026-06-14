import { describe, it, expect, mock } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/helpers/render";
import { screen, waitFor, fireEvent } from "@testing-library/react";
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
  WATERFALL_KEYS: {
    summary: ["waterfall", "summary"],
    financialSummary: ["waterfall", "financial-summary"],
    subcategories: (tier: string) => ["waterfall", "subcategories", tier],
  },
  TIER_ITEM_KEYS: {
    items: (tier: string) => ["waterfall", "tier-items", tier],
  },
}));

const createPeriodMock = mock(async () => ({ ok: true }));
mock.module("@/services/waterfall.service", () => ({
  waterfallService: {
    createPeriod: createPeriodMock,
    updateIncome: async () => ({}),
    updateCommitted: async () => ({}),
    updateDiscretionary: async () => ({}),
    deleteIncome: async () => ({}),
    deleteCommitted: async () => ({}),
    deleteDiscretionary: async () => ({}),
  },
}));

// Render a button per tier that triggers the page's onSaveAmount callback.
mock.module("@/components/waterfall/WaterfallTierTable", () => ({
  WaterfallTierTable: ({
    tier,
    onSaveAmount,
  }: {
    tier: string;
    onSaveAmount: (id: string, amount: number) => Promise<unknown>;
  }) => (
    <button
      type="button"
      data-testid={`waterfall-tier-${tier}`}
      onClick={() => void onSaveAmount("item-1", 250)}
    >
      save {tier}
    </button>
  ),
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

  it("invalidates waterfall/forecast/cashflow/tier-item caches after a service-layer amount save (#118)", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = mock(qc.invalidateQueries.bind(qc));
    qc.invalidateQueries = invalidateSpy as typeof qc.invalidateQueries;
    createPeriodMock.mockClear();

    renderWithProviders(<FullWaterfallPage />, {
      initialEntries: ["/waterfall"],
      queryClient: qc,
    });
    const committedBtn = await screen.findByTestId("waterfall-tier-committed");
    fireEvent.click(committedBtn);

    await waitFor(() => {
      expect(createPeriodMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(["waterfall", "summary"]));
      expect(keys).toContain(JSON.stringify(["waterfall", "financial-summary"]));
      expect(keys).toContain(JSON.stringify(["forecast"]));
      expect(keys).toContain(JSON.stringify(["cashflow", "shortfall"]));
      expect(keys).toContain(JSON.stringify(["waterfall", "tier-items", "committed"]));
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
