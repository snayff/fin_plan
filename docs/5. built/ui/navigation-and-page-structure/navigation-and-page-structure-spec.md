---
feature: navigation-and-page-structure
design_doc: docs/4. planning/navigation-and-page-structure/navigation-and-page-structure-design.md
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Navigation & Page Structure

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

The current 3-page structure (Overview, Wealth, Planner) silos content away from the waterfall. Users navigate to "Wealth" or "Planner" as disconnected destinations with no structural relationship to the Income → Committed → Discretionary → Surplus cascade. This redesign makes the waterfall the navigation backbone of the entire app — each tier becomes its own page, the Overview becomes a hub, and every page is one click from the top nav.

## Description

Replaces the 3-page structure with 8 pages: Overview (waterfall hub), four tier pages (Income, Committed, Discretionary, Surplus), Goals, Gifts, and Settings. The top nav displays all 8 with tier-coloured labels and visual group separators. Tier pages (Income, Committed, Discretionary) use a consistent two-panel layout with a subcategory list on the left and an item accordion on the right. Surplus is a simplified display page showing the calculated remainder. A Subcategory entity provides the grouping structure, seeded with defaults per household and prepared for user customisation in Phase 2. All waterfall items gain a notes field, a subcategory reference, and a unified spend type (Monthly / Yearly / One-off). Savings allocations move under Discretionary. Goals and Gifts pages are navigation placeholders — their internal design is deferred to separate specs.

## User Stories

- As a user, I want all pages visible in the top nav so that I can navigate to any part of my financial plan in one click.
- As a user, I want each waterfall tier to have its own page so that I can focus on one area of my finances at a time.
- As a user, I want the Overview to show my full waterfall cascade with subcategory breakdowns so that I can see the big picture at a glance.
- As a user, I want to click a tier or subcategory in the Overview to navigate directly to the relevant tier page so that I can drill into specific areas quickly.
- As a user, I want items grouped by subcategory on each tier page so that I can see related items together (e.g. all housing costs, all utilities).
- As a user, I want to expand an item inline to see its details and actions without losing the list context.
- As a user, I want to add notes to any item so that I can record context like "Fixed rate until 2027" or "Reviewed with partner".
- As a user, I want to set each item's spend type (Monthly / Yearly / One-off) so that the waterfall calculation reflects my actual spending pattern.
- As a user, I want yearly items displayed as "£840 · £70/mo" so that I can compare annual and monthly costs at a glance.
- As a user, I want the Surplus page to show my calculated monthly remainder so that I know what's left after all planned spend.
- As a user, I want to be warned when my surplus falls below the configured benchmark so that I have context for my financial picture.
- As a user with no data, I want helpful empty states with concrete examples so that I know what to add to each subcategory.

## Acceptance Criteria

### Navigation

- [ ] Top nav displays 8 items: Overview, Income, Committed, Discretionary, Surplus, Goals, Gifts, Settings
- [ ] Vertical 1px separators (`rgba(238,242,255,0.12)`) appear after Overview and after Surplus, creating 3 visual groups: `[Overview] | [Income · Committed · Discretionary · Surplus] | [Goals · Gifts ···· Settings]`
- [ ] Settings is right-aligned, pushed to the far end of the nav bar
- [ ] Overview uses `page-accent` purple (`#8b5cf6`) for its label and active underline
- [ ] Income, Committed, Discretionary, and Surplus use their respective tier colours (`tier-income`, `tier-committed`, `tier-discretionary`, `tier-surplus`)
- [ ] Goals and Gifts use the default muted text colour (no tier colour)
- [ ] Active nav item shows solid colour text + 2px bottom underline bar in the same colour
- [ ] Routes: `/overview`, `/income`, `/committed`, `/discretionary`, `/surplus`, `/goals`, `/gifts`, `/settings`
- [ ] `/` redirects to `/overview`
- [ ] `/wealth` and `/planner` redirect to `/overview` (legacy route handling)
- [ ] All routes except `/login`, `/register`, and `/accept-invite/:token` are JWT-protected

### Overview Page

