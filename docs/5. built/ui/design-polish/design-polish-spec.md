---
feature: design-polish
design_doc: docs/plans/2026-03-24-design-polish-design.md
status: implemented
priority: high
deferred: false
phase:
implemented_date: 2026-07-05
---

# Design Polish

## Intention

The interface is functionally correct but emotionally flat. The design system spec describes ambient glows, callout gradients, purposeful typography hierarchy, and polished empty states — but the implementation compresses most of that into a utilitarian baseline. This feature brings the design system to life: atmospheric depth, visual hierarchy, sense of place across pages, and empty states that guide rather than apologise.

## Description

A frontend-only visual polish pass across the entire app. No schema or API changes. Five priority improvements (waterfall tier styling, typography hierarchy, ambient glows, empty states) plus six minor consistency fixes (token usage, button components, checkbox styling, wordmark, confetti, snapshot labels). Also updates `design-system.md` to match the implemented values.

## User Stories

- As a user, I want the waterfall cascade to feel like a flowing sequence (income → minus committed → minus discretionary → equals surplus) so that the mental model is reinforced visually, not just structurally.
- As a user, I want to glance at the left panel and immediately distinguish tier totals from individual items so that I can scan without reading every line.
- As a user, I want each page to have a subtly different visual atmosphere so that I always know where I am in the app.
- As a user with no data, I want empty states that show me what the interface will look like when populated so that I understand the structure before I build it.
- As a user, I want the interface to feel premium and intentional — not like a prototype — so that I trust the tool with my financial planning.

## Acceptance Criteria

### 1. Waterfall Tier Styling

- [ ] All four tier labels use their respective `text-tier-*` colour class (Income blue, Committed indigo, Discretionary purple, Surplus teal)
- [ ] All four tier totals use their respective `text-tier-*` colour class (currently only labels are coloured)
- [ ] Cascade connectors appear between tiers: "minus committed" between Income and Committed, "minus discretionary" between Committed and Discretionary, "equals" between Discretionary and Surplus
- [ ] Connectors use `font-numeric` (JetBrains Mono), 10.5px, `text-muted` colour, with horizontal rules on either side
- [ ] The `border-t` separator on the surplus section is removed (replaced by "equals" connector)
- [ ] Surplus section uses the same `SectionHeader` component as other tiers (no special-case rendering)

### 2. Typography Hierarchy

