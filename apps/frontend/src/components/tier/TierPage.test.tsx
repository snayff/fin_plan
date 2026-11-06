import { describe, it, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TierPage from "./TierPage";
import type { TierKey } from "./tierConfig";
import type { TierShortfallResult } from "@/hooks/useShortfall";

let _searchParams = new URLSearchParams();
let _setSearchParams: (...args: unknown[]) => void = () => {};

mock.module("react-router-dom", () => ({
  useSearchParams: () => [_searchParams, _setSearchParams],
  useNavigate: () => () => {},
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const _defaultSubcategories = [
  { id: "sub-housing", name: "Housing", tier: "committed", sortOrder: 0, isLocked: false },
  { id: "sub-utilities", name: "Utilities", tier: "committed", sortOrder: 1, isLocked: false },
];
// `undefined` simulates the subcategories query still loading.
let _subcategoriesData: unknown = _defaultSubcategories;

mock.module("@/hooks/useWaterfall", () => ({
  useSubcategories: mock(() => ({
    isLoading: _subcategoriesData === undefined,
    data: _subcategoriesData,
  })),
  useTierItems: mock(() => ({
    isLoading: false,
    data: [],
  })),
}));

const mockShortfallResult: TierShortfallResult = {
  items: [],
  count: 0,
  daysToFirst: null,
  balanceToday: 0,
  lowest: null,
  isLive: false,
};

let _shortfallOverride: TierShortfallResult | null = null;

mock.module("@/hooks/useShortfall", () => ({
  useTierShortfall: mock((_tierKey: string) => _shortfallOverride ?? mockShortfallResult),
}));

function renderTierPage(searchParams = new URLSearchParams(), tier: TierKey = "committed") {
  _searchParams = searchParams;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TierPage tier={tier} />
    </QueryClientProvider>
  );
}

describe("TierPage", () => {
  it("renders the page shell with data-testid", () => {
    renderTierPage();
    expect(screen.getByTestId("tier-page-committed")).toBeTruthy();
  });

  it("renders subcategory names in the left panel", () => {
    renderTierPage();
    expect(screen.getAllByText("Housing").length).toBeGreaterThan(0);
    expect(screen.getByText("Utilities")).toBeTruthy();
  });

  it("selects the first subcategory by default", () => {
    renderTierPage();
    const housing = screen.getByTestId("subcategory-row-sub-housing");
    expect(housing.getAttribute("aria-current")).toBe("true");
  });

  it("selects a subcategory from the URL ?subcategory= param", () => {
    renderTierPage(new URLSearchParams("subcategory=sub-utilities"));
    const utilities = screen.getByTestId("subcategory-row-sub-utilities");
    expect(utilities.getAttribute("aria-current")).toBe("true");
  });

  it("keeps a deep-linked ?subcategory= while subcategories are still loading (#140)", async () => {
    const setSpy = mock((..._args: unknown[]) => {});
    _setSearchParams = setSpy;
    _subcategoriesData = undefined; // query pending
    try {
      renderTierPage(new URLSearchParams("subcategory=sub-utilities"));
      // Allow the validate-effect a chance to run.
      await new Promise((r) => setTimeout(r, 50));
      // The invalid-value clear effect must NOT fire while data is pending,
      // so setSearchParams is never called to strip the param.
      expect(setSpy).not.toHaveBeenCalled();
    } finally {
      _subcategoriesData = _defaultSubcategories;
      _setSearchParams = () => {};
    }
  });

  it("sets data-page attribute matching the tier", () => {
    renderTierPage();
    const page = screen.getByTestId("tier-page-committed");
    expect(page.getAttribute("data-page")).toBe("committed");
  });

  it("renders subcategories inside a left aside panel", () => {
    renderTierPage();
    const aside = document.querySelector("aside");
    expect(aside).toBeTruthy();
    expect(aside!.querySelector("nav[aria-label='Subcategories']")).toBeTruthy();
  });

  it("renders the AttentionStrip on the Committed tier when shortfall items exist", async () => {
    _shortfallOverride = {
      items: [
        {
          itemType: "committed_item",
          itemId: "c1",
          itemName: "Council Tax",
          tierKey: "committed",
          dueDate: "2026-05-08",
          amount: 420,
        },
        {
          itemType: "committed_item",
          itemId: "c2",
          itemName: "Car Insurance",
          tierKey: "committed",
          dueDate: "2026-05-14",
          amount: 540,
        },
      ],
      count: 2,
      daysToFirst: 12,
      balanceToday: 540,
      lowest: { value: -123, date: "2026-05-08" },
      isLive: true,
    };
    renderTierPage(new URLSearchParams(), "committed");
    expect(await screen.findByText(/Cashflow won't cover/)).toBeInTheDocument();
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
    _shortfallOverride = null;
  });

  it("does NOT render the AttentionStrip on the Income tier", () => {
    _shortfallOverride = {
      items: [
        {
          itemType: "committed_item",
          itemId: "c1",
          itemName: "Council Tax",
          tierKey: "committed",
          dueDate: "2026-05-08",
          amount: 420,
        },
      ],
      count: 1,
      daysToFirst: 12,
      balanceToday: 540,
      lowest: { value: -123, date: "2026-05-08" },
      isLive: true,
    };
    renderTierPage(new URLSearchParams(), "income");
    expect(screen.queryByText(/Cashflow won't cover/)).toBeNull();
    _shortfallOverride = null;
  });
});
