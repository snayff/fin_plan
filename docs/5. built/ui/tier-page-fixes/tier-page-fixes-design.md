---
feature: tier-page-fixes
status: approved
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Tier Page Fixes — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

A design review of the Income page (representative of all tier pages) revealed multiple deviations from the navigation-and-page-structure design and the design system. The most critical: tier pages stack subcategories and items vertically instead of using the two-panel layout, and ambient glows are either missing or invisible. Several token values in the empty state card are wrong, subcategory hover uses the wrong colour base, and the `data-page` attribute is missing. The existing Overview page glow is also too diffuse, covering the entire viewport rather than being a subtle corner accent.

## Approved Approach

Fix all identified deviations to bring tier pages into alignment with the design system and navigation design doc. Update the design system's ambient glow specification to a new standard that applies uniformly across all pages (including Overview). Add Help as a recognised 9th nav item.

### Layout

Wrap the tier page content (subcategory list + item area) in `TwoPanelLayout` — left panel (360px) for the subcategory list, right panel (fill) for the item area. This matches how `SurplusPage` already uses `TwoPanelLayout`.

### Ambient Glows — New Standard (All Pages)

Replace the existing glow pattern across all pages. The new standard:

- **Shape:** `ellipse` centred at corner
- **Primary:** top-right (`at 100% 0%`), fade to transparent at 25%
- **Secondary:** bottom-left (`at 0% 100%`), fade to transparent at 25%
- **Implementation:** `::before` / `::after` pseudo-elements via `[data-page]` attribute, `position: fixed`, `pointer-events: none`, `z-index: 0`

The tight 25% fade ensures the centre and majority of the page shows the true `#080a14` background, with colour only as a subtle corner accent.

**Per-page glow colours:**

| Page          | Primary colour                | Primary opacity | Secondary colour   | Secondary opacity |
| ------------- | ----------------------------- | --------------- | ------------------ | ----------------- |
| Overview      | Indigo (`#6366f1`)            | 9%              | Violet (`#8b5cf6`) | 5%                |
| Income        | Blue (`#0ea5e9`)              | 9%              | Indigo (`#6366f1`) | 5%                |
| Committed     | Indigo (`#6366f1`)            | 9%              | Purple (`#a855f7`) | 5%                |
| Discretionary | Purple (`#a855f7`)            | 9%              | Teal (`#4adcd0`)   | 5%                |
| Surplus       | Teal (`#4adcd0`)              | 9%              | Indigo (`#6366f1`) | 5%                |
| Settings      | Neutral (`rgba(238,242,255)`) | 4%              | None               | —                 |

Secondary colours follow the waterfall spectrum: each tier's secondary is the next tier's primary.

### Empty State Card — Token Corrections

- **Background:** `linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.05) 100%)`
- **Border:** `1px solid rgba(99,102,241,0.1)`
- **Header gradient:** callout-primary `#0ea5e9 → #a855f7` (blue → purple)

### Subcategory Hover

Change unselected subcategory row hover from `bg-foreground/5` to `bg-tier-{colour}/5` — tier colour at 5% opacity, matching the design system's interactive states spec.

### `data-page` Attribute

Add `data-page` attribute to all tier page wrappers, enabling CSS-driven ambient glows via the design system's specified `[data-page]` selector pattern.

### Navigation

Add Help as the 9th nav item in the design doc, positioned in the third group between Gifts and Settings: `Goals · Gifts · Help ···· Settings`.

## Key Decisions

| Decision           | Choice                                          | Rationale                                                                                   |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Surplus page       | Excluded — keep bespoke implementation          | Serves a different purpose (cascaded remainder); subcategory pattern isn't ready for it yet |
| Help nav item      | Keep and formalise as 9th item                  | Already implemented, useful, no design harm                                                 |
| Ambient glow shape | Ellipse (not circle)                            | Better proportional spread on wide viewports                                                |
| Glow origin        | Corner-centred (`100% 0%` / `0% 100%`)          | Colour radiates inward from edges; centre stays pure `#080a14`                              |
| Glow fade distance | 25%                                             | Tight enough that the majority of the page shows the true background colour                 |
| Glow opacity       | 9% primary / 5% secondary                       | Perceptible but not dominant; subtle ambient wash                                           |
| Glow scope         | New standard for all pages (including Overview) | Consistency; the existing Overview glow was too diffuse                                     |
| Overview glow fix  | Update to match new standard                    | Current glow covers entire viewport; should be corner-contained                             |

## Out of Scope

- Surplus page redesign — keep bespoke implementation, handle in a future dedicated design
- Surplus empty state copy entries — surplus doesn't use `TierPage`
- New subcategory features (rename, reorder, add) — Phase 2 per navigation design
- Goals and Gifts page internals — need dedicated design sessions
- Mobile experience — desktop-first per Anchor 6

## Visual Reference

- `mockups/ambient-glow-final.html` — Full-screen Income page mockup with approved ambient glow: ellipse at corners, 9%/5% opacity, fade at 25%, two-panel layout
