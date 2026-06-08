import { describe, it, expect } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { AccountItemArea } from "../AccountItemArea";
import { renderWithProviders } from "@/test/helpers/render";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";

describe("AccountItemArea — Savings ISA indicator", () => {
  it("mounts the IsaAllowanceIndicator below the account list for Savings", async () => {
    server.use(
      http.get("/api/assets/accounts/Savings", () => HttpResponse.json([])),
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          taxYearStart: "2026-04-06",
          taxYearEnd: "2027-04-05",
          daysRemaining: 200,
          annualLimit: 20000,
          byMember: [
            {
              memberId: "m1",
              name: "Alice",
              used: 5000,
              forecast: 0,
              forecastedYearTotal: 5000,
              monthlyPlanned: 0,
              estimatedFlag: false,
            },
          ],
        })
      )
    );
    renderWithProviders(<AccountItemArea type="Savings" />);
    expect(await screen.findByTestId("isa-allowance-indicator")).toBeInTheDocument();
  });

  it("does not mount the indicator for non-Savings types", async () => {
    server.use(
      http.get("/api/assets/accounts/Current", () => HttpResponse.json([])),
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          taxYearStart: "2026-04-06",
          taxYearEnd: "2027-04-05",
          daysRemaining: 200,
          annualLimit: 20000,
          byMember: [
            {
              memberId: "m1",
              name: "Alice",
              used: 5000,
              forecast: 0,
              forecastedYearTotal: 5000,
              monthlyPlanned: 0,
              estimatedFlag: false,
            },
          ],
        })
      )
    );
    renderWithProviders(<AccountItemArea type="Current" />);
    await waitFor(() => expect(screen.queryByTestId("isa-allowance-indicator")).toBeNull());
  });

  it("shows amber dot on an ISA row whose member is forecast over the cap", async () => {
    const accounts = [
      {
        id: "a1",
        name: "Bob ISA",
        type: "Savings",
        memberId: "m2",
        isISA: true,
        isaYearContribution: 14000,
        monthlyContribution: 0,
        monthlyContributionLimit: null,
        isOverCap: false,
        hasSpareCapacityNudge: false,
        currentBalance: 14000,
        currentBalanceDate: null,
        lastReviewedAt: new Date().toISOString(),
        growthRatePct: null,
        isCashflowLinked: false,
        disposedAt: null,
        disposalAccountId: null,
        householdId: "h1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        spareMonthly: null,
        higherRateTarget: null,
        effectiveGrowthRatePct: null,
        linkedItems: [],
        balances: [],
        memberName: null,
      },
    ];
    server.use(
      http.get("/api/assets/accounts/Savings", () => HttpResponse.json(accounts)),
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          taxYearStart: "2026-04-06",
          taxYearEnd: "2027-04-05",
          daysRemaining: 200,
          annualLimit: 20000,
          byMember: [
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
    renderWithProviders(<AccountItemArea type="Savings" />);
    expect(await screen.findByTestId("account-row-dot-a1")).toBeInTheDocument();
  });

  it("does not show amber dot on an ISA row whose member is within the forecast cap", async () => {
    const accounts = [
      {
        id: "a2",
        name: "Alice ISA",
        type: "Savings",
        memberId: "m1",
        isISA: true,
        isaYearContribution: 5000,
        monthlyContribution: 0,
        monthlyContributionLimit: null,
        isOverCap: false,
        hasSpareCapacityNudge: false,
        currentBalance: 5000,
        currentBalanceDate: null,
        lastReviewedAt: new Date().toISOString(),
        growthRatePct: null,
        isCashflowLinked: false,
        disposedAt: null,
        disposalAccountId: null,
        householdId: "h1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        spareMonthly: null,
        higherRateTarget: null,
        effectiveGrowthRatePct: null,
        linkedItems: [],
        balances: [],
        memberName: null,
      },
    ];
    server.use(
      http.get("/api/assets/accounts/Savings", () => HttpResponse.json(accounts)),
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          taxYearStart: "2026-04-06",
          taxYearEnd: "2027-04-05",
          daysRemaining: 200,
          annualLimit: 20000,
          byMember: [
            {
              memberId: "m1",
              name: "Alice",
              used: 5000,
              forecast: 3000,
              forecastedYearTotal: 8000,
              monthlyPlanned: 250,
              estimatedFlag: false,
            },
          ],
        })
      )
    );
    renderWithProviders(<AccountItemArea type="Savings" />);
    // Row renders (account list loads) but no amber dot
    await screen.findByText("Alice ISA");
    await waitFor(() => expect(screen.queryByTestId("account-row-dot-a2")).toBeNull());
  });
});
