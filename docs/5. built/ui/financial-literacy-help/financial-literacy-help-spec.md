---
feature: financial-literacy-help
design_doc: docs/4. planning/financial-literacy-help/financial-literacy-help-design.md
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Financial Literacy Help System

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Financial terminology creates friction. Users encounter terms like "amortised", "net worth", and "ISA allowance" throughout finplan with only single-sentence tooltips for support. There is no way to explore, learn, or build genuine understanding of either the financial concepts or how finplan uses them. This feature delivers a three-tier help system — interactive contextual popovers, a searchable Help page with glossary and concept explainers — so users can build financial literacy without leaving the app.

## Description

Replaces static tooltips with interactive popovers on glossary terms (dotted underline markers in body text), adds a dedicated Help page accessible via a top-level nav bar link, and populates it with all glossary entries from `definitions.md` plus five concept explainers (The Waterfall, Amortisation, Net Worth, ISA Allowances, Compound Interest & Projections). The Help page uses a sidebar navigation layout with a unified search box filtering across glossary terms and concepts. Concept pages include plain-language summaries, concrete examples, visual explainers, and "See this in finplan" deep links. All content is hardcoded in frontend TypeScript/JSON — no backend required.

## User Stories

- As a user, I want to hover over a financial term and see an interactive popover with its definition and links to related concepts so that I can understand terminology in context without navigating away.
- As a user, I want to click "Learn more" in a popover to navigate to the Help page with that concept selected so that I can explore a topic in depth.
- As a user, I want a dedicated Help page where I can browse all glossary terms and concept explainers so that I can build my financial understanding at my own pace.
- As a user, I want to search across glossary and concepts from a single search box so that I can quickly find information on any term or topic.
- As a user, I want concept pages to include visual explainers and concrete examples so that abstract financial ideas become tangible.
- As a user, I want concept pages to show "Why it matters in finplan" and a "See this in finplan" link so that I can connect what I'm learning to how the app works.
- As a user, I want the Help page to feel like a natural part of the app — same layout patterns, same design language — so that it doesn't feel like a bolt-on afterthought.

## Acceptance Criteria

### Contextual Popovers (in-situ)

- [ ] Glossary terms in body text and descriptions are marked with a subtle dotted underline (`1px dotted`, `text-secondary` opacity) — no colour change from surrounding text
- [ ] Dotted underlines appear in body text and descriptions only — never in headings, labels, nav items, or form fields
- [ ] Each marked term is applied once per visible section — not every occurrence on the page
- [ ] Hovering a marked term opens an interactive popover after a short delay (150ms)
- [ ] The popover remains open while the cursor is inside the popover or on the trigger term (interactive hover zone)
- [ ] The popover closes when the cursor leaves both the trigger term and the popover, after a short grace period (300ms)
- [ ] Popover content shows the full glossary entry (1–2 sentences) — no truncation
- [ ] Popover shows links to related concepts (if any) as clickable text links
- [ ] Popover includes a "Learn more" link that navigates to the Help page with the relevant entry selected
- [ ] Popovers are keyboard-accessible: focusable trigger, Enter/Space opens, Escape closes, Tab moves into popover content
- [ ] Popover uses `surface-elevated` background, `radius` border-radius, `z-index: 70` (tooltip layer)
- [ ] Popover appears below the trigger term by default; repositions above if insufficient viewport space below
- [ ] Only one popover is open at a time — opening a new one closes the previous
- [ ] Popover entrance: fade-in 150ms `ease-out-quart`; exit: fade-out 100ms `ease-in`. Respects `prefers-reduced-motion`.

### Help Page — Navigation & Layout

- [ ] Help page accessible at `/help` route, JWT-protected
- [ ] "Help" appears as a top-level nav bar link — positioned in the third nav group (after Surplus separator), before Settings
- [ ] Nav order becomes: `[Overview] | [Income · Committed · Discretionary · Surplus] | [Goals · Gifts · Help ···· Settings]`
- [ ] "Help" nav item uses default muted text colour (no tier colour), same treatment as Goals and Gifts
- [ ] Help page uses two-panel sidebar layout: left panel (360px fixed) = navigation sidebar, right panel = content area
- [ ] Help page uses `page-accent` for interactive states and ambient glow (same as Overview)
- [ ] `/help` is added to the authenticated route set alongside existing pages

