---
feature: subcategory-customisation
design_doc: docs/4. planning/subcategory-customisation/subcategory-customisation-design.md
creation_date: 2026-04-05
status: implemented
implemented_date: 2026-07-05
---

# Subcategory Customisation

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

The waterfall model is most effective when subcategories match the user's mental model of their finances. Households currently receive a fixed set of default subcategories with no ability to customise them. Users with different financial structures — freelancers, retirees, families with unique spending patterns — need to rename, add, remove, and reorder subcategories to match how they think about their money.

## Description

A new "Subcategories" section on the Settings page with three tier tabs (Income / Committed / Discretionary). Each tab shows an always-editable inline list of subcategories with drag handles for reordering, text inputs for renaming, and remove buttons for deletion. An "Add subcategory" button allows adding new ones up to a per-tier cap of 7. Changes are saved explicitly via a "Save" button. Mandatory subcategories ("Other" in every tier, plus locked subcategories like "Gifts" in Discretionary) cannot be renamed or removed. "Other" is always pinned at the bottom of each tier's list.

## User Stories

- As a user, I want to rename subcategories so that they match my own terminology for how I categorise income and spending.
- As a user, I want to add new subcategories so that I can track categories of income or spending that the defaults don't cover.
- As a user, I want to remove subcategories I don't use so that the tier pages show only categories relevant to me.
- As a user, I want to reorder subcategories so that the most important ones appear first in the tier page left panel.
- As a user, I want to reset subcategories to defaults so that I can start fresh if my customisations become unwieldy.
- As a user removing a subcategory with items, I want to choose where those items move so that no data is silently lost.

## Acceptance Criteria

### Tier tabs and layout

- [ ] A new "Subcategories" section appears in the Settings page sidebar and content area
- [ ] The section contains three tier tabs: Income, Committed, Discretionary
- [ ] Each tab shows the subcategories for that tier as an editable list
- [ ] A capacity indicator "N of 7 used" is shown above each tier's list
- [ ] The tab label for each tier uses the tier's colour token

### Editing subcategories

- [ ] Each non-mandatory subcategory row has: drag handle, text input, remove button
- [ ] Mandatory subcategories ("Other" + locked) display as read-only rows with no drag handle and no remove button
- [ ] "Other" is always pinned at the bottom of each tier's list and excluded from drag reordering
- [ ] Locked subcategories (e.g. "Gifts" in Discretionary) cannot be renamed or removed but can be reordered among non-Other rows
- [ ] Subcategory names must be unique within a tier (case-insensitive comparison)
- [ ] Subcategory names have a maximum length of 24 characters
- [ ] Empty names are not permitted — validation prevents saving a blank name
- [ ] An "Add subcategory" button appends a new row (inserted above "Other") when capacity allows
- [ ] The "Add subcategory" button is disabled when the tier is at the 7-subcategory cap
- [ ] Drag reordering updates the visual order immediately in the local draft state

### Removing subcategories

- [ ] Clicking remove on a subcategory with zero items removes it from the local draft immediately
- [ ] Clicking remove on a subcategory with assigned items opens a reassignment prompt
- [ ] The reassignment prompt shows the count of affected items and a dropdown of remaining subcategories in the same tier (excluding ones also marked for removal in the current draft)
- [ ] The user must select a destination subcategory before confirming removal
- [ ] Reassignment is recorded in the local draft and applied on save

### Save and discard

- [ ] All changes (renames, adds, removes, reorders, reassignments) are batched into local draft state
- [ ] A "Save" button commits all draft changes to the server in a single request
- [ ] The "Save" button is disabled when there are no unsaved changes
- [ ] A "Discard changes" button reverts to the last-saved server state
- [ ] Navigating away from the Subcategories section with unsaved changes shows an unsaved-changes warning
- [ ] After a successful save, the draft state resets to match the new server state
- [ ] Validation errors (duplicate names, empty names, over-capacity) prevent save and are shown inline

### Reset to defaults

- [ ] A "Reset to defaults" button is available (outside the per-tier tab content — applies to all tiers)
- [ ] Clicking it opens a confirmation modal
- [ ] The modal lists every subcategory across all tiers that does not exactly match a default (by name) and has assigned items, with a destination dropdown for each
- [ ] Subcategories that don't match a default but have zero items are listed as "will be removed" (no dropdown needed)
- [ ] Renamed defaults are treated as custom — they receive reassignment prompts if they have items, then are replaced with fresh defaults
- [ ] After confirmation, all tiers are restored to the original default set (names, order, locked/default flags)
- [ ] Reset is a server operation — it is not part of the local draft/save flow

### State coverage

- [ ] While subcategories or item counts are loading, the list area shows a skeleton loader
- [ ] If the save request fails, an error toast is shown and the draft state is preserved (user can retry)
- [ ] On successful save, a success toast is shown ("Subcategories updated")
- [ ] On successful reset, a success toast is shown ("Subcategories reset to defaults")
- [ ] The Save button shows a loading spinner while the save request is in flight

### Design system alignment

- [ ] The "Subcategories" section header uses `page-accent` styling per Settings convention
- [ ] Tier tab labels use the tier colour tokens (`tier-income`, `tier-committed`, `tier-discretionary`)
- [ ] The "Reset to defaults" button is visually separated below a divider, with clear consequence labelling (per Settings destructive action rules)
- [ ] The reassignment prompt and reset confirmation modal use the `ConfirmationModal` pattern from the design system
- [ ] Form inputs follow the `FormInput` six-state pattern (unselected, focused, error, warning, disabled, valid)
- [ ] Save/Discard buttons use the `ButtonPair` pattern

