---
feature: dev-feedback-loop
design_doc: docs/4. planning/workflow-enhancement-roadmap.md
creation_date: 2026-05-04
status: backlog
implemented_date:
---

# Dev Feedback Loop

> **Purpose:** Tighten the local-and-CI quality feedback loop so that lint, type, and coverage regressions are caught at the earliest practical point — and so backend TDD has a sub-second iteration cycle.

## Intention

Today, lint and type errors are caught only after a push (CI round-trip = minutes), backend test iteration requires re-running the full filtered suite per change, and coverage can silently regress because no thresholds are enforced. This feature closes all three gaps so developers get faster, more reliable feedback and so the current strong test coverage cannot quietly erode.

## Description

Three interlocking changes:

1. **Pre-commit and pre-push hooks** via husky + lint-staged. Pre-commit runs `eslint --fix` (zero warnings) on staged files only — kept fast so devs do not reach for `--no-verify`. Pre-push runs full `bun run type-check` so type errors land before CI.
2. **Watch mode** on the backend custom test runner (`apps/backend/scripts/run-tests.ts`). Watches source and test files; on change, re-runs the affected test file in its own subprocess (preserving the existing isolation guarantee).
3. **Coverage thresholds** in CI: a fixed minimum floor for statements / branches / functions / lines, **plus** a ratchet that fails the build if a PR decreases per-package coverage by more than 1%.

## User Stories

- As a developer, I want lint errors blocked at commit time so I do not push broken code and waste a CI cycle.
- As a developer, I want type errors blocked at push time so I am not the person who turned the `stage` build red.
- As a backend developer doing TDD, I want my failing test to re-run within a second of saving so my iteration loop matches the frontend's vitest watch experience.
- As a maintainer, I want the build to fail when coverage drops, so the codebase's strong test discipline cannot silently erode under deadline pressure.
- As a developer adding a new package or module, I want a clear minimum coverage floor so I know what "enough tests" means before I open a PR.

## Acceptance Criteria

- [ ] Running `git commit` on a change containing an ESLint violation in a staged file is blocked with a clear error message and a non-zero exit.
- [ ] Pre-commit only inspects staged files (verified by committing one of two changed files and seeing only that file linted).
- [ ] Pre-commit completes in under 5 seconds for a typical 1–5 file change.
- [ ] Running `git push` is blocked when `bun run type-check` fails anywhere in the workspace.
- [ ] `bun scripts/run-tests.ts --watch` starts the runner in watch mode, prints a "watching" banner, and re-runs the affected test file within 2 seconds of saving any source or test file.
- [ ] In watch mode, modifying a single test file re-runs only that file (not the whole suite), and modifying a source file re-runs the test file(s) that import it (or, if the import graph is impractical, all test files matching the active filter — see Open Questions).
- [ ] Watch mode honours an optional positional filter (`bun scripts/run-tests.ts auth --watch`) so it only watches/runs files matching the filter.
- [ ] Watch mode preserves per-file subprocess isolation (each re-run spawns a fresh `bun test` subprocess; mocks do not bleed between iterations).
- [ ] CI fails when total per-package coverage falls below the configured fixed floor (statements/branches/functions/lines).
- [ ] CI fails when a PR decreases per-package coverage by more than 1 percentage point on any of the four metrics (ratchet).
- [ ] The current coverage baseline is captured in a tracked file (e.g. `coverage-baseline.json`) so the ratchet has a reference; updates to this file are part of normal PR review.
- [ ] All hooks can be bypassed with `--no-verify` only as a documented escape hatch; CI still enforces both gates.
- [ ] Documentation in `CLAUDE.md` (or a new dev-tooling doc under `docs/3. architecture/`) explains hook behaviour, watch mode usage, and how to update the coverage baseline.

## Open Questions

- [ ] What numeric values should the fixed coverage floor use? Recommend baselining first (run coverage on the current `stage`) and choosing values 5–10 points below the observed floor per package, so the threshold is a real safety net rather than an aspirational target. Final numbers to be set during `/write-plan`.
- [ ] Should the watch-mode source-file → test-file mapping use a static heuristic (filename match: `foo.service.ts` → `foo.service.test.ts`) or follow imports? Recommend static heuristic for simplicity; fall back to "rerun all matching the filter" when no match is found.
- [ ] Should pre-push also run a fast-failing subset of tests (e.g. unit tests only, no DB)? Recommend **no** — keeps pre-push under 30s and avoids tempting `--no-verify`. Tests stay in CI.
- [ ] Should husky be configured at the repo root or per-app? Recommend repo root (single source of truth, matches monorepo shape).

