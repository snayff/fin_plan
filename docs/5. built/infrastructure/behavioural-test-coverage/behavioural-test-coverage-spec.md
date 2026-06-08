---
feature: behavioural-test-coverage
design_doc: docs/4. planning/workflow-enhancement-roadmap.md
creation_date: 2026-05-04
status: backlog
implemented_date:
---

# Behavioural Test Coverage

> **Purpose:** Expand the _kind_ of testing finplan does — from unit/integration of mocked behaviour to real-browser end-to-end flows and automated accessibility checks — closing the gap between "tests pass" and "feature works for real users."

## Intention

The repo has 230+ unit/integration tests but zero E2E coverage and no accessibility testing. Critical flows (auth handshake under real cookies/CSRF, household scoping, the waterfall mutation chain) are validated only against MSW mocks — fine for component logic, blind to integration bugs. Accessibility is enforced structurally by the design system but never actually validated. This feature adds Playwright for the riskiest user journeys and `jest-axe` + `eslint-plugin-jsx-a11y` for accessibility, lifting confidence to a level where Dependabot patch auto-merge becomes a sensible follow-up.

## Description

Two coordinated additions:

1. **Playwright E2E suite** — runs against the Docker-composed stack (real backend, real Postgres, real frontend build). Initial suite covers four flows: auth (signup/login/logout), household (create/switch/invite), waterfall (income/committed/surplus), and settings (profile/password/pence toggle). Runs in CI as a separate job after the existing test job passes.
2. **Accessibility enforcement** — `eslint-plugin-jsx-a11y` at the `recommended` preset added to the frontend ESLint config; `jest-axe` integrated into the E2E flows (axe assertion on each significant page state) and a curated set of component tests (key shared components like `PageHeader`, `TwoPanelLayout`, form primitives, modal/dialog).

## User Stories

- As a developer, I want a Playwright E2E run on every PR so I am confident the auth handshake, cookie flags, and CSRF tokens still work under real navigation, not just mocked.
- As a maintainer, I want to know that household data cannot leak between members or households even when the frontend renders the real API, so I can defend the multi-tenancy boundary with tests.
- As a product owner, I want the waterfall flow validated end-to-end so I know that adding income, committed spend, and surplus is intact at every release.
- As a user with a screen reader, I want the app to be free of obvious accessibility violations (missing labels, role mismatches, keyboard traps) — and I want this enforced automatically.
- As a developer, I want lint to flag a11y mistakes (unlabeled inputs, missing alt text) at write time so I do not create violations that need fixing later.
- As a developer, I want the E2E suite to be fast and reliable enough that I do not learn to ignore it (target: <10 min full run; near-zero flake).

## Acceptance Criteria

### Playwright E2E

- [ ] Playwright is installed and configured at the repo root or `apps/frontend/`; `bun run test:e2e` runs the suite locally.
- [ ] E2E tests boot the full Docker-composed stack (backend + frontend + postgres) via the existing `bun run start` workflow (or a CI-equivalent compose command); tests do **not** run against `vite dev` with mocks.
- [ ] **Auth flow** test covers: signup with new email → email-verified login (or test-mode bypass) → access an authed page → logout → confirm cookie cleared and authed page redirects to login.
- [ ] **Household flow** test covers: create a new household → switch active household via the UI → invite a member (or simulate the invite flow per current implementation) → verify the active household scope is honoured by an authed call.
- [ ] **Waterfall flow** test covers: add an income source → add a committed spend → verify discretionary and surplus values update in the UI accordingly.
- [ ] **Settings flow** test covers: update profile name → change password (login again with new password) → toggle the showPence setting and verify currency formatting reflects the new setting.
- [ ] Each flow test seeds its own state and tears down (no shared mutable state across tests; tests run in parallel where independent).
- [ ] Tests run in CI as a dedicated job that gates PR merge to `stage`. Failure is loud (test artefacts: screenshots, videos, traces uploaded as workflow artefacts).
- [ ] Total E2E job time stays under 10 minutes for the initial four flows.
- [ ] Flake budget: any test that fails intermittently has a tracked issue and is either fixed or quarantined within one week of detection.

### Accessibility

- [ ] `eslint-plugin-jsx-a11y` added to `apps/frontend/eslint.config.js` at the `recommended` preset. Existing violations either fixed in this PR or tracked as follow-up issues with a clear owner.
- [ ] `jest-axe` is wired into the frontend test setup (`apps/frontend/src/test/setup.ts` or equivalent).
- [ ] Each Playwright flow test runs an axe scan on each significant page state and fails on serious/critical violations.
- [ ] A curated set of component tests asserts axe-clean rendering: `PageHeader`, `TwoPanelLayout`, form primitives (Input, Button, Select), `GhostAddButton`, `Modal`/`Dialog` components.
- [ ] axe violation severity threshold for failure is **serious + critical** initially; minor/moderate are reported but do not fail tests (revisit once baseline is clean).
- [ ] Documented exemption mechanism for known false positives (axe `disableRules` config or eslint inline disables with a justifying comment).

## Open Questions

