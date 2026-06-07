# Dev Tooling — Hooks, Watch Mode, Coverage

> Local-and-CI feedback loop for finplan.

## Pre-commit hook

Runs `lint-staged`, which runs `eslint --fix --max-warnings=0` on staged `*.{ts,tsx,js,mjs,cjs}` files only. Config lives in `.lintstagedrc.js` (monorepo-aware: groups files by workspace and passes the correct `eslint.config.js` per workspace). Typical run ≤ 5 s for 1–5 files.

**Bypass:** `git commit --no-verify` — sanctioned escape hatch. CI re-runs full lint on PRs, so a bypass cannot reach `stage`/`prod` un-checked.

## Pre-push hook

Runs `bun run type-check` (full workspace, via Turbo). Typical run 10–25 s.

**Bypass:** `git push --no-verify` — same policy as pre-commit. CI re-runs type-check.

## Backend test watch mode

```bash
cd apps/backend
bun scripts/run-tests.ts --watch              # all files
bun scripts/run-tests.ts auth --watch         # files matching "auth"
```

- Re-runs affected test file(s) on save, in a fresh `bun test` subprocess (preserves the per-file isolation guarantee).
- Source → test mapping uses a filename heuristic: `foo.service.ts` → `foo.service.test.ts`. When no sibling exists and a filter is active, falls back to all test files matching the filter.

## Coverage floor & ratchet

CI gates **true whole-codebase coverage** for all three packages (`apps/backend`,
`apps/frontend`, `packages/shared`), climbing toward a **90/90** target.

- **How it's measured:** each package's isolated runner emits one lcov report per
  test file under `<package>/coverage/`. `scripts/check-coverage.ts` merges them
  all (`scripts/coverage-lcov.ts`) into real line/function coverage over the whole
  codebase. This replaced an earlier per-file **mean** of coverage percentages,
  which both misreported coverage and could never trend to 90% — every new test
  file dragged the average down. **Do not reintroduce a per-file mean.**
- **Baseline:** `coverage-baseline.json` at the repo root — per-package
  functions/lines percentages, capped at the 90 target once reached.
- **Floor:** fixed safety net in `scripts/check-coverage.ts` (functions ≥ 50%,
  lines ≥ 70%). The real upward pressure is the per-package ratchet.
- **Ratchet:** any drop > 1 pp on any metric for any package fails CI.

**Workflow — raising coverage:**

```bash
# 1. See the biggest gaps (most uncovered lines first)
bun run coverage:gaps                 # all packages, or: bun run coverage:gaps apps/backend

# 2. Add meaningful happy/unhappy tests for a chosen file, then re-measure
bun run coverage:backend              # or coverage:frontend / coverage:shared
#   backend needs a live Postgres — see the test runner notes / docker-compose.dev.yml
bun run coverage:check                # merges lcov, prints distance-to-90, gates

# 3. Lock in the gain so it can't regress
bun run coverage:bump                 # raises coverage-baseline.json to current (≤ 90)
```

`coverage:check` writes `coverage-current.json` (git-ignored) for inspection and
the CI artefact. When a metric reaches 90, the baseline pins at 90 rather than
letting the required margin creep above the target.