### Edge cases

- [ ] A newly created household already has the default subcategories (existing `seedDefaults` behaviour — no change)
- [ ] If a tier is already at the default set with no changes, the tab shows the default list as editable (no special "pristine" state)
- [ ] Attempting to save with a duplicate name within a tier shows an inline error on the offending row
- [ ] The name "Other" is reserved — users cannot rename a subcategory to "Other" or create a new one named "Other" (case-insensitive)

## Open Questions

None — all decisions resolved in the design doc and during spec writing.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No new entities are needed. The existing **Subcategory** entity already has all required fields:

- `id`, `householdId`, `tier`, `name`, `sortOrder`, `isLocked`, `isDefault`
- Unique constraint on `[householdId, tier, name]`
- Relations to `IncomeSource`, `CommittedItem`, `DiscretionaryItem`

The `isDefault` flag tracks whether a subcategory was part of the original seeded set. The `isLocked` flag tracks whether a subcategory is protected from rename and removal (currently only "Gifts" in Discretionary).

"Other" is identified by name (always `"Other"`) rather than a dedicated flag. It is always present, always pinned last, and cannot be renamed or removed. This is enforced by the API, not by a schema flag.

### API

The existing read endpoint (`GET /subcategories/:tier`) is unchanged.

New operations needed:

- **Batch save subcategories for a tier** — accepts the full desired state of a tier's subcategories (names, sort orders, and any item reassignment mappings for removed subcategories). Validates uniqueness, name length, capacity cap (7), and mandatory subcategory protection. Applies in a transaction: reassign items from removed subcategories to their destinations, delete removed subcategories, update renamed/reordered subcategories, create new subcategories. JWT-protected, household-scoped.

- **Get item counts per subcategory for a tier** — returns the number of waterfall items assigned to each subcategory in a given tier. Used by the frontend to determine whether a removal needs a reassignment prompt. JWT-protected, household-scoped.

- **Reset subcategories to defaults** — accepts a mapping of `{ subcategoryId: destinationSubcategoryId }` for each non-default subcategory that has items. Reassigns items, deletes all non-default subcategories, restores any missing or renamed defaults to their original names and sort orders. Applies in a transaction across all three tiers. JWT-protected, household-scoped.

All mutation operations must validate:

- The caller belongs to the household
- All subcategory IDs in the request (including reassignment source and destination IDs) belong to the caller's household — prevents cross-household data manipulation
- "Other" cannot be renamed, removed, or reordered away from the last position
- The name "Other" is reserved — no subcategory can be created with or renamed to "Other" (case-insensitive)
- Locked subcategories cannot be renamed or removed
- Names are unique within the tier (case-insensitive)
- Names are 1–24 characters, trimmed
- Total subcategories per tier do not exceed 7

Security notes:

- All endpoints are JWT-protected and household-scoped — no cross-household access is possible
- Input validation uses Zod schemas in `packages/shared` — no raw user input reaches the database
- The batch save endpoint must reject any payload that attempts to modify or remove "Other" or locked subcategories, even if the client sends such data (defence in depth — client-side restrictions are not sufficient)
- No PII is stored in subcategory names — they are user-generated labels only

### Components

- **SubcategoriesSection** — the new Settings section. Renders the three tier tabs, the capacity indicator, the subcategory list for the active tab, Save/Discard buttons, and the "Reset to defaults" button. Manages local draft state for all three tiers.

- **SubcategoryRow** — a single row in the list. Renders a drag handle (if reorderable), a text input (if renameable), and a remove button (if removable). Mandatory rows render as read-only. Passes change events up to the parent.

- **ReassignmentPrompt** — a dialog shown when removing a subcategory that has items. Displays the item count and a dropdown of valid destination subcategories. Returns the chosen destination to the parent on confirm.

- **ResetConfirmationModal** — a dialog for the "Reset to defaults" flow. Lists all non-default subcategories across all tiers that have items, with a destination dropdown for each (destinations are the default subcategories for that tier). Subcategories with zero items are listed as "will be removed". Confirms or cancels the reset.

### Notes

- The batch save endpoint receives the **full desired state** of a tier rather than individual mutations. This avoids race conditions and simplifies the transactional logic — the server diffs current vs desired and applies the changes.
- Item reassignment during removal uses the tier's item relation: income tier → `IncomeSource`, committed tier → `CommittedItem`, discretionary tier → `DiscretionaryItem`. Each item's `subcategoryId` is updated to the destination.
- The "Other" subcategory is identified by `name === "Other"` in server-side validation. It is seeded with `isDefault: true` and `isLocked: false` (it uses name-based protection, not the `isLocked` flag).
- The capacity cap of 7 includes "Other" and locked subcategories. Committed tier defaults are already at 7, so users must remove a default before adding a custom subcategory in that tier.
- The unsaved-changes warning should use the same pattern as other Settings sections (e.g. a `beforeunload` listener and in-app navigation guard).
- Drag reordering should use an accessible drag-and-drop library. "Other" is excluded from the sortable list and rendered statically below it.
- The `isDefault` flag is informational — it does not affect edit permissions. Only `isLocked` and the "Other" name check restrict editing.
- During reset, the server determines the default set from the same `DEFAULT_SUBCATEGORIES` constant used by `seedDefaults` in the existing `subcategory.service.ts`. Any subcategory whose name does not match a default in its tier is treated as custom and removed (with item reassignment if applicable). Renamed defaults are treated as custom — they are deleted and replaced with fresh default records.
