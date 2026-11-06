---
feature: committed-discretionary-shortfall-nudge
design_doc: docs/4. planning/committed-discretionary-shortfall-nudge/committed-discretionary-shortfall-nudge-design.md
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# Committed / Discretionary Shortfall Nudge

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

A household reviewing or editing their committed bills or discretionary spend should learn — without leaving the page — when an upcoming obligation can't be paid from their linked-account cashflow. Today this signal lives only inside Forecast → Cashflow. Surfacing it where the spending decisions are made closes the loop between editing intent and the consequence of that intent.

## Description

A two-surface, item-level shortfall nudge that lights up whenever ≥1 scheduled outflow in the next 30 days would push the projected linked-account balance below £0 on its due date. The Overview waterfall shows a compact amber badge on the Committed and/or Discretionary tier row (`● shortfall in Nd`). The Committed and Discretionary tier pages show an `AttentionStrip` below the `PageHeader` (`Cashflow won't cover N items`). A shared tooltip on hover lists the affected items with date and amount, plus today's balance and the lowest projected balance. The nudge disappears automatically when the shortfall resolves and is silent in historical snapshots.

## User Stories

- As a household member glancing at the Overview, I want to see which tier(s) contain upcoming items my cashflow won't cover, so I can react before the bill bounces.
- As a household member editing committed bills, I want an in-context nudge naming the items at risk so I can reorder due dates or move money without navigating to Forecast.
- As a household member editing discretionary spend, I want the same in-context nudge so I can trim a planned one-off when my balance won't take it.
- As a household member, I want the nudge to be silent when my cashflow comfortably covers everything (Anchor 11 — silence = approval).
- As a household member viewing a historical snapshot, I want the nudge to be absent so I don't confuse a forward-looking signal with a read-only historical view (Anchor 16).

## Acceptance Criteria

> Specific, testable criteria that define done. Each criterion must be verifiable without reading the implementation.

