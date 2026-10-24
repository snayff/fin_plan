---
feature: foundation-ui-primitives
status: implemented
priority: high
deferred: false
phase: 7
implemented_date: 2026-07-05
---

# Foundation UI Primitives

## Intention

Several shared components defined in the design system are used across multiple pages and features. Building them once as foundational primitives ensures consistent behaviour, avoids duplication, and lets page-level phases focus on feature logic rather than reinventing common UI patterns.

## Description

Five foundational UI components that must exist before any page-level feature work begins: SkeletonLoader (loading states), StaleDataBanner (sync failure), ButtonPair (confirm/edit pattern), EntityAvatar (identity images), and panel transitions (directional slide animations). All respect `prefers-reduced-motion`.

## User Stories

- As a user, I want to see skeleton placeholders while data loads so the layout doesn't jump around.
- As a user, I want to know if the app failed to sync so I can retry, without losing access to cached data.
- As a user, I want consistent confirm/edit buttons throughout the app so I always know which action is affirmative.
- As a user, I want to see recognisable logos or initials for my accounts and providers.
- As a user, I want panel transitions to feel directional (deeper vs. shallower) so I maintain spatial orientation.

## Acceptance Criteria

### SkeletonLoader

- [ ] Left panel variant: four tier-row shaped blocks + three connector-shaped thin lines between them
- [ ] Right panel variant: one large block (headline area) + one medium block (chart area) + two small inline blocks (ButtonPair area)
- [ ] Shimmer animation: left-to-right gradient sweep, 1.5s cycle, looped
- [ ] Background: slightly lighter than `background`, consistent with `surface` tone
- [ ] `prefers-reduced-motion`: no shimmer; static blocks instead
- [ ] Used on initial page load, household switch, and tier selection (if load > 150ms)
- [ ] Never used for async button operations (those use button loading state)

### StaleDataBanner

- [ ] Full-width bar below top navigation (same position as SnapshotBanner — never simultaneous)
- [ ] Text: "Data may be outdated — last synced [N minutes ago] - [ Retry ]"
- [ ] Background: `attention-bg` token — subtle amber tint
- [ ] Text: `font-body`, 12px
- [ ] "Retry" link triggers immediate resync attempt
- [ ] Auto-dismisses when a successful sync completes
- [ ] Does not block or replace any UI — user can navigate and interact with cached data
- [ ] Never uses `error` (red) — this is informational, not an error state

### ButtonPair

- [ ] Layout: two buttons side by side
- [ ] Rule: rightmost button is always the affirmative action — no exceptions
- [ ] Standard variants:
  - `[ Edit ]   [ Still correct ✓ ]`
  - `[ Update ]   [ Still correct ✓ ]`
  - `[ Cancel ]   [ Save ]`
  - `[ Back ]   [ Confirm ]`
- [ ] "Still correct ✓" behaviour: resets `lastReviewedAt` to now, provides immediate visual confirmation (brief `success` colour flash), removes staleness indicator
- [ ] Both buttons implement all five states: Default, Hovered, Pressed, Disabled, Loading

### EntityAvatar

- [ ] Sources in priority order: curated logo library > user-uploaded image > initials fallback
- [ ] Initials fallback: deterministic background colour from entity name, 1–2 initials in white, `font-heading`
- [ ] Sizes: `sm` (24px), `md` (32px), `lg` (48px)
- [ ] Shape: circular
- [ ] Used in right panel detail views only — never in the left panel or item list rows

### Panel Transitions

- [ ] Navigating deeper (State 2 -> State 3): slide-left entrance, 150-200ms, ease-out
- [ ] Navigating shallower (State 3 -> State 2 via breadcrumb): slide-right entrance, 150-200ms, ease-out
- [ ] Returning to empty (any state -> State 1): fade-out, 150ms, ease-in
- [ ] Wizard step forward: slide-left, 150-200ms, ease-out
- [ ] Wizard step back: slide-right, 150-200ms, ease-out
- [ ] Toast entrance: fade-up, 150ms, ease-out
- [ ] Toast exit: fade-out, 150ms, ease-in
- [ ] `prefers-reduced-motion`: all transitions disabled (instant state change, no animation)
- [ ] Motion must never feel like a delay — 200ms maximum

### Reduced Motion Hook

- [ ] `usePrefersReducedMotion()` hook reads `prefers-reduced-motion: reduce` media query
- [ ] Returns boolean; updates reactively if user changes OS setting
- [ ] Used by SkeletonLoader, panel transitions, HistoryChart (`isAnimationActive`), and all animated components

## Open Questions

- None

---

## Implementation

### Schema

No schema — all client-side.

### API

No API.

### Components

- `SkeletonLoader.tsx` — accepts `variant: 'left-panel' | 'right-panel'` prop; renders appropriate block layout with conditional shimmer
- `StaleDataBanner.tsx` — reads sync state from query client or a Zustand store; renders banner when sync has failed; auto-retries and auto-dismisses
- `ButtonPair.tsx` — accepts `leftLabel`, `rightLabel`, `onLeftClick`, `onRightClick`, `leftVariant`, `rightVariant`, `isLoading` props; rightmost button is always affirmative
- `EntityAvatar.tsx` — accepts `name: string`, `imageUrl?: string`, `logoKey?: string`, `size: 'sm' | 'md' | 'lg'`; renders curated logo, uploaded image, or initials fallback
- `PanelTransition.tsx` — wrapper component that applies directional slide animations based on navigation depth; accepts `direction: 'deeper' | 'shallower' | 'empty'`; checks `usePrefersReducedMotion()`

### Utilities

- `apps/frontend/src/utils/motion.ts` — exports `usePrefersReducedMotion()` hook
- `apps/frontend/src/utils/avatar.ts` — exports `getInitials(name: string)` and `getAvatarColor(name: string)` (deterministic hash to colour)

### Notes

- All components are built in Phase 7 before any page-level work begins
- Design system reference: `design-system.md` sections "SkeletonLoader", "StaleDataBanner", "ButtonPair", "EntityAvatar", and "4.11 Motion & Transition"
- Panel transitions apply to the right panel content area inside `TwoPanelLayout`, not to the layout shell itself
- The curated logo library for EntityAvatar can start empty and be populated incrementally — the initials fallback ensures the component always renders


## Remaining Work

- [ ] StaleDataBanner: auto-dismiss when a successful sync completes (currently only shows/hides on error state)
- [ ] ButtonPair: "Still correct ✓" right button should trigger a brief success colour flash and remove the staleness indicator — no confirmation semantic logic currently exists
- [ ] EntityAvatar: add `logoKey?: string` prop and curated logo library lookup (current implementation only supports `imageUrl` and initials fallback)
- [ ] Toast animations: fade-up entrance (150ms ease-out) and fade-out exit (150ms ease-in) — no Toast component exists in common components
- [ ] PanelTransition: verify timing sits within 150–200ms spec range
