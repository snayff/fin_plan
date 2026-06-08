---
feature: dependency-automation
category: infrastructure
spec: docs/4. planning/dependency-automation/dependency-automation-spec.md
creation_date: 2026-05-17
status: implemented
implemented_date: 2026-05-17
---

# Dependency Automation — Implementation Plan

> **For Claude:** Use `/execute-plan dependency-automation` to implement this plan task-by-task.

**Goal:** Configure Renovate to open grouped weekly PRs for npm + github-actions, regenerate `bun.lock` natively, hold every update for at least 48 hours after release, and route security advisories immediately — without manual polling.

**Spec:** `docs/4. planning/dependency-automation/dependency-automation-spec.md`

**Architecture:** One new file: `renovate.json` at the repo root. Renovate is run as a hosted GitHub App by Mend; once the app is installed against the repo, it reads `renovate.json` on every scheduled run. Config declares: `baseBranches: ["stage"]`, a weekly Monday schedule, `minimumReleaseAge: "48 hours"` for the 48h cooldown, package rules that group dev-deps and prod minor/patch, an ignore list for major bumps on high-risk packages (`fastify`, `prisma`, `react`, `vite`), labels and reviewer routing for Snayff, and Renovate's `vulnerabilityAlerts` block to bypass the cooldown for security advisories so CVE PRs still open immediately. Renovate has first-class Bun support and regenerates `bun.lock` itself, so no companion workflow is needed.

**Tech Stack:** Renovate (hosted GitHub App) · GitHub Actions · Bun

**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [ ] `.github/workflows/ci.yml` already runs on `pull_request` to `stage` (confirmed).
- [ ] Repo default branch and PR base branch is `stage`.
- [ ] Maintainer GitHub username `Snayff` is the assignee/reviewer target.
- [ ] **Renovate GitHub App installed** on the repository (`github.com/apps/renovate`). Installation is a one-time manual step taken by a repo admin (Snayff). The config file in this plan is inert until the app is installed.

## Notes on TDD shape

This feature ships configuration only — no service or component to unit-test. "Red" is verifying the config is absent or invalid; "green" is verifying it parses against Renovate's JSON schema and behaves correctly on the first scheduled run. Each task pairs the config edit with an explicit validation step.

## Tasks

### Task 1: Add Renovate configuration

**Files:**

- Create: `renovate.json`

- [ ] **Step 1: Write the failing check**

Run: `test -f renovate.json && echo EXISTS || echo MISSING`
Expected: `MISSING`

- [ ] **Step 2: Create the config**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":dependencyDashboard", ":semanticCommits"],
  "baseBranches": ["stage"],
  "timezone": "Europe/London",
  "schedule": ["* 6-8 * * 1"],
  "prConcurrentLimit": 10,
  "prHourlyLimit": 0,
  "labels": ["dependencies"],
  "reviewers": ["Snayff"],
  "assignees": ["Snayff"],
  "minimumReleaseAge": "48 hours",
  "internalChecksFilter": "strict",
  "rangeStrategy": "bump",
  "lockFileMaintenance": {
    "enabled": true,
    "schedule": ["* 6-8 * * 1"]
  },
  "vulnerabilityAlerts": {
    "labels": ["dependencies", "security"],
    "minimumReleaseAge": null,
    "schedule": []
  },
  "packageRules": [
    {
      "description": "Group dev dependencies (minor + patch only) into one PR.",
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "dev-dependencies",
      "addLabels": ["npm"]
    },
    {
      "description": "Group production dependencies (minor + patch only) into one PR.",
      "matchDepTypes": ["dependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "prod-dependencies-minor-patch",
      "addLabels": ["npm"]
    },
    {
      "description": "Group all GitHub Actions updates (minor + patch) into one PR.",
      "matchManagers": ["github-actions"],
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "github-actions",
      "addLabels": ["github-actions"]
    },
    {
      "description": "Tag all npm major bumps so they are reviewed individually.",
      "matchManagers": ["npm"],
      "matchUpdateTypes": ["major"],
      "addLabels": ["npm", "major"]
    },
    {
      "description": "Ignore major bumps for high-risk packages — tracked manually.",
      "matchPackageNames": [
        "fastify",
        "@fastify/**",
        "prisma",
        "@prisma/client",
        "react",
        "react-dom",
        "vite"
      ],
      "matchUpdateTypes": ["major"],
      "enabled": false
    }
  ]
}
```

- [ ] **Step 3: Validate JSON parses**

Run (PowerShell): `Get-Content renovate.json -Raw | ConvertFrom-Json | Out-Null; if ($?) { "OK" } else { "PARSE FAIL" }`
Expected: `OK`

- [ ] **Step 4: Validate against Renovate's schema**

Run: `bunx --bun renovate-config-validator`
Expected: `INFO: Validating renovate.json` followed by `INFO: Config validated successfully` (exit code 0).

If `renovate-config-validator` isn't available locally, the same check runs on every Renovate scan, surfaced as a "Configuration error" issue on the dependency dashboard.

- [ ] **Step 5: Verify key invariants**

Run: `Select-String -Path renovate.json -Pattern "\"baseBranches\": \\[\"stage\"\\]","\"minimumReleaseAge\": \"48 hours\"","\"vulnerabilityAlerts\""`
Expected: all three patterns present.

- [ ] **Step 6: Commit**

```bash
git add renovate.json
git commit -m "ci(renovate): add Renovate config with 48h release-age gate

