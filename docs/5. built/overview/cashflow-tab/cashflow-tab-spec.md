---
feature: cashflow-tab
design_doc: docs/4. planning/cashflow-tab/cashflow-tab-design.md
creation_date: 2026-04-11
status: implemented
implemented_date: 2026-07-05
---

# Cashflow Tab

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

finplan users currently have no surface that answers _"where are the pinchpoints in my next 12 months?"_ — months where yearly bills bunch up, or weeks where bills hit before payday. The Overview shows a single monthly snapshot and the Forecast shows decadal net-worth projections, but nothing in between. Cashflow gives users a forward-looking, balance-anchored view of their plan playing out across time so they can spot and plan around shortfalls.

## Description

Cashflow is introduced as a section of a restructured **Forecast** page. The Forecast page is brought into two-panel-shell compliance (fixing an existing Anchor 17 deviation): the left panel becomes a section navigator with two entries (`Cashflow`, `Growth`) and the right panel renders the selected section.

The **Cashflow** section presents two views:

1. **Year view** — twelve monthly bars showing planned net change per month, anchored to a starting balance read from the household's linked liquid accounts. Bars turn amber when the projected running balance dips below £0 at any point during that month. Headline cards summarise starting balance, projected end-of-window balance, tightest dip, and average monthly surplus.
2. **Month drill-down** — clicking a bar replaces the year view (slide-left) with a day-level intra-month view: a step-line chart of running balance, dated events marked on the trace, and a chronological event list. Discretionary monthly/yearly spend is amortised evenly across the days and explained via an info chip; one-off discretionary items appear as dated events.

The **Growth** section preserves the existing Forecast page's content (Net Worth, Surplus Accumulation, Retirement) unchanged, simply moved into the right panel of the new shell.

## User Stories

- As a user, I want to see a 12-month forward projection of my plan so that I can spot future months where my balance gets tight.
- As a user, I want amber warnings on months where my running balance dips below £0 so that I know which periods need attention.
- As a user, I want to drill into a specific month to see exactly which days my balance dips and which events caused it.
- As a user, I want to anchor the projection to my real liquid account balances so that the trace reflects what I actually have available.
- As a user, I want to pick which Current/Savings accounts feed the projection so that I can include or exclude pots as I see fit.
- As a user, I want a clear notice when my linked balances are old so that I can refresh them and trust the projection.
- As a user, I want the Cashflow view to work even when I haven't linked accounts or set up income/spend yet, with a calm callout telling me what's missing.
- As a user, I want adjacent-month navigation inside the drill-down so that comparing March to April doesn't require a breadcrumb round-trip.
- As a user, I want the Forecast page's Growth content (Net Worth, Surplus, Retirement) to stay accessible alongside Cashflow so that I haven't lost anything.

## Acceptance Criteria

> Specific, testable criteria that define done. Each criterion must be verifiable without reading the implementation.

### Forecast page restructure

- [ ] Forecast page uses the two-panel shell (`TwoPanelLayout`), matching Overview.
- [ ] Left panel is a section navigator with two entries: `Cashflow` and `Growth`. Title-only, no sub-labels.
- [ ] `Cashflow` is the default selected entry on first visit.
- [ ] Selecting `Growth` renders the existing Net Worth, Surplus Accumulation, and Retirement components stacked in the right panel, unchanged.
- [ ] Tab name in the main navigation stays `Forecast` (singular).

### Year view

- [ ] Year view renders twelve monthly bars in chronological order.
- [ ] Bar height represents the absolute net change for that month (income − committed − discretionary − one-off events occurring inside the month).
- [ ] A bar is rendered amber when the projected running balance dips below £0 at any point during that month, regardless of whether the month's net change is positive or negative.
- [ ] A bar is rendered in the default tier colour when the running balance stays at or above £0 for the whole month.
- [ ] The current month is marked with a vertical dashed `today` line at the day-of-month proportion of its bar, with a small `today` label at the top.
- [ ] The chart range can be shifted forward by 1 month via a navigation control. The earliest position is the current month — the user cannot shift backward past today.
- [ ] A `Today` button resets the window to the current month.
- [ ] The visible date range is displayed in text form (e.g. `Oct 2026 — Sep 2027`).
- [ ] Four headline cards appear above the chart: `Starting balance`, `Projected end-of-window balance`, `Tightest dip`, `Average monthly surplus`.
- [ ] `Tightest dip` shows the minimum projected running balance across the visible window and the date it occurs.
- [ ] When carry-forward results in any negative balance inside the window, the `Tightest dip` value is rendered in amber.