- [ ] Two-panel layout preserved (Anchor 17): left panel = full waterfall cascade, right panel = analytics placeholder
- [ ] Left panel shows all 4 tier headings with totals, subcategory rows with amounts below each tier, and WaterfallConnectors between tiers
- [ ] Tier headings are clickable — navigate to that tier's page
- [ ] Subcategory rows are clickable — navigate to that tier's page with the subcategory pre-selected
- [ ] WaterfallConnectors show "minus committed", "minus discretionary", "equals" between tiers
- [ ] Surplus tier row shows absolute amount + percentage of income (e.g. "£270 · 7.4%")
- [ ] Surplus benchmark indicator (amber `attention` dot + text) appears when surplus < configured threshold (`HouseholdSettings.surplusBenchmarkPct`); absent otherwise (silence = approval)
- [ ] Stale attention badge on tier rows (amber dot + count, e.g. "3 stale") when ≥1 item in the tier is stale; absent when all current
- [ ] Right panel shows a muted placeholder indicating analytics is a future feature — not a blank void
- [ ] Ambient glow: existing indigo/violet treatment unchanged
- [ ] Empty state (no data): ghosted cascade at ~25% opacity with "£—" placeholders + connectors, teaching the waterfall structure. "Build your waterfall" callout gradient card with "Get started" button

### Tier Pages (Income, Committed, Discretionary)

- [ ] Two-panel layout: left panel = subcategory list, right panel = item list and detail
- [ ] Each tier page uses its tier colour for interactive states (hover, selected backgrounds, breadcrumb)
- [ ] Each tier page has dual ambient glows using its tier colour (primary glow in tier colour, secondary for depth)

**Left panel — subcategory list:**

- [ ] Shows all predefined subcategories for that tier, each with: stale dot (fixed-width column, left of name), subcategory name, total amount
- [ ] Stale dot column is fixed-width — names always align regardless of stale state
- [ ] Tier total shown at the bottom of the list
- [ ] Selecting a subcategory loads its items in the right panel
- [ ] First subcategory is selected by default on page load (unless arriving from Overview with a pre-selected subcategory)
- [ ] Selected state: ~14% tier colour background + left border in tier colour

**Right panel — item list:**

- [ ] Header shows: subcategory name, item count, total amount, and "+ Add" ghost button (right-aligned)
- [ ] Ghost button at rest: `+ Add` text at `rgba(238,242,255,0.45)`, border `rgba(238,242,255,0.1)`
- [ ] Ghost button on hover: text brightens, border becomes `rgba(124,58,237,0.4)`, background tints `rgba(124,58,237,0.08)`
- [ ] Clicking "+ Add" inserts a new item form at the top of the item list
- [ ] Items displayed as rows: stale dot (fixed-width column), item name, staleness age (e.g. "14mo ago" in amber, only when stale), amount (right-aligned, tabular numerals)
- [ ] Monthly items show their amount directly (e.g. "£350")
- [ ] Yearly items display as "£840 · £70/mo" — annual amount first, ÷12 monthly equivalent after the dot
- [ ] One-off items display as "£1,200 · £100/mo" — full amount first, ÷12 monthly equivalent after the dot, with a "One-off" label
- [ ] Clicking an item row expands it inline (accordion) — only one item expanded at a time; opening one closes others
- [ ] Hover state on item rows: ~5% tier colour background

**Accordion detail view (expanded item):**

- [ ] Detail grid: last reviewed date, spend type, subcategory name
- [ ] Notes shown italic when present; "No notes" in `text-muted` when empty
- [ ] Fresh items: "Edit" button only
- [ ] Stale items: "Edit" + "Still correct ✓" (teal accent) — ButtonPair, rightmost is affirmative
- [ ] "Still correct ✓" resets `lastReviewedAt` to now, removes staleness indicator, provides brief visual confirmation
- [ ] In detail view, yearly/one-off items show: "Yearly (÷12 = £70/mo)" or "One-off (÷12 = £100/mo)"

**Edit form (replaces detail view on "Edit" click):**

