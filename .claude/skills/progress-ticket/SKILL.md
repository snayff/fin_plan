---
name: progress-ticket
description: Use to advance a finplan GitHub issue by one stage — reads the ticket, runs the correct next step (design/spec/plan/build/verify for features, or direct implementation for quick-changes), then updates the checklist, links artifacts, and manages branches. Invoke with `/progress-ticket <issue-number>`.
---

# Progress Ticket (finplan)

Advances a ticket by exactly one stage, doing all the bookkeeping so the process is identical every time. Structure and stage→command mapping come from `docs/3. architecture/issue-workflow.md` — the single source of truth.

## On Invocation

**Announce:** "Progressing ticket #<N>. I'll find the next step, run it, and update the ticket."

## Step 1: Read the ticket

```bash
gh issue view <N> --json number,title,labels,body
```

Note the track label (`feature` vs `quick-change`) and the **slug** from the body. Verify the current branch with `git branch --show-current` before any commit.

## Step 2a: Quick-change track

1. Branch off `stage`: `git checkout stage && git pull && git checkout -b quick-change/<slug>`.
2. Implement using TDD (see `superpowers:test-driven-development`).
3. Run `bun run lint && bun run type-check && bun run test`. Fix all failures.
4. Tick the "Done when" boxes in the issue body (`gh issue edit <N> --body ...`).
5. Open a PR into `stage` with `Closes #<N>`.

## Step 2b: Feature track

1. Find the **first unticked box** in the Pipeline checklist — that is the current stage.
2. Run the mapped command for that stage:

   | Box | Command |
   | --- | --- |
   | Design | `/write-design <slug>` |
   | Spec | `/write-spec <slug>` |
   | Plan | `/write-plan <slug>` |
   | Build | `/execute-plan <slug>` |
   | Verify | `/verify-implementation <slug>` |

3. **Respect the gate.** Design/Spec/Plan skills each have built-in user approval — stop there. Never chain multiple stages in one invocation.
4. On stage completion, update the issue body: tick the box and paste the artifact link (e.g. `docs/4. planning/<slug>/design.md`). Use `gh issue edit <N> --body ...`.
5. Do **not** touch the `ready-to-build` label — the `ticket-labels` Action manages it automatically when the Plan box is ticked.
6. Commit any artifact/doc changes on the appropriate branch (`feature/<slug>`), verifying the branch first.

## Step 3: Report

State which stage was completed, the artifact produced, and what the next stage will be.

## Privacy

Generated docs are public (see `docs/3. architecture/issue-workflow.md` → Privacy rules). Keep personal/financial/infra detail out of every artifact.
