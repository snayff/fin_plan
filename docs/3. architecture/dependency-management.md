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
