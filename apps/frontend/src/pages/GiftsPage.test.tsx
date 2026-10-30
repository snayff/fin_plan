import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import GiftsPage from "./GiftsPage";

mock.module("@/hooks/useGifts", () => ({
  useGiftsState: () => ({
    isLoading: false,
    data: {
      mode: "synced",
      year: 2026,
      isReadOnly: false,
      budget: {
        annualBudget: 1000,
        planned: 0,
        spent: 0,
        plannedOverBudgetBy: 0,
        spentOverBudgetBy: 0,
      },
      people: [
        {
          id: "p1",
          name: "Mum",
          isHouseholdMember: false,
          plannedCount: 0,
          boughtCount: 0,
          plannedTotal: 0,
          spentTotal: 0,
          hasOverspend: false,
          sortOrder: 0,
          notes: null,
        },
      ],
      rolloverPending: false,
    },
  }),
  useGiftsYears: () => ({ data: [2026], isLoading: false }),
}));
mock.module("@/components/gifts/GiftsModePanel", () => ({
  GiftsModePanel: () => <div data-testid="gifts-mode" />,
}));
mock.module("@/components/gifts/UpcomingModePanel", () => ({
  UpcomingModePanel: () => <div data-testid="upcoming-mode" />,
}));
mock.module("@/components/gifts/ConfigModePanel", () => ({
  ConfigModePanel: () => <div data-testid="config-mode" />,
}));
mock.module("@/components/gifts/YearRolloverBanner", () => ({
  YearRolloverBanner: () => null,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("GiftsPage", () => {
  it("renders the gifts mode panel by default", () => {
    render(<GiftsPage />, { wrapper });
    expect(screen.getByTestId("gifts-mode")).toBeInTheDocument();
  });

  it("switches to upcoming when the tab is clicked", () => {
    render(<GiftsPage />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /upcoming/i }));
    expect(screen.getByTestId("upcoming-mode")).toBeInTheDocument();
  });

  it("switches to config when the tab is clicked", () => {
    render(<GiftsPage />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /config/i }));
    expect(screen.getByTestId("config-mode")).toBeInTheDocument();
  });
});
