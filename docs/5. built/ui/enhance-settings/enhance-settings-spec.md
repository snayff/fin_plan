---
feature: enhance-settings
design_doc: docs/4. planning/enhance-settings/enhance-settings-design.md
creation_date: 2026-04-18
status: implemented
implemented_date: 2026-07-05
---

# Enhance Settings

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Settings has drifted below the quality bar of the rest of the app: it mixes personal and household-scoped controls in one disordered page, breaks the canonical design system (left panel width, highlight pattern, scroll structure), forces explicit Save clicks for most sections, and lets the household switcher dropdown overflow the viewport. This feature brings Settings back into line with the rest of the app so users can configure finplan with the same calm, consistent feel they get everywhere else.

## Description

Split the single Settings page into two scope-specific pages — **Profile Settings** (personal, cross-household) reached via a new profile-avatar dropdown in the top nav, and **Household Settings** (per-active-household) reached via the Household Switcher's new "Household settings" action. Both pages use the canonical 360px left panel with `PageHeader`, indicator-pattern nav, and a sticky-header right panel that renders all sections in one scroll-spy long page separated by `space-y-12` rhythm and horizontal dividers. All routine inputs auto-save on change (debounced 600ms for text; immediate for toggles/selects/sliders) with a subtle green border pulse + inline "✓ saved" flash; destructive actions keep `ConfirmationModal` confirmation. The household switcher dropdown is restructured into two groups — switching and actions — and anchored `right-0` with a viewport-safe max-height.

## User Stories

- As a household member, I want to access personal preferences (name, display format) from a clearly personal entry point so that I don't mix them up with household-level settings.
- As a household member, I want to reach household settings from the household switcher so that household-scoped actions live next to the household I'm switching between.
- As a household member, I want Settings to remember my changes automatically so that I don't have to remember to click Save or worry about losing work when I navigate away.
- As a household member, I want to see immediate, calm feedback when a setting saves so that I trust it's been captured without being interrupted by modals or toasts.
- As a household member, I want a clear, localised error when a save fails so that I know exactly which field to retry.
- As a household owner, I want destructive actions (leaving, removing members, resetting data, role changes) to still require explicit confirmation so that I can't trigger them by accident.
- As a user with many households, I want the household switcher dropdown to stay inside the viewport so that I can always read and select from the full list.
- As a household member jumping between settings, I want the left-nav highlight to follow me as I scroll or jump to sections so that I always know where I am.
- As a user of any screen size at or above 1024px, I want Settings to follow the same two-panel shape as the rest of the app so that the app feels cohesive.

## Acceptance Criteria

