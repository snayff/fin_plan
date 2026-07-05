---
feature: quick-add-waterfall
design_doc: docs/4. planning/quick-add-waterfall/quick-add-waterfall-design.md
creation_date: 2026-04-18
status: implemented
implemented_date: 2026-07-05
---

# Quick-Add Waterfall

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

finplan users spend too long navigating between tier screens to build or review their waterfall. There is no single surface where a household's entire waterfall (income → committed → discretionary) can be seen and edited at once. This feature adds a dense, full-width workbench — the **Full Waterfall** — that serves both first-time setup and ongoing bulk edit, replacing the legacy Waterfall Creation Wizard.

## Description

A new full-screen focused surface at `/waterfall` renders all three waterfall tiers as stacked, inline-editable tables grouped by subcategory, with a read-only Surplus strip as the cascade terminus. Each row edits a single waterfall item (IncomeSource / CommittedItem / DiscretionaryItem) and auto-saves on blur. Users reach the surface from the Overview empty-state CTA or a "View all" button on any tier page, and exit back to wherever they came from. Incomplete rows remain as local amber-tagged drafts until required fields are valid. The legacy Waterfall Creation Wizard is removed.

## User Stories

- As a **new user**, I want to land on one surface where I can set up my entire waterfall (income, committed, discretionary) in succession so that I'm not stepping through multiple wizard screens or hopping between tier pages.
- As a **returning user**, I want a "View all" button on each tier page that opens a full-waterfall view scrolled to that tier so that I can scan my whole plan without losing context.
- As a **user doing an annual review**, I want to tab across rows and columns and have every field auto-save on blur so that bulk editing feels like a spreadsheet.
- As a **user adding related items across tiers**, I want to jump between tier tables on one surface so that I don't navigate away from my work.
- As a **user**, I want to create new subcategories inline without leaving the surface so that I don't have to detour to Settings during first-time setup.
- As a **user editing an amount**, I want the Surplus strip and tier totals to update live so that I see the cascade arithmetic in real time.
- As a **user with an incomplete row**, I want a gentle amber "incomplete" indicator rather than a blocking error so that I can finish the row when ready.
- As a **user**, I want to delete a row from this surface with a clear confirmation so that I can correct mistakes without drilling into each item.

## Acceptance Criteria

### Surface & layout

