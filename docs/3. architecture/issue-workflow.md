# Issue Workflow

How work is tracked on GitHub for finplan. This is the **single source of truth** for ticket structure — the issue templates (`.github/ISSUE_TEMPLATE/`) and the `/create-new-ticket` and `/progress-ticket` skills all render the structures defined here, so nothing drifts.

> **The repo is public.** Every issue is world-readable. See [Privacy rules](#privacy-rules) — they are not optional.

---

## Two tracks

Every ticket is exactly one of:

| Track            | Label          | For                        | Pipeline                                                      |
| ---------------- | -------------- | -------------------------- | ------------------------------------------------------------- |
| **Feature**      | `feature`      | Big-ticket work            | Full 5-stage pipeline (Design → Spec → Plan → Build → Verify) |
| **Quick change** | `quick-change` | Small, self-contained work | Implemented directly — no design/spec/plan                    |

The track label is the first signal read when picking up a ticket.

---

## Label scheme

Minimal and purposeful. The **checklist in the issue body** is the source of truth for _where a ticket is up to_ — there are deliberately no per-stage status labels.

| Label                                 | Role                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `feature`                             | Big-ticket, full pipeline                                                                                    |
| `quick-change`                        | Small, implement directly                                                                                    |
| `ready-to-build`                      | Feature's Plan stage is complete → executable now. **Managed automatically** (see [Automation](#automation)) |
| `a11y`                                | Accessibility domain                                                                                         |
| `enhancement`, `documentation`, `bug` | Domain labels (reused from defaults)                                                                         |

There is **no public `security` label** — security-sensitive items never live in public issues (see [Security items](#security-items)).

`ready-to-build` answers the one query worth filtering on: _what can I pick up and execute right now?_

```bash
gh issue list --label ready-to-build
```

---

## Canonical slug

A single **slug** (kebab-case, e.g. `model-interest-inflation-debt`) threads through every layer so nothing is ever re-typed or drifts:

```
issue title  →  branch feature/<slug>  →  docs/4. planning/<slug>/  →  skill invocations  →  PR "Closes #N"
```

The slug is recorded in the issue body so it is the one canonical string everything derives from.

---

## Feature ticket anatomy

The canonical body for a `feature` ticket:

```markdown
**Slug:** `<slug>`

## Summary

<generic, product-focused — no personal/financial/infra detail>

## Intent

<the original ask, sanitized>

## Pipeline

- [ ] **Design** — `/write-design <slug>` → `docs/4. planning/<slug>/design.md`
- [ ] **Spec** — `/write-spec <slug>` → `docs/4. planning/<slug>/spec.md`
- [ ] **Plan** — `/write-plan <slug>` → `docs/4. planning/<slug>/plan.md`
- [ ] **Build** — `/execute-plan <slug>`
- [ ] **Verify** — `/verify-implementation <slug>` → moves docs to `docs/5. built/`

## Related

<cross-links to overlapping issues, e.g. "Relates to #12">
```

- Each box gets its **artifact link pasted in** when completed, so the issue is a self-contained trail.
- **Current stage = the first unticked box.**
- Ticking **Plan** triggers `ready-to-build` (see [Automation](#automation)).

---

## Quick-change ticket anatomy

The canonical body for a `quick-change` ticket:

```markdown
**Slug:** `<slug>`

## Summary

<what + why, generic>

## Acceptance criteria

- <bullet>

## Done when

- [ ] Implemented
- [ ] `bun run lint && bun run type-check && bun run test` pass
```

No design/spec/plan gates.

---

## Creating tickets

Two front-ends, one canonical structure:

- **`/create-new-ticket`** — CLI/agent creation. Gathers track + slug + summary + intent, runs the [privacy check](#privacy-rules), applies labels, and creates the issue. Drives the migration batch too.
- **Issue form templates** (`.github/ISSUE_TEMPLATE/feature.yml`, `quick-change.yml`) — manual creation in the GitHub UI. Blank issues are disabled so structure is always enforced.

---

## Progressing tickets

**`/progress-ticket <N>`** is the driver. The operational loop:

- **`quick-change`** → branch off `stage` as `quick-change/<slug>`, implement (TDD), run `bun run lint && bun run type-check && bun run test`, tick the boxes, PR into `stage`.
- **`feature`** → read the checklist, find the first unticked box, run that stage's skill. On completion: tick the box, paste the artifact link, commit. Stop at each gate the stage skill itself requires the user to approve (Design/Spec/Plan all have built-in approval) — never run the whole pipeline end-to-end silently.

Stage → command mapping:

| Unticked box | Command run                     |
| ------------ | ------------------------------- |
| Design       | `/write-design <slug>`          |
| Spec         | `/write-spec <slug>`            |
| Plan         | `/write-plan <slug>`            |
| Build        | `/execute-plan <slug>`          |
| Verify       | `/verify-implementation <slug>` |

---

## Security items

Vulnerability-class items — anything that reveals a current weakness in the live app — become **private [GitHub Security Advisories](https://github.com/snayff/fin_plan/security/advisories)**, never public issues. A vague placeholder issue is _also_ not created, because even that hints at the area. Specifics live in the advisory, visible only to the maintainer, and can convert to public disclosure later if ever wanted.

---

## Privacy rules

The repo (and therefore every issue **and** every doc under `docs/`) is public. Standing rules, baked into the templates and both skills:

1. **Nothing about the developer or their circumstances** — no real figures, household details, salary, identity, or email.
2. **No infra / PROD topology** — nothing about deployment, hosting, tunnels, or "real users".
3. **Security weaknesses → advisories**, never public issues.
4. **Generated design docs are public too** — the same rules apply to examples and figures inside any `/write-design` output.

---

## Automation

`.github/workflows/ticket-labels.yml` keeps `ready-to-build` in sync with the **Plan** checkbox on `feature` issues — even when a box is ticked manually in the web UI:

- Plan checked + label absent → add `ready-to-build`
- Plan unchecked + label present → remove `ready-to-build`

This means the label never needs manual bookkeeping; the checklist is always the source of truth.