- [ ] Fields: name (text), amount (GBP), spend type (select: Monthly / Yearly / One-off), subcategory (select dropdown), notes (textarea)
- [ ] Subcategory dropdown defaults to the currently selected subcategory
- [ ] Three action buttons: "Cancel" (left), "Still correct ✓" (centre-right), "Save" (rightmost — affirmative)
- [ ] "Cancel" discards changes and returns to detail view
- [ ] "Save" persists changes, resets `lastReviewedAt`, and returns to detail view
- [ ] "Still correct ✓" resets `lastReviewedAt` without saving form changes, and returns to detail view
- [ ] Delete action available in the edit form (e.g. text link or icon), requires confirmation modal before permanent deletion

**Add item form (inserted at top of list):**

- [ ] Same fields as edit form: name, amount, spend type, subcategory (pre-filled with current subcategory), notes
- [ ] Two action buttons: "Cancel" (removes the form) and "Save" (creates the item)
- [ ] On save, the new item appears at the top of the list with `lastReviewedAt` set to now

### Surplus Page

- [ ] Two-panel layout with simplified content — no subcategory list, no editable items
- [ ] Left panel shows the surplus amount prominently with the waterfall calculation breakdown (Income total − Committed total − Discretionary total = Surplus)
- [ ] Right panel shows a message: "At the end of each month, you should have £XXX left over" (amount in `font-numeric`)
- [ ] Surplus benchmark warning (amber `attention` treatment — dot + text) surfaces when surplus < configured threshold; absent otherwise
- [ ] Benchmark tooltip: "A monthly surplus of around N% of income is a common planning benchmark" (N from `HouseholdSettings.surplusBenchmarkPct`)
- [ ] No "+ Add" button — surplus is a calculated value, not manually entered
- [ ] Ambient glow uses `tier-surplus` teal

### Subcategory System

- [ ] Subcategories are stored as entities: household-scoped, tier-assigned, with name, sort order, and locked flag
- [ ] Default subcategories seeded on household creation:
  - Income: Salary, Dividends, Other
  - Committed: Housing, Utilities, Services, Other
  - Discretionary: Food, Fun, Clothes, Gifts _(locked)_, Savings, Other
- [ ] Gifts subcategory in Discretionary is locked — cannot be removed or renamed (driven by Gifts page configuration)
- [ ] Each waterfall item belongs to exactly one subcategory via a foreign key
- [ ] Phase 2 preparation: the data model supports rename, reorder, add, and delete operations — but no management UI is exposed in Phase 1

### Item Data Model

- [ ] All waterfall items share common fields: name, amount (GBP), spend type (Monthly / Yearly / One-off), subcategory reference, notes (optional text), last reviewed timestamp, sort order
- [ ] Notes: free-text, optional. Shown italic in detail view. Edited via textarea in edit form. "No notes" shown in `text-muted` when empty.
- [ ] Spend type: Monthly, Yearly, and One-off options available for all tiers, no restrictions
- [ ] One-off items behave like yearly items (÷12 monthly contribution) but auto-expire after one cycle — they do not renew
- [ ] Income items additionally support: optional owner (household member), optional end date (soft archive — ended items are excluded from the live waterfall)
- [ ] Committed items additionally support: optional owner (household member)
- [ ] Savings items (within Discretionary > Savings subcategory) additionally support: optional link to a WealthAccount

### Empty States

- [ ] When a subcategory has no items, the right panel shows a centred callout gradient card (indigo→purple, `rounded-xl`, `p-6`)
- [ ] Card structure: gradient header (`callout-primary`, `font-heading`, weight 800) + body text (2–4 noun examples, `font-body`) + "+ Add item" action button
- [ ] Tone: direct, helpful, no "first" language, no exclamation marks, no "you should"
- [ ] Empty state copy per subcategory:

