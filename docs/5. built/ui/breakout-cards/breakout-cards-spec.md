---
feature: breakout-cards
status: implemented
priority: medium
deferred: false
phase: post-15
design_doc: docs/plans/2026-03-24-breakout-cards-design.md
implemented_date: 2026-07-05
---

# Breakout Cards

## Intention

FinPlan's disciplined 8px grid and two-panel layout create a calm, scannable interface — but strict adherence to the grid can feel monotonous. Breakout cards introduce intentional container-boundary-breaking elements at three specific locations, adding visual tension and hierarchy. Each breakout serves a semantic purpose: highlighting computed results, key figures, or the current temporal state.

## Description

Three static breakout card treatments applied to existing components:

1. **Surplus breakout** — the surplus row in `MiniWaterfallChart` gets an elevated card background that extends beyond the chart container, visually distinguishing the computed output from the input tiers.
2. **Net Worth breakout** — the Wealth left panel gains a hero section with the Net Worth value card bridging the hero/content boundary (Toko-style).
3. **Snapshot "Now" card** — the current-state dot on the snapshot timeline gets a floating card that breaks above the timeline bar.

All three use the same visual treatment: `surface-elevated` background + `border` token. No shadows, no animation. Frontend-only changes — no schema or API modifications.

## User Stories

- As a user viewing the build summary, I want the surplus value to feel visually distinct from the input tiers so I immediately see it as the computed result of my waterfall.
- As a user on the Wealth page, I want the Net Worth figure to feel like the headline of the page so I orient quickly to the most important number.
- As a user viewing the snapshot timeline, I want to clearly see which snapshot represents my current state so I don't confuse it with historical snapshots.

## Acceptance Criteria

### 1. Surplus Breakout — MiniWaterfallChart

- [ ] Card background rendered via CSS `::before` pseudo-element on a wrapper div
- [ ] Card offset to the right: `left: -8px`, `right: -32px` relative to the wrapper's normal position within the chart container
- [ ] Card extends ~28px below the chart container's bottom edge (`margin-bottom: -28px`)
- [ ] Card uses `surface-elevated` background and 1px `border` token, `border-radius: 8px`
- [ ] "Surplus" label text has `padding-left: 8px` on the `.tier-name` span to create inner spacing from the card's left edge
- [ ] The `.tier-name` span retains its fixed width (100px) — padding shifts text only, not the bar track
- [ ] Bar track and value column remain at the exact same x-coordinates as Income, Committed, and Discretionary rows
- [ ] Waterfall bar positions are cascading: Income 0–100%, Committed 0–X%, Discretionary X–Y%, Surplus Y–100% (each starts where the previous ends)
- [ ] Card has `z-index` in the `sticky` to `dropdown` range (10–30)
- [ ] Chart container has `overflow: visible` to allow the card to extend beyond its bounds
- [ ] No animation — card is statically positioned

### 2. Net Worth Breakout — WealthLeftPanel

- [ ] Panel splits into two sections: hero (top) and body (bottom)
- [ ] Hero section has subtle violet gradient background: `linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(99,102,241,0.04) 100%)`
- [ ] Hero has `border-radius` matching the panel's top corners, `border-bottom: 1px solid border`
- [ ] Hero contains "Net Worth" label (`text-tertiary`, uppercase, tracking-wide, 11px) and sublabel ("Your total assets across all accounts", `text-secondary`, 13px)
- [ ] Hero has extra bottom padding (36px) to create space for the breakout card
- [ ] Net Worth value card is `position: absolute`, `bottom: -24px`, `left: 16px`, `right: 16px`
- [ ] Card uses `surface-elevated` background, 1px `border`, `border-radius: 10px`, `padding: 14px 16px`
- [ ] Card contains: `£` value (JetBrains Mono, 28px, weight 700, `text-primary`) and YTD change (12px, `text-secondary`)
- [ ] Card has `z-index: 3` to sit above both hero and body sections
- [ ] Body section has `padding-top: 36px` to accommodate the overlapping card
- [ ] Hero section has `overflow: visible` so the card can extend beyond it
- [ ] "By Liquidity" section and asset class list render below the card in the body section
- [ ] No animation — card is statically positioned

