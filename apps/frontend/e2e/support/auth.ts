import type { Page } from "@playwright/test";
import { uniqueEmail } from "./api";

export interface TestUser {
  email: string;
  password: string;
  name: string;
  /** Access token captured from the register response — for raw page.request calls. */
  accessToken: string;
}

/**
 * Wait for the post-auth redirect chain to settle before reading the URL.
 *
 * A freshly-registered user has no household, so the app redirects
 * /register → /overview → /welcome (NewUserRedirect). Waiting only for a URL
 * regex races that chain and resolves on the transient /overview, which then
 * causes onboarding helpers to mis-branch. Instead we wait for settled page
 * content: the welcome hero card (no household) or the overview page (household
 * exists).
 */
export async function waitForAuthedShell(page: Page): Promise<void> {
  await page
    .locator('[data-testid="welcome-hero-card"], [data-testid="overview-page"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

export async function registerNewUser(
  page: Page,
  overrides: Partial<Omit<TestUser, "accessToken">> = {}
): Promise<TestUser> {
  const user = {
    email: overrides.email ?? uniqueEmail("reg"),
    password: overrides.password ?? "BrowserTest123!",
    name: overrides.name ?? "E2E User",
  };
  await page.goto("/register");
  // RegisterPage uses htmlFor="name", htmlFor="email", htmlFor="password"
  await page.locator("#name").fill(user.name);
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  // confirmPassword field is also required
  await page.locator("#confirmPassword").fill(user.password);

  // Capture the access token from the register response — it never lands in a
  // cookie (it lives in JS memory), so raw page.request calls need it explicitly.
  const [registerResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/auth/register") && res.request().method() === "POST"
    ),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);
  const { accessToken } = (await registerResponse.json()) as { accessToken: string };

  // Wait for the redirect chain to settle rather than racing a URL regex.
  await waitForAuthedShell(page);
  return { ...user, accessToken };
}

/**
 * Complete the welcome/household-creation flow if the user has no household yet,
 * leaving the page on /overview. Idempotent: returns immediately if a household
 * already exists. Always call after registerNewUser(), which waits for the
 * redirect chain to settle first.
 */
export async function completeOnboarding(
  page: Page,
  householdName = "E2E Household"
): Promise<void> {
  await waitForAuthedShell(page);
  if (!page.url().includes("/welcome")) return; // already has a household

  await page.getByRole("button", { name: /get started/i }).click();
  await page.getByPlaceholder(/e\.g\. The Smiths/i).fill(householdName);
  await page.getByRole("button", { name: /create household/i }).click();
  await page.getByRole("button", { name: /go to overview/i }).click();
  await page.waitForURL(/\/overview/, { timeout: 10_000 });
  await page.getByTestId("overview-page").waitFor({ state: "visible", timeout: 10_000 });
}

export async function login(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/login");
  // LoginPage uses htmlFor="email" and htmlFor="password"
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(overview|onboarding|welcome)/, { timeout: 10_000 });
}

export async function logout(page: Page) {
  // ProfileAvatar has aria-label="Profile menu" button — click it to open the dropdown
  await page.getByRole("button", { name: /profile menu/i }).click();
  // The dropdown contains a menuitem "Sign out"
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await page.waitForURL(/\/login/, { timeout: 5_000 });
}