- [ ] **Test data seeding strategy.** Two options: (a) a Prisma `seed-e2e.ts` script that resets and seeds before each test run; (b) per-test API setup calls. Recommend (a) for the initial suite — simpler, faster — with per-test API calls used only when scoping requires fresh state.
- [ ] **CI runner.** Playwright in GitHub-hosted runners is fine but slow on cold starts. Decision deferred to `/write-plan`: GitHub-hosted (zero infra) vs. self-hosted runner (per project memory, infra is already self-hosted on Ubuntu VM).
- [ ] **Email verification flow in tests.** Auth flow needs to handle email verification. Recommend test-mode bypass via a backend env flag (e.g. `E2E_AUTO_VERIFY=true`) that skips email send and marks accounts verified directly. Confirm during `/write-plan`.
- [ ] **Invite-member flow.** Depending on current implementation, may require email or share-link. Confirm the actual implementation during `/write-plan` and adapt the test accordingly.
- [ ] **a11y on existing components — fix or quarantine?** Recommend fix-as-you-go: this PR fixes violations on the curated component list above; broader audit tracked as a follow-up issue. Confirm during `/write-plan`.
- [ ] **Visual regression?** Explicitly out of scope per the roadmap (Storybook/Chromatic was rejected). Mention here so it's clear this spec does not include screenshot diffing.

---

## Implementation

> Interface-level constraints. `/write-plan` produces concrete commands, file paths, and config syntax.

### Schema

No persistent schema changes. Two operational additions:

- **E2E seed dataset** — a Prisma seed script tailored for E2E (`apps/backend/prisma/seed-e2e.ts` or similar) that resets the test database to a known state with at least one fixture user, household, and waterfall config. Does not touch production schema.
- **Optional E2E backend flags** — environment variables (e.g. `E2E_AUTO_VERIFY`, `E2E_BYPASS_RATE_LIMIT`) that the backend honours only when explicitly set, never in production builds.

### API

No new HTTP routes. The auth/household/waterfall/settings APIs are exercised through the existing endpoints. The only API-adjacent surface is the **E2E backend flags** above, which must:

- Default to off in production.
- Be set only via the E2E test-orchestration script.
- Never be honoured in a request that originates from outside the test runner (e.g. guarded by env, not by a request header).

### Components

> Scripts, configs, and test files. No new product UI.

- **Playwright config** — `playwright.config.ts` at the repo root or `apps/frontend/playwright.config.ts`. Defines projects (chromium minimum, optionally firefox/webkit later), base URL, retries (1 in CI, 0 locally), reporter, artefact paths.
- **E2E test files** — `e2e/auth.spec.ts`, `e2e/household.spec.ts`, `e2e/waterfall.spec.ts`, `e2e/settings.spec.ts`. Each follows arrange-act-assert; uses page-object helpers in `e2e/support/` for shared selectors.
- **E2E seed script** — Prisma-based seeder, idempotent reset.
- **CI workflow update** — `.github/workflows/ci.yml` adds an `e2e` job that depends on the existing `test` job; spins up the docker compose stack, runs Playwright, uploads artefacts on failure.
- **`jest-axe` setup** — extension to `apps/frontend/src/test/setup.ts` registering the `toHaveNoViolations` matcher.
- **a11y assertions in flows** — helper in `e2e/support/axe.ts` wrapping `@axe-core/playwright` so flow tests can call `await checkA11y(page)` after key navigation.
- **a11y component tests** — assertions added to existing `__tests__/` of `PageHeader`, `TwoPanelLayout`, form primitives, modals.
- **`eslint-plugin-jsx-a11y` config** — addition to `apps/frontend/eslint.config.js` extending `plugin:jsx-a11y/recommended`. Exemptions inline-commented where necessary.
- **Docs** — short addition to `docs/3. architecture/testing-approach.md` (or new `docs/3. architecture/e2e-testing.md`) covering how to run E2E locally, how to debug a CI failure, and the a11y violation triage policy.

### Notes

**Scope discipline.** Initial suite is intentionally small (four flows). The goal is to ship a stable, fast, trusted E2E foundation — not exhaustive coverage. Coverage breadth is added in follow-up specs.

**Flake control.** Use Playwright's auto-waiting and avoid arbitrary `waitForTimeout`. Tests must be deterministic against the seeded state. Any flake is treated as a bug, not a "retry it."

**Parallelism.** Each test creates its own user/household where possible. If isolation requires global state mutation (e.g. invite acceptance), serialize those tests via Playwright's `test.describe.serial`.

**a11y pragmatism.** `recommended` preset, not `strict`. Serious/critical only at the threshold initially. The aim is to catch obvious failures (unlabeled inputs, missing alt, role mismatches), not to chase every minor warning before merging this spec.

**Consequence for Group 2.** Once this lands, dependency-automation auto-merge becomes a defensible follow-up — patch updates that pass unit tests _and_ E2E are reasonably safe to auto-merge.

**Out of scope (intentional):** visual regression / screenshot diffing, performance budgets (Group 5 covers Lighthouse), cross-browser exhaustive matrix (chromium-only initially), mobile viewport coverage beyond a single viewport check, internationalisation testing, load testing.

## Security Notes

- **E2E test-mode bypasses are a security surface.** `E2E_AUTO_VERIFY` and similar flags must be guarded so a production build can never honour them, even if the env var is set in error. Recommend a build-time constant (`process.env.NODE_ENV === 'production'` short-circuits all bypass code paths).
- **Test users in CI.** Each CI run creates ephemeral users in a test database that is reset between runs. No real user data, no production DB connectivity from E2E.
- **Artefact handling.** Playwright traces / videos may capture rendered tokens or cookies. CI artefacts must be private to the repo; recommend a 7-day retention cap on E2E artefacts (default GitHub artefact retention is 90 days).
- **a11y testing has no security surface** — purely client-side assertions on rendered DOM.
- **Credential management for E2E.** Test seed credentials live in the seed script, not in a secret store. They must never match any real env's credentials and must be obviously test-only (e.g. `e2e+suite@finplan.test`).