| Context                 | Header                   | Body                                                                          |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| Income > Salary         | Add your salary          | Employment income, take-home pay                                              |
| Income > Dividends      | Add your dividends       | Investment income, shareholder dividends                                      |
| Income > Other          | Add your income          | Rental income, freelance, side projects                                       |
| Committed > Housing     | Add your housing costs   | Rent, mortgage, council tax, insurance                                        |
| Committed > Utilities   | Add your utilities       | Gas, electric, water, internet, phone                                         |
| Committed > Services    | Add your services        | Streaming, TV, gym, subscriptions                                             |
| Committed > Other       | Add your committed costs | Any regular obligation not covered above                                      |
| Discretionary > Food    | Add your food budget     | Groceries, meal kits, work lunches                                            |
| Discretionary > Fun     | Add your fun spending    | Eating out, takeaways, cinema, hobbies                                        |
| Discretionary > Clothes | Add your clothes budget  | Clothing, shoes, accessories                                                  |
| Discretionary > Gifts   | Add your gift budget     | Configured from the Gifts page                                                |
| Discretionary > Savings | Add your savings         | Emergency fund, ISA, pension top-up                                           |
| Discretionary > Other   | Add your spending        | Anything not covered in the categories above                                  |
| Overview (empty)        | Build your waterfall     | Add your income, committed spend, and discretionary spend to see your surplus |

- [ ] Overview empty left panel: ghosted cascade at ~25% opacity (tier names with "£—" placeholders + connectors)

### Stale Indicator Positioning

- [ ] All stale dots appear in a fixed-width column LEFT of the text label — applies consistently to: Overview tier rows, subcategory lists, and item lists
- [ ] Column is empty (not absent) when the item is fresh — text labels always align vertically

### Loading & Feedback States

- [ ] Tier pages show `SkeletonLoader` (left panel: subcategory-shaped blocks; right panel: header + item row blocks with shimmer) during initial data load
- [ ] Overview shows `SkeletonLoader` (tier row + connector shaped blocks with shimmer) during initial waterfall load
- [ ] Save, delete, and confirm actions show a `Toast` notification on success or failure (success = green bar, error = red bar)
- [ ] "Still correct ✓" provides immediate inline visual feedback (brief button state change) — toast is not needed for this micro-interaction
- [ ] When a user changes an item's subcategory via the edit form dropdown and saves, the item disappears from the current subcategory list and appears in the target subcategory; totals and item counts update immediately
- [ ] All shimmer animations respect `prefers-reduced-motion` (static blocks, no animation)

### Goals & Gifts Pages

- [ ] Goals page accessible at `/goals`, shows placeholder content — full design deferred to a dedicated `/write-design goals` session
- [ ] Gifts page accessible at `/gifts`, shows placeholder content — full design deferred to a dedicated `/write-design gifts` session
- [ ] Both pages use the two-panel layout (Anchor 17)
- [ ] Both pages use `page-accent` for interactive states and ambient glow (no tier colour)

## Open Questions

- [x] ~~Phase 1 subcategory data model — enums on each item type, or a Subcategory entity?~~ **Subcategory entity from the start.** Seeded with defaults per household; no management UI in Phase 1. Prepared for Phase 2 user customisation (rename, reorder, add, delete except locked).
- [x] ~~Notes field — in scope for this feature?~~ **Yes.** All waterfall item types gain an optional `notes` text field.
- [x] ~~Spend type validation — which spend types are valid per tier?~~ **All three (Monthly, Yearly, One-off) available for all tiers.** No restrictions.
- [x] ~~Savings allocations — under Surplus or Discretionary?~~ **Under Discretionary.** Savings is a subcategory within Discretionary. Surplus is the pure calculated remainder (Income − Committed − Discretionary). Nothing is allocated from or deducted from Surplus.
- [x] ~~Surplus page content — subcategories and items, or just calculated display?~~ **Calculated display only.** Shows surplus amount, waterfall breakdown, and benchmark warning. No items, no subcategories.
- [x] ~~One-off items — how do they factor into the monthly waterfall?~~ **Same as yearly: ÷12 monthly contribution, but auto-expire after one cycle.** One-off is essentially a yearly allocation that does not renew. It needs a start date or creation date to determine when the 12-month accumulation period ends.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

- **Subcategory**: defines a grouping within a tier. Fields: household reference, tier (income / committed / discretionary), name, sort order, locked flag (prevents deletion/rename in Phase 2), and a "default" marker. Household-scoped. Seeded automatically on household creation with the default subcategory map. No Surplus tier subcategories — Surplus has no items.

