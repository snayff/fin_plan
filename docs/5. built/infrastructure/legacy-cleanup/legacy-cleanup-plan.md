---
feature: legacy-cleanup
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Legacy & Dead Code Cleanup

> **For Claude:** Use `/execute-plan legacy-cleanup` to implement this plan task-by-task.

**Goal:** Remove all code left over from the pre-renew architecture so the codebase contains only live, reachable code.
**Architecture:** Deletions and small edits across frontend and backend. No new code written.
**Tech Stack:** React 18 · Fastify · Bun
**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

---

## Background

The `implementation` branch replaced the old user-level flat models and per-page architecture with a household-scoped waterfall model and unified TierPage component. Several pages, components, services, and utilities were left behind — never deleted, just orphaned. This plan removes them cleanly.

**What the renew changed:**

- `CommittedBill` + `YearlyBill` → `CommittedItem` with `spendType`
- `DiscretionaryCategory` + `SavingsAllocation` → `DiscretionaryItem` with `spendType`
- Old `/design/patterns/*` design system → new `/design/renew/*`
- Per-page TwoPanelLayout → unified `TierPage` component
- User-level Account/Transaction/Goal/Budget models → household-scoped waterfall models (removed from schema in migration 20260326)

**Not in scope:**

- Setup-session routes/service/schema — the wizard is being redesigned; leave untouched
- `achievement.tsx` — kept; see `docs/4. planning/_future/achievement-notifications/`
- shadcn components (`alert-dialog`, `alert`, `badge`, `tabs`, `progress`) — kept; needed for upcoming features

---

## Pre-conditions

- [ ] On the `implementation` branch
- [ ] `bun run type-check` passes before starting

---

## Tasks

---

### Task 1 — Delete orphaned frontend pages and their tests

These pages are not imported in `App.tsx` routing and are superseded:

- `PlannerPage` → superseded by GiftsPage + PurchasesPage via TierPage
- `WealthPage` → superseded by SurplusPage + wealth components
- `DesignPage` → superseded by `DesignRenewPage` at `/design-renew`

**Files to delete:**

```bash
rm apps/frontend/src/pages/PlannerPage.tsx
rm apps/frontend/src/pages/PlannerPage.test.tsx
rm apps/frontend/src/pages/WealthPage.tsx
rm apps/frontend/src/pages/WealthPage.test.tsx
rm apps/frontend/src/pages/DesignPage.tsx
```

- [ ] **Step 1: Delete the 5 files**
- [ ] **Step 2: Verify `bun run type-check` passes**
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove orphaned PlannerPage, WealthPage, and DesignPage"
```

---

### Task 2 — Delete the old design system

`components/design/patterns/` (6 files) and 5 supporting helpers are only imported by `DesignPage`, which was deleted in Task 1. The new design system lives in `components/design/renew/`.

**Files to delete:**

```bash
rm apps/frontend/src/components/design/patterns/ComponentPatterns.tsx
rm apps/frontend/src/components/design/patterns/DataDisplayPatterns.tsx
rm apps/frontend/src/components/design/patterns/FeedbackPatterns.tsx
rm apps/frontend/src/components/design/patterns/FormPatterns.tsx
rm apps/frontend/src/components/design/patterns/FoundationPatterns.tsx
rm apps/frontend/src/components/design/patterns/StatePatterns.tsx
rm -d apps/frontend/src/components/design/patterns
rm apps/frontend/src/components/design/DesignSidebar.tsx
rm apps/frontend/src/components/design/CodeSnippet.tsx
rm apps/frontend/src/components/design/ColorSwatch.tsx
rm apps/frontend/src/components/design/PatternExample.tsx
rm apps/frontend/src/components/design/PatternSection.tsx
```

- [ ] **Step 1: Delete the 11 files + empty directory**
- [ ] **Step 2: Verify `bun run type-check` passes**
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old design system (patterns/ and helpers)"
```

---

### Task 3 — Delete unused frontend hook and utilities

**`hooks/useSetupSession.ts`** — 0 real imports. Only appears as a mock shim in OverviewPage tests (which mock it as an empty passthrough). The service layer it wraps is being redesigned.

**`lib/date-utils.ts`** — 0 imports anywhere in the codebase.

**`components/common/PanelTransition.tsx`** — animation wrapper with 0 imports.

**Files to delete:**

```bash
rm apps/frontend/src/hooks/useSetupSession.ts
rm apps/frontend/src/lib/date-utils.ts
rm apps/frontend/src/components/common/PanelTransition.tsx
```

