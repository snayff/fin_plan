import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false } }),
}));

import { NetWorthCard } from "./NetWorthCard";

describe("NetWorthCard", () => {
  it("renders the CTA when netWorth is null", () => {
    renderWithProviders(<NetWorthCard netWorth={null} sparklineData={[]} />);

    expect(screen.getByText("Track your wealth over time")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Add wealth account" });
    expect(link.getAttribute("href")).toBe("/assets");
    expect(screen.queryByText("£—")).toBeNull();
  });

  it("renders the populated card with amount and sparkline when netWorth is provided", () => {
    renderWithProviders(<NetWorthCard netWorth={50000} sparklineData={[]} />);

    expect(screen.getByText("NET WORTH (EXCL. PENSIONS)")).toBeTruthy();
    expect(screen.getByText(/£50,000/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add wealth account" })).toBeNull();
  });
});
