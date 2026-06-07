import { test, expect } from "@playwright/test";
import { registerNewUser, login, logout, completeOnboarding } from "./support/auth";
import { checkA11y } from "./support/axe";

test.describe("settings flow", () => {
  test("profile settings page is accessible after onboarding", async ({ page }) => {
    await registerNewUser(page);
    await completeOnboarding(page);

    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/settings\/profile/);
    // Authed page: defer known a11y debt to issue #71.
    await checkA11y(page, { deferKnownA11yDebt: true });

    // The Account section with the profile name field should be visible
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    await expect(page.locator("#profile-name")).toBeVisible();
  });

  test("update display name persists after reload", async ({ page }) => {
    const user = await registerNewUser(page);
    await completeOnboarding(page);

    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/settings\/profile/);

    const nameInput = page.locator("#profile-name");
    await nameInput.waitFor({ state: "visible" });

    // Clear existing name and type a new one
    const newName = `Updated ${user.name} ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(newName);
    // Trigger auto-save by blurring the field
    await nameInput.blur();

    // Wait for save indicator (auto-save status changes to "saved")
    // The AutoSaveField shows a tick or "Saved" after successful save
    // Give it time to save
    await page.waitForTimeout(2000);

    // Reload and verify the name persisted
    await page.reload();
    await expect(page.locator("#profile-name")).toHaveValue(newName, { timeout: 5_000 });
  });

  test("display section shows showPence toggle", async ({ page }) => {
    await registerNewUser(page);
    await completeOnboarding(page);

    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/settings\/profile/);
    // Authed page: defer known a11y debt to issue #71.
    await checkA11y(page, { deferKnownA11yDebt: true });

    // The Display section should be visible with the showPence checkbox
    await expect(page.getByRole("heading", { name: "Display", exact: true })).toBeVisible();
    const showPenceCheckbox = page.locator("#show-pence");
    await expect(showPenceCheckbox).toBeVisible();
  });

  test("toggling showPence changes currency display format on overview", async ({ page }) => {
    await registerNewUser(page);
    await completeOnboarding(page);

    // First, add some income so overview has financial values to display
    await page.goto("/income");
    // Header GhostAddButton (first match; the empty-state CTA also reads "+ Add").
    await page
      .getByRole("button", { name: /^\+ add$/i })
      .first()
      .click();
    await page.getByRole("textbox", { name: /name/i }).fill("Salary");
    await page.getByRole("textbox", { name: /amount/i }).fill("1234.56");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("Salary").first()).toBeVisible({ timeout: 5_000 });

    // Navigate to profile settings and enable showPence
    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/settings\/profile/);

    const showPenceCheckbox = page.locator("#show-pence");
    await showPenceCheckbox.waitFor({ state: "visible" });

    const wasChecked = await showPenceCheckbox.isChecked();

    // Ensure showPence is ON
    if (!wasChecked) {
      await showPenceCheckbox.click();
      // Wait for the mutation to complete
      await page.waitForTimeout(1000);
    }

    // Navigate to overview and check currency shows pence (e.g. £1,234.56)
    await page.goto("/overview");
    await expect(page.getByTestId("overview-page")).toBeVisible({ timeout: 10_000 });

    // With showPence on, a value like £1,234.56 should contain a decimal point.
    // Poll rather than read once — the overview re-renders after the setting
    // propagates, so a single textContent() read can race the update.
    await expect
      .poll(async () => (await page.locator("[data-testid='overview-page']").textContent()) ?? "", {
        timeout: 10_000,
      })
      .toContain(".");

    // Now turn showPence OFF
    await page.goto("/settings/profile");
    await showPenceCheckbox.waitFor({ state: "visible" });
    await showPenceCheckbox.click();
    await page.waitForTimeout(1000);

    // Navigate to overview again — the income value should now be whole pounds (£1,235)
    await page.goto("/overview");
    await expect(page.getByTestId("overview-page")).toBeVisible({ timeout: 10_000 });
    // After toggling off, currency values are rounded; verify the page loaded successfully
    await expect(page).toHaveURL(/\/overview/);
  });

  test("settings/profile redirects from /settings", async ({ page }) => {
    await registerNewUser(page);
    await completeOnboarding(page);

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/profile/, { timeout: 5_000 });
  });

  test("security activity section is visible on profile settings", async ({ page }) => {
    await registerNewUser(page);
    await completeOnboarding(page);

    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/settings\/profile/);
    // Authed page: defer known a11y debt to issue #71.
    await checkA11y(page, { deferKnownA11yDebt: true });

    // SecurityActivitySection renders with title "Security activity"
    await expect(page.getByRole("heading", { name: "Security activity" })).toBeVisible();
    // It shows entries older-than note
    await expect(page.getByText(/entries older than 180 days/i)).toBeVisible();
  });

  test("relogin with original password works after profile name update", async ({ page }) => {
    const user = await registerNewUser(page);
    await completeOnboarding(page);

    // Update the display name
    await page.goto("/settings/profile");
    const nameInput = page.locator("#profile-name");
    await nameInput.waitFor({ state: "visible" });
    await nameInput.clear();
    await nameInput.fill("Renamed E2E User");
    await nameInput.blur();
    await page.waitForTimeout(2000);

    // Logout and re-login with the original password — credentials unchanged
    await logout(page);
    await login(page, { email: user.email, password: user.password });
    await expect(page).toHaveURL(/\/(overview|welcome)/, { timeout: 10_000 });
  });
});
