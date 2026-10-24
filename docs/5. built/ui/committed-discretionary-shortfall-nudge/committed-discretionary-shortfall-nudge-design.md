---
feature: committed-discretionary-shortfall-nudge
status: approved
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# Committed / Discretionary Shortfall Nudge — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

Today, a household only learns that their cashflow can't cover an upcoming bill if they navigate to Forecast → Cashflow. Users editing committed bills or discretionary spend in the dedicated tier pages — the most natural place to react to a shortfall — get no in-context signal. Likewise on the Overview waterfall, where they see tier totals but no flag that those totals will leave specific items uncovered in the near term.

This design surfaces the same arithmetic that already drives the cashflow forecast — at the _moment of editing_, in the _place editing happens_.

## Approved Approach

A two-surface, item-level shortfall nudge driven by the existing cashflow projection:

- **Overview waterfall tier rows (Committed and Discretionary)** gain an inline amber attention badge: `● shortfall in 12d`. Reuses the existing `WaterfallTierRow` attention badge slot (today: `● 3 stale`). Both badges may appear simultaneously when both signals apply (treated as badges, not nudges — Anchor 13 governs nudges only).
- **Committed and Discretionary tier-page left panels** gain a slim amber `AttentionStrip` immediately below the `PageHeader`: "Cashflow won't cover **2 items**". Hovering reveals the affected items with date and amount, plus two grounding figures (today's balance, lowest projected balance + date).

Both surfaces share the same detection: a scheduled outflow within the next 30 days is "uncovered" if applying it on its due date would push the projected linked-account balance below £0. The nudge appears whenever ≥1 such item exists; the strip and tooltip enumerate them.

This was preferred over a single-surface design because the two surfaces serve different users at different moments — the Overview row alerts the user reviewing the whole picture; the tier-page strip explains it in the context where they can act.

## Key Decisions

| Decision                               | Choice                                                                                                                                                                                                      | Rationale                                                                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What "pot balance" means               | Total **linked-account balance** (sum of cashflow-linked Current + Savings accounts), as already projected by `cashflowService.getProjection`                                                               | Anchor 15's ÷12 virtual yearly-bill pot doesn't apply to discretionary, but the user wants the same nudge on both pages. The linked-account projection naturally covers both tiers' contributions.                        |
| Surface(s)                             | **Both** Overview waterfall tier rows and the Committed/Discretionary tier-page left panels                                                                                                                 | Different users, different moments. Overview = at-a-glance; tier page = context for action.                                                                                                                               |
| Overview tier-row form                 | Inline amber badge in the existing `WaterfallTierRow` attention slot: `● shortfall in 12d` (countdown to first uncovered item)                                                                              | Reuses the existing pattern; the countdown conveys urgency in 14 characters.                                                                                                                                              |
| Tier-page strip form                   | Slim full-width strip below `PageHeader`, `attention-bg` + `attention-border`, dot + text. Strip text: "Cashflow won't cover **N items**"                                                                   | Modelled on `StaleDataBanner`. The "items" framing is more actionable than a balance figure (the user can identify which obligation is the trigger).                                                                      |
| Detection — what counts as a shortfall | Per-item: for each discrete scheduled outflow within the next 30 days, would applying it push the projected balance below £0? Brief intra-day dips that don't fail any payment do **not** trigger the nudge | Anchor 11 (calm by default): we only nudge when there's something concrete the user could act on, not for theoretical micro-dips. Item-level framing maps to user mental model.                                           |
| What counts as an "item"               | Discrete scheduled events only — committed items on their due date, yearly bills landing, planned discretionary one-offs. The discretionary daily baseline does **not** count                               | Discretionary baseline is amortised across the month; flagging it as a single "item" would be misleading. If baseline alone causes a dip, no item-level nudge fires (the underlying cashflow forecast still surfaces it). |
| Tooltip body                           | Sentence lede ("Some items won't be covered by your cashflow."), then list of items (name · date · amount), with overflow "+ N more" beyond 3                                                               | Matches the user's preference for sentence-first structure with arithmetic figures below. Cap protects the tooltip from unbounded growth.                                                                                 |
| Grounding figures in tooltip           | Two only: **balance today**, **lowest in 30 days · date**. "Net change" dropped                                                                                                                             | Net change is ambiguous (collides with per-month "net change" in the existing forecast UI) and not directly relevant to a shortfall nudge.                                                                                |
| Word choice                            | "Cashflow", not "pot"                                                                                                                                                                                       | "Pot" is reserved by Anchor 15 for the ÷12 virtual yearly-bill pot. "Cashflow" is the existing user-facing term for the linked-account projection (see `definitions.md` → Cashflow).                                      |
| Badge collision on Overview row        | **Both badges visible side-by-side** when a tier is both stale and has a shortfall                                                                                                                          | Stale and shortfall are independent signals with different actions. Anchor 13 governs _nudges_ (right-panel arithmetic prompts), not badges. Reusing the same dot would lose information.                                 |
| Design-system status                   | New first-class `AttentionStrip` component added to `design-system.md` § 2                                                                                                                                  | Future left-panel attention needs (e.g. ISA allowance ending, sync warnings) can reuse the documented pattern without a fresh design pass.                                                                                |
| Tooltip overflow                       | Cap at **3 visible items**; show "+ N more · open Forecast → Cashflow for the full list" beneath when more exist                                                                                            | Keeps the tooltip a glanceable size; directs deeper inspection to the place that already shows day-by-day detail.                                                                                                         |
| Tier where it appears                  | Committed and Discretionary only (and their Overview tier rows)                                                                                                                                             | Income and Surplus tiers don't drive uncovered outflows.                                                                                                                                                                  |

## Out of Scope

- **Per-pot / per-subcategory shortfall.** Future work might introduce a discretionary-pot model; this design strictly uses the total linked-account projection.
- **Deferring or rescheduling items** from the nudge. The nudge is observational; remediation happens elsewhere (the user opens the item to edit it).
- **Notifications / email / push.** UI-only.
- **Nudges in the right panel.** `NudgeCard` continues to be the right-panel prompt mechanism — unchanged.
- **Backend per-item shortfall API.** A new endpoint shape is implied (the existing `getProjection` doesn't return per-item uncovered events) but that is a spec/plan concern, not a design concern.
- **Configuration of the 30-day window.** The window is fixed at 30 days for v1.
- **Stacking with other left-panel signals beyond staleness.** No other left-panel signals exist today.
- **Wealth, Planner, Forecast, Settings pages.** The nudge is scoped to Overview + Committed + Discretionary.

## Visual Reference

- `placement.html` — three placement options explored; option C (both surfaces) selected
- `form-and-copy.html` — Overview badge variants and tier-page strip variants; A3 + B2 framing selected, then refined
- `tooltip-items.html` — strip text and tooltip variants for the item-level reframe; S2 + U2 selected
- `badge-collision.html` — Overview tier-row collision with the existing stale badge; C1 (both visible) selected
- `design-system-implications.html` — D1 vs D2 comparison; D1 (first-class addition) selected
