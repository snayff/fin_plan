---
feature: overview-financial-summary
design_doc: docs/4. planning/overview-financial-summary/overview-financial-summary-design.md
creation_date: 2026-03-29
status: implemented
implemented_date: 2026-07-05
---

# Overview — Financial Summary Panel

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

The Overview right panel currently shows a placeholder when no waterfall item is selected. This is a missed opportunity: the user is already looking at their waterfall and has no at-a-glance view of their overall financial position or how each tier has trended over time. The Financial Summary Panel fills the default right-panel state with a calm, scannable snapshot of the full financial picture — net worth plus each waterfall tier, each with a trend sparkline.

## Description

When nothing is selected in the Overview right panel, a stacked column of summary cards is displayed, centred at 62% of the panel width. Net worth sits at the top as a hero card with a gradient background and large figure. Below it, four tier cards follow in waterfall order (Income, Committed, Discretionary, Surplus), each showing the tier total and a trend sparkline. Sparklines draw from all available historical data: auto-snapshots for tier totals, and WealthAccountHistory entries for net worth. Selecting any waterfall item replaces this panel with the existing item detail view as before.

To power tier sparklines, the backend automatically upserts a daily snapshot after any waterfall mutation, named `auto:YYYY-MM-DD` with `isAuto: true`. These accumulate silently and are never shown to users as named snapshots.

## User Stories

- As a user, I want to see my current net worth and all four waterfall tier totals at a glance when I open the Overview page, so that I can orient myself before drilling into individual items.
- As a user, I want a trend sparkline next to each figure so that I can see whether my income, committed spend, discretionary spend, and surplus have been stable or drifting.
- As a user, I want the summary panel to appear automatically — with no action required — so that it is always ready as my starting context.
- As a user with no wealth accounts, I want the net worth card to show a clear placeholder so that I understand the data is not yet available without feeling like something is broken.
- As a user who has just started using FinPlan, I want the sparklines to show a flat line rather than an error when there is no history yet, so that the absence of history feels calm, not alarming.

## Acceptance Criteria

- [ ] The Financial Summary Panel is shown in the right panel whenever no waterfall item is selected
- [ ] Selecting a waterfall item replaces the panel with the existing item detail view; deselecting returns to the summary panel
- [ ] The panel contains exactly 5 cards stacked vertically: Net Worth, Income, Committed, Discretionary, Surplus — in that order
- [ ] All cards are the same width (62% of right panel width) and centred
- [ ] Net Worth card uses the indigo→violet callout gradient background, a 36px JetBrains Mono figure, and a full-width sparkline (no side padding)
- [ ] Each tier card displays the tier name in its tier colour, the tier total at 19px JetBrains Mono, and a sparkline with 14px side padding
- [ ] Each tier card sparkline uses the tier's colour token with an area-fill gradient
- [ ] Sparklines show all available historical data (all auto-snapshots for tier cards; all WealthAccountHistory entries summed to net worth per date)
- [ ] When no historical data exists for a sparkline, a flat horizontal line at the current value is shown
- [ ] Net worth card shows `£—` with no sparkline when the household has no WealthAccount records
- [ ] Cards animate in with a stagger entrance (Pattern 1: y 6→0, opacity 0→1, 250ms, ease-out-quart, 60ms stagger between cards) when the panel first mounts or re-enters view
- [ ] Animation respects `prefers-reduced-motion` (instant render, no transition)
- [ ] After any successful waterfall mutation, the backend upserts a `Snapshot` with name `auto:YYYY-MM-DD` and `isAuto: true` for the current day
- [ ] Auto-snapshots (isAuto: true) cannot be deleted or renamed through any user-facing route

## Open Questions

_None — all questions resolved during design and spec phases._

---

## Implementation

### Schema

No new models required. Existing models are sufficient:

