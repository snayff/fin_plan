---
feature: universal-search
status: approved
creation_date: 2026-04-19
status: implemented
implemented_date: 2026-07-05
---

# Universal Search — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

finplan has no cross-app search today — only a local filter inside the Help sidebar. As households add more income sources, committed bills, discretionary items, assets, accounts, gifts and goals, users need a fast way to locate and jump to a specific item without navigating to the right tier page first. A universal search doubles as a launcher (jump to any page) and a finder (locate any named entity), serving both roles from the same surface.

## Approved Approach

A keyboard-first universal search living in the top-bar chrome. A small Lucide `Search` icon sits between the nav links and the household switcher; it opens on click or via `Ctrl+K` / `⌘K`.

On open, the icon **morphs into a full-width search input that covers the nav links in the header row**. Input and results render as a single continuous card — results flow directly below the input with no visual break. The rest of the page is dimmed behind a scrim. `Escape` or click-outside closes; the nav is restored.

Empty state shows the 3 most recent palette selections under a "Recent" label — persisted in `localStorage`. Typed queries resolve three fixed-order categories: **Data → Help → Actions**, capped at 5 each, with empty categories hidden entirely.

- **Data** is backend-resolved: one Fastify endpoint (`GET /search?q=...`) does a household-scoped name-only case-insensitive match across 8 entity types (IncomeSource, CommittedItem, DiscretionaryItem, Asset, Account, GiftPerson, GiftEvent, PurchaseItem), returning a unified result list. Selection navigates to the entity's list page with a new `?focus=<id>` URL convention that scrolls the row into view and applies a brief pulse highlight.
- **Help** is client-side: reuses the existing `HelpSidebar` match logic verbatim. Selection uses the existing `/help?entry=<id>` URL.
- **Actions** is a static client-side list of 12 nav shortcuts and 8 "Add X" create shortcuts. Create shortcuts navigate to the entity's list page with a `?add=1` URL param that auto-opens the existing add modal.

Implementation reuses two already-installed but unused libraries: **`cmdk`** (keyboard/filter primitives) and **Radix `Dialog`** (overlay, scrim, focus trap). No new UI primitives are invented; all colours and borders flow through existing design tokens.

**Why this shape, not a centred modal popup:** a centred Cmd-K-style dialog feels detached from the trigger position. Expanding the input into the header in-place keeps the search as part of the page chrome rather than an overlay on top of it, which is consistent with finplan's "UI element, not modal popup" direction.

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Trigger surface | Small icon button in the top header, right of nav links, left of household switcher | Groups with utility chrome; doesn't compete with nav; tooltip teaches the keyboard shortcut passively |
| Open behaviour | Icon expands into a full-width input covering the nav row; results drop below as one continuous surface | Not a modal popup; feels integrated into page chrome; matches user's stated preference (re: Spotify-style reference) |
| Keyboard shortcut | `Ctrl+K` / `⌘K` to open, `Escape` to close | Standard, free (audit confirmed no existing binding) |
| Data entities indexed | IncomeSource, CommittedItem, DiscretionaryItem, Asset, Account, GiftPerson, GiftEvent, PurchaseItem | All current user-facing entities except Snapshot and Member (low search value). Includes PurchaseItem even though `/goals` is a placeholder today — it will improve when Goals ships |
| Data match algorithm v1 | Name only, case-insensitive substring | Predictable, minimal false positives, matches command-palette convention. Explicit follow-up to expand to notes + subcategory post-v1 |
| Data-result navigation | `?focus=<id>` URL param; list page scrolls to item and pulse-highlights | Establishes a new but useful URL convention; parallels the `?add=1` convention for create shortcuts |
| Help match algorithm | Reuse `HelpSidebar` logic verbatim (case-insensitive contains over multiple fields) | Consistency with existing behaviour; no duplicated matching rule |
| Help-result navigation | Existing `/help?entry=<id>` | Already implemented; zero work |
| Actions scope | 12 nav actions + 8 create actions | Covers launcher role and quick-add workflow in v1 |
| Create-action mechanism | Navigate to list page with `?add=1`; page auto-opens existing add modal | Reuses each page's proven add UX; small, consistent integration per page |
| Result categories and order | Data → Help → Actions, always in that order | Most-frequent-use category first; matches user mental model of "find my thing, then find help, then find where to go" |
| Per-category cap | 5 results per category (5 per entity type within Data) | Predictable size; mirrors Raycast/Linear conventions |
| Empty-category rendering | Hide the category header entirely | Less noise; cleaner visual |
| Empty state (no query) | 3 most recent palette selections, labeled "Recent" | Useful without requiring typing; no external tracking needed — just the user's own palette history |
| Recents definition | Last 3 items selected *from* the palette (any category) | Self-reinforcing loop; no external tracking |
| Debounce | 150ms | Consistent with `HelpSidebar` |
| Backend shape | Single `/search?q=...` endpoint returning unified Data results | Avoids 8 parallel requests; household-scoped via `authMiddleware` and `req.householdId` |
| Libraries | `cmdk` + Radix `Dialog` (both already installed) | Reuse, don't rebuild |
| Icons | Lucide, never emoji | Matches design system |

## Out of Scope

- **Mobile entry point** — v1 is desktop-only. Mobile will need its own design pass (full-screen search sheet vs. slide-down vs. something else). Explicit follow-up.
- **Expanding Data match to `notes` and subcategory** — planned follow-up after v1 ships, informed by usage.
- **Fuzzy matching / typo tolerance** — overkill for v1; substring is predictable enough.
- **Cross-household search** — palette only surfaces items in the active household, per the app's standard scoping rule. No "search across all my households" affordance.
- **Snapshot and Member entities** — low search value; explicitly excluded.
- **"Show more" / overflow UI per category** — hard cap at 5; users refine their query instead.
- **Parameterised command-palette actions** — e.g. "Switch to household X", "Toggle theme", etc. Only simple navigation and create shortcuts in v1.

## Visual Reference

Mockups copied from the visual companion session into `./mockups/`. These are the canonical visual references for the final design direction (position R, open-behaviour F).

- `open-behaviour-final.html` — the approved "expand over nav" open state (F), with results dropping from the input as one continuous surface. Compared against the rejected "anchored drop" alternative.
- `trigger-and-overlay.html` — shows the resting icon, the hover tooltip teaching the shortcut, and the open state. Note: the "open" panel in this mockup depicts the earlier anchored variant; the final open behaviour is `open-behaviour-final.html`.
- `position-final.html` — confirms icon position R (right of nav, left of household switcher), vs. the rejected L (right of brand).
