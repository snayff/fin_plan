---
feature: data-item-entries
status: approved
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Data Item Entries — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

The current data item rows on tier pages have several usability issues: the collapsed row shows only name and amount with a wide gap between them, making it hard to scan; type and category are hidden until expansion; the expanded and edit states lack clear visual distinction from surrounding rows; placeholder text is indistinguishable from data; and button ordering is inconsistent with the app's rightmost-is-affirmative convention.

## Approved Approach

Refine the three states of a data item (collapsed, expanded read-only, editing) with improved information density, clear visual hierarchy, and consistent interaction patterns.

### Collapsed Row — Two-line Layout

- **Top line (left):** Item name. **(Right):** Monthly amount (`£X/mo`).
- **Bottom line (left):** Type · Category (dimmed metadata). **(Right):** Yearly amount (`£X/yr`).
- Monthly amount is always on the top row, yearly always on the bottom row — position never changes.
- The amount the user entered (monthly or yearly) renders in bright text (`text-secondary`); the derived conversion renders in muted text (`text-muted`). This signals which number is "real" vs calculated.
- One-off items show a single amount with no conversion row.
- Staleness amber dot remains on the row. The "Xmo ago" text is removed from the collapsed row — it moves to the expanded view.

### Expanded Read-only State

- The selected/expanded row gets a highlight: ~8% tier colour background + 2px left border in tier colour (per design system §1.5 Selected state).
- The left border extends through the accordion content for visual continuity.
- Accordion content left-aligns with the item name (past the staleness dot column).
- Content is a single block (no internal dividers):
  - **Notes** — header label + value (italic when present, muted "No notes" when absent).
  - **Last Reviewed** (conditional, stale items only) — header label + amber date with dot and relative age.
- **Edit button** — right-aligned, vertically top-aligned with the notes section. Single button; "Still correct" does not appear here.

### Edit Form

- Form content left-aligns with the item name, consistent with the expanded read-only view.
- **Field labels** use the same uppercase style as the accordion headers (`10px`, uppercase, `letter-spacing: 0.07em`, `text-muted`).
- **Required fields** indicated by an asterisk after the label: `Name *`, `Amount *`.
- **Placeholder text** is clearly distinct from data: italic + very low opacity (`~0.18`). Filled values are upright at normal brightness (`~0.85`).
- **Button order (edit mode, left → right):** Cancel · [spacer] · Delete · Still correct ✓ · Save.
  - Cancel stays on the left as the escape hatch.
  - Save is rightmost (affirmative action, per ButtonPair design system rule).
  - "Still correct ✓" sits next to Save — it only appears in edit mode, not in the read-only expanded view.
  - Delete is a low-prominence text button, positioned between the spacer and confirm.
- **Button order (add mode):** Cancel · [spacer] · Save. No Delete or Still correct.

## Key Decisions

| Decision                  | Choice                                      | Rationale                                                                             |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Amount row order          | Monthly always top, yearly always bottom    | Consistent layout regardless of entered frequency — predictable scanning              |
| Amount emphasis           | Entered frequency = bright, derived = muted | User sees their "real" number prominently; the conversion is supplementary            |
| Staleness age in row      | Removed from collapsed row                  | Amber dot is sufficient signal; the detail moves to expanded view to reduce row noise |
| "Last Reviewed" label     | Changed from "Reviewed"                     | Clearer, more natural phrasing                                                        |
| Still correct button      | Edit form only, not read-only expanded      | Reduces accordion clutter; confirmation is an editing action                          |
| Edit button position      | Right-aligned in expanded accordion         | Follows the rightmost-is-primary convention                                           |
| Required field indication | Asterisk after label                        | Standard convention, minimal visual overhead                                          |
| Placeholder styling       | Italic + very low opacity                   | Clear distinction from actual data without additional UI elements                     |
| Notes placeholder text    | "Any details worth remembering"             | Descriptive without saying "optional"                                                 |
| No divider in accordion   | Notes and Last Reviewed flow as one block   | Cleaner, calmer visual — they're related metadata, not separate sections              |

## Out of Scope

- Changes to the subcategory header or item area container
- Changes to the add item (ghost) button
- Changes to the confirmation dialog for delete
- Staleness threshold logic or review mechanics
- Mobile/responsive layout considerations

## Visual Reference

- `collapsed-row.html` — two-line row with monthly always top, smart amount emphasis
- `expanded-readonly.html` — selected highlight with notes + staleness accordion, stale and current variants
- `edit-form.html` — edit and add mode forms with revised button order and placeholder styling
