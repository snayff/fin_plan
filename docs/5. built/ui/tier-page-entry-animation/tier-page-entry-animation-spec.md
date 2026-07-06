---
feature: tier-page-entry-animation
design_doc: docs/4. planning/tier-page-entry-animation/tier-page-entry-animation-design.md
creation_date: 2026-03-28
status: implemented
implemented_date: 2026-07-05
---

# Tier Page Entry Animation

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

When navigating to a tier page, subcategory rows currently appear instantly with no spatial context. A staggered entrance from the left communicates arrival into the tier — reinforcing the app's spatial model and making navigation feel intentional rather than abrupt.

## Description

On initial mount of any tier page (Income, Committed, Discretionary, Surplus), the subcategory rows in the left panel stagger in from the left. Each row slides horizontally from an offset position while fading in, with a 60ms delay between rows. The tier header and Total footer are static — only the data rows animate. The animation fires once per page visit and is disabled when `prefers-reduced-motion` is set.

## User Stories

- As a user, I want subcategory rows to animate in when I open a tier page so that the transition feels spatial and intentional.
- As a user with reduced motion preferences, I want the animation suppressed so that I'm not affected by motion I've opted out of.

## Acceptance Criteria

- [ ] On mount of any tier page, each subcategory row in the left panel animates in from `x: -22px` to `x: 0` combined with `opacity: 0` to `opacity: 1`
- [ ] Rows stagger with 60ms delay between each row; each row's animation lasts 200ms
- [ ] Easing is `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart)
- [ ] The tier header row does not animate — it is static on mount
- [ ] The Total footer row does not animate — it is static on mount
- [ ] The animation fires on page mount only — switching selected items within the tier does not re-trigger it
- [ ] When `prefers-reduced-motion` is active, rows appear at full opacity with no animation
- [ ] When the subcategory list is empty, nothing animates and no errors occur
- [ ] Animation is implemented using Framer Motion `variants` with `staggerChildren`, consistent with the existing `WaterfallLeftPanel` stagger pattern

## Open Questions

_(none)_

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

Not applicable — this is a pure frontend animation with no data model changes.

### API

Not applicable — no new backend operations required.

### Components

- **SubcategoryList** — add Framer Motion stagger to the subcategory row list. The container becomes a `motion` element with `staggerChildren: 0.06` and `delayChildren: 0`; each subcategory row becomes a `motion` element carrying the slide-from-left variant. Uses the existing `usePrefersReducedMotion` hook to pass `initial={false}` on the container when reduced motion is preferred, suppressing all animation.

### Notes

- The animation fires on component mount — React/Framer Motion's default behaviour handles this correctly when `AnimatePresence` is not needed (no exit animation required).
- `usePrefersReducedMotion` already exists at `src/utils/motion.ts` and is used by `WaterfallLeftPanel` — follow the same pattern.
- Only `transform` (`x`) and `opacity` are animated — GPU-accelerated properties only, per §4.8.
- The stagger is mount-only. If subcategories update mid-session (data refresh), rows must not re-animate.
