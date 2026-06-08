# Mobile Accessibility & WCAG 2.1 AA Pass

## Implementation status

Implementation committed on branch `feat/mobile-implementation` (7 commits, off `claude/review-finplan-mobile-plan-BcleC` to carry the planning docs). Runtime artefact: `docs/3. architecture/mobile.md`.

| Phase                              | Status                  | Notes                                                                                       |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| 1a — Lint + axe infra              | **Done**                | `eslint-plugin-jsx-a11y` at warn, `axe-core` + `expectNoA11yViolations` helper              |
| 1b — Shared primitives             | **Done**                | `useIsMobile`, `ResponsiveDialog`, `MobileUnsupportedNotice`, Button 44px touch targets     |
| 1c — Contrast + recharts spike     | **Done**                | `.label-chart` fixed; recharts code-split already in place via route-based splitting        |
| 2 — Layout & URL state             | **Done**                | `useUrlSelection`, `TwoPanelLayout` responsive, `PageHeader` onBack, Tier/Assets/Overview   |
| 3a — Soft-block + nav/search badge | **Done**                | 5 pages soft-block, `(desktop only)` badge in hamburger + search                            |
| 3b/c/d — Page-by-page pass         | **Done**                | Sankey responsive, stat grids, auth padding+CTAs, search palette fullscreen on mobile       |
| 4 — Defensive iOS + nav audit      | **Done**                | `h-dvh` audit, hamburger 44px, `inputMode="decimal"` on numeric forms, Input touch target   |
| 5 — A11y completion                | **Partial**             | Smoke test green (9 tests). Manual TalkBack pass pending — needs real Android via Tailscale |
| 6 — Verification                   | **Pending manual**      | Lighthouse mobile run, real-device walkthrough, screenshot sweep                            |
| iOS verification                   | **Documented as a gap** | No iPhone available to project; defensive build shipped without empirical verification      |

**Lint:** 102 warnings remaining (down from 194). Off project-wide: `label-has-for` (deprecated), `no-autofocus` (modal focus-on-open is the correct WCAG behaviour). Remaining warnings are real `label-has-associated-control` / `control-has-associated-label` issues, mostly in soft-blocked pages — tracked as Phase 5 follow-up, none block mobile usability.

**Tests:** 163 frontend test files passing, including 9 new a11y smoke tests, 7 `useUrlSelection`, 5 `TwoPanelLayout`, 4 `ResponsiveDialog`, 4 `Button` size variants, 5 `MobileUnsupportedNotice`, 9 `resolveOverviewView`, and the 3 new PageHeader-mobile tests.

**Deferred (not blocking mobile usability):**

- `LinkedAccountsPopover` → `ResponsiveDialog` conversion (custom positioned popover, bigger refactor)
- `WaterfallTierTable` two-line stacked mobile layout (used only in `FullWaterfallPage` which is soft-blocked)
- `SubcategoriesSection` reorder hide-on-mobile and `SnapshotTimeline` scrub replacement (host pages are soft-blocked)
- Full contrast sweep across `text-foreground/[0-4]0` and `text-muted-foreground/[0-6]0` usages — only the label utilities audited

---

## Context

