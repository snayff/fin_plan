import React from "react";
import { describe, it, expect, mock } from "bun:test";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import SubcategoryList from "./SubcategoryList";
import { TIER_CONFIGS } from "./tierConfig";

mock.module("@/hooks/useAnimatedValue", () => ({
  useAnimatedValue: (target: number) => target,
}));

mock.module("framer-motion", () => ({
  motion: {
    div: ({
      children,
      variants: _v,
      initial: _i,
      animate: _a,
      layoutId,
      transition: _t,
      ...props
    }: any) => React.createElement("div", { "data-layout-id": layoutId, ...props }, children),
    nav: ({ children, variants: _v, initial: _i, animate: _a, ...props }: any) =>
      React.createElement("nav", props, children),
    button: ({ children, variants: _v, initial: _i, animate: _a, ...props }: any) =>
      React.createElement("button", props, children),
  },
  LayoutGroup: ({ children }: any) => React.createElement(React.Fragment, null, children),
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

const motionUtils = { usePrefersReducedMotion: mock(() => false) };
mock.module("@/utils/motion", () => motionUtils);

const subcategories = [
  { id: "sub-housing", name: "Housing", tier: "committed" as const, sortOrder: 0, isLocked: false },
  {
    id: "sub-utilities",
    name: "Utilities",
    tier: "committed" as const,
    sortOrder: 1,
    isLocked: false,
  },
];

const subcategoryTotals = {
  "sub-housing": { subcategoryId: "sub-housing", name: "Housing", total: 1200, items: [] },
  "sub-utilities": { subcategoryId: "sub-utilities", name: "Utilities", total: 300, items: [] },
};

function renderList(selectedId = "sub-housing", onSelect = mock(() => {})) {
  return renderWithProviders(
    <SubcategoryList
      tier="committed"
      config={TIER_CONFIGS.committed}
      subcategories={subcategories}
      subcategoryTotals={subcategoryTotals}
      selectedId={selectedId}
      onSelect={onSelect}
      isLoading={false}
    />
  );
}

describe("SubcategoryList", () => {
  it("renders all subcategory rows", () => {
    renderList();
    expect(screen.getByTestId("subcategory-row-sub-housing")).toBeTruthy();
    expect(screen.getByTestId("subcategory-row-sub-utilities")).toBeTruthy();
  });

  it("marks the selected row with aria-current", () => {
    renderList("sub-housing");
    expect(screen.getByTestId("subcategory-row-sub-housing").getAttribute("aria-current")).toBe(
      "true"
    );
    expect(
      screen.getByTestId("subcategory-row-sub-utilities").getAttribute("aria-current")
    ).toBeNull();
  });

  it("calls onSelect when a row is clicked", () => {
    const onSelect = mock(() => {});
    renderList("sub-housing", onSelect);
    fireEvent.click(screen.getByTestId("subcategory-row-sub-utilities"));
    expect(onSelect).toHaveBeenCalledWith("sub-utilities");
  });

  it("shows amounts for each subcategory", () => {
    renderList();
    expect(screen.getByText(/1,200/)).toBeTruthy();
    expect(screen.getByText(/300/)).toBeTruthy();
  });

  it("unselected row uses tier colour for hover background", () => {
    renderList("sub-housing");
    const unselected = screen.getByTestId("subcategory-row-sub-utilities");
    expect(unselected.className).toContain("hover:bg-tier-committed/5");
  });

  it("shows amber stale dot when any item in the subcategory is stale", () => {
    const staleItem = {
      id: "item-stale",
      lastReviewedAt: new Date("2024-01-01"),
      amount: 100,
      spendType: "monthly" as const,
      subcategoryId: "sub-housing",
      notes: null,
      sortOrder: 0,
    };
    const totalsWithStaleItem = {
      "sub-housing": {
        subcategoryId: "sub-housing",
        name: "Housing",
        total: 1200,
        items: [staleItem],
      },
      "sub-utilities": {
        subcategoryId: "sub-utilities",
        name: "Utilities",
        total: 300,
        items: [],
      },
    };
    renderWithProviders(
      <SubcategoryList
        tier="committed"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        subcategoryTotals={totalsWithStaleItem}
        selectedId="sub-housing"
        onSelect={() => {}}
        isLoading={false}
        now={new Date("2026-01-15")}
        stalenessMonths={6}
      />
    );
    expect(screen.getByTestId("stale-dot-sub-housing")).toBeTruthy();
    expect(screen.queryByTestId("stale-dot-sub-utilities")).toBeNull();
  });

  it("calls usePrefersReducedMotion to respect reduced motion preference", () => {
    motionUtils.usePrefersReducedMotion.mockClear();
    renderList();
    expect(motionUtils.usePrefersReducedMotion).toHaveBeenCalled();
  });

  it("renders layoutId indicator for the selected subcategory", () => {
    const { container } = renderList("sub-housing");
    const indicator = container.querySelector('[data-layout-id="subcategory-indicator-committed"]');
    expect(indicator).toBeTruthy();
  });

  it("does not render layoutId indicator for unselected subcategories", () => {
    const { container } = renderList("sub-housing");
    const indicators = container.querySelectorAll(
      '[data-layout-id="subcategory-indicator-committed"]'
    );
    expect(indicators.length).toBe(1);
  });
});
