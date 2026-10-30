---
feature: data-item-entries
design_doc: docs/4. planning/data-item-entries/data-item-entries-design.md
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Data Item Entries

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Data item rows are the primary unit of interaction on tier pages. Users scan them to understand their financial plan and expand them to review or edit values. The current rows show too little at a glance, lack clear visual feedback for the selected state, and have inconsistent button ordering. This refinement improves information density, visual hierarchy, and interaction consistency so that scanning and editing feel faster and calmer.

## Description

Reworks the three states of a data item on tier pages: collapsed row, expanded read-only accordion, and edit form. The collapsed row becomes a two-line layout showing type, category, and both monthly/yearly amounts. The expanded state gets a tier-colour highlight and shows notes and staleness detail. The edit form gets revised button ordering, required-field indication, and distinct placeholder styling.

## User Stories

- As a user scanning my tier page, I want to see each item's type, category, and both monthly and yearly amounts without expanding, so that I can quickly understand my plan.
- As a user, I want to immediately see which amount I entered versus which was calculated, so that I know which number is "mine."
- As a user, I want the expanded item to be visually distinct from other rows, so that I always know what I'm interacting with.
- As a user expanding an item, I want to see its notes and review status without entering edit mode, so that I can decide whether an edit is needed.
- As a user editing an item, I want the save button in the rightmost position and required fields clearly marked, so that the form feels predictable and I know what's mandatory.
- As a user, I want placeholder text to look obviously different from real data, so that I never mistake an empty field for a filled one.

## Acceptance Criteria

### Collapsed Row

- [ ] Each row displays two lines: top line has item name (left) and monthly amount with `/mo` suffix (right); bottom line has type · category metadata (left) and yearly amount with `/yr` suffix (right)
- [ ] Monthly amount is always on the top row, yearly always on the bottom — position never varies by spend type
- [ ] The amount matching the item's entered frequency (`spendType`) renders in bright text (`text-secondary` / ~0.7 opacity); the derived conversion renders in muted text (`text-muted` / ~0.3 opacity, smaller font)
- [ ] One-off items show a single amount on the top row with no yearly conversion
- [ ] Staleness amber dot remains visible on the row; the "Xmo ago" text label is removed from the collapsed row
- [ ] Type label displays the human-readable spend type: "Monthly", "Yearly", or "One-off"
- [ ] Category label displays the item's subcategory name

### Expanded Read-only State

- [ ] The expanded row receives a selected highlight: ~8% tier colour background + 2px left border in tier colour
- [ ] The left border extends through the accordion content below the row
- [ ] Accordion content left-aligns with the item name (past the staleness dot column)
- [ ] Accordion displays a "Notes" section with an uppercase label header; value is italic when present, muted "No notes" when absent
- [ ] For stale items only: a "Last Reviewed" section appears below notes (no divider between them) with an uppercase label header, amber dot, formatted date (e.g. "Jan 2025"), and relative age (e.g. "14 months ago")
- [ ] For current (non-stale) items: the "Last Reviewed" section is not shown
- [ ] An Edit button is right-aligned, vertically top-aligned with the notes section
- [ ] "Still correct ✓" does not appear in the read-only expanded state

### Edit Form

- [ ] Form content left-aligns with the item name, consistent with the expanded read-only view
- [ ] The selected highlight (tier colour background + left border) continues through the form
- [ ] Field labels use uppercase style matching accordion headers: `10px`, uppercase, `letter-spacing: 0.07em`, `text-muted`
- [ ] Required fields (Name, Amount) show an asterisk after the label
- [ ] Placeholder text is styled italic at ~0.18 opacity, clearly distinct from filled values at ~0.85 opacity
- [ ] Notes placeholder reads "Any details worth remembering" (not "Notes (optional)")
- [ ] Name placeholder reads "e.g. Netflix, Council Tax"
- [ ] Amount placeholder reads "0.00"
- [ ] Button order in edit mode (left → right): Cancel · [spacer] · Delete · Still correct ✓ · Save
- [ ] "Still correct ✓" only appears when the item is stale
- [ ] Save is always the rightmost button
- [ ] Cancel is always the leftmost button
- [ ] Delete is a low-prominence text button (no background, muted text, hover reveals red)
- [ ] Button order in add mode (left → right): Cancel · [spacer] · Save (no Delete or Still correct)

## Open Questions

- ~~Should "Still correct ✓" appear in edit mode for all items or only stale items?~~ **Conditional on staleness** — only appears when the item is stale.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No schema changes. This feature is purely a frontend presentation and interaction refinement. The existing waterfall item entities (with `name`, `amount`, `spendType`, `subcategoryId`, `notes`, `lastReviewedAt`) already contain all necessary fields.

### API

No API changes. The existing CRUD, confirm, and waterfall summary endpoints provide all the data needed. The monthly/yearly conversion is computed client-side from `amount` and `spendType`.

### Components

- **ItemRow** — Reworked to a two-line layout. Top line: name + monthly amount. Bottom line: type · category + yearly amount. Amount emphasis (bright vs muted) driven by `spendType`. Accepts `isExpanded` to apply the selected highlight (tier colour bg + left border). Staleness dot retained; staleness age text removed.

- **ItemAccordion** — Reworked read-only expanded content. Shows Notes section (with header label) and conditional Last Reviewed section (stale items only, with amber styling). Edit button right-aligned. "Still correct" removed from this component.

- **ItemForm** — Reworked edit/add form. Field labels use uppercase header style with asterisk on required fields. Placeholder text styled italic at low opacity. Button order revised: Cancel (left) → Delete → Still correct ✓ → Save (right) in edit mode; Cancel → Save in add mode. "Still correct" conditional on staleness. Form receives the selected highlight (tier colour bg + left border) for visual continuity.

### Notes

- **Monthly/yearly conversion**: for monthly items, yearly = amount × 12; for yearly items, monthly = amount ÷ 12 (rounded to 2 decimal places). One-off items show a single amount with no suffix.
- **Amount suffixes**: monthly amounts display `/mo`, yearly amounts display `/yr`. These are part of the formatted display, not stored data.
- **Left-alignment**: the accordion content and form content must align their left edge with the item name text in the collapsed row. This means accounting for the staleness dot column width (8px) + gap when calculating padding.
- **Highlight continuity**: the 2px left border and ~8% tier colour background must extend seamlessly from the selected row through the accordion or form content. There should be no visual break between the row highlight and the expanded content.
- **Placeholder styling**: requires a global or scoped CSS rule for placeholder pseudo-elements (`::placeholder`) — italic, ~0.18 foreground opacity. This should be applied consistently across all form inputs in the tier item form.
- **Design system compliance**: the selected state follows §1.5 Interactive States (Selected: ~14% tier/accent colour opacity background + left border). The design uses ~8% as agreed in the design review — this is a documented exception for data item rows where the full 14% felt too heavy in context.