### Starting balance & linked accounts

- [ ] A button in the Cashflow header reads `STARTING BALANCE · £X · N linked accounts ▾`.
- [ ] Clicking the button opens a popover with a multi-select checklist of every household account whose type is `Current` or `Savings`.
- [ ] The popover includes a `Select all` master toggle.
- [ ] Toggling an account immediately updates the `isCashflowLinked` flag for that account; the projection re-runs.
- [ ] The button's `£X` value is the sum of the latest `AccountBalance` for each currently-linked account.
- [ ] The button's `N linked accounts` sublabel reflects the live count.
- [ ] On hover, the button's border lifts to the page accent colour.
- [ ] No Settings page entry is added for linked accounts. No first-run modal is shown.
- [ ] Accounts of type `Pension`, `StocksAndShares`, or `Other` cannot be linked and do not appear in the popover.

### Account type expansion

- [ ] `Current` is added as a new value to the `AccountType` enum.
- [ ] Existing accounts are not migrated automatically; users may set new or existing accounts to `Current` via the standard Account flow.

### Stale data banner

- [ ] When the oldest linked balance is more than 30 days old, a thin amber banner appears under the Cashflow title row.
- [ ] Banner text format: `Linked balances X–Y months old · projection may drift · Refresh accounts`. (`X` = freshest, `Y` = oldest, expressed in whole months; rounded down.)
- [ ] The `Refresh accounts` link opens the linked-accounts popover.
- [ ] When all linked balances are 30 days old or fresher, no banner is shown.
- [ ] The banner is informational and never blocks the projection from rendering (Anchor 12).

### Month drill-down

- [ ] Clicking a year-view bar opens that month's drill-down via a slide-left transition that replaces the year view inside the right panel.
- [ ] A breadcrumb at the top reads `← Cashflow / <Month Year>` and returns to the year view via a slide-right transition.
- [ ] An inline horizontal month strip (`J F M A M J J A S O N D`) appears below the breadcrumb, with the current drill-down month highlighted and any month inside the visible window where the projected balance dips below £0 highlighted in amber.
- [ ] Clicking a month in the strip switches the drill-down to that month with a directional slide.
- [ ] Stat callouts above the chart show the month's `Starting balance`, `Projected end balance`, `Tightest point`, and `Net change`.
- [ ] An info chip above the chart explicitly states that monthly and yearly discretionary spend has been amortised evenly across the days, e.g. `Discretionary £X/mo amortised evenly across the month`.
- [ ] A step-line chart renders the running balance day by day. Step changes occur on event dates (income, committed bills, one-off discretionary). Between events, the line slopes by the daily amortised discretionary amount.
- [ ] An event list below the chart shows every dated event in chronological order: date, label, amount (signed), and running balance after the event.
- [ ] Monthly and yearly discretionary items are not listed in the event table (they are represented by the slope).
- [ ] One-off discretionary items with a `dueDate` inside the month _are_ listed in the event table.
- [ ] Planner purchases are not represented in the event table or the running-balance trace in v1.

### Empty / degraded states

- [ ] When the household has no linked accounts, the Cashflow header shows the starting-balance button in an empty state (`Link accounts to anchor your cashflow ▸`) and a contextual callout explains that the projection runs from £0 until accounts are linked.
- [ ] When the household has no linked accounts, the projection still runs from a £0 starting balance. Bars colour amber as normal — pinchpoint detection is unchanged. (Intentional: the user sees the real shape of their plan against a £0 baseline; the callout makes the cause obvious.)
- [ ] When the household has no income, a contextual callout near the chart explains that the projection has no inflows yet.
- [ ] When the household has no committed or discretionary spend, a contextual callout near the chart explains that the projection has no outflows yet.
- [ ] Multiple callouts compose: a brand-new household sees all three at once.
- [ ] None of the empty-state callouts block the chart from rendering — they are calm informational notes (Anchor 11 / 12).

