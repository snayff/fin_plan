---
feature: behavioural-test-coverage
category: infrastructure
spec: docs/4. planning/behavioural-test-coverage/behavioural-test-coverage-spec.md
creation_date: 2026-05-17
status: backlog
implemented_date:
---

# Behavioural Test Coverage — Implementation Plan

> **For Claude:** Use `/execute-plan behavioural-test-coverage` to implement this plan task-by-task.

**Goal:** Add Playwright E2E coverage for the four critical flows (auth, household, waterfall, settings) and wire automated accessibility checks (`jest-axe` + `eslint-plugin-jsx-a11y`) into both component tests and E2E.

**Spec:** `docs/4. planning/behavioural-test-coverage/behavioural-test-coverage-spec.md`

**Architecture:** Playwright lives in `apps/frontend/` (chromium-only) and runs against the existing `docker-compose.dev.yml` stack via a `globalSetup` that resets the database between runs using a dedicated `seed-e2e.ts` baseline. Each flow test sets up its own users via the public API to avoid shared mutable state. Accessibility is enforced through two complementary layers: `eslint-plugin-jsx-a11y` at write time (recommended preset) and `@axe-core/playwright` + `jest-axe` at test time on serious/critical rules. A new `e2e` CI job runs after the existing `test` job and gates PR merge to `stage`.

**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind · Playwright · jest-axe · @axe-core/playwright · eslint-plugin-jsx-a11y

**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

> **Note:** Although this plan touches CI workflow files and adds a backend seed script (shared infra by spirit), the plan-template criteria above are both `no`. `/execute-plan` will therefore work in an isolated worktree. That is fine — the changes are additive and reviewed via PR.

## Pre-conditions

- [ ] Auth flow works locally via Docker compose (login/register implemented in `apps/frontend/src/pages/auth/`)
- [ ] Household + invite flow exists (`apps/backend/src/routes/invite.ts`, `apps/backend/src/routes/households.ts`)
- [ ] Waterfall mutation endpoints exist (income, committed, discretionary services in `apps/backend/src/services/`)
- [ ] Settings page exists for profile/password/showPence
- [ ] `docker-compose.dev.yml` boots a working stack at ports 3000/3001/5432

## Open-question resolutions applied to this plan

- **Seeding strategy:** Use option (a) — a `seed-e2e.ts` baseline script run by `globalSetup`. Per-test API setup for users created during the auth signup test.
- **CI runner:** GitHub-hosted. Easy revisit later if cold-start time becomes a bottleneck.
- **Email verification bypass:** Not needed. The codebase has no email verification step — users can log in immediately after registration. No `E2E_AUTO_VERIFY` flag introduced.
- **Invite flow:** Token-based. Tests will generate an invite via `POST /api/households/:id/invites`, fetch the token from the API response, and visit `/invite/:token` in the browser.
- **a11y existing components:** Fix-as-you-go on the curated component list (`PageHeader`, `TwoPanelLayout`, `Input`, `Button`, `Select`, `GhostAddButton`, `Modal`/`Dialog`). Any violation outside that list discovered during lint is suppressed inline with a `// eslint-disable-next-line` plus a `TODO(a11y)` comment and tracked as a follow-up issue.

## Tasks

> Each task is one action (2–5 minutes), follows red-green-commit where applicable (pure setup/install tasks use install-verify-commit instead), and contains complete code.

---

### Task 1: Install Playwright and create config

**Files:**

- Modify: `apps/frontend/package.json`
- Create: `apps/frontend/playwright.config.ts`
- Create: `apps/frontend/.gitignore` (add `playwright-report/`, `test-results/`, `e2e-artefacts/`)
- Modify: `package.json` (root) — add `test:e2e` script

- [ ] **Step 1: Install Playwright + axe-core**

```bash
cd apps/frontend && bun add -D @playwright/test @axe-core/playwright
cd ../.. && bunx playwright install --with-deps chromium
```

- [ ] **Step 2: Write Playwright config**

```typescript
// apps/frontend/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }], ["github"]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
```

- [ ] **Step 3: Add scripts and gitignore entries**

`apps/frontend/package.json` — add to `scripts`:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:report": "playwright show-report"
```

Append to `apps/frontend/.gitignore` (create if missing):

```
playwright-report/
test-results/
e2e-artefacts/
```

Root `package.json` — add to `scripts`:

```json
"test:e2e": "cd apps/frontend && bun run test:e2e"
```

- [ ] **Step 4: Sanity check — config loads**

Run: `cd apps/frontend && bunx playwright test --list`
Expected: succeeds with "0 tests found in 0 files" (no tests yet — config valid).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/package.json apps/frontend/playwright.config.ts apps/frontend/.gitignore package.json bun.lock
git commit -m "chore(e2e): install Playwright + axe-core and add config"
```