### Help Page — Sidebar

- [ ] Search box at the top of the sidebar — single input, filters across both glossary and concepts in real time
- [ ] Search filters by term/concept name and content body (case-insensitive substring match)
- [ ] When search is active, both sections show only matching entries; sections with no matches are hidden entirely
- [ ] When search is cleared, full sidebar is restored
- [ ] Below search: "Glossary" section heading followed by an alphabetical flat list of all glossary terms
- [ ] Subtle horizontal divider (`border` token) between Glossary and Concepts sections
- [ ] "Concepts" section heading followed by an alphabetical flat list of concept explainer titles
- [ ] Subtle horizontal divider after Concepts section
- [ ] "User Manual" section heading, greyed out with "Coming soon" label — not clickable
- [ ] Clicking a glossary term or concept title in the sidebar selects it and shows its content in the right panel
- [ ] Selected state: `~14% page-accent` background + left border in `page-accent` colour
- [ ] First glossary entry is selected by default on page load (unless arriving via a popover "Learn more" link with a specific entry pre-selected)

### Help Page — Glossary Detail View (right panel)

- [ ] Shows the glossary term as a heading (`font-heading`, weight 700)
- [ ] Full definition text below (1–2 sentences, `font-body`)
- [ ] "Related concepts" section listing linked concepts as clickable links — clicking navigates within the Help page (selects the linked concept in the sidebar)
- [ ] Related glossary terms within the definition text are marked with the same dotted-underline treatment and trigger popovers — consistent with the in-app experience
- [ ] "Appears in" metadata line showing where the term surfaces in the app (e.g. "Overview waterfall, Review Wizard") — `text-tertiary`, `font-body` 12px

### Help Page — Concept Detail View (right panel)

- [ ] Shows the concept title as a heading (`font-heading`, weight 700)
- [ ] Plain-language summary paragraph with a concrete example (always included)
- [ ] Visual explainer section — varies per concept: static diagram, annotated example, or interactive widget
- [ ] "Why it matters in finplan" section — connects the financial concept to how finplan uses it (1–2 paragraphs)
- [ ] "See this in finplan" link that deep-links to the relevant app page — uses a callout-style treatment (not a plain text link). Only shown when a target page exists; omitted entirely otherwise.
- [ ] Glossary terms within concept text are marked with dotted-underline popovers — consistent treatment throughout
- [ ] Subtle horizontal dividers between concept sections (summary, visual, why it matters, and optionally see this in finplan)

### Content — Initial Glossary (17 entries from definitions.md)

- [ ] All terms from `definitions.md` are included as glossary entries: Waterfall, Committed Spend, Discretionary Spend, Surplus, Net Income, One-Off Income, Annual Income, Amortised (÷12), ISA, ISA Allowance, Tax Year, Equity Value, Liquidity, Net Worth, Snapshot, Held on Behalf Of, Projection
- [ ] Each entry uses the canonical tooltip text from `definitions.md` as its definition — verbatim
- [ ] Each entry includes relevant "Related concepts" links (e.g. Committed Spend → The Waterfall concept; ISA → ISA Allowances concept)

### Content — Initial Concepts (5 explainers)

