---
feature: universal-search
design_doc: docs/4. planning/universal-search/universal-search-design.md
creation_date: 2026-04-19
status: implemented
implemented_date: 2026-07-05
---

# Universal Search

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

finplan has no cross-app search today — only a local filter inside the Help sidebar. As households accumulate more income sources, bills, discretionary items, assets, accounts, gifts and goal purchases, users need a fast way to locate and jump to a named entity without first navigating to the right tier page. A universal search that doubles as a launcher keeps the app navigable as data grows and reinforces the keyboard-first aesthetic.

## Description

A keyboard-first search lives in the top-bar chrome. A small Lucide `Search` icon sits between the nav links and the household switcher; clicking it, or pressing `Ctrl+K` / `⌘K`, morphs the icon into a full-width input that covers the nav row. Results render directly below the input as one continuous card; the rest of the page is dimmed behind a scrim. `Escape` or click-outside closes and restores the nav.

Typed queries resolve three fixed-order result categories — **Data → Help → Actions** — each capped at 5, with empty categories hidden. With an empty query, the palette shows the user's 3 most recent palette selections labelled "Recent". Selecting a Data result navigates to the entity's list page with a new `?focus=<id>` URL convention; the row scrolls into view and pulse-highlights. Selecting a Help result opens the existing `/help?entry=<id>`. Selecting a nav Action routes directly; selecting a create Action navigates with `?add=1`, which the target list page consumes to auto-open its existing add modal. Desktop-only for v1.

## User Stories

- As a user, I want a search icon in the top header and a `Ctrl+K` shortcut so that I can open universal search from anywhere without hunting.
- As a user, I want the search input to expand in place over the nav so that the palette feels like part of the page chrome rather than a modal popup.
- As a user, I want to type an item name and see matches from my household data, help content, and nav actions grouped together so that I can find what I need from one surface.
- As a user, I want data, help, and actions rendered in that fixed order so that the most-frequent category (my own data) is always first.
- As a user, I want selecting a data result to take me to the right page and visually highlight the row so that I can see what I came for.
- As a user, I want selecting "Add income source" to open the same add modal the page already uses, so that the palette is a shortcut, not a parallel UI.
- As a user, I want my last 3 palette selections shown when the input is empty so that the palette is useful as a launcher without typing.
- As a user, I want empty categories hidden from the results so that the list stays tight and scannable.

## Acceptance Criteria

- [ ] A Lucide `Search` icon button is visible in the top header, positioned right of the nav links and left of the household switcher.
- [ ] Hovering the icon shows a tooltip teaching the keyboard shortcut (`Ctrl+K` / `⌘K` per platform).
- [ ] Pressing `Ctrl+K` / `⌘K` from anywhere in the app opens the palette; `Escape` closes it; clicking outside closes it.
- [ ] On open, the icon morphs into a full-width input that covers the nav links in the same header row (not a centred dialog).
- [ ] On open, the page behind is dimmed by a scrim; focus is trapped inside the palette.
- [ ] The input has initial focus on open; Up/Down move the highlighted result; Enter activates; Home/End jump to first/last.
- [ ] On close, the nav links are restored and focus returns to the trigger icon.
- [ ] With an empty query, the palette shows up to 3 most recent palette selections under a "Recent" label.
- [ ] With a non-empty query, the palette shows three categories in fixed order: **Data**, **Help**, **Actions**; each category header appears only if it has ≥1 result.
- [ ] Each category is capped at 5 rows. Within Data, the cap is 5 per entity type.
- [ ] Data matching is case-insensitive substring on `name` only, scoped to the caller's active household.
- [ ] Data search covers exactly these 8 entity types: IncomeSource, CommittedItem, DiscretionaryItem, Asset, Account, GiftPerson, GiftEvent, PurchaseItem.
- [ ] Data rows show the entity `name` as title and a subtitle of the form `"<area> · <entity kind>"` (e.g. "Committed · Monthly bill", "Wealth · Account", "Gifts · Person", "Goals · Purchase item").
- [ ] Help results reuse the existing `HelpSidebar` match logic verbatim and show the term/title as title with the first ~60 chars of the definition/summary as subtitle.
- [ ] Actions is a static client-side list containing exactly 12 navigation actions + 8 create actions; each action declares a target route and (for creates) the `?add=1` param.
- [ ] Selecting a Data result navigates to the entity's list page with `?focus=<id>`; that page scrolls the matching row into view, applies a transient pulse highlight, and strips the `focus` param from the URL without adding a history entry.
- [ ] Selecting a Help result navigates to `/help?entry=<id>`.
- [ ] Selecting a nav Action navigates to the declared route.
- [ ] Selecting a create Action navigates to the target list page with `?add=1`; that page reads the param, opens its existing add modal, and strips the `add` param from the URL.
- [ ] Every selection (any category) is appended to the Recents list in localStorage; the list is deduped by `(kind, id)` (re-selecting moves the entry to the top) and capped at 3.
- [ ] Recents are stored under a localStorage key namespaced by user id; switching users does not expose another user's recents. Logout clears the key for that user.
- [ ] Input is debounced at 150 ms before firing the backend search request.
- [ ] The backend search endpoint is JWT-protected and resolves `householdId` exclusively from the middleware (never from query or body).
- [ ] The backend endpoint returns at most 5 items per entity type in a single unified result payload.
- [ ] When a non-empty query returns zero results across all three categories, the palette shows a single "No results" empty state.
- [ ] All colours, borders, typography, and motion use design-system tokens — no hex values, no `rgba()`, no dashed borders.
- [ ] All icons are Lucide; no emoji.
- [ ] Feature is desktop-only for v1 — mobile trigger and layout are explicitly out of scope.