### Loading & error states

- [ ] While the projection is loading, the year view shows skeleton placeholders for the headline cards and the chart area. The Cashflow header (title + linked-accounts button) renders immediately without a skeleton.
- [ ] While the month detail is loading, the drill-down view shows skeleton placeholders for the stat callouts, chart, and event list. The breadcrumb and month strip render immediately.
- [ ] If the projection request fails, the year view shows an inline error message with a `Retry` action. The error never replaces the entire Forecast page — only the right-panel content area.
- [ ] If a linked-account update fails, the popover row reverts to its previous state and a small inline error appears within the popover. The projection continues to render its last successful result.

### Overview waterfall side-effect

- [ ] The `incl. yearly ÷12` row in the Overview waterfall's Committed section is converted from a clickable button to a non-interactive informational row.
- [ ] The row remains visible whenever `committed.monthlyAvg12 > 0` (existing visibility rule preserved).
- [ ] The legacy `CashflowCalendar` component and its right-panel view state are removed.

### Accessibility & motion

- [ ] All slide transitions respect `prefers-reduced-motion` (no transform when set).
- [ ] All interactive controls (year navigation, month strip days, bars, drilldown breadcrumb, linked-accounts button) are keyboard-accessible and have visible focus states.
- [ ] Bars and step-line events have screen-reader-accessible labels describing date, value, and running balance.

## Open Questions

- [ ] Should the year view's `Today` button also reset any in-progress drill-down to the year view? (Reasonable default: yes; document it during plan.)
- [x] ~~When zero accounts are linked, should the projection still render with a £0 starting balance, or render an empty placeholder until at least one account is linked?~~ **Render with £0 + callout, amber bars as normal.** The user sees the real shape of their plan against a £0 baseline; the callout makes the cause obvious.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

> The logical data model — what entities are needed, their key fields and relationships, and any important constraints. Do NOT write Prisma syntax; `/write-plan` produces that.

- **AccountType (enum)** — add a new value `Current` alongside the existing `Savings`, `Pension`, `StocksAndShares`, `Other`. `Current` and `Savings` are the only types eligible to be linked to Cashflow.
- **Account** — add `isCashflowLinked: Boolean` (default `false`). Household-scoped via the existing `householdId`. Only `Current` and `Savings` accounts may be set to `true`; the API rejects attempts to link any other type.
- **IncomeSource** — add `dueDate: DateTime` (required). Replaces the existing `expectedMonth: Int?` field. Migration backfills with `(currentYear, expectedMonth ?? 1, 1)`. Interpretation depends on `frequency`:
  - `monthly` → only the day-of-month part is used; the projection iterates this day across every active month.
  - `annual` → the month and day parts are used; the projection iterates this month-day across every active year.
  - `one_off` → the full date is the single occurrence; the item is included exactly once if any `ItemAmountPeriod` is active for that date.
- **CommittedItem** — add `dueDate: DateTime` (required). Replaces the existing `dueMonth: Int?` field with the same migration and same interpretation rules as `IncomeSource.dueDate`, keyed off `spendType` (`monthly | yearly | one_off`).
- **DiscretionaryItem** — add `dueDate: DateTime?` (nullable). Only meaningful for `one_off` items. For `monthly` and `yearly` discretionary, `dueDate` is unused (the amount is amortised, not dated) and may remain `null`.
- **ItemAmountPeriod** — no schema change. The existing model is the canonical source of truth for an item's active window; the projection only includes an item on a given date if an `ItemAmountPeriod` covers that date.

### API

> What operations the backend needs to expose, who can call them, and any auth or multi-tenancy rules. Do NOT write HTTP routes; `/write-plan` produces those.