- baseBranches: stage (per repo branching policy)
- weekly Monday schedule (Europe/London 06:00-09:00)
- 48-hour minimumReleaseAge cooldown on all non-security updates
- groups dev-deps and prod minor/patch to keep PR volume low
- ignores major bumps for fastify, prisma, react, vite (manual track)
- vulnerabilityAlerts bypass the cooldown for immediate CVE PRs
- labels: dependencies + ecosystem (npm/github-actions); reviewer: Snayff
- Renovate handles bun.lock regeneration natively"
```

---

### Task 2: Document dependency-management policy

**Files:**

- Create: `docs/3. architecture/dependency-management.md`

- [ ] **Step 1: Write the failing check**

Run: `test -f "docs/3. architecture/dependency-management.md" && echo EXISTS || echo MISSING`
Expected: `MISSING`

- [ ] **Step 2: Create the doc**

```markdown
# Dependency Management

Automated dependency updates are handled by **Renovate** (hosted GitHub App
by Mend). Config lives at `renovate.json` in the repo root.

## Why Renovate (not Dependabot)

Renovate supports a release-age cooldown (`minimumReleaseAge`), which we
require to avoid landing freshly-published versions before the ecosystem has
had a chance to flag regressions or compromise. Dependabot has no equivalent.
Renovate also regenerates `bun.lock` natively, so no companion workflow is
needed.

## Cadence

- **Weekly:** npm + github-actions, Mondays 06:00–09:00 Europe/London.
- **Hold-back: 48 hours.** No non-security PR opens for a version that was
  published less than 48 hours ago. Cooldown applies per-package, per-version.
- **Immediate:** security advisories bypass the 48h cooldown via the
  `vulnerabilityAlerts` block and open as soon as Renovate's next run detects
  them.

## Grouping

- **Dev-dependencies (minor/patch):** single grouped PR per week.
- **Prod dependencies (minor/patch):** single grouped PR per week.
- **GitHub Actions (minor/patch):** single grouped PR per week.
- **Major bumps:** individual PRs (not grouped) so they get full attention.
- **Security advisories:** always individual (default).

## Ignored Majors

Major bumps are disabled for these high-risk packages and tracked manually:

- `fastify`, `@fastify/**`
- `prisma`, `@prisma/client`
- `react`, `react-dom`
- `vite`

Minor and patch updates for these packages still flow through Renovate.

## Review Policy

- **No auto-merge in this round.** Every Renovate PR requires human approval.
  Auto-merge will be reconsidered once Playwright E2E (workflow roadmap
  Group 3) provides behaviour-level confidence.
- **CVE triage SLA: 48 hours.** Security advisory PRs must be reviewed and
  merged (or explicitly deferred with a documented reason) within 48 hours of
  the PR opening.
- **Review depth:** scan the changelog / release notes linked in the PR body
  — not just the version bump.

## Target Branch

All Renovate PRs target `stage`, never `main`/`prod`, per repo branching
policy.

## Dependency Dashboard

Renovate maintains a single tracking issue ("Dependency Dashboard") in the
repo's Issues tab. It lists every pending update, every blocked update (with
reason — e.g. "awaiting release age"), every ignored package, and every
config error. Check it weekly; it is the source of truth for Renovate state.

## Bun Lockfile

Renovate has first-class Bun support and regenerates `bun.lock` as part of
every PR. No companion workflow is needed; CI's `bun install --frozen-lockfile`
succeeds on Renovate PRs out of the box.

## Escape Valves

- **Ignore a dependency temporarily:** add a `packageRules` entry to
  `renovate.json` with `matchPackageNames` and `enabled: false`.
- **Pause Renovate entirely:** uncheck "Auto-merge / open PRs" on the
  dependency dashboard issue, or set `"enabled": false` at the top of
  `renovate.json`.
- **Re-enable an ignored major:** remove the package from the ignored-majors
  `packageRules` entry.