**Files to modify** — remove the now-unnecessary mock from OverviewPage tests:

- `apps/frontend/src/pages/OverviewPage.test.tsx` — remove the `mock.module("@/hooks/useSetupSession", ...)` block (lines 19–20)
- `apps/frontend/src/pages/OverviewPage.navigation.test.tsx` — same

- [ ] **Step 1: Delete the 3 files**
- [ ] **Step 2: Remove `useSetupSession` mocks from both OverviewPage test files**
- [ ] **Step 3: Verify `bun run type-check` passes**
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove unused useSetupSession hook, date-utils, and PanelTransition"
```

---

### Task 4 — Delete backend dead code

**`services/cache.service.ts`** — fully implemented Redis wrapper, never called from any route or service. Only referenced in its own test file.

**`utils/liability.utils.ts`** — ~5KB of mortgage amortisation/interest helpers, never called from any route or service. Only referenced in its own test file.

**Files to delete:**

```bash
rm apps/backend/src/services/cache.service.ts
rm apps/backend/src/services/cache.service.test.ts
rm apps/backend/src/utils/liability.utils.ts
rm apps/backend/src/utils/liability.utils.test.ts
```

- [ ] **Step 1: Delete the 4 files**
- [ ] **Step 2: Verify `bun run type-check` passes**
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove unused cache service and liability utils"
```

---

### Task 5 — Remove stale fixture builders from backend test fixtures

`apps/backend/src/test/fixtures/index.ts` contains 8 builder functions for models that no longer exist in the Prisma schema (removed in migration 20260326):

`buildAccount`, `buildTransaction`, `buildAsset`, `buildLiability`, `buildAssetValueHistory`, `buildCategory`, `buildBudget`, `buildBudgetItem`

**File to modify:** `apps/backend/src/test/fixtures/index.ts`

- [ ] **Step 1: Delete the 8 builder functions and any imports they rely on exclusively**
- [ ] **Step 2: Verify `bun run type-check` passes**
- [ ] **Step 3: Run backend tests to confirm no breakage**

```bash
cd apps/backend && bun scripts/run-tests.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/test/fixtures/index.ts
git commit -m "refactor(tests): remove fixture builders for deleted schema models"
```

---

### Task 6 — Remove redundant QueryClient in main.tsx

`apps/frontend/src/main.tsx` creates its own `new QueryClient({...})` but `<App>` uses the instance exported from `lib/queryClient.ts`. The inline one is instantiated and discarded.

**File to modify:** `apps/frontend/src/main.tsx`

- [ ] **Step 1: Remove the inline `QueryClient` instantiation block (lines 7–14)**

  The `QueryClientProvider` in the JSX should use the import from `@/lib/queryClient` instead.

- [ ] **Step 2: Verify `bun run type-check` passes**
- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/main.tsx
git commit -m "refactor: remove redundant QueryClient instantiation in main.tsx"
```

---

### Task 7 — Remove legacy route redirects from App.tsx

`apps/frontend/src/App.tsx` contains two redirect shims added during the renew migration:

- `/wealth` → `/overview`
- `/planner` → `/overview`

These routes are gone; the redirects are no longer needed.

**File to modify:** `apps/frontend/src/App.tsx`

- [ ] **Step 1: Remove the two `<Route path="/wealth">` and `<Route path="/planner">` redirect entries**
- [ ] **Step 2: Verify `bun run type-check` passes**
- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/App.tsx
git commit -m "refactor: remove legacy /wealth and /planner redirect shims"
```

---

## Verification

- [ ] `bun run type-check` — no errors
- [ ] `bun run lint` — zero warnings
- [ ] `cd apps/backend && bun scripts/run-tests.ts` — all pass
- [ ] Manual smoke test: navigate to all routed pages (Overview, Income, Committed, Discretionary, Surplus, Goals, Gifts, Help, Settings, `/design-renew`) — no console errors
- [ ] Confirm nothing remains: search returns no results for deleted symbols

```bash
grep -r "PlannerPage\|WealthPage\|DesignPage\|useSetupSession\|date-utils\|PanelTransition\|cache\.service\|liability\.utils" apps/
```

## Post-conditions

- [ ] Zero orphaned pages, hooks, utilities, or services
- [ ] Backend test fixtures reference only models that exist in the current schema
- [ ] `main.tsx` has a single QueryClient instance
- [ ] No legacy redirect routes in `App.tsx`
- [ ] `bun run type-check` and `bun run lint` both pass clean
