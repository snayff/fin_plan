---
feature: page-headers
design_doc: docs/4. planning/page-headers/page-headers-design.md
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Page Headers

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Page title presentation is inconsistent across the app — six different approaches across ~10 pages, with the three highest-traffic tier pages having no visible title at all. Users rely entirely on the nav bar underline to know which page they're on. A consistent, fixed left-panel header on every page anchors the content, reinforces the waterfall hierarchy on tier pages, and gives the interface a unified structure.

## Description

Every page that uses the two-panel layout gains a fixed header area at the top of its left panel. The header displays the page title in uppercase with whitespace separation from the scrollable content below. On tier pages (Income, Committed, Discretionary, Surplus), the header also shows the tier's monthly total right-aligned. On Overview, the existing full-width `OverviewPageHeader` strip has its "Overview" label removed — the strip stays for snapshot context but is blank in live mode.

## User Stories

- As a user, I want to see which page I'm on clearly within the page content so that I don't rely solely on the nav bar underline.
- As a user on a tier page, I want to see the tier's monthly total at the top of the left panel so that I have a summary anchor without scrolling.
- As a user, I want the page title to stay fixed when I scroll the left panel list so that context is never lost.

## Acceptance Criteria

- [ ] Every two-panel page (Overview, Income, Committed, Discretionary, Surplus, Goals, Gifts, Settings, Help) has a fixed header at the top of its left panel
- [ ] The header title uses `font-heading`, weight 700, 18px, uppercase, `letter-spacing: 0.09em`
- [ ] Tier pages (Income, Committed, Discretionary, Surplus) display the title in their tier colour (`text-tier-income`, `text-tier-committed`, `text-tier-discretionary`, `text-tier-surplus`)
- [ ] Non-tier pages (Overview, Goals, Gifts, Settings, Help) display the title in `page-accent` (#8b5cf6)
- [ ] Tier pages show the tier's monthly total right-aligned alongside the title, in `font-numeric`
- [ ] Non-tier pages show only the title — no total
- [ ] The header is visually separated from the scrollable content below by whitespace only — no border line
- [ ] The left panel list scrolls independently beneath the fixed header — the title never scrolls out of view
- [ ] The `OverviewPageHeader` strip no longer displays "Overview" text — it is blank in live mode and shows only snapshot context (snapshot name, "Read only" badge, "← Live view" button) when viewing a snapshot
- [ ] The existing Surplus page inline `<h1>` is removed and replaced by the new left-panel header
- [ ] The existing Goals and Gifts page inline `<h1>` elements are removed and replaced by the new left-panel header
- [ ] The Settings page left sidebar label is replaced by the new left-panel header
- [ ] The Help page gains a left-panel header where none existed before
- [ ] The `OverviewPageHeader` full-width strip continues to render in both live and snapshot modes (no layout shift)
- [ ] The page title in the header matches the nav bar link text for each page

## Open Questions

None — all resolved during design.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No schema changes. This is a frontend-only feature.

### API

No API changes. Tier totals are already available from the existing waterfall summary query used by the tier pages.

### Components

- **PageHeader** — new shared component. Renders a fixed header area at the top of the left panel. Accepts a title string, an optional colour class (defaults to `page-accent`), and an optional total value with its colour. Handles the fixed positioning, whitespace separation, and typography.

- **TierPage (update)** — passes the tier name and tier total to `PageHeader`. The tier total comes from the existing subcategory data already loaded by each tier page.

- **OverviewPage (update)** — adds `PageHeader` with "Overview" title and `page-accent` colour to the left panel content. No total.

- **SurplusPage (update)** — removes the existing inline `<h1>` element. Adds `PageHeader` with "Surplus" title and `text-tier-surplus` colour, with the surplus total.

- **GoalsPage (update)** — removes the existing inline `<h1>`. Adds `PageHeader` with "Goals" title and `page-accent` colour. No total.

- **GiftsPage (update)** — removes the existing inline `<h1>`. Adds `PageHeader` with "Gifts" title and `page-accent` colour. No total.

- **SettingsPage (update)** — removes the existing sidebar label. Adds `PageHeader` with "Settings" title and `page-accent` colour. No total.

- **HelpPage (update)** — adds `PageHeader` with "Help" title and `page-accent` colour to the left panel. No total.

- **OverviewPageHeader (update)** — removes the "Overview" text from non-snapshot mode (strip renders blank). In snapshot mode, removes the "Overview ›" prefix, keeping only the snapshot name, "Read only" badge, and "← Live view" button.

### Notes

- The left panel must be restructured on each page to have two children: the fixed `PageHeader` and a scrollable container for the remaining content. The `PageHeader` sits outside the scroll container.
- Tier totals on tier pages should reactively update when the underlying data changes (same query invalidation that already drives the subcategory lists).
- The `OverviewPageHeader` blank strip in live mode maintains consistent vertical spacing — removing it entirely would cause a layout shift when entering/exiting snapshot mode.
- Auth pages (Login, Register, Welcome) are unaffected — they use standalone layouts without a left panel.
- Planner and Wealth pages are not yet built and are out of scope — they will adopt this pattern when implemented.
- When tier data is still loading, the page title renders immediately (it's static text) but the total is omitted until data arrives — no skeleton needed for a single number. When tier data errors, the total is also omitted; the title still renders.
