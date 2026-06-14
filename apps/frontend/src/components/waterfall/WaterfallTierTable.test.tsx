import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { WaterfallTierTable } from "./WaterfallTierTable";

describe("WaterfallTierTable", () => {
  it("renders tier header with total and column headers", () => {
    render(
      <WaterfallTierTable
        tier="income"
        subcategories={[{ id: "s-1", name: "Salary", sortOrder: 0 }]}
        items={[]}
        members={[]}
        showPence={false}
        total={8856}
        onCreateSubcategory={() => Promise.resolve()}
        onSaveName={() => Promise.resolve()}
        onSaveAmount={() => Promise.resolve()}
        onDeleteItem={() => Promise.resolve()}
      />
    );
    expect(screen.getByText("INCOME")).toBeInTheDocument();
    expect(screen.getByText(/£8,856/)).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Assigned to")).toBeInTheDocument();
  });

  it("buckets orphaned items (unknown subcategoryId) under 'Uncategorised'", () => {
    render(
      <WaterfallTierTable
        tier="committed"
        subcategories={[{ id: "s-1", name: "Housing", sortOrder: 0 }]}
        items={
          [
            {
              id: "c-1",
              name: "Mortgage",
              amount: 1450,
              spendType: "monthly",
              subcategoryId: "s-1",
              notes: null,
              dueDate: null,
              lastReviewedAt: new Date(),
              createdAt: new Date(),
              sortOrder: 0,
            },
            {
              id: "c-2",
              name: "Orphan",
              amount: 10,
              spendType: "monthly",
              subcategoryId: "ghost-id",
              notes: null,
              dueDate: null,
              lastReviewedAt: new Date(),
              createdAt: new Date(),
              sortOrder: 0,
            },
          ] as any
        }
        members={[]}
        showPence={false}
        total={1460}
        onCreateSubcategory={() => Promise.resolve()}
        onSaveName={() => Promise.resolve()}
        onSaveAmount={() => Promise.resolve()}
        onDeleteItem={() => Promise.resolve()}
      />
    );
    expect(screen.getByText(/uncategorised/i)).toBeInTheDocument();
  });

  it("renders empty-state ghosted skeleton rows when items is empty and no subcategories", () => {
    const { container } = render(
      <WaterfallTierTable
        tier="committed"
        subcategories={[]}
        items={[]}
        members={[]}
        showPence={false}
        total={0}
        onCreateSubcategory={() => Promise.resolve()}
        onSaveName={() => Promise.resolve()}
        onSaveAmount={() => Promise.resolve()}
        onDeleteItem={() => Promise.resolve()}
      />
    );
    expect(container.querySelectorAll("[data-testid='ghost-skeleton-row']").length).toBeGreaterThan(
      0
    );
  });
});
