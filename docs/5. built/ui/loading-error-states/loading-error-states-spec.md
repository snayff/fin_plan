---
feature: loading-error-states
design_doc: docs/plans/2026-03-24-loading-error-states-design.md
status: implemented
priority: high
deferred: false
phase:
implemented_date: 2026-07-05
---

# Loading & Error States

## Intention

~8 query-driven panels currently handle loading, error, and empty states inconsistently — most silently swallow errors, show blank space during load, and render nothing when data is absent. This feature establishes a canonical 4-state decision tree applied consistently across all affected panels so users never experience unexplained blank space or silent failures.

## Description

One new component (`PanelError`) is introduced for first-load query failures. Three existing components (`SkeletonLoader`, `GhostedListEmpty`, `StaleDataBanner`) are applied to panels that currently lack them. The design-system documentation is updated with a canonical data-states decision table. Mutation feedback (toasts) is already solid and is out of scope.

## User Stories

- As a user, I want to see a skeleton animation while a panel loads so I know data is being fetched rather than experiencing unexplained blank space.
- As a user, I want to see a "Failed to load" message with a Retry button when a panel fails to load for the first time so I can take action.
- As a user whose background refresh fails, I want to keep seeing my last-known data with an amber warning banner so my workflow is not interrupted.
- As a user, I want to see a contextual empty state with guidance or a CTA when a panel loads successfully but has no data yet.

## Acceptance Criteria

- [ ] All listed panels show `SkeletonLoader` with the appropriate variant during initial load (`isLoading && !data`)
- [ ] `PanelError` component exists at `apps/frontend/src/components/common/PanelError.tsx` with `left | right | detail` variants
- [ ] `PanelError` renders: static ghost skeleton (no shimmer, opacity 0.30, colour `#2a3f60`) behind a blur overlay (`rgba(8,10,20,0.70)` + `backdrop-filter: blur(2px)`), "Failed to load" label in `--destructive`, optional contextual message in `--text-muted`, and a Retry button
- [ ] `PanelError` Retry button is styled with `--destructive-subtle` background, `--destructive-border` border, `--destructive` text and calls the `onRetry` prop
- [ ] All listed panels show `PanelError` + `StaleDataBanner` when `isError && !data`
- [ ] All listed panels show `StaleDataBanner` only (no `PanelError`) when `isError && data` — last-known data remains visible
- [ ] All listed panels show `GhostedListEmpty` with a contextual message and CTA or guidance text when `!isLoading && !isError && data.length === 0`
- [ ] No panel renders blank space in any of the four data states
- [ ] `prefers-reduced-motion` respected — no shimmer in `SkeletonLoader` or ghost skeleton when reduced motion is active
- [ ] "Data states" decision table added to `docs/2. design/design-system.md`

## Open Questions

_None — all decisions resolved in design doc._

## Implementation

### Schema

No database changes required.

### API

No new routes. All existing React Query hooks (`useQuery`) remain unchanged. The `refetch` function returned by each hook is passed as `onRetry` to `PanelError`.

### Components

#### New: `PanelError`

**File:** `apps/frontend/src/components/common/PanelError.tsx`

**Props:**

```ts
interface PanelErrorProps {
  onRetry: () => void;
  variant: "left" | "right" | "detail";
  message?: string;
}
```

**Visual anatomy:**

- Container fills the same space as the panel content it replaces
- Ghost skeleton behind overlay: static `div` blocks matching the variant's rough layout, `bg-[#2a3f60]` at `opacity-30`, no shimmer animation
- Overlay: `absolute inset-0`, `bg-[rgba(8,10,20,0.70)]`, `backdrop-blur-[2px]`, `flex flex-col items-center justify-center gap-3`
- "Failed to load" label: `text-destructive text-sm font-medium`
- Optional `message`: `text-muted text-xs text-center max-w-[180px]`
- Retry button: `bg-destructive-subtle border border-destructive-border text-destructive text-xs px-3 py-1.5 rounded-md hover:opacity-80`

**Variant skeleton shapes:**

- `left`: mimics `SkeletonLoader` variant `left-panel` blocks
- `right`: mimics `SkeletonLoader` variant `right-panel` blocks
- `detail`: two wide blocks + three narrow blocks (account/item detail layout)

#### Modified Panels — Loading State (`SkeletonLoader`)

