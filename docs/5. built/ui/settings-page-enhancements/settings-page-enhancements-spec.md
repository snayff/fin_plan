---
feature: settings-page-enhancements
design_doc: docs/4. planning/settings-page-enhancements/settings-page-enhancements-design.md
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Settings Page Enhancements

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

The settings page currently exposes controls that shouldn't be user-configurable (ISA year start month/day — fixed UK tax year values), contains sections for features removed from scope (snapshots, ended income, waterfall rebuild), and lacks visual feedback for which section the user is currently viewing. These enhancements simplify the page and improve navigation.

## Description

Three changes applied together: (1) simplify the ISA section by removing the month and day fields, keeping only the annual limit input with its Save button; (2) remove the Snapshots, Ended Income Sources, and Waterfall Rebuild sections entirely from both the sidebar and content area; (3) add scroll-spy sidebar highlighting using IntersectionObserver so the currently-viewed section's sidebar button is visually indicated.

## User Stories

- As a user, I want the ISA settings to show only the annual limit so that I'm not confused by fields I shouldn't change (UK tax year start is always 6 April).
- As a user, I want the settings page to only show sections for active features so that I'm not distracted by controls for removed functionality.
- As a user, I want the sidebar to highlight which section I'm currently viewing so that I can orient myself on a long settings page.

## Acceptance Criteria

- [ ] ISA section displays only the annual limit (£) input and a Save button
- [ ] ISA section no longer renders month or day input fields
- [ ] ISA save mutation sends only `isaAnnualLimit` (not month/day)
- [ ] ISA section description text is removed (no "UK default: 6 April" copy needed since the fields are gone)
- [ ] Snapshots section is removed from sidebar navigation and content area
- [ ] Ended Income section is removed from sidebar navigation and content area
- [ ] Waterfall Rebuild section is removed from sidebar navigation and content area
- [ ] Component files for Snapshots, Ended Income, and Rebuild are deleted
- [ ] SECTIONS array contains exactly 6 entries: Profile, Staleness thresholds, Surplus benchmark, ISA settings, Household, Trust accounts
- [ ] Sidebar buttons highlight the currently visible section with `bg-accent text-accent-foreground`
- [ ] Scroll-spy uses IntersectionObserver on the content scroll container (the `overflow-y-auto` div)
- [ ] When multiple sections are visible, the topmost section's sidebar button is highlighted
- [ ] IntersectionObserver uses a threshold of approximately 0.3
- [ ] Only one sidebar button is highlighted at a time
- [ ] Highlight updates smoothly as the user scrolls through sections
- [ ] Clicking a sidebar button still scrolls to that section (existing behaviour preserved)
- [ ] Loading and error states continue to work as before
- [ ] No backend schema changes — ISA month/day fields remain in the database

## Open Questions

None — all decisions resolved in the design doc.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No schema changes. The `isaYearStartMonth` and `isaYearStartDay` fields remain in the database and backend schema — they are simply no longer exposed in the UI.

### API

No API changes. The existing settings update operation continues to accept `isaAnnualLimit`. The frontend stops sending `isaYearStartMonth` and `isaYearStartDay` in the mutation payload.

### Components

- **IsaSection** — Simplified to render only the annual limit input and Save button. The month and day inputs, their labels, the 3-column grid layout, and the description paragraph are removed. Layout becomes a single input with its label.
- **SettingsPage** — Updated to: (1) remove SnapshotsSection, EndedIncomeSection, and RebuildSection from imports and render tree; (2) reduce SECTIONS array to 6 entries; (3) add IntersectionObserver-based scroll-spy that tracks which section is in view and applies `bg-accent text-accent-foreground` to the corresponding sidebar button.
- **SnapshotsSection** — Deleted entirely.
- **EndedIncomeSection** — Deleted entirely.
- **RebuildSection** — Deleted entirely.

### Notes

- The scroll-spy observer root must be the content scroll container (`overflow-y-auto` div), not the viewport, because the page uses internal scrolling.
- Threshold of ~0.3 ensures a section is meaningfully visible before its sidebar button highlights — avoids flickering when sections are barely peeking into view.
- When multiple sections intersect, the topmost one (lowest `boundingClientRect.top`) wins the highlight.
- The `bg-accent text-accent-foreground` styling matches the existing hover token but is applied persistently (not just on hover), creating a clear "you are here" indicator without introducing new tokens.
- Existing test mocks for `useSnapshots`, `useEndedIncome`, `useRebuildWaterfall`, and related hooks can be cleaned up from the test file since those sections no longer render.
