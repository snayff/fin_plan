---
feature: gifts
design_doc: docs/4. planning/gifts/gifts-design.md
creation_date: 2026-04-11
status: implemented
implemented_date: 2026-07-05
---

# Gifts

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Households want to plan and reconcile gifts throughout the year — who they buy for, which events they buy for, intended budgets, and actual amounts — and have that planning feed into the waterfall so the gift budget is visible alongside other discretionary spend. Today this happens in spreadsheets disconnected from finplan; the existing `/gifts` page is a "Coming soon" stub. The Gifts planner closes the gap with a dedicated, calm planning surface that respects the waterfall model.

## Description

A dedicated `/gifts` page organised around a People × Events matrix. The left panel holds a persistent annual budget summary plus three vertical-tab modes: **Gifts** (per-person drill-down), **Upcoming** (month-grouped timeline), and **Config** (People, Events, Mode, and Quick Add). The planner runs in one of two household-wide modes: **Synced** (the planner owns a single `DiscretionaryItem` in the locked-down "Gifts" subcategory and writes the annual budget into a per-year `ItemAmountPeriod`) or **Independent** (the planner is standalone with no waterfall linkage; users manage the Gifts subcategory manually). A three-layer value model — Annual Budget / Planned / Spent — drives all aggregates and amber over-budget signals.

## User Stories