### 3. Snapshot Timeline — "Now" Floating Card

- [ ] Floating card appears above the "Now" dot only (not historical snapshot dots)
- [ ] Card positioned `bottom: calc(100% + 6px)` relative to the dot group
- [ ] Card uses `surface-elevated` background, 1px `border`, `border-radius: 6px`, `padding: 6px 10px`
- [ ] Card contains: "Current view" (`text-secondary`) · date in JetBrains Mono (weight 500)
- [ ] CSS border-triangle arrow (4px) points down from card bottom to dot
- [ ] "Now" dot is 8px (same size as all other dots), uses `action` colour with subtle `box-shadow: 0 0 8px rgba(124,58,237,0.25)`
- [ ] "Now" label uses `text-primary` + `font-weight: 600` vs other dots' `text-tertiary`
- [ ] Card has `z-index: 10` to sit above the timeline bar
- [ ] Timeline bar has `overflow: visible` to allow the card to extend above it
- [ ] Card is statically rendered — no entrance animation
- [ ] Card only shows when viewing the current state (not when viewing a historical snapshot)

### General

- [ ] All three breakouts use the same visual treatment: `surface-elevated` + 1px `border`
- [ ] No shadows on any breakout (dark theme constraint)
- [ ] Maximum one breakout per view (Overview has surplus in build mode only; Wealth has net worth; Overview has snapshot "Now" in the timeline — these never conflict)
- [ ] All breakouts work within `overflow-y: auto` panels (they break sub-container boundaries, not panel boundaries)
- [ ] `prefers-reduced-motion`: no effect (breakouts are static, not animated)

## Open Questions

- Should the WaterfallLeftPanel surplus row (text row, not bar chart) also receive a breakout treatment in a future iteration?

---

## Implementation

### Schema

No schema changes. All breakout cards are purely presentational CSS/component changes.

### API

No API changes. All data already exists — breakouts are visual treatments on existing rendered content.

### Components

**Modified files:**

1. **`apps/frontend/src/components/overview/build/MiniWaterfallChart.tsx`**
   - Wrap the surplus `TierBar` in a new `<div className="surplus-breakout">` wrapper
   - Add `::before` pseudo-element via Tailwind `before:` utilities or a dedicated CSS class
   - Add `padding-left` to the surplus tier-name span
   - Refactor bar positioning to use `left` + `width` (absolute within track) for proper waterfall cascade instead of width-only
   - Set `overflow-visible` on the chart container parent

2. **`apps/frontend/src/components/wealth/WealthLeftPanel.tsx`**
   - Split current root `<div>` into hero section + body section
   - Add hero gradient background, sublabel text, and extra bottom padding
   - Add absolutely-positioned breakout card containing the net worth value and YTD change
   - Move "By Liquidity" and asset class list into the body section with `padding-top: 36px`

3. **`apps/frontend/src/components/overview/SnapshotTimeline.tsx`**
   - Add floating card element above the "Now" dot (conditionally rendered when not viewing a historical snapshot)
   - Add CSS arrow triangle via `::after` pseudo-element
   - Add `box-shadow` glow to the "Now" dot
   - Update "Now" label typography (`text-primary`, `font-weight: 600`)
   - Set `overflow-visible` on the timeline bar

**No new files required.** All changes are modifications to existing components.

### Notes

- The surplus breakout applies only to `MiniWaterfallChart` (used in `BuildGuidePanel`). The `WaterfallLeftPanel` surplus row is a text-only display and is out of scope for this spec.
- The mockup at `apps/frontend/public/mockup-breakout.html` is a development reference artifact. It should be deleted after implementation is complete.
- Design system reference: surface elevation tokens in `design-system.md` section 1.2 (Surfaces), z-index scale in section 2.4.
- The waterfall bar cascade (each tier starting where the previous ends) is a visual change to `MiniWaterfallChart` — the current implementation renders all bars starting from `left: 0`. This spec changes that to proper cascading positions.
- Design anchor #11 ("Calm by default"): breakouts are static and use the established surface elevation pattern — no new visual language introduced.
