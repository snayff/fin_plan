import { describe, it, expect, beforeEach } from "bun:test";
import { http, HttpResponse } from "msw";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { server } from "@/test/msw/server";
import ForecastPage from "./ForecastPage";

const projectionFixture = {
  startingBalance: 1000,
  latestKnownBalance: 1000,
  windowStart: { year: 2026, month: 4 },
  months: Array.from({ length: 12 }, (_, i) => ({
    year: 2026,
    month: ((i + 3) % 12) + 1,
    netChange: 100,
    openingBalance: 1000,
    closingBalance: 1100,
    dipBelowZero: false,
    tightestPoint: { value: 1000, day: 1 },
  })),
  projectedEndBalance: 2200,
  tightestDip: { value: 800, date: "2026-04-15" },
  avgMonthlySurplus: 100,
  oldestLinkedBalanceDate: "2026-04-01",
  youngestLinkedBalanceDate: "2026-04-01",
  linkedAccountCount: 1,
};

describe("ForecastPage two-panel layout", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/cashflow/projection", () => HttpResponse.json(projectionFixture)),
      http.get("/api/cashflow/linkable-accounts", () => HttpResponse.json([])),
      http.get("/api/forecast", () =>
        HttpResponse.json({ horizonYears: 10, inflationRate: 0.025, scenarios: [] })
      )
    );
  });

  it("renders the section navigator with Cashflow and Growth entries", () => {
    renderWithProviders(<ForecastPage />, { initialEntries: ["/forecast"] });
    // Use navigation landmark to disambiguate from cashflow panel content buttons
    const nav = screen.getByRole("navigation", { name: /forecast sections/i });
    expect(nav).toBeTruthy();
    expect(nav.querySelector('button[aria-current="true"]')?.textContent).toMatch(/cashflow/i);
  });

  it("defaults to Cashflow on first visit", () => {
    renderWithProviders(<ForecastPage />, { initialEntries: ["/forecast"] });
    const nav = screen.getByRole("navigation", { name: /forecast sections/i });
    const navButtons = Array.from(nav.querySelectorAll("button"));
    const cashflowNav = navButtons.find((b) => /cashflow/i.test(b.textContent ?? ""));
    expect(cashflowNav?.getAttribute("aria-current")).toBe("true");
  });

  it("switches to Growth when Growth is clicked", async () => {
    renderWithProviders(<ForecastPage />, { initialEntries: ["/forecast"] });
    const nav = screen.getByRole("navigation", { name: /forecast sections/i });
    const growthNav = Array.from(nav.querySelectorAll("button")).find((b) =>
      /growth/i.test(b.textContent ?? "")
    );
    fireEvent.click(growthNav!);
    // GrowthSectionPanel renders the TimeHorizonSelector group
    expect(await screen.findByRole("group", { name: /time horizon/i })).toBeTruthy();
  });
});