- [ ] On the Overview waterfall left panel, the Committed `WaterfallTierRow` shows an amber badge `● shortfall in Nd` when ≥1 committed-tier scheduled outflow within the next 30 days would, when applied on its due date, push the projected linked-account balance below £0
- [ ] On the Overview waterfall left panel, the Discretionary `WaterfallTierRow` shows the same badge when the equivalent condition is true for discretionary-tier items
- [ ] `N` in the badge equals the integer days from today (UTC midnight) to the due date of the **first** uncovered item in that tier (e.g. `shortfall in 1d`, `shortfall in 12d`)
- [ ] The shortfall badge and the existing staleness badge (`● N stale`) appear side-by-side in the same `WaterfallTierRow` attention slot when both signals are active for the same tier
- [ ] On the Committed tier page, an `AttentionStrip` appears between the `PageHeader` and the scrollable subcategory list when ≥1 committed-tier item is uncovered. Strip text: `Cashflow won't cover` then **N items** (bold, `font-numeric`, where `N` is the integer count of uncovered committed-tier items)
- [ ] On the Discretionary tier page, the equivalent `AttentionStrip` appears with the same text format, scoped to discretionary-tier uncovered items
- [ ] The `AttentionStrip` is pinned and does not scroll with the subcategory list (sits between `PageHeader` and the `flex-1 overflow-y-auto` content area)
- [ ] Hovering the badge or the strip opens a tooltip with the same body content for that tier:
  - Lede: `Some items won't be covered by your cashflow.`
  - Item list: up to 3 items, each row showing `{item name} · {DD MMM} · £{amount}`, amount rendered in `text-attention` `font-numeric`, sorted by due date ascending (ties broken alphabetically by name)
  - Overflow line (only when more than 3 uncovered items in scope): `+ N more`, followed by a clickable link `open Forecast → Cashflow for the full list` that navigates to the Forecast page with the Cashflow section focused
  - Grounding figures, separated from the list by a hairline divider: `Balance today` (today's linked-account balance) and `Lowest in 30 days` (lowest projected balance + date), each in `font-numeric`
- [ ] The nudge is absent on both surfaces when the household has no cashflow-linked Current/Savings accounts
- [ ] The nudge is absent on both surfaces when the user is viewing a historical snapshot (Anchor 16)
- [ ] The nudge is absent on both surfaces when the projection is loading or errored — fail quiet
- [ ] The nudge updates within one render cycle after the user creates, edits, or deletes a committed/yearly/discretionary item, or after a linked-account balance is updated
- [ ] The discretionary daily baseline (amortised monthly discretionary total ÷ days in month) is excluded from per-item detection. If the baseline alone causes a balance dip with no discrete event failing, no shortfall nudge fires (the existing Forecast → Cashflow view still surfaces the dip in its calendar)
- [ ] No new red, no new green; only the `attention` token (`#f59e0b`) and its `attention-bg` / `attention-border` tints are used (Anchor 11, Anchor 10)
- [ ] All language in the strip, badge, and tooltip is arithmetic-only — never recommendations (Anchor 9, Anchor 13)
- [ ] No nudge appears on Income, Surplus, Wealth, Planner, Forecast, or Settings pages

## Open Questions

- [x] ~~How should the badge behave in snapshot mode?~~ **Hidden entirely** — the nudge is forward-looking from today and would be misleading in a historical view.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No new entities. The feature reads from existing data:

- **Account** (`isCashflowLinked: true`, type `Current | Savings`) and its latest **AccountBalance** — provides today's linked-account balance.
- **IncomeSource**, **CommittedItem**, **DiscretionaryItem** with their **ItemAmountPeriod** records — provide the events that drive the projection.
- Snapshot context comes from existing snapshot infrastructure (no new fields).

### API

One new household-scoped read operation:

- **Get cashflow shortfall items for a window** — accepts an optional `windowDays` parameter (default 30, max 90). Returns:
  - `items`: ordered list of uncovered events within the window, each with `{ itemType, itemId, itemName, tierKey ('committed' | 'discretionary'), dueDate, amount }`. Sorted by `dueDate` ascending, ties broken by `itemName`.
  - `balanceToday`: the projected linked-account balance at the start of today (UTC), derived using the same anchor-replay logic as `cashflowService.getProjection`.
  - `lowest`: `{ value, date }` — the lowest single-day projected balance within the window.
  - `linkedAccountCount`: integer.
- **Auth:** JWT-protected via existing `authMiddleware`. `householdId` is sourced from the request context — never accepted from the URL or body.
- **Snapshot mode:** the operation refuses to run against a snapshot context. The frontend simply does not invoke it in snapshot mode; the backend additionally guards against it.
- **Re-uses** the existing per-event walk inside `cashflowService` (same `buildEvents` + balance-replay logic that powers `getProjection`). Implementation may either extend `cashflowService.getProjection` to return uncovered events alongside the existing payload, or add a sibling method — `/write-plan` decides.
- **Cache invalidation:** must be invalidated by the same mutations that already invalidate `["cashflow", "projection"]` — i.e. any committed item, discretionary item, income source, item amount period, account, or account balance mutation. Existing TanStack Query invalidation patterns apply.

### Components

- **`AttentionStrip`** — generic left-panel amber attention strip, already specified in `docs/2. design/design-system.md` § 2. Reused here for the tier-page strip. Accepts a body, a tooltip render function, and is pinned between `PageHeader` and the scrollable content area.
- **`ShortfallTooltip`** — shared tooltip body component. Receives the per-tier shortfall payload (items + grounding figures) and renders the lede, item list (capped at 3 with overflow line), and the two grounding figure rows. Used by both surfaces so the wording stays in lockstep.
- **Tier-row shortfall badge** — small amber `● shortfall in Nd` element rendered inside the `WaterfallTierRow` attention slot **alongside** (not replacing) the existing staleness badge. The slot becomes a horizontal stack of zero or more attention badges.
- **`useTierShortfall(tierKey)` hook** — wraps the new shortfall query, returns `{ items, count, daysToFirst, balanceToday, lowest, isLive }` filtered to one tier. `isLive` is false in snapshot mode (or when no linked accounts) and the consumer uses it to decide whether to render the badge/strip at all.
- **`WaterfallLeftPanel`** — extended to feed `useTierShortfall` results into the Committed and Discretionary `WaterfallTierRow`s. No structural change.
- **`TierPage`** — extended to render the `AttentionStrip` between `PageHeader` and the scrollable subcategory list when `tier === 'committed' || tier === 'discretionary'` and `useTierShortfall` reports `count > 0`. The strip wraps `ShortfallTooltip` as its hover content.

### Notes

- **Detection algorithm.** Walk every event the cashflow service builds within the window in `dueDate` order. Maintain the projected linked-account running balance (starting from today's projected `balanceToday`, deducting the daily discretionary baseline). For each event:
  - If applying the event makes the running balance go below £0, mark the event as **uncovered** (capture `itemType`, `itemId`, `itemName`, `tierKey`, `dueDate`, `amount`).
  - Apply the event to the running balance regardless (income adds, outflows subtract) so the next event's check uses the post-event balance.
  - The discretionary daily baseline is applied to the running balance but is never itself emitted as an "item".
- **Tier classification.** Each uncovered event is tagged `committed` (committed-item due date or yearly bill landing) or `discretionary` (discretionary-item due date / planned one-off). The same tag drives both the per-tier filtering on the Overview row and the per-page filtering on the tier-page strip.
- **Item count semantics.** The strip's `N items` and the badge's `N` count _unique events_ in the window for that tier — not unique source items. If a single recurring item happens to fall due twice within the 30-day window and both occurrences are uncovered, that's 2 items (each event is a separate broken payment).
- **`daysToFirst` calculation.** Integer days between today (UTC midnight) and the `dueDate` of the first uncovered event in that tier. Floor to 0 if the first uncovered event is today.
- **Tooltip overflow.** `+ N more` is displayed when the tier has more than 3 uncovered events. The visible 3 are the earliest by due date. The "open Forecast → Cashflow for the full list" portion is a real link that navigates to `/forecast` with the Cashflow section focused (using the existing focus mechanism). The link must be reachable by keyboard from the focused tooltip and must close the tooltip on activation. Navigation is non-mutating; this does not breach the design's "observational" Out of Scope rule (which forbids deferring/editing items, not navigation).
- **Snapshot detection.** The frontend uses the existing snapshot context (whatever the WaterfallLeftPanel and TierPage already use to know they're in a snapshot). When in a snapshot, `useTierShortfall` returns `isLive: false` and renders nothing. The new backend operation also rejects snapshot-context calls as a defence-in-depth measure.
- **Member context.** The nudge is household-level. There is no per-member filtering; an item owned by any household member counts toward the household's shortfall.
- **Performance.** The new operation should target ≤200ms p95 for typical households (≤5 linked accounts, ≤200 active items). The walk is O(events) for a 30-day window, dominated by the same arithmetic that already powers `getProjection`. Re-use the existing query/cache rather than introducing a new round trip if `getProjection` can carry the additional payload without significant size increase.
- **Accessibility.** Both surfaces expose the nudge to assistive tech: the strip uses `role="status"` with `aria-live="polite"` so its appearance is announced; the badge inside the tier row is wrapped in an element with an accessible name (`aria-label="Cashflow shortfall: N items in the next 30 days"`). The tooltip is a proper Radix Tooltip with keyboard focus support — focusing the badge or strip via keyboard reveals the same content as hovering.
- **Reduced motion.** Both surfaces respect `prefers-reduced-motion` (no fade/slide on appearance when the user has reduced motion enabled).
- **Security — authentication.** The new operation uses `authMiddleware` in `preHandler` (project rule). The household ID is sourced from `req.householdId!` only — never from URL or body parameters.
- **Security — authorisation.** All entities consulted (accounts, balances, income sources, committed items, discretionary items, item amount periods) are filtered by `householdId` from the request context. No member-role gating beyond standard household membership; any member of the household sees the nudge.
- **Security — data exposure.** Response shape contains only fields needed for the UI: `itemId` (opaque), `itemName` (already user-visible elsewhere), `dueDate`, `amount`, `tierKey`, plus the household's own balance figures. No internal join keys, no other-member PII not already visible to the calling member.
- **Security — input validation.** `windowDays` is validated by a Zod schema in `packages/shared` (integer, 1–90, default 30). Reject anything outside that range.
- **Security — multi-tenancy.** Cross-household leakage is prevented by the standard `householdId` scoping rule. The operation must include a unit test asserting it returns 404/empty for a different household's items even if their IDs are guessed.
- **Security — audit.** Read-only operation; no audit log entry required.
