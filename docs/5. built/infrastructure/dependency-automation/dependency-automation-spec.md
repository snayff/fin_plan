---
feature: dependency-automation
design_doc: docs/4. planning/workflow-enhancement-roadmap.md
creation_date: 2026-05-04
status: implemented
implemented_date: 2026-05-17
---

# Dependency Automation

> **Purpose:** Automate dependency update PRs and security advisory PRs so the stack does not silently drift behind, and so CVEs in `auth`/`fastify`/`prisma`/etc. are surfaced for action without manual polling.

## Intention

The repo currently has no `dependabot.yml` or `renovate.json`. Dependency updates and CVE patches happen manually, which means latency on a security patch depends on someone remembering to check. With JWT, Fastify, Prisma, and a real production user base, that latency is unacceptable risk.

## Description

Configure GitHub-native **Dependabot** to open weekly PRs for `npm` (Bun-compatible) and `github-actions` ecosystems, plus immediate PRs for security advisories. Updates are **grouped sensibly** to keep PR volume low; **all updates require manual review and approval** (no auto-merge in this round). Auto-merge can be revisited once Playwright E2E is in place (Group 3 of the workflow roadmap).

## User Stories

- As a maintainer, I want a single grouped PR per week per ecosystem so I can review and merge dep updates in one batch instead of churning through dozens.
- As a security-conscious maintainer, I want an immediate PR when a CVE affects any of our dependencies so I can act within hours rather than days.
- As a developer, I want CI to run on every Dependabot PR so I can trust that a green check means the update is safe to merge.
- As a developer, I want Dependabot configured at the monorepo root (with explicit awareness of `apps/backend`, `apps/frontend`, `packages/shared`) so that updates apply across the whole workspace.

## Acceptance Criteria

- [ ] `.github/dependabot.yml` exists and is committed.
- [ ] Dependabot opens weekly grouped PRs for `npm` ecosystem covering all workspace packages (`apps/backend`, `apps/frontend`, `packages/shared`, root).
- [ ] Dependabot opens weekly PRs for the `github-actions` ecosystem.
- [ ] Security advisories trigger an immediate PR (default Dependabot behaviour, not disabled).
- [ ] Updates are grouped by category to minimise PR count: at minimum, **dev-dependencies** are grouped together, and **prod dependencies** are grouped (or kept ungrouped if individually reviewable). Major-version bumps stay ungrouped so they can be reviewed individually.
- [ ] PRs target the correct base branch (`stage`, never `main`/`prod`).
- [ ] Each Dependabot PR runs the full CI matrix (lint, type-check, test, coverage check from Group 1) automatically.
- [ ] No auto-merge configured in this round; every PR requires human approval before merging.
- [ ] PR title and body conventions match the repo's existing commit style as far as Dependabot allows (prefix, reasonable verbosity).
- [ ] Reviewers / assignees configured so PRs are routed to the maintainer rather than sitting unattended.
- [ ] Bun lockfile (`bun.lock`) updates are produced correctly. (Dependabot has limited Bun support; verify lockfile gets regenerated on merge — see Open Questions.)

## Open Questions

- [ ] **Bun lockfile compatibility.** Dependabot has historically lagged on Bun support. Confirm during `/write-plan`: does Dependabot's `npm` ecosystem regenerate `bun.lock` correctly, or do we need a post-merge workflow to run `bun install` and update the lockfile? If the latter, the workflow lives outside this spec but must be planned alongside it.
- [ ] **Update cadence.** Weekly is the recommended default. Monthly would reduce PR noise but increase CVE exposure window. Confirm weekly during `/write-plan`.
- [ ] **Major-version bump policy.** Recommend ignoring major bumps for high-risk packages (`fastify`, `prisma`, `react`) to avoid surprise breaking-change PRs; manual upgrade tracked separately. Confirm package list during `/write-plan`.
- [ ] **PR labels.** Recommend `dependencies` + ecosystem label (`npm`, `github-actions`) so PR triage is filterable. Confirm during `/write-plan`.

---

## Implementation

> Interface-level constraints. `/write-plan` produces concrete YAML and any companion workflow.

### Schema

No database changes. One new tracked file:

- **`.github/dependabot.yml`** — declares the ecosystems, schedule, grouping rules, target branch, reviewers, and ignore list.

### API

No HTTP API changes. The "API surface" is GitHub's Dependabot config schema.

### Components

> "Components" here = configs and supporting files. No UI.

- **`.github/dependabot.yml`** — primary config. Two `updates:` blocks: one for `npm` (with workspace-aware directories, weekly schedule, grouping rules, ignore list for high-risk majors), one for `github-actions` (weekly).
- **(Possibly) `.github/workflows/dependabot-lockfile.yml`** — only if Dependabot does not regenerate `bun.lock` correctly. A post-PR-creation workflow that runs `bun install`, commits the regenerated lockfile back to the Dependabot branch, and re-triggers CI. Decision deferred to `/write-plan` per Open Questions.
- **README / docs note** — short addition to `CLAUDE.md` or a new `docs/3. architecture/dependency-management.md` describing review cadence, escape valves, and the manual-merge-only policy.

### Notes

**Why Dependabot over Renovate.** GitHub-native, no install, simpler maintenance surface. Renovate's richer features (dependency dashboard, fine-grained auto-merge rules) are not needed in this round because we are explicitly not auto-merging.

**Why no auto-merge yet.** Patch updates can still introduce behavioural regressions that unit tests miss. Auto-merge is only safe once Group 3 (Playwright E2E) gives us behaviour-level confidence. Revisit auto-merge in a follow-up spec after Group 3 ships.

**Grouping philosophy.** Many small PRs = review fatigue and lower scrutiny per PR. Group dev-deps together (low risk, batchable). Keep prod-dep majors individual so they get the attention they need. Security PRs always individual (default Dependabot behaviour).

**Branch target.** Per repo convention (CLAUDE.md + auto-memory `project_branching.md`), Dependabot PRs target `stage`, never `prod`/`main`.

**Ignore list scope.** Limit ignores to **major versions** of high-risk packages — minor and patch bumps for those packages should still flow through. The goal is to prevent surprise breaking-change PRs, not to freeze the dependency entirely.

**Out of scope (intentional):** auto-merge configuration, Renovate adoption, custom version pinning policies (e.g. `^` vs exact), private package registry support, Snyk or other commercial scanners, container base-image updates (would require Trivy or equivalent, explicitly skipped in roadmap).

## Security Notes

- **Supply-chain risk.** Dependabot PRs come from a trusted GitHub source; the bot does not require external secrets. Standard GitHub security model applies.
- **Compromised dependency PR risk.** Even with manual review, a malicious patch update could land if reviewers rubber-stamp. Mitigation: CI must run on every PR (already required), and reviewers should at minimum scan the changelog/release notes — not just the version bump.
- **Secret leakage.** Dependabot PRs do not have access to `secrets.*` in workflows by default (GitHub policy since 2021). Verify CI workflows are not granting Dependabot elevated secret access.
- **CVE response time.** Security advisories from Dependabot should be triaged within 48 hours of the PR opening. Document this expectation alongside the config.
