---
feature: tier-content-max-width
design_doc: docs/4. planning/tier-content-max-width/tier-content-max-width-design.md
creation_date: 2026-03-29
status: implemented
implemented_date: 2026-07-05
---

# Tier Content Max-Width

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

On wide viewports the `ItemArea` right panel stretches to fill all available space after the sidebar, creating an unbounded gap between item names (left-aligned) and amounts (right-aligned). This makes rows hard to scan and visually disconnected. Capping the content column width restores comfortable reading density without affecting the panel background or ambient glow.

## Description

The outer content container of `ItemArea` is constrained to a maximum width of 768px (`max-w-3xl`). The right panel shell continues to fill the full viewport — only the column holding the category header row and item list is capped. This is a left-aligned constraint: no centering, no new breakpoints, no layout restructuring. All four tier pages (Income, Committed, Discretionary, Surplus) benefit automatically because they all render `ItemArea`.

## User Stories

- As a user on a wide viewport, I want item names and amounts to remain close together so that I can scan rows without my eye travelling across an empty gap.
- As a user on a standard viewport (~1024px), I want the content to fill naturally so that the layout doesn't feel artificially narrow.

## Acceptance Criteria

- [ ] On viewports ≥ 1400px, the `ItemArea` content column stops growing at approximately 768px — the right portion of the panel is empty canvas
- [ ] The category header row (subcategory name, item count, total, + Add button) and the item list beneath it are both constrained within the same 768px column
- [ ] The right panel background (full viewport width) and any ambient glow are unaffected
- [ ] At narrower viewports (~1024px), the content fills its available space naturally — no overflow, no horizontal scroll
- [ ] No visible change on viewports below ~800px
- [ ] All four tier pages (Income, Committed, Discretionary, Surplus) reflect the constraint without individual modification
- [ ] Loading skeleton in `ItemArea` is also constrained within the same column

## Open Questions

None — the design is fully specified.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No schema changes. This is a frontend-only change.

### API

No API changes.

### Components

- **ItemArea (update)** — the outermost `div` in the returned JSX gains a `max-w-3xl` constraint. The existing `flex flex-col h-full` layout is preserved. No child components require modification.

### Notes

- The constraint applies to the content column only — the parent right-panel shell (rendered by `TwoPanelLayout` or the tier page) continues to fill the remaining viewport width.
- The loading skeleton returned early from `ItemArea` is a separate `div` that should carry the same constraint to prevent a layout shift between loading and loaded states.
- `ItemRow`, `ItemAccordion`, `ItemForm`, `TwoPanelLayout`, `TierPage`, and `SubcategoryList` require no changes.
- The `max-w-3xl` Tailwind utility maps to `max-width: 48rem` (768px) — no custom token needed.