---

### Task 2: Add E2E database reset script and seed-e2e baseline

**Files:**

- Create: `apps/backend/prisma/seed-e2e.ts`
- Create: `apps/backend/scripts/reset-e2e-db.ts`
- Modify: `apps/backend/package.json` — add `db:reset-e2e` script

- [ ] **Step 1: Write a smoke test that depends on the reset script**

```typescript
// apps/frontend/e2e/smoke.spec.ts (temporary — removed in Task 4)
import { test, expect } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(login|welcome|overview)/);
});
```

- [ ] **Step 2: Verify it fails when stack is down**

Run: `cd apps/frontend && bunx playwright test smoke.spec.ts`
Expected: FAIL with connection refused (stack not up yet — that's OK, this proves the test runs).

- [ ] **Step 3: Implement reset script and seed-e2e**

```typescript
// apps/backend/prisma/seed-e2e.ts
// Minimal baseline state for E2E. Per-test users are created via API.
import { prisma } from "../src/config/database";

const SEED_USER_EMAIL = "e2e+seed@finplan.test";

if (process.env.NODE_ENV === "production") {
  console.error("seed-e2e refused: NODE_ENV=production");
  process.exit(1);
}

async function main() {
  // E2E baseline is intentionally empty — most tests create their own users.
  // We still ensure a known clean state by truncating below in reset-e2e-db.ts.
  console.log(`seed-e2e complete (baseline state; reserved user ${SEED_USER_EMAIL})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

```typescript
// apps/backend/scripts/reset-e2e-db.ts
// Truncates all user-data tables then runs seed-e2e.
// Refuses to run if NODE_ENV=production OR DATABASE_URL doesn't contain "test" or "dev".
import { prisma } from "../src/config/database";

if (process.env.NODE_ENV === "production") {
  console.error("reset-e2e-db refused: NODE_ENV=production");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/_test|_dev|finplan_e2e/.test(dbUrl)) {
  console.error(`reset-e2e-db refused: DATABASE_URL does not look like a test database (${dbUrl})`);
  process.exit(1);
}

async function main() {
  // Order matters — children before parents. Use TRUNCATE CASCADE for safety.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "ItemAmountPeriod",
      "WaterfallHistory",
      "IncomeSource",
      "CommittedItem",
      "DiscretionaryItem",
      "Subcategory",
      "AuditLog",
      "HouseholdSettings",
      "HouseholdInvite",
      "Member",
      "Household",
      "RefreshToken",
      "User"
    RESTART IDENTITY CASCADE;
  `);
  console.log("reset-e2e-db: all user-data tables truncated");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

> **Note:** Before commit, run `grep "^model " apps/backend/prisma/schema.prisma` and ensure every user-data model is in the TRUNCATE list. The list above covers waterfall, household, and auth state but may miss newer additions (e.g. `Asset`, `Account`, `GiftPlanner*`). Add any missing models so state cannot leak between runs. If a listed table doesn't exist, drop it rather than failing the whole reset.

Add to `apps/backend/package.json` `scripts`:

```json
"db:reset-e2e": "bun scripts/reset-e2e-db.ts && bun prisma/seed-e2e.ts"
```

- [ ] **Step 4: Verify reset works against dev DB**

Run: `bun run start` (if not already up), then `docker compose -f docker-compose.dev.yml exec backend bun run db:reset-e2e`
Expected: PASS — "all user-data tables truncated" then "seed-e2e complete".

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/seed-e2e.ts apps/backend/scripts/reset-e2e-db.ts apps/backend/package.json
git commit -m "feat(e2e): add db reset script and minimal seed-e2e baseline"
```

---

### Task 3: E2E support helpers (axe, api, auth)

**Files:**

- Create: `apps/frontend/e2e/support/axe.ts`
- Create: `apps/frontend/e2e/support/api.ts`
- Create: `apps/frontend/e2e/support/auth.ts`
- Create: `apps/frontend/e2e/global-setup.ts`

- [ ] **Step 1: Write failing test against the helpers**

```typescript
// apps/frontend/e2e/support/__smoke__.spec.ts
import { test, expect } from "@playwright/test";
import { registerNewUser } from "./auth";
import { checkA11y } from "./axe";

