---
name: create-new-ticket
description: Use to create a finplan GitHub issue (feature or quick-change) with consistent structure, slug, labels, and a public-repo privacy check. Handles single tickets and migration batches. Routes security-sensitive items to a private advisory instead. Invoke with `/create-new-ticket`.
---

# Create New Ticket (finplan)

Creates GitHub issues with the canonical structure defined in `docs/3. architecture/issue-workflow.md` — the single source of truth. This skill is the CLI/agent front-end; the issue form templates are the manual front-end. Both must produce identical structures.

## On Invocation

**Announce:** "Creating a finplan ticket. I'll confirm the track and slug, run a privacy check, then create it."

## Step 1: Load the canonical structure

Read `docs/3. architecture/issue-workflow.md` — use its "Feature ticket anatomy", "Quick-change ticket anatomy", "Label scheme", and "Privacy rules" sections verbatim. Do not invent structure.

## Step 2: Determine the track

- **`feature`** — big-ticket; runs the full 5-stage pipeline.
- **`quick-change`** — small, self-contained; implemented directly.

If unclear, ask. A useful test: does it need a design conversation before anyone could implement it? If yes → `feature`.

## Step 3: Security gate (STOP if it applies)

If the item reveals a current weakness in the live app (missing auth control, injection risk, rate-limit gap, etc.), **do NOT create a public issue.** Instead, direct the user to create a private Security Advisory at
`https://github.com/snayff/fin_plan/security/advisories/new` and capture the specifics there. Explain why (the repo is public). Then stop.

## Step 4: Gather fields

Collect the slug (kebab-case) and the body fields for the chosen track. Reuse the user's wording for Summary/Intent but **sanitize** it.

## Step 5: Privacy check (mandatory)

Before creating, confirm the title and body contain **none** of:

1. Personal/financial specifics, identity, or the developer's circumstances (real figures, household, salary, email).
2. Infra / PROD topology (deployment, hosting, tunnels, "real users").
3. Any security-weakness detail (→ should be a Step 3 advisory).

If anything trips this, rewrite generically before proceeding.

## Step 6: Create

Build the body to exactly match the canonical anatomy, then:

```bash
gh issue create \
  --title "<concise title>" \
  --label "<feature|quick-change>" \
  --body "<canonical body>"
```

Add any domain labels (`a11y`, `enhancement`, `documentation`) and `--body` cross-links (`Relates to #N`) as needed. Do **not** add `ready-to-build` manually — automation manages it.

## Step 7: Report

Return the new issue number and URL. For a migration batch, repeat Steps 2–6 per item and report all created issues plus any routed to advisories.