- [ ] **The Waterfall** — explains income → committed → discretionary → surplus cascade. Visual: annotated waterfall diagram showing the four tiers with example values and flow arrows. "See this in finplan" → `/overview`
- [ ] **Amortisation (÷12)** — explains why annual costs are spread across 12 months. Visual: side-by-side comparison showing a £1,200 yearly bill as £100/mo in the waterfall. "See this in finplan" → `/committed`
- [ ] **Net Worth** — explains assets minus liabilities. Visual: stacked bar showing assets vs liabilities with equity highlighted. No "See this in finplan" link until Wealth page is built.
- [ ] **ISA Allowances** — explains the UK ISA system, annual limits, and tax year reset. Visual: progress bar showing contributions against the £20,000 limit with a tax year deadline. No "See this in finplan" link until Wealth page is built.
- [ ] **Compound Interest & Projections** — explains how compound interest works and how finplan projects savings growth. Visual: interactive widget — user inputs a starting balance, monthly contribution, and interest rate; sees projected growth over 1/5/10 years. No "See this in finplan" link until Wealth page is built.
- [ ] Each concept includes a "Why it matters in finplan" section connecting the concept to specific app behaviour
- [ ] Concepts without a "See this in finplan" link simply omit the link section entirely — no placeholder or disabled state

### Content Source of Truth

- [ ] All glossary and concept content is hardcoded in frontend TypeScript/JSON files — no backend API, no database storage
- [ ] `definitions.md` remains a design reference document only — not imported or parsed at runtime
- [ ] Content files are structured for easy maintenance: one object per entry with `id`, `term`/`title`, `definition`/`summary`, `relatedConcepts`, `appearsIn`, and (for concepts) optional `seeThisInFinplan` route — omitted when no target page exists yet
- [ ] Content is versioned with the frontend code

### Search

- [ ] Search input: standard form input with `surface-elevated` background, search icon (left), clear button (right, visible when input has text)
- [ ] Results update as the user types (debounced at 150ms)
- [ ] No results state: "No results for '[query]'" in `text-tertiary` centred in the sidebar area
- [ ] Search matches against: term/concept name (weighted higher) and definition/summary body text

### Empty & Loading States

- [ ] Help page shows `SkeletonLoader` in the right panel during initial content render (sidebar-shaped blocks in left panel, content blocks in right)
- [ ] All shimmer animations respect `prefers-reduced-motion`

### Navigation Model

- [ ] **App → Help (via popover):** clicking "Learn more" in a popover navigates to `/help?entry=<entry-id>` — the Help page opens with the relevant entry pre-selected in the sidebar and scrolled into view
- [ ] **App → Help (via nav):** clicking "Help" in the nav bar navigates to `/help` with the default selection (first glossary entry)
- [ ] **Help → App:** "See this in finplan" links navigate to the target app page (e.g. `/overview`, `/committed`)
- [ ] **Within Help:** clicking related concept links or glossary term links in content updates the sidebar selection and right panel content — no full page navigation, just panel update
- [ ] Browser back/forward works correctly for all Help page navigation (history entries for entry selection changes)
- [ ] No keyboard shortcuts for help access
- [ ] No contextual "?" icons per page

## Open Questions

_None — all design decisions resolved during requirement refinement._

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No database entities required. All content is frontend-only.

- **GlossaryEntry**: a content record with id, term (display name), definition (1–2 sentences, verbatim from `definitions.md`), related concept ids, appears-in locations, and related glossary term ids. Hardcoded in a frontend TypeScript/JSON file.

- **ConceptEntry**: a content record with id, title, summary (with concrete example), visual explainer type and configuration, "Why it matters in finplan" text, optional "See this in finplan" target route (omitted when no target page exists yet), and related glossary term ids. Hardcoded in a frontend TypeScript/JSON file.

- **Term marker registry**: a mapping from glossary term ids to the text patterns that should be marked with dotted underlines in app content. Used by the contextual popover system to identify and annotate terms in body text. Includes display variants (e.g. "Committed Spend" and "committed spend").

### API

No backend API required. All content is served from frontend static data.

- The Help page route (`/help`) must be added to the authenticated route set — JWT-protected, same as all other app pages.
- No new backend endpoints, no tRPC procedures, no database queries.

### Components

- **GlossaryTermMarker** — inline component that wraps a glossary term in body text with a dotted underline and attaches the popover trigger. Accepts a glossary entry id. Renders the term as a `<span>` with dotted underline styling. Does not alter the text colour.

