---
feature: page-headers
status: approved
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Page Headers — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

Page title presentation is inconsistent across the app. The three highest-traffic tier pages (Income, Committed, Discretionary) have no visible page title at all — the user relies entirely on the nav bar underline. Meanwhile, Overview has a full-width strip, Surplus/Goals/Gifts use oversized inline h1s, Settings has a tiny sidebar label, and Help has no visible title. Six different approaches across ~10 pages.

## Approved Approach

Add a **fixed header area at the top of the left panel** on every page. The header stays pinned while the list content scrolls independently beneath it. Separation between the header and scrollable content is achieved through **whitespace only** — no border line.

### Title treatment

- **Typography:** `font-heading`, weight 700, 18px, uppercase, `letter-spacing: 0.09em`
- **Colour:** Solid tier colour on tier pages; `page-accent` (#8b5cf6) on non-tier pages
- **Tier total:** Tier pages (Income, Committed, Discretionary, Surplus) show the tier's monthly total right-aligned alongside the title, in `font-numeric`. Non-tier pages show only the title.

### Per-page mapping

| Page          | Title text    | Title colour              | Total alongside? |
| ------------- | ------------- | ------------------------- | ---------------- |
| Overview      | OVERVIEW      | `page-accent` violet      | No               |
| Income        | INCOME        | `text-tier-income`        | Yes              |
| Committed     | COMMITTED     | `text-tier-committed`     | Yes              |
| Discretionary | DISCRETIONARY | `text-tier-discretionary` | Yes              |
| Surplus       | SURPLUS       | `text-tier-surplus`       | Yes              |
| Goals         | GOALS         | `page-accent` violet      | No               |
| Gifts         | GIFTS         | `page-accent` violet      | No               |
| Settings      | SETTINGS      | `page-accent` violet      | No               |
| Help          | HELP          | `page-accent` violet      | No               |

### Overview snapshot strip change

The existing `OverviewPageHeader` full-width strip is repurposed:

- **Label changes from "Overview" to "Snapshots"** — it becomes a dedicated snapshot context bar, not a page title
- **Always visible** — in live mode it shows "Snapshots" alongside the timeline dots; in snapshot mode it expands to "Snapshots › [Snapshot Name] · Read only · ← Live view"
- The "Overview" page title moves into the left panel header (as above)

## Key Decisions

| Decision                | Choice                                           | Rationale                                                                                                              |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Header position         | Fixed at top of left panel, not full-width strip | Left-panel anchoring feels natural — it labels what the panel contains. Full-width duplicates the nav.                 |
| Separation style        | Whitespace only, no border                       | Calmer and more consistent with the app's breathing-room aesthetic. Border felt heavy.                                 |
| Title size              | 18px (new hierarchy level)                       | Strong page-level presence. Clear step above 13px tier headings (Overview) and 12px list items.                        |
| Tier total in header    | Yes, on tier pages only                          | Gives the header utility beyond labelling. Non-tier pages have no single summary number to show.                       |
| Overview snapshot strip | Relabelled "Snapshots", always rendered          | Strip serves snapshot context, not page identity. Removing "Overview" avoids redundancy with the new left-panel title. |
| Non-tier page colour    | `page-accent` violet                             | Consistent with existing design system rule: non-waterfall pages use page-accent, never tier colours.                  |

## Out of Scope

- Planner/Wealth pages (not yet built — they will follow the same pattern when implemented)
- Right panel headers (ItemArea subcategory header is a separate concern)
- Snapshot timeline component changes (only the label text in OverviewPageHeader changes)
- Mobile/responsive behaviour (desktop-first, per design system)
- Auth pages (Login, Register, Welcome — standalone layouts, no left panel)

## Visual Reference

- `left-panel-header-separation.html` — three separation styles explored (whitespace selected)
- `title-sizing.html` — three size options on Income tier page (18px selected)
- `title-sizing-overview.html` — three size options on Overview page (18px selected)