- **Snapshot**: already has `isAuto: Boolean`, `name: String`, `data: Json`, and a unique constraint on `[householdId, name]`. Auto-snapshots use the naming convention `auto:YYYY-MM-DD` and set `isAuto: true`. The `data` field stores the full `WaterfallSummary` JSON (identical shape to existing named snapshots).
- **WealthAccountHistory**: already records per-account balance at each valuation date. Net worth sparkline data is derived by summing balances across all household accounts per recorded date.
- **WealthAccount**: `balance` field provides the current net worth input via the existing `WealthSummary.netWorth` computation.

### API

- **Get financial summary** — returns current net worth, current tier totals, net worth sparkline series (all WealthAccountHistory entries, summed to household net worth per date, ordered ascending), and tier sparkline series (tier totals parsed from all `auto:*` snapshots ordered by `createdAt` ascending) — JWT-protected, household-scoped, single round trip.
- **Upsert daily auto-snapshot** — internal server-side operation (not a user-facing route); called after any successful waterfall mutation (create, update, delete on IncomeSource, CommittedItem, DiscretionaryItem, Subcategory, SavingsAllocation); upserts a `Snapshot` record with `name = auto:YYYY-MM-DD` (today's date), `isAuto = true`, and `data` = current `WaterfallSummary`. If a record for today already exists, it is overwritten with the latest state.
- **Existing snapshot DELETE and PATCH (rename) routes** — must reject requests targeting snapshots with `isAuto: true` with a 403 response.

### Components

- **FinancialSummaryPanel** — default right-panel content; renders when `selectedItem === null`; fetches financial summary data; owns the stagger entrance animation (Framer Motion Pattern 1, `staggerChildren: 0.06`); renders `NetWorthCard` followed by four `TierSummaryCard` instances in waterfall order; handles loading state (skeleton cards) and error state.
- **NetWorthCard** — hero card with indigo→violet callout gradient background (`linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.05))`), 1px indigo border at 10% opacity, 36px JetBrains Mono figure, full-width `SummarySparkline` with no side padding; renders `£—` with no sparkline when `netWorth === null`.
- **TierSummaryCard** — standard surface card; tier name centred in tier colour (13px, 600 weight, Outfit, uppercase, letter-spacing 0.09em); tier total centred at 19px JetBrains Mono; `SummarySparkline` with 14px side padding in the tier's colour with area-fill gradient; one instance per tier.
- **SummarySparkline** — Recharts `AreaChart`; accepts an array of `{ date: string, value: number }` data points and a colour string; renders a smooth area-fill gradient (colour at 20% opacity fading to transparent); when data has fewer than 2 points, renders a flat horizontal line at the current value (single segment from left to right edge at that value); no axis labels, no tooltips, no grid lines; height fixed at 40px.

### Notes

- **Committed tier total for sparkline**: computed as `committed.monthlyTotal + committed.monthlyAvg12` from the snapshot `data` JSON (consistent with how surplus is derived in the existing waterfall summary).
- **Net worth sparkline derivation**: for each distinct valuation date across all household `WealthAccountHistory` entries, the net worth is the sum of the most recent balance for each account on or before that date. The server returns an ordered `(date, netWorth)` series.
- **Auto-snapshot trigger placement**: the upsert is a service-level concern on the backend; it fires after any successful write operation on a waterfall entity, inside the same request lifecycle (not a background job or cron). If the upsert fails, the waterfall mutation is still considered successful — auto-snapshot failure is silent (logged, not surfaced to the user).
- **Stale financial summary**: the frontend should re-fetch the financial summary when the user returns to the default panel state after a waterfall mutation (i.e. after a successful add/edit/delete in the left panel), so sparklines reflect the latest auto-snapshot.
- **Security — auto-snapshot integrity**: auto-snapshots are system-generated audit artifacts. DELETE and PATCH routes for snapshots must gate on `isAuto: false` before allowing the operation. This prevents users from removing historical trend data.
- **No tier navigation on click**: cards are display-only in v1. No click handler, no hover state implying navigability.
- **Card gap**: 12px vertical gap between cards (`gap-3` on the stack container).
