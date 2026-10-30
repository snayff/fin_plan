import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: undefined }),
}));

import { TierDoughnut } from "./TierDoughnut";
import type { SubcategoryTotal } from "@finplan/shared";

const mockSubcategories: SubcategoryTotal[] = [
  {
    id: "s1",
    name: "Mortgage",
    sortOrder: 0,
    monthlyTotal: 1200,
    oldestReviewedAt: null,
    itemCount: 1,
  },
  {
    id: "s2",
    name: "Insurance",
    sortOrder: 1,
    monthlyTotal: 300,
    oldestReviewedAt: null,
    itemCount: 2,
  },
  {
    id: "s3",
    name: "Utilities",
    sortOrder: 2,
    monthlyTotal: 150,
    oldestReviewedAt: null,
    itemCount: 3,
  },
];

const mockItems = [
  { id: "i1", name: "Home Insurance", amount: 200, subcategoryId: "s2" },
  { id: "i2", name: "Car Insurance", amount: 100, subcategoryId: "s2" },
  { id: "i3", name: "Electric", amount: 80, subcategoryId: "s3" },
  { id: "i4", name: "Gas", amount: 40, subcategoryId: "s3" },
  { id: "i5", name: "Water", amount: 30, subcategoryId: "s3" },
];

describe("TierDoughnut", () => {
  it("renders the tier total in the centre", () => {
    render(
      <TierDoughnut
        tier="committed"
        tierTotal={1650}
        subcategories={mockSubcategories}
        items={mockItems}
        isSnapshot={false}
      />
    );
    expect(screen.getByText("£1,650")).toBeTruthy();
  });

  it("renders arc geometry from the d3-shape generators", () => {
    const { container } = render(
      <TierDoughnut
        tier="committed"
        tierTotal={1650}
        subcategories={mockSubcategories}
        items={mockItems}
        isSnapshot={true}
      />
    );
    // One <path> per subcategory, each with real arc path data from arc()/pie().
    const paths = container.querySelectorAll("svg path");
    expect(paths.length).toBe(mockSubcategories.length);
    paths.forEach((p) => {
      expect(p.getAttribute("d")?.startsWith("M")).toBe(true);
    });
  });

  it("renders subcategory names in the legend", () => {
    render(
      <TierDoughnut
        tier="committed"
        tierTotal={1650}
        subcategories={mockSubcategories}
        items={mockItems}
        isSnapshot={false}
      />
    );
    expect(screen.getByText("Mortgage")).toBeTruthy();
    expect(screen.getByText("Insurance")).toBeTruthy();
    expect(screen.getByText("Utilities")).toBeTruthy();
  });

  it("shows 'No items' when subcategories is empty", () => {
    render(
      <TierDoughnut
        tier="committed"
        tierTotal={0}
        subcategories={[]}
        items={[]}
        isSnapshot={false}
      />
    );
    expect(screen.getByText("No items")).toBeTruthy();
  });

  it("drills down on segment click and shows back link", () => {
    render(
      <TierDoughnut
        tier="committed"
        tierTotal={1650}
        subcategories={mockSubcategories}
        items={mockItems}
        isSnapshot={false}
      />
    );

    // Click the "Insurance" segment
    const segments = screen.getAllByRole("button");
    const insuranceSegment = segments.find((s) =>
      s.getAttribute("aria-label")?.includes("Insurance")
    );
    if (insuranceSegment) fireEvent.click(insuranceSegment);

    // Should show item names and back link
    expect(screen.getByText("Home Insurance")).toBeTruthy();
    expect(screen.getByText("Car Insurance")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
    // Centre text should show subcategory total
    expect(screen.getByText("£300")).toBeTruthy();
  });

  it("returns to subcategory view on back click", () => {
    render(
      <TierDoughnut
        tier="committed"
        tierTotal={1650}
        subcategories={mockSubcategories}
        items={mockItems}
        isSnapshot={false}
      />
    );

    // Drill down
    const segments = screen.getAllByRole("button");
    const insuranceSegment = segments.find((s) =>
      s.getAttribute("aria-label")?.includes("Insurance")
    );
    if (insuranceSegment) fireEvent.click(insuranceSegment);

    // Click back
    fireEvent.click(screen.getByText("Back"));

    // Should be back to subcategory view
    expect(screen.getByText("Mortgage")).toBeTruthy();
    expect(screen.getByText("£1,650")).toBeTruthy();
    expect(screen.queryByText("Back")).toBeNull();
  });

  it("disables drill-down in snapshot mode", () => {
    render(
      <TierDoughnut
        tier="committed"
        tierTotal={1650}
        subcategories={mockSubcategories}
        items={mockItems}
        isSnapshot={true}
      />
    );

    // Segments should not be clickable
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(0);
  });
});
