# Workflow Enhancement Roadmap

**Created:** 2026-05-04
**Status:** Agreed scope — specs to follow

This roadmap captures the workflow improvements agreed after the May 2026 repo audit. Source analysis: `~/.claude/plans/provide-a-comprehensive-analysis-deep-lighthouse.md`. Each item is grouped into a spec; follow the spec link once written.

## Explicitly out of scope (rejected during review)

For future-self context — these were considered and **declined** in this round:

- Production error tracking (Sentry or equivalent)
- Process-level unhandled error handlers
- Database backup / DR runbook
- Structured logging with PII redaction
- Stage environment deployment pipeline
- Shadow database for migration validation
- Container image scanning (Trivy)
- Storybook / visual regression
- Turbo remote cache

These may be revisited later but should not be assumed missing-by-oversight.

## In-scope groups

### Group 1 — Dev feedback loop

**Spec:** `dev-feedback-loop`
**Items:**

- Pre-commit hooks via husky + lint-staged (lint + type-check on changed files)
- Watch mode for the backend custom test runner (`apps/backend/scripts/run-tests.ts`)
- Coverage thresholds enforced in CI

**Why grouped:** All three tighten the local-and-CI quality feedback loop. Pre-commit catches issues before push; watch mode shortens TDD cycles; coverage thresholds lock in the current floor.

### Group 2 — Dependency automation

**Spec:** `dependency-automation`
**Items:**

- Dependabot or Renovate config with grouping + auto-merge for patch updates

**Why solo:** Distinct from CI gates; depends on test confidence to be safe to auto-merge. Worth its own spec to weigh Dependabot vs Renovate properly.

### Group 3 — Behavioural test coverage

**Spec:** `behavioural-test-coverage`
**Items:**

- Playwright E2E for critical flows (signup, login, household create, waterfall mutation, logout)
- Accessibility testing: jest-axe in component tests + eslint-plugin-jsx-a11y at lint time

**Why grouped:** Both expand the _kind_ of testing the repo does (behaviour + a11y) rather than adding more unit tests. Both touch the frontend test stack and CI matrix together. a11y violations triage will overlap naturally with E2E flow walkthroughs.

### Group 4 — Audit log durability

**Spec:** `audit-log-durability`
**Items:**

- Refactor the `audited()` helper to accept a transaction client
- Thread `prisma.$transaction` through ~350 call sites so mutation + audit insert commit atomically
- Drop the fire-and-forget pattern

**Why solo:** Backend-only, mechanical but high-touch refactor. No infra changes (no cron, no outbox). Compliance hardening.

### Group 5 — Frontend perf budget

**Spec:** `frontend-perf-budget`
**Items:**

- Lighthouse CI integration with a perf budget
- Bundle size monitoring (vite-plugin-visualizer or equivalent) with a CI budget check

**Why solo:** Frontend-only; lowest priority of the kept items. Independent of everything else.

## Recommended sequencing

Per leverage-per-hour from the audit:

1. Group 1 — dev feedback loop (highest immediate DX win)
2. Group 2 — dependency automation (small, defensive)
3. Group 4 — audit log durability (do before call-site count grows further)
4. Group 3 — behavioural test coverage (multi-day, unlocks safer auto-merge for group 2)
5. Group 5 — frontend perf budget (lowest priority)

## Spec status

| Group | Spec name                 | Status       | Spec doc                                                                                         |
| ----- | ------------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| 1     | dev-feedback-loop         | Spec written | [dev-feedback-loop-spec.md](dev-feedback-loop/dev-feedback-loop-spec.md)                         |
| 2     | dependency-automation     | Spec written | [dependency-automation-spec.md](dependency-automation/dependency-automation-spec.md)             |
| 3     | behavioural-test-coverage | Spec written | [behavioural-test-coverage-spec.md](behavioural-test-coverage/behavioural-test-coverage-spec.md) |
| 4     | audit-log-durability      | Spec written | [audit-log-durability-spec.md](audit-log-durability/audit-log-durability-spec.md)                |
| 5     | frontend-perf-budget      | Spec written | [frontend-perf-budget-spec.md](frontend-perf-budget/frontend-perf-budget-spec.md)                |

Update the **Status** and **Spec doc** columns as each `/write-spec` cycle completes.
