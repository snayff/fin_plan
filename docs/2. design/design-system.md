# finplan Design System

> This document defines the concrete rules and constraints for the finplan UI: colour tokens, typography, layout, components, interaction patterns, and UX patterns. It is the _what_ of the design — the specifications that follow from the principles in `design-philosophy.md`.

---

## 1. Foundations

### 1.1 Theme

Dark theme only. No light mode. No theme switching. If this changes in future, the token layer (not component code) is the only thing that needs updating.

---

### 1.2 Colour Tokens

The colour system has three layers: **primitives** (raw values) → **semantic roles** (what it means) → **component tokens** (where it's used).

#### Background & Depth

| Token          | Value            | Role                                                                       |
| -------------- | ---------------- | -------------------------------------------------------------------------- |
| `background`   | `#080a14`        | Main app background — deep navy, almost black with blue undertone          |
| `ambient-glow` | Radial gradients | Indigo/violet at top-right, teal at bottom-left — subtle depth, never flat |

The background is never a plain solid. Ambient radial glows give the canvas depth and warmth without competing with content.

#### Page Ambient Glows

Each page has dual radial gradient glows at low opacity, creating a subtle sense of place. Glows are corner-centred — primary radiates from the top-right corner, secondary from the bottom-left. The tight fade (25%) ensures the centre and majority of the page shows the true `#080a14` background, with colour only as a subtle corner accent.

| Page          | Primary colour                | Primary opacity | Secondary colour   | Secondary opacity |
| ------------- | ----------------------------- | --------------- | ------------------ | ----------------- |
| Overview      | Indigo (`#6366f1`)            | 9%              | Violet (`#8b5cf6`) | 5%                |
| Income        | Blue (`#0ea5e9`)              | 9%              | Indigo (`#6366f1`) | 5%                |
| Committed     | Indigo (`#6366f1`)            | 9%              | Purple (`#a855f7`) | 5%                |
| Discretionary | Purple (`#a855f7`)            | 9%              | Teal (`#4adcd0`)   | 5%                |
| Surplus       | Teal (`#4adcd0`)              | 9%              | Indigo (`#6366f1`) | 5%                |
| Settings      | Neutral (`rgba(238,242,255)`) | 4%              | None               | —                 |

Secondary colours follow the waterfall spectrum: each tier's secondary is the next tier's primary.

**Implementation:** CSS `[data-page]` attribute on the page wrapper + `::before` / `::after` pseudo-elements with `position: fixed`, `pointer-events: none`, `z-index: 0`. Glows use `radial-gradient(ellipse at [corner], [colour] 0%, transparent 25%)`. Primary at `100% 0%` (top-right), secondary at `0% 100%` (bottom-left). No animation — static only.

#### Surfaces

Three elevation levels with wide steps (~8–10 lightness points) for clear visual hierarchy.

| Token              | Background | Border    | Used for                                |
| ------------------ | ---------- | --------- | --------------------------------------- |
| `surface`          | `#0d1120`  | `#1a1f35` | Cards, panels, sidebars                 |
| `surface-elevated` | `#141b2e`  | `#222c45` | Modals, popovers, selected rows         |
| `surface-overlay`  | `#1c2540`  | `#2a3558` | Dropdowns, tooltips, top-layer elements |

**Rule:** cards and panels use surface elevation to distinguish themselves from the page background. No shadows — the dark theme relies on border contrast, not elevation shadows.

#### Text

All text uses a blue-white tint for cohesion with the cool palette. The base tint is `rgb(238, 242, 255)` at varying opacities.

| Token            | Value                       | Used for                                    |
| ---------------- | --------------------------- | ------------------------------------------- |
| `text-primary`   | `rgba(238, 242, 255, 0.92)` | Headlines, key values, primary labels       |
| `text-secondary` | `rgba(238, 242, 255, 0.65)` | Item names, descriptions, body text         |
| `text-tertiary`  | `rgba(238, 242, 255, 0.40)` | Metadata, helper text, timestamps           |
| `text-muted`     | `rgba(238, 242, 255, 0.25)` | Placeholders, disabled text, divider labels |

#### Tier Colours

One colour per waterfall tier, used exclusively for that tier's heading, accent bar, and value text. Each colour carries strict semantic meaning and must never be repurposed.

| Token                | Value     | Tier            | Semantic intent                       |
| -------------------- | --------- | --------------- | ------------------------------------- |
| `tier-income`        | `#0ea5e9` | Income          | The source — energetic, electric blue |
| `tier-committed`     | `#6366f1` | Committed Spend | Neutral obligation — settled indigo   |
| `tier-discretionary` | `#a855f7` | Discretionary   | Chosen spend — expressive purple      |
| `tier-surplus`       | `#4adcd0` | Surplus         | The answer — rewarding teal-mint      |

**Rule:** Tier colours are semantically protected. They must only appear in their tier context — heading text, accent bar, value text, and contextual interactive states (hover/selected backgrounds at reduced opacity). They must never be repurposed for status indicators, attention signals, buttons, or any non-tier UI element.

**Sanctioned exception — celebration confetti.** Onboarding/celebration confetti (the `WelcomePage` household-created burst) may reuse all four tier colours together as a festive palette. The full waterfall palette appearing at once reads as "your whole plan is ready" rather than as a per-tier semantic signal, so this does not violate the protection rule. When reused this way the colours **must** be sourced from the canonical tier CSS custom properties (`hsl(var(--tier-income))` … `hsl(var(--tier-surplus))`) — never hardcoded hex — so the celebration always tracks the real tier palette.

#### Accent & Action

| Token         | Value     | Used for                                                       | Notes                                                                           |
| ------------- | --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `action`      | `#7c3aed` | Buttons, focus rings, CTAs, primary interactive elements       | Electric violet — the app's action colour                                       |
| `page-accent` | `#8b5cf6` | Breadcrumbs, section headers, nav indicators on non-tier pages | Soft violet — bluer and cooler than Discretionary, never reads as a tier signal |

#### Callout Gradients

Gradient text for engagement and special highlights. Applied via `background-clip: text`. The gradient treatment should feel special and inviting — "look at this exciting thing."

| Token               | Value                                 | Used for                                             |
| ------------------- | ------------------------------------- | ---------------------------------------------------- |
| `callout-primary`   | `#0ea5e9` → `#a855f7` (blue → purple) | Hero emphasis, key phrases, primary standout moments |
| `callout-secondary` | `#a855f7` → `#4adcd0` (purple → teal) | Secondary emphasis, variety                          |

**Rule:** Callout gradients are for engagement only — hero headlines, wordmark, key summary phrases, standout CTAs. Never use them for warnings, attention items, informational alerts, or tier headings.

#### Callout Gradient Cards

Low-opacity gradient backgrounds used for hero cards and completion moments. Different from gradient text — these are card backgrounds, not typographic effects.

| Gradient        | CSS                                                                             | Border                            | Canonical locations            |
| --------------- | ------------------------------------------------------------------------------- | --------------------------------- | ------------------------------ |
| Indigo → Purple | `linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.05) 100%)` | `1px solid rgba(99,102,241,0.1)`  | Empty state CTAs, Welcome hero |
| Purple → Teal   | `linear-gradient(135deg, rgba(168,85,247,0.06) 0%, rgba(74,220,208,0.04) 100%)` | `1px solid rgba(168,85,247,0.08)` | Build completion card          |

**Rule:** All callout gradient cards use `rounded-xl`, `p-6` padding, and a 1px border at ~10% opacity of the gradient start colour. Three canonical locations: empty state CTAs (overview), welcome hero card, build completion card.

#### Attention

One colour, one pattern. Amber is the universal "noteworthy" signal — staleness, financial attention, anything that deserves a second look. It does not judge, it highlights.

| Token              | Value                      | Used for                                                            |
| ------------------ | -------------------------- | ------------------------------------------------------------------- |
| `attention`        | `#f59e0b`                  | Dot indicator, text detail, inline labels — always this exact value |
| `attention-bg`     | `rgba(245, 158, 11, 0.04)` | Nudge card background tint only                                     |
| `attention-border` | `rgba(245, 158, 11, 0.08)` | Nudge card border only                                              |

**Rule:** Amber is one colour, one pattern. `#f59e0b` everywhere — staleness dots, staleness text, cashflow attention dots, cashflow attention text, nudge card dots. The only variations are the subtle bg/border tints on nudge cards. No variations in hue or saturation across contexts.

#### Status

The app is **non-judgemental**. Financial values are never colour-coded as good or bad. Whether you have money or no money, the app does not judge — it helps.

| Token     | Value     | Used for                                                                              | Never for                                                   |
| --------- | --------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `error`   | `#ef4444` | App errors only — validation failures, system errors, destructive action confirmation | Financial shortfalls, negative balances, over-budget states |
| `success` | `#22c55e` | UI confirmations only — saved, completed, synced                                      | Positive balances, surplus amounts, financial "good" states |

**Removed tokens (from previous design system):**

- `shortfall` — was red for cashflow shortfalls; now handled by the attention system (amber), not error red
- `surplus-positive` / `surplus-warning` — removed; the app does not colour-code financial positions as good/bad
- `expense` — ledger concept, no equivalent in the planning model
- `highlight` — not used in the waterfall model

---

### 1.3 Typography

**Three fonts, strict roles.**

| Token          | Font               | Weights       | Used for                                                                   |
| -------------- | ------------------ | ------------- | -------------------------------------------------------------------------- |
| `font-heading` | **Outfit**         | 700, 800      | Tier names, headlines, wordmark, button labels, nav links, section headers |
| `font-body`    | **Nunito Sans**    | 400, 500, 600 | Item labels, descriptions, metadata, helper text, breadcrumbs, body copy   |
| `font-numeric` | **JetBrains Mono** | 400, 500, 600 | All monetary values, percentages, and numerical data                       |

**Inter is not used anywhere.**

The visual distinction between `font-heading`, `font-body`, and `font-numeric` is intentional and load-bearing. Outfit communicates structure and hierarchy. Nunito Sans communicates content and detail. JetBrains Mono communicates "this is a number worth reading."

**Rule: tabular numerals always.** Any context where numbers stack vertically or need to align uses `font-variant-numeric: tabular-nums`, regardless of whether `font-numeric` is in use.

#### Tier Headings

Tier names use **solid colour** (their tier primary), not gradient. `font-heading`, weight 800, uppercase, letter-spacing 0.09em.

#### Callout Words

Gradient text is reserved for **callout words** — special engagement phrases, hero headlines, and standout moments. These use the callout gradient tokens, not tier colours. `font-heading`, weight 800.

#### Waterfall Type Hierarchy

Six levels in the left panel, each a clear visual step:

| Level        | Size             | Weight                      | Font                                                                                                          | Colour                        | Context                                                                                                               |
| ------------ | ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Hero amount  | text-hero (30px) | font-numeric font-extrabold | Colour by context: text-primary (waterfall items), text-foreground (wealth), text-tier-surplus (surplus page) |
| Page title   | 18px             | 700                         | `font-heading`                                                                                                | `text-tier-*` / `page-accent` | Fixed at top of left panel (uppercase, 0.09em spacing). Tier pages use tier colour; non-tier pages use `page-accent`. |
| Tier total   | 15px             | 600                         | `font-numeric`                                                                                                | `text-tier-*`                 | Sum next to each tier heading, in tier colour                                                                         |
| Tier heading | 13px             | 600                         | `font-heading`                                                                                                | `text-tier-*`                 | `INCOME`, `COMMITTED`, etc. (uppercase, 0.09em spacing)                                                               |
| Item name    | 13px             | 400                         | `font-body`                                                                                                   | `text-secondary` (#94a3b8)    | Label for each line item — dimmed to recede                                                                           |
| Item amount  | 13px             | 400                         | `font-numeric`                                                                                                | `#cbd5e1`                     | Value for each line item — subtle but readable                                                                        |
| Metadata     | 12px             | 500                         | `font-body`                                                                                                   | varies                        | Staleness age, dates, helper text                                                                                     |

Tier headings and totals use the same colour as their tier (`text-tier-income`, `text-tier-committed`, `text-tier-discretionary`, `text-tier-surplus`). Surplus is treated identically to other tiers — same size, same weight, just teal.

#### Cascade Connectors

Between each tier in the waterfall, a connector reinforces the arithmetic flow:

| Connector             | Position                            |
| --------------------- | ----------------------------------- |
| "minus committed"     | Between Income and Committed        |
| "minus discretionary" | Between Committed and Discretionary |
| "equals"              | Between Discretionary and Surplus   |

Connectors render as: horizontal rule — text — horizontal rule. Text uses `font-numeric`, 10.5px, `font-medium`, `text-muted`, `tracking-wide`. Rules use `bg-border/50` at 1px height.

**Heading typography token:** heading elements use tighter treatment than body text — letter spacing: −0.025em; line height: 1.15. These are defined as dedicated heading tokens in `design-tokens.ts`. They do not apply to body text, labels, or numerical values.

#### Named Font-Size Tokens

| Token             | Size   | Usage                                         |
| ----------------- | ------ | --------------------------------------------- |
| `text-connector`  | 10.5px | WaterfallConnector annotation text            |
| `text-tier`       | 13px   | Tier row item names in left panels            |
| `text-tier-total` | 15px   | Tier heading total amounts                    |
| `text-hero`       | 30px   | Hero amount (income, surplus, net worth, etc) |

Standard Tailwind size classes (`text-xs`, `text-sm`, `text-base`, etc.) are used as-is for all other text. Arbitrary size classes (`text-[Xpx]`) are forbidden — use a named token or a Tailwind default.

#### Section Label (canonical)

All section headers — "By Liquidity", "Purchases", "Gifts", "Held on Behalf Of", etc. — use one treatment:

```
text-xs font-medium uppercase tracking-wider text-muted-foreground
```

**Exceptions:** Waterfall tier labels (`Income`, `Committed`, `Discretionary`, `Surplus`) use `text-tier font-heading font-semibold tracking-tier uppercase` + their tier colour. This is the only exception.

---

### 1.4 Spacing and Layout

**8px grid.** All spacing values are multiples of 4px (half-grid) or 8px (full grid). Generous by default — the "calm by default" principle applies to space as much as colour.

**Two-panel shell:**

- Left panel: fixed width **360px**
- Right panel: fills all remaining horizontal space
- Single `border` token separates the panels — no gap, no shadow, no divider chrome
- Top navigation bar: full width, above both panels

**Minimum viewport width: 1024px.** Below this width, the two-panel layout is not supported. The app is desktop-first; narrower viewports are out of scope until the mobile experience is designed (see backlog specs).

**Rule: left panel never scrolls horizontally.** Long labels truncate with an ellipsis.

**Rule: both panels are vertically scrollable.** The left panel uses `flex-1 min-h-0 overflow-y-auto` below the pinned `PageHeader` so content scrolls gracefully if it exceeds the viewport. The right panel routinely scrolls for long detail views. `min-h-0` is mandatory on every `flex-1 overflow-y-auto` child inside a `flex flex-col` parent — without it, the flex item's implicit `min-height: auto` prevents it from shrinking and the scrollbar never activates.

**Spacing — grouping rule:** proximity signals relatedness; distance signals separation.

- Within a group (e.g. items inside the same waterfall tier): tight row spacing, line height 1.25
- Between groups (e.g. between the Committed Spend section and the Discretionary section): relaxed spacing or a structural divider

Apply consistently to all list and panel layouts throughout the app.

#### Right-Panel Vertical Rhythm

All right-panel detail views follow a two-tier spacing convention:

- **Between major sections:** `space-y-6` (24px) — e.g. between breadcrumb group, amount group, history chart, action buttons.
- **Within sections:** `space-y-2` (8px) — e.g. between breadcrumb and heading, between amount and staleness label.
- Related elements are grouped into a container div with `space-y-2` before the outer `space-y-6` separates them from the next section.

**Exception:** Settings page uses `space-y-12` / `space-y-4` — justified by its long-form editing context.

**Information hierarchy:** size, colour, and position communicate importance.

- Most important information appears at the top of each discrete section
- The waterfall cascade is the primary expression: Income row is most prominent; Surplus is the visual terminus
- Headline figures in the left panel summary are always the dominant visual element per page

---

### 1.5 Interactive States

Interactive states use the contextual tier colour at varying opacities. On non-tier pages, use `page-accent`.

| State          | Treatment                                                                      |
| -------------- | ------------------------------------------------------------------------------ |
| **Hover**      | ~5% tier/accent colour opacity background                                      |
| **Selected**   | ~14% tier/accent colour opacity background + left border in tier/accent colour |
| **Active nav** | Solid tier/accent colour text + 2px bottom underline bar                       |
| **Focus**      | `action` colour focus ring (2px)                                               |
| **Disabled**   | Reduced opacity (0.4) — not colour change alone                                |

---

### 1.6 Scrollbars

Custom-styled to match the dark theme. Browser-default scrollbars are not acceptable.

- Track: transparent (no visible track)
- Thumb: `rgba(238, 242, 255, 0.10)`, border-radius `full`
- Thumb on hover: `rgba(238, 242, 255, 0.18)`
- Width: 6px

Applied globally via `::-webkit-scrollbar` with a CSS fallback using `scrollbar-color` and `scrollbar-width: thin` for Firefox.

---

### 1.7 Border Radius

| Token    | Value  | Used for                                                     |
| -------- | ------ | ------------------------------------------------------------ |
| `radius` | 8px    | Cards, modals, toasts, dropdown panels, form inputs, buttons |
| `full`   | 9999px | `EntityAvatar`, badges, indicator dots                       |

No other radii are used. Everything rectangular gets `radius`; everything circular gets `full`.

---

### 1.8 Z-Index Scale

Layering order for overlapping elements. Each level is a fixed value — do not use arbitrary z-index values. 10-point increments leave room for future layers without renumbering.

| Layer         | z-index | Elements                              |
| ------------- | ------- | ------------------------------------- |
| Base          | 0       | Page content, panels                  |
| Sticky        | 10      | Top navigation bar                    |
| Banner        | 20      | `SnapshotBanner`, `StaleDataBanner`   |
| Dropdown      | 30      | `Select` dropdown panels              |
| Modal overlay | 40      | `ConfirmationModal` backdrop          |
| Modal         | 50      | `ConfirmationModal` container         |
| Toast         | 60      | `Toast` notifications (always on top) |
| Tooltip       | 70      | Tooltips (highest — never occluded)   |

---

## 2. Component Catalogue

### `WaterfallTierRow`

Used in the left panel of the Overview page. Represents one tier of the waterfall (Income, Committed Spend, Discretionary, or Surplus).

**Anatomy:**

```
[ TIER NAME ········· (badge) · £ Total ]
```

- Tier name: uppercase, `font-heading`, weight 800, solid tier colour, letter-spacing 0.09em
- Total: right-aligned, `font-numeric`, weight 600
- Attention badge: amber dot + count text (`attention` token), only rendered when ≥1 item in the tier needs attention (e.g. `● 3 stale`). Absent when everything is current — silence = approval.

**Behaviour:**

- Clickable — selecting a tier loads its item list in the right panel
- Selected state: left border in tier colour + ~14% tier colour background
- Hover state: ~5% tier colour background, no colour change on the tier name

**Rule:** the Surplus row shows both absolute amount and percentage of income (e.g. `£270 · 7.4%`).

---

### `WaterfallConnector`

The cascade element between tier rows. Reinforces the waterfall mental model.

**Anatomy:**

```
  │
  → minus committed spend
  │
```

- Subtle vertical line in `border` colour
- Annotation text in `text-muted`, `font-body`, 12px: "minus committed spend", "minus discretionary", "equals"
- **Rule:** connectors are structural — they must not draw the eye. Muted colour, small text, no animation.

---

### `StalenessIndicator`

Inline on any item row in the right panel. Communicates that a value has not been reviewed within its staleness threshold. Uses the attention system.

**At row level:**

- A 5px amber dot (`attention` token), no text
- Position: immediately before the item label
- Amber detail text after the label: e.g. "14mo ago" (`attention` token, `font-body`, 9px)

**On hover:**

- Tooltip: "Last reviewed: N months ago"

**In right panel detail view:**

- Expanded as text: "Last reviewed: 14 months ago" at 12px, `text-tertiary`

**Rules:**

- Informational only — never blocking
- Uses `attention` amber — staleness is not an error, never red
- Absent when the item is current — silence = approval

---

### `ButtonPair`

The standard confirm/edit pattern used throughout the app.

**Anatomy:**

```
[ Edit ]   [ Still correct ✓ ]
```

**Rule: the rightmost button is always the affirmative action. No exceptions.**

This applies to all variants:

- `[ Edit ]   [ Still correct ✓ ]`
- `[ Update ]   [ Still correct ✓ ]`
- `[ Cancel ]   [ Save ]`
- `[ Back ]   [ Confirm ]`

**Behaviour of "Still correct ✓":**

- Resets the item's `lastReviewedAt` timestamp to now
- Does not open a form or modal
- Provides immediate visual confirmation (brief state change on the button)
- Removes the staleness indicator from the item

**Button sizing:**

| Size | Height | Vertical padding | Horizontal padding |
| ---- | ------ | ---------------- | ------------------ |
| sm   | 32px   | 8px              | 16px               |
| md   | 40px   | 10px             | 20px               |
| lg   | 48px   | 12px             | 24px               |

Horizontal padding is always 2× vertical padding.

**Button states** (all interactive buttons must implement all five):

| State    | Trigger                     |
| -------- | --------------------------- |
| Default  | Resting                     |
| Hovered  | Cursor over button          |
| Pressed  | Mousedown / active          |
| Disabled | Action unavailable          |
| Loading  | Async operation in progress |

The loading state replaces the button label with a spinner. The disabled state uses reduced opacity — not colour alone.

**Button colours:**

- Primary/CTA buttons: `action` token (`#7c3aed`) background
- Secondary buttons: `surface-elevated` background, `text-secondary` text
- Destructive buttons: `error` token background — only for irreversible actions, always behind a confirmation modal

---

### `FormInput`

All form inputs provide six states:

| State           | Trigger                       | Visual                                   |
| --------------- | ----------------------------- | ---------------------------------------- |
| Unselected      | Default resting               | `surface` background, `border`           |
| Focused         | Keyboard focus or click       | `action` focus ring (2px)                |
| Error           | Failed validation             | `error` token border and helper text     |
| Warning         | Value is valid but noteworthy | `attention` token border and helper text |
| Disabled        | Field is read-only or locked  | Reduced opacity                          |
| Success / Valid | Inline validation passed      | `success` token border                   |

---

### `Select`

A dropdown selector for choosing one option from a list. Used for frequency selectors, category pickers, household switcher, and settings dropdowns.

**Anatomy (closed):**

```
[ Selected value                          ▾ ]
```

- Trigger: same visual treatment as `FormInput` — `surface` background, `surface` border, border-radius 8px
- Label: `font-body`, weight 500, `text-secondary`
- Chevron: `ChevronDown` (Lucide), `text-tertiary`, right-aligned
- Inherits all six `FormInput` states (unselected, focused, error, warning, disabled, valid)

**Anatomy (open):**

```
[ Selected value                          ▲ ]
┌──────────────────────────────────────────┐
│  Option A                                │
│  Option B  ✓                             │
│  Option C                                │
└──────────────────────────────────────────┘
```

- Dropdown panel: `surface-overlay` background, `surface-overlay` border token, border-radius 8px
- Options: `font-body`, weight 400, `text-secondary`, padding 8px 12px
- Selected option: `text-primary`, with a checkmark right-aligned
- Hover: ~12% `action` colour opacity background

**Behaviour:**

- Click trigger or press `Enter`/`Space` to open
- Click option or press `Enter` to select and close
- `Escape` closes without changing selection
- Arrow keys navigate options while open
- Dropdown opens below the trigger; if insufficient space, opens above

**Rules:**

- Never use a dropdown for fewer than 3 options — use a radio group or toggle instead
- The trigger always shows the current selection — never a placeholder like "Select..."

---

### `ConfirmationModal`

Used for destructive actions that require explicit user confirmation before proceeding (e.g. deleting a waterfall item, removing a household member, rebuilding the waterfall).

**Anatomy:**

```
┌──────────────────────────────────┐
│  Title                           │
│                                  │
│  Body text — describes what      │
│  will happen and any permanent   │
│  consequences.                   │
│                                  │
│         [ Cancel ]   [ Delete ]  │
└──────────────────────────────────┘
```

- Overlay: full-viewport, `rgba(0, 0, 0, 0.35)` — dims the background without losing it entirely
- Container: `surface-elevated` background, `surface-elevated` border token, border-radius 8px, padding 24px (`p-6`)
- Title: `font-heading`, weight 700, `text-primary`
- Body: `font-body`, `text-secondary`
- Button pair: follows `ButtonPair` rightmost-is-affirmative rule. For destructive modals, the affirmative button uses the `error` token background
- Max width: 480px, centred horizontally and vertically

**Behaviour:**

- Opens with a fade-in (150ms, ease-out); closes with fade-out (150ms, ease-in)
- Focus is trapped inside the modal while open — Tab cycles through focusable elements within the modal only
- `Escape` key dismisses the modal (equivalent to Cancel)
- Clicking the overlay dismisses the modal (equivalent to Cancel)
- The underlying page is inert — no scrolling, no interaction — while the modal is open

**Rules:**

- Only used for irreversible or high-consequence actions — never for routine confirmations
- Body text must state the consequence plainly: "This will permanently delete [item name]" — not "Are you sure?"
- All animations must be trivially disableable via `prefers-reduced-motion`

---

### `NudgeCard`

A contextual prompt in the right panel. Surfaces a mechanical action or observation when one is available. Uses the attention system for visual treatment.

**Anatomy:**

- Amber dot (`attention` token, 5px) in the header
- Title: `font-heading`, weight 700, `text-primary`
- Body: `font-body`, `text-secondary`, with `font-numeric` for values
- Optional action link (e.g. "See ISA accounts")
- Background: `attention-bg` — subtle amber tint
- Border: `attention-border` — subtle amber border

**Rules:**

- Right panel only — never in the left panel, never inline in a list
- One at a time — nudges are never stacked
- Absent when no opportunity exists — silence = approval
- Language: arithmetic and options only, never recommendations
  - ✓ "Committed bills total **£2,140** in March, **£120 more than your income**"
  - ✓ "Redirecting £50/mo to this account could earn ~£180 more per year"
  - ✗ "You should move your savings to this account"

---

### `TimelineNavigator`

A row of snapshot dots displayed above the two-panel area on the Overview page.

**Anatomy:**

- Horizontal row of dots, one per snapshot
- Current live plan: no dot (it is the default state, not a snapshot)
- Historical snapshots: outline dots
- Currently viewed snapshot: filled dot

**Behaviour:**

- Hover: tooltip with snapshot name and date
- Click: loads that snapshot in read-only mode
- Read-only mode: "Viewing: [snapshot name]" banner replaces the timeline navigator for the duration of the session
- Returning to live plan: banner dismissed, timeline navigator restored

---

### `ItemRow`

Used in the right panel item list (State 2 — tier selected). Each row represents one waterfall item within the selected tier.

**Anatomy:**

```
[ ● Label  detail ················ £ Value ]
```

- Staleness dot (●): `attention` amber, 5px — appears before the label when the item is stale; absent when current
- Staleness detail: `attention` amber text, `font-body`, 9px — e.g. "14mo ago"
- Label: `font-body`, weight 500, `text-secondary`, truncates with ellipsis if too long
- Value: `font-numeric`, weight 500, `text-secondary`, right-aligned, tabular numerals
- No avatar — the left panel and item list are text-only

**Behaviour:**

- Clickable — clicking transitions the right panel to State 3 (item detail)
- Hover state: ~5% tier colour background
- Selected state: ~14% tier colour background (persists when item is loaded in State 3)

---

### `Breadcrumb`

Navigation trail displayed at the top of the right panel. Communicates the user's current depth and provides a back action.

**Anatomy (State 2 — tier selected):**

```
  COMMITTED SPEND
```

- Tier name only, in tier colour (or `page-accent` on non-tier pages)
- `font-body`, weight 600, 9px, uppercase, letter-spacing 0.08em

**Anatomy (State 3 — item selected):**

```
  ← Committed Spend / British Gas
```

- `←` back arrow: `ChevronLeft` (Lucide), `text-tertiary` — clickable, navigates to State 2
- Tier name: tier colour, clickable (same as `←`)
- `/` separator: `text-muted`
- Item name: `text-secondary`
- Same font treatment: `font-body`, weight 600, 9px, uppercase, letter-spacing 0.08em

**Behaviour:**

- Clicking `←` or the tier name segment navigates back to State 2 (tier item list) with a slide-right transition
- The item name segment is not clickable — it is the current location
- During inline edit (§ 4.11), the breadcrumb remains unchanged — editing is not navigation

**Rules:**

- **Maximum two segments (tier / item). The breadcrumb never goes deeper.** Features that require content beyond item detail must use inline expansion, a modal, or a separate page — not a third breadcrumb segment. This is a structural constraint, not a limitation to work around.
- On non-tier pages (Wealth, Planner, Settings), the tier colour is replaced by `page-accent`

---

### `EntityAvatar`

Displays an identity image for a named entity. Used in right panel detail views only — not in the left panel or item list rows.

**Sources (in priority order):**

1. Logo selected from the curated library (common UK banks, pension providers, utilities, streaming services)
2. User-uploaded image
3. Initials fallback — when no image is assigned

**Initials fallback:**

- Background: a deterministic colour derived from the entity name (consistent across sessions and users)
- Content: 1–2 initials, `font-heading`, white

**Sizes:**
| Name | Size | Context |
|---|---|---|
| `sm` | 24px | Compact list rows |
| `md` | 32px | Standard detail contexts |
| `lg` | 48px | Right panel detail headline |

**Display rules:**

- Always circular (`border-radius: full`) at all sizes
- The fallback is the default expected state for new entries — it must not feel like an error

---

### `SnapshotBanner`

Replaces the `TimelineNavigator` when a historical snapshot is being viewed. Communicates clearly that the user is not viewing live data.

**Anatomy:**

```
  Viewing: March 2026 Review  ·  [ Return to current ▸ ]
```

- Full-width bar anchored directly below the top navigation bar, above both panels
- Background: `surface` token with a subtle `border`
- Text: `font-body`, 12px, `text-secondary`
- "Return to current ▸" is a link/button — clicking it dismisses the banner and restores the live plan and `TimelineNavigator`

**Behaviour:**

- All edit controls (edit buttons, `ButtonPair`, add actions) are hidden while the banner is visible
- The waterfall left panel and right panel values all reflect the snapshot date
- The history graph shows a vertical marker at the snapshot date

---

### `SkeletonLoader`

Displayed during initial data loading to preserve layout and reduce perceived wait time.

**Left panel variant:**

- Four tier-row shaped blocks (matching the height of a `WaterfallTierRow`)
- Three connector-shaped thin lines between them
- Shimmer animation (left-to-right gradient sweep)

**Right panel variant:**

- One large block (matching the headline value area)
- One medium block (matching a sparkline chart height)
- Two small inline blocks side by side (matching a `ButtonPair`)
- Same shimmer animation

**Rules:**

- Background: `surface` token
- Duration of shimmer cycle: 1.5s, looped
- Must be trivially disableable via `prefers-reduced-motion` (no shimmer; static blocks instead)

---

### `StaleDataBanner`

Displayed when the app has failed to sync with the backend but is showing cached data.

**Anatomy:**

```
  Data may be outdated — last synced [N minutes ago]  ·  [ Retry ]
```

- Full-width bar anchored below the top navigation bar (same position as `SnapshotBanner`, but the two never appear simultaneously)
- Background: `attention-bg` amber tint
- Border-bottom: `attention-border`
- Dot: `attention` amber, 5px
- Text: `font-body`, 12px
- "Retry" triggers an immediate resync attempt

**Behaviour:**

- Auto-dismisses when a successful sync completes
- Does not block or replace any UI — the user can still navigate, view, and interact with the cached data
- Never uses `error` (red) — this is informational, not an error state

---

### `Toast`

Non-blocking notification that confirms the result of an async action. Described behaviourally in § 4.7; this entry defines the component anatomy.

**Anatomy:**

```
┌───┬──────────────────────────────────────┐
│ ▌ │  Message text                      ✕ │
└───┴──────────────────────────────────────┘
  ↑ 3px left-edge colour bar (variant colour)
```

- Position: bottom-right of the viewport, 24px from edge
- Background: `surface-elevated`, border: `surface-elevated` border token, border-radius 8px
- Padding: 12px 16px
- Left-edge bar: 3px wide, full height of the toast, variant-specific colour (see below)
- Message: `font-body`, weight 500, `text-secondary`
- Dismiss button: `X` icon, `text-tertiary`, right-aligned

**Variants:**

| Variant | Bar colour            | Used for                                        |
| ------- | --------------------- | ----------------------------------------------- |
| Success | `success` (`#22c55e`) | Save confirmed, sync complete, action succeeded |
| Error   | `error` (`#ef4444`)   | Save failed, sync failed, action errored        |
| Info    | `text-tertiary`       | Neutral notifications (e.g. "Data refreshed")   |

**Behaviour:**

- Entrance: fade-up, 150ms, ease-out
- Exit: fade-out, 150ms, ease-in
- Auto-dismiss after 4s — this timing is constant regardless of how many toasts are queued
- Manually dismissable via the `✕` button at any time
- If multiple toasts fire in quick succession, they stack vertically (newest at bottom) with 8px gap
- All animations must be trivially disableable via `prefers-reduced-motion`

**Rules:**

- Toasts are for confirming completed actions — never for prompting the user to act
- Never use a toast where inline feedback (button state change, field validation) is sufficient
- Prefer micro-reactions (e.g. button state flash) over toasts wherever possible — toasts are the fallback for actions without an obvious inline feedback target

---

## 3. Page Patterns

### 3.1 Two-Panel Shell

Applies to: Overview, Wealth, Planner. Exempt: Review Wizard, Waterfall Creation Wizard (full-screen modes).

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP NAV                                                        │
├──────────────────┬──────────────────────────────────────────────┤
│                  │                                              │
│  LEFT PANEL      │  RIGHT PANEL                                 │
│  Fixed width     │  Fills remaining space                       │
│  Tier headings   │  Empty / Item list / Item detail             │
│  + totals        │                                              │
│                  │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

**Left panel rules:**

- Always visible; never replaced or navigated away from
- Contains only tier headings and summary totals — no individual items
- Clicking a tier selects it (selected state: left border accent + ~14% tier colour background)
- Content below `PageHeader` is wrapped in `flex-1 min-h-0 overflow-y-auto` — scrolls automatically when content exceeds viewport height

**Right panel rules:**

- Default state: empty (muted placeholder prompt)
- Updates based on left panel selection
- Supports one level of internal depth (tier list → item detail), navigated via breadcrumb
- Never triggers a full page navigation

#### Left Panel Header Anatomy

Every left panel header uses the shared `PageHeader` component (`components/common/PageHeader.tsx`) — never inline markup. No exceptions.

```
Container:  shrink-0 px-4 pt-4 pb-3
Title:      <h1> font-heading text-lg font-bold uppercase tracking-tier + colorClass
Total:      font-numeric text-lg font-semibold + totalColorClass (optional)
```

- `colorClass` defaults to `text-page-accent`; tier pages pass their tier colour
- Content below the header (nav lists, summaries, year selectors) uses `px-4` horizontal padding to align with the header

#### Context Breadcrumb Header

When a left panel represents a named instance (e.g. settings for a specific household), the active instance name may be shown inline in the `PageHeader` using the `contextName` prop:

```
HOUSEHOLD / Snaith
```

- Pass `contextName={instanceName}` to `PageHeader` — never add a separate `<p>` element for this purpose
- The separator `/` renders at `text-foreground/25`
- The instance name renders at `font-body text-xs font-normal normal-case tracking-normal text-foreground/45`
- No hover state, no cursor change — this is static context, not a nav target
- Do not use this pattern for navigational breadcrumbs; those use the `← Category / Item` pattern in right-panel headers

#### Left Panel Navigation Anatomy

Tab-style navigation lists (subcategory lists, forecast sections, gift modes) follow a single pattern:

```
Button:     relative flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors
Active:     font-medium text-{accent}
Inactive:   text-foreground/60 hover:bg-{accent}/5
Indicator:  absolute inset-0 bg-{accent}/14 border-l-2 border-{accent} rounded-r-sm
Value:      relative z-10 font-numeric text-xs text-foreground/50
```

Where `{accent}` is `page-accent` (default), `tier-{name}` (waterfall pages), or `tier-discretionary` (gifts).

#### Left Panel Footer Anatomy

Optional total footer pinned to the bottom of the left panel:

```
Container:  border-t border-foreground/10 px-4 py-3 flex justify-between text-sm
Label:      text-foreground/50
Value:      font-numeric font-semibold + accent colour class
```

#### Right Panel Header Anatomy

Every right panel begins with a header bar. The structure is fixed:

```
Container:  flex items-center justify-between px-4 py-3 border-b border-foreground/5
Title:      <h2> font-heading text-base font-bold text-foreground
Count:      text-xs text-foreground/40               (optional — "{n} items")
Total:      font-numeric text-sm text-page-accent    (optional — tier pages use config.textClass)
Add button: GhostAddButton pattern                   (optional)
```

**GhostAddButton pattern** (for all add buttons in panel headers):

```
rounded-md border px-3 py-1 text-xs font-medium transition-all duration-150
border-foreground/20 text-foreground/60
hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80
disabled:cursor-not-allowed disabled:opacity-40
```

Reference implementation: `components/tier/GhostAddButton.tsx`.

---

### 3.2 Right Panel States

**State 1 — Empty (nothing selected)**

- Muted placeholder: "Select any item to see its detail"
- No structural chrome, no CTA
- Exception: if the page has no data at all, this state shows the relevant empty-state CTA instead

**State 2 — Tier selected (item list view)**

- Breadcrumb: tier name only, in tier colour (`font-body`, weight 600, 9px, uppercase, 0.08em letter-spacing)
- List of all items in the tier, each as an `ItemRow`
- "Add item" row at the bottom of the list — inline, not a modal trigger
- Clicking an item transitions to State 3

**State 3 — Item selected (detail view)**

- Breadcrumb: `← Tier name / Item name` — the `←` navigates back to State 2
- Item value at 30px, `font-numeric`, weight 800, `text-primary`
- "Last reviewed" text at 12px, `text-tertiary` (amber attention text if stale)
- 24-month history graph (sparkline)
- `ButtonPair`: `[ Edit ]  [ Still correct ✓ ]`
- `NudgeCard`: shown below the button pair when relevant; absent otherwise

**Transitions:** direction-aware slide, 150–200ms, ease-out on entrance / ease-in on exit:

- Navigating deeper (State 2 → State 3): slide-left entrance
- Navigating shallower (State 3 → State 2 via breadcrumb): slide-right entrance
- Returning to empty (State 2/3 → State 1): fade-out

All transitions must be trivially disableable via `prefers-reduced-motion`.

---

### 3.3 Left Panel — Overview Specifics

**The left panel shows tier summaries only.** Individual waterfall items (income sources, bills, discretionary categories) are never displayed in the left panel — they appear in the right panel when a tier is selected.

The Overview left panel layout from top to bottom:

```
  Timeline navigator (snapshot dots)
  ─────────────────────────────────
  ● INCOME                  £8,856     ← #0ea5e9 electric blue
  │
  → minus committed spend
  │
  ● COMMITTED SPEND         £4,817     ← #6366f1 indigo     [● 3 stale]
  │
  → minus discretionary
  │
  ● DISCRETIONARY           £3,830     ← #a855f7 purple
  │
  ─────────────────────────────────
  = SURPLUS           £209 · 2.4%      ← #4adcd0 teal-mint
```

- Four `WaterfallTierRow` components — tier name in solid tier colour, total, and optional attention badge
- Three `WaterfallConnector` components between them
- Surplus row is visually distinct — heavier weight, 24px value, the visual terminus of the cascade

---

### 3.4 Wealth & Planner — Page Layout Notes

Wealth and Planner follow the same two-panel shell (§ 3.1) and right panel state machine (§ 3.2) as Overview. The differences are:

- **No waterfall tiers.** The left panel lists asset classes (Wealth) or planning categories (Planner) instead of tier rows. Selected state uses `page-accent` (`#8b5cf6`), not a tier colour.
- **No connectors.** The left panel is a plain list — no `WaterfallConnector` elements.
- **Headline figure.** Each page has a single dominant summary value at the top of the left panel (e.g. net worth for Wealth). `font-numeric`, weight 800, `text-primary`.

Page-specific layout, data models, and interaction details are defined in the individual backlog specs (e.g. `wealth-accounts-spec.md`, `planner-purchases-spec.md`). This design system covers the shared patterns; the specs cover the page-specific content.

---

### 3.5 Empty States

Every empty state teaches the interface structure and guides the user forward. Three patterns:

#### Ghosted Cascade (No Waterfall)

When the overview has no waterfall data, show a ghosted version of the full cascade:

- Four tier headers at ~25% opacity with tier colours and "£—" placeholder amounts
- Cascade connectors at ~20% opacity ("minus committed", "minus discretionary", "equals")
- Callout gradient CTA card below with "Build your waterfall" heading and "Get started" button

This teaches the waterfall mental model before the user builds it.

#### Contextual Hint (Right Panel — Nothing Selected)

When no item is selected, the right panel shows:

- Small SVG icon (20×20, `#475569` stroke, two-panel layout representation)
- Page-aware guidance text (e.g. "Select an item from the waterfall to view its history and details")
- Keyboard hint badges (deferred until keyboard navigation is implemented)

#### Fading Skeleton + CTA Card (List Empties)

When a list has no items (accounts, purchases, gifts, etc.):

- 2-4 ghosted skeleton rows (name placeholder + amount placeholder) with progressively fading opacity: 100% → 80% → 50% → 25%
- Callout gradient CTA card with contextual text and "+ Add" button
- CTA text adapts per context (e.g. "Add your savings accounts to track balances and contributions")
- For informational lists (e.g. ended income sources), show skeleton rows only — no CTA

**Callout gradient CTA card spec:**

```
background: linear-gradient(135deg, rgba(99, 102, 241, 0.07) 0%, rgba(168, 85, 247, 0.05) 100%)
border: 1px solid rgba(99, 102, 241, 0.1)
border-radius: 8px
padding: 14px 16px
```

**Rule:** silence = approval _only when data exists_. When data is absent, the app guides the user forward.

---

### 3.6 Full-Screen Focused Surfaces

Full-screen focused surfaces are exempt from the two-panel layout rule (Anchor 17). Two sub-classes exist:

#### Wizards

Step-based onboarding / review flows with dedicated forward/back navigation. Example: Review Wizard.

- Dedicated step navigation chrome (Next / Back / Exit)
- Progress indication visible throughout
- Linear flow — back-only navigation between completed steps

#### Workbench surfaces

Dense, bulk-entry, single-page surfaces that reinforce a core mental model. Example: Full Waterfall (`/waterfall`) — three tier tables stacked in cascade order with per-row auto-save.

- Minimal top-bar chrome — page title + close/back button only
- No left panel; content lives in a full-width centered column
- No multi-step chrome (no Next/Back/progress); the whole surface is one unit
- Content must reinforce the cascade or another core anchor — e.g. waterfall connectors between tier tables, a read-only Surplus strip at the cascade terminus
- Per-row auto-save is preferred so the surface has no dirty-state guard on exit

**Rules that still apply inside all full-screen surfaces:**

- `ButtonPair` rightmost-is-affirmative rule
- Language rules (budgeted/planned, not spent/paid)
- Staleness principles (informational, not blocking)
- Calm-by-default — silence = approval when values are healthy

---

### 3.7 Card Component

Used in the Review Wizard, Waterfall Creation Wizard summary step, and anywhere a discrete item needs visual separation.

**Anatomy:**

- Background: `surface` token
- Border: 1px, `surface` border token (`#1a1f35`)
- Border-radius: 8px
- Padding: 24px (`p-6`)
- No shadow

**Variants:**

- **Default** — `surface` background + border
- **Stale** — same as default, but `StalenessIndicator` is present with attention amber detail text

**Rule:** cards use `surface` elevation to distinguish themselves from the page background. No shadows.

---

### 3.8 Liquidity Classification

Assets are classified into three liquidity tiers for analytical purposes. These are **not** used as primary navigation — users navigate by asset class (Savings, Pensions, Property, etc.). Liquidity is surfaced as a secondary breakdown in the Wealth page summary.

| Tier                   | Description                           | Examples                                       |
| ---------------------- | ------------------------------------- | ---------------------------------------------- |
| Cash & Savings         | Accessible immediately                | Cash, savings accounts, ISAs                   |
| Investments & Pensions | Accessible with delay or restrictions | Pensions, stocks & shares, investment accounts |
| Property & Vehicles    | Not readily convertible to cash       | Property equity, vehicles, physical assets     |

---

### 3.9 Trust Savings (Held on Behalf Of)

Some savings are managed by the household but legally owned by a third party (e.g. a child's Junior ISA). These accounts are:

- Tracked with the same features as household savings (history, staleness, contributions)
- Clearly labelled "Held on behalf of [Name]"
- **Excluded from household net worth calculations**
- Displayed in a ring-fenced section below the main Wealth summary

---

### 3.10 Asset Valuation

Assets are recorded at **equity value** — what the user owns outright, not the total asset value. This avoids separately tracking associated debt (e.g. a property worth £300,000 with a £200,000 mortgage = equity value £100,000).

Every valuation update requires a **valuation date**, which defaults to today but can be set to any past date. This ensures the history graph accurately reflects when a value was true, not when it was entered.

---

### 3.11 Savings ↔ Waterfall Linkage

Monthly savings allocations are defined in the waterfall (Discretionary → Savings). Each allocation can optionally be linked to a specific account on the Wealth page. When linked:

- The Wealth page uses the contribution rate for forward projections
- The system can check ISA annual allowance limits per linked account
- Rate optimisation nudges can compare contribution rates across linked accounts

Linking is optional. Both pages function independently without it.

**ISA allowance is tracked per person, not per account.** Where a person holds multiple ISA accounts, contributions are summed against a single person-level annual limit. Household members each have independent allowance tracking.

---

## 4. Interaction Rules

### 4.1 Language

**Product naming:** always write the product name as **finplan** — lowercase, one word, no variations. This applies to UI copy, metadata, documentation, and the header wordmark.

**Always use:** "budgeted", "planned", "allocated", "expected", "set aside"

**Never use:** "spent", "paid", "charged"

The app tracks what users _intend_, not what they _did_. Language must consistently reflect that.

---

### 4.2 Staleness

- Every value carries a `lastReviewedAt` timestamp
- Stale threshold is configurable per category (defaults: salary 12 months, energy 6 months)
- Staleness is communicated through the attention system: amber dot + amber detail text
- **Staleness is informational only — it never blocks user action**
- A user can always proceed, edit, confirm, or navigate regardless of stale state
- Stale items surface first in the Review Wizard

---

### 4.3 Nudges

- Appear in the right panel only, contextual to the selected item
- One at a time — never stacked
- Phrased as information + arithmetic, never as recommendations
- Use the attention system visual treatment (amber-tinted card)
- Absent when no opportunity exists — silence = approval
- Examples:
  - ✓ "Your ISA allowance has £11,600 remaining before April"
  - ✓ "Redirecting £50/mo to this account could earn ~£180 more per year"
  - ✗ "You should top up your ISA"
  - ✗ "We recommend moving your savings"

---

### 4.4 Colour Signal Rules

> Quick-reference summary of the rules defined per token in § 1.2. When in doubt, § 1.2 is authoritative.

1. **Tier colours are semantically protected** — Income blue, Committed indigo, Discretionary purple, and Surplus teal are exclusively reserved for their waterfall tier. Never repurpose for status, attention, or other UI signals.
2. **Callout gradients are for engagement only** — the gradient text treatment is special and inviting. Never use it for warnings, attention items, or informational alerts.
3. **Red is only for app errors** — validation failures, system errors, destructive action confirmation. Never for financial shortfalls, negative balances, or over-budget states.
4. **Green is only for UI confirmations** — saved, completed, synced. Never for positive balances, surplus amounts, or any financial value.
5. **Amber is the attention colour** — one colour (`#f59e0b`), one pattern (dot + text). Used for staleness, cashflow warnings, and anything "noteworthy." No variations in hue or saturation.
6. **Tier headings are solid colours** — the tier's primary colour, not gradient. Gradient text is reserved for callout words.
7. **If a value is fine, show nothing** — silence = approval. No green ticks, no "all good" badges.

---

### 4.5 Snapshot Read-Only Mode

When a historical snapshot is loaded:

- A "Viewing: [snapshot name]" banner replaces the timeline navigator
- All values are read-only — no edit controls, no `ButtonPair`
- The history graph shows a vertical marker at the snapshot date for orientation
- Right panel headline value reflects the snapshot date, not current value
- Returning to the live plan: banner dismissed, full edit controls restored

**Snapshot naming rules:**

- Names must be unique within a household
- If a user enters a duplicate name, highlight the save field with a validation message
- Auto-generated names (e.g. "January 2026 — Auto") are reserved and cannot be duplicated by user-created snapshots

---

### 4.6 Tooltips

- Used for three purposes: (1) staleness age on `StalenessIndicator` hover, (2) term definitions on hover for financial terminology, (3) explanations on hover for any standalone icon that carries meaning but has no visible label text
- Tooltip definitions for financial terms and functional icons are maintained in `definitions.md`
- No in-app glossary — contextual tooltips are the only explanation mechanism
- Tooltip text: 12px, `font-body`, `surface-overlay` background
- **Rule:** any icon not accompanied by visible label text must have a tooltip. No icon-only UI element may be left without one.

---

### 4.7 Action Feedback

Every user action that changes state must produce visible feedback.

| Action type                                   | Feedback mechanism                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Instant (copy, toggle, confirm, button press) | Micro-interaction on the element itself (e.g. copy icon → "Copied!" chip for 2s; button press → `scale(0.97)`) |
| Async (save, sync)                            | Loading state on triggering button → success/error toast on completion                                         |
| Staleness confirmation ("Still correct ✓")    | Brief `success` colour flash on the button, then normal                                                        |
| Wizard step completion                        | Brief confirmation before advancing to next step                                                               |
| Destructive confirmation (delete)             | Modal confirmation before proceeding                                                                           |

Toast notifications: non-blocking, anchor consistently (bottom-right), auto-dismiss after 4s, dismissable manually. Background: `surface-elevated`.

### 4.8 Micro-Animations

Meaningful motion communicates spatial relationships. All animations follow this spec:

| Transition                              | Direction                        | Duration  | Easing         |
| --------------------------------------- | -------------------------------- | --------- | -------------- |
| Right panel deeper (State 2 → State 3)  | Slide-left entrance              | 150–200ms | ease-out-quart |
| Right panel shallower (breadcrumb back) | Slide-right entrance             | 150–200ms | ease-out-quart |
| Tier page left panel subcategories      | Stagger from left (x: -22px → 0) | 200ms/row | ease-out-quart |
| Wizard step forward                     | Slide-left                       | 150–200ms | ease-out-quart |
| Wizard step back                        | Slide-right                      | 150–200ms | ease-out-quart |
| Toast entrance                          | Fade-up                          | 150ms     | ease-out-quart |
| Toast exit                              | Fade-out                         | 150ms     | ease-in        |

**Easing Canon**

Two canonical curves. Use these; never `ease`, `ease-in-out`, or bounce/elastic variants:

| Name             | Curve                            | Use for                                            |
| ---------------- | -------------------------------- | -------------------------------------------------- |
| `ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)`  | Entrances, stagger, panel slides, most transitions |
| `ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | Pop-in moments (achievement, modal appear)         |

**Rules:**

- Duration: 150–200ms for interactions. Motion must never feel like a delay.
- Animate `transform` and `opacity` only — GPU-accelerated. Never animate `width`, `height`, `top`, `left`, `padding`, or `margin`.
- No bounce or elastic easing — they feel dated and draw attention to the animation itself.
- All animations must be trivially disableable via `prefers-reduced-motion`. In Framer Motion: pass `initial={false}` on the container when `usePrefersReducedMotion()` returns true.

---

#### Pattern 1 — Panel/Section Stagger Entrance

**What:** A sequence of sibling content blocks fades and lifts into place top-to-bottom on mount.

**When to use:**

- A panel mounts with 3+ sibling blocks that have a natural reading order or conceptual flow (e.g. the waterfall tiers Income → Committed → Discretionary → Surplus)
- The sequence reinforces a hierarchical or causal relationship between blocks — one leads to the next

**When NOT to use:**

- Individual items within a repeating list — too much motion for many items
- Panels that update in response to user interaction mid-session — stagger only on initial mount, not on data refresh
- Modals, drawers, or overlays — these use a single entrance, not stagger

**Spec:** `staggerChildren: 0.06` (60ms between blocks), `250ms` per block, `y: 6→0 + opacity: 0→1`, `ease-out-quart`. Total duration scales with block count (7 blocks ≈ 610ms). Use Framer Motion `variants` propagation pattern: container sets `staggerChildren`, children carry `variants`.

---

#### Pattern 2 — Delight Glow

**What:** A brief radial ambient glow pulses in and fades over ~2s on mount, drawing quiet attention to a meaningful outcome.

**When to use:**

- A "payoff" moment — the UI reveals something the user worked toward in their planning session
- The outcome is non-judgmental: not a health score, not a target hit/miss — just the natural conclusion of the cascade
- The element is visible on mount without user interaction required to reach it
- Current instance: surplus section when `surplus.amount > 0`

**When NOT to use:**

- Any financial value judgement (positive or negative balance, over/under budget)
- Routine interactions (saving a form, confirming a review)
- Elements that update frequently mid-session — this is a mount-only animation
- As a warning or attention signal — amber is the only attention mechanism; glow is delight only

**Spec:** `opacity: 0→1→0` over 2s with 500ms delay. Overlay only (`position: absolute, pointer-events: none`). Colour: the section's tier colour at 9% opacity as a radial gradient (`radial-gradient(ellipse at 50% 50%, hsl(... / 0.09) 0%, transparent 70%)`). GPU-only — opacity animation on a positioned element.

---

#### Pattern 3 — Button Press Feedback

**What:** All `<Button>` components scale to 0.97 on `:active`, returning to 1 on release.

**When to use:** Always — baked into the `Button` CVA base class. No per-instance decision required.

**Extension:** For non-Button interactive surfaces (custom clickable rows, icon-only triggers), consider adding `active:scale-[0.98]` manually when the element is large enough to benefit from tactile feedback.

**Spec:** `active:scale-[0.97]`, `transition-property` includes `transform`, `duration-150 ease-out`.

---

### 4.9 Micro Charts

Prefer micro charts over tables for time-series and comparative data:

- History sparklines in the right panel detail view (24-month window)
- Comparison bars for the Wealth liquidity breakdown
- ISA allowance remaining as a progress bar

**Rule:** no more than 2–3 micro charts visible simultaneously in any single view. When a view would otherwise require more, show the most contextually relevant ones and link to a full breakdown.

Chart library: Recharts.

---

### 4.10 Progressive Disclosure

Forms capture only mandatory fields by default.

| Field condition                   | Visibility                                                  |
| --------------------------------- | ----------------------------------------------------------- |
| Mandatory field                   | Always visible                                              |
| Optional field, no existing data  | Hidden behind "+ More options" reveal                       |
| Optional field, has existing data | Always shown — never hide a user's own data behind a toggle |

The reveal action label: "+ More options" or "+ Optional details". It is always present if optional fields exist, even if all optional fields are already shown (because data is pre-populated).

---

### 4.11 Inline Edit Form (Transform in Place)

When the user clicks `[ Edit ]` in a right panel detail view (State 3), the form opens **in place** — the existing detail view converts to an edit form. No navigation occurs. The breadcrumb does not change.

**Before click (detail view):**

```
  ← Committed / British Gas
  £122 / month
  Last reviewed: Jan 2026 ✓
  [sparkline]
  [ Edit ]   [ Still correct ✓ ]
```

**After click (edit form, same panel position):**

```
  ← Committed / British Gas
  Name   [ British Gas         ]
  Amount [ 122                 ]
  + More options
  [ Cancel ]   [ Save ]
```

**Rules:**

- The breadcrumb (`← Committed / British Gas`) remains unchanged — the user has not navigated
- The sparkline history disappears during edit; it returns when the form is saved or cancelled
- `[ Cancel ]` reverts to the detail view without saving
- `[ Save ]` saves the changes and returns to the detail view, updated
- The rightmost button is always the affirmative action — `[ Save ]` is always on the right

---

### 4.12 Loading Strategy

The app uses **skeleton screens** for all data-loading states — never a full-page spinner.

**On initial page load or household switch:**

- Left panel: render the `SkeletonLoader` left panel variant (4 tier-row blocks + connectors)
- Right panel: render the empty placeholder state (not a skeleton — the right panel has nothing to load until a tier is selected)

**On tier selection (right panel loading):**

- If data loads in under 150ms: render directly, no skeleton shown
- If data takes longer: show the `SkeletonLoader` right panel variant until the data arrives

**Rules:**

- Skeletons mirror the layout they will replace — same heights, same positions
- Never use a spinner in place of a skeleton for panel-level loading
- Async button operations (save, confirm) use the button loading state (spinner in the button), not a panel skeleton

---

### 4.13 Error Handling

When a data sync fails, the app retains the last known data and surfaces the failure non-destructively.

**On sync failure:**

1. Show a toast (bottom-right, error variant): "Couldn't connect — using last synced data"
2. Show the `StaleDataBanner` above the panels (attention amber): "Data may be outdated — last synced [N minutes ago]"
3. Continue showing cached data; the user can still navigate and view

**Auto-retry:**

- The app retries silently in the background
- On successful resync: the `StaleDataBanner` auto-dismisses; a success toast confirms: "Data refreshed"
- Manual retry: the "Retry" link in the `StaleDataBanner` triggers an immediate attempt

**Rules:**

- Never use `error` (red) for connectivity failures — this is `attention` amber
- Never blank out the UI or show an error page for a connectivity failure
- If data has never loaded (fresh session, first load fails): show an inline error in the panel with a prominent retry button

---

## 4a. Data States

Every query-driven panel must handle all four data states. No panel should ever render blank space.

### Decision Table

| Condition                         | What to render                          | Component          |
| --------------------------------- | --------------------------------------- | ------------------ |
| `isLoading && !data`              | Ghost skeleton (no shimmer, no content) | `SkeletonLoader`   |
| `isError && !data`                | Ghost skeleton + blur overlay + retry   | `PanelError`       |
| `isError && data`                 | Stale data (visible) + amber banner     | `StaleDataBanner`  |
| `!isLoading && !isError && empty` | Ghosted placeholder + guidance text     | `GhostedListEmpty` |
| Success                           | Content                                 | —                  |

### Components

**`SkeletonLoader`** (`variant: "left-panel" | "right-panel"`)

- Static ghost skeleton — no shimmer, no animation
- Used for initial load only (`isLoading && !data`)

**`PanelError`** (`variant: "left" | "right" | "detail"`, `onRetry`, `message?`)

- Static ghost skeleton at opacity 0.30, colour `#2a3f60`
- Overlay: `rgba(8,10,20,0.70)` + `backdrop-filter: blur(2px)`
- "Failed to load" in `--destructive` red
- Optional contextual message in `--muted-foreground`
- Retry button in destructive-subtle style
- Red is for app errors only — never financial values

**`StaleDataBanner`**

- Amber — the only attention signal in the app
- Shown globally in `Layout.tsx` via `useStaleDataBanner` hook
- Appears only when `isError && data` (background refetch failure)
- Retry refetches all errored queries

**`GhostedListEmpty`** (`ctaText`, `ctaButtonLabel?`, `showCta?`)

- Used when a query succeeds but returns an empty array
- Provides contextual guidance and optional CTA

### Rules

1. Never render blank space — one of the four states must always render
2. Retry is always explicit user action — no auto-retry polling
3. Stale data stays visible on background failure — no jarring replacement
4. `PanelError` red is scoped to app errors only — never on financial values
5. `StaleDataBanner` amber is the only attention signal — it is informational, never blocking

---

## 5. Icons

### 5.1 Library Priority

Icons must be sourced in this order:

1. **Lucide** — primary (already a dependency via shadcn/ui)
2. **Phosphor** — secondary, Regular weight only (for stroke consistency with Lucide)
3. Any other interface library — last resort; add a comment explaining why

Do not mix icon styles within a single component. Never use emojis as icon substitutes.

### 5.2 One Icon, One Meaning

The same icon must not be reused for two different meanings anywhere in the app. If a concept needs a visual representation, it gets a dedicated icon. The canonical icon map below is the authoritative reference.

**Canonical Icon Map** (extend as icons are confirmed during implementation):

| Meaning                  | Icon name          | Library |
| ------------------------ | ------------------ | ------- |
| Staleness / needs review | `AlertCircle`      | Lucide  |
| Snapshot                 | `Camera`           | Lucide  |
| Edit / modify            | `Pencil`           | Lucide  |
| Delete / remove          | `Trash2`           | Lucide  |
| Link / connected         | `Link2`            | Lucide  |
| Confirmed / reviewed     | `CheckCircle2`     | Lucide  |
| Add / create             | `Plus`             | Lucide  |
| Navigate back            | `ChevronLeft`      | Lucide  |
| Navigate deeper          | `ChevronRight`     | Lucide  |
| Settings                 | `Settings`         | Lucide  |
| Household / members      | `Users`            | Lucide  |
| Income source            | `Wallet`           | Lucide  |
| Copy                     | `Copy`             | Lucide  |
| Close / dismiss          | `X`                | Lucide  |
| Information              | `Info`             | Lucide  |
| Loading / pending        | Spinner (animated) | custom  |

### 5.3 Icons with Text

When an icon appears inline beside label text:

- Icon size = cap height of the adjacent text
- Gap: 4–6px (half to one grid unit)
- Alignment: vertically centred on the text baseline
- Gap must not exceed 8px (one grid unit)

### 5.4 Icon-Only Elements

Any icon without accompanying visible label text must have a tooltip on hover (see Section 4.6).

---

## 6. Images as Identifiers

### 6.1 Scope

Any named data entry may be assigned a main image. This applies across:

- Wealth page: savings accounts, pension providers, investment platforms, property
- Overview waterfall: income sources, bill items, discretionary categories
- Planner: purchases, gift recipients

### 6.2 Sources

Images may be:

1. **Selected from the curated library** — logos for common UK institutions and providers, bundled or statically served
2. **User-uploaded** — stored per household; max file size and accepted formats confirmed at implementation

**Curated library starting set:**

| Category                 | Examples                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| Banks / current accounts | Monzo, Barclays, HSBC, Lloyds, NatWest, Starling, Santander, Halifax |
| Savings / ISA platforms  | Marcus, Zopa, Chase, NS&I                                            |
| Pension providers        | Vanguard, Aviva, Legal & General, Scottish Widows, Nest, PensionBee  |
| Investment platforms     | Vanguard, Fidelity, Hargreaves Lansdown, Trading 212                 |
| Utilities                | British Gas, Octopus Energy, EDF, E.ON                               |
| Telecoms / broadband     | Sky, Virgin Media, BT, Vodafone, EE, Three                           |
| Streaming                | Netflix, Spotify, Apple, Disney+, Amazon                             |

### 6.3 Fallback

When no image is assigned, display an `EntityAvatar` placeholder:

- Background: a deterministic colour derived from the entry name (using the existing colour token palette)
- Content: 1–2 initials from the entry name, `font-heading`, white

The placeholder must not feel like an error state — it is the default, expected appearance for new entries.

### 6.4 Display Rules

- Displayed at a consistent size per context (exact dimensions confirmed at implementation)
- Images are always circular (border-radius: full) at row/list scale; may be rounded-square at larger detail scale
- No image border unless needed for contrast against background — use a subtle border token ring if required

---

## 7. Top Navigation Bar

The top navigation bar spans the full width above both panels, present on all pages.

**Anatomy:**

```
  finplan    Overview  Wealth  Planner    [Household ▾]  [◉]
```

- **Wordmark**: left-aligned, `font-heading`, `font-bold`, `text-lg`, `tracking-tight`. The canonical product name is **finplan** — lowercase, one word. Never "FinPlan", "Fin Plan", "FINPLAN", or any other variation. This applies to the header, documentation, and all user-facing text.
- **Navigation links**: `Overview`, `Wealth`, `Planner`, and any other page-level entries — `font-heading`, weight 500. Settings is **not** a nav link; it is accessed via the profile avatar (personal) and the household switcher (household).
- **Household switcher**: right-aligned, dropdown exposing both household switching and household-scoped entry points. Active household name is always visible on the trigger.
- **Profile avatar**: rightmost, circular (32px, `rounded-full`), initials fallback or user-selected image. Replaces the legacy "User menu" text trigger. Contains the personal entry point (`Profile settings`) and sign-out.

**Active state:**

- Active nav item: `action` colour underline, 2px, below the link text; text in `text-primary`
- Inactive items: `text-secondary`
- Hover: `text-primary`, no underline

**Bar treatment:**

- Background: `background` token (same as page — flush, no border below, no shadow)
- Height: 48px
- The bar is visually continuous with the page — only the content below it is sectioned by the panel border

**Rules:**

- The household switcher label always shows the name of the currently active household
- Switching households reloads the active page's data immediately
- On tier-specific pages (Overview), the active nav item uses the `action` colour, not a tier colour — the nav is a global element

### 7.1 Household Switcher Dropdown

The household switcher is the unified entry point for all household-scoped interactions.

**Anatomy (open):**

```
  [ Snaith ▴ ]
  ┌────────────────────────────┐
  │  SWITCH HOUSEHOLD          │
  │   Snaith           ✓       │
  │   Parents                  │
  │  ────────────────────────  │
  │   ⚙  Household settings    │
  │   +  Create new household  │
  └────────────────────────────┘
```

- Two groups separated by a 1px divider (`rgba(238,242,255,0.08)`):
  1. **Switch household** — header label plus one row per household. Current household marked with a `Check` icon (`action` colour) on the right.
  2. **Actions** — `Household settings` (navigates to `/settings/household`) and `+ Create new household`.
- Panel: `surface-overlay` background, `surface-overlay` border, border-radius 8px, padding 6px
- Group header: `font-heading`, 10px, uppercase, 0.1em letter-spacing, `text-tertiary`
- Item: `font-body`, 13px, `text-secondary`; hover `rgba(124,58,237,0.12)` background

**Rules:**

- Anchored `right-0` to the trigger — **never** `left-0` — so the dropdown cannot overflow the right edge of the viewport.
- `max-height: min(420px, 100vh - 70px)` with `overflow-y-auto` — long household lists scroll internally.
- "Household settings" is visible to all household members; role-based gating happens inside the page, not in the dropdown.

### 7.2 Profile Avatar Dropdown

The profile avatar is the unified entry point for personal settings and session actions.

**Anatomy (open):**

```
  ( JS )
  ┌────────────────────────────┐
  │   Josh Snaith              │
  │   snaith2@gmail.com        │
  │  ────────────────────────  │
  │   👤  Profile settings     │
  │   ↪   Sign out             │
  └────────────────────────────┘
```

- Avatar trigger: 32px, `rounded-full`, initials fallback uses a deterministic colour derived from the user's name (same mechanism as `EntityAvatar` § 6.3); on hover, a 2px `rgba(124,58,237,0.4)` ring; on `:active`, `scale(0.97)`.
- Header block: user name (13px, `font-body`, weight 600, `text-primary`) + email (11px, `text-tertiary`).
- Separator: 1px horizontal divider at `rgba(238,242,255,0.08)`.
- Items: `Profile settings` (navigates to `/settings/profile`), `Sign out` (clears session).

**Rules:**

- Anchored `right-0` — avatar sits flush to the right edge of the nav.
- Same `max-height` rule as the household switcher.
- The avatar is the **only** user-menu trigger — there is no legacy text "User ▾" link.

---

## 8. Settings Page

Settings is split into **two separate pages** by scope. Both use the canonical two-panel shell (§ 3.1) with Settings-specific exceptions noted below.

### 8.1 Two Pages, Two Entry Points

| Page                   | Route                 | Entry point                                                | Scope                                |
| ---------------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------ |
| **Profile Settings**   | `/settings/profile`   | Profile avatar dropdown (§ 7.2) → `Profile settings`       | Personal — applies across households |
| **Household Settings** | `/settings/household` | Household switcher dropdown (§ 7.1) → `Household settings` | Per-active-household                 |

`/settings` redirects to `/settings/profile`.

There is no top-nav text link labelled "Settings" — each scope is reached from its natural trigger.

### 8.2 Left Panel

Both pages use a canonical `PageHeader` (§ 3.1) with `text-page-accent`.

- **Profile Settings** — title "Profile"; sub-label "Your personal preferences" in `text-tertiary`, 11px, `font-body` 500. **Flat nav** (no groups): `Account`, `Display`.
- **Household Settings** — title "Household"; active household name displayed inline via the `contextName` prop on `PageHeader` (see Context Breadcrumb Header in § 3.1) — reads as static context, not a nav target. **Grouped nav**:
  - **General** — `Details`, `Members & invites`
  - **Financial** — `Surplus benchmark`, `ISA settings`, `Staleness thresholds`, `Growth rates`
  - **Structure** — `Subcategories`
  - **Advanced** — `Data`, `Audit log`

Group headers use the canonical section-label treatment (§ 1.3): `text-xs font-medium uppercase tracking-wider text-muted-foreground`. Nav items use the standard indicator-pattern treatment (§ 3.1 — `bg-page-accent/14 border-l-2 border-page-accent rounded-r-sm`) — never a full-fill `bg-accent`.

Role-based visibility (Household Settings):

- **Owner** — all sections
- **Admin** — all except `Data`
- **Member** — all non-gated sections (Details, Members & invites visible; editability governed by existing role rules)

### 8.3 Right Panel — Scroll-Spy Exception

**Exception to § 3.2 state machine.** Unlike other two-panel pages, the Settings right panel renders **all sections simultaneously in a single scrolling page**. This is the correct shape for Settings because users routinely cross-reference multiple sections in one session.

- Left-nav click: sets the active highlight immediately, then smooth-scrolls the right panel to the section.
- Page scroll: updates the active highlight via `IntersectionObserver` (threshold `0.3`, root = the scroll container).
- Right-panel header is **sticky** (`position: sticky; top: 0; z-index: 2; background: var(--background)`) so it remains visible through scroll.
- Vertical rhythm: `space-y-12` between sections (§ 1.4 exception).
- Horizontal divider between each section (`border-t border-foreground/6`) to visually separate them without relying on spacing alone.
- Section titles: `font-heading`, weight 700, uppercase, 0.06em letter-spacing, `text-page-accent`.
- Section description (optional): `font-body`, 13px, `text-tertiary`, `line-height: 1.55`, `margin-bottom: 16px`.

### 8.4 Auto-Save — Default Save Model

Settings is auto-save by default. Users never click a Save button for routine edits.

| Input type                          | Save timing                         |
| ----------------------------------- | ----------------------------------- |
| Text input                          | Debounce 600ms after last keystroke |
| Checkbox / toggle / select / slider | Immediate on change                 |

**Success micro-reaction** (aligns with § 4.7 "prefer micro-reactions over toasts"):

- Input border pulses `success` green over ~1.5s (keyframe animation — ring fades to transparent, border returns to `surface-border`).
- Inline "✓ saved" flash in `success` green, `font-body` 500, 10.5px, appears next to the field label for ~1.5s then fades.
- **No toast** on success.

**Failure:**

- Revert the field to the last-known server value.
- Inline red helper text below the input: `Couldn't save — try again` (`error` token, `font-body`, 11px).
- **No toast** on failure.

All motion must be trivially disableable via `prefers-reduced-motion` (replace the pulse with a 100ms colour switch, replace the inline flash with a static "Saved" label that renders for 1.5s then unmounts).

### 8.5 Destructive Actions — Exempt from Auto-Save

Destructive actions in Settings (e.g. "Leave household", "Remove member", "Reset data", "Cancel invite") are **exempt from the auto-save model**. They must always:

- Use `ConfirmationModal` (§ Component Catalogue) for confirmation — the destructive button uses the `error` token.
- Be visually separated from non-destructive controls in the right panel (below a horizontal divider).
- State the consequence plainly in the modal body (e.g. "You will lose access to this household's data. This cannot be undone.").

---

## 9. Page-Specific Colour Notes

### Overview

Each tier uses its own semantic colour for headings, accent bars, and value text. The left panel is a vertical cascade of four distinct colours reinforcing the waterfall mental model.

### Wealth & Planner

These pages sit outside the core waterfall tier-colour system. Section headings and breadcrumbs use `page-accent` (`#8b5cf6` soft violet), giving them a distinct visual identity without borrowing from or conflicting with the four tier colours.

Status indicators within these pages follow the standard rules:

- Attention items (noteworthy observations): `attention` amber
- App errors: `error` red
- UI confirmations: `success` green
- Financial values: never colour-coded as good/bad

---

## 10. Design Personality

- **Bold type** — Outfit 800 for all tier headings and headlines
- **Ambient background depth** — radial glows, never flat black
- **Callout word gradients** — reserved for engagement highlights, not tier headings
- **Generous deliberate spacing** — 8px grid, spacious by default
- **Colour as signal, not decoration** — used sparingly and meaningfully
- **Monochromatic cool palette** — indigo / blue / violet / teal family throughout
- **Non-judgemental** — no good/bad colour coding of financial positions

---

## Microcopy

### Toast Messages

**Success:** Specific noun-phrase, past tense. Use `"saved"` not `"updated"`, `"removed"` not `"deleted"`, `"sent"` not `"created"`. Use contractions: `"you've"` not `"you have"`. No exclamation marks. No emoji.

Examples:

- `"Amount saved"` ✓ — `"Amount updated!"` ✗
- `"Purchase removed"` ✓ — `"Purchase deleted"` ✗
- `"You've left the household"` ✓ — `"You have left the household"` ✗

**Error:** `"Couldn't [verb] [noun] — [next step]"`. Next step is context-sensitive:

- Generic: `"try again"`
- Network: `"check your connection"`
- Persistent: `"contact support"`

Example: `"Couldn't save profile — try again"`.

### Delete Confirmations

Heading: `"Remove [Item Name]?"` — never `"Are you sure?"`
Body: `"[Item Name] will be permanently removed from your plan."`
Button: `"Remove"` (not `"Delete"` or `"Confirm"`)

### Empty State Headings (addable lists)

Use a question prompt: `"What [x] do you have?"` / `"What are you saving towards?"`.
Subtext: `"Add your first [x] to begin building your plan"`.

---

## Appendix: Full Token Reference

Quick-reference table of every colour token in the system.

| Token                     | Value                       | Category |
| ------------------------- | --------------------------- | -------- |
| `background`              | `#080a14`                   | Base     |
| `surface`                 | `#0d1120`                   | Surface  |
| `surface-border`          | `#1a1f35`                   | Surface  |
| `surface-elevated`        | `#141b2e`                   | Surface  |
| `surface-elevated-border` | `#222c45`                   | Surface  |
| `surface-overlay`         | `#1c2540`                   | Surface  |
| `surface-overlay-border`  | `#2a3558`                   | Surface  |
| `text-primary`            | `rgba(238, 242, 255, 0.92)` | Text     |
| `text-secondary`          | `rgba(238, 242, 255, 0.65)` | Text     |
| `text-tertiary`           | `rgba(238, 242, 255, 0.40)` | Text     |
| `text-muted`              | `rgba(238, 242, 255, 0.25)` | Text     |
| `tier-income`             | `#0ea5e9`                   | Tier     |
| `tier-committed`          | `#6366f1`                   | Tier     |
| `tier-discretionary`      | `#a855f7`                   | Tier     |
| `tier-surplus`            | `#4adcd0`                   | Tier     |
| `action`                  | `#7c3aed`                   | Accent   |
| `page-accent`             | `#8b5cf6`                   | Accent   |
| `callout-primary`         | `#0ea5e9 → #a855f7`         | Callout  |
| `callout-secondary`       | `#a855f7 → #4adcd0`         | Callout  |
| `attention`               | `#f59e0b`                   | Status   |
| `attention-bg`            | `rgba(245, 158, 11, 0.04)`  | Status   |
| `attention-border`        | `rgba(245, 158, 11, 0.08)`  | Status   |
| `error`                   | `#ef4444`                   | Status   |
| `success`                 | `#22c55e`                   | Status   |

---

_Last updated: March 2026 — design system for the finplan rebuild._
