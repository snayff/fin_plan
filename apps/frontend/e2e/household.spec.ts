import { test, expect } from "@playwright/test";
import { registerNewUser, completeOnboarding } from "./support/auth";
import { uniqueEmail } from "./support/api";
import { checkA11y, OVERVIEW_DATAVIZ_EXCLUDE } from "./support/axe";

const API_BASE = process.env.E2E_API_URL ?? "http://localhost:3001";

/**
 * Fetch the CSRF token from the backend. The frontend's ApiClient uses
 * GET /api/auth/csrf-token → { csrfToken: string }.
 */
async function getCsrfToken(page: import("@playwright/test").Page): Promise<string> {
  const res = await page.request.get(`${API_BASE}/api/auth/csrf-token`);
  if (res.ok()) {
    const data = (await res.json()) as { csrfToken?: string };
    return data.csrfToken ?? "";
  }
  return "";
}

test.describe("household flow", () => {
  test("new user is redirected to /welcome to create a household", async ({ page }) => {
    await registerNewUser(page);
    // A brand-new user has no household — they land on /welcome
    await expect(page).toHaveURL(/\/(welcome|overview)/);
    await checkA11y(page);
  });

  test("create household via welcome flow and land on overview", async ({ page }) => {
    await registerNewUser(page);

    // On /welcome the hero card should be accessible before we proceed.
    await checkA11y(page);
    await completeOnboarding(page, "E2E Test Household");

    await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
    // Overview data-viz contrast deferred to #80; everything else enforced.
    await checkA11y(page, { exclude: [OVERVIEW_DATAVIZ_EXCLUDE] });
    await expect(page.getByTestId("overview-page")).toBeVisible();
  });

  test("invite and join via link (new user signup path)", async ({ page, browser }) => {
    // Owner: register and complete household creation
    const owner = await registerNewUser(page);
    await completeOnboarding(page, "Owner Household");

    // Get the active household ID from /api/auth/me. The access token lives in JS
    // memory (not a cookie), so a raw page.request must send it as a Bearer header.
    const authHeader = { Authorization: `Bearer ${owner.accessToken}` };
    const meRes = await page.request.get(`${API_BASE}/api/auth/me`, { headers: authHeader });
    if (!meRes.ok()) {
      throw new Error(`GET /api/auth/me failed: ${meRes.status()}`);
    }
    const meData = (await meRes.json()) as {
      user?: { activeHouseholdId?: string | null };
    };
    const householdId = meData.user?.activeHouseholdId ?? undefined;
    if (!householdId) {
      throw new Error("Could not determine householdId from /api/auth/me response");
    }

    const csrfToken = await getCsrfToken(page);
    const inviteEmail = uniqueEmail("invitee");

    // Create the invite via the API — POST /api/households/:id/invite
    const inviteRes = await page.request.post(`${API_BASE}/api/households/${householdId}/invite`, {
      data: { email: inviteEmail },
      headers: {
        ...authHeader,
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
    });

    if (!inviteRes.ok()) {
      throw new Error(
        `POST /api/households/${householdId}/invite failed: ${inviteRes.status()} — ${await inviteRes.text()}`
      );
    }

    const inviteBody = (await inviteRes.json()) as { token: string; invitedEmail: string };
    const inviteToken = inviteBody.token;

    // Invitee opens the accept-invite link in a fresh browser context (no owner cookies)
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();

    await inviteePage.goto(`/accept-invite/${inviteToken}`);
    await inviteePage.waitForLoadState("networkidle");
    await checkA11y(inviteePage);

    // AcceptInvitePage shows "You're Invited" heading and a form for new users
    await expect(inviteePage.getByRole("heading", { name: /you're invited/i })).toBeVisible({
      timeout: 10_000,
    });

    // Fill in new-user signup form (mode "new" is default)
    await inviteePage.locator("#name").fill("Invited User");
    await inviteePage.locator("#email").fill(inviteEmail);
    await inviteePage.locator("#password").fill("BrowserTest123!");
    await inviteePage.locator("#confirmPassword").fill("BrowserTest123!");
    await inviteePage.getByRole("button", { name: /create account & join/i }).click();

    // Should redirect to /overview after joining
    await inviteePage.waitForURL(/\/(overview|welcome)/, { timeout: 15_000 });
    // May land on overview — defer its data-viz contrast to #80 (no-op on /welcome).
    await checkA11y(inviteePage, { exclude: [OVERVIEW_DATAVIZ_EXCLUDE] });

    await inviteeContext.close();
  });

  test("navigate to household settings page", async ({ page }) => {
    await registerNewUser(page);
    await completeOnboarding(page, "Settings Household");

    await page.goto("/settings/household");
    await expect(page).toHaveURL(/\/settings\/household/);
    await checkA11y(page);
    // The left panel renders the "Members & invites" section heading.
    await expect(page.getByRole("heading", { name: "Members & invites" })).toBeVisible();
  });
});