## Open Questions

All product-level decisions were resolved in the approved design doc. Spec-level inferences are recorded below; any of these can be revised.

- [x] ~~Trigger surface?~~ **Icon in top header, right of nav, left of household switcher** (design doc).
- [x] ~~Open behaviour?~~ **Icon morphs into full-width input covering nav row** (design doc).
- [x] ~~Keyboard shortcut?~~ **`Ctrl+K` / `⌘K`; `Escape` to close** (design doc).
- [x] ~~Data entities indexed?~~ **The 8 listed above** (design doc).
- [x] ~~Match algorithm?~~ **Name-only case-insensitive substring** (design doc).
- [x] ~~Data-result navigation?~~ **`?focus=<id>` + pulse highlight** (design doc).
- [x] ~~Help match + nav?~~ **Reuse `HelpSidebar` logic; `/help?entry=<id>`** (design doc).
- [x] ~~Actions scope?~~ **12 nav + 8 create** (design doc).
- [x] ~~Create-action mechanism?~~ **Navigate to list page with `?add=1`** (design doc).
- [x] ~~Categories + order?~~ **Data → Help → Actions, always** (design doc).
- [x] ~~Per-category cap?~~ **5 per category, 5 per entity type within Data** (design doc).
- [x] ~~Empty-category rendering?~~ **Hide header entirely** (design doc).
- [x] ~~Empty state (no query)?~~ **3 most recent selections labelled "Recent"** (design doc).
- [x] ~~Debounce?~~ **150 ms** (design doc).
- [x] ~~Libraries?~~ **`cmdk` + Radix `Dialog`** (design doc).
- [x] ~~Mobile?~~ **Out of scope for v1** (design doc).
- [x] **URL param strip behaviour** — `?focus` and `?add` are stripped via `history.replaceState` after the page consumes them. (Inference; prevents browser-back re-trigger.)
- [x] **Recents dedupe** — dedupe by `(kind, id)`; re-select moves to top. (Inference; standard MRU.)
- [x] **Recents storage scope** — localStorage key namespaced by user id; cleared on logout. (Inference.)
- [x] **Subtitle format for non-waterfall entities** — "Wealth · Account/Asset", "Gifts · Person/Event", "Goals · Purchase item". (Inference; parallels design doc's waterfall examples.)

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No new database tables are required. The feature reads existing household-scoped entities:

- **IncomeSource** — searched on `name`. Parent page: Income list.
- **CommittedItem** — searched on `name`. Parent page: Committed list.
- **DiscretionaryItem** — searched on `name`. Parent page: Discretionary list.
- **Asset** — searched on `name`. Parent page: Wealth → Assets list.
- **Account** — searched on `name`. Parent page: Wealth → Accounts list.
- **GiftPerson** — searched on `name`. Parent page: Gifts → People list.
- **GiftEvent** — searched on `name`. Parent page: Gifts → Events list.
- **PurchaseItem** — searched on `name`. Parent page: Goals / Purchases list (placeholder today; will harden when Goals ships).

Client-side state:

- **Recents list** — per-user list of recently selected palette entries, deduped by `(kind, id)`, capped at 3, persisted in localStorage. Each entry stores only the minimum needed to re-render and re-activate: `kind`, `id`, `label`, `subtitle`, `route`, and (for create Actions) `addParam`. Storage key namespaced by authenticated user id; cleared on logout.

### API

- **Search** — a single JWT-protected, household-scoped query operation accepting a text query and returning a unified result payload of data matches across the 8 entity types above. Input validated via a new Zod schema in `packages/shared`: trimmed string, length ≥ 1 and ≤ a reasonable maximum. Output: a typed, `.strict()` result payload where each item carries `kind`, `id`, `name`, `subtitle`, `route`, and `focusId`. Up to 5 matches per entity type. Ordering within an entity type: exact-match first, then starts-with, then contains. The `householdId` is resolved exclusively from `req.householdId!` — never accepted from client input. Relies on the existing global per-user rate limit; no per-route override.

Help and Actions are **purely client-side** — no new backend operations.

### Components

- **SearchPaletteProvider** — top-level mount that owns palette open/closed state, wires the global `Ctrl+K` / `⌘K` shortcut, and exposes open/close imperatively for the trigger icon.
- **SearchTriggerIcon** — the Lucide `Search` icon button in the top header, right of nav / left of household switcher. Opens the palette on click, shows a tooltip teaching the shortcut, visually morphs into the expanded input on open.
- **SearchPalette** — the expanded surface. Owns the input, debounced query (150 ms), the three-category result list, keyboard navigation, focus trap, scrim, and the empty-state view. Built on `cmdk` (filter/keyboard primitives) and Radix `Dialog` (overlay/scrim/focus trap).
- **SearchResultGroup** — renders a single category (Data / Help / Actions) with its header, hidden entirely when empty. Renders its rows in the design-doc-defined order.
- **SearchResultRow** — a single row with title + subtitle. Variant per `kind` drives the subtitle content and selection handler.
- **SearchEmptyRecent** — rendered when the query is empty. Shows up to 3 "Recent" selections; hidden entirely if there are no recents.
- **SearchNoResults** — rendered when a non-empty query yields zero merged results.
- **useSearchHotkey** — hook that binds `Ctrl+K` / `⌘K` globally to open the palette; respects existing input focus (so typing `K` in a text field doesn't trigger).
- **useSearchRecents** — hook that reads/writes the per-user recents list in localStorage; exposes `list` and `push(entry)`.
- **useSearchQuery** — hook that debounces the input, calls the backend search endpoint for data results, runs the `HelpSidebar` match logic for help, filters the static action registry, and returns a grouped result set.
- **Action registry** — a static module exporting the canonical list of palette actions. Exactly 12 navigation actions + 8 create actions. Each action declares `id`, `label`, `kind` (`"nav"` | `"create"`), `route`, and (for creates) the `?add=1` marker.
- **Page-level `?focus=<id>` handlers** — each of the 8 data list pages reads the `focus` query param on mount, scrolls the matching row into view, applies a transient pulse highlight using design-system motion tokens, and strips the param via `history.replaceState` (no new history entry).
- **Page-level `?add=1` handlers** — each list page that exposes a create Action reads the `add` query param on mount, opens its existing add modal, and strips the param via `history.replaceState`.

### Notes

- **Household scoping** — the search endpoint must never accept `householdId` from the client; it is resolved exclusively from `authMiddleware` (`req.householdId!`), per the project security conventions.
- **Input validation** — a new Zod schema in `packages/shared/src/schemas/search.schemas.ts` bounds query length and trims whitespace. The response schema is `.strict()` and includes only the fields the palette renders (`kind`, `id`, `name`, `subtitle`, `route`, `focusId`). No amounts, owner ids, notes, or audit metadata are exposed.
- **Rate limiting** — relies on the existing global per-user rate limit (keyed off Bearer token user id in `app.ts`). 150 ms input debounce further reduces request volume. No per-route override unless usage shows abuse.
- **Rank order within an entity type** — exact name match > starts-with name match > contains name match. Cap of 5 applied after ordering.
- **Category order** — Data → Help → Actions, always, per the approved design. This is not flat; category headers separate groups and are hidden when the category has zero results.
- **Recents scoping** — localStorage key namespaced by authenticated user id (e.g. `"finplan.search.recents.v1.<userId>"`). Cleared on logout. Only non-sensitive fields stored (kind, id, label, subtitle, route, add marker).
- **Empty-state rule** — recents only; no Actions list in empty state (distinct from the initial design-wip idea). If no recents exist, the palette shows a hint to start typing.
- **Create-action contract** — the Action registry must only list create actions whose target list page implements the `?add=1` handler, to avoid dead selections. A create action's `route` is the list page, not a modal route.
- **Focus-on-navigate contract** — the palette always appends `?focus=<id>` for Data selections. Pages that host these entities implement the matching handler; pages that don't must still accept the navigation cleanly (no error if `focus` is unrecognised).
- **URL param strip** — both `?focus=<id>` and `?add=1` are consumed once then stripped via `history.replaceState` to prevent browser-back from re-triggering the scroll/modal.
- **Accessibility** — palette is a dialog (via Radix `Dialog`) with `role="dialog"` + `aria-modal`. Result list is a `listbox` with `aria-activedescendant` for keyboard navigation. Input has `aria-label="Search"`. Closing returns focus to the trigger icon.
- **Design system** — palette background, input, rows, headers, scrim, and empty-state styling use tokens from `docs/2. design/design-system.md`. No hex, no `rgba()`, no dashed borders. Icons are Lucide; no emoji.
- **Audit logging** — search is read-only; no audit entries are written. No PII is logged server-side beyond the standard request metadata.
- **Household safety** — because the endpoint uses `req.householdId!` directly, cross-household leakage is structurally prevented. Defence-in-depth note only.
- **Out of scope (from design doc):** mobile entry, fuzzy match, cross-household search, Snapshot + Member entities, notes/subcategory matching, overflow / show-more, parameterised commands.
