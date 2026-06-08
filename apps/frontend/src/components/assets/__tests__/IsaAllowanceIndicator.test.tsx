import { describe, it, expect } from "bun:test";
import { screen } from "@testing-library/react";
import { IsaAllowanceIndicator } from "../IsaAllowanceIndicator";
import { renderWithProviders } from "@/test/helpers/render";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";

const empty = {
  taxYearStart: "2026-04-06",
  taxYearEnd: "2027-04-05",
  daysRemaining: 200,
  annualLimit: 20000,
  byMember: [],
};

describe("IsaAllowanceIndicator", () => {
  it("renders nothing when byMember is empty", async () => {
    server.use(http.get("/api/accounts/isa-allowance", () => HttpResponse.json(empty)));
    const { container } = renderWithProviders(<IsaAllowanceIndicator />);
    // Wait for query to settle, then check
    await new Promise((r) => setTimeout(r, 100));
    expect(container.querySelector("[data-testid='isa-allowance-indicator']")).toBeNull();
  });

  it("renders one bar per member and shows the deadline line", async () => {
    server.use(
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          ...empty,
          byMember: [
            {
              memberId: "m1",
              name: "Alice",
              used: 12400,
              forecast: 5600,
              forecastedYearTotal: 18000,
              monthlyPlanned: 500,
              estimatedFlag: false,
            },
            {
              memberId: "m2",
              name: "Bob",
              used: 14000,
              forecast: 9000,
              forecastedYearTotal: 23000,
              monthlyPlanned: 750,
              estimatedFlag: false,
            },
          ],
        })
      )
    );
    renderWithProviders(<IsaAllowanceIndicator />);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText(/Resets 6 April/i)).toBeInTheDocument();
  });

  it("renders a single nudge when most-over member exists", async () => {
    server.use(
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          ...empty,
          byMember: [
            {
              memberId: "m1",
              name: "Alice",
              used: 12000,
              forecast: 9000,
              forecastedYearTotal: 21000,
              monthlyPlanned: 750,
              estimatedFlag: false,
            },
            {
              memberId: "m2",
              name: "Bob",
              used: 14000,
              forecast: 12000,
              forecastedYearTotal: 26000,
              monthlyPlanned: 1000,
              estimatedFlag: false,
            },
          ],
        })
      )
    );
    renderWithProviders(<IsaAllowanceIndicator />);
    // Wait for query to resolve — find the nudge paragraph that mentions Bob
    const nudgeEl = await screen.findByText(/Bob's planned contributions/);
    expect(nudgeEl).toBeInTheDocument();
    expect(nudgeEl.textContent).toContain("£26,000");
    expect(nudgeEl.textContent).toContain("£6,000 over");
  });
});
