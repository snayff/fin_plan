import { describe, it, expect } from "bun:test";
import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { server } from "@/test/msw/server";
import { ReviewWizard } from "./ReviewWizard";

/**
 * #113 — the same waterfall item must never appear in two review steps.
 *
 * The API quirks under test:
 *   - GET /api/waterfall/committed returns *every* committed item, including
 *     yearly/quarterly ones (which also surface via /yearly).
 *   - GET /api/waterfall/discretionary already includes the Savings
 *     subcategory (which also surfaces via /savings).
 */
function seedWaterfall() {
  const monthlyBill = {
    id: "c-monthly",
    name: "Council Tax",
    spendType: "monthly",
    amount: 180,
    lastReviewedAt: new Date().toISOString(),
  };
  const yearlyBill = {
    id: "c-yearly",
    name: "Car Insurance",
    spendType: "yearly",
    amount: 600,
    lastReviewedAt: new Date().toISOString(),
  };
  const discCategory = {
    id: "d-dining",
    name: "Dining Out",
    spendType: "monthly",
    monthlyBudget: 200,
    lastReviewedAt: new Date().toISOString(),
  };
  const savingsItem = {
    id: "d-savings",
    name: "ISA Top-up",
    spendType: "monthly",
    monthlyBudget: 300,
    lastReviewedAt: new Date().toISOString(),
  };

  server.use(
    http.get("/api/review-session", () =>
      HttpResponse.json({ currentStep: 0, confirmedItems: {}, updatedItems: {} })
    ),
    http.get("/api/waterfall/income", () => HttpResponse.json([])),
    http.get("/api/waterfall/committed", () => HttpResponse.json([monthlyBill, yearlyBill])),
    http.get("/api/waterfall/yearly", () => HttpResponse.json([yearlyBill])),
    http.get("/api/waterfall/discretionary", () => HttpResponse.json([discCategory, savingsItem])),
    http.get("/api/waterfall/savings", () => HttpResponse.json([savingsItem])),
    http.get("/api/waterfall/summary", () =>
      HttpResponse.json({ surplus: { amount: 0, percentOfIncome: 0 } })
    )
  );
}

async function clickNext() {
  fireEvent.click(await screen.findByRole("button", { name: /next/i }));
}

describe("ReviewWizard — no duplicate items across steps (#113)", () => {
  it("does not show yearly bills in the monthly committed step", async () => {
    seedWaterfall();
    renderWithProviders(<ReviewWizard onClose={() => {}} />);

    // Step 0 (Income) → advance to Step 1 (Monthly Bills).
    await clickNext();

    expect(await screen.findByText("Council Tax")).toBeTruthy();
    // The yearly bill must NOT appear here — it has its own step.
    expect(screen.queryByText("Car Insurance")).toBeNull();
  });

  it("shows each item id exactly once across all steps", async () => {
    seedWaterfall();
    renderWithProviders(<ReviewWizard onClose={() => {}} />);

    const seen: string[] = [];
    const collect = (...names: string[]) => {
      for (const name of names) {
        if (screen.queryByText(name)) seen.push(name);
      }
    };

    // Step 1 — Monthly Bills
    await clickNext();
    await screen.findByText("Council Tax");
    collect("Council Tax", "Car Insurance", "Dining Out", "ISA Top-up");

    // Step 2 — Yearly Bills
    await clickNext();
    await screen.findByText("Car Insurance");
    collect("Council Tax", "Car Insurance", "Dining Out", "ISA Top-up");

    // Step 3 — Discretionary (includes Savings subcategory once)
    await clickNext();
    await screen.findByText("Dining Out");
    collect("Council Tax", "Car Insurance", "Dining Out", "ISA Top-up");

    await waitFor(() => expect(screen.queryByText("ISA Top-up")).toBeTruthy());

    // Every item appears exactly once across the wizard — no duplicates.
    const counts = seen.reduce<Record<string, number>>((acc, n) => {
      acc[n] = (acc[n] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts["Council Tax"]).toBe(1);
    expect(counts["Car Insurance"]).toBe(1);
    expect(counts["Dining Out"]).toBe(1);
    expect(counts["ISA Top-up"]).toBe(1);
  });
});
