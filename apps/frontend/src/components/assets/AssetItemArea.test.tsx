import { describe, it, expect } from "bun:test";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { AssetItemArea } from "./AssetItemArea";
import { renderWithProviders } from "@/test/helpers/render";
import { server } from "@/test/msw/server";
import type { AssetItem } from "../../services/assets.service";

function makeAsset(overrides: Partial<AssetItem> = {}): AssetItem {
  return {
    id: "as1",
    name: "Family Home",
    type: "Property",
    householdId: "h1",
    memberId: null,
    growthRatePct: null,
    lastReviewedAt: null,
    disposedAt: null,
    disposalAccountId: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    currentBalance: 250000,
    currentBalanceDate: "2025-06-01T00:00:00.000Z",
    balances: [],
    ...overrides,
  };
}

/** Register the active + disposed list endpoints for a Property asset type. */
function useAssets(active: AssetItem[], disposed: AssetItem[] = active) {
  server.use(
    http.get("/api/assets/assets/Property", ({ request }) => {
      const url = new URL(request.url);
      return HttpResponse.json(url.searchParams.get("disposed") === "true" ? disposed : active);
    })
  );
}

describe("AssetItemArea", () => {
  it("renders the type header, count and total once loaded", async () => {
    useAssets([makeAsset()]);
    renderWithProviders(<AssetItemArea type="Property" />);
    expect(await screen.findByText("Family Home")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Property" })).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("shows the empty state when there are no items", async () => {
    useAssets([]);
    renderWithProviders(<AssetItemArea type="Property" />);
    expect(await screen.findByText(/Add your first Property/)).toBeInTheDocument();
  });

  it("shows an error state with a retry button when the list fails", async () => {
    server.use(
      http.get("/api/assets/assets/Property", () => new HttpResponse(null, { status: 500 }))
    );
    renderWithProviders(<AssetItemArea type="Property" />);
    expect(await screen.findByText(/Failed to load Property items/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("opens the add form when the ghost add button is clicked", async () => {
    useAssets([]);
    renderWithProviders(<AssetItemArea type="Property" />);
    await screen.findByText(/Add your first Property/);
    // GhostAddButton has an accessible label; fall back to the first button in the header
    const addButtons = screen.getAllByRole("button");
    const ghost = addButtons.find((b) =>
      /add/i.test(b.getAttribute("aria-label") ?? b.textContent ?? "")
    );
    fireEvent.click(ghost ?? addButtons[0]!);
    expect(await screen.findByLabelText("Name")).toBeInTheDocument();
  });

  it("starts with the add form open when initialIsAdding is set", async () => {
    useAssets([]);
    renderWithProviders(<AssetItemArea type="Property" initialIsAdding />);
    expect(await screen.findByLabelText("Name")).toBeInTheDocument();
  });

  it("renders a collapsible Disposed section for past disposals", async () => {
    const disposed = makeAsset({
      id: "as2",
      name: "Old Flat",
      disposedAt: "2020-01-01T00:00:00.000Z",
    });
    useAssets([], [disposed]);
    renderWithProviders(<AssetItemArea type="Property" />);
    const toggle = await screen.findByRole("button", { name: /Disposed \(1\)/ });
    fireEvent.click(toggle);
    expect(await screen.findByText("Old Flat")).toBeInTheDocument();
  });

  it("opens the delete confirmation dialog from a disposed item", async () => {
    const disposed = makeAsset({
      id: "as2",
      name: "Old Flat",
      disposedAt: "2020-01-01T00:00:00.000Z",
    });
    useAssets([], [disposed]);
    renderWithProviders(<AssetItemArea type="Property" />);
    fireEvent.click(await screen.findByRole("button", { name: /Disposed \(1\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByText(/will be permanently removed/)).toBeInTheDocument()
    );
  });
});