- **GlossaryPopover** — the interactive popover shown on hover/focus of a GlossaryTermMarker. Displays the full definition, related concept links, and a "Learn more" link. Stays open while the cursor is in the hover zone. Manages open/close timing (150ms open delay, 300ms close grace period). Only one instance open at a time (singleton).

- **HelpPage** — the page shell at `/help`. Two-panel sidebar layout. Reads the `entry` query parameter to pre-select a specific entry on mount. Manages sidebar selection state and search filtering. Uses `page-accent` for interactive states and ambient glow.

- **HelpSidebar** — left panel of the Help page. Contains the search input, glossary section (alphabetical term list), concepts section (alphabetical concept list), and stubbed User Manual section. Handles search filtering, selection state, and scroll-into-view for pre-selected entries.

- **HelpSearchInput** — search box at the top of the sidebar. Debounced text input (150ms) that filters sidebar entries by name and content. Shows a clear button when input has text. Displays "No results" state when no matches found.

- **GlossaryDetailView** — right panel content when a glossary entry is selected. Shows the term heading, full definition (with glossary term markers for cross-references), related concepts as links, and "Appears in" metadata.

- **ConceptDetailView** — right panel content when a concept is selected. Shows the concept title, summary with example, visual explainer (varies per concept), "Why it matters in finplan" section, and "See this in finplan" link. Glossary terms in text are marked with dotted-underline popovers.

- **ConceptVisualExplainer** — container component that renders the appropriate visual for each concept. Dispatches to concept-specific visuals: waterfall diagram, amortisation comparison, net worth bar, ISA progress bar, or compound interest calculator widget.

- **CompoundInterestCalculator** — interactive widget for the Compound Interest & Projections concept. Inputs: starting balance, monthly contribution, interest rate. Outputs: projected growth over selectable time horizons (1, 5, 10 years). Uses `font-numeric` for all calculated values.

### Notes

- **Design system update required**: `design-system.md` § 4.6 currently states "No in-app glossary — contextual tooltips are the only explanation mechanism." This must be updated to reflect the new three-tier help system (contextual popovers + Help page with glossary and concepts). The design philosophy Principle 6 has already been updated.

- **Nav bar update**: the top nav gains a "Help" item in the third group. Nav order: `[Overview] | [Income · Committed · Discretionary · Surplus] | [Goals · Gifts · Help ···· Settings]`. The navigation-and-page-structure spec's acceptance criteria for nav items need updating to reflect 9 items instead of 8.

- **Term marking strategy**: glossary terms are marked once per visible section, not every occurrence. The marker system should be opt-in at the component level — only body text and description components activate term marking. Headings, labels, nav items, and form fields never mark terms.

- **Popover vs tooltip distinction**: the existing tooltip system (§ 4.6 in design system) remains for staleness indicators and icon-only elements. Glossary popovers are a separate, richer component — interactive, hoverable, with clickable links. Both coexist; they serve different purposes.

- **Content maintenance**: when future features add pages (Wealth, Goals, Gifts), the "See this in finplan" links on affected concepts must be activated. The `/write-plan` for those features should check and update help content links.

- **Compound interest calculator**: the interactive widget is a self-contained frontend calculation — no backend involved. Uses the standard compound interest formula: `FV = PV(1 + r/12)^(12t) + PMT × [((1 + r/12)^(12t) − 1) / (r/12)]`. All values in GBP, formatted with `font-numeric`.

- **Browser history**: within the Help page, sidebar selection changes should push to browser history (updating the `entry` query param) so that back/forward navigation works. This is URL-driven state, not component state.

- **Security**: no new backend surface. The `/help` route is JWT-protected (same as all app pages). Content is static frontend data — no user input stored, no PII, no API calls. The compound interest calculator performs local computation only. The `entry` query parameter must be validated against known entry IDs — unknown values fall back to default selection silently.

- **Accessibility**: all interactive elements (popover triggers, sidebar items, search input, calculator inputs) must be keyboard-navigable. Popovers must be announced to screen readers (ARIA role: dialog or tooltip). Focus management: opening a popover does not steal focus; keyboard users can Tab into the popover content.
