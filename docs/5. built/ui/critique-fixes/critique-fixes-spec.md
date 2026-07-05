---
feature: critique-fixes
design_doc: docs/4. planning/design-critique/design-progress.md
creation_date: 2026-03-29
status: implemented
implemented_date: 2026-07-05
---

# Critique Fixes

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

The March 2026 design critique identified 26 UI inconsistencies across animations, typography, spacing, colour tokens, microcopy, and empty state patterns. All decisions have been agreed. This feature applies those decisions to produce a cohesive, polished UI that matches the established design system — and updates the design system documentation to reflect the agreed standards.

## Description

A coordinated frontend polish pass covering 8 active groups from the critique walkthrough (items #3, #2, #11, #14 are deferred or skipped). Changes include: Framer Motion animations for accordion, wizard steps, and subcategory selection; typography standardisation across font sizes, font families, and label treatments; spacing and padding normalisation across all left panels and right-panel detail views; colour token cleanup to remove hardcoded hex values and improve GhostAddButton contrast; microcopy revisions for toasts, delete confirmations, empty states, and the StaleDataBanner; and empty state pattern consolidation to a three-context model.

Five documentation updates to `design-system.md` are included to lock in the agreed standards.

## User Stories

- As a user, I want accordion expand/collapse to animate smoothly so that the transition feels intentional and unhurried.
- As a user, I want ReviewWizard step transitions to slide directionally so that I feel oriented as I move forward and back.
- As a user, I want the subcategory selection indicator to slide between rows rather than jump so that the navigation feels fluid.
- As a user, I want contextual cards to fade or scale in on mount so that they appear with purpose rather than snapping into place.
- As a user, I want all financial figures to use the numeric font consistently so that numbers are scannable and precise everywhere.
- As a user, I want section labels to look the same across the app so that the interface feels coherent.
- As a user, I want hero amounts to use the same size and weight everywhere so that key figures carry equal visual authority.
- As a user, I want right-panel detail views to use consistent vertical rhythm so that the layout feels calm and readable.
- As a user, I want toast messages to use a warmer, human tone so that the app feels like a thoughtful tool rather than a system log.
- As a user, I want delete confirmations to name the item being removed so that I'm confident about what I'm confirming.
- As a user, I want empty states to ask an inviting question so that adding my first item feels easy and purposeful.
- As a user, I want the StaleDataBanner to tell me there's a sync problem rather than just that data may be outdated so that I understand the situation accurately.
- As a user completing the ReviewWizard, I want a summary step showing how many items I reviewed so that my effort is acknowledged.

## Acceptance Criteria

### Animations (#6, #7, #8, #9, #10)

- [ ] Accordion expand/collapse (`ItemAreaRow`, `ItemArea` add-form) animates height 0→auto + opacity 0→1 over 200ms with ease-out-quart; exit is the reverse.
- [ ] `AnimatePresence` wraps both `ItemAccordion` and `ItemForm` in `ItemAreaRow`; add-item form in `ItemArea` uses the same treatment.
- [ ] ReviewWizard step transitions: forward step exits left + enters from right; back step is reversed. 200ms ease-out-quart. `AnimatePresence mode="wait"` keyed on `currentStep`. Direction tracked in state.
- [ ] SubcategoryList active indicator is an absolutely-positioned `motion.div` with `layoutId="subcategory-indicator-{tier}"`. Bar and background highlight both slide between rows (220ms ease-out-quart, transform-only). Wrapped in `<LayoutGroup>`. Existing `border-l-2` CSS indicator removed.
- [ ] Reduced-motion fallback for subcategory indicator: static `div` (no `motion.div`) when `prefers-reduced-motion: reduce`.
- [ ] NudgeCard entrance: `opacity: 0→1, y: 4→0` over 250ms easeOut.
- [ ] EmptyStateCard / CTA entrance: `opacity: 0→1, scale: 0.97→1` over 250ms ease-out-quint.
- [ ] GhostedListEmpty ghost rows stagger: `staggerChildren: 0.06`, `y: 6→0`, opacity 0→1. (Item list entrance stagger already shipped — no change needed there.)
- [ ] ReviewWizard confirmation item opacity: `motion.div` with `animate={{ opacity: isResolved ? 0.6 : 1 }}` over 300ms ease-out-quart. Builds on existing `✓ Done` label.
- [ ] All new animations respect `prefers-reduced-motion` via the existing shared hook.

### Typography System (#21, #22, #23, #25)

- [ ] `text-[10px]`, `text-[11px]`, `text-[12.5px]` collapsed to `text-xs` (12px) throughout the codebase. No arbitrary 10–12.5px sizes remain.
- [ ] `text-[28px]` replaced with `text-[30px]` (hero standard).
- [ ] Four named Tailwind tokens defined in `tailwind.config.js`: `text-connector` (10.5px), `text-tier` (13px), `text-tier-total` (15px), `text-hero` (30px).
- [ ] All uses of these sizes in the waterfall/left-panel area use the named tokens, not numeric `text-[Xpx]` values.
- [ ] `font-mono` used only for code/technical text. All financial figures (currencies, percentages) use `font-numeric`. Affected files include at minimum `WealthLeftPanel.tsx`, `NetWorthBar.tsx`, and any other component where `font-mono` currently renders a currency or percentage.
- [ ] Canonical section-label treatment applied uniformly: `text-xs font-medium uppercase tracking-wider text-muted-foreground`. All section headers across the app use this treatment — except waterfall tier labels (which keep `tracking-tier` + tier colour).
- [ ] Hero amount treatment standardised to `text-hero font-numeric font-extrabold` (30px, 800 weight) everywhere. Colour varies by context: `text-primary` for waterfall items, `text-foreground` for wealth, `text-tier-surplus` for surplus. Surplus page hero drops from 36px to 30px.

### Spacing & Rhythm (#16, #17, #18, #19, #20)

- [ ] All right-panel detail views (`AccountDetailPanel`, `ItemDetailPanel`, `CommittedBillsPanel`, `IncomeTypePanel`) use two-tier vertical rhythm: `space-y-6` (24px) between major sections, `space-y-2` (8px) within sections. Related elements are grouped (breadcrumb + heading together, amount + staleness together).
- [ ] Settings page keeps its existing wider rhythm (`space-y-12` / `space-y-4`) — no change.
- [ ] `WealthLeftPanel` padding standardised to `px-4` (16px) throughout: hero section, breakout card, body. Breakout card repositioned from `left-4 right-4` to `left-3 right-3`.
- [ ] List item density unified to `space-y-0.5` + `py-1.5` across `WealthLeftPanel`, `WaterfallLeftPanel`, and `PlannerLeftPanel`. Any `space-y-1` within these panels replaced with `space-y-0.5`.

### Colour Tokens (#5, #24)

- [ ] `GhostAddButton` border updated from `border-foreground/10` to `border-foreground/20`. Text updated from `text-foreground/45` to `text-foreground/60`. Passes WCAG AA contrast. Ghost character preserved.
- [ ] All 7 hardcoded hex values in component files replaced with appropriate Tailwind tokens or CSS custom properties. Zero hardcoded hex colours remain in `apps/frontend/src/components/` (excluding `WelcomePage.tsx` confetti, which is intentionally dynamic and colour-specific).

### Microcopy (#12, #13, #26, #27, #29, #30)

- [ ] All success toast messages follow the pattern: specific noun-phrase, past tense. Word choices: "saved" (not "updated"), "removed" (not "deleted"), "sent" (not "created"). Contractions used: "you've" not "you have". No exclamation marks. No emoji.
- [ ] All error toast messages follow: `"Couldn't [verb] [noun] — [next step]"`. Next step is context-aware: "try again" (generic), "check your connection" (network error), "contact support" (persistent error).
- [ ] "All caught up — no more stale items" toast fires when the last stale item is confirmed (#13).
- [ ] All delete confirmation dialogs use: Heading `"Remove [Item Name]?"` + Body `"[Item Name] will be permanently removed from your plan."` No "Are you sure?" language anywhere in the app.
- [ ] Empty state headings for addable lists use the question-prompt pattern: `"What [x] do you have?"` / `"What are you saving towards?"` etc. Subtext: `"Add your first [x] to begin building your plan"`. Applied across all `GhostedListEmpty` empty states.
- [ ] `StaleDataBanner` copy updated to: `"Couldn't sync — showing last saved data · [time ago] · Retry"`.

### Empty States (#4)

- [ ] **Addable lists** (`GhostedListEmpty`): skeleton rows removed entirely. CTA card only — question-prompt heading + subtext on left, button right-aligned.
- [ ] **Informational panels** (overview/derived panels): centered heading + one-line subtext pointing where to act. No skeleton rows.
- [ ] **Inline/contextual** (notes, events): unchanged — minimal italic text remains appropriate.

### Review Wizard Polish (#15)

- [ ] ReviewWizard has a final summary step shown after all items are reviewed.
- [ ] Summary step shows: count of items reviewed, count of items still stale (if any), and a timestamp of the review.
- [ ] Summary step is the last step — advancing from it closes the wizard.

### Design System Documentation

- [ ] `design-system.md` Typography section updated with the four named font-size tokens (`text-connector`, `text-tier`, `text-tier-total`, `text-hero`) and their pixel values.
- [ ] `design-system.md` Component Catalogue updated with the canonical section-label treatment.
- [ ] `design-system.md` Spacing and Layout section updated with the two-tier vertical rhythm convention (`space-y-6` / `space-y-2`).
- [ ] `design-system.md` Waterfall Type Hierarchy table updated to reflect the standardised hero amount treatment.
- [ ] `design-system.md` gains a new Microcopy section documenting: success toast pattern, error toast pattern, word choice list (saved/removed/sent), no emoji/exclamation rule.

## Open Questions

_None — all 26 items resolved in the design-progress document._

---

## Implementation

### Schema

No database schema changes. This feature is purely frontend UI changes.

### API

No API changes. This feature does not add, modify, or remove any backend operations.

### Components

**Animation changes:**

- **ItemAreaRow** — add `AnimatePresence` wrapping accordion content; `motion.div` with height+opacity animation on expand/collapse.
- **ItemArea** — add `AnimatePresence` wrapping add-item form; same height+opacity treatment.
- **ReviewWizard** — add directional slide+fade step transitions keyed on step index; add ReviewWizardSummaryStep as the final step; add resolved-item opacity animation on confirmed items.
- **SubcategoryList** — replace CSS `border-l-2` active indicator with `motion.div layoutId`; wrap in `<LayoutGroup>`; add reduced-motion static fallback.
- **NudgeCard** — add mount entrance animation (opacity + y offset).
- **EmptyStateCard** — add mount entrance animation (opacity + scale); remove gradient-text heading treatment.
- **GhostedListEmpty** — add staggered ghost row entrance; remove skeleton rows from addable-list variant; apply question-prompt copy pattern.

**Typography changes:**

- **tailwind.config.js** — add `text-connector`, `text-tier`, `text-tier-total`, `text-hero` to the fontSize config.
- All components using `text-[10px]`, `text-[11px]`, `text-[12.5px]`, `text-[28px]` — update to named tokens or `text-xs`.
- **WealthLeftPanel**, **NetWorthBar**, and other components using `font-mono` for financial figures — replace with `font-numeric`.
- All section header elements — apply canonical `text-xs font-medium uppercase tracking-wider text-muted-foreground` treatment.
- Hero amount components (surplus page, wealth totals, waterfall totals) — standardise to `text-hero font-numeric font-extrabold`.

**Spacing changes:**

- **AccountDetailPanel**, **ItemDetailPanel**, **CommittedBillsPanel**, **IncomeTypePanel** — apply `space-y-6` / `space-y-2` two-tier rhythm.
- **WealthLeftPanel** — standardise to `px-4` throughout; reposition breakout card to `left-3 right-3`; unify list density to `space-y-0.5`.
- **WaterfallLeftPanel** — unify list density to `space-y-0.5`.
- **PlannerLeftPanel** — standardise to `space-y-0.5` + `py-1.5` throughout.

**Colour changes:**

- **GhostAddButton** — update border and text opacity values.
- 7 components with hardcoded hex values — replace with design tokens (exact files to be confirmed via grep during implementation).

**Microcopy changes:**

- Toast utility / all `toast(...)` call sites — update success and error message patterns.
- All delete confirmation dialogs — update heading and body copy.
- All `GhostedListEmpty` instances — update heading and subtext copy.
- **StaleDataBanner** — update copy to sync-failure message.

**Design system documentation:**

- **design-system.md** — 5 targeted section updates (typography tokens, section label, vertical rhythm, hero amount, new Microcopy section).

### Notes

- Reduced-motion: all new Framer Motion animations must gate on the existing `useReducedMotion` / `prefers-reduced-motion` hook. The subcategory indicator requires a full static fallback (not just `duration: 0`) because `layoutId` animation can't be disabled mid-render.
- The `GhostedListEmpty` skeleton-row removal applies only to the addable-list variant. Informational empty states (overview, derived panels) have their own treatment — don't conflate.
- The `EmptyStateCard` gradient-text heading removal is a subset of #24 (hardcoded colours) — treat them together in the same pass.
- `WelcomePage.tsx` confetti uses hardcoded tier colours intentionally (dynamic particle colouring); it is exempt from the #24 token replacement.
- The ReviewWizard summary step should reuse the existing `ReviewWizardStep` layout shell. It does not need a new full-page component — it's a final content variant within the existing wizard frame.
- Toast copy changes affect all call sites. Prefer updating the toast utility / shared pattern first, then sweeping call sites, rather than touching each independently.
