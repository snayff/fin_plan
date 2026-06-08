# Coverage → 90/90 — Continuation Handoff

Goal: ratchet true whole-codebase coverage to **90% functions / 90% lines** in
every package (`apps/backend`, `apps/frontend`, `packages/shared`).

## What's already in place (don't redo / don't regress)

- **True-coverage gate.** `scripts/check-coverage.ts` merges every package's
  per-file lcov (`scripts/coverage-lcov.ts`) into real line/function coverage.
  **Do not reintroduce the old per-file mean** — it misreports coverage and can
  never trend to 90% (each new test file drags the average down).
- **All three suites gated in CI** (`.github/workflows/ci.yml` → `test` job).
- **Per-package floor + 1pp ratchet** against `coverage-baseline.json`. When a
  metric reaches 90 the baseline pins at 90 (don't let the margin exceed target).
- **Tooling:** `coverage:gaps`, `coverage:bump`, `coverage:{backend,frontend,shared,check}`.

## Current true coverage (baseline)

| Package         | functions       | lines               |
| --------------- | --------------- | ------------------- |
| packages/shared | 100 (pinned 90) | 99.4 (pinned 90) ✅ |
| apps/backend    | 82.1            | 76.9                |
| apps/frontend   | 64.8            | 76.5                |

### Progress log (issue #65)

- **Backend lines 72.8 → 76.9.** Added service tests: `waterfall.service.crud`
  (yearly/discretionary/savings CRUD, history, batch-confirm, deleteAll branches),
  `cashflow.service.shortfall-anchor` (past/future anchor-replay),
  `gifts.service.reads` (config reads, virtual-member getPersonDetail, rollover),
  `assets.service.mutations` (update/delete/record/confirm for assets+accounts),
  `import.service.extra` (duplicate-member validation, restoreFromBackup guards).
- **Frontend functions 54.7 → 64.8, lines 74.2 → 76.5.** Added `service-endpoints`
  (thin apiClient wrappers across every service) and full hook coverage for
  `useWaterfall`, `useAssets`, `useGifts`, `useSettings`, plus `formatAmount`.

### Still to climb

- **Backend functions 82.1 → 90** (lines also need +13). Remaining line gaps:
  `household.service`, `subcategory.service`, `member.service`, routes, middleware,
  and the `import.service.importHousehold` transaction body (hard — needs a deep
  prismaMock graph or a DB-backed integration test).
- **Frontend → 90.** Biggest remaining: component long tail (gifts `QuickAddPanel`,
  assets `AssetAccountRow`/`*ItemArea`/`*Form`, tier `ItemForm`, settings panels)
  via `@testing-library/react` render tests, plus `lib/api.ts` (fetch wrapper).

## The per-batch loop

1. `bun run coverage:gaps <pkg>` — pick ONE file with many uncovered lines.
2. Read the source + its existing test; add meaningful **happy and unhappy**
   tests in the existing harness style (per-file isolated runner; mock
   `apiClient` via `mock.module("@/lib/api", …)` for thin service wrappers — see
   `apps/frontend/src/services/household.service.endpoints.test.ts`).
3. `bun run coverage:<pkg>` then `bun run coverage:check` — confirm green + a real rise.
4. `bun run lint && bun run type-check`.
5. Commit, then `bun run coverage:bump` to lock the gain in, commit the baseline.
6. Push.

## Priority order

- **Backend lines (72.8 → 90):** `waterfall.service` → `cashflow.service` →
  `gifts.service` → `assets.service` → `import.service`, then middleware/util mop-up.
- **Frontend functions (54.7) & lines (74.2):** remaining services →
  hooks (`useWaterfall`, `useAssets`, `useGifts`, `useSettings`) → component long
  tail by feature folder (gifts, assets, tier, settings).

## Gotchas

- **Backend tests need a live Postgres.** In a fresh sandbox: run the PG16
  binaries as the `postgres` user (`initdb`/`pg_ctl` refuse to run as root),
  create db `finplan_test`, `prisma db push`, then set the JWT/COOKIE/CORS env
  vars the `test` CI job uses. (Docker registry pulls are network-blocked here.)
- `coverage/` dirs and `coverage-current.json` are git-ignored — never commit them.
- Test-infra files (`src/test/helpers/test-db.ts`, `src/test/fixtures/index.ts`)
  count toward backend coverage; they're legitimate uncovered lines, not noise to
  exclude unless the team decides otherwise.
