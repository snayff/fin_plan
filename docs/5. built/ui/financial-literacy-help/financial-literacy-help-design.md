---
feature: financial-literacy-help
status: approved
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Financial Literacy Help System — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

Users encounter financial terminology and finplan-specific concepts throughout the app with only basic tooltips for support. There is no way to explore, learn, or build understanding of either the financial concepts or how finplan uses them. The existing tooltip system is limited to single-sentence definitions that disappear on mouse-out, with no links, examples, or deeper explanation.

## Approved Approach

A three-tier help system combining contextual in-situ help with a dedicated Help page:

### 1. Contextual help (in-situ)

Glossary terms throughout the app are marked with a **subtle dotted underline** (no colour change) and trigger **interactive popovers** on hover. These popovers stay open when the user mouses into them, allowing clicks on links to related concepts. Popovers show the full glossary entry (1–2 sentences plus links to related concepts). Terms are marked selectively — in body text and descriptions only, not in headings or labels. The same dotted-underline treatment is used consistently inside the help system itself.

### 2. Central Help page

A dedicated Help page accessible via a **"Help" nav bar link** (top-level, alongside Overview, Planner, Wealth, Settings). The page uses a **sidebar navigation layout** (two-panel pattern matching the existing app), with:

- **Single search box** at the top of the sidebar, filtering across both glossary and concepts in real time
- **Glossary section** — alphabetical flat list of terms
- **Concepts section** — alphabetical list of concept explainers, separated from glossary by a subtle horizontal divider
- **User Manual section** — stubbed (greyed out, "Coming soon"), separated by a divider. To be tackled as a separate feature.

### 3. Content structure

**Glossary entries:** 1–2 sentence definition with links to related concepts. Shown in full in both the tooltip popover and the Help page detail view (no truncation).

**Concept entries:**

- Title
- Plain-language summary with a concrete example (always included)
- Visual explainer (diagram, annotated example, or interactive widget — varies per concept, e.g. compound interest calculator)
- "Why it matters in finplan" — connecting the financial concept to how it's used in the app

Concept pages include a **"See this in finplan"** link that deep-links to the relevant app page (e.g. "The Waterfall" → Overview).

### Navigation model

- **App → Help:** tooltip popover "Learn more" links navigate to the Help page with the relevant concept selected. Full page navigation (not an overlay) — browser back returns to the previous page.
- **Help → App:** "See this in finplan" links on concept pages deep-link to the relevant app page.
- **No keyboard shortcuts.** No contextual "?" icons per page.

This approach was chosen over a tooltip-only system (option A) because the existing tooltip pattern cannot support visual explainers, interactive elements, or the depth needed for genuine financial literacy education. It was chosen over a card-grid hub (option C) because the sidebar layout mirrors finplan's existing two-panel pattern and supports seamless cross-referencing between glossary terms and concepts.

## Key Decisions

| Decision                   | Choice                                                       | Rationale                                                                                                                          |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Glossary term marker style | Dotted underline, no colour change                           | Calmest option — discoverable without competing for attention. Aligns with "silence is approval" principle.                        |
| Term marker placement      | Body text and descriptions only, not headings/labels         | Headings are already understood by context; marking them would add noise.                                                          |
| Tooltip behaviour          | Interactive popovers (hoverable, clickable links)            | Users need to click "Learn more" links inside tooltips — standard disappear-on-leave tooltips won't work.                          |
| Tooltip content            | Full glossary entry (1–2 sentences + concept links)          | Entries are short enough to show in full; truncation adds no value.                                                                |
| Help page layout           | Sidebar navigation (two-panel)                               | Matches existing app pattern; supports seamless glossary↔concept cross-referencing without tab-switching friction.                 |
| Sidebar organisation       | Alphabetical within each section (glossary, concepts)        | Simple, predictable, scannable. No grouping by theme or waterfall tier.                                                            |
| Search                     | Single search box at top of sidebar, filtering both sections | One search, one result set. Simpler than per-section search or a separate global bar.                                              |
| Content source of truth    | Hardcoded in frontend TypeScript/JSON files                  | Simple, versioned with code, no backend needed. `definitions.md` remains a design reference doc only — not mixed into app content. |
| Help → App links           | "See this in finplan" on concept pages                       | Connects educational content to the live app. Must be maintained as app structure evolves.                                         |
| Navigation to Help page    | Nav bar link only                                            | Simple, consistent. Tooltip "Learn more" links provide the contextual bridge — no need for per-page "?" icons.                     |
| Navigation from tooltips   | Full page navigation (browser back returns)                  | No overlay/drawer complexity. Simple mental model.                                                                                 |
| Authentication             | Authenticated only                                           | Help is part of the app, not a public resource.                                                                                    |
| Design standard update     | Principle 6 updated to support Help page                     | Contextual tooltips remain the primary mechanism; dedicated Help page now also supported as the new standard.                      |

## Out of Scope

- User Manual content — stubbed in the sidebar, to be designed and built as a separate feature
- Public/unauthenticated access to help content
- Keyboard shortcuts for help access
- Contextual "?" icons per page
- Backend storage or admin interface for content management
- Mobile-specific help patterns

## Maintenance

The `/write-plan` skill must check help content when a feature touches glossary terms, concepts, or page structure — scoped to content changed by that feature only. This ensures "See this in finplan" links and glossary entries stay in sync as the app evolves.

## Visual Reference

- `glossary-term-markers.html` — four marker style options (A selected: dotted underline only) with tooltip preview
- `help-page-layout.html` — three page structure options (B selected: sidebar navigation)
- `concept-detail-v2.html` — full concept detail view with sidebar, showing "The Waterfall" example with dividers between sections
- `help-navigation.html` — two navigation options (A selected: nav bar link only)
