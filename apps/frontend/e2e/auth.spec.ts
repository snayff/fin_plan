import { test, expect } from "@playwright/test";
import { registerNewUser, login, logout, completeOnboarding } from "./support/auth";
import { uniqueEmail } from "./support/api";
import { checkA11y, OVERVIEW_DATAVIZ_EXCLUDE } from "./support/axe";

test.describe("auth flow", () => {
  test("signup → access authed page → logout → authed page redirects to login", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("auth");
    const password = "BrowserTest123!";

    await page.goto("/register");
    await checkA11y(page);

    await registerNewUser(page, { email, password });

    // New users land on /welcome with no household — complete onboarding so we
    // reach /overview (the authed shell, which has the profile menu for logout).
    await completeOnboarding(page);
    await expect(page).toHaveURL(/\/overview/);
    // Overview data-viz contrast deferred to #80; everything else enforced.
    await checkA11y(page, { exclude: [OVERVIEW_DATAVIZ_EXCLUDE] });

    await logout(page);

    // Cookie should be cleared (refreshToken gone or empty)
    const cookies = await context.cookies();
    const refresh = cookies.find((c) => c.name === "refreshToken");
    expect(refresh?.value ?? "").toBe("");

    // Protected route should redirect to /login
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    await checkA11y(page);
  });

  test("login with valid credentials lands on authed area", async ({ page }) => {
    const user = await registerNewUser(page);
    await completeOnboarding(page);
    await logout(page);
    await login(page, user);
    await expect(page).toHaveURL(/\/(overview|onboarding|welcome)/);
  });

  test("login with wrong password shows generic error", async ({ page }) => {
    const user = await registerNewUser(page);
    await completeOnboarding(page);
    await logout(page);

    await page.goto("/login");
    await checkA11y(page);

    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill("WrongPassword!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // LoginPage renders the API error message in a div inside the form
    // Backend returns "Invalid credentials" as the generic message
    await expect(
      page
        .locator("form div")
        .filter({ hasText: /invalid credentials/i })
        .first()
    ).toBeVisible({ timeout: 5_000 });

    // Must still be on /login — no redirect
    await expect(page).toHaveURL(/\/login/);
  });
});