The finplan frontend is desktop-first by design (Anchor #6). This plan adds a **deliberately scoped** mobile-responsive layer on top of the existing desktop experience: the in-scope pages re-flow at small viewports via a single shared component layer; the out-of-scope pages soft-block with a "use desktop" notice. The waterfall pages and the assets page get full view + edit on mobile. The full-waterfall workbench, configuration-heavy surfaces, and snapshot views remain desktop-only.

Underlying primitives already in place: viewport meta tag, hamburger nav with Radix Sheet, semantic HTML, Radix dialog primitives, `cmdk`-based search palette with both hotkey and visible trigger. The gap is layout collapse, master-detail navigation on small screens, touch-target sizing, and a small set of defensive iOS-Safari measures — not a navigation rebuild.

**Outcome**: mobile-responsive view + edit at a 360px viewport for the in-scope pages; all primary touch targets ≥44px on mobile; WCAG 2.1 AA verified by automated axe and a manual TalkBack pass on Android. iPad portrait (768–1023px) shares the mobile push-nav layout — the desktop two-panel layout requires `≥1024px` to breathe. iOS Safari is built for defensively but cannot be empirically verified in this project (Android-only test device); see _iOS verification gap_ below.

This plan supersedes the deferred `docs/4. planning/_future/mobile-experience/mobile-experience-spec.md` and resolves its open questions explicitly.

---

## Scope

### In scope (responsive view + edit)

Overview, Income, Committed, Discretionary, Surplus, Assets, Forecast (view + navigation controls; linked-accounts is the only edit surface), Profile Settings, Auth.

### Soft-block on mobile (desktop-only with in-app notice)

FullWaterfall, Goals, Gifts, Help, Household Settings, snapshot routes. A shared `<MobileUnsupportedNotice />` renders in place of the page content with a back button — URL semantics preserved, deep-links handled gracefully.

Household Settings is overwhelmingly configuration, assumption-tuning, audit-review, data import/export, and destructive admin (rebuild waterfall) — all Anchor #6 desktop territory. Profile Settings (user details, display preferences, security activity) stays mobile-accessible since it covers the realistic mobile cases (logout, password change, basic info).

### Hidden on mobile (within in-scope pages)

- Subcategory reorder (dnd-kit). Reorder is a setup action; mobile reads the order as-set.
- Snapshot timeline on Overview. Mobile shows the current plan only.
- Multi-select / bulk operations. Single-row actions only.
- Keyboard-shortcut hints in tooltips.

### Tablet behaviour

iPad portrait (768px) and any viewport `<1024px` uses the mobile push-nav layout. The desktop two-panel layout activates at `lg: 1024px` — a 360px aside requires ≥660px of detail-panel space to be useful.

### Anchor #6 reconciliation

Anchor #6 ("Desktop-first") is preserved. Mobile is a deliberately limited _viewer + targeted-edit_ experience for the analytical core (waterfall + assets + forecast) and the unavoidable surfaces (auth, settings). Setup, bulk entry, snapshot review, reorder, and multi-select all remain desktop-only — consistent with Anchor #6's framing of desktop as the environment for _setup, review, and analysis_.

---

## Cross-cutting decisions

Twelve locked decisions, each shaping multiple phases.

### 1. Mobile scope

**Decision**: in-scope = Overview, Income, Committed, Discretionary, Surplus, Assets, Forecast, Settings, Auth (responsive view + edit). Soft-block = FullWaterfall, Goals, Gifts, Help, snapshot views.

Trade-off: smaller scope than full parity (~11d vs ~15d for full parity), but honours Anchor #6's spirit and preserves desktop as the workbench.

### 2. Layout breakpoint

**Decision**: `lg: 1024px`. Tablets in portrait use the mobile push-nav layout; desktop two-panel activates at landscape iPad / laptop sizes.

Trade-off: the draft's `md: 768px` would have left iPad portrait with a 408px detail panel — worse than mobile push-nav. `lg:` reflects what the layout actually needs.

### 3. Feature-level non-goals

**Decision**: subcategory reorder, snapshot timeline, multi-select, and keyboard-shortcut hints are hidden on mobile. Each is a setup/analysis interaction better served on desktop. This eliminates dnd-kit touch sensors, SnapshotTimeline pointer-event refactors, and several touch ergonomics concerns from the work.

### 4. Modals: `ResponsiveDialog` wrapper

**Decision**: a single `<ResponsiveDialog>` wrapper renders Radix Dialog on desktop, Radix Sheet on mobile. Two variants: `"sheet"` (default, bottom-anchored — used by all forms) and `"fullscreen"` (used by the search palette).

Trade-off: one new component vs every form needing per-form mobile handling. Sheet matches mobile platform conventions; full-screen is correct for search where keyboard + results need maximum vertical space.

### 5. Selection state: URL-only, feature-specific param names

**Decision**: list+detail selection lives in the URL (`?subcategory=`, `?type=`, etc. — feature-specific names matching existing convention). One parameterised hook `useUrlSelection({ param })`. `replace: true` on desktop (no history pollution), `replace: false` on mobile (back button clears detail). Invalid values silently clear.

Trade-off: replaces the current `useState`+read-once-from-URL pattern — slightly more refactor than the draft's hybrid sync, but a single source of truth and uniform back-button semantics.

The draft plan referenced "existing per-page Zustand selection slices"; the spot-check confirmed these don't exist (only `authStore` uses Zustand). The migration is `useState` → URL hook, no Zustand involved.

### 6. Tailwind breakpoints

**Decision**: stick with defaults (`sm: 640px`, `md: 768px`, `lg: 1024px`, etc.). No custom `xs: 480px`.

Trade-off: simpler convention, no extra breakpoint to police. Stat grids use `grid-cols-2 sm:grid-cols-3` rather than the draft's `grid-cols-1 xs:grid-cols-3`. Adding `xs:` later if a specific layout needs it is trivial.

### 7. Code convention: mobile-first className ordering

**Decision**: unprefixed = mobile, `md:`/`lg:` overrides for larger. Idiomatic Tailwind. Design philosophy remains desktop-first; this is purely a code-organisation convention. Existing desktop-only classes (`w-[360px] min-w-[360px]`) become `w-full lg:w-[360px] lg:min-w-[360px]`.

### 8. Touch target sizing

**Decision**:

| Variant   | Mobile        | Desktop          | Class                     | Use                                            |
| --------- | ------------- | ---------------- | ------------------------- | ---------------------------------------------- |
| `default` | 44px (`h-11`) | 36px (`sm:h-9`)  | `h-11 sm:h-9`             | Primary CTAs, row actions                      |
| `icon`    | 44px (`h-11`) | 36px (`sm:h-9`)  | `h-11 w-11 sm:h-9 sm:w-9` | Icon-only buttons                              |
| `lg`      | 48px (`h-12`) | 40px (`sm:h-10`) | `h-12 sm:h-10`            | Hero CTAs (auth submit, etc.)                  |
| `sm`      | 36px (`h-9`)  | 32px (`sm:h-8`)  | `h-9 sm:h-8`              | Dense secondary (filter chips, inline toggles) |

**Standards note**: 44px is iOS HIG / Material Design / WCAG AAA. WCAG 2.2 **AA** (SC 2.5.8) requires only 24×24px. Hitting 44px on primary actions is a UX choice, not an AA requirement. Plan title preserved for clarity but the AAA implication is acknowledged.

`sm` deliberately stays smaller on mobile — promoting it to 44px would equal `default` and the variant would lose meaning. Convention: don't use `sm` for primary mobile actions.

Size-shrink breakpoint is `sm:` (640px), independent of the layout breakpoint at `lg:`. At 768px on a tablet, 36px buttons are ergonomically fine.

The original draft had `h-10` (40px) labelled as "44px mobile" — `h-10` is `2.5rem = 40px`. Corrected to `h-11` here.

### 9. WaterfallTierTable mobile layout

**Decision**: two-line stacked card, one component with responsive classes. Row 1 = name + meta (`text-secondary`, smaller). Row 2 = amount right-aligned with `font-mono tabular-nums` + actions menu. Desktop unchanged (single horizontal row).

Trade-off: taller rows reduce density (~8–10 visible per phone screen), but preserve scan-amount-quickly UX and the load-bearing "last reviewed" staleness signal (Anchor #12).

### 10. Search palette on mobile

**Decision**: `ResponsiveDialog` with `variant="fullscreen"`. Input at top, results fill screen, keyboard at bottom — matches platform search conventions (iOS Spotlight, Android search). Bottom-sheet would be inverted and feel wrong.

### 11. Rollout

**Decision**: phase-by-phase PRs into `stage`, **no feature flag**. Mobile verified locally and on Android via Tailscale to stage after each merge. Even between Phase 1 and Phase 3, the experience is progressively improved rather than broken — Phase 1 is bigger buttons (correct end state), Phase 2 is master-detail push-nav (functional), Phase 3 is polish.

**Pre-flight**: confirm stage dev-server binds to `0.0.0.0` or the Tailscale interface (not just `127.0.0.1`). One config flag if needed.

### 12. Testing convention: hybrid

**Decision**:

- **Inline with each phase**: structural invariant tests (design-system contracts, responsive layout assertions, ResponsiveDialog variant rendering, URL-state hook contract). Each PR includes the invariant tests for the changes it ships.
- **Phase 5**: a single full a11y smoke test across all in-scope pages, manual contrast sweep, manual TalkBack pass on Android.

Avoids both Phase 5 test-debt squeeze (Option A) and brittle per-className unit tests (Option B).

---

## iOS verification gap (known limitation)

The development team has Android-only physical devices. iOS Safari rendering will not be empirically verified during this project. **Mitigations**:

- Build defensively to iOS-Safari standards regardless: `100dvh` (not `100vh`), `text-base` on inputs (prevents iOS auto-zoom), safe-area insets on bottom-fixed surfaces, pointer events for any custom touch interaction.
- Document this gap in repo-level mobile docs after Phase 6.
- Recommended (not blocking): periodic spot-check via BrowserStack, borrowed iPhone, or community user reports after Phase 3 ships.

The defensive items cost ~0.5 dev-days total. Not worth dropping just because we can't verify them — they're correct on every platform, and the cost of retrofitting iOS support later vastly exceeds the cost of building it in now.

---

## Phase 1 — Foundations (~1.5 dev-days)

**Goal**: install lint/test guardrails, create the shared primitives every later phase consumes.

**Files**:

- `apps/frontend/package.json`, `apps/frontend/eslint.config.js`
- `apps/frontend/vitest.config.ts` and test setup file
- `apps/frontend/src/components/ui/button.tsx`
- `apps/frontend/src/index.css` (label utility classes)
- New: `apps/frontend/src/hooks/useIsMobile.ts`
- New: `apps/frontend/src/components/ui/ResponsiveDialog.tsx`
- New: `apps/frontend/src/components/common/MobileUnsupportedNotice.tsx`
- New: `apps/frontend/src/test/a11y.ts` (`expectNoA11yViolations` helper)

**Approach**:

- **eslint-plugin-jsx-a11y**: add `plugin:jsx-a11y/recommended` as `warn` first, escalate to `error` after fixes. Anticipate ~20–40 inline disables or fixes (alt text, click-without-keyboard, label-for).
- **vitest-axe**: install, expose `expectNoA11yViolations(container)`. Phase 5 wires the smoke pass.
- **`useIsMobile()` hook**: `window.matchMedia('(max-width: 1023px)')` via `useSyncExternalStore` for SSR safety. Default `false` during SSR. Used only where CSS branching can't express the rule (URL hook write strategy, ResponsiveDialog variant pick, conditionally-hidden interactions like reorder).
- **`ResponsiveDialog` wrapper**: takes `variant: "sheet" | "fullscreen"` (default `"sheet"`). On mobile, sheet variant renders a Radix Sheet anchored bottom; fullscreen variant renders a Radix Dialog with `w-screen h-[100dvh]`. On desktop, both fall through to the existing centred Radix Dialog. Inherits Radix's focus trap, escape handling, and `aria-modal` for free.
- **`MobileUnsupportedNotice`**: a shared component used by the soft-blocked pages (Phase 3). Renders the page name, a one-line "best on desktop" message, and a back button.
- **Touch targets in button.tsx** — implement the size variants from Decision 8 above. Audit raw `<button>` elements (Layout hamburger, NavLinks) and ensure mobile padding hits 44px.
- **Label contrast in `apps/frontend/src/index.css`**: rather than guessing at numeric bumps, **compute the rendered ratio** for each utility against `--card`/`--background` and adjust to ≥4.5:1 (large text ≥3:1). Document the chosen ratio per utility.
- **recharts code-split spike (~30 min)**: confirm dynamic imports of recharts work cleanly in this Vite setup before Phase 6 needs them. If awkward (e.g. tree-shaking issues, SSR concerns, or chunk-size regressions), raise as a small spec carve-out now rather than discover at the end. The chart-heavy pages (Forecast, Overview's Sankey, NetWorthBar) are the perf risk for Lighthouse mobile.

**Tests (inline invariants)**:

- `useIsMobile.test.ts` — viewport mock, asserts the boundary at 1024px.
- `ResponsiveDialog.test.tsx` — both variants render correctly at both viewports; focus trap and escape work.
- `button.test.tsx` (extend existing) — each size variant produces the expected mobile/desktop class strings.

**Risks**: jsx-a11y noise blocks CI — mitigated by `warn`-first rollout. Label contrast bumps may surface a wider sweep — fix utility classes first, propagate.

**Verify**: `bun run lint && bun run type-check && bun run test`. Render Button at both viewports.

---

## Phase 2 — Layout & state (~1.5 dev-days)

**Goal**: master-detail push navigation on mobile, URL-only selection state, desktop unchanged.

**Files**:

- `apps/frontend/src/components/layout/TwoPanelLayout.tsx`
- `apps/frontend/src/components/common/PageHeader.tsx` (add optional `onBack` slot)
- New: `apps/frontend/src/hooks/useUrlSelection.ts`
- `apps/frontend/src/design-system.test.tsx` (relax invariants)
- All in-scope pages using TwoPanelLayout (replace `useState` + read-once with `useUrlSelection`)

**Approach**:

- **TwoPanelLayout**: `w-[360px] min-w-[360px]` → `w-full lg:w-[360px] lg:min-w-[360px]`. Add optional `selectedKey?: string | null` prop. When `useIsMobile()` is true and `selectedKey != null`, render only the right panel full-screen with a slide-in transition (gated on `useReducedMotion()`). When `selectedKey == null` on mobile, render only the left aside full-screen.
- **`useUrlSelection({ param, validate? })` hook**: `[value, setValue, clear]`. Reads `useSearchParams`. Writes via `setSearchParams({ [param]: value }, { replace: useIsMobile() ? false : true })`. Optional `validate: (value: string) => boolean` callback — caller decides whether the value is acceptable (id-in-list for TierPage, enum-membership for AssetsPage, resolver-success for OverviewPage). Invalid silently clears via effect.
- **PageHeader**: when mobile + a `onBack` is supplied, render a leading 44px chevron back-button. Desktop ignores. Preserves the "PageHeader as first child" invariant.
- **Page wiring**: each in-scope list+detail page replaces `useState`+`searchParams.get(...)` with `useUrlSelection`. AssetsPage uses `param: "type"` (validates against the asset/account enum). TierPage uses `param: "subcategory"` (validates against loaded subcategories). OverviewPage migrates its local discriminated `view` union to a composite URL param: `?view=item:<id>` / `?view=type:<incomeType>` / `?view=committed-bills` / absent. A small resolver re-derives the active panel from the param + loaded summary; this also fixes a latent bug where the right panel showed stale snapshots of `name`/`amount` after edits to the underlying record.
- **`design-system.test.tsx`**: update TwoPanelLayout invariant to allow `w-full lg:w-[360px]`. Allow PageHeader's optional back-button slot. Relax left-panel scroll structure assertions to permit mobile single-panel rendering.

**Tests (inline invariants)**:

- `useUrlSelection.test.ts` — read/write, replace strategy by viewport, invalid-value clear.
- `TwoPanelLayout.test.tsx` — at <1024px with selectedKey null shows left only; with selectedKey set shows right only; at ≥1024px both panels show. Reduced-motion gate.
- `design-system.test.tsx` (update) — both desktop and mobile-aware patterns valid.

**Risks**:

- "Select after create" desktop flows must use the hook's setter, not bypass to direct `useState` — caught by inline tests on Income / Assets pages.
- Animation flicker on slow Android devices — gated on reduced-motion.

**Verify**: design-system tests pass; nav forward/back on each in-scope page; deep-link `/assets?type=Property` resolves on both viewports.

---

## Phase 3 — Page-by-page mobile pass (~2.5 dev-days)

**Goal**: every in-scope page renders cleanly at 360px with no horizontal scroll, all primary actions reachable. Soft-blocked pages render their notice.

**In-scope pages**:

- **Overview**: in `WaterfallSankey` replace fixed `width="320" height="200"` with `viewBox="0 0 320 200"` + `preserveAspectRatio="xMidYMid meet"` + `className="w-full h-auto"` (no `max-w-[320px]` cap — the page container provides max). Mobile right-panel is empty by default (no `?view=` param); tap on Sankey item / income type / committed bills sets the param and pushes to right panel. SnapshotTimeline component hidden on mobile.
- **Forecast**: wrap recharts in `<ResponsiveContainer width="100%" height={220}>`. Stat cards `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`. `LinkedAccountsPopover` (the only edit surface) converts to `ResponsiveDialog` (sheet variant) on mobile.
- **Income / Committed / Discretionary / Surplus**: master-detail push (Phase 2 covers the layout). `WaterfallTierTable` two-line stacked card on mobile per Decision 9. Subcategory reorder controls hidden on mobile via `useIsMobile()` gate.
- **Assets**: master-detail push. AssetItemArea / AccountItemArea full-width on mobile.
- **Profile Settings**: form inputs `text-base sm:text-sm` (prevents iOS focus zoom). Stack horizontal field-pairs vertically below `sm:`. ProfileSection, DisplaySection, SecurityActivitySection all render responsively. Household Settings is soft-blocked — see below.
- **Auth pages** (`LoginPage`, `RegisterPage`, `AcceptInvitePage`, `WelcomePage`): confirm `max-w-md mx-auto`; reduce `px-8` to `px-4 sm:px-8`. Submit buttons use `lg` size variant (48px mobile). `AcceptInvitePage` in particular must work cleanly on mobile — invite links are typically opened on a phone via email/SMS. No password-reset, email-verification, or magic-link flows currently exist; any added later default to in-scope per this plan.
- **Cashflow grids** (`CashflowMonthView.tsx`, `CashflowYearView.tsx`, `UpcomingModePanel.tsx`): `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`.
- **Stat grids** (`CompoundInterestCalculator`, `NetWorthBar`, `GrowthSectionPanel`): `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`.

**Soft-blocked pages**:

- FullWaterfall, Goals, Gifts, Help, Household Settings: render `<MobileUnsupportedNotice pageName="…" />` when `useIsMobile()` is true. Desktop unchanged.
- Snapshot routes: same treatment — historical snapshots are desktop-only.
- **Discoverability**: each soft-blocked route gets a `desktopOnly: true` config flag. The hamburger nav (`Layout.tsx`) and search results (`SearchPalette.tsx`) render these routes with a "(desktop only)" badge on mobile rather than hiding them — tap still leads to the soft-block notice. Balances scope honesty with feature discoverability.

**Tests (inline invariants)**:

- Per-page snapshot or class-presence assertions where the layout is non-trivial (WaterfallTierTable two-line vs flex row, stat-grid breakpoint correctness).
- Soft-block behaviour: at <1024px, FullWaterfall / Goals / Gifts / Help / snapshot routes render the notice and not the original content.

**Risks**: stacked WaterfallTierTable rows lose amount scan-ability if implementation drifts — caught by inline test asserting right-aligned `tabular-nums` on row 2.

**Verify**: screenshot each page at 375 / 412 / 768 / 1024; no horizontal scrollbar.

---

## Phase 4 — Defensive & interactions (~1.5 dev-days)

**Goal**: defensive iOS-Safari measures, form ergonomics, hamburger nav audit, remaining interaction polish.

**Files** (audit-driven, will touch many):

- `apps/frontend/src/index.css`, page wrappers using `min-h-screen` / `100vh`
- All form components in `apps/frontend/src/features/**/forms/*.tsx` and inline forms
- `apps/frontend/src/components/layout/Layout.tsx` (hamburger nav)
- `apps/frontend/src/components/ui/Sonner.tsx` (or equivalent toast wrapper)

**Approach**:

- **`100vh → 100dvh` audit**: grep `100vh`, `min-h-screen`, `h-screen`. Replace with `100dvh` / `min-h-dvh` / `h-dvh` where the height needs to track the dynamic viewport (most cases). `min-h-screen` on page wrappers stays — the height-chain is `h-full` from there, which doesn't trip the iOS bug.
- **Safe-area insets**: any bottom-fixed CTA, modal footer, or sticky bottom nav gets `pb-[env(safe-area-inset-bottom)]`. Audit the ResponsiveDialog sheet variant footer specifically.
- **`inputmode` / `type` audit**: every form input gets the right keyboard. Currency → `inputmode="decimal"`, percentage → `inputmode="decimal"`, year → `inputmode="numeric"`, dates → native date picker via `type="date"` (or our existing date component if richer). Email/tel/url inputs use the matching `type=`. Apply consistently across all in-scope page forms.
- **Hamburger nav audit**: focus trap (Radix Sheet provides it — verify), escape key closes, route-change auto-closes (subscribe to router or close on link click), swipe-to-close on mobile (Radix Sheet supports `dismissible`), touch target ≥44px, scrim contrast meets AA.
- **Toast `aria-live`**: success / info → `role="status" aria-live="polite"`. Error → `role="alert" aria-live="assertive"`. Sonner accepts per-toast `toastOptions` for this — wrap the toaster portal accordingly.
- **Reduced-motion extension**: not just slide-in. Audit chart entry animations (recharts `isAnimationActive`), accordion expand transitions, toast slide. Wrap or set props based on `useReducedMotion()`.
- **Tooltips on touch**: Radix Tooltip handles tap-hold via `delayDuration` — verify on Android. For recharts tooltips, default touch behaviour is acceptable; configure `trigger="click"` if discoverability suffers in real-device test.

**Tests (inline invariants)**:

- Toast aria-live mapping (success → polite, error → assertive).
- Hamburger nav route-change auto-close.
- Reduced-motion path doesn't apply animation classes.

**Risks**: `inputmode` audit may surface forms that need richer input components (e.g., a currency input that's currently a plain text field). Triage during audit; defer richer components to a separate spec if scope creeps.

**Verify**: form-by-form keyboard check on Android. Hamburger nav across each in-scope page on a real Android device via Tailscale.

---

## Phase 5 — A11y completion to WCAG AA (~1.5 dev-days)

**Goal**: pass automated axe checks and clear remaining manual gaps for the in-scope pages.

**Approach**:

- **Smoke a11y test**: `apps/frontend/src/test/a11y.smoke.test.tsx` mounts each in-scope top-level page (mocked queries) and asserts `expectNoA11yViolations`. Allowlist false positives with comments and reasons.
- **Contrast sweep**: grep `text-foreground/[0-4]0`, `text-muted-foreground/[0-6]0`. For each occurrence, compute rendered colour against the local background; verify ≥4.5:1 (large text ≥3:1). Fix utility classes once, propagate.
- **Placeholder-only inputs**: audit forms across `apps/frontend/src/features/**/forms/*.tsx`. Add `<Label htmlFor>` or `aria-label`. ~5–15 instances expected.
- **Scrollable containers with focusable children**: grep `overflow-y-auto`. Containers that are scroll-only get `tabIndex={0}`. Ones whose children take focus naturally don't.
- **Manual TalkBack pass on Android** (no iOS device available — see iOS verification gap): Overview, Assets, one tier page, one form page. Document any issues. Note: TalkBack is the closest available proxy for VoiceOver but not equivalent — heading navigation, landmark behaviour, gesture vocabulary, and default verbosity differ. Bugs specific to VoiceOver may not surface here; the iOS verification gap covers this honestly.

**Risks**: contrast sweep may surface dozens of violations — triage by frequency, fix utility classes first.

**Verify**: vitest a11y smoke pass; manual TalkBack pass complete with notes filed.

---

## Phase 6 — Verification & sign-off (~1 dev-day)

- **Local emulation**: Chrome DevTools at 375×667 (iPhone SE), 393×852 (iPhone 14 Pro), 412×915 (Pixel 7), 820×1180 (iPad portrait — must match mobile push-nav), 1024×1366 (iPad landscape — must match desktop), 1440×900 (laptop).
- **Real device**: Android via Tailscale to stage. Confirm no horizontal scroll, no stuck modals, hamburger / search work, every in-scope form submittable, soft-block pages render the notice.
- **Automated**: `bun run lint`, `bun run type-check`, `bun run test` (incl. a11y smoke + design-system invariants), backend tests via `cd apps/backend && bun scripts/run-tests.ts`.
- **Lighthouse mobile**: Accessibility ≥95, Best Practices ≥95, Performance ≥85. If perf falls short, apply the chart code-splitting pattern de-risked in Phase 1 to Forecast, Overview's Sankey, NetWorthBar, and any other chart-heavy page.
- **Manual checklist per in-scope page**: navigable, every form submittable, every modal usable as Sheet, every chart readable, no horizontal scroll, all primary touch targets ≥44px, no zoom needed, back button works.
- **iOS verification gap**: documented as a known limitation in the project's mobile section (consider a `docs/3. architecture/mobile.md` for this).

---

## Effort & sequencing

| Phase                        | Effort | Depends on |
| ---------------------------- | ------ | ---------- |
| 1 — Foundations              | 1.5 d  | —          |
| 2 — Layout & state           | 1.5 d  | 1          |
| 3 — Page-by-page mobile      | 2.5 d  | 2          |
| 4 — Defensive & interactions | 1.5 d  | 1          |
| 5 — A11y completion          | 1.5 d  | 3          |
| 6 — Verification             | 1.0 d  | all        |
| New: ResponsiveDialog        | (in 1) |            |
| New: Soft-block component    | (in 1) |            |
| New: dvh/safe-area audit     | (in 4) |            |
| New: inputmode audit         | (in 4) |            |
| New: Bundle/perf check       | (in 6) |            |
| New: Hamburger nav audit     | (in 4) |            |

**Budget: ~11.25 dev-days. Realistic with normal overrun: 13–14 dev-days.**

Phases 1, 2, 4 can overlap after the first half of Phase 1 lands. Phase 3 must wait on Phase 2. Phase 5 must wait on Phase 3.

---

## Rollout

- **Phase-by-phase PRs into `stage`**, no feature flag.
- **Pre-flight**: confirm stage dev-server binds to `0.0.0.0` or the Tailscale interface. One config flag fix if needed.
- **Verification per merge**: PR description includes a "verified locally on Android via Tailscale" line for any phase that ships visible mobile changes.
- **Cumulative behaviour**:
  - After Phase 1: button sizes change site-wide (correct end state).
  - After Phase 2: master-detail push-nav active; pages navigate correctly but most still need Phase 3 polish.
  - After Phase 3: mobile is genuinely usable end-to-end on the in-scope pages; soft-blocks render on the rest.
  - After Phase 4: defensive + ergonomic hardening complete.
  - After Phase 5–6: WCAG AA pass + sign-off.
- **Production cutover**: standard `stage → main` flow per existing CI/CD. Mobile is "officially supported" in product copy after Phase 6 ships to prod.

---

## Critical files

- `apps/frontend/src/components/layout/TwoPanelLayout.tsx`
- `apps/frontend/src/components/layout/Layout.tsx`
- `apps/frontend/src/components/common/PageHeader.tsx`
- `apps/frontend/src/components/ui/button.tsx`
- `apps/frontend/src/index.css`
- `apps/frontend/src/design-system.test.tsx`
- `apps/frontend/eslint.config.js`
- New: `apps/frontend/src/hooks/useIsMobile.ts`
- New: `apps/frontend/src/hooks/useUrlSelection.ts`
- New: `apps/frontend/src/components/ui/ResponsiveDialog.tsx`
- New: `apps/frontend/src/components/common/MobileUnsupportedNotice.tsx`
- New: `apps/frontend/src/test/a11y.ts`
- New: `apps/frontend/src/test/a11y.smoke.test.tsx`
