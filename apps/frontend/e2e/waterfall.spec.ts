import { test, expect } from "@playwright/test";
import { registerNewUser, completeOnboarding } from "./support/auth";
import { checkA11y } from "./support/axe";

test.describe("waterfall flow", () => {
  test("add income item, add committed item, overview loads with data", async ({ page }) => {
    await registerNewUser(page);
    await completeOnboarding(page, "Waterfall Household");

    // ── Income ──────────────────────────────────────────────────────────────
    await page.goto("/income");
    await expect(page).toHaveURL(/\/income/);
    await checkA11y(page);

    // The right panel header contains the "+ Add" GhostAddButton (first match;
    // the empty-state CTA also reads "+ Add").
    await page
      .getByRole("button", { name: /^\+ add$/i })
      .first()
      .click();

    // ItemForm opens — fill required fields
    await page.getByRole("textbox", { name: /name/i }).fill("Salary");
    await page.getByRole("textbox", { name: /amount/i }).fill("5000");
    // Frequency defaults to "monthly" — no change needed
    // Due date (first payment) defaults to today — no change needed

    // Save the item — the form has a Save button
    await page.getByRole("button", { name: /save/i }).click();

    // The new item should appear in the list (the name also echoes in the
    // waterfall left panel / overview, so scope to the first match).
    await expect(page.getByText("Salary").first()).toBeVisible({ timeout: 5_000 });

    // ── Committed ───────────────────────────────────────────────────────────
    await page.goto("/committed");
    await expect(page).toHaveURL(/\/committed/);
    await checkA11y(page);

    await page
      .getByRole("button", { name: /^\+ add$/i })
      .first()
      .click();

    await page.getByRole("textbox", { name: /name/i }).fill("Rent");
    await page.getByRole("textbox", { name: /amount/i }).fill("1200");

    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText("Rent").first()).toBeVisible({ timeout: 5_000 });

    // ── Overview ─────────────────────────────────────────────────────────────
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/overview/);
    await checkA11y(page);

    // The overview page renders the waterfall left panel and a financial summary.
    // At minimum the overview page container should be visible.
    await expect(page.getByTestId("overview-page")).toBeVisible({ timeout: 10_000 });

    // The financial summary panel should load (not stay in loading state forever)
    await expect(page.getByTestId("financial-summary-panel")).toBeVisible({ timeout: 10_000 });
  });
});