- **Force a run outside the schedule:** tick the relevant checkbox on the
  dependency dashboard issue.
```

- [ ] **Step 3: Verify the doc renders**

Run: `Select-String -Path "docs/3. architecture/dependency-management.md" -Pattern "^## Cadence","^## Grouping","^## Ignored Majors","^## Review Policy","^## Dependency Dashboard","^## Bun Lockfile"`
Expected: all six section headers present.

- [ ] **Step 4: Commit**

```bash
git add "docs/3. architecture/dependency-management.md"
git commit -m "docs(architecture): document Renovate-based dependency policy

Cadence, 48h cooldown, grouping, ignored majors, review SLA, and
dependency dashboard reference."
```

---

### Task 3: Install Renovate GitHub App (manual, one-time)

**Files:** none — this is a GitHub UI action, recorded here as a checklist item.

- [ ] **Step 1: Install the app**

Navigate to `https://github.com/apps/renovate` → **Install** → select the
`fin_plan` repository (or organisation-wide with this repo selected). Authorise.

- [ ] **Step 2: Verify the onboarding PR**

Renovate's first action on a freshly-installed repo is to open an onboarding
PR titled `Configure Renovate`. Because `renovate.json` already exists from
Task 1, the onboarding PR should detect it and close itself, or open a
no-op PR that simply enables Renovate. **Merge or close the onboarding PR.**

- [ ] **Step 3: Verify the dependency dashboard issue is created**

Issues tab → look for an open issue titled `Dependency Dashboard`. This
confirms Renovate is reading `renovate.json` and running scans.

- [ ] **Step 4: Verify base-branch and 48h gate in the dashboard**

The dashboard lists pending updates. For each pending non-security update,
verify Renovate notes the release-age gate where applicable ("Awaiting
schedule" / "Pending — minimumReleaseAge not yet met"). Verify any opened PRs
target `stage`.

- [ ] **Step 5: No commit needed**

This step is GitHub-side only. Record completion in the PR description that
merges Tasks 1 and 2.

---

## Testing

> No code units to test. Verification is JSON-schema validation + post-install GitHub-side observation.

### Config validation

- [ ] `renovate.json` parses as valid JSON.
- [ ] `bunx renovate-config-validator` exits 0 with no errors or warnings.
- [ ] `renovate.json` references `baseBranches: ["stage"]` exclusively — no references to `main` or `prod`.
- [ ] `renovate.json` contains `"minimumReleaseAge": "48 hours"` at the top level (applies to all non-security updates).
- [ ] `vulnerabilityAlerts.minimumReleaseAge` is `null` (security PRs bypass the cooldown).

### Post-install GitHub-side verification

> These run after Task 3. They cannot be automated locally.

- [ ] Dependency Dashboard issue exists and shows no "Configuration error" entries.
- [ ] First scheduled Monday run produces at least one grouped PR (dev-deps or prod minor/patch) against `stage` — provided at least one eligible update is ≥48h old.
- [ ] Each opened PR has labels `dependencies` + ecosystem (`npm` or `github-actions`), reviewer `Snayff`, assignee `Snayff`.
- [ ] Each Renovate PR commits an updated `bun.lock` alongside the `package.json` change, and CI's `bun install --frozen-lockfile` passes.
- [ ] A version published <48h ago does NOT appear in an open PR; it appears in the dashboard under "Pending status checks" or equivalent until the 48h elapses.

### Negative checks

- [ ] No Renovate PR opens against `main` or `prod`.
- [ ] Major-version PRs for ignored packages (`fastify`, `prisma`, `react`, `vite` and their related packages) do NOT appear; the dashboard shows them under "Ignored or Blocked".

## Verification

- [ ] `Get-Content renovate.json -Raw | ConvertFrom-Json` succeeds.
- [ ] `bunx --bun renovate-config-validator` exits 0.
- [ ] `bun run lint` passes clean (sanity check — no source changes).
- [ ] `bun run type-check` passes clean (sanity check).
- [ ] PR opened against `stage`, merges, Renovate App installed, Dependency Dashboard issue appears within 1 hour.
- [ ] First scheduled Monday produces correctly-labelled grouped PRs respecting the 48h cooldown.

## Post-conditions

- [ ] Dependency updates surface automatically as reviewable PRs, but only after a 48-hour ecosystem-stability window.
- [ ] CVE-driven security PRs bypass the cooldown and surface immediately.
- [ ] Bun lockfile stays in sync with `package.json` on every Renovate PR (native Renovate behaviour).
- [ ] Future work: revisit auto-merge configuration once Playwright E2E (roadmap Group 3) ships.
- [ ] Future work: container base-image scanning (Trivy or equivalent) — explicitly out of scope here.