- [ ] Tier labels: 13px / `font-heading` (Outfit) / font-weight 600 / `tracking-tier` (0.09em) / uppercase
- [ ] Tier totals: 15px / `font-numeric` (JetBrains Mono) / font-weight 600 / tier colour
- [ ] Item names: 13px / `font-body` (Nunito Sans) / font-weight 400 / `text-secondary` (#94a3b8)
- [ ] Item amounts: 13px / `font-numeric` (JetBrains Mono) / font-weight 400 / subtle foreground (#cbd5e1)
- [ ] Metadata (staleness, dates): 12px (unchanged)
- [ ] `docs/2. design/design-system.md` waterfall type hierarchy table updated to match these values

### 3. Ambient Glows

- [ ] Overview page: primary indigo glow (6% opacity) at top-right, secondary violet glow (3.5% opacity) at bottom-left
- [ ] Wealth page: primary blue glow (5% opacity) at top-left, secondary teal glow (3% opacity) at bottom-right
- [ ] Planner page: primary purple glow (5% opacity) at center-right, secondary indigo glow (3% opacity) at bottom-left
- [ ] Settings page: neutral/near-invisible single glow or none
- [ ] Glows implemented as `::before` / `::after` pseudo-elements with `pointer-events: none`
- [ ] Glows use `radial-gradient` with `ellipse` shape fading to `transparent`
- [ ] Glows do not interfere with content interaction (no z-index conflicts)
- [ ] `docs/2. design/design-system.md` updated with per-page glow specifications
- [ ] Glows respect `prefers-reduced-motion` (static, no animation needed — they're already static)

### 4. Empty States

#### No Waterfall (Overview)

- [ ] Ghosted tier headers displayed at low opacity (~25%) with tier colours: INCOME, COMMITTED, DISCRETIONARY, SURPLUS
- [ ] Each ghosted header shows "£—" as placeholder amount
- [ ] Cascade connectors ("minus committed", "minus discretionary", "equals") appear between ghosted tiers at ~20% opacity
- [ ] Callout gradient CTA card below the ghosted cascade: indigo→purple gradient background (7-8% opacity), 1px indigo border (12% opacity)
- [ ] CTA card contains: "Build your waterfall" heading (15px, Outfit, 600) + "See where your money flows — from income through to surplus." subtext + "Get started" primary button
- [ ] Clicking "Get started" enters build mode (same as current behaviour)

#### Right Panel Placeholder

- [ ] Small icon (two-panel layout representation, 20×20, `#475569` stroke, no fill)
- [ ] Page-aware guidance text: "Select an item from the waterfall to view its history and details" (Overview), adapted for other pages
- [ ] Keyboard hint badges below text: "↑ ↓ to browse" and "Enter to select" in monospace pill style (`font-numeric`, 10px, `#475569`, `rgba(255,255,255,0.04)` background, 1px border). **Note:** Only render keyboard hints if keyboard navigation is implemented (see `keyboard-navigation` spec). If not yet live, omit the hints and show only the icon + guidance text.

#### List Empty States

- [ ] Ghosted skeleton rows (name placeholder + amount placeholder) with varying widths for visual interest
- [ ] Rows fade progressively: 100% → 80% → 50% → 25% opacity
- [ ] Callout gradient CTA card below the fading rows with contextual text and "+ Add" button
- [ ] CTA text adapts per context: "Add your savings accounts to track balances and contributions" / "Plan gifts by person and event — birthdays, Christmas, and more" / etc.
- [ ] Applied consistently across: AccountListPanel, PurchaseListPanel, GiftPersonListPanel, GiftUpcomingPanel, EndedIncomeSection, SnapshotsSection
- [ ] Consider extracting a shared `GhostedListEmpty` component to avoid duplication

### 5. Minor Fixes

- [ ] All inline `style={{ color: "#f59e0b" }}` replaced with `text-attention` Tailwind class (WaterfallLeftPanel, SnapshotTimeline, ItemDetailPanel)
- [ ] Manually constructed button styles in ItemDetailPanel replaced with shared `<Button>` component
- [ ] Native `<input type="checkbox">` in summary phase and login page replaced with shadcn `<Checkbox>` component
- [ ] Wordmark "finplan" in header switched to `font-heading` (Outfit), canonical spelling documented in design system as "finplan" (lowercase, one word, no variations)
- [ ] Confetti particle count reduced from 40 to ~20
- [ ] SnapshotTimeline truncation widened from 60px and hover tooltips added for full snapshot names

### 6. Design System Documentation

- [ ] `docs/2. design/design-system.md` updated: waterfall type hierarchy table matches implemented D3 values
- [ ] `docs/2. design/design-system.md` updated: per-page ambient glow specifications added (colours, positions, opacities)
- [ ] `docs/2. design/design-system.md` updated: empty state patterns documented (ghosted cascade, contextual hint, fading skeleton)
- [ ] `docs/2. design/design-system.md` updated: canonical wordmark spelling "finplan" documented

## Open Questions

- [ ] **Where should callout gradients appear beyond empty states?** The design system defines blue→purple and purple→teal callout gradients "for engagement and hero emphasis." Empty state CTA cards now use them — but could the build mode summary, welcome page hero, or other engagement moments also benefit?
- [ ] **What would a quiet surplus celebration look like?** When surplus is healthy, could the teal-mint do more — a slightly bolder weight, a subtle glow — without violating "silence is approval"?
- [ ] **Does the two-panel layout serve the Wealth page?** Wealth has a 3-level hierarchy (net worth → asset class → individual account) that doesn't map cleanly to two panels. Would a drill-down or accordion pattern work better?
- [ ] **How does the left panel handle real data density?** A household with 3 income sources, 15 committed bills, 10 discretionary categories, and 5 savings allocations — is scrolling comfortable? Are tier boundaries distinct enough when not all visible?
- [ ] **Is 360px the right left panel width?** With long names ("Home & Contents Insurance") and large amounts ("£2,450.00") plus staleness badges, the layout may feel cramped. Test with realistic UK financial data.

---

## Implementation

### Schema

No schema changes. This is a frontend-only visual polish pass.

### API

No API changes.

### Components

**Modified:**

- `WaterfallLeftPanel.tsx` — Tier total colouring, cascade connectors, surplus unification, typography hierarchy (D3 sizes/weights), item row dimming, hardcoded amber → `text-attention`
- `TwoPanelLayout.tsx` — Right panel placeholder upgrade (icon + contextual hint + keyboard badges)
- `OverviewPage.tsx` — No-waterfall empty state (ghosted cascade + CTA card)
- `AccountListPanel.tsx` — Fading skeleton + CTA card empty state
- `PurchaseListPanel.tsx` — Fading skeleton + CTA card empty state
- `GiftPersonListPanel.tsx` — Fading skeleton + CTA card empty state
- `GiftUpcomingPanel.tsx` — Fading skeleton + CTA card empty state
- `EndedIncomeSection.tsx` — Fading skeleton + CTA card empty state
- `SnapshotsSection.tsx` — Fading skeleton + CTA card empty state, truncation fix + tooltips
- `ItemDetailPanel.tsx` — Manual button styles → `<Button>` component, hardcoded amber → `text-attention`
- `SnapshotTimeline.tsx` — Hardcoded amber → `text-attention`, truncation widened + tooltips
- `SummaryPhase.tsx` (or equivalent build summary) — Native checkbox → shadcn `<Checkbox>`
- `LoginPage.tsx` — Native checkbox → shadcn `<Checkbox>`
- `Layout.tsx` (or header component) — Wordmark font switch to Outfit
- Confetti component — Particle count 40 → ~20

**New (potentially):**

- `GhostedListEmpty.tsx` — Shared component for fading skeleton rows + CTA card pattern. Props: `rowCount`, `ctaText`, `ctaAction`, `ctaButtonLabel`
- `WaterfallConnector.tsx` — Shared connector component ("minus committed" / "minus discretionary" / "equals") if not already extracted
- `PageGlow.tsx` — Component or CSS utility for per-page ambient glow pseudo-elements. Could be CSS-only via data attributes on the page wrapper.

**Documentation:**

- `docs/2. design/design-system.md` — Updated type hierarchy, ambient glow spec, empty state patterns, wordmark canonical name

### Notes

**Ambient glow implementation approach:**

The glows are CSS-only — no JS animation. Each page sets a CSS custom property or data attribute on the layout wrapper, and the glow pseudo-elements read from it. Example approach:

```css
/* In index.css or a dedicated page-glows.css */
[data-page="overview"]::before {
  content: "";
  position: fixed;
  top: -100px;
  right: -50px;
  width: 500px;
  height: 400px;
  background: radial-gradient(ellipse, rgba(99, 102, 241, 0.06) 0%, transparent 65%);
  pointer-events: none;
  z-index: 0;
}
```

Pages set `data-page="overview"` on the outermost wrapper. The fixed positioning ensures the glow stays in place during scroll.

**Typography — Tailwind class mapping:**

| Element     | Tailwind classes                                                             |
| ----------- | ---------------------------------------------------------------------------- |
| Tier label  | `text-[13px] font-heading font-semibold tracking-tier uppercase text-tier-*` |
| Tier total  | `text-[15px] font-numeric font-semibold text-tier-*`                         |
| Item name   | `text-[13px] font-body font-normal text-secondary`                           |
| Item amount | `text-[13px] font-numeric font-normal text-[#cbd5e1]`                        |
| Connector   | `text-[10.5px] font-numeric font-medium text-muted`                          |

**Empty state gradient CTA card:**

```
background: linear-gradient(135deg, rgba(99, 102, 241, 0.07) 0%, rgba(168, 85, 247, 0.05) 100%)
border: 1px solid rgba(99, 102, 241, 0.1)
border-radius: 8px
padding: 14px 16px
```

**Wordmark:** The canonical product name is **finplan** — lowercase, one word. Never "FinPlan", "Fin Plan", "FINPLAN", or any other variation. This applies to the header wordmark, documentation, and all user-facing text.

**No behavioural changes:** This feature modifies only visual presentation. No state management, API calls, routing, or business logic is affected. All existing tests should continue to pass — if any snapshot tests exist, they will need updating.
