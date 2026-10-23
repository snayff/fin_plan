import { describe, it, expect, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import TierPage from "../TierPage";

// Data starts loading and resolves on a later render — a cold-load deep link.
let loaded = false;

const subcategories = [
  { id: "sub-1", name: "Housing", tier: "committed", sortOrder: 0, isLocked: false },
  { id: "sub-2", name: "Utilities", tier: "committed", sortOrder: 1, isLocked: false },
];

const items = [
  {
    id: "item-rent",
    name: "Rent",
    amount: 1200,
    spendType: "monthly",
    subcategoryId: "sub-1",
    notes: null,
    dueDate: null,
    lastReviewedAt: new Date("2026-10-01"),
    createdAt: new Date("2026-01-01"),
    sortOrder: 0,
    memberId: null,
    lifecycleState: "active",
  },
  {
    id: "item-power",
    name: "Electricity",
    amount: 90,
    spendType: "monthly",
    subcategoryId: "sub-2",
    notes: null,
    dueDate: null,
    lastReviewedAt: new Date("2026-10-01"),
    createdAt: new Date("2026-01-01"),
    sortOrder: 0,
    memberId: null,
    lifecycleState: "active",
  },
];

const mutation = () => ({ isPending: false, mutateAsync: async () => ({}) });

mock.module("@/hooks/useWaterfall", () => ({
  useSubcategories: () =>
    loaded ? { isLoading: false, data: subcategories } : { isLoading: true, data: undefined },
  useTierItems: () =>
    loaded ? { isLoading: false, data: items } : { isLoading: true, data: undefined },
  useCreateItem: mutation,
  useDeleteItem: mutation,
  useTierUpdateItem: mutation,
  useConfirmWaterfallItem: mutation,
  useCreatePeriod: mutation,
  useDeletePeriod: mutation,
}));

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false } }),
  useHouseholdMembers: () => ({ data: [] }),
  getStalenessMonths: () => 12,
}));

mock.module("@/hooks/useGifts", () => ({
  useGiftPlannerSettings: () => ({ data: undefined }),
}));

mock.module("@/hooks/useShortfall", () => ({
  useTierShortfall: () => ({ items: [], count: 0, isLive: false }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Page() {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/committed?subcategory=sub-2&focus=item-power"]}>
        <Routes>
          <Route
            path="/committed"
            element={
              <>
                <TierPage tier="committed" />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TierPage search deep link", () => {
  it("cold load: focuses a row in a non-default subcategory once data arrives", async () => {
    loaded = false;
    const { rerender } = render(<Page />);
    // While loading nothing is focused and the param is kept for later.
    expect(screen.getByTestId("location").textContent).toContain("focus=item-power");

    loaded = true;
    rerender(<Page />);

    const row = await screen.findByTestId("item-row-item-power");
    const target = row.closest("[data-search-focus]")!;
    expect(target.getAttribute("data-search-focus")).toBe("item-power");
    await waitFor(() => expect(target.classList.contains("search-focus-pulse")).toBe(true));
    // Focus consumed; the subcategory selection stays so the row remains visible.
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("?subcategory=sub-2")
    );
    expect(screen.queryByTestId("item-row-item-rent")).toBeNull(); // default sub not shown
  });
});
