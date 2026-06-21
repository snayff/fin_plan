---
name: write-design
description: Use at the start of any new fin_plan feature — structures the design through dialogue, one requirement area at a time, and produces an approved design doc. Flags conflicts with design standards and enforces exception/new-standard resolution. Offers visual companion for visual questions. Invoke with `/write-design <feature-name>`.
---

# Write Design (fin_plan)

Standalone skill for turning feature ideas into approved design docs through structured dialogue, with design standard enforcement and optional visual companion support.

<HARD-GATE>
Do NOT begin any implementation work — no code, no scaffolding, no file changes to the codebase. The only outputs of this skill are the design doc and, if agreed, updates to design standard docs. Implementation happens in `/execute-plan`.
</HARD-GATE>

## On Invocation

**Announce:** "Writing design for `<feature-name>`. I'll work through one area at a time and check everything against our design standards."

## Step 1: Load Context

Before beginning, read in parallel:

- `docs/2. design/_design-readme.md` — read this first; use it to identify which specific design docs are relevant to this feature (anchors, system, definitions, philosophy, etc.)
- The identified design docs only — do not load all of `docs/2. design/` indiscriminately
- `template.md` (in this skill's directory) — the design doc template to fill
- `examples/sample.md` (in this skill's directory) — a fully-populated example showing the expected format and level of detail

## Step 2: Visual Companion Offer

After reading context but before asking any clarifying questions, assess whether upcoming questions will involve visual content (UI mockups, layouts, diagrams, comparisons).

If visual questions are likely, send ONLY this message — no other content in the same turn:

> "Some of what we're working on might be easier to explain if I can show it to you in a web browser. I can put together mockups, diagrams, and visual comparisons as we go. This feature is still new and can be token-intensive. Want to try it? (Requires opening a local URL)"

Wait for the user's response. If they decline, proceed with text-only brainstorming.

If they accept, read the visual companion guide at `/c/Users/Gabriel/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/visual-companion.md` for full server operation details.

Start the server:

```bash
bash "/c/Users/Gabriel/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/scripts/start-server.sh" --project-dir "<project-root>"
```

On Windows, use `run_in_background: true` on the Bash tool call. Then parse the server-started JSON for both `screen_dir` (where HTML content files are written) and `state_dir` (where server state lives). Read `$STATE_DIR/.server-info` to get the URL and port. Tell the user to open the URL.

If the topic has no visual questions (e.g. a backend-only feature, a data model change), skip this step entirely and proceed to Step 3.

## Step 3: Structured Requirement Gathering

Before asking any questions, identify the key requirement areas for this feature — e.g. data model, user flows, edge cases, error handling, access control, member scoping. State these areas upfront so the user knows what to expect, then work through them in order. Complete understanding of one area before moving to the next. Within each area, ask one question at a time and wait for a response.

- Prefer multiple choice questions when possible
- Focus on understanding: purpose, constraints, success criteria
- When in doubt, ask — never assume on anything that affects scope or behaviour
- Assess scope early: if the request covers multiple independent subsystems, flag this immediately and help decompose before diving into details

**Per-question visual decision (silent):** If the visual companion is active, decide FOR EACH QUESTION whether to use the browser or terminal. Do NOT re-offer the companion — just use it or don't.

- **Use the browser** when the content itself IS visual: UI mockups, wireframes, layout comparisons, architecture diagrams, side-by-side visual designs
- **Use the terminal** when the content is text: requirements, conceptual choices, tradeoff lists, scope decisions, technical decisions

A question _about_ a UI topic is not automatically visual. "What sections should the page have?" → terminal. "Which of these two layouts works better?" → browser.

When using the browser:

- Write HTML content fragments to `screen_dir` (the server wraps them in the frame template)
- Use semantic filenames: `layout.html`, `visual-style.html` — never reuse filenames
- Tell the user what's on screen and remind them of the URL
- On your next turn, read `$STATE_DIR/.events` for browser interactions
- When returning to terminal-only questions, push a waiting screen to clear stale content

### Mockup file location

All mockup HTML files MUST be written to the `screen_dir` returned by the visual companion server (inside `.superpowers/brainstorm/`). Never write mockup or visual companion HTML files into `apps/`, `packages/`, or `docs/`.

### Privacy in mockups (public repo)

Mockups get copied into `docs/` (a public location) in Step 6. **Never put real personal data in a mockup** — no real name, personal email, or production domain, even when mimicking the live app. Use placeholders: `Jane Smith` / `jane@example.com` / `example.com`. The `privacy:check` gate will reject the commit otherwise (see `docs/3. architecture/issue-workflow.md` → Privacy rules).

## Design Standard Checks

Throughout Steps 3–5, silently check every requirement, proposal, and decision against the loaded design docs. When a conflict or deviation exists, surface it explicitly before proceeding:

> ⚠️ **Design standard conflict:** [what is being proposed] conflicts with [specific design doc + principle].
>
> How would you like to proceed?
>
> - **a)** Adjust to align with the standard
> - **b)** Proceed as a **documented exception** — noted in the design doc, design standards unchanged
> - **c)** Adopt as the **new standard** — the relevant design doc will be updated before this session ends

Rules:

- Only suggest deviating from design standards when there is a material improvement to justify it — never for convenience or novelty
- When proposing approaches, always lead with the design-compliant option
- If the user chooses **(c)**: queue the design doc update; apply it in Step 6 before saving

## Step 4: Propose Approaches

Once you understand what's being built:

- Propose 2-3 different approaches with trade-offs
- Lead with the design-compliant option and explain why it is recommended
- Where a non-compliant option is worth surfacing, flag the deviation explicitly (see Design Standard Checks above)
- Present options conversationally
- Keep YAGNI in mind — remove unnecessary features from all designs

## Step 5: Present Design

Present the design for approval:

- Scale each section to its complexity: a few sentences if straightforward, more detail if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing approach
- Be ready to go back and clarify if something doesn't make sense

**Design for isolation and clarity:**

- Break the system into units with one clear purpose and well-defined interfaces
- For each unit, answer: what does it do, how do you use it, what does it depend on?
- Prefer smaller, focused files over large ones that do too much

**In existing codebases:**

- Explore current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work, include targeted improvements — don't propose unrelated refactoring.

## Step 6: Save and Chain

Once the user approves the design:

1. Create the directory `docs/4. planning/<feature-name>/` if it doesn't exist.
2. If the visual companion was used: copy key mockup HTML files from `screen_dir` to `docs/4. planning/<feature-name>/mockups/`. Reference them in the Visual Reference section by filename only (not server path).
3. Save the design doc to `docs/4. planning/<feature-name>/<feature-name>-design.md` using the `template.md` structure.
4. If any design doc updates were agreed (option c in Design Standard Checks): apply them now to the relevant docs in `docs/2. design/`.
5. If the visual companion is running, stop it: `bash "/c/Users/Gabriel/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/scripts/stop-server.sh" $STATE_DIR`
6. Tell the user:

> "Design saved to `docs/4. planning/<feature-name>/<feature-name>-design.md`.
>
> When you're ready to write the formal spec, start a new chat and run:
> `/write-spec <feature-name>`"
