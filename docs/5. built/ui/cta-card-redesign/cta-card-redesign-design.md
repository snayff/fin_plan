---
feature: cta-card-redesign
status: approved
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# CTA Card Redesign — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

The `EmptyStateCard` component used in the waterfall tier right panel (shown when a subcategory has zero items) looks out of place with the rest of the app. It uses a heavy gradient background (12% opacity vs the 7% spec), gradient text on the heading (reserved for hero/callout moments per the design system), and floats centered in empty space rather than teaching the list structure. The result reads as decorative and "AI slop" rather than calm, functional, and design-system-aligned.

Meanwhile, the correct pattern — fading skeleton rows + inline CTA card — already exists in the design system (section 3.5 "Fading Skeleton + CTA Card") and is already implemented by the `GhostedListEmpty` component used in Wealth and Planner panels.

## Approved Approach

Replace `EmptyStateCard` with `GhostedListEmpty` in the tier right panel. This reuses an existing component that already implements the design-system spec exactly:

- **Fading skeleton rows** (3 rows at 100% → 80% → 50% opacity) teach the list structure before items exist
- **Inline CTA card** at spec-correct gradient (7% indigo → 5% purple), 8px radius, compact padding
- **Contextual body text** from `emptyStateCopy.ts` used as the `ctaText` prop
- **No gradient text heading** — the subtle card with body text and `+ Add` button is sufficient

This was chosen over a more minimal "ghost prompt" (Option B: no card, just muted text + dashed button) because the inline CTA card is already the established pattern across the app and the subtle gradient provides just enough visual weight to guide new users without being decorative.

## Key Decisions

| Decision           | Choice                                                                        | Rationale                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Component approach | Reuse `GhostedListEmpty`, delete `EmptyStateCard`                             | Eliminates a bespoke component that diverges from the design system; one pattern for all list empties                     |
| CTA text content   | Use `body` from `emptyStateCopy.ts` (e.g. "Employment income, take-home pay") | Contextual, already written, matches what the current card shows as body text                                             |
| Heading text       | Removed — no heading in the CTA card                                          | `GhostedListEmpty` uses a single text line, not header + body. The subcategory name is already in the panel header above. |
| Skeleton row count | 3 (default)                                                                   | Matches `GhostedListEmpty` default and feels right for the right panel height                                             |
| Button label       | `+ Add`                                                                       | Consistent with `GhostedListEmpty` default and the header's ghost `+ Add` button                                          |

## Out of Scope

- `OverviewEmptyState` (ghosted cascade) — different pattern, already correct
- `GhostedListEmpty` component internals — no changes needed
- Copy changes in `emptyStateCopy.ts` — existing copy is good
- Any new components or abstractions

## Visual Reference

- `cta-current-vs-options.html` — side-by-side comparison of the current card, Option A (chosen), and Option B