- As a household planner, I want to plan gifts per person and per event so that nothing important gets forgotten and the cost is anticipated.
- As a household planner, I want to set an annual gift budget and see whether my plans and actual spend stay within it so that I can keep my discretionary plan honest.
- As a household planner using Synced mode, I want my annual gift budget to flow into the waterfall automatically so that the Gifts subcategory in Discretionary reflects the planner without manual upkeep.
- As a household planner using Independent mode, I want the planner to run standalone so that I can manage gifts separately from the waterfall.
- As a household planner, I want to record actual amounts as I buy gifts so that I can see my running total against the budget.
- As a household planner, I want to mark a gift as "Skipped" without deleting the row so that next year's plan still remembers I considered them.
- As a household planner, I want a Quick Add matrix so that I can set up a year's plan in bulk without clicking through each person.
- As a household planner, I want an Upcoming view grouped by month so that I can see what's coming and prepare in time.
- As a household planner, I want shared-date events (Christmas, Mother's Day) to collapse into one Upcoming row with recipients listed inline so that the timeline doesn't repeat the same date 26 times.
- As a household planner, I want household members to appear automatically as gift recipients so that I don't have to re-enter them.
- As a household planner, I want last year's plan to roll forward automatically on 1 January so that I can start the year with a sensible draft to refine.
- As a household planner, I want to view prior years' gift plans read-only so that I can compare year-over-year.
- As a household planner switching modes, I want a clear confirmation dialog explaining what will be created or destroyed so that I don't lose history accidentally.

## Acceptance Criteria

> Specific, testable criteria that define done. Each criterion must be verifiable without reading the implementation.

### Page shell and modes

- [ ] `/gifts` renders a TwoPanelLayout: left aside contains page title, annual budget summary block, and three vertical tabs (Gifts · Upcoming · Config). Nothing else.
- [ ] The annual budget summary block shows: Annual Budget (large), Planned (sum of allocation `planned`), Spent (sum of allocation `spent`), and any active over-budget amber signals.
- [ ] The default mode is **Gifts**. Switching modes does not navigate; it swaps the right-panel content with the existing slide transition.
- [ ] A year selector appears in the page header. Default selection is the current year. Selecting a prior year switches every right-panel surface to read-only.

### Gifts mode (per-person drill-down)

- [ ] State 2 = People list. Each row shows: name, household badge (if linked), planned-count (using `text-tertiary`), bought-count (using `text-secondary`), planned total, spent total, and a subtle amber dot when row-level spent > planned.
- [ ] State 3 = Person detail. Breadcrumb `← People / {Name}`. Shows event cards (one per event the person has an allocation for) with planned, spent, status, notes, and (for personal-date events) a date field.
- [ ] Inline edit (per design-system §4.11) on every editable field. Edits persist on blur/change.
- [ ] Entering any non-empty value into `spent` (including `0`) marks the allocation `bought`. Clearing `spent` reverts the allocation to `planned`.
- [ ] A hover-revealed row action lets the user mark/unmark a gift as `skipped`.
- [ ] A "needs date" label in `text-tertiary` appears beside an event name when a personal-date allocation has no date set. No amber.
- [ ] An "Add gift" affordance from a person detail lets the user attach an existing event to the person (creating an allocation for the current year).

### Upcoming mode

- [ ] Right panel renders a chronological timeline grouped by month for the selected year.
- [ ] Top of the timeline shows four non-clickable callout cards: This month, Next 3 months, Rest of year, Dateless. Each shows count and amount totals only — no interaction.
- [ ] Shared-date events collapse into one row per event with recipients listed inline (e.g. "Christmas: Josh, Mum, Dad +19 more").
- [ ] Personal-date events render one row per (person, event) pair, sorted within their month.
- [ ] A "Dateless" section at the end of the timeline lists allocations missing a date.

### Config mode

- [ ] Config State 2 shows three drill rows: **People**, **Events**, **Mode**.
- [ ] Config → People State 3 lists every `GiftPerson`, with a filter (`All / Household / Non-household`), an inline-add row, and inline edit for name and notes.
- [ ] Config → Events State 3 lists every `GiftEvent`, separating locked seeded events from custom events. Locked events display a lock icon and cannot be renamed or deleted. The list supports inline add for custom events.
- [ ] The new-event form requires the user to choose date type via radio: "Same date every year (e.g. Christmas)" or "Different per person (e.g. Birthday)".
- [ ] Config → Mode State 3 shows the current mode and a single radio toggle (Synced / Independent). Changing modes opens a confirmation dialog before any change is persisted.
- [ ] **Synced → Independent** confirmation dialog lists what will be destroyed (the "Gifts" `DiscretionaryItem`, all of its `ItemAmountPeriod` history, and the lock on the Gifts subcategory). On confirm, those records are deleted and the mode flips. Planner data (people, events, allocations, per-year budgets) is preserved.
- [ ] **Independent → Synced** confirmation dialog explains that a fresh "Gifts" `DiscretionaryItem` will be created in the Gifts subcategory and the current year's planner budget will be written into a new `ItemAmountPeriod` for that item. The Gifts subcategory becomes locked to that single item.
- [ ] **Quick Add** is reachable as a drill from Config: breadcrumb `← Config / Quick add`. Renders a matrix editor with editable cells (one per person × event), row totals, column totals, a live summary strip, and Save/Cancel. Save persists all changes in one batch; Cancel with unsaved changes triggers a confirmation.

### Synced mode behaviour

- [ ] In Synced mode, the Gifts subcategory in Discretionary is locked to a single planner-owned `DiscretionaryItem`. Adding, renaming, or deleting items in that subcategory through normal Discretionary UI is rejected by the API.
- [ ] Setting the Annual Budget for the current year in the planner upserts an `ItemAmountPeriod` for that item with `startDate = first day of year` and `amount = budget`. Prior-year `ItemAmountPeriod` rows are not modified.
- [ ] The Gifts `DiscretionaryItem` is excluded from the staleness check so its `lastReviewedAt` never surfaces a stale warning.

### Independent mode behaviour

- [ ] In Independent mode the planner stores the Annual Budget per year (`GiftPlanYear.annualBudget`) but does not create or update any `DiscretionaryItem` or `ItemAmountPeriod`.
- [ ] Over-budget amber signals (Planned > Budget, Spent > Budget) still compute and display in Independent mode.
- [ ] Users can manually add `DiscretionaryItem` rows under the Gifts subcategory through the normal Discretionary UI; the planner ignores them and they ignore the planner.

### Pre-seeded events and people

- [ ] Locked events are seeded for every household: Birthday (personal-date), Wedding Anniversary (personal-date), Valentine's Day (14 Feb, shared-date), Mother's Day (15 Mar, shared-date), Easter (10 Apr, shared-date), Father's Day (15 Jun, shared-date), Christmas (25 Dec, shared-date). All have `isLocked = true`.
- [ ] Existing households without seeded events have them backfilled by the migration that introduces the new schema.
- [ ] Every active `HouseholdMember` is auto-surfaced as a `GiftPerson` row with `householdMemberId` set. When a `HouseholdMember` is removed, the link is nullified but the `GiftPerson` row and its allocations persist.
- [ ] Adding a new `HouseholdMember` creates a corresponding `GiftPerson` row eagerly.

### Year rollover

- [ ] On 1 January (server time), every household with a planner has a new year created automatically: allocations from the previous year are duplicated with `planned`, `notes`, and `date` carried forward; `spent` is cleared and `status` reset to `planned`. The previous year's `annualBudget` is also copied as the new year's starting budget.
- [ ] On the user's next visit to `/gifts` after a rollover, an in-page notification appears: "Gift plan for {year} has been created — you may want to review and update the planned amounts." The notification is dismissible and per-user.
- [ ] In Synced mode, the rollover also creates a new `ItemAmountPeriod` for the planner-owned `DiscretionaryItem` for the new year.

### Read-only prior years

- [ ] When a prior year is selected in the year selector, every editable surface in Gifts, Upcoming, and Config (except Mode) becomes read-only. Inline edits are disabled, Quick Add is disabled, add/delete affordances are hidden.
- [ ] All mutating planner endpoints reject requests where `year < currentYear` with a typed error.

### Validation

- [ ] Negative `planned` or `spent` values are rejected inline at the field on blur/change with an error message.
- [ ] Duplicate person names within a household are rejected at the form level with an inline error.
- [ ] Duplicate event names within a household are rejected at the form level with an inline error.
- [ ] Required fields (person name, event name) are non-blank.
- [ ] Cancel on Quick Add with unsaved changes prompts a confirmation before discarding.
- [ ] Quick Add bulk upsert payloads are capped at 500 allocation cells per call; oversized payloads are rejected at the schema layer with a typed error.
- [ ] Save-time validation re-runs every rule as a safety net and returns a typed error if the payload is invalid.

### Attention signals

- [ ] When `Planned > Annual Budget`, the budget summary block shows an amber dot plus the text "planned more than budget by £X" (where X is the difference, in tabular monospace).
- [ ] When `Spent > Annual Budget`, the budget summary block shows a separate amber dot plus the text "spent more than budget by £X".
- [ ] When per-allocation `spent > planned`, the corresponding row in Gifts State 2 and State 3 shows a subtle amber dot. No text, no count of affected rows.
- [ ] No green or red is used anywhere in the planner. No "approaching budget" nudges. No surplus or waterfall amber bleed-in.

### Empty / loading / error states

- [ ] First visit (no people, no allocations) shows an empty state in the Gifts mode right panel with a single CTA pointing to Quick Add.
- [ ] Upcoming with no allocations for the selected year shows a calm empty state ("No gifts planned for {year}").
- [ ] Config → People with no people shows an empty row with the inline-add affordance focused.
- [ ] Loading uses the global skeleton pattern; no spinners.
- [ ] API errors surface via the existing toast pattern; the planner does not block the page on error.

## Open Questions

- [x] ~~Does the planner store an Annual Budget in Independent mode?~~ **Yes** — per-year budget is stored in both modes; only the waterfall write is conditional on Synced mode.
- [x] ~~In Synced mode, can users add other `DiscretionaryItem` rows alongside the planner-owned one in the Gifts subcategory?~~ **No** — the Gifts subcategory is locked to the single planner-owned item while in Synced mode.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

> The logical data model — what entities are needed, their key fields and relationships, and any important constraints. Do NOT write Prisma syntax; `/write-plan` produces that.

The existing `GiftPerson`, `GiftEvent`, and `GiftYearRecord` models are unused in production and are replaced wholesale. The new schema below should be reached via a destructive migration (drop the old tables) as part of the implementation plan.

- **GiftPlannerSettings** — one row per household. Holds `mode` (`synced` | `independent`, default `synced`) and `syncedDiscretionaryItemId` (nullable, set when in Synced mode and references the planner-owned `DiscretionaryItem`). Created on household creation alongside other defaults.
- **GiftPlanYear** — per-household per-year row. Holds `year` (int) and `annualBudget` (float). Unique on (`householdId`, `year`). Created on first allocation for that year, on year rollover, or when the user sets a budget.
- **GiftPerson** — household-scoped person. Fields: `name`, `notes?`, `sortOrder`, `householdMemberId?` (nullable, soft link to `HouseholdMember`). Cascades to `GiftAllocation` on delete. Unique (`householdId`, `name`) for active rows.
- **GiftEvent** — household-scoped event. Fields: `name`, `dateType` (`shared` | `personal`), `dateMonth?`, `dateDay?` (set only when `dateType = shared`), `isLocked` (bool, default `false`), `sortOrder`. Cascades to `GiftAllocation` on delete. Locked events are immutable to rename and undeletable. Unique (`householdId`, `name`).
- **GiftAllocation** — the matrix cell. Fields: `householdId`, `giftPersonId`, `giftEventId`, `year`, `planned` (float, default 0), `spent` (float, nullable), `status` (`planned` | `bought` | `skipped`, default `planned`), `notes?`, `dateMonth?`, `dateDay?` (used as a per-allocation override for both shared-date and personal-date events). Unique on (`giftPersonId`, `giftEventId`, `year`). Indexed on (`householdId`, `year`).
- **HouseholdMember** — extended with a back-link to `GiftPerson` so the auto-surface logic can find the matching person row. Removing a `HouseholdMember` nullifies the link on `GiftPerson` but does not delete the `GiftPerson` row.
- **Subcategory** — extended with an `isPlannerOwned` flag (or equivalent), set on the seeded "Gifts" subcategory when a household is in Synced mode, used by Discretionary mutations to reject manual item add/edit/delete in that subcategory. Cleared when the household switches to Independent mode.
- **DiscretionaryItem** — extended with an `isPlannerOwned` flag so the staleness check can exclude the planner-owned Gifts item, and so Discretionary mutations can reject direct edits/deletes of it. Cleared on the item when the household switches to Independent mode (the item is deleted in that path anyway).

All gift entities are household-scoped. No cross-household access is permitted.

### API

> What operations the backend needs to expose, who can call them, and any auth or multi-tenancy rules. Do NOT write HTTP routes; `/write-plan` produces those.

All operations are JWT-protected and household-scoped via `req.householdId!`. Mutations are wrapped in `audited()` with `actorCtx(req)`.

#### Reads

- Get planner state for a year — returns settings, current `GiftPlanYear` (with budget and computed Planned/Spent totals and over-budget signals), people list with per-person aggregates, and a flag indicating whether the year is read-only.
- Get person detail for a year — returns the person plus all of their allocations for the year (joined with the underlying event for date and lock state).
- Get upcoming view for a year — returns month-grouped allocations with shared-date events pre-collapsed, plus the four callout totals (this month, next 3 months, rest of year, dateless).
- Get list of years that have data — drives the year selector.
- Get config → people list with filter argument (`all` | `household` | `non-household`).
- Get config → events list (locked and custom segregated).
- Get pending year-rollover notification (per-user, per-year), used by the page to decide whether to render the dismissible banner.

#### Person mutations

- Create / update / delete `GiftPerson` — household-scoped. Delete cascades allocations. Locked household-linked persons (those with a `householdMemberId`) are deletable but the linked `HouseholdMember` is untouched.
- Auto-create `GiftPerson` on `HouseholdMember` create (background hook on the existing member-creation path).
- Nullify `GiftPerson.householdMemberId` on `HouseholdMember` delete (background hook on the existing member-deletion path); preserves the `GiftPerson` row.

#### Event mutations

- Create / update / delete custom `GiftEvent` — household-scoped. Locked events reject rename and delete with a typed error.

#### Allocation mutations (current year only)

- Upsert `GiftAllocation` for a `(personId, eventId, year)` triple with `{planned, spent?, status?, notes?, dateMonth?, dateDay?}`. Setting `spent` to any non-empty value (including 0) implicitly marks the allocation `bought`. Clearing `spent` (passing `null`) implicitly reverts the status to `planned`. An explicit `status: skipped` is also accepted.
- Bulk upsert allocations — accepts a Quick Add matrix payload `(personId, eventId, year, planned)[]` and persists them in one transaction. Payload is capped at 500 cells per call to prevent abuse; the cap is enforced in the shared Zod schema.
- Reject any allocation mutation where `year < currentYear` with a typed read-only error.

#### Budget and mode mutations

- Set Annual Budget for a year — upserts `GiftPlanYear.annualBudget`. In Synced mode also upserts the corresponding `ItemAmountPeriod` on the planner-owned `DiscretionaryItem`. Read-only for prior years.
- Set planner mode — accepts `synced` | `independent`. Performs the mode switch atomically in a transaction:
  - **Synced → Independent**: deletes the planner-owned `DiscretionaryItem` and all of its `ItemAmountPeriod` history; clears `isPlannerOwned` on the Gifts subcategory; clears `GiftPlannerSettings.syncedDiscretionaryItemId`.
  - **Independent → Synced**: creates a new `DiscretionaryItem` ("Gifts") in the Gifts subcategory with `isPlannerOwned = true`; sets `isPlannerOwned` on the subcategory; creates an `ItemAmountPeriod` for the current year using the current `GiftPlanYear.annualBudget`; sets `GiftPlannerSettings.syncedDiscretionaryItemId`.
- Dismiss the year-rollover notification (per-user).

#### Background / cron

- Year rollover job — runs once per day and triggers on the first run after midnight on 1 January for each household. Creates the new `GiftPlanYear` (carrying budget forward), duplicates allocations with `planned`/`notes`/`date` carried forward and `spent`/`status` reset, and (in Synced mode) creates the new `ItemAmountPeriod`. Idempotent — re-running never duplicates.

#### Cross-tier guards

- Discretionary `DiscretionaryItem` create / update / delete must reject mutations targeting the Gifts subcategory in a household where Synced mode is active, except when the call originates from the planner's mode-switch transaction.
- Discretionary `DiscretionaryItem` update / delete must reject mutations targeting any item with `isPlannerOwned = true` from outside the planner.
- Staleness check excludes any `DiscretionaryItem` with `isPlannerOwned = true`.

### Components

> What UI units are needed and what each is responsible for. Do NOT write file paths or component code; `/write-plan` produces those.

- **GiftsPage** — top-level page at `/gifts`. Owns mode state (Gifts | Upcoming | Config), year-selector state, and the rollover-notification banner. Renders TwoPanelLayout.
- **GiftsLeftAside** — page title, year selector, annual-budget summary block, and the three vertical mode tabs. Mirrors the SettingsPage left-aside pattern.
- **GiftsBudgetSummary** — Annual Budget / Planned / Spent figures in tabular monospace, plus the two over-budget amber signals when active. Read-only display in prior years.
- **GiftsRightPanel** — controller that swaps between the three mode panels with the slide transition.
- **GiftsModePanel** — Gifts mode right panel. Owns its own State 2 / State 3 drill state with breadcrumb and direction-aware slide transitions.
  - **GiftPersonList** — State 2. Sorted person rows with planned/bought counts, totals, and the row-level amber dot. Click drills to detail.
  - **GiftPersonDetail** — State 3. Event cards for the person, inline-edit fields, hover-revealed skip action, "needs date" label.
- **UpcomingModePanel** — Upcoming mode right panel. Renders the four non-clickable callout cards followed by the month-grouped timeline and the Dateless section.
- **ConfigModePanel** — Config mode right panel. Owns its own drill state.
  - **ConfigDrillList** — State 2 with three rows: People, Events, Mode.
  - **ConfigPeoplePanel** — State 3 list with the All / Household / Non-household filter, inline add, inline edit, household badge.
  - **ConfigEventsPanel** — State 3 list with locked / custom segregation, inline add for custom events, inline edit, lock icon for seeded events, the date-type radio in the create/edit form.
  - **ConfigModePanel (mode panel)** — State 3 with the Synced / Independent radio and the confirmation-dialog flow for switching.
  - **ModeSwitchConfirmDialog** — destructive-action dialog with explicit list of what is created or destroyed.
- **QuickAddPanel** — drilled from Config (`← Config / Quick add`). Matrix editor with editable cells, row/column totals, live summary strip, Save/Cancel, unsaved-changes guard.
- **YearRolloverBanner** — dismissible in-page notification that appears once per user per rollover.
- **OverBudgetSignal** — small reusable amber-dot + text element used by the budget summary block.

### Notes

#### Status transitions

- Default `status` for a fresh allocation is `planned`.
- Setting `spent` to any non-null value (including `0`) sets `status = bought` server-side.
- Setting `spent` back to `null` sets `status = planned` server-side, unless the user explicitly passed `status: skipped` in the same call.
- `skipped` can only be set/unset via the explicit row action; it never transitions implicitly.
- An allocation can be deleted entirely if it has never been edited (defensive cleanup), but the standard flow is to keep it as `planned` or `skipped`.

#### Date resolution for Upcoming view

- Shared-date events use the `(dateMonth, dateDay)` on the `GiftEvent`, unless the allocation has a non-null `(dateMonth, dateDay)` override.
- Personal-date events use the `(dateMonth, dateDay)` on the allocation. If null, the allocation lands in the Dateless section.
- Sort key for the timeline is `(month, day)` resolved per allocation, with shared-date events collapsed into one row keyed by `eventId + month + day`.

#### Synced-mode invariants

- The planner-owned `DiscretionaryItem` is named "Gifts", lives in the seeded "Gifts" subcategory, and has `spendType = monthly` (the existing waterfall semantics treat the per-year `ItemAmountPeriod` as the source of truth for the displayed amount).
- `ItemAmountPeriod.startDate` for the planner-owned item is always 1 January of the relevant year. `endDate` is left null on the latest period.
- The planner is the sole writer of these `ItemAmountPeriod` rows. Manual edits via Discretionary UI are blocked by the cross-tier guard.

#### Multi-tenancy

- Every read and mutation is scoped via `req.householdId!`. No `householdId` is ever accepted from URL params or request body.
- The household-member auto-link logic must scope its writes to the same household and never touch another household's `GiftPerson` rows.

#### Audit

- All planner mutations (allocation upserts, budget set, mode switch, person/event CRUD, Quick Add bulk save) are wrapped in `audited()` with `actorCtx(req)`. Mode-switch destructive deletes are explicitly audited.

#### Language exception

- "Spent" language is permitted only inside the Gifts planner UI. The waterfall and every other tier continue to use "budgeted" / "planned" / "allocated" per Anchor #3 and Philosophy Principle 2 (both updated as part of the design phase).

#### Out of scope

- Auto-calculation of moveable feasts (Easter, Mothering Sunday, UK Father's Day) — fixed dates are seeded; user can override per allocation.
- Shared gifts (one allocation, multiple recipients).
- Reminders, push notifications, or calendar integration.
- Receipt photos, product links, purchase tracking, wishlist beyond the notes field.
- Mobile-specific layouts.
- Import / export of gift plans.
- Multi-year forward planning (only the current year is editable).
- Per-member sharing of gift plans (planner is household-scoped, not member-scoped).