| Panel                | File                                                         | Variant       | Condition                                |
| -------------------- | ------------------------------------------------------------ | ------------- | ---------------------------------------- |
| `PlannerPage`        | `apps/frontend/src/pages/PlannerPage.tsx`                    | `right-panel` | `isLoading && !data`                     |
| `SettingsPage`       | `apps/frontend/src/pages/SettingsPage.tsx`                   | `right-panel` | `isLoading && !data` (per section query) |
| `AccountDetailPanel` | `apps/frontend/src/components/wealth/AccountDetailPanel.tsx` | `right-panel` | `isLoading && !data`                     |
| `ItemDetailPanel`    | `apps/frontend/src/components/overview/ItemDetailPanel.tsx`  | `right-panel` | `isLoading && !data`                     |
| `SnapshotTimeline`   | `apps/frontend/src/components/common/SnapshotTimeline.tsx`   | `left-panel`  | `isLoading && !data`                     |

#### Modified Panels — Error State (`PanelError` + `StaleDataBanner`)

| Panel                   | File                                                             | PanelError variant           | Condition          |
| ----------------------- | ---------------------------------------------------------------- | ---------------------------- | ------------------ |
| `OverviewPage`          | `apps/frontend/src/pages/OverviewPage.tsx`                       | `left`                       | `isError && !data` |
| `WealthPage`            | `apps/frontend/src/pages/WealthPage.tsx`                         | `left` / `right` per section | `isError && !data` |
| `PlannerPage`           | `apps/frontend/src/pages/PlannerPage.tsx`                        | `right`                      | `isError && !data` |
| `SettingsPage`          | `apps/frontend/src/pages/SettingsPage.tsx`                       | `right`                      | `isError && !data` |
| `CashflowCalendar`      | `apps/frontend/src/components/overview/CashflowCalendar.tsx`     | `right`                      | `isError && !data` |
| `ItemDetailPanel`       | `apps/frontend/src/components/overview/ItemDetailPanel.tsx`      | `detail`                     | `isError && !data` |
| `AccountDetailPanel`    | `apps/frontend/src/components/wealth/AccountDetailPanel.tsx`     | `detail`                     | `isError && !data` |
| `GiftPersonDetailPanel` | `apps/frontend/src/components/planner/GiftPersonDetailPanel.tsx` | `detail`                     | `isError && !data` |

All panels above also show `StaleDataBanner` when `isError && data` (stale data path), using the existing `useStaleDataBanner` hook already wired at the app level.

#### Modified Panels — Empty State (`GhostedListEmpty`)

| Panel                          | File                                                       | Message                    | CTA                    |
| ------------------------------ | ---------------------------------------------------------- | -------------------------- | ---------------------- |
| `SnapshotTimeline`             | `apps/frontend/src/components/common/SnapshotTimeline.tsx` | "No snapshots yet"         | "Take snapshot" button |
| `PlannerPage` purchases list   | `apps/frontend/src/pages/PlannerPage.tsx`                  | "No purchases planned yet" | "+ Add purchase"       |
| `PlannerPage` gift events list | `apps/frontend/src/pages/PlannerPage.tsx`                  | "No gift events yet"       | "+ Add gift event"     |
| `SettingsPage` empty sections  | `apps/frontend/src/pages/SettingsPage.tsx`                 | Contextual per section     | Guidance text (no CTA) |

### Notes

**Canonical decision tree** (to be added to `docs/2. design/design-system.md`):

| State           | Condition                                     | Component                        | Notes                                 |
| --------------- | --------------------------------------------- | -------------------------------- | ------------------------------------- |
| Loading         | `isLoading && !data`                          | `SkeletonLoader`                 | `left-panel` or `right-panel` variant |
| Error (no data) | `isError && !data`                            | `PanelError` + `StaleDataBanner` | `onRetry` = `refetch`                 |
| Error (stale)   | `isError && data`                             | `StaleDataBanner` only           | user keeps last-known data            |
| Empty           | `!isLoading && !isError && data.length === 0` | `GhostedListEmpty`               | always include CTA or guidance        |
| Success         | `data && data.length > 0`                     | content                          | silence = approval                    |

**What is NOT changing:**

- Toast / mutation feedback system
- `useStaleDataBanner` hook internals
- `StaleDataBanner` component internals
- `GhostedListEmpty` and `SkeletonLoader` component internals
- `OverviewPage`, `WealthPage`, `CashflowCalendar` loading states (already correct)
- `AccountListPanel`, `SnapshotsSection` empty states (already correct)