- [ ] `/settings` redirects to `/settings/profile`.
- [ ] `/settings/profile` renders the Profile Settings page and is reachable via the profile avatar dropdown.
- [ ] `/settings/household` renders the Household Settings page and is reachable via the Household Switcher → "Household settings".
- [ ] The "Settings" text link is removed from the top navigation bar.
- [ ] A circular profile avatar (32px, `rounded-full`, initials fallback, deterministic background colour) is present at the far right of the top nav on all pages where the top nav is visible.
- [ ] The profile avatar dropdown shows the user's name and email, a `Profile settings` entry, and a `Sign out` entry.
- [ ] The household switcher dropdown renders two groups: _Switch household_ (list of households with current marked by a check) and _Actions_ (`Household settings`, `+ Create new household`), separated by a 1px divider.
- [ ] Both dropdowns are anchored to the right edge of their trigger and never overflow the viewport horizontally.
- [ ] Both dropdowns cap vertical height at `min(420px, 100vh - 70px)` and scroll internally when content exceeds that.
- [ ] Profile Settings left panel uses `PageHeader` with title "Profile" in `page-accent` and a sub-label "Your personal preferences" in `text-tertiary`.
- [ ] Profile Settings left nav is flat (no groups) with exactly two items: Account, Display.
- [ ] Household Settings left panel uses `PageHeader` with title "Household" in `page-accent` and a sub-label showing the active household name in `text-secondary`.
- [ ] Household Settings left nav is grouped into General (Details, Members & invites), Financial (Surplus benchmark, ISA settings, Staleness thresholds, Growth rates), Structure (Subcategories), Advanced (Data, Audit log).
- [ ] Role-based visibility: Growth rates and Audit log entries are hidden from Members; Data is hidden from Members and Admins; Owners see all entries.
- [ ] Left panel nav buttons use the canonical indicator-pattern for the active state (`bg-page-accent/14 border-l-2 border-page-accent rounded-r-sm`) — never a full-fill background.
- [ ] Left panel is fixed at 360px with the canonical scroll structure (`flex flex-col h-full` containing `PageHeader` + `flex-1 min-h-0 overflow-y-auto` + footer).
- [ ] Right panel renders all sections simultaneously; clicking a left-nav item sets the active highlight immediately and smooth-scrolls the right panel to the section.
- [ ] Scrolling the right panel updates the active left-nav highlight via `IntersectionObserver`.
- [ ] The right-panel header is sticky at the top of the right panel while scrolling.
- [ ] Sections are separated by horizontal dividers and `space-y-12` vertical rhythm.
- [ ] Section titles use `font-heading`, weight 700, uppercase, 0.06em letter-spacing, `text-page-accent`.
- [ ] Text inputs auto-save 600ms after the last keystroke; checkboxes, selects, and sliders save immediately on change.
- [ ] On successful save, the input border pulses `success` green (~1.5s animation) and an inline "✓ saved" flash appears next to the field label for ~1.5s, then fades.
- [ ] No toast is shown for successful saves.
- [ ] On save failure, the field reverts to the last-known server value and inline red helper text appears below the input (`Couldn't save — try again`). No toast is shown.
- [ ] Inline error text persists until the user edits the field again or a subsequent save succeeds.
- [ ] Destructive actions (Leave household, Remove member, Reset data, Cancel invite) retain `ConfirmationModal` confirmation and never auto-save.
- [ ] Member role changes (e.g. member ↔ admin, owner promotion/demotion) retain their existing explicit confirm step — they do not auto-save.
- [ ] Growth rates and Audit log have correct `data-section-id` refs (the swapped-ref bug is fixed).
- [ ] Ambient glow on both Settings pages follows § 1.2 Settings page treatment (neutral 4% top-right, no secondary).
- [ ] All motion (border pulse, inline flash, smooth scroll) is disabled when `prefers-reduced-motion: reduce` is set; state still updates but transitions snap.
- [ ] Navigating to `/settings/household` when the user has no active household redirects to `/settings/profile`.
- [ ] At the minimum supported viewport width (1024px), both dropdowns remain fully visible without horizontal scroll.
- [ ] ESLint zero warnings; TypeScript strict mode passes.

## Open Questions

- [x] ~~Do member role changes auto-save?~~ **No** — they retain the existing explicit confirm step, consistent with the destructive-action exemption.
- [x] ~~What happens if a user lands on `/settings/household` without an active household?~~ **Redirect to `/settings/profile`**.
- [x] ~~How long does inline save-failure helper text persist?~~ **Until the user edits the field again or a subsequent save succeeds**.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

No schema changes. All existing entities (`UserSettings`, `HouseholdSettings`, `Household`, `HouseholdMember`, `Invite`, `SubcategorySettings`, `GrowthRateSettings`, audit log entities) are reused as-is.

### API

No new or modified API operations. All existing endpoints are reused as-is:

- Get user settings — JWT-protected
- Update user settings (name, show-pence) — JWT-protected
- Get household details (name, members, invites) — JWT-protected, household-scoped
- Update household (rename) — JWT-protected, household-scoped, owner-only
- Update household settings (surplus benchmark, staleness, ISA, growth rates) — JWT-protected, household-scoped
- Update subcategory settings — JWT-protected, household-scoped
- Invite / cancel invite / remove member / update member role / leave household — JWT-protected, household-scoped, role-gated per existing rules
- Data reset / export / import — JWT-protected, household-scoped, owner-only
- Audit log query — JWT-protected, household-scoped, owner+admin

Auto-save does not change the API contract: each auto-save invocation reuses the existing update endpoint for the setting in question.

### Components

