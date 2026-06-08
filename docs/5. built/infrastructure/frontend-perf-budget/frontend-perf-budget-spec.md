---
feature: frontend-perf-budget
design_doc: docs/4. planning/workflow-enhancement-roadmap.md
creation_date: 2026-05-04
status: backlog
implemented_date:
---

# Frontend Performance Budget

> **Purpose:** Catch accidental bundle bloat and runtime-perf regressions in the frontend before they reach `stage`. Adds two complementary CI gates: per-entry bundle size budgets via `size-limit`, and a Lighthouse CI run on key authed routes scoring Performance and Accessibility against a fixed budget.

## Intention

The repo has no perf monitoring. A misjudged dependency import (`import _ from 'lodash'`), a heavy date library swap, or a regression in route-level code-splitting can quietly ship without anyone noticing — until users on slower networks complain. Lighthouse + size-limit catch both classes of regression at PR time, when fixes are cheap. This is the lowest-priority item in the workflow roadmap, deliberately scoped narrow.

## Description

Two gates, each fast enough to run on every PR:

1. **Bundle size budget** via `size-limit`. Per-entry budgets (initial JS, vendor, main route chunk) configured in `package.json`. CI fails if a budget is exceeded; a PR comment shows the size delta vs. base branch.
2. **Lighthouse CI** runs against three authed routes (login, dashboard, waterfall) using the existing Docker-composed stack from Group 3 (or a lightweight Lighthouse-only stack if Group 3 hasn't shipped yet). Performance and Accessibility categories scored against fixed minimums.

Both gates ship with **explicit baselines** captured at first run. The budget is a floor — a real safety net set 5–10 points below current measurements — not an aspirational target.

## User Stories

- As a developer, I want a CI gate that fails if I accidentally pull in a heavy dependency, so I notice the size impact at PR time, not in production.
- As a developer, I want a per-PR comment showing bundle-size deltas so I can see the cost of my change without digging through CI logs.
- As a maintainer, I want frontend Performance scores to stay within an agreed budget on critical routes, so a slow-rendering refactor cannot quietly ship.
- As an a11y-conscious developer, I want Lighthouse's a11y category to gate merges on key routes — complementing the per-component `jest-axe` work in Group 3 with a real-browser audit.
- As a maintainer, I want the budget configurable in code (not a SaaS dashboard) so the policy is reviewable in PRs.

## Acceptance Criteria

### Bundle size

- [ ] `size-limit` is installed as a dev dependency at the frontend workspace.
- [ ] `size-limit` config in `apps/frontend/package.json` (or `.size-limit.json`) defines per-entry budgets covering at minimum: initial JS bundle, vendor chunk, and main app entry.
- [ ] Initial budget values are set after a baseline build (recommend 5–10% above current measurements as the floor — not aspirational).
- [ ] `bun run size` runs locally and prints a pass/fail report.
- [ ] CI runs `size-limit` on every PR; failure blocks merge to `stage`.
- [ ] CI posts a PR comment showing the size delta per entry vs. base branch (via `size-limit` GitHub action or equivalent script).
- [ ] Budget can be raised via PR — the bump itself is the change record (visible in diff, reviewable).

### Lighthouse CI

- [ ] Lighthouse CI (`@lhci/cli`) runs against three routes in CI: `/login`, `/dashboard` (or current home-after-login route), `/waterfall` (or whichever route surfaces the waterfall view).
- [ ] LHCI runs against the production-built docker stack — not `vite dev`.
- [ ] Performance category minimum score: **75** (mobile profile, simulated 3G + slow CPU). Accessibility minimum: **95**. Initial budget set after first baseline run; tighten over time.
- [ ] Test runs are seeded so authed routes are reachable. Reuse the E2E seed from Group 3 if available; otherwise the LHCI job spins up its own minimal seed.
- [ ] CI fails if either Performance or Accessibility falls below the configured minimum on any of the three routes.
- [ ] LHCI artefacts (full HTML reports) uploaded to the workflow run for inspection on failure.
- [ ] LHCI run completes in under 5 minutes for the three-route suite.

### Both

- [ ] The two gates run as part of the existing CI workflow (a `frontend-perf` job that depends on the `build` job and runs in parallel with `e2e` if Group 3 has shipped).
- [ ] Both gates have a documented escape hatch: a PR raising the budget is allowed; reviewers see and approve the bump consciously. No "skip CI" mechanism.
- [ ] Documentation in `CLAUDE.md` (or new `docs/3. architecture/frontend-perf.md`) covers running both locally, interpreting the output, and the budget-bump policy.

## Open Questions

- [ ] **Initial budget values.** Cannot be set without a baseline run. `/write-plan` step zero is "run a baseline build + LHCI on `stage` and capture the numbers." Final budget = baseline + 5–10% headroom.
- [ ] **Authed-route seeding for LHCI.** Two options: (a) reuse the Group 3 E2E seed; (b) ship a minimal LHCI-only seed. Recommend (a) if Group 3 has shipped first; (b) otherwise. Confirm during `/write-plan` based on shipping order.
- [ ] **Mobile vs desktop profile.** Recommend mobile (3G/slow-CPU simulation) — the more demanding of the two, and the profile real users on cellular hit. Desktop scores can be tracked as a non-failing metric. Confirm during `/write-plan`.
- [ ] **Lighthouse flake.** LHCI is known to be variable run-to-run (~3–5 score points). Mitigate by running 3 samples per URL and using the median. Confirm during `/write-plan` whether 3 samples is acceptable for the time budget.
- [ ] **Bundle budget granularity.** Initial budget covers entry chunks. Should we also budget per-route lazy chunks individually? Recommend **no** initially — start with three entries to keep the config legible; add per-route budgets only if a real regression motivates them.
- [ ] **CI runner choice for LHCI.** GitHub-hosted runners are fine but the perf simulation is sensitive to runner CPU. Self-hosted runner (matches the project's existing self-hosted infra) gives more deterministic results but adds maintenance. Confirm during `/write-plan`.

---

## Implementation

> Interface-level constraints. `/write-plan` produces concrete config and CI YAML.

### Schema

No database changes. Two new tracked configurations:

- **`size-limit` config** — `apps/frontend/package.json` `"size-limit"` field or `.size-limit.json` listing entries + their budgets.
- **`lighthouserc.json`** — at the repo root or `apps/frontend/`. Lists URLs, sample count, assertion thresholds (perf >= 75, a11y >= 95).

### API

No HTTP API changes. CLI surfaces:

- **`bun run size`** at the frontend workspace — runs `size-limit` locally.
- **`bun run lhci`** at the frontend workspace — runs Lighthouse CI locally against a started production preview.
- A CI orchestration command that boots the production-built stack, seeds the test data, runs LHCI, and tears down.

### Components

> Configs, scripts, and CI workflow files. No UI.

- **`size-limit` config** — entries defined for initial JS, vendor chunk, main app entry. Each entry has `path`, `limit`, optional `gzip` flag.
- **`lighthouserc.json`** — assertions block enforcing perf/a11y minimums; collect block listing the three URLs and sample count; upload block defaulting to filesystem (no SaaS).
- **CI workflow update** — `.github/workflows/ci.yml` adds a `frontend-perf` job after `build`. Job runs `size-limit` (always) and LHCI (against the booted stack with seeded data).
- **GitHub action / script for size-delta PR comment** — recommend the `andresz1/size-limit-action` action (or its modern fork). Posts/updates a single comment per PR.
- **LHCI seed script** — if not reusing Group 3's seed, a minimal Prisma seed for the LHCI test database creating one user + household + a few waterfall rows so the routes render meaningful content.
- **Docs** — short addition to `CLAUDE.md` or new `docs/3. architecture/frontend-perf.md` covering local commands, budget rationale, and the bump policy.

### Notes

**Budget is a floor, not a target.** Setting the budget at the current measurement guarantees the next change fails CI. Set it 5–10% (or 5–10 LHCI score points) above current, so legitimate small regressions don't churn the pipeline, but real bloat is still caught.

**Why size-limit over the rollup-plugin-visualizer alternative.** Visualizer gives humans a treemap; size-limit gates the build. The PR comment from size-limit's action is the killer feature — most regressions get caught at the comment, not at the failed-CI level.

**Why mobile-profile LHCI.** finplan is a financial dashboard but real users open it on mobile devices, often on flaky connections. Mobile profile is the more demanding measurement; if mobile passes, desktop will too.

**Coordination with Group 3.** Group 3 introduces Playwright + jest-axe; this group introduces LHCI a11y scoring. The two are complementary, not redundant: jest-axe runs on isolated component DOM in jsdom; LHCI runs on the rendered route in a real Chromium. They catch different failures (e.g. jest-axe missed contrast issues that only appear with the real CSS cascade).

**Order of work in `/write-plan`.** Baseline build to establish budgets → install size-limit + write config → wire into CI → install LHCI + write config → wire into CI → docs.

**Out of scope (intentional):** runtime perf monitoring (RUM, web-vitals telemetry to a backend), per-route lazy-chunk budgets beyond the initial three, desktop LHCI profile as a hard gate, SEO and best-practices Lighthouse categories, third-party SaaS perf dashboards (e.g. SpeedCurve, Calibre), Vite plugin replacement / bundler swap.

## Security Notes

- **No new auth or data-flow surface.** Budgets and LHCI are CI-only; nothing runs in production.
- **LHCI test credentials.** If LHCI logs in to render authed routes, it uses the same test credentials as the Group 3 E2E suite (or equivalent isolated test creds). These are repo-scoped, never match real env credentials, and live in seed scripts — not in `secrets.*`.
- **LHCI artefacts may contain rendered DOM.** Reports are uploaded as workflow artefacts; default GitHub artefact retention applies. No sensitive data renders on `/login`, `/dashboard`, or `/waterfall` for the seeded test user, but verify the seed dataset contains no PII-shaped values during `/write-plan`.
- **size-limit dependency.** New dev dependency; review during install. Pinned via Dependabot once Group 2 ships.
- **No production runtime cost.** Both tools are dev/CI only. No impact on production bundle, runtime, or attack surface.
