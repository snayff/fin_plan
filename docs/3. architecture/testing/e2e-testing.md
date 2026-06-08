# E2E Testing

> How to run, debug, and extend the Playwright suite, plus the accessibility triage policy.

## Running locally

1. Start the Docker compose stack: `bun run start` (from repo root).
2. Reset the database: `docker compose -f docker-compose.dev.yml exec -T backend bun run db:reset-e2e`
3. Run all E2E flows: `cd apps/frontend && bun run test:e2e`
4. Debug interactively: `cd apps/frontend && bun run test:e2e:ui`
5. View the last HTML report: `cd apps/frontend && bun run test:e2e:report`

## Test structure

```
apps/frontend/
  e2e/
    auth.spec.ts          — auth flow (signup, login, logout, redirect)
    household.spec.ts     — household flow (create, invite, join)
    waterfall.spec.ts     — waterfall flow (income + committed → overview)
    settings.spec.ts      — settings flow (profile, password, showPence)
    global-setup.ts       — resets DB before the suite runs
    support/
      auth.ts             — registerNewUser(), login(), logout() helpers
      api.ts              — uniqueEmail() for test isolation
      axe.ts              — checkA11y() wrapping @axe-core/playwright
```

## Adding a new flow

1. Create a new `*.spec.ts` under `apps/frontend/e2e/`.
2. Use helpers from `e2e/support/` — prefer `getByRole` / `getByLabel` / `locator("#id")` over CSS class selectors.
3. Call `checkA11y(page)` after every significant navigation.
4. Ensure each test creates its own user/data via the helpers (never share mutable state between tests).

## CI behaviour

The `e2e` job in `.github/workflows/ci.yml`:

- Runs on every PR, after the `test` job passes.
- Boots the full Docker compose stack, resets the DB, then runs Playwright.
- On failure: uploads screenshots, videos, and Playwright traces as artefacts (7-day retention).

## Debugging CI failures

1. Open the failed run → **Artifacts** → download `playwright-report-<run-id>`.
2. Unzip and open `index.html` in a browser for the HTML report.
3. For deeper inspection, open the `.zip` trace files in `test-results/` using the [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer).

## Accessibility threshold

| Severity | Behaviour               |
| -------- | ----------------------- |
| critical | Fails the test          |
| serious  | Fails the test          |
| moderate | Reported, does not fail |
| minor    | Reported, does not fail |

Threshold is enforced in:

- **E2E flows:** `e2e/support/axe.ts` → `checkA11y(page)`
- **Component tests:** `src/test/helpers/axe.ts` → `expectNoA11yViolations(container)`

## Bypassing an axe rule

Only bypass with explicit justification:

```typescript
// In E2E:
await checkA11y(page, { disableRules: ["color-contrast"] }); // Radix Select portal lacks page context

// In component tests:
await expectNoA11yViolations(container, { rules: { "color-contrast": { enabled: false } } }); // reason
```

## Flake policy

- Any intermittently failing test opens a tracked GitHub issue within 24 hours.
- Quarantine with `test.skip` + a link to the issue while it's being fixed.
- Never use `waitForTimeout` — use Playwright's auto-waiting (`waitForURL`, `waitForLoadState`, `toBeVisible`).