test("registerNewUser returns email and authenticates", async ({ page }) => {
  const { email } = await registerNewUser(page);
  expect(email).toMatch(/@finplan\.test$/);
  await checkA11y(page);
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd apps/frontend && bunx playwright test support/__smoke__.spec.ts`
Expected: FAIL — "Cannot find module './auth'".

- [ ] **Step 3: Implement helpers**

```typescript
// apps/frontend/e2e/support/api.ts
const API_BASE = process.env.E2E_API_URL ?? "http://localhost:3001";

export async function resetDb(): Promise<void> {
  // The reset is invoked via docker compose exec from globalSetup, not from inside tests.
  // This helper exists only for tests that need an extra reset mid-suite.
  const res = await fetch(`${API_BASE}/api/e2e/reset`, { method: "POST" }).catch(() => null);
  if (!res || !res.ok) {
    throw new Error("E2E reset endpoint not available — re-run with global setup");
  }
}

export function uniqueEmail(prefix = "user"): string {
  return `e2e+${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@finplan.test`;
}
```

> **Note:** The plan does **not** introduce a `/api/e2e/reset` endpoint. `resetDb()` is included only as a stub for the rare case a future test needs mid-suite reset. globalSetup runs the docker-compose `db:reset-e2e` command instead (see global-setup.ts below). Delete `resetDb` if no test ends up using it during execution.

```typescript
// apps/frontend/e2e/support/auth.ts
import type { Page } from "@playwright/test";
import { uniqueEmail } from "./api";

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

export async function registerNewUser(
  page: Page,
  overrides: Partial<TestUser> = {}
): Promise<TestUser> {
  const user: TestUser = {
    email: overrides.email ?? uniqueEmail("reg"),
    password: overrides.password ?? "BrowserTest123!",
    name: overrides.name ?? "E2E User",
  };
  await page.goto("/register");
  await page.getByLabel(/name/i).fill(user.name);
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/^password/i).fill(user.password);
  await page.getByRole("button", { name: /sign up|register|create account/i }).click();
  // Expect navigation to authed area (overview or onboarding)
  await page.waitForURL(/\/(overview|onboarding|welcome)/, { timeout: 10_000 });
  return user;
}

export async function login(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/^password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(overview|onboarding|welcome)/, { timeout: 10_000 });
}

export async function logout(page: Page) {
  // Open user menu → click logout. Adjust selectors during execution to match real DOM.
  await page.getByRole("button", { name: /account menu|user menu|profile/i }).click();
  await page.getByRole("menuitem", { name: /log ?out|sign out/i }).click();
  await page.waitForURL(/\/login/, { timeout: 5_000 });
}
```

> **Selector note:** The login/register page DOM may not yet match every selector above (e.g. the user menu may be a div not a button). The implementer should run the test, observe the real DOM via `page.pause()`, and adjust selectors. Where possible, prefer adding `data-testid` to the production component to a11y-safe selectors over fragile text matches.

```typescript
// apps/frontend/e2e/support/axe.ts
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const FAILING_IMPACTS = ["serious", "critical"] as const;

export interface AxeOptions {
  /** CSS selectors to exclude (e.g. third-party widgets). */
  exclude?: string[];
  /** Axe rule IDs to disable (use sparingly with justification). */
  disableRules?: string[];
}

export async function checkA11y(page: Page, opts: AxeOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page });
  if (opts.exclude?.length) for (const sel of opts.exclude) builder = builder.exclude(sel);
  if (opts.disableRules?.length) builder = builder.disableRules(opts.disableRules);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) =>
    FAILING_IMPACTS.includes(v.impact as (typeof FAILING_IMPACTS)[number])
  );
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
      .join("\n");
    expect(blocking, `a11y violations:\n${summary}`).toEqual([]);
  }
}
```

```typescript
// apps/frontend/e2e/global-setup.ts
import { execSync } from "node:child_process";

export default async function globalSetup() {
  // Reset the database before the suite runs.
  // Assumes the docker-compose stack is already up (CI brings it up explicitly).
  try {
    execSync(
      "docker compose -f ../../docker-compose.dev.yml exec -T backend bun run db:reset-e2e",
      {
        stdio: "inherit",
      }
    );
  } catch (err) {
    throw new Error(
      `E2E global setup failed — is the stack running? Try 'bun run start' first.\n${err}`
    );
  }
}
```

- [ ] **Step 4: Delete temporary smoke spec from Task 2**

```bash
rm apps/frontend/e2e/smoke.spec.ts
```

- [ ] **Step 5: Verify support smoke test passes**

Boot the stack first (`bun run start` from repo root, wait for health), then:

Run: `cd apps/frontend && bunx playwright test support/__smoke__.spec.ts`
Expected: PASS.

If a11y violations exist on `/register`, fix them on the real component before proceeding — they belong on the curated a11y list anyway.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/e2e/
git commit -m "feat(e2e): add support helpers (axe, api, auth) + global setup"
```