- **ProfileSettingsPage** — top-level page for `/settings/profile`. Renders the canonical two-panel shell with the `Profile` left panel and the right panel containing all profile sections.
- **HouseholdSettingsPage** — top-level page for `/settings/household`. Renders the canonical two-panel shell with the `Household` left panel (grouped nav) and the right panel containing all household sections, role-filtered.
- **SettingsLeftPanel** — shared left-panel shell used by both pages. Accepts a title, optional sub-label, and a flat or grouped list of nav items. Implements the canonical `PageHeader`, indicator-pattern active state, `flex flex-col h-full` scroll structure, and left footer (`finplan v{version}`). Coordinates click-to-scroll by exposing an `onNavClick(id)` callback to the parent.
- **SettingsRightPanel** — shared right-panel shell used by both pages. Renders a sticky right-panel header, a scrolling body containing the provided section children separated by horizontal dividers with `space-y-12` rhythm, and installs the scroll-spy `IntersectionObserver` that drives the active nav id. On external `onNavClick`, it sets the active id immediately and smooth-scrolls the matching section into view.
- **SettingsSection** — wrapper for each right-panel section; sets `data-section-id`, renders the section title per § 8 treatment, optional description, and children. Replaces the current `Section.tsx`.
- **AutoSaveField** — shared field wrapper applying the auto-save protocol. Handles debounce (600ms for text; 0ms for toggles/selects/sliders via a prop), optimistic local state, success micro-reaction (border pulse + inline "✓ saved" flash), failure revert + inline error helper, and `prefers-reduced-motion` compliance. Exposes loading, saved, and error states that children consume.
- **ProfileAvatar** — top-nav circular avatar trigger (32px, `rounded-full`, initials fallback with deterministic colour, `active:scale-0.97`). Opens the `ProfileAvatarDropdown`. Used in the top nav bar.
- **ProfileAvatarDropdown** — dropdown panel anchored `right-0` showing user name + email, `Profile settings`, `Sign out`. Viewport-safe max-height.
- **HouseholdSwitcher (updated)** — existing component restructured. Dropdown rendered as two groups (_Switch household_, _Actions_) separated by a divider. Actions group contains `Household settings` and `+ Create new household`. Anchored `right-0` with viewport-safe max-height.
- **TopNav (updated)** — removes the Settings link from the nav-link list; inserts the `ProfileAvatar` at the far right after the `HouseholdSwitcher`.
- **Existing section components** (`ProfileSection`, `DisplaySection`, `StalenessSection`, `SurplusSection`, `IsaSection`, `SubcategoriesSection`, `HouseholdSection`, `DataSection`, `GrowthRatesSection`, `AuditLogSection`, `MemberManagementSection`) — refactored to:
  1. Wrap editable fields in `AutoSaveField` (remove explicit Save buttons and local draft state where present).
  2. Use the new `SettingsSection` wrapper for consistent header treatment.
  3. Split `HouseholdSection` into two narrower sections — `HouseholdDetailsSection` (name only) and `HouseholdMembersSection` (existing member list + invite form + pending invites + leave household), each under its own nav item.

### Notes

**Routing & redirects**

- Add routes for `/settings/profile` and `/settings/household` to the frontend router.
- Add a redirect: `/settings` → `/settings/profile`.
- `/settings/household` performs a client-side redirect to `/settings/profile` if `user.activeHouseholdId` is null/missing.
- Existing links elsewhere in the app that point to `/settings#<anchor>` continue to work: the old path redirects; the anchor behaviour is preserved by the scroll-spy coordinator.

**Scroll-spy coordination (fixes the current bug)**

- On left-nav click: set `activeSection` synchronously to the clicked id, then trigger `scrollIntoView` with `behavior: smooth`, `block: start`. This prevents the observer from overwriting the highlight during the in-flight scroll.
- The observer is installed on the right-panel scroll container (not `window`). Threshold `0.3`. Active section = the topmost intersecting section.
- While smooth-scrolling is in progress, the observer's updates are deferred (e.g. a short "scroll lock" window of ~400ms after a click) so rapid clicks do not fight the animation.

**Auto-save protocol (detail)**

- Text inputs: 600ms debounce after last keystroke. If the user continues typing, the timer resets.
- Toggles/checkboxes/selects/sliders: save immediately on change (no debounce).
- Only send a save when the local value differs from the last-known-saved value.
- Optimistic UI: the input's local state updates immediately; the save promise runs in parallel. On success, the local state is reconciled with the server response. On failure, the local state reverts to the last-known-saved value.
- Success micro-reaction begins when the save resolves (not when the keystroke ends). If another save starts before the reaction completes, the reaction restarts.
- Failure text is cleared when the field is edited again or a subsequent save succeeds.
- If the user navigates away while a save is pending, the save still completes in the background (TanStack Query mutation semantics).

**Role-change & destructive-action exemptions**

- Member role selects, Remove member, Leave household, Cancel invite, Reset data, and Subcategory delete-with-reassignment all keep their existing explicit-confirm UX.
- These flows do not wrap their fields in `AutoSaveField`; they use the existing mutation + `ConfirmationModal` pattern.

**Dropdown positioning**

- Both dropdowns (Household switcher, Profile avatar) use `position: absolute; top: calc(100% + 6px); right: 0;` relative to their trigger.
- Maximum height: `min(420px, 100vh - 70px)`; `overflow-y-auto`; custom scrollbar per § 1.6.
- Background `surface-overlay`, border `surface-overlay-border`, `radius 8px`, padding `6px`.
- `z-index` follows § 1.8 dropdown layer (30).
- Close-on-outside-click and close-on-`Escape` behaviour is preserved and extended to both dropdowns.