- **Waterfall item (common concept)**: all items across Income, Committed, and Discretionary share the same core fields: name, amount (GBP), spend type (monthly / yearly / one-off), subcategory reference (FK to Subcategory), notes (optional text), last reviewed timestamp, sort order, household reference, and standard timestamps.

- **Per-tier extensions:**
  - Income items: optional owner (household member FK), optional end date (soft archive — ended items excluded from live waterfall), and the existing `incomeType` enum (superseded by subcategory reference for grouping purposes — migration needed).
  - Committed items: optional owner (household member FK).
  - Discretionary items: no additional fields.
  - Savings items (within Discretionary > Savings subcategory): optional WealthAccount link (FK).

- **One-off expiry**: one-off items need a mechanism to track their accumulation period (12 months from creation or a specified start date). After the period elapses, the item auto-ends and is excluded from the live waterfall. `/write-plan` should determine the precise field design (e.g. `expiresAt` timestamp, or reuse `endedAt` with an auto-set rule).

- **Model consolidation note**: the existing schema splits waterfall items across 5 models (IncomeSource, CommittedBill, YearlyBill, DiscretionaryCategory, SavingsAllocation). With a unified spend type and a Subcategory entity handling grouping, the CommittedBill + YearlyBill split and the DiscretionaryCategory + SavingsAllocation split become redundant. `/write-plan` should evaluate whether to consolidate into fewer models (e.g. one model per tier, or a single WaterfallItem model with a tier discriminator).

- **WaterfallHistory**: existing audit log model unchanged. Amount changes on any waterfall item continue to record history entries.

### API

- **Subcategory operations:**
  - List subcategories for a given tier — JWT-protected, household-scoped
  - Seed default subcategories for a household (internal, triggered on household creation or first access) — not a public endpoint
  - No create/update/delete endpoints in Phase 1 (deferred to Phase 2)

- **Waterfall item CRUD (all tiers):**
  - All existing CRUD operations continue, now accepting `subcategoryId` and `notes` fields on create and update
  - Create: `subcategoryId` required (defaults to the currently selected subcategory in the UI)
  - Update: amount changes continue to record WaterfallHistory entries
  - Confirm (reset `lastReviewedAt`): existing per-item and batch confirm operations unchanged
  - Delete: existing delete operations unchanged, behind confirmation modal in the UI

- **Waterfall summary:**
  - Enhanced to include subcategory grouping in the response — items grouped by subcategory within each tier
  - Surplus calculation: Income total − Committed total − Discretionary total (Discretionary includes savings allocations)
  - One-off items contribute their ÷12 monthly amount to tier totals, same as yearly items

- **Auth rules:** all operations remain JWT-protected and household-scoped. No cross-household access. Member role permissions unchanged.

### Components

- **TopNav** — 8 nav items with tier colour treatment per item, `page-accent` for Overview, muted text for Goals/Gifts, right-aligned Settings. Two vertical 1px separators. Active state: solid colour text + 2px bottom underline. Replaces the current 4-item nav.

- **OverviewLeftPanel** — full waterfall cascade: 4 tier heading rows (clickable, navigate to tier page) with subcategory rows below each (clickable, navigate to tier page with subcategory pre-selected). WaterfallConnectors between tiers. Tier attention badges (amber dot + stale count). Surplus shows amount + percentage.

- **OverviewRightPanel** — analytics placeholder. Muted text or card indicating future analytics feature. Not a blank void.

- **TierPage** — shared page shell for Income, Committed, and Discretionary. Two-panel layout. Accepts a tier identifier and optional pre-selected subcategory (from Overview click-through). Renders SubcategoryList in the left panel and ItemArea in the right panel. Sets the correct tier colour for interactive states and ambient glow.

- **SubcategoryList** — left panel component: renders the tier's subcategories as selectable rows (stale dot column + name + total). Selected state: tier colour left border + background. Tier total at bottom.

- **ItemArea** — right panel component: header (subcategory name, item count, total, GhostAddButton) + scrollable item list. Shows EmptyStateCard when subcategory has no items.

- **ItemRow** — single item in the list: stale dot (fixed-width column), name, staleness age (amber, only when stale), amount (right-aligned, tabular numerals). Clickable to expand accordion. Hover: ~5% tier colour background.

