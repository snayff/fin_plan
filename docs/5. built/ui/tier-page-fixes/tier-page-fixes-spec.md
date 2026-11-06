---
feature: tier-page-fixes
design_doc: docs/4. planning/tier-page-fixes/tier-page-fixes-design.md
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Tier Page Fixes

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

A design review revealed multiple deviations between the tier pages (Income, Committed, Discretionary) and the approved design system and navigation-and-page-structure design. Fixing these brings every page into visual alignment, ensures ambient glows use a consistent standard, and corrects token values in the empty state and subcategory hover states.

## Description

This feature corrects six categories of deviation: (1) tier pages use a vertical stacked layout instead of the required `TwoPanelLayout`, (2) ambient glows across all pages are either missing or use the wrong shape/size/opacity, (3) empty state card tokens are incorrect, (4) subcategory hover uses a generic foreground tint instead of the tier colour, (5) tier pages lack the `data-page` attribute needed for CSS-driven ambient glows, and (6) the Overview page's existing glow is too diffuse. All fixes are frontend-only — no schema or API changes.

## User Stories

- As a user, I want tier pages to show the subcategory list and item area side by side so that I can scan subcategories and items simultaneously.
- As a user, I want each page to have a subtle ambient glow in its tier colour so that I feel oriented within the waterfall navigation.
- As a user, I want empty state cards to look polished and consistent so that they feel intentional rather than broken.

## Acceptance Criteria

> Specific, testable criteria that define done. Each criterion must be verifiable without reading the implementation.

### Layout

- [ ] Income, Committed, and Discretionary pages render using `TwoPanelLayout` — left panel (360px) for the subcategory list, right panel (fill) for the item area
- [ ] Surplus page layout is unchanged (keeps its bespoke implementation)

### Ambient Glows — New Standard

- [ ] All pages with `data-page` use the new glow standard: `::before` (primary, top-right) and `::after` (secondary, bottom-left), `position: fixed`, `pointer-events: none`, `z-index: 0`
- [ ] Glow shape is `radial-gradient(ellipse at [corner], [colour] 0%, transparent 25%)` — ellipse centred at corner, fading to transparent at 25%
- [ ] Primary glow uses `at 100% 0%` (top-right corner); secondary uses `at 0% 100%` (bottom-left corner)
- [ ] Overview glows: primary = `rgba(99,102,241, 0.09)` (Indigo 9%), secondary = `rgba(139,92,246, 0.05)` (Violet 5%)
- [ ] Income glows: primary = `rgba(14,165,233, 0.09)` (Blue 9%), secondary = `rgba(99,102,241, 0.05)` (Indigo 5%)
- [ ] Committed glows: primary = `rgba(99,102,241, 0.09)` (Indigo 9%), secondary = `rgba(168,85,247, 0.05)` (Purple 5%)
- [ ] Discretionary glows: primary = `rgba(168,85,247, 0.09)` (Purple 9%), secondary = `rgba(74,220,208, 0.05)` (Teal 5%)
- [ ] Surplus glows: primary = `rgba(74,220,208, 0.09)` (Teal 9%), secondary = `rgba(99,102,241, 0.05)` (Indigo 5%)
- [ ] Settings glow: primary only = `rgba(238,242,255, 0.04)` (Neutral 4%), no secondary
- [ ] Old glow rules for `wealth` and `planner` data-page values are removed
- [ ] Existing Overview glow (too diffuse, covers entire viewport) is replaced by the new corner-contained standard
- [ ] Inline glow `<div>` elements in `TierPage` and `SurplusPage` are removed — glows are CSS-only via `[data-page]`

### `data-page` Attribute

- [ ] Income page wrapper has `data-page="income"`
- [ ] Committed page wrapper has `data-page="committed"`
- [ ] Discretionary page wrapper has `data-page="discretionary"`
- [ ] Surplus page wrapper has `data-page="surplus"`
- [ ] Existing `data-page` attributes on Overview and Settings remain unchanged

### Empty State Card — Token Corrections

- [ ] `GhostedListEmpty` CTA card background: `linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.05) 100%)`
- [ ] `GhostedListEmpty` CTA card border: `1px solid rgba(99,102,241,0.1)`

### Subcategory Hover

- [ ] Unselected subcategory row hover background uses `bg-tier-{colour}/5` (tier colour at 5% opacity) instead of `bg-foreground/5`

### Navigation

- [ ] Help appears as the 9th nav item in the correct group position: `Goals · Gifts · Help ···· Settings`

## Open Questions

_None — all decisions resolved in the design doc._

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No schema changes — this is a frontend-only fix.

### API

No API changes — this is a frontend-only fix.

### Components

- **TierPage** — Wrap its content in `TwoPanelLayout` (left = `SubcategoryList`, right = `ItemArea`). Add `data-page` attribute to the page wrapper. Remove the inline glow `<div>`.
- **SubcategoryList** — Change unselected row hover from `hover:bg-foreground/5` to `hover:bg-tier-{colour}/5`, using the tier's Tailwind bg class from the config.
- **GhostedListEmpty** — Correct the CTA card gradient to `rgba(99,102,241,0.08)` start and `rgba(168,85,247,0.05)` end. Correct the border to `rgba(99,102,241,0.1)`.
- **SurplusPage** — Add `data-page="surplus"` attribute to the page wrapper. Remove the inline glow `<div>`.
- **Page ambient glow CSS** — Rewrite all `[data-page]` rules to use the new standard (ellipse at corner, 25% fade, 9%/5% opacity). Add rules for `income`, `committed`, `discretionary`, `surplus`. Remove old `wealth` and `planner` rules.

### Notes

- The Surplus page is excluded from the `TwoPanelLayout` migration — it keeps its bespoke layout. Only the `data-page` attribute and glow CSS changes apply to it.
- Help is already in the navigation as a 9th item in the correct position (`NAV_ITEMS_GROUP3`). This is already implemented — the acceptance criterion verifies it stays in place.
- The old `wealth` and `planner` glow CSS rules should be removed since those pages have been replaced by the new tier pages.
- Empty state card gradient values are being corrected from `0.07` → `0.08` start opacity to match the design system's callout gradient card spec.
- Glow pseudo-elements should use `inset: 0` (full viewport) since they are `position: fixed` — the `radial-gradient` fade at 25% handles containment. This replaces the old approach of sized/positioned boxes.