**Section ordering**

- **Profile Settings**: Account, Display.
- **Household Settings**: Details, Members & invites, Surplus benchmark, ISA settings, Staleness thresholds, Growth rates, Subcategories, Data, Audit log.

**Role filtering**

- Member sees: Details, Members & invites, Surplus benchmark, ISA settings, Staleness thresholds, Subcategories.
- Admin additionally sees: Growth rates, Audit log.
- Owner additionally sees: Data.
- Role filtering applies to both the left-nav entries and the right-panel sections (filtered sections do not render in either place).

**Design-system compliance**

- All layout primitives (left panel width, `PageHeader`, scroll structure, indicator-pattern nav, footer, right-panel header, section title treatment, `space-y-12` rhythm) follow the updated § 3.1, § 7, and § 8 in `docs/2. design/design-system.md`.
- Page ambient glow follows the Settings treatment in § 1.2 (neutral 4% top-right, no secondary) — applied via `data-page="settings"`.
- All motion uses `ease-out-quart` per § 4.8 and disables cleanly under `prefers-reduced-motion`.

**Accessibility**

- Nav items are `<button>` elements with visible focus ring (`action` token).
- On nav click, after the smooth scroll completes, focus moves to the section heading (`tabindex="-1"`) so keyboard users resume reading at the new location.
- The active nav item has `aria-current="true"`.
- `AutoSaveField` announces save status via `aria-live="polite"` on the "✓ saved" element and `role="alert"` on the inline error text. Border pulse is decorative only.
- Dropdowns trap focus while open, return focus to their trigger on close, and handle `Escape` and arrow-key navigation per § Select.

**Performance**

- Auto-save is per-field; no page-level batching required for v1.
- Existing TanStack Query invalidation semantics carry over unchanged.
- No additional backend load is expected because the same endpoints are called; the difference is request cadence (slightly higher during active editing). The 600ms debounce keeps this bounded.

**Security & multi-tenancy**

- No new routes — all existing `authMiddleware` and role guards remain in force.
- `householdId` continues to be sourced from `req.householdId!` (middleware), never from URL params.
- No new inputs bypass existing Zod validation; `AutoSaveField` simply calls the same mutations as today.
- Audit log entries are unchanged: every mutation call still flows through `audited()` at the route level.
- No PII or secrets are logged client-side; the "✓ saved" micro-reaction does not include any field content.
- Dropdown close-on-outside-click prevents stray interaction from leaking to nav items; `Escape` cancels without committing pending saves.
- No CSRF surface change: mutations continue via the existing JSON + bearer-token pattern.
- No rate-limit change needed for v1 — the 600ms debounce is expected to keep per-user request rates well below existing backend limits. If production telemetry shows sustained high update rates per user (e.g. > 5 saves/second over a 10s window), a client-side coalescer can be added post-launch.

**Page-level data states**

- Both pages follow § 4a Data States. During initial load (`isLoading && !data`), the right panel renders a `SkeletonLoader` (right-panel variant). On initial-load failure (`isError && !data`), the right panel renders `PanelError` with a retry. On background-refetch failure with cached data, the global `StaleDataBanner` appears (already wired through `Layout.tsx`). Successful load renders the full content.
- The left panel renders its nav and footer in all states — even during initial load — since the nav structure is known without data. Role-gated nav entries only render once household-role data resolves; before that they are hidden (not shown disabled).
- A user with no active household reaching `/settings/household` is redirected before any skeleton renders.

**Testing**

- Component tests: `AutoSaveField` (debounce timing, toggle immediacy, optimistic update, revert-on-failure, reduced-motion branch), `SettingsLeftPanel` (indicator pattern, group rendering, click → active id), `SettingsRightPanel` (scroll-spy activation, sticky header, click → scroll + active id coordination), `ProfileAvatar` / `ProfileAvatarDropdown` (anchor, close, keyboard), `HouseholdSwitcher` (two-group structure, `Household settings` navigation, `Create new household` dialog, anchor right-0).
- Page tests: `ProfileSettingsPage` (flat nav, two sections, redirect behaviour), `HouseholdSettingsPage` (grouped nav, role-based section visibility, no-active-household redirect).
- Regression tests: the swapped `data-section-id` bug, the left-nav highlight alignment, the dropdown viewport overflow at 1024px width.
- No backend tests change — the backend surface is unchanged.