- **ItemAccordion** — expanded detail view within an ItemRow. Shows detail grid (last reviewed, spend type, subcategory), notes (italic or "No notes"), and action buttons. Fresh items: "Edit" only. Stale items: "Edit" + "Still correct ✓". Only one open at a time.

- **ItemForm** — inline form for add/edit. Fields: name, amount, spend type select, subcategory select, notes textarea. Edit mode: Cancel + Still correct ✓ + Save buttons, plus delete action (behind confirmation modal). Add mode: Cancel + Save buttons.

- **GhostAddButton** — the "+ Add" button in the right panel header. Transparent at rest, reveals accent colour on hover. Inserts a new ItemForm at the top of the item list.

- **EmptyStateCard** — centred callout gradient card (indigo→purple) for empty subcategories. Gradient header + body text (noun examples) + "+ Add item" button. Overview variant: "Build your waterfall" + "Get started" button.

- **SurplusPage** — simplified two-panel page. Left panel: surplus amount + waterfall calculation breakdown. Right panel: "At the end of each month, you should have £XXX left over" message + benchmark warning (amber attention treatment when surplus < threshold). No item list, no add button.

- **GoalsPage / GiftsPage** — placeholder pages with two-panel layout. Content deferred to dedicated design sessions. Show a muted placeholder indicating the feature is coming.

### Notes

- **Surplus formula**: Surplus = Income total − Committed total − Discretionary total. Discretionary total includes savings allocations. Savings allocations are items in the Discretionary > Savings subcategory, not a separate tier.

- **One-off lifecycle**: one-off items contribute ÷12 to the monthly waterfall total (same as yearly). They auto-expire after one 12-month cycle — once expired, they are excluded from the live waterfall. They should remain visible in a historical/archived state (similar to ended income sources) so users can see past one-off allocations.

- **Phase 1 boundary**: this spec covers navigation restructuring, tier pages, subcategory entity with seeded defaults, item notes, unified spend type, and the Surplus page redesign. Phase 2 (separate spec) adds subcategory management UI in Settings: rename, reorder, add (up to a configurable limit per tier), and delete (except locked subcategories).

- **Page ambient glows**: the design system's glow table needs updating. Each tier page uses its tier colour for the primary ambient glow. Goals and Gifts pages use `page-accent`. Overview and Settings glows are unchanged.

- **Migration from existing models**: the existing `incomeType` enum on IncomeSource is superseded by the Subcategory reference for grouping purposes. Existing data needs migration: `incomeType` values mapped to corresponding Subcategory rows, new `subcategoryId` populated. For Committed and Discretionary items (which have no grouping field today), the migration assigns all items to the "Other" subcategory by default.

- **Gifts subcategory behaviour**: the locked Gifts subcategory in Discretionary is driven by the Gifts page configuration. Its total is calculated from configured gift events. Individual items in this subcategory are not manually added — they are generated from Gifts page data. The "+ Add" button is not shown for this subcategory; instead, a link directs users to the Gifts page.

- **Design system breadcrumb note**: the two-segment breadcrumb maximum (tier / item) applies. Tier pages show the tier name as a single breadcrumb segment. When an item is expanded, no breadcrumb change occurs — accordion expansion is not navigation.

- **Delete all**: the existing "Delete all waterfall items" operation (Settings > Rebuild from scratch) continues to work. It must also delete all seeded subcategories and re-seed defaults on the next waterfall creation.

- **Security constraints:**
  - **Subcategory FK validation**: when creating or updating an item, the `subcategoryId` must be validated as belonging to the same household AND the correct tier. A user must not be able to assign items to another household's subcategories.
  - **Input validation**: notes field must have a max length (suggested 500 chars). Amount must be validated as a positive number within a reasonable range. All input validated via Zod schemas in `packages/shared`.
  - **Notes PII**: the notes field may contain personal information. It must not appear in application logs. Subject to existing data retention policies.
  - **Subcategory seeding**: default subcategories are seeded server-side, not client-supplied. The client cannot control which subcategories are created during seeding.
  - **No new auth concerns**: all new endpoints follow existing JWT + household-scope patterns. No public endpoints added.