---

### Task 4: Auth flow E2E

**Files:**

- Create: `apps/frontend/e2e/auth.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/frontend/e2e/auth.spec.ts
import { test, expect } from "@playwright/test";
import { registerNewUser, login, logout } from "./support/auth";
import { uniqueEmail } from "./support/api";
import { checkA11y } from "./support/axe";

test.describe("auth flow", () => {
  test("signup → access authed page → logout → authed page redirects to login", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("auth");
    const password = "BrowserTest123!";

    // Signup
    await page.goto("/register");
    await checkA11y(page);
    await registerNewUser(page, { email, password });

    // Authed page accessible
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/overview/);
    await checkA11y(page);

    // Logout
    await logout(page);
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "refreshToken")?.value ?? "").toBe("");

    // Authed page redirects to /login
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    await checkA11y(page);
  });

  test("login with valid credentials returns user to authed area", async ({ page }) => {
    const user = await registerNewUser(page);
    await logout(page);
    await login(page, user);
    await expect(page).toHaveURL(/\/(overview|onboarding|welcome)/);
  });

  test("login with wrong password shows generic error", async ({ page }) => {
    const user = await registerNewUser(page);
    await logout(page);
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/^password/i).fill("WrongPassword!");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid|incorrect/i)).toBeVisible({ timeout: 5_000 });
  });
});
```

- [ ] **Step 2: Verify it fails initially (or passes — depends on current implementation)**

Run: `cd apps/frontend && bunx playwright test auth.spec.ts`
Expected: most likely a mix — adjust selectors based on the actual DOM until all three pass. Do not move on with a failing test.

- [ ] **Step 3: Adjust selectors if needed**

Use `page.pause()` or `--headed` to inspect real DOM and adjust. Add `data-testid` to production components if the most stable selector isn't accessible by role/label.

- [ ] **Step 4: Run again, all green**

Run: `cd apps/frontend && bunx playwright test auth.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/e2e/auth.spec.ts
# plus any production component changes for selectors / a11y fixes
git commit -m "test(e2e): auth flow — signup, login, logout, redirect"
```

---

### Task 5: Household flow E2E

**Files:**

- Create: `apps/frontend/e2e/household.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/frontend/e2e/household.spec.ts
import { test, expect, request as pwRequest } from "@playwright/test";
import { registerNewUser, login } from "./support/auth";
import { uniqueEmail } from "./support/api";
import { checkA11y } from "./support/axe";

const API_BASE = process.env.E2E_API_URL ?? "http://localhost:3001";

test.describe("household flow", () => {
  test("create new household and switch to it", async ({ page }) => {
    await registerNewUser(page);
    await page.goto("/settings");
    await page
      .getByRole("button", { name: /create household|new household|add household/i })
      .click();
    await page.getByLabel(/household name/i).fill("Second Household");
    await page.getByRole("button", { name: /create|save/i }).click();
    await expect(page.getByText("Second Household")).toBeVisible();

    // Switch active household
    await page.getByRole("button", { name: /switch household|select household/i }).click();
    await page.getByRole("menuitem", { name: /second household/i }).click();
    await expect(page.getByText(/active household.*second household/i)).toBeVisible();
    await checkA11y(page);
  });

  test("invite new member by email and join flow scope-checks", async ({ page, browser }) => {
    // Owner registers + creates an invite via API (faster than UI for token retrieval)
    const owner = await registerNewUser(page);
    const ctx = await pwRequest.newContext({ baseURL: API_BASE });
    // Pull access token cookie from page
    const cookies = await page.context().cookies();
    const refreshCookie = cookies.find((c) => c.name === "refreshToken");
    expect(refreshCookie).toBeTruthy();

    // Create invite via UI (more robust against route changes)
    await page.goto("/settings");
    await page.getByRole("button", { name: /invite member|add member/i }).click();
    const inviteEmail = uniqueEmail("invitee");
    await page.getByLabel(/email/i).fill(inviteEmail);
    await page.getByRole("button", { name: /send invite|create invite/i }).click();
    // Surface the invite link from the UI — assumes the app shows it
    const inviteLink = await page.getByText(/\/invite\/[a-zA-Z0-9_-]+/).textContent();
    expect(inviteLink).toBeTruthy();

    // Invitee opens link in a new context (clean cookies)
    const inviteeCtx = await browser.newContext();
    const inviteePage = await inviteeCtx.newPage();
    await inviteePage.goto(inviteLink!);
    await checkA11y(inviteePage);
    await inviteePage.getByLabel(/^password/i).fill("BrowserTest123!");
    await inviteePage.getByRole("button", { name: /accept|join/i }).click();
    await inviteePage.waitForURL(/\/(overview|onboarding|welcome)/);

    // Invitee can see the household; verify household-scoped API call returns owner's household
    const resp = await inviteePage.request.get(`${API_BASE}/api/households/me`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.householdId).toBeTruthy();

    await ctx.dispose();
    await inviteeCtx.close();
    // Avoid unused-var lint
    void owner;
  });
});
```

