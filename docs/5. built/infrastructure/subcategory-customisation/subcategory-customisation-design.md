---
feature: subcategory-customisation
status: approved
creation_date: 2026-04-05
status: implemented
implemented_date: 2026-07-05
---

# Subcategory Customisation — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

Households currently receive a fixed set of default subcategories when created (e.g. Housing, Utilities, Salary, Food, etc.) with no ability to customise them. Users with different financial structures — freelancers, retirees, families with unique spending patterns — are forced into categories that may not reflect how they think about their money. The waterfall model is most effective when subcategories match the user's mental model of their finances.

## Approved Approach

Add a new "Subcategories" section to the Settings page with an always-editable inline list. The section uses three tier tabs (Income / Committed / Discretionary) to switch between tiers. Each tab shows the subcategories for that tier as a list of editable rows with drag handles for reordering, text inputs for renaming, and remove buttons for deletion. An "Add subcategory" button allows adding new ones up to the per-tier cap. Changes are saved explicitly via a "Save" button (not auto-saved per action).

Mandatory subcategories ("Other" in every tier, plus any locked subcategories like "Gifts" in discretionary) cannot be renamed or removed. "Other" is always pinned at the bottom of each tier's list.

When removing a subcategory that has items assigned to it, the user is prompted to choose a destination subcategory for those items before the removal proceeds. A "Reset to defaults" button restores the original default set, with the same per-subcategory reassignment prompt for any custom subcategories that have items.

This approach was chosen over an inline edit mode on the tier pages because it cleanly separates "setup" (Settings) from "planning" (tier pages), avoids cluttering the tier page left panel, and follows the existing Settings page patterns.

## Key Decisions

| Decision                                  | Choice                                                         | Rationale                                                                     |
| ----------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Location                                  | Settings page, new "Subcategories" section                     | Separates setup from planning; follows existing Settings patterns             |
| Layout                                    | One section with three tier tabs                               | Keeps nav simple — one entry in the sidebar, tabs to switch tiers             |
| Editor style                              | Always-editable inline list                                    | No mode toggling — what you see is what you edit. Direct and calm             |
| Max subcategories per tier                | 7                                                              | Keeps left-panel tab list compact. Committed is already at max (7 defaults)   |
| Mandatory subcategories                   | "Other" (all tiers) + locked (e.g. "Gifts")                    | "Other" is the fallback bucket; locked subcategories serve specific app logic |
| "Other" position                          | Always pinned at bottom                                        | "Other" is the catch-all — logically last                                     |
| Name constraints                          | Unique within tier, max 24 characters                          | Prevents duplicates; 24 chars fits the 360px left panel without truncation    |
| Removal with items                        | Prompt to choose destination subcategory                       | Prevents silent data loss; keeps user in control                              |
| Reset to defaults                         | Confirmation modal with per-subcategory reassignment           | Same pattern as individual removal — consistent, no data loss                 |
| Save behaviour                            | Explicit save button, unsaved-changes warning on navigate-away | Lets users experiment freely before committing; prevents accidental loss      |
| Reorder mechanism                         | Drag handles on each row                                       | Standard pattern for sortable lists; "Other" excluded (pinned)                |
| Operations on non-mandatory subcategories | Rename + add + remove + reorder                                | Full control for the user                                                     |
| Capacity indicator                        | "N of 7 used" text above the list                              | Clear feedback on remaining capacity                                          |

## Out of Scope

- Editing subcategories inline on tier pages (decided against — Settings is the home)
- Per-member subcategory preferences (subcategories are household-level)
- Subcategory icons or colour customisation
- Subcategories for the Surplus tier (surplus has no subcategories)
- Changing which subcategories are mandatory/locked (app-level decision, not user-facing)
- Auto-save per action (explicit save was chosen)

## Visual Reference

- `subcategory-editor.html` — side-by-side comparison of always-editable (chosen) vs read-then-edit layouts
- `edit-mode-entry.html` — earlier exploration of tier-page edit triggers (approach was revised to Settings page)