---

## Implementation

> Interface-level constraints. `/write-plan` produces concrete commands, file paths, and config syntax.

### Schema

No database changes. One new tracked file:

- **coverage-baseline.json** — JSON map of package → metric → percentage (e.g. `{ "apps/backend": { "statements": 78.4, "branches": 71.2, ... } }`). Updated as part of PRs that legitimately raise the floor; the ratchet check reads from this file.

### API

No HTTP API changes. Internal CLI surface:

- **Backend test runner watch flag** — `bun scripts/run-tests.ts [filter] --watch` enters watch mode; same filter semantics as non-watch invocation; honours `--coverage` (though recompute-on-change is undefined — see Open Questions).
- **Coverage check script** — a new script that, given the latest coverage report and `coverage-baseline.json`, exits non-zero on either (a) breach of fixed floor or (b) ratchet violation (>1pp drop).

### Components

> "Components" here = scripts, configs, and tooling files. No UI.

- **Husky pre-commit hook** — invokes `lint-staged`. Lints (with `--fix`) only files matching `*.{ts,tsx,js,mjs,cjs}` in the stage area. Zero warnings policy preserved.
- **Husky pre-push hook** — runs `bun run type-check` at the workspace root.
- **lint-staged config** — repo-root config (`package.json` `lint-staged` field or `.lintstagedrc`); maps glob → `eslint --fix --max-warnings=0`.
- **Watch-mode addition to `apps/backend/scripts/run-tests.ts`** — uses `chokidar` (or Bun's native fs.watch) to observe `src/**/*.ts` and `**/*.test.ts`; on change, debounces and re-spawns the per-file test subprocess. Maintains the existing isolation guarantee.
- **Coverage check script** — runs after `bun test --coverage` in CI; parses LCOV / coverage-summary JSON; compares against `coverage-baseline.json` and the fixed floor.
- **CI workflow update** — `.github/workflows/ci.yml` adds the coverage check as a required step in the existing test job. Coverage artefact published for PR review.
- **Dev tooling docs** — short section in `CLAUDE.md` or new `docs/3. architecture/dev-tooling.md` covering hook bypass policy, watch-mode usage, baseline-update process.

### Notes

**Hook escape hatch.** `--no-verify` must remain available but documented as an exception. CI is the backstop, so a slipped commit cannot reach `stage`/`prod` un-checked.

**Ratchet bookkeeping.** When a PR legitimately removes a code path or refactors so that overall coverage rises in absolute terms but drops in one package (e.g. moved to another), the developer updates `coverage-baseline.json` in the same PR. Reviewers see the baseline change as a tracked diff — intentional, not silent.

**Watch mode and the isolation guarantee.** The whole reason for the custom runner is per-file subprocess isolation (Bun's global mock cache leaks otherwise). Watch mode must NOT short-circuit this by re-running tests in the watcher's own process. Each re-run = fresh `bun test <file>` subprocess.

**Order of implementation.** Hooks first (smallest, biggest immediate win). Watch mode second. Coverage thresholds last (requires a baselining step, which needs a stable target branch).

**Bypass surfaces.** `--no-verify` is the only sanctioned bypass. Skipping CI checks (e.g. forcing merge of a red PR) requires explicit reviewer approval and is out of scope for this spec.

**Out of scope (intentional):** commit-message linting (commitlint), pre-commit secret scanning, Husky for the design-system structural test, frontend test runner watch (vitest already has it), parallelising the backend test runner across multiple CI runners.

## Security Notes

The hooks themselves do not change the auth surface or data flow. Two security-adjacent considerations:

- **No `--no-verify` in CI**: hooks must not influence the CI pipeline; CI must independently run lint, type-check, test, and coverage check. A hook bypass on a developer machine cannot let unsafe code through.
- **Coverage baseline file**: tracked in the repo (no secrets); not user-modifiable at runtime; modifications visible in PR diff. No security implication beyond the usual code-review trust model.
- **Watch mode file access**: `chokidar` watches files inside the repo only; no user-input-driven path resolution. No path traversal surface.