- [ ] A new route exists at `/waterfall` rendering a full-width focused surface (no two-panel shell), following the "Workbench surfaces" pattern defined in `design-system.md` § 3.6
- [ ] The surface header shows a page title "YOUR WATERFALL" and a close button that returns the user to their entry point
- [ ] Below the header, a dismissible one-line tip reads: _"Start with your income — what arrives in your accounts each month."_ The tip is hidden once the user has added at least one income row (persisted dismiss in the household's settings, not per-session)
- [ ] Three tier tables render stacked in cascade order: Income → Committed → Discretionary
- [ ] `WaterfallConnector` elements render between tiers showing "minus committed" and "minus discretionary"
- [ ] A read-only `SurplusStrip` renders below the Discretionary table showing "= SURPLUS £X · Y%" in the `tier-surplus` colour token
- [ ] The surface assumes minimum viewport width 1024px (Anchor 6)

### Entry and exit

- [ ] The Overview empty-state CTA ("Build your waterfall") routes the user to `/waterfall`. Any previously-wired "Set up your waterfall from scratch" CTA that pointed to the Creation Wizard is updated to point here
- [ ] Each waterfall tier page (Income, Committed, Discretionary) has a "View all" button in its right-panel header. Clicking it navigates to `/waterfall#<tier>` where `<tier>` is `income`, `committed`, or `discretionary`
- [ ] On load, if the URL hash matches a known tier, the surface scrolls the tier table into view with a subtle highlight flash
- [ ] The close button navigates back to the user's entry point (uses router history; falls back to `/overview` if history is empty)
- [ ] Settings → Waterfall → "Rebuild from scratch" (after its existing `DELETE /api/waterfall/all` confirm) routes to `/waterfall` instead of the old wizard

### Table structure and columns

- [ ] **Income table** columns, in order: Name · Type · Cadence · Owner · Amount · /month
- [ ] **Committed table** columns, in order: Name · Cadence · Due · Amount · /month
- [ ] **Discretionary table** columns, in order: Name · Cadence · Due · Amount · /month
- [ ] Rows within a tier are grouped under subcategory headers; subcategory is not a column
- [ ] Each subcategory group header shows the group's monthly-equivalent subtotal
- [ ] Each tier header shows the tier name, a coloured tier dot, and the tier's monthly-equivalent total (e.g. "£8,856/mo")
- [ ] The Surplus strip value updates live as any amount is changed
- [ ] `/month` column is read-only and computed: monthly amounts show as-is; yearly amounts show as amount ÷ 12; one-off amounts show amortised across the plan year
- [ ] **Due** column on Committed/Discretionary shows: month name for yearly cadence (e.g. "Mar"), formatted date for one-off (e.g. "14 Mar"), em-dash "—" for monthly
- [ ] **Owner** column on Income shows the member's display name when `ownerId` is set, and the label "Joint" when it is null
- [ ] **Type** column on Income shows the incomeType value as a coloured chip (salary / dividends / freelance / rental / benefits / other). Chip colours are scoped to this surface only and must not repurpose tier colours
- [ ] Numeric cells render in tabular monospace (`font-numeric`)

### Interaction — existing rows

- [ ] Every editable cell supports inline edit on click/focus
- [ ] Editable cells are: name (text), type (Income only, dropdown), cadence (dropdown of IncomeFrequency / SpendType), owner (Income only, member picker incl. "Joint"), due (conditional: month picker for yearly, date picker for one-off, disabled for monthly), amount (currency input)
- [ ] A cell saves its value to the backend on blur (auto-save), only when the full row is valid; invalid cells flash a subtle border and revert to the previous value on blur
- [ ] Tab moves to the next cell in the row; Shift-Tab moves to the previous; Enter moves down one row within the same column; Esc cancels the current cell edit and reverts to the last saved value
- [ ] Successful saves are silent (no confirmation pill) — silence is approval (Principle 4). Only failures surface UI feedback
- [ ] Saves within a single row are coalesced client-side: rapid blurs within a debounce window (≈ 300 ms) flush as one combined update per item to avoid API hammering during tab-heavy editing
- [ ] Changing an amount also updates `lastReviewedAt` on the item (same behaviour as the tier-page "Still correct ✓" flow)

### Interaction — new rows and subcategories

- [ ] Each subcategory group ends with an explicit "+ add" ghost row; clicking it opens a new empty editable row in that subcategory
- [ ] Tabbing off the last cell of the last row in a subcategory auto-creates a new empty row beneath it, focused on the first cell
- [ ] A new row persists to the backend only when minimum required fields are all valid: `name`, `amount`, `cadence`, `subcategory`; for Income also `type`; for yearly/one-off cadences also a valid `due` value
- [ ] While a new row is incomplete, it remains as a **local draft only** — not persisted to the database. A small amber "incomplete" indicator appears on the row
- [ ] Local draft rows are discarded if the page is reloaded or the user navigates away. A subtle dismissible warning is shown above the table if drafts exist and the user attempts to close the surface
- [ ] Between every pair of subcategory groups and after the final group, a ghost "+ Add subcategory" button renders. Clicking it inserts a new empty group header with an inline text input
- [ ] Submitting a new subcategory name creates a household-scoped Subcategory for the current tier. The subcategory inherits `isDefault = false`, `isLocked = false`, `lockedByPlanner = false`
- [ ] If the submitted subcategory name collides with an existing subcategory in the same tier+household, the inline input shows an inline error ("A subcategory with that name already exists") — non-blocking, the user can rename
- [ ] Users cannot rename or delete existing subcategories from this surface — those operations stay in Settings

### Interaction — delete

- [ ] Hovering a row reveals a trash icon at the far right
- [ ] Clicking the trash opens a `ConfirmDialog` asking "Delete <item name>?" with Delete / Cancel actions
- [ ] Confirming deletes the item and its amount history; the row disappears with a short fade
- [ ] Deleting an incomplete local draft requires no confirm — it vanishes on click

### First-time empty state

- [ ] When a household has zero items across all three tiers, the surface still renders all three tier tables visible
- [ ] The Income table has a pre-focused empty add-row (cursor in the Name cell) inside a default "Salaries" subcategory group
- [ ] Committed and Discretionary tables each show three ghosted skeleton rows (opacity 50 → 25 → 12%) plus their empty "+ add" rows, mirroring the `GhostedListEmpty` pattern from `design-system.md` § 3.5
- [ ] The tip banner at the top is visible ("Start with your income — what arrives in your accounts each month")

### Loading, saving, and error states

- [ ] Initial load shows a skeleton for each tier table (3 ghosted rows per tier)
- [ ] Any per-row save failure shows a non-blocking toast with a Retry action, and the cell reverts to its previous value until retried successfully
- [ ] A network disconnect during editing surfaces a persistent amber banner at the top of the surface: "Changes may not be saving — check your connection." The banner clears on the next successful save
- [ ] All state-changing operations respect the app's standard staleness / audit conventions

### Legacy wizard removal

- [ ] The `WaterfallSetupSession` model and its CRUD endpoints (`GET/POST/PATCH/DELETE /api/setup-session`) are removed from the backend
- [ ] The `WaterfallSetupWizard.tsx` component and any wizard-only sub-components are removed from the frontend
- [ ] The `/setup-wizard` route (or equivalent) is removed from the router
- [ ] Any existing CTAs or links that pointed to the wizard route are updated to point to `/waterfall`
- [ ] The `docs/5. built/overview/waterfall-creation-wizard/` folder remains as historical record — it is not deleted

## Open Questions

- [x] ~~Does the first-time tip persist as dismissed across sessions, or show again on every visit?~~ **Persists** — dismissal stored on the household so the user doesn't see it on repeat visits after dismissing.
- [x] ~~Incomplete draft rows: persist across reload?~~ **Discard on reload** — drafts are component state only.
- [x] ~~Scroll-target conveyance from tier pages?~~ **URL hash** — `/waterfall#committed` etc.
- [x] ~~Owner column display when ownerId is null?~~ **"Joint"** label, not em-dash.
- [ ] Subcategory naming on the pre-focused first row — does the default "Salaries" subcategory need to be auto-seeded for a brand-new household, or is it created on first save? Decide during `/write-plan` based on how existing subcategory defaults are seeded.
- [ ] Does the "/month" computation for a one-off item use the current plan year (April–April UK tax year) as the divisor window, or rolling 12 months? Decide during `/write-plan` by aligning with the existing Overview-Waterfall "/12 virtual pot" convention.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

> All persistent entities required already exist in the live schema. No new tables are introduced. One removal is required.

- **Subcategory** (existing) — `householdId` + `tier` + `name` unique; `isLocked`, `isDefault`, `lockedByPlanner` flags respected. The Full Waterfall creates new subcategories with `isDefault=false, isLocked=false, lockedByPlanner=false`. Existing subcategories are read for grouping; rename/delete stays in Settings.
- **IncomeSource** (existing) — grouped by `subcategoryId`. Quick-add manipulates `name`, `frequency`, `incomeType`, `ownerId`, `dueDate`, `subcategoryId`, and `lastReviewedAt`.
- **CommittedItem** (existing) — grouped by `subcategoryId`. Quick-add manipulates `name`, `spendType`, `ownerId`, `dueDate`, `subcategoryId`, and `lastReviewedAt`.
- **DiscretionaryItem** (existing) — grouped by `subcategoryId`. Quick-add manipulates `name`, `spendType`, `dueDate`, `subcategoryId`, and `lastReviewedAt`. `isPlannerOwned` is never set by this surface.
- **ItemAmountPeriod** (existing) — amount edits from quick-add open a new period starting today and close the prior open period. This is how "amount" is stored for every waterfall item; the item table itself has no amount field.
- **WaterfallHistory** (existing) — every amount change writes a history entry automatically for the affected item.
- **HouseholdSettings** (existing) — one new boolean field (`waterfallTipDismissed`, default `false`) tracks whether the first-time tip has been dismissed.
- **WaterfallSetupSession** (existing) — **removed**. Its sole field was `currentStep`; no data migration required.

All entities remain strictly household-scoped. No cross-household reads or writes.

### API

- **Read the full waterfall** — a single aggregate query that returns, for a household: all subcategories (per tier); all items (per tier) with their current amount period and most recent `lastReviewedAt`; computed tier totals; computed surplus. JWT-protected, household-scoped. May reuse or extend the existing waterfall summary endpoint used by Overview.
- **Create / update / delete an IncomeSource, CommittedItem, DiscretionaryItem** — CRUD per tier, as exist today. JWT-protected, household-scoped, audited.
- **Update an item's amount** — an operation that creates a new `ItemAmountPeriod` (closing the previous one) and appends to `WaterfallHistory` atomically. Must also touch the item's `lastReviewedAt`. JWT-protected, household-scoped, audited.
- **Create a Subcategory** (household + tier scoped) — accepts `tier` and `name`; rejects duplicates on the `(householdId, tier, name)` unique constraint with a structured validation error. JWT-protected, household-scoped, audited.
- **Dismiss the waterfall tip** — set `HouseholdSettings.waterfallTipDismissed = true`. JWT-protected, household-scoped, audited.
- **Remove** `GET/POST/PATCH/DELETE /api/setup-session` endpoints and any associated route handlers.
- `DELETE /api/waterfall/all` (existing) is unchanged; Settings' "Rebuild from scratch" redirect target becomes `/waterfall`.

All inputs are validated via Zod schemas in `packages/shared`. Auth errors use the generic masking convention (never reveal whether an item exists to an unauthorised caller); audit every mutation via `audited()` wrapping with `actorCtx(req)`.

### Components

- **FullWaterfallPage** — route component at `/waterfall`. Owns the full-screen shell, loads the aggregate waterfall payload, and coordinates the three tier tables, the connectors, the Surplus strip, the top-bar chrome, and the tip banner. Handles the close → back-to-entry-point behaviour and the hash-based scroll target.
- **WaterfallTierTable** — one instance per tier (Income, Committed, Discretionary). Renders the tier header (name, colour dot, monthly total), a list of `SubcategoryGroup` units, and an inline `AddSubcategoryButton` between and after groups. Owns per-tier add-row logic (tab-off-end auto-create) and incomplete-draft local state.
- **SubcategoryGroup** — renders a subcategory header (name + subtotal), a list of `TierRow` units belonging to the subcategory, and a trailing "+ add" ghost row.
- **TierRow** — a single editable row. Knows its tier (to pick the right column set) and owns per-cell edit state, validation, auto-save-on-blur, and incomplete-draft indication. Owns the hover-revealed trash control and its `ConfirmDialog` trigger.
- **AddSubcategoryButton** — ghost affordance between subcategory groups. Clicking toggles it into an inline input; on submit creates a new subcategory and renders a new empty `SubcategoryGroup`.
- **WaterfallConnector** — reused from Overview; appears between tier tables.
- **SurplusStrip** — read-only footer below Discretionary; consumes live tier totals and surplus derivation.
- **TipBanner** — the dismissible first-time tip; calls the dismiss endpoint on close.
- **NetworkStatusBanner** — amber banner shown if any save has failed and has not yet succeeded on retry.
- **Existing components reused**: `ConfirmDialog`, `GhostedListEmpty` (skeleton rows), `Select`, `ButtonPair`.
- **New tier-page addition**: each waterfall tier page's right-panel header gains a "View all" button (matching `GhostAddButton` visual weight) that navigates to `/waterfall#<tier>`.

### Notes

- **Amount storage.** Every tier item's current monthly amount is derived from its open `ItemAmountPeriod` row. Quick-add saves an amount by closing the prior period (setting `endDate = today - 1`) and inserting a new period with `startDate = today`. A `WaterfallHistory` entry is written in the same transaction.
- **Surplus derivation.** Surplus = income monthly-equivalent total − committed monthly-equivalent total − discretionary monthly-equivalent total. Surplus is never negative-coloured; it follows the calm-by-default rule (Anchor 11) and is always shown in the `tier-surplus` token.
- **Monthly-equivalent computation.** Monthly cadence: amount. Yearly cadence: amount ÷ 12. One-off cadence: amount amortised across a 12-month window (aligned with the UK April-to-April plan year used elsewhere — confirm during `/write-plan`).
- **Language.** All user-visible copy uses "budgeted", "planned", "allocated", "/month", "amount" — never "spent", "paid", "charged" (Anchor 3, Principle 2). The one-line tip, column headers, empty-state prompts, and error toasts all conform.
- **Colour discipline.** Tier colour tokens (`tier-income`, `tier-committed`, `tier-discretionary`, `tier-surplus`) are used exclusively on their own tier's headers, connectors, and the surplus strip. Income-type chips use neutral muted chip colours (`text-text-tertiary` on `surface-muted` backgrounds), not tier colours.
- **Staleness.** Existing staleness amber indicators (per tier-page `ItemArea`) render inline on rows whose `lastReviewedAt` is older than the configured threshold. They remain informational, never blocking (Anchor 12).
- **Auto-save feedback.** Successful saves are silent (Principle 4 — silence is approval). Failed saves surface a toast and the persistent amber `NetworkStatusBanner` until the next successful save. Client-side save coalescing batches rapid intra-row edits into one request per item per ≈ 300 ms window.
- **Concurrent edits.** Multiple household members may edit the Full Waterfall simultaneously. Writes use last-write-wins semantics at the item level — no optimistic-lock version field is introduced. The page refetches the waterfall payload when the browser tab regains focus so a returning editor sees the latest state.
- **Reactive to Settings changes.** If a subcategory is deleted or renamed in Settings while a user is on `/waterfall`, the tab-focus refetch (above) picks up the change on next focus. Inline rows whose subcategory has been deleted fall back to an "Uncategorised" group pending explicit reassignment by the user.
- **First-time seed.** When a brand-new household reaches the Full Waterfall, the existing default subcategories (seeded per household on creation) remain available. If a tier has no subcategories at all, a fallback empty group named "Uncategorised" is rendered so the user can start entering rows immediately. Final decision on whether to pre-create a "Salaries" group for Income is deferred to `/write-plan`.
- **Scroll target.** Hash-based: `/waterfall#income`, `/waterfall#committed`, `/waterfall#discretionary`. On mount, if hash matches, scroll the target `WaterfallTierTable` into view and add a one-shot 300 ms highlight ring (using existing motion tokens). If hash is absent or invalid, no scroll.
- **Accessibility.** The surface honours `prefers-reduced-motion` for all scroll and highlight animations. All editable cells expose appropriate ARIA labels derived from "{row name} {column} for {tier}".
- **Out of scope for this spec.** Asset/Account/Goals quick-add, mobile layout, CSV import, cross-subcategory drag reordering, keyboard shortcuts beyond Tab/Shift-Tab/Enter/Esc, multi-step undo, snapshot creation on setup completion.