- **Get cashflow projection** — given a window start month and a count of months (default 12), returns: starting balance, sum of `latest AccountBalance` per linked account; per-month `netChange`, `closingBalance`, `dipBelowZero` flag and `tightestPoint`; window-level `tightestDip` (value + date), `avgMonthlySurplus`, `projectedEndBalance`; staleness metadata (`oldestLinkedBalanceDate`, `youngestLinkedBalanceDate`). JWT-protected, household-scoped via `req.householdId!`.
- **Get cashflow month detail** — given a target year + month, returns the day-by-day running balance trace and the chronological event list for that month. Uses the same projection chain (carry-forward from current month to the target month). JWT-protected, household-scoped.
- **List linkable accounts** — returns all household accounts whose type is `Current` or `Savings`, each with their current `isCashflowLinked` value and latest balance. JWT-protected, household-scoped.
- **Update account cashflow link** — sets `isCashflowLinked` on a single account. Rejects with `ValidationError` if the account is not `Current` or `Savings`. Rejects with `NotFoundError` if the account is not in the caller's household. JWT-protected, audited via `audited()` with `actorCtx(req)`.
- **Bulk update account cashflow links** — sets `isCashflowLinked` on multiple accounts in one transaction (used by the `Select all` toggle). Same auth + audit + validation rules as single-update. JWT-protected, audited.
- **Multi-tenancy rule** — every projection and account-link query reads `householdId` from the auth middleware (`req.householdId!`) and never from URL params or request bodies. Cross-household queries are impossible by construction.
- **AccountBalance join rule** — the projection must read `latest AccountBalance` via a join through `Account` filtered by `householdId`. It must never query `AccountBalance` standalone, since `AccountBalance` carries no household reference of its own.
- **Input validation bounds** — the projection endpoint validates `monthCount` as an integer in `[1, 24]`. The month-detail endpoint validates `targetYear` as `[2000, 2100]` and `targetMonth` as `[1, 12]`. All input validation lives in shared Zod schemas under `packages/shared/src/schemas/`.
- **Rate limiting** — the projection endpoint is computationally non-trivial (replay + forward projection over 12 months with day-by-day intra-month computation). It must sit under the existing per-route rate limiter; no special new rule is required, but plan should not exempt it.
- **Audit** — single and bulk account-link mutations are wrapped in `audited()` with `actorCtx(req)`. `BEFORE_FETCH` snapshots the previous `isCashflowLinked` value for each affected account.
- **Caching note** — the cashflow projection is computed on each request from the live plan + linked balances. No persistent cache in v1; the projection is fast enough at household scale.

### Components

> What UI units are needed and what each is responsible for. Do NOT write file paths or component code; `/write-plan` produces those.

- **ForecastPage (restructured)** — replaces the current single-panel layout with `TwoPanelLayout`. Wires up the section navigator on the left and the right-panel view state machine for `Cashflow` vs `Growth`.
- **ForecastSectionNavigator** — left-panel component listing the two section entries (`Cashflow`, `Growth`). Each entry is a row with its title only; selected state is visually distinct. Title-only, no sub-labels.
- **GrowthSectionPanel** — wrapper that stacks the existing `NetWorthChart`, `SurplusAccumulationChart`, and `RetirementChart` in the right panel. Reuses the existing components unchanged.
- **CashflowSectionPanel** — top-level right-panel container for Cashflow. Owns the year-view ↔ month-drilldown view state and renders one of the two child views with directional slide transitions (slide-left for deeper, slide-right for shallower) using the existing `framer-motion` pattern from `ReviewWizard`. Respects `prefers-reduced-motion`.
- **CashflowHeader** — title row plus the `LinkedAccountsButton`. Sits above the stale-data banner.
- **LinkedAccountsButton** — button-shaped trigger reading `STARTING BALANCE · £X · N linked accounts ▾`. Hover state lifts the border to the page accent colour. Opens `LinkedAccountsPopover`.
- **LinkedAccountsPopover** — multi-select checklist of all household accounts of type `Current` or `Savings`, with a `Select all` master toggle. Each row shows account name, type, latest balance, and balance date. Mutations call the bulk-update endpoint.
- **CashflowStaleBanner** — reuses the existing `StaleDataBanner` styling (`bg-attention/4 border-b border-attention/8 text-attention`) but with cashflow-specific copy and a `Refresh accounts` link that opens `LinkedAccountsPopover`. Sits under the title row, not at the top of the right panel.
- **CashflowYearView** — renders the headline cards, the year-navigation control with `Today` button and date range, the twelve monthly bars, and the today indicator. Each bar is keyboard-focusable and dispatches a drill-down on click/Enter.
- **CashflowMonthView** — renders the breadcrumb, month strip, stat callouts, discretionary-amortisation chip, step-line chart, and event list. Each month-strip cell is keyboard-focusable.
- **CashflowEmptyCallout** — small contextual callout used at multiple insertion points (no linked accounts, no income, no spend). Composes naturally — if the household is brand-new, three callouts render side-by-side or stacked.
- **CashflowYearBar** — single bar within the year view; encapsulates colour selection (default tier colour vs amber), today-indicator overlay, and accessible label.
- **CashflowEventList** — chronological list of dated events in the month drill-down. Displays date, label, amount, and running balance per row. Excludes amortised monthly/yearly discretionary; includes one-off discretionary that has a `dueDate` inside the month.