> **Note:** The exact UI element names for "create household", "invite member", and where the invite link is displayed are best discovered with `page.pause()` during execution. The plan above gives the shape — selectors are tuned during the red→green loop.

- [ ] **Step 2: Run and fail**

Run: `cd apps/frontend && bunx playwright test household.spec.ts`

- [ ] **Step 3: Adjust selectors and re-run until green**

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/e2e/household.spec.ts
git commit -m "test(e2e): household flow — create, switch, invite, scope"
```

---

### Task 6: Waterfall flow E2E

**Files:**

- Create: `apps/frontend/e2e/waterfall.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/frontend/e2e/waterfall.spec.ts
import { test, expect } from "@playwright/test";
import { registerNewUser } from "./support/auth";
import { checkA11y } from "./support/axe";

test.describe("waterfall flow", () => {
  test("add income, add committed, surplus reflects both", async ({ page }) => {
    await registerNewUser(page);
    await page.goto("/income");
    await checkA11y(page);

    // Add an income source
    await page.getByRole("button", { name: /add income|new income|\+ income/i }).click();
    await page.getByLabel(/name/i).fill("Test Salary");
    await page.getByLabel(/amount/i).fill("3000");
    await page.getByRole("button", { name: /save|create|add/i }).click();
    await expect(page.getByText("Test Salary")).toBeVisible();

    // Add a committed item
    await page.goto("/committed");
    await checkA11y(page);
    await page.getByRole("button", { name: /add (committed|bill|expense)|\+ /i }).click();
    await page.getByLabel(/name/i).fill("Rent");
    await page.getByLabel(/amount/i).fill("1200");
    await page.getByRole("button", { name: /save|create|add/i }).click();
    await expect(page.getByText("Rent")).toBeVisible();

    // Verify surplus reflects 3000 - 1200 = 1800 on overview
    await page.goto("/overview");
    await checkA11y(page);
    await expect(page.getByText(/1[,.]?800/)).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2 → 4: Run, adjust selectors, re-run until green**

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/e2e/waterfall.spec.ts
git commit -m "test(e2e): waterfall flow — income + committed → surplus"
```

---

### Task 7: Settings flow E2E

**Files:**

- Create: `apps/frontend/e2e/settings.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/frontend/e2e/settings.spec.ts
import { test, expect } from "@playwright/test";
import { registerNewUser, login, logout } from "./support/auth";
import { checkA11y } from "./support/axe";

test.describe("settings flow", () => {
  test("update profile name, change password, toggle showPence", async ({ page }) => {
    const user = await registerNewUser(page);
    await page.goto("/settings");
    await checkA11y(page);

    // Update profile name
    await page.getByLabel(/(your |display )?name/i).fill("Renamed User");
    await page
      .getByRole("button", { name: /save profile|save name|update/i })
      .first()
      .click();
    await expect(page.getByText(/saved|updated/i)).toBeVisible({ timeout: 5_000 });
    await page.reload();
    await expect(page.getByLabel(/(your |display )?name/i)).toHaveValue("Renamed User");

    // Change password
    const newPassword = "NewBrowserTest456!";
    await page.getByLabel(/current password/i).fill(user.password);
    await page.getByLabel(/new password/i).fill(newPassword);
    await page.getByRole("button", { name: /change password|update password/i }).click();
    await expect(page.getByText(/password.*updated|changed/i)).toBeVisible({ timeout: 5_000 });

    // Login with new password
    await logout(page);
    await login(page, { email: user.email, password: newPassword });

    // Toggle showPence and verify currency format
    await page.goto("/settings");
    const penceToggle = page.getByLabel(/show pence|show decimals/i);
    const initiallyChecked = await penceToggle.isChecked();
    await penceToggle.click();
    await expect(penceToggle).toBeChecked({ checked: !initiallyChecked });

    // Currency formatting should now reflect new setting somewhere visible
    await page.goto("/overview");
    if (!initiallyChecked) {
      // pence now on — expect a decimal in any currency-formatted value
      await expect(page.getByText(/£\d[\d,]*\.\d{2}/)).toBeVisible({ timeout: 10_000 });
    } else {
      // pence now off — expect at least one whole-pound figure
      await expect(page.getByText(/£\d[\d,]*(?!\.\d)/)).toBeVisible({ timeout: 10_000 });
    }
  });
});
```

- [ ] **Step 2 → 4: Run, adjust selectors, re-run until green**

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/e2e/settings.spec.ts
git commit -m "test(e2e): settings flow — profile, password, showPence"
```

---

### Task 8: Wire E2E into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a new `e2e` job that depends on `test`**

Append after the `test` job:

```yaml
e2e:
  name: E2E
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  needs: test
  timeout-minutes: 15

  env:
    DATABASE_URL: postgresql://finplan:finplan_dev_password@localhost:5432/finplan_dev
    JWT_SECRET: test-jwt-secret-that-is-at-least-32-characters-long-for-testing
    JWT_REFRESH_SECRET: test-jwt-refresh-secret-that-is-at-least-32-characters-long-for-testing
    COOKIE_SECRET: test-cookie-secret-that-is-at-least-32-characters-long-for-testing
    CORS_ORIGIN: http://localhost:3000
    NODE_ENV: development
    CI: "true"
    E2E_BASE_URL: http://localhost:3000
    E2E_API_URL: http://localhost:3001

  steps:
    - uses: actions/checkout@v4

    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: "1.3.9"

    - name: Cache bun dependencies
      uses: actions/cache@v4
      with:
        path: ~/.bun/install/cache
        key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
        restore-keys: bun-${{ runner.os }}-

    - name: Install dependencies
      run: bun install --frozen-lockfile

    - name: Cache Playwright browsers
      uses: actions/cache@v4
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ runner.os }}-${{ hashFiles('apps/frontend/package.json') }}
        restore-keys: playwright-${{ runner.os }}-

    - name: Install Playwright browsers
      run: cd apps/frontend && bunx playwright install --with-deps chromium

    - name: Start Docker compose stack
      run: docker compose -f docker-compose.dev.yml up -d --wait
      # --wait blocks until healthchecks pass (backend + postgres). Default timeout 60s.

    - name: Reset DB and seed E2E baseline
      run: docker compose -f docker-compose.dev.yml exec -T backend bun run db:reset-e2e

    - name: Run Playwright
      run: cd apps/frontend && bunx playwright test

    - name: Upload Playwright artefacts
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report-${{ github.run_id }}
        path: |
          apps/frontend/playwright-report
          apps/frontend/test-results
        retention-days: 7

    - name: Stop Docker compose stack
      if: always()
      run: docker compose -f docker-compose.dev.yml down -v
```

- [ ] **Step 2: Verify locally that the equivalent command sequence works end-to-end**

Run from repo root:

```bash
bun run start
docker compose -f docker-compose.dev.yml exec -T backend bun run db:reset-e2e
cd apps/frontend && bunx playwright test
```

Expected: all four flow specs pass.

- [ ] **Step 3: Open the PR and observe CI**

CI should run `e2e` after `test`. If it fails on the GitHub runner but passes locally, the most common cause is timing — bump `--wait` timeout or add a small post-up `wait-on http://localhost:3000` step.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(e2e): add Playwright job gating PR merge to stage"
```

---

### Task 9: jest-axe in component tests

**Files:**

- Modify: `apps/frontend/package.json` — add `jest-axe`
- Modify: `apps/frontend/src/test/setup.ts` — register matcher
- Create: `apps/frontend/src/test/helpers/axe.ts`

- [ ] **Step 1: Write a failing test using the matcher**

Append to `apps/frontend/src/components/common/PageHeader.test.tsx`:

```typescript
it("has no serious or critical a11y violations", async () => {
  const { container } = renderWithProviders(<PageHeader title="Income" total={3500} />);
  await expectNoA11yViolations(container);
});
```

Add the import at top: `import { expectNoA11yViolations } from "@/test/helpers/axe";`

- [ ] **Step 2: Run and fail**

Run: `cd apps/frontend && bun scripts/run-tests.ts PageHeader`
Expected: FAIL — "Cannot find module '@/test/helpers/axe'".

- [ ] **Step 3: Install jest-axe + write helper + register matcher**

```bash
cd apps/frontend && bun add -D jest-axe @types/jest-axe
```

```typescript
// apps/frontend/src/test/helpers/axe.ts
import { axe, type AxeResults, type Result } from "jest-axe";

const FAILING_IMPACTS = new Set(["serious", "critical"]);

export async function expectNoA11yViolations(
  container: Element,
  options?: Parameters<typeof axe>[1]
): Promise<void> {
  const results: AxeResults = await axe(container, options);
  const blocking = results.violations.filter((v: Result) =>
    v.impact ? FAILING_IMPACTS.has(v.impact) : false
  );
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
      .join("\n");
    throw new Error(`a11y violations:\n${summary}`);
  }
}
```

Modify `apps/frontend/src/test/setup.ts` — append after the `expect.extend(matchers)` line:

```typescript
import { toHaveNoViolations } from "jest-axe";
expect.extend(toHaveNoViolations);
```

(This registers the matcher for any test that prefers `expect(results).toHaveNoViolations()` over the helper.)

- [ ] **Step 4: Run and pass**

Run: `cd apps/frontend && bun scripts/run-tests.ts PageHeader`
Expected: PASS. If it fails on real violations in `PageHeader`, fix them in the component before proceeding.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/package.json apps/frontend/src/test/setup.ts apps/frontend/src/test/helpers/axe.ts apps/frontend/src/components/common/PageHeader.test.tsx bun.lock
# Plus PageHeader.tsx if fixes were needed
git commit -m "test(a11y): wire jest-axe and assert PageHeader is violation-free"
```

---

### Task 10: a11y assertions on curated component tests

**Files:**

- Modify: `apps/frontend/src/components/layout/TwoPanelLayout.tsx` (test file if missing)
- Modify: `apps/frontend/src/components/ui/input.tsx` test
- Modify: `apps/frontend/src/components/ui/button.tsx` test
- Modify: `apps/frontend/src/components/ui/select.tsx` test
- Modify: `apps/frontend/src/components/tier/GhostAddButton.test.tsx`
- Modify: `apps/frontend/src/components/ui/Modal.tsx` test
- Modify: `apps/frontend/src/components/ui/dialog.tsx` test (or its existing test wrapper)

For each component on the curated list:

- [ ] **Step 1: Add a test asserting `expectNoA11yViolations(container)` against a typical rendered instance**

Example for `GhostAddButton`:

```typescript
// in apps/frontend/src/components/tier/GhostAddButton.test.tsx
import { expectNoA11yViolations } from "@/test/helpers/axe";

it("has no serious or critical a11y violations", async () => {
  const { container } = renderWithProviders(<GhostAddButton onClick={() => {}}>Add item</GhostAddButton>);
  await expectNoA11yViolations(container);
});
```

Each component needs at least one such assertion. If a test file doesn't exist yet for a given component, create a minimal one whose only role is the axe check.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd apps/frontend && bun scripts/run-tests.ts`
Expected: PASS. For any failure, fix the underlying violation in the component (add a `<label>`, fix `aria-*`, ensure `role` matches DOM, etc.).

- [ ] **Step 3: Commit per component (or one commit per logical group)**

```bash
git add apps/frontend/src/components/<...>.test.tsx apps/frontend/src/components/<...>.tsx
git commit -m "test(a11y): add axe assertion to <Component>"
```

---

### Task 11: eslint-plugin-jsx-a11y at recommended preset

**Files:**

- Modify: `apps/frontend/package.json` — add `eslint-plugin-jsx-a11y`
- Modify: `apps/frontend/eslint.config.js`

- [ ] **Step 1: Install plugin**

```bash
cd apps/frontend && bun add -D eslint-plugin-jsx-a11y
```

- [ ] **Step 2: Verify it would catch a violation (sanity test)**

Temporarily add a violation in any `.tsx`:

```tsx
<img src="x" />
```

Run: `cd apps/frontend && bun run lint`
Expected: FAIL with `jsx-a11y/alt-text`. (Will only happen after Step 3 lands the plugin.)

- [ ] **Step 3: Add plugin to ESLint config**

Modify `apps/frontend/eslint.config.js`:

```javascript
// at top
import jsxA11y from "eslint-plugin-jsx-a11y";

// inside the main config block for src/**/*.{ts,tsx} — add the plugin and its recommended rules
{
  files: ["src/**/*.{ts,tsx}"],
  plugins: {
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
    "jsx-a11y": jsxA11y,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    ...jsxA11y.configs.recommended.rules,
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
  },
},
```

- [ ] **Step 4: Run lint and address every violation**

Run: `cd apps/frontend && bun run lint`
Expected initially: many violations. For each:

- **On a curated component (PageHeader, TwoPanelLayout, Input, Button, Select, GhostAddButton, Modal/Dialog):** fix the violation.
- **Elsewhere:** if cheap, fix it. If expensive, add inline `// eslint-disable-next-line jsx-a11y/<rule>` with `// TODO(a11y): tracked in follow-up issue` and create a follow-up issue capturing the file + rule list.

Iterate until: `bun run lint` exits clean (zero warnings, zero errors).

- [ ] **Step 5: Remove the temporary sanity-test violation from Step 2**

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/package.json apps/frontend/eslint.config.js apps/frontend/src/ bun.lock
git commit -m "feat(a11y): adopt eslint-plugin-jsx-a11y recommended preset"
```

---

### Task 12: Documentation — e2e-testing.md

**Files:**

- Create: `docs/3. architecture/testing/e2e-testing.md`
- Modify: `docs/3. architecture/testing/_testing_readme.md` — link the new doc

- [ ] **Step 1: Write the doc**

```markdown
# E2E Testing

> How to run, debug, and extend the Playwright suite, plus a11y triage policy.

## Running locally

1. `bun run start` — boot the Docker compose stack.
2. `docker compose -f docker-compose.dev.yml exec -T backend bun run db:reset-e2e` — clean DB.
3. `cd apps/frontend && bun run test:e2e` — run all flow specs.
4. `bun run test:e2e:ui` — debug interactively.

## Adding a new flow

- One file per flow under `apps/frontend/e2e/`.
- Use helpers in `e2e/support/` (auth, axe, api). Prefer `getByRole` / `getByLabel` over CSS selectors.
- Each flow must call `checkA11y(page)` after every significant navigation.

## Failure triage (CI)

- Open the failed run → "playwright-report-<run id>" artefact → unzip → open `index.html`.
- Trace viewer (`.zip` files in `test-results/`) gives step-by-step DOM state.

## Accessibility threshold

- Failing: `serious` + `critical` only.
- Reporting (non-failing): `moderate` + `minor`.
- Bypass an axe rule only with a `disableRules` entry and a justifying comment.

## Flake policy

- Any intermittent failure opens a tracked issue within 24 hours.
- Quarantine (mark with `test.skip` + TODO) only with a linked issue and an owner.
- Never `waitForTimeout` — use Playwright's auto-waiting.
```

- [ ] **Step 2: Add link to `_testing_readme.md`**

- [ ] **Step 3: Commit**

```bash
git add "docs/3. architecture/testing/e2e-testing.md" "docs/3. architecture/testing/_testing_readme.md"
git commit -m "docs(e2e): document E2E run/debug/triage and a11y threshold"
```

---

## Testing

### Backend Tests

- [ ] None — no backend logic changes. `seed-e2e.ts` is run manually and validated by the E2E suite itself.

### Frontend Tests

- [ ] Component: `expectNoA11yViolations` passes on `PageHeader`, `TwoPanelLayout`, `Input`, `Button`, `Select`, `GhostAddButton`, `Modal`, `Dialog`.
- [ ] Hook: n/a.

### Key Scenarios (E2E)

- [ ] Auth: signup → authed access → logout → redirect to login (cookie cleared).
- [ ] Auth: invalid credentials show generic error (no account-existence leak).
- [ ] Household: create, switch, invite-via-link, invitee can read household.
- [ ] Waterfall: income + committed mutate surplus on overview.
- [ ] Settings: profile name update persists; password change → login with new password; `showPence` toggle changes currency formatting.

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings (jsx-a11y included)
- [ ] `bun run type-check` clean
- [ ] `cd apps/backend && bun scripts/run-tests.ts` — all backend tests green (no regressions from CI yml refactor)
- [ ] `cd apps/frontend && bun scripts/run-tests.ts` — all frontend tests green, including new axe assertions
- [ ] `cd apps/frontend && bun run test:e2e` — all four flows green against local Docker stack
- [ ] CI: `e2e` job runs after `test` and passes on the resulting PR; artefacts uploaded on failure with 7-day retention
- [ ] Manual: open the deployed E2E artefacts on a failing CI run (induce a failure by skipping `bun run start` locally and pushing a draft) — confirm screenshots, videos, and trace are present

## Post-conditions

- [ ] E2E confidence enables a future Dependabot patch auto-merge spec.
- [ ] a11y enforcement gives a floor against regressions on the curated components.
- [ ] `seed-e2e.ts` + `db:reset-e2e` provide a reusable pattern for any future suite needing a known DB baseline.
- [ ] Out of scope (intentional, mirrored from spec): visual regression, performance budgets, cross-browser matrix, mobile viewports beyond chromium 1440×900, i18n testing, load testing.
