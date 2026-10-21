import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ItemArea from "./ItemArea";
import { TIER_CONFIGS } from "./tierConfig";

mock.module("@/hooks/useWaterfall", () => ({
  useCreateItem: mock(() => ({ mutateAsync: mock(() => Promise.resolve()), isPending: false })),
  useTierUpdateItem: mock(() => ({ mutateAsync: mock(() => Promise.resolve()), isPending: false })),
  useConfirmWaterfallItem: mock(() => ({
    mutateAsync: mock(() => Promise.resolve()),
    isPending: false,
  })),
  useDeleteItem: mock(() => ({ mutateAsync: mock(() => Promise.resolve()), isPending: false })),
}));

const subcategory = {
  id: "sub-housing",
  name: "Housing",
  tier: "committed" as const,
  sortOrder: 0,
  isLocked: false,
};

const items = [
  {
    id: "item-rent",
    name: "Rent",
    amount: 1200,
    spendType: "monthly" as const,
    subcategoryId: "sub-housing",
    notes: null,
    lastReviewedAt: new Date("2025-12-01"),
    sortOrder: 0,
  },
];

const subcategories = [{ id: "sub-housing", name: "Housing" }];

function renderArea(itemList = items) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ItemArea
          tier="committed"
          config={TIER_CONFIGS.committed}
          subcategory={subcategory}
          subcategories={subcategories}
          items={itemList}
          isLoading={false}
          now={new Date("2026-01-15")}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ItemArea", () => {
  it("renders the subcategory header", () => {
    renderArea();
    expect(screen.getByText("Housing")).toBeTruthy();
  });

  it("renders item count", () => {
    renderArea();
    expect(screen.getByText(/1 item/i)).toBeTruthy();
  });

  it("renders item rows", () => {
    renderArea();
    expect(screen.getByText("Rent")).toBeTruthy();
  });

  it("shows empty state when no items", () => {
    renderArea([]);
    expect(screen.getByText(/rent, mortgage, council tax/i)).toBeTruthy();
  });

  it("shows add form when GhostAddButton is clicked", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: /\+ add/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. Mortgage, Council Tax")).toBeTruthy();
    });
  });

  it("expands accordion when item row is clicked", async () => {
    renderArea();
    fireEvent.click(screen.getByTestId("item-row-item-rent"));
    await waitFor(() => {
      expect(screen.getByText("Notes")).toBeTruthy(); // accordion shows notes section
    });
  });

  it("empty state CTA card uses correct gradient opacity", () => {
    const { container } = renderArea([]);
    const allElements = container.querySelectorAll("*");
    const ctaCard = Array.from(allElements).find((el) =>
      (el as HTMLElement).style?.background?.includes("linear-gradient")
    ) as HTMLElement;
    expect(ctaCard).toBeTruthy();
    expect(ctaCard.style.background).toContain("0.08");
  });

  it("collapses accordion when same row is clicked again", async () => {
    renderArea();
    fireEvent.click(screen.getByTestId("item-row-item-rent"));
    await waitFor(() => expect(screen.getByText("Notes")).toBeTruthy());
    fireEvent.click(screen.getByTestId("item-row-item-rent"));
    await waitFor(() => {
      expect(screen.queryByText("Notes")).toBeNull();
    });
  });

  it("renders a 'View all' link pointing to /waterfall#committed", () => {
    renderArea();
    const link = screen.getByRole("link", { name: /view all/i });
    expect(link.getAttribute("href")).toBe("/waterfall#committed");
  });
});

const giftsSubcategory = {
  id: "sub-gifts",
  name: "Gifts",
  tier: "discretionary" as const,
  sortOrder: 3,
  isLocked: true,
};

function renderGifts(opts: { synced: boolean; itemList?: typeof items }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ItemArea
          tier="discretionary"
          config={TIER_CONFIGS.discretionary}
          subcategory={giftsSubcategory}
          subcategories={[{ id: "sub-gifts", name: "Gifts" }]}
          items={opts.itemList ?? []}
          isLoading={false}
          now={new Date("2026-01-15")}
          lockedManager={opts.synced ? { label: "Gift Planner", path: "/gifts" } : undefined}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ItemArea — Gifts subcategory (Gift Planner synced)", () => {
  it("renders a lock icon next to the title", () => {
    renderGifts({ synced: true });
    expect(screen.getByLabelText(/synced subcategory/i)).toBeTruthy();
  });

  it("shows an 'Open Gift Planner' link in the header", () => {
    renderGifts({ synced: true });
    const link = screen.getByRole("link", { name: /open gift planner/i });
    expect(link.getAttribute("href")).toBe("/gifts");
  });

  it("hides the '+ Add' button in the header", () => {
    renderGifts({ synced: true });
    expect(screen.queryByRole("button", { name: /\+ add/i })).toBeNull();
  });

  it("shows the synced empty-state card with an 'Open Gift Planner' button", () => {
    renderGifts({ synced: true });
    expect(screen.getByText(/managed in the gift planner/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /open gift planner/i })).toBeTruthy();
  });
});

describe("ItemArea — Gifts subcategory (Gift Planner independent)", () => {
  it("does not render the lock icon", () => {
    renderGifts({ synced: false });
    expect(screen.queryByLabelText(/synced subcategory/i)).toBeNull();
  });

  it("does not render the 'Open Gift Planner' link", () => {
    renderGifts({ synced: false });
    expect(screen.queryByRole("link", { name: /open gift planner/i })).toBeNull();
  });

  it("renders the '+ Add' button in the header", () => {
    renderGifts({ synced: false });
    // Empty-state CTA also renders a '+ Add' button, so at least one exists — the header one.
    expect(screen.getAllByRole("button", { name: /\+ add/i }).length).toBeGreaterThan(0);
  });

  it("renders the normal empty-state card (not the synced one)", () => {
    renderGifts({ synced: false });
    expect(screen.queryByText(/managed in the gift planner/i)).toBeNull();
  });
});

describe("ItemArea — planner-owned item", () => {
  const plannerItem = {
    id: "item-gifts",
    name: "Gifts",
    amount: 1200,
    spendType: "yearly" as const,
    subcategoryId: "sub-gifts",
    notes: null,
    lastReviewedAt: new Date("2026-01-01"),
    sortOrder: 0,
    isPlannerOwned: true,
  };

  it("expands read-only: no Edit button, links to the Gift Planner instead", async () => {
    renderGifts({ synced: true, itemList: [plannerItem] });
    fireEvent.click(screen.getByTestId("item-row-item-gifts"));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /managed in gift planner/i })).toBeTruthy()
    );
    expect(
      screen.getByRole("link", { name: /managed in gift planner/i }).getAttribute("href")
    ).toBe("/gifts");
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });

  it("stays read-only even before planner settings resolve", async () => {
    renderGifts({ synced: false, itemList: [plannerItem] });
    fireEvent.click(screen.getByTestId("item-row-item-gifts"));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /managed in gift planner/i })).toBeTruthy()
    );
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });
});
