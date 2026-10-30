---
feature: settings-page-enhancements
status: approved
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Settings Page Enhancements — Design

> **Purpose:** Streamline the settings page by removing sections that are no longer user-configurable or needed, simplifying the ISA section, and adding scroll-spy sidebar highlighting for better navigation.

## Problem

The settings page exposes controls that shouldn't be user-configurable (ISA year start month/day — these are system-level UK tax year values) and contains sections for features being removed from the current scope (snapshots, ended income sources, waterfall rebuild). Additionally, the sidebar navigation doesn't indicate which section the user is currently viewing, making orientation harder on a long scrollable page.

## Approved Approach

Three changes applied together:

1. **Simplify ISA section** — Remove the month and day fields, keeping only the annual limit input with its Save button. The ISA year start date (6 April) is a UK system constant, not a user preference.

2. **Remove three sections** — Delete Snapshots, Ended Income Sources, and Waterfall Rebuild from both the sidebar navigation and the content area. Delete their component files entirely. This leaves 6 sections: Profile, Staleness thresholds, Surplus benchmark, ISA settings, Household, Trust accounts.

3. **Scroll-spy sidebar highlighting** — Use an `IntersectionObserver` on the content scroll container to track which section is currently in view. The corresponding sidebar button receives a persistent `bg-accent text-accent-foreground` highlight. When multiple sections are visible, the topmost one wins.

This approach was chosen because it's the simplest path: direct removals with no migration concerns, and IntersectionObserver is the standard browser API for scroll-spy without pulling in a library.

## Key Decisions

| Decision              | Choice                                           | Rationale                                                                                        |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| ISA save pattern      | Keep explicit Save button                        | Consistency with all other settings sections (Profile, Staleness, Surplus)                       |
| Removed section files | Delete entirely, don't keep empty shells         | No plan to reintroduce; avoids dead code                                                         |
| Scroll-spy mechanism  | IntersectionObserver with ~0.3 threshold         | Native API, no dependency; threshold ensures section is meaningfully visible before highlighting |
| Observer root         | Content scroll container (`overflow-y-auto` div) | Page uses internal scroll, not viewport scroll                                                   |
| Active button styling | `bg-accent text-accent-foreground`               | Matches existing hover token; persistent highlight vs hover-only                                 |
| Backend ISA fields    | Leave in schema, just not exposed in UI          | Avoids unnecessary migration; fields may still be used server-side                               |

## Out of Scope

- Backend schema changes to ISA month/day fields
- Relocating snapshot/ended-income/rebuild functionality elsewhere
- Changing the save pattern across settings sections (e.g. auto-save)
- Mobile/responsive layout changes
