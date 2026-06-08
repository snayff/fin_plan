# Mobile Architecture

> **Source of truth for mobile responsiveness, the URL-state pattern, and known limitations.** Read alongside `docs/2. design/design-anchors.md` (Anchor #6) and the implementation plan at `docs/4. planning/mobile-accessibility/plan.md`.

---

## Scope (locked)

Anchor #6 codifies finplan as "desktop-first; mobile is a scoped viewer". This document operationalises that.

**Responsive (view + targeted edit on mobile):**

- Overview, Income, Committed, Discretionary, Surplus, Assets
- Forecast (view + nav controls only; `LinkedAccountsPopover` is the lone edit surface)
- Profile Settings
- Auth pages (`LoginPage`, `RegisterPage`, `AcceptInvitePage`, `WelcomePage`)

**Soft-blocked on mobile** (renders `<MobileUnsupportedNotice />`):

- FullWaterfall — bulk-entry workbench
- Goals, Gifts — config-heavy
- Help — long-form reading
- Household Settings — assumption tuning, audit log, data import/export, destructive admin

**Hidden within in-scope pages:** subcategory reorder, snapshot timeline, multi-select, keyboard-shortcut hints.

---

## Layout breakpoint

The desktop two-panel layout activates at **`lg: 1024px`**. Below that, every responsive page renders a single-panel mobile push-nav layout. iPad portrait (768–1023px) lives on the mobile side because a 360px aside leaves only ~408px of detail-panel space — worse than the dedicated mobile push-nav.

Tailwind defaults are used as-is; no custom `xs:` breakpoint. Code convention is **mobile-first className ordering** (idiomatic Tailwind: unprefixed = mobile, `md:`/`lg:` = larger). This is purely a coding convention — the _design_ philosophy remains desktop-first.

---

## Master-detail navigation: URL-only selection state

In list+detail pages, the URL is the single source of truth for "which item is selected". Implemented via `useUrlSelection({ param, validate? })`:

```tsx
import { useUrlSelection } from "@/hooks/useUrlSelection";

const [selectedId, setSelected, clearSelected] = useUrlSelection({
  param: "subcategory",
  validate: (v) => loadedItems.some((item) => item.id === v),
});
```

**Conventions:**

- **Feature-specific param names** (`?subcategory=`, `?type=`, `?view=`) — never a generic `?detail=`. Aligns with existing `?add=` / `?focus=` conventions.
- **Replace strategy is viewport-dependent:** `replace: true` on desktop (list clicks don't pollute history), `replace: false` on mobile (OS back clears detail).
- **Invalid values silently clear** via the validator callback. No errors surfaced to the user.
- **Coexists with other URL params** — the hook reads/writes its single param and leaves the rest untouched.

**TwoPanelLayout** consumes selection via the `selectedKey` prop. On mobile:

- `selectedKey == null` → left aside only (list view)
- `selectedKey != null` → right main only (detail view)

Desktop ignores the prop and always renders both panels.

**PageHeader** accepts an optional `onBack` callback; when supplied and the viewport is mobile, it renders a 44×44 back chevron to the left of the title.

**Composite param example (`OverviewPage`):** the right panel state is a discriminated union, not a single id. The page encodes/decodes a composite param: `?view=item:<id> | type:<incomeType> | committed-bills`. A small `resolveOverviewView()` function re-derives the active panel from the param + loaded summary on each render. The pure resolver is unit-tested at `pages/OverviewPage.resolver.test.ts`.

---

## Modal pattern: `ResponsiveDialog`

All form modals use the shared wrapper:

```tsx
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";

<Dialog open={open} onOpenChange={setOpen}>
  <ResponsiveDialogContent variant="sheet">
    <DialogTitle>Edit asset</DialogTitle>
    {/* … */}
  </ResponsiveDialogContent>
</Dialog>;
```

**Variants (mobile only — desktop renders the centred Radix Dialog in both cases):**

- `"sheet"` (default) — bottom-anchored sheet, matches iOS/Android sheet conventions. Used by every form modal.
- `"fullscreen"` — full-viewport overlay. Used by the search palette so the on-screen keyboard doesn't reorder content.

The sheet variant already applies `pb-[max(1.5rem,env(safe-area-inset-bottom))]` so the bottom action area clears the iPhone home indicator and Android gesture bar.

---

## Touch targets

| Variant   | Mobile        | Desktop          | Class                     | Use                                            |
| --------- | ------------- | ---------------- | ------------------------- | ---------------------------------------------- |
| `default` | 44px (`h-11`) | 36px (`sm:h-9`)  | `h-11 sm:h-9`             | Primary CTAs, row actions                      |
| `icon`    | 44px (`h-11`) | 36px (`sm:h-9`)  | `h-11 w-11 sm:h-9 sm:w-9` | Icon-only buttons                              |
| `lg`      | 48px (`h-12`) | 40px (`sm:h-10`) | `h-12 sm:h-10`            | Hero CTAs (auth submit)                        |
| `sm`      | 36px (`h-9`)  | 32px (`sm:h-8`)  | `h-9 sm:h-8`              | Dense secondary (filter chips, inline toggles) |

44px is the iOS HIG / Material Design / WCAG AAA target. WCAG 2.2 AA requires only 24×24 — the 44px target is a UX choice, not an AA requirement. **Convention:** don't use `sm` for primary mobile actions — it deliberately stays smaller for dense contexts.

The shared `Input` component is `h-11 sm:h-9` and `text-base sm:text-sm`. The `text-base` mobile size (16px) prevents iOS Safari from auto-zooming the viewport on input focus.

---

## Discoverability of soft-blocked routes

On mobile, the hamburger nav and search palette both still surface soft-blocked routes, with a "(desktop only)" badge:

- Hamburger: `NavItem.desktopOnly: true` (see `components/layout/Layout.tsx`)
- Search: `PaletteAction.desktopOnly: true` (see `features/search/actions.ts`)

Tapping a badged item navigates and lands on `<MobileUnsupportedNotice>` — the user is informed without being silently denied access. This balances scope honesty against feature discoverability.

---

## iOS Safari verification gap

**No iOS device is available to this project.** Defensive code is in place but cannot be empirically verified.

**Defensive items shipped:**

- `100vh → 100dvh` on the layout root and dropdown maxHeights (iOS Safari address-bar collapse)
- `text-base sm:text-sm` on the shared `Input` (prevents auto-zoom on focus)
- `env(safe-area-inset-bottom)` in the `ResponsiveDialog` sheet variant
- `inputMode="decimal"` on numeric amount/percentage fields (numeric keyboard without arrow spinners)

**What this means in practice:**

- Mobile is verified on real Android (Pixel-class) via Tailscale to stage during development.
- iOS Safari rendering is _implemented to spec_ but not empirically tested. Bugs specific to iOS may exist and surface only when an iPhone user opens the app.
- Recommended periodic spot-check via BrowserStack, borrowed iPhone, or community user reports.

This gap is also why Phase 5's manual screen-reader pass uses **TalkBack (Android), not VoiceOver (iOS)**. TalkBack is the closest available proxy but not equivalent — heading navigation, landmark behaviour, gesture vocabulary, and default verbosity differ.

---

## Accessibility (WCAG 2.1 AA target)

**Tooling:**

- `eslint-plugin-jsx-a11y` is wired into `eslint.config.js` at `warn` level. Rules escalate to `error` as their violations are resolved.
- `axe-core` + the helper at `src/test/a11y.ts` (`expectNoA11yViolations`) backs the smoke pass at `src/test/a11y.smoke.test.tsx`.

**jsx-a11y rule status:**

- **Off (project-wide reason):**
  - `jsx-a11y/label-has-for` — deprecated HTML4-era rule, superseded by `label-has-associated-control`.
  - `jsx-a11y/no-autofocus` — all autoFocus uses in this codebase are inside modals/dialogs/popovers where focus-on-open is the correct WCAG focus-management behaviour.
- **Warn (backlog — fix incrementally, escalate when done):**
  - `jsx-a11y/label-has-associated-control` (~44) — labels missing `htmlFor` or not wrapping their control. Forms in HouseholdSettings (soft-blocked), Gifts (soft-blocked), and a handful of in-scope forms (`ItemForm`, `AssetForm`, `AccountForm`, `RecordBalanceInlineForm`).
  - `jsx-a11y/control-has-associated-label` (~39) — buttons / inputs without an accessible name. Mostly the same files.
  - Smaller categories: `click-events-have-key-events`, `no-static-element-interactions`, `role-supports-aria-props`, etc. Mostly in legacy interactive surfaces.

**Smoke pass:** every shipped primitive (Button, Input+Label, PageHeader, TwoPanelLayout, MobileUnsupportedNotice, ResponsiveDialog) passes `expectNoA11yViolations`. Heavy top-level pages are exercised by their existing per-page tests rather than the smoke pass.

**Contrast verified inline:**

```
.label-section (muted-fg/60 ≈ #9598a6 over --card #0d1120)  →  6.60:1  ✓ AA
.label-detail  (muted-fg/70 ≈ #abadbc)                       →  8.66:1  ✓ AA
.label-chart   (text-secondary 0.65)                         →  7.59:1  ✓ AA
```

The previous `.label-chart` rule (`text-text-tertiary`) computed to 3.54:1 and failed AA for small text — fixed in the implementation.

---

## Bundle / perf

Vite's route-based code-splitting already produces per-page and per-chart chunks (`AreaChart-…js`, `LineChart-…js`, `OverviewPage-…js`, etc.). The recharts payload is the dominant per-route cost on chart-heavy pages (Forecast, Overview Sankey, NetWorthBar) — gzipped ~107 KB on AreaChart.

Lighthouse mobile budget targets (Phase 6): Accessibility ≥95, Best Practices ≥95, Performance ≥85. If perf falls short, the lever is _not_ "add code-splitting" (already done) but either a recharts alternative or a viewport-aware lazy-mount pattern.

---

## Known limitations / follow-ups

- iOS Safari unverified (see gap above).
- Lighthouse mobile not yet run.
- Manual TalkBack pass on Android pending (in-scope per Phase 5; needs the rollout-deployed stage).
- `LinkedAccountsPopover` is a custom positioned popover, not yet converted to `ResponsiveDialog`. On mobile it renders as a positioned panel; acceptable but not ideal.
- ~83 jsx-a11y warnings remain across forms. Tracked as Phase 5 follow-up. None block mobile usability.
- `WaterfallTierTable` two-line stacked mobile layout deferred — the component lives only in `FullWaterfallPage`, which is soft-blocked on mobile.
- `SubcategoriesSection` and `SnapshotTimeline` reorder/scrub interactions deferred for the same reason (their host pages are soft-blocked).