### Notes

#### Projection algorithm (interface level)

- **Anchor date** — the most recent (`youngest`) `AccountBalance.date` across the linked accounts. The replay starts from this date.
- **Replay phase** — from the anchor date forward to today, the projection applies every income event and every committed/discretionary event whose `dueDate` (interpreted by `frequency`/`spendType`) falls inside an active `ItemAmountPeriod`. The result is today's projected balance.
- **Forward projection phase** — from today forward across the visible window (default 12 months), the same chain runs, with each month's closing balance carried forward as the next month's opening balance. The intra-month balance is computed day-by-day so the dip detection (and bar colouring) is correct even when the net change is positive.
- **Discretionary amortisation** — monthly discretionary amounts are spread evenly across the days of each month (`amount / daysInMonth`). Yearly discretionary amounts are first ÷12'd and then amortised the same way (matching Anchor 15's pot model). One-off discretionary items are treated as dated events on their `dueDate`, not amortised.
- **One-off items** — included exactly once, on `dueDate`, only if some `ItemAmountPeriod` covers that date. Once `dueDate` has passed, they no longer affect the projection.
- **Carry-forward** — always on. There is no `£0` baseline mode and no opt-out.

#### Pinchpoint definition

- A monthly bar is amber if the projected running balance is below £0 at any point inside that month (using the day-by-day intra-month trace). Net change sign is irrelevant — a £4k buffer can absorb a negative net change without going amber.
- A month-strip cell is amber under the same rule.
- Pinchpoint thresholds are not user-configurable in v1 (hardcoded at £0).

#### Staleness rule

- Compute `oldestLinkedBalanceDate` and `youngestLinkedBalanceDate` from the linked accounts' latest `AccountBalance` records.
- If `oldestLinkedBalanceDate` is more than 30 days before today, render `CashflowStaleBanner`. Otherwise omit it.
- The threshold is hardcoded in v1; tunable later via `HouseholdSettings` if requested.

#### Out of scope (v1)

- Real bank sync, per-account spend attribution, past-month review (use Snapshot), configurable pinchpoint cushions, notifications/alerts, mobile viewports, modifying Growth content, snapshot-aware cashflow, Settings page entry for linked accounts, carry-forward toggle, planner purchases.

#### Anchors honoured

- **Anchor 17** — Forecast is brought into two-panel-shell compliance.
- **Anchor 1** — reading `AccountBalance` values is not transaction tracking; the projection is still "the plan playing out".
- **Anchor 8** — no bank sync; balances are still entered manually via the existing Account flow.
- **Anchor 11 / 12** — overdraft warning uses amber, never red. Stale-data signal uses amber and never blocks rendering.
- **Anchor 15** — the ÷12 virtual pot model is preserved as the underpinning of `committed.monthlyAvg12` in the Overview waterfall; only its dedicated UI surface (`CashflowCalendar`) is retired.
- **Anchor 16** — Cashflow is "live plan" only; viewing a historical snapshot does not change what Cashflow renders in v1.

#### Documented exception

- **Month strip inside the right panel** — no existing precedent in `design-system.md` (the closest pattern, `SnapshotTimeline`, lives outside the panels). This feature ships a documented exception scoped to Cashflow only. If the same pattern proves useful elsewhere, promote it to a generalisable standard later.
