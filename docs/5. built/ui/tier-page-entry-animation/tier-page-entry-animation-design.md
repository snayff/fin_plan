---
feature: tier-page-entry-animation
status: approved
creation_date: 2026-03-28
status: implemented
implemented_date: 2026-07-05
---

# Tier Page Entry Animation — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

When navigating from the overview to a tier page, the left panel subcategory rows appear instantly with no spatial context. Adding a directional entrance animation communicates that the user has arrived into a tier — reinforcing the spatial model of the app and making the transition feel intentional rather than abrupt.

## Approved Approach

On initial mount of the tier page, subcategory rows in the left panel stagger in from the left. Each row slides from `x: -22px` to `x: 0` while fading from `opacity: 0` to `opacity: 1`, with a 60ms delay between rows and 200ms per row using `ease-out-quart`.

The tier header and Total footer row are static — only the data rows animate. This keeps the structural chrome stable while the content arrives.

This was chosen over a single-block slide (all rows at once) because the stagger communicates list structure — the user can see that each item is distinct — without being slow or distracting.

## Key Decisions

| Decision                 | Choice                                                       | Rationale                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger                  | Page mount only — not on item switching, not on data refresh | Avoids repetitive motion mid-session; animation communicates arrival, not routine state changes                                                         |
| What animates            | Subcategory rows only                                        | Tier header and Total footer are structural chrome — animating them adds noise without spatial meaning                                                  |
| Motion axis              | Horizontal (`x: -22px → 0`)                                  | Matches the axis of page navigation (arriving into the tier from the side); vertical stagger (`y`) is reserved for block-level entrance on static pages |
| Stagger timing           | 60ms between rows, 200ms per row                             | Aligned with existing stagger spec (`staggerChildren: 0.06`); fast enough to feel immediate, slow enough to perceive sequence                           |
| Easing                   | `ease-out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`)           | Canonical entrance curve per §4.8                                                                                                                       |
| `prefers-reduced-motion` | No animation — rows appear at full opacity immediately       | Required by §4.8 for all animations                                                                                                                     |
| Add item row             | Not applicable — the left panel has no Add item row          | Confirmed from UI; Add item only appears in the right panel                                                                                             |

## Out of Scope

- Right panel animations — the existing State 2→3 / State 3→2 slide transitions are unchanged
- Switching between tiers mid-session — no re-animation on tier change, only on page mount
- Overview/waterfall page exit animation — not part of this feature
- Any right panel content animation on tier page entry

## Visual Reference

- `entry-animation-options.html` — A/B comparison: single-block slide vs staggered rows (stagger was chosen)
- `add-item-row-options.html` — explored whether Add item row should join the stagger (not applicable — left panel has no Add item row)
