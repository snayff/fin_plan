---
feature: tanstack-query-mutation-consistency
category: ui
spec: n/a — derived from audit at `C:\Users\Gabriel\.claude\plans\audit-tanstack-query-usage-sprightly-creek.md`
creation_date: 2026-04-26
status: implemented
---

# TanStack Query Mutation Consistency — Implementation Plan

> **For Claude:** Use `/execute-plan tanstack-query-mutation-consistency` to implement this plan task-by-task.

> **Purpose:** Apply consistent mutation discipline across the frontend: every mutation surfaces failures via `showError`, the `GIFTS_KEYS.all` over-invalidation is narrowed, and five rapid-interaction mutations gain optimistic updates with rollback.

**Goal:** Bring the 11 frontend mutation hooks to a consistent baseline (every mutation has `onError → showError`, no coarse `["gifts"]` invalidation), then layer optimistic updates onto the five highest-UX-payoff hooks identified in the audit.
**Spec:** n/a — derived from audit at `C:\Users\Gabriel\.claude\plans\audit-tanstack-query-usage-sprightly-creek.md`
**Architecture:** Frontend-only refactor. No backend, schema, or shared-Zod changes. Tasks split per hook file so each is reviewable in isolation. Optimistic updates use the canonical TanStack Query v5 pattern: `cancelQueries` → snapshot → `setQueryData` → rollback on error → `invalidateQueries` on settle.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

> What must already exist before this work starts.

- [ ] Audit complete: `C:\Users\Gabriel\.claude\plans\audit-tanstack-query-usage-sprightly-creek.md`
- [ ] `apps/frontend/src/lib/toast.ts` exists with `showError` helper
- [ ] `@tanstack/react-query` v5 is the installed version (`^5.90.20` per `apps/frontend/package.json`)
- [ ] `@testing-library/react` and `bun:test` are wired up (used by `apps/frontend/src/hooks/useSubcategorySettings.test.ts`)
- [ ] Working on a feature branch off `stage` (per project_branching memory)

## Tasks

> Each task is one action (2–5 minutes), follows red-green-commit, and contains complete code. Test command for all frontend tasks: `cd apps/frontend && bun test src/hooks/<file>` for single-file runs, or `cd apps/frontend && bun run test` for the full suite.

---

### Task 1: useWaterfall.ts — onError sweep

**Files:**

- Modify: `apps/frontend/src/hooks/useWaterfall.ts`
- Test: `apps/frontend/src/hooks/useWaterfall.test.ts`

Adds `onError → showError` to every mutation in `useWaterfall.ts` that lacks one. `useCreateItem` and `useCreateSubcategory` already have onError handlers — leave those untouched. Pattern: `onError: (e) => showError(e instanceof Error ? e.message : "<fallback>")`.

- [ ] **Step 1: Write the failing test**

Replace the contents of `apps/frontend/src/hooks/useWaterfall.test.ts` with:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockConfirmIncome = mock(async () => ({ id: "x" }));
const mockShowError = mock((_msg: string) => {});

mock.module("@/services/waterfall.service", () => ({
  waterfallService: {
    confirmIncome: mockConfirmIncome,
    confirmCommitted: mock(async () => ({ id: "x" })),
    confirmYearly: mock(async () => ({ id: "x" })),
    confirmDiscretionary: mock(async () => ({ id: "x" })),
    confirmSavings: mock(async () => ({ id: "x" })),
  },
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useConfirmItem } = await import("./useWaterfall");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useConfirmItem onError", () => {
  it("calls showError with the API error message when the mutation fails", async () => {
    mockConfirmIncome.mockRejectedValueOnce(new Error("Network down"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useConfirmItem(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ type: "income_source", id: "i1" });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Network down");
  });
});

describe("waterfallService.createSubcategory", () => {
  it("exists as a function (preserved from prior smoke test)", async () => {
    const mod = await import("@/services/waterfall.service");
    expect(typeof (mod.waterfallService as any).createSubcategory).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useWaterfall.test.ts`
Expected: FAIL — `expect(mockShowError).toHaveBeenCalledWith("Network down")` — function not called (because `useConfirmItem` has no onError handler yet).

- [ ] **Step 3: Add onError handlers to every mutation in `apps/frontend/src/hooks/useWaterfall.ts` that lacks one**

For each `useMutation({ ... })` block in the file that does NOT already define `onError`, append the following property after the existing `onSuccess`:

```typescript
onError: (error: unknown) => {
  showError(error instanceof Error ? error.message : "<fallback message>");
},
```

Use these fallback strings (one per mutation, in file order):

| Mutation                  | Fallback string             |
| ------------------------- | --------------------------- |
| `useConfirmItem`          | `"Failed to confirm item"`  |
| `useUpdateItem`           | `"Failed to update item"`   |
| `useConfirmWaterfallItem` | `"Failed to confirm item"`  |
| `useDeleteItem`           | `"Failed to delete item"`   |
| `useTierUpdateItem`       | `"Failed to update item"`   |
| `useCreatePeriod`         | `"Failed to create period"` |
| `useUpdatePeriod`         | `"Failed to update period"` |
| `useDeletePeriod`         | `"Failed to delete period"` |

`useCreateItem` (currently has its own onError) and `useCreateSubcategory` (currently has its own onError) — **leave untouched**.

`showError` is already imported at the top of the file (line 3) — no import change needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useWaterfall.test.ts`
Expected: PASS.

Also run: `cd apps/frontend && bun run lint && bun run type-check`
Expected: zero warnings, zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useWaterfall.ts apps/frontend/src/hooks/useWaterfall.test.ts
git commit -m "fix(hooks): surface mutation errors via showError in useWaterfall"
```

---

### Task 2: useGifts.ts — onError sweep

**Files:**

- Modify: `apps/frontend/src/hooks/useGifts.ts`
- Create: `apps/frontend/src/hooks/useGifts.test.ts`

All 11 mutations in this file lack onError handlers. Add `onError → showError` to each, matching the Task 1 pattern.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useGifts.test.ts`:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockCreatePerson = mock(async () => ({ id: "p1" }));
const mockShowError = mock((_msg: string) => {});

mock.module("@/services/gifts.service", () => ({
  giftsApi: {
    createPerson: mockCreatePerson,
    updatePerson: mock(async () => ({})),
    deletePerson: mock(async () => undefined),
    createEvent: mock(async () => ({})),
    updateEvent: mock(async () => ({})),
    deleteEvent: mock(async () => undefined),
    upsertAllocation: mock(async () => ({})),
    bulkUpsert: mock(async () => ({ count: 0 })),
    setBudget: mock(async () => ({})),
    setMode: mock(async () => ({})),
    dismissRollover: mock(async () => undefined),
  },
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useCreateGiftPerson } = await import("./useGifts");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCreateGiftPerson onError", () => {
  it("calls showError with the API error message on failure", async () => {
    mockCreatePerson.mockRejectedValueOnce(new Error("Person already exists"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useCreateGiftPerson(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ name: "Test" } as any);
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Person already exists");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useGifts.test.ts`
Expected: FAIL — `mockShowError` not called.

- [ ] **Step 3: Add `import { showError } from "@/lib/toast";` to the top of `useGifts.ts` and add onError to all 11 mutations**

Add this import alongside the existing imports at the top of `apps/frontend/src/hooks/useGifts.ts`:

```typescript
import { showError } from "@/lib/toast";
```

Then add this property to every `useMutation({ ... })` block in the file (after the existing `onSuccess`):

```typescript
onError: (error: unknown) => {
  showError(error instanceof Error ? error.message : "<fallback message>");
},
```

Fallback strings:

| Mutation                   | Fallback                         |
| -------------------------- | -------------------------------- |
| `useCreateGiftPerson`      | `"Failed to add person"`         |
| `useUpdateGiftPerson`      | `"Failed to update person"`      |
| `useDeleteGiftPerson`      | `"Failed to delete person"`      |
| `useCreateGiftEvent`       | `"Failed to add event"`          |
| `useUpdateGiftEvent`       | `"Failed to update event"`       |
| `useDeleteGiftEvent`       | `"Failed to delete event"`       |
| `useUpsertAllocation`      | `"Failed to update allocation"`  |
| `useBulkUpsertAllocations` | `"Failed to update allocations"` |
| `useSetGiftBudget`         | `"Failed to update budget"`      |
| `useSetGiftMode`           | `"Failed to change mode"`        |
| `useDismissRollover`       | `"Failed to dismiss rollover"`   |

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useGifts.test.ts && bun run lint && bun run type-check`
Expected: PASS, zero lint warnings, zero type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useGifts.ts apps/frontend/src/hooks/useGifts.test.ts
git commit -m "fix(hooks): surface mutation errors via showError in useGifts"
```

---

### Task 3: useAssets.ts — onError sweep

**Files:**

- Modify: `apps/frontend/src/hooks/useAssets.ts`
- Create: `apps/frontend/src/hooks/useAssets.test.ts`

All 10 mutations lack onError. Same pattern as Task 2.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useAssets.test.ts`:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockCreateAsset = mock(async () => ({ id: "a1" }));
const mockShowError = mock((_msg: string) => {});

mock.module("../services/assets.service.js", () => ({
  assetsApiService: {
    createAsset: mockCreateAsset,
    updateAsset: mock(async () => ({})),
    deleteAsset: mock(async () => undefined),
    recordAssetBalance: mock(async () => ({})),
    createAccount: mock(async () => ({})),
    updateAccount: mock(async () => ({})),
    deleteAccount: mock(async () => undefined),
    recordAccountBalance: mock(async () => ({})),
    confirmAsset: mock(async () => ({})),
    confirmAccount: mock(async () => ({})),
    getSummary: mock(async () => ({})),
    listAssetsByType: mock(async () => []),
    listAccountsByType: mock(async () => []),
  },
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useCreateAsset } = await import("./useAssets");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCreateAsset onError", () => {
  it("calls showError with the API error message on failure", async () => {
    mockCreateAsset.mockRejectedValueOnce(new Error("Validation failed"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useCreateAsset(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ name: "X" } as any);
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Validation failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useAssets.test.ts`
Expected: FAIL — `mockShowError` not called.

- [ ] **Step 3: Add the import and onError handlers**

Add to the top of `apps/frontend/src/hooks/useAssets.ts`:

```typescript
import { showError } from "@/lib/toast";
```

Add `onError` to every mutation (10 in total). Note: existing `onSuccess` callbacks here use `qc.invalidateQueries(...)` without `void` — keep that style.

| Mutation                  | Fallback                      |
| ------------------------- | ----------------------------- |
| `useCreateAsset`          | `"Failed to create asset"`    |
| `useUpdateAsset`          | `"Failed to update asset"`    |
| `useDeleteAsset`          | `"Failed to delete asset"`    |
| `useRecordAssetBalance`   | `"Failed to record balance"`  |
| `useCreateAccount`        | `"Failed to create account"`  |
| `useUpdateAccount`        | `"Failed to update account"`  |
| `useDeleteAccount`        | `"Failed to delete account"`  |
| `useRecordAccountBalance` | `"Failed to record balance"`  |
| `useConfirmAsset`         | `"Failed to confirm asset"`   |
| `useConfirmAccount`       | `"Failed to confirm account"` |

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useAssets.test.ts && bun run lint && bun run type-check`
Expected: PASS, zero warnings/errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useAssets.ts apps/frontend/src/hooks/useAssets.test.ts
git commit -m "fix(hooks): surface mutation errors via showError in useAssets"
```

---

### Task 4: useSettings.ts — onError sweep

**Files:**

- Modify: `apps/frontend/src/hooks/useSettings.ts`
- Modify: `apps/frontend/src/hooks/useSettings.test.ts`

This file contains 13 mutations (`useUpdateSettings`, `useCreateSnapshot`, `useRenameSnapshot`, `useDeleteSnapshot`, `useRenameHousehold`, `useInviteMember`, `useCancelInvite`, `useRemoveMember`, `useLeaveHousehold`, `useCreateMember`, `useUpdateMember`, `useDeleteMember`, `useDismissWaterfallTip`, `useUpdateMemberRole`). All lack onError.

- [ ] **Step 1: Write the failing test**

Replace `apps/frontend/src/hooks/useSettings.test.ts` with:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockUpdateSettings = mock(async () => ({}));
const mockShowError = mock((_msg: string) => {});

mock.module("@/services/settings.service", () => ({
  settingsService: {
    getSettings: mock(async () => ({})),
    updateSettings: mockUpdateSettings,
    dismissWaterfallTip: mock(async () => ({})),
  },
}));

mock.module("@/services/snapshot.service", () => ({
  snapshotService: {
    listSnapshots: mock(async () => []),
    getSnapshot: mock(async () => ({})),
    createSnapshot: mock(async () => ({})),
    renameSnapshot: mock(async () => ({})),
    deleteSnapshot: mock(async () => undefined),
  },
}));

mock.module("@/services/household.service", () => ({
  householdService: {
    getHouseholdDetails: mock(async () => ({})),
    renameHousehold: mock(async () => ({})),
    inviteMember: mock(async () => ({})),
    cancelInvite: mock(async () => ({})),
    removeMember: mock(async () => ({})),
    leaveHousehold: mock(async () => ({})),
    createMember: mock(async () => ({})),
    updateMember: mock(async () => ({})),
    deleteMember: mock(async () => ({})),
  },
}));

mock.module("@/services/auth.service", () => ({
  authService: { getCurrentUser: mock(async () => ({ user: {} })) },
}));

mock.module("@/services/auditLog.service", () => ({
  fetchAuditLog: mock(async () => ({ items: [], nextCursor: null })),
  updateMemberRole: mock(async () => ({})),
}));

mock.module("@/services/securityActivity.service", () => ({
  fetchSecurityActivity: mock(async () => ({ items: [], nextCursor: null })),
}));

mock.module("@/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: any) => selector({ accessToken: "token", user: {}, setUser: () => {} }),
    { getState: () => ({ accessToken: "token", user: {}, setUser: () => {} }) }
  ),
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useUpdateSettings } = await import("./useSettings");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("settingsService.dismissWaterfallTip", () => {
  it("exists as a function (preserved from prior smoke test)", async () => {
    const mod = await import("@/services/settings.service");
    expect(typeof (mod.settingsService as any).dismissWaterfallTip).toBe("function");
  });
});

describe("useUpdateSettings onError", () => {
  it("calls showError with the API error message on failure", async () => {
    mockUpdateSettings.mockRejectedValueOnce(new Error("Save failed"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useUpdateSettings(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ surplusBenchmarkPct: 20 } as any);
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Save failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useSettings.test.ts`
Expected: FAIL — `mockShowError` not called for `useUpdateSettings`.

- [ ] **Step 3: Add import and onError handlers**

Add to the top of `apps/frontend/src/hooks/useSettings.ts`:

```typescript
import { showError } from "@/lib/toast";
```

Add `onError` (13 entries):

| Mutation                 | Fallback                       |
| ------------------------ | ------------------------------ |
| `useUpdateSettings`      | `"Failed to save settings"`    |
| `useCreateSnapshot`      | `"Failed to create snapshot"`  |
| `useRenameSnapshot`      | `"Failed to rename snapshot"`  |
| `useDeleteSnapshot`      | `"Failed to delete snapshot"`  |
| `useRenameHousehold`     | `"Failed to rename household"` |
| `useInviteMember`        | `"Failed to send invite"`      |
| `useCancelInvite`        | `"Failed to cancel invite"`    |
| `useRemoveMember`        | `"Failed to remove member"`    |
| `useLeaveHousehold`      | `"Failed to leave household"`  |
| `useCreateMember`        | `"Failed to add member"`       |
| `useUpdateMember`        | `"Failed to update member"`    |
| `useDeleteMember`        | `"Failed to delete member"`    |
| `useDismissWaterfallTip` | `"Failed to dismiss tip"`      |
| `useUpdateMemberRole`    | `"Failed to update role"`      |

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useSettings.test.ts && bun run lint && bun run type-check`
Expected: PASS, zero warnings/errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useSettings.ts apps/frontend/src/hooks/useSettings.test.ts
git commit -m "fix(hooks): surface mutation errors via showError in useSettings"
```

---

### Task 5: useCashflow.ts — onError sweep

**Files:**

- Modify: `apps/frontend/src/hooks/useCashflow.ts`
- Create: `apps/frontend/src/hooks/useCashflow.test.ts`

Two mutations: `useUpdateLinkedAccount`, `useBulkUpdateLinkedAccounts`. Both lack onError.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useCashflow.test.ts`:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockUpdateLinkedAccount = mock(async () => ({}));
const mockShowError = mock((_msg: string) => {});

mock.module("@/services/cashflow.service", () => ({
  cashflowService: {
    getProjection: mock(async () => ({})),
    getMonthDetail: mock(async () => ({})),
    listLinkableAccounts: mock(async () => []),
    updateLinkedAccount: mockUpdateLinkedAccount,
    bulkUpdateLinkedAccounts: mock(async () => ({})),
  },
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useUpdateLinkedAccount } = await import("./useCashflow");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useUpdateLinkedAccount onError", () => {
  it("calls showError with the API error message on failure", async () => {
    mockUpdateLinkedAccount.mockRejectedValueOnce(new Error("Cannot link"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useUpdateLinkedAccount(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ accountId: "a1", isCashflowLinked: true });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Cannot link");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useCashflow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add import and onError handlers**

Add `import { showError } from "@/lib/toast";` to the top of `useCashflow.ts`. Add onError to both mutations:

- `useUpdateLinkedAccount` → fallback: `"Failed to update linked account"`
- `useBulkUpdateLinkedAccounts` → fallback: `"Failed to update linked accounts"`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useCashflow.test.ts && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useCashflow.ts apps/frontend/src/hooks/useCashflow.test.ts
git commit -m "fix(hooks): surface mutation errors via showError in useCashflow"
```

---

### Task 6: usePlanner.ts — onError sweep

**Files:**

- Modify: `apps/frontend/src/hooks/usePlanner.ts`
- Create: `apps/frontend/src/hooks/usePlanner.test.ts`

Four mutations: `useCreatePurchase`, `useUpdatePurchase`, `useDeletePurchase`, `useUpsertBudget`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/usePlanner.test.ts`:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockCreatePurchase = mock(async () => ({ id: "p1" }));
const mockShowError = mock((_msg: string) => {});

mock.module("@/services/planner.service", () => ({
  plannerService: {
    listPurchases: mock(async () => []),
    createPurchase: mockCreatePurchase,
    updatePurchase: mock(async () => ({})),
    deletePurchase: mock(async () => undefined),
  },
}));

mock.module("@/services/waterfall.service", () => ({
  waterfallService: {
    getYearBudget: mock(async () => ({})),
    upsertYearBudget: mock(async () => ({})),
  },
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useCreatePurchase } = await import("./usePlanner");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCreatePurchase onError", () => {
  it("calls showError with the API error message on failure", async () => {
    mockCreatePurchase.mockRejectedValueOnce(new Error("Bad data"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useCreatePurchase(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ name: "Bike" } as any);
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Bad data");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/usePlanner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add import and onError handlers**

Add `import { showError } from "@/lib/toast";`. Add onError to all 4:

- `useCreatePurchase` → `"Failed to create purchase"`
- `useUpdatePurchase` → `"Failed to update purchase"`
- `useDeletePurchase` → `"Failed to delete purchase"`
- `useUpsertBudget` → `"Failed to update budget"`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/usePlanner.test.ts && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/usePlanner.ts apps/frontend/src/hooks/usePlanner.test.ts
git commit -m "fix(hooks): surface mutation errors via showError in usePlanner"
```

---

### Task 7: useReviewSession.ts — onError sweep

**Files:**

- Modify: `apps/frontend/src/hooks/useReviewSession.ts`
- Create: `apps/frontend/src/hooks/useReviewSession.test.ts`

Three mutations: `useCreateReviewSession`, `useUpdateReviewSession`, `useDeleteReviewSession`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useReviewSession.test.ts`:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockCreateSession = mock(async () => ({ id: "s1" }));
const mockShowError = mock((_msg: string) => {});

mock.module("@/services/review-session.service", () => ({
  reviewSessionService: {
    getSession: mock(async () => ({})),
    createSession: mockCreateSession,
    updateSession: mock(async () => ({})),
    deleteSession: mock(async () => undefined),
  },
}));

mock.module("@/services/waterfall.service", () => ({
  waterfallService: {
    listIncome: mock(async () => []),
    listCommitted: mock(async () => []),
    listYearly: mock(async () => []),
    listDiscretionary: mock(async () => []),
    listSavings: mock(async () => []),
  },
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useCreateReviewSession } = await import("./useReviewSession");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCreateReviewSession onError", () => {
  it("calls showError on failure", async () => {
    mockCreateSession.mockRejectedValueOnce(new Error("Already running"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useCreateReviewSession(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Already running");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useReviewSession.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add import and onError handlers**

Add `import { showError } from "@/lib/toast";`. Add onError to all 3:

- `useCreateReviewSession` → `"Failed to start review"`
- `useUpdateReviewSession` → `"Failed to save review progress"`
- `useDeleteReviewSession` → `"Failed to discard review"`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useReviewSession.test.ts && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useReviewSession.ts apps/frontend/src/hooks/useReviewSession.test.ts
git commit -m "fix(hooks): surface mutation errors via showError in useReviewSession"
```

---

### Task 8: useExportImport.ts + useSubcategorySettings.ts — onError sweep

**Files:**

- Modify: `apps/frontend/src/hooks/useExportImport.ts`
- Modify: `apps/frontend/src/hooks/useSubcategorySettings.ts`
- Modify: `apps/frontend/src/hooks/useSubcategorySettings.test.ts`

Five mutations across the two files: `useExportHousehold`, `useImportHousehold`, `useValidateImport`, `useSaveSubcategories`, `useResetSubcategories`. None have onError.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/hooks/useSubcategorySettings.test.ts` — add the toast mock and a new describe block. Modify the existing `mock.module(...)` call by adding the toast mock immediately after it:

```typescript
const mockShowError = mock((_msg: string) => {});

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));
```

Then append at the bottom of the file:

```typescript
describe("useSaveSubcategories onError", () => {
  it("calls showError on failure", async () => {
    mockSaveSubcategories.mockRejectedValueOnce(new Error("Reassignment required"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useSaveSubcategories(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({
          tier: "income",
          data: { subcategories: [], reassignments: [] },
        });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Reassignment required");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useSubcategorySettings.test.ts`
Expected: FAIL — `mockShowError` not called.

- [ ] **Step 3: Add import and onError handlers in both files**

In `apps/frontend/src/hooks/useSubcategorySettings.ts`:

```typescript
import { showError } from "@/lib/toast";
```

Add onError to:

- `useSaveSubcategories` → `"Failed to save subcategories"`
- `useResetSubcategories` → `"Failed to reset subcategories"`

In `apps/frontend/src/hooks/useExportImport.ts`:

```typescript
import { showError } from "@/lib/toast";
```

Add onError to:

- `useExportHousehold` → `"Failed to export household"`
- `useImportHousehold` → `"Failed to import household"`
- `useValidateImport` → `"Import data is invalid"`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useSubcategorySettings.test.ts && bun run lint && bun run type-check`
Expected: PASS, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useExportImport.ts apps/frontend/src/hooks/useSubcategorySettings.ts apps/frontend/src/hooks/useSubcategorySettings.test.ts
git commit -m "fix(hooks): surface mutation errors via showError in export-import + subcategorySettings"
```

---

### Task 9: Narrow `GIFTS_KEYS.all` invalidation across all 11 gift mutations

**Files:**

- Modify: `apps/frontend/src/hooks/useGifts.ts`
- Modify: `apps/frontend/src/hooks/useGifts.test.ts`

Replace coarse `GIFTS_KEYS.all = ["gifts"]` invalidations with the specific affected query-key prefixes. TanStack Query v5 matches prefixes, so `invalidateQueries({ queryKey: ["gifts", "state"] })` invalidates every cached `["gifts", "state", <year>]`.

Mapping (mutation → narrowed invalidation set):

| Mutation                   | Replace `GIFTS_KEYS.all` with                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCreateGiftPerson`      | `["gifts", "configPeople"]`, `["gifts", "state"]`, `["gifts", "quickAddMatrix"]`                                                             |
| `useUpdateGiftPerson`      | `["gifts", "configPeople"]`, `["gifts", "person"]`, `["gifts", "state"]`, `["gifts", "quickAddMatrix"]`                                      |
| `useDeleteGiftPerson`      | `["gifts", "configPeople"]`, `["gifts", "state"]`, `["gifts", "quickAddMatrix"]`, `["gifts", "upcoming"]`                                    |
| `useCreateGiftEvent`       | `GIFTS_KEYS.configEvents()`, `["gifts", "state"]`, `["gifts", "quickAddMatrix"]`                                                             |
| `useUpdateGiftEvent`       | `GIFTS_KEYS.configEvents()`, `["gifts", "state"]`, `["gifts", "quickAddMatrix"]`, `["gifts", "upcoming"]`                                    |
| `useDeleteGiftEvent`       | `GIFTS_KEYS.configEvents()`, `["gifts", "state"]`, `["gifts", "quickAddMatrix"]`, `["gifts", "upcoming"]`                                    |
| `useUpsertAllocation`      | `GIFTS_KEYS.state(year)`, `GIFTS_KEYS.quickAddMatrix(year)`, `GIFTS_KEYS.person(personId, year)`, `GIFTS_KEYS.upcoming(year)`                |
| `useBulkUpsertAllocations` | `["gifts", "state"]`, `["gifts", "quickAddMatrix"]`, `["gifts", "person"]`, `["gifts", "upcoming"]` (year unknown to hook — broad-prefix it) |
| `useSetGiftBudget`         | `GIFTS_KEYS.state(year)`, `GIFTS_KEYS.quickAddMatrix(year)`                                                                                  |
| `useSetGiftMode`           | `GIFTS_KEYS.settings()`, `["gifts", "state"]`, `GIFTS_KEYS.years()`                                                                          |
| `useDismissRollover`       | `GIFTS_KEYS.state(year)`, `GIFTS_KEYS.settings()`                                                                                            |

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/hooks/useGifts.test.ts`:

```typescript
describe("useUpsertAllocation invalidation scope", () => {
  it("invalidates only allocation-affected query keys, not all gift queries", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    // Seed 8 gift queries
    qc.setQueryData(["gifts", "state", 2026], { sentinel: "state" });
    qc.setQueryData(["gifts", "quickAddMatrix", 2026], { sentinel: "matrix" });
    qc.setQueryData(["gifts", "person", "p1", 2026], { sentinel: "person" });
    qc.setQueryData(["gifts", "upcoming", 2026], { sentinel: "upcoming" });
    qc.setQueryData(["gifts", "settings"], { sentinel: "settings" });
    qc.setQueryData(["gifts", "years"], { sentinel: "years" });
    qc.setQueryData(["gifts", "configEvents"], { sentinel: "configEvents" });
    qc.setQueryData(["gifts", "configPeople", "all", 2026], { sentinel: "configPeople" });

    const invalidated = new Set<string>();
    const orig = qc.invalidateQueries.bind(qc);
    qc.invalidateQueries = (filters: any) => {
      invalidated.add(JSON.stringify(filters?.queryKey));
      return orig(filters);
    };

    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { useUpsertAllocation: hook } = await import("./useGifts");
    const { result } = renderHook(() => hook(), { wrapper: localWrapper });

    await act(async () => {
      await result.current.mutateAsync({
        personId: "p1",
        eventId: "e1",
        year: 2026,
        data: { planned: 50 } as any,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should NOT have invalidated `["gifts"]` blanket key
    expect(invalidated.has(JSON.stringify(["gifts"]))).toBe(false);
    // Should have invalidated each narrow key
    expect(invalidated.has(JSON.stringify(["gifts", "state", 2026]))).toBe(true);
    expect(invalidated.has(JSON.stringify(["gifts", "quickAddMatrix", 2026]))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useGifts.test.ts`
Expected: FAIL — `["gifts"]` blanket key IS in `invalidated` (current code uses `GIFTS_KEYS.all`).

- [ ] **Step 3: Replace each `GIFTS_KEYS.all` invalidation with the narrow set per the mapping table above**

For each mutation, replace the body of `onSuccess` (or `onSuccess: (_data, vars) =>` where variables are needed) using these patterns:

```typescript
// useUpsertAllocation
onSuccess: (_data, { personId, year }) => {
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.state(year) });
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.quickAddMatrix(year) });
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.person(personId, year) });
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.upcoming(year) });
},
```

```typescript
// useBulkUpsertAllocations (year is per-row in payload, so use prefix-only)
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: ["gifts", "state"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "quickAddMatrix"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "person"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "upcoming"] });
},
```

```typescript
// useSetGiftBudget
onSuccess: (_data, { year }) => {
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.state(year) });
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.quickAddMatrix(year) });
},
```

```typescript
// useSetGiftMode
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.settings() });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "state"] });
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.years() });
},
```

```typescript
// useDismissRollover (variable IS the year directly)
onSuccess: (_data, year) => {
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.state(year) });
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.settings() });
},
```

```typescript
// useCreateGiftPerson, useUpdateGiftPerson, useDeleteGiftPerson — simplest forms:
// Create
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: ["gifts", "configPeople"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "state"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "quickAddMatrix"] });
},
// Update — `id` is in the variables (`{ id, data }`)
onSuccess: (_data, { id }) => {
  void queryClient.invalidateQueries({ queryKey: ["gifts", "configPeople"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "person", id] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "state"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "quickAddMatrix"] });
},
// Delete (`id` is the variable directly, not destructured)
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: ["gifts", "configPeople"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "state"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "quickAddMatrix"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "upcoming"] });
},
```

```typescript
// Event mutations follow the same shape — see mapping table for keys
// Create / Update / Delete:
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.configEvents() });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "state"] });
  void queryClient.invalidateQueries({ queryKey: ["gifts", "quickAddMatrix"] });
  // Add upcoming for update + delete only (events appear in upcoming feed)
  void queryClient.invalidateQueries({ queryKey: ["gifts", "upcoming"] });
},
```

Keep the `onError` handlers added in Task 2.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useGifts.test.ts && bun run lint && bun run type-check`
Expected: PASS, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useGifts.ts apps/frontend/src/hooks/useGifts.test.ts
git commit -m "perf(hooks): narrow GIFTS_KEYS.all invalidation to specific affected keys"
```

---

### Task 10: Optimistic — `useUpdateLinkedAccount` + `useBulkUpdateLinkedAccounts`

**Files:**

- Modify: `apps/frontend/src/hooks/useCashflow.ts`
- Modify: `apps/frontend/src/hooks/useCashflow.test.ts`

`useLinkableAccounts` returns an array of `{ id, isCashflowLinked, ... }`. Optimistic update flips the boolean for the targeted account; bulk variant flips them by the supplied input.

- [ ] **Step 1: Write the failing test**

Replace `apps/frontend/src/hooks/useCashflow.test.ts` with:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockUpdateLinkedAccount = mock(async () => ({}));
const mockShowError = mock((_msg: string) => {});

mock.module("@/services/cashflow.service", () => ({
  cashflowService: {
    getProjection: mock(async () => ({})),
    getMonthDetail: mock(async () => ({})),
    listLinkableAccounts: mock(async () => []),
    updateLinkedAccount: mockUpdateLinkedAccount,
    bulkUpdateLinkedAccounts: mock(async () => ({})),
  },
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useUpdateLinkedAccount, CASHFLOW_KEYS } = await import("./useCashflow");

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: any }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useUpdateLinkedAccount optimistic", () => {
  it("flips isCashflowLinked in cache before the server resolves", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(CASHFLOW_KEYS.linkable, [
      { id: "a1", name: "Bank", isCashflowLinked: false },
      { id: "a2", name: "Cash", isCashflowLinked: true },
    ]);

    let resolveUpdate: (v: unknown) => void;
    mockUpdateLinkedAccount.mockImplementationOnce(() => new Promise((r) => (resolveUpdate = r)));

    const { result } = renderHook(() => useUpdateLinkedAccount(), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({ accountId: "a1", isCashflowLinked: true });
    });

    // Cache flipped before mutation resolves
    await waitFor(() => {
      const data = qc.getQueryData<any[]>(CASHFLOW_KEYS.linkable);
      expect(data?.find((a) => a.id === "a1")?.isCashflowLinked).toBe(true);
    });

    resolveUpdate!({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back the cache and shows an error toast when the mutation fails", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(CASHFLOW_KEYS.linkable, [{ id: "a1", name: "Bank", isCashflowLinked: false }]);

    mockUpdateLinkedAccount.mockRejectedValueOnce(new Error("Server boom"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useUpdateLinkedAccount(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ accountId: "a1", isCashflowLinked: true });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = qc.getQueryData<any[]>(CASHFLOW_KEYS.linkable);
    expect(data?.find((a) => a.id === "a1")?.isCashflowLinked).toBe(false);
    expect(mockShowError).toHaveBeenCalledWith("Server boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useCashflow.test.ts`
Expected: FAIL — neither optimistic flip nor rollback occurs.

- [ ] **Step 3: Replace `useUpdateLinkedAccount` and `useBulkUpdateLinkedAccounts` with optimistic versions**

In `apps/frontend/src/hooks/useCashflow.ts`, replace the bodies of both hooks:

```typescript
type LinkableAccount = { id: string; isCashflowLinked: boolean; [key: string]: unknown };

export function useUpdateLinkedAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      isCashflowLinked,
    }: {
      accountId: string;
      isCashflowLinked: boolean;
    }) => cashflowService.updateLinkedAccount(accountId, isCashflowLinked),
    onMutate: async ({ accountId, isCashflowLinked }) => {
      await qc.cancelQueries({ queryKey: CASHFLOW_KEYS.linkable });
      const snapshot = qc.getQueryData<LinkableAccount[]>(CASHFLOW_KEYS.linkable);
      if (snapshot) {
        qc.setQueryData<LinkableAccount[]>(CASHFLOW_KEYS.linkable, (prev) =>
          (prev ?? []).map((a) => (a.id === accountId ? { ...a, isCashflowLinked } : a))
        );
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(CASHFLOW_KEYS.linkable, ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to update linked account");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CASHFLOW_KEYS.linkable });
      void qc.invalidateQueries({ queryKey: ["cashflow", "projection"] });
      void qc.invalidateQueries({ queryKey: ["cashflow", "month"] });
    },
  });
}

export function useBulkUpdateLinkedAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkUpdateLinkedAccountsInput) =>
      cashflowService.bulkUpdateLinkedAccounts(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: CASHFLOW_KEYS.linkable });
      const snapshot = qc.getQueryData<LinkableAccount[]>(CASHFLOW_KEYS.linkable);
      if (snapshot) {
        const updates = new Map(input.updates.map((u) => [u.accountId, u.isCashflowLinked]));
        qc.setQueryData<LinkableAccount[]>(CASHFLOW_KEYS.linkable, (prev) =>
          (prev ?? []).map((a) =>
            updates.has(a.id) ? { ...a, isCashflowLinked: updates.get(a.id)! } : a
          )
        );
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(CASHFLOW_KEYS.linkable, ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to update linked accounts");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CASHFLOW_KEYS.linkable });
      void qc.invalidateQueries({ queryKey: ["cashflow", "projection"] });
      void qc.invalidateQueries({ queryKey: ["cashflow", "month"] });
    },
  });
}
```

Verify `BulkUpdateLinkedAccountsInput` shape (`packages/shared`) matches `{ accounts: { accountId, isCashflowLinked }[] }`. If it differs, adjust the `updates` map construction. (Check via `import { BulkUpdateLinkedAccountsInput } from "@finplan/shared"` at runtime.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useCashflow.test.ts && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useCashflow.ts apps/frontend/src/hooks/useCashflow.test.ts
git commit -m "feat(hooks): optimistic updates for cashflow linked-account toggles"
```

---

### Task 11: Optimistic — `useUpsertAllocation` + `useBulkUpsertAllocations`

**Files:**

- Modify: `apps/frontend/src/hooks/useGifts.ts`
- Modify: `apps/frontend/src/hooks/useGifts.test.ts`

The `quickAddMatrix(year)` query returns `{ people, events, allocations: [{ personId, eventId, planned }], budget }`. Optimistically replace/append the matching allocation entry.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/hooks/useGifts.test.ts`:

```typescript
describe("useUpsertAllocation optimistic", () => {
  it("updates allocations[] in quickAddMatrix cache before server resolves", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(["gifts", "quickAddMatrix", 2026], {
      people: [{ id: "p1", name: "Alex", memberId: null }],
      events: [{ id: "e1", name: "Birthday" }],
      allocations: [{ personId: "p1", eventId: "e1", planned: 20 }],
      budget: { annual: 500, currentPlanned: 20 },
    });

    let resolveUpsert: (v: unknown) => void;
    const mod = await import("@/services/gifts.service");
    (mod.giftsApi.upsertAllocation as any).mockImplementationOnce(
      () => new Promise((r) => (resolveUpsert = r))
    );

    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { useUpsertAllocation } = await import("./useGifts");
    const { result } = renderHook(() => useUpsertAllocation(), { wrapper: localWrapper });

    act(() => {
      result.current.mutate({
        personId: "p1",
        eventId: "e1",
        year: 2026,
        data: { planned: 75 } as any,
      });
    });

    await waitFor(() => {
      const data = qc.getQueryData<any>(["gifts", "quickAddMatrix", 2026]);
      const alloc = data?.allocations.find((a: any) => a.personId === "p1" && a.eventId === "e1");
      expect(alloc?.planned).toBe(75);
    });

    resolveUpsert!({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back on mutation failure", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(["gifts", "quickAddMatrix", 2026], {
      people: [{ id: "p1", name: "Alex", memberId: null }],
      events: [{ id: "e1", name: "Birthday" }],
      allocations: [{ personId: "p1", eventId: "e1", planned: 20 }],
      budget: { annual: 500, currentPlanned: 20 },
    });

    const mod = await import("@/services/gifts.service");
    (mod.giftsApi.upsertAllocation as any).mockRejectedValueOnce(new Error("nope"));

    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { useUpsertAllocation } = await import("./useGifts");
    const { result } = renderHook(() => useUpsertAllocation(), { wrapper: localWrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          personId: "p1",
          eventId: "e1",
          year: 2026,
          data: { planned: 75 } as any,
        });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = qc.getQueryData<any>(["gifts", "quickAddMatrix", 2026]);
    const alloc = data?.allocations.find((a: any) => a.personId === "p1" && a.eventId === "e1");
    expect(alloc?.planned).toBe(20); // rolled back
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useGifts.test.ts`
Expected: FAIL — cache value unchanged in optimistic test.

- [ ] **Step 3: Replace `useUpsertAllocation` body with optimistic version**

In `apps/frontend/src/hooks/useGifts.ts`:

```typescript
type QuickAddAllocation = { personId: string; eventId: string; planned: number };
type QuickAddMatrix = {
  people: { id: string; name: string; memberId: string | null }[];
  events: { id: string; name: string }[];
  allocations: QuickAddAllocation[];
  budget: { annual: number; currentPlanned: number };
};

export function useUpsertAllocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      personId,
      eventId,
      year,
      data,
    }: {
      personId: string;
      eventId: string;
      year: number;
      data: Parameters<typeof giftsApi.upsertAllocation>[3];
    }) => giftsApi.upsertAllocation(personId, eventId, year, data),
    onMutate: async ({ personId, eventId, year, data }) => {
      const matrixKey = GIFTS_KEYS.quickAddMatrix(year);
      await queryClient.cancelQueries({ queryKey: matrixKey });
      const snapshot = queryClient.getQueryData<QuickAddMatrix>(matrixKey);
      if (snapshot) {
        const planned = (data as { planned?: number }).planned ?? 0;
        const others = snapshot.allocations.filter(
          (a) => !(a.personId === personId && a.eventId === eventId)
        );
        const updatedAllocations: QuickAddAllocation[] = [
          ...others,
          { personId, eventId, planned },
        ];
        const newPlannedTotal = updatedAllocations.reduce((sum, a) => sum + a.planned, 0);
        queryClient.setQueryData<QuickAddMatrix>(matrixKey, {
          ...snapshot,
          allocations: updatedAllocations,
          budget: { ...snapshot.budget, currentPlanned: newPlannedTotal },
        });
      }
      return { snapshot, year };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot && ctx.year !== undefined) {
        queryClient.setQueryData(GIFTS_KEYS.quickAddMatrix(ctx.year), ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to update allocation");
    },
    onSettled: (_data, _err, { personId, year }) => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.state(year) });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.quickAddMatrix(year) });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.person(personId, year) });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.upcoming(year) });
    },
  });
}
```

For `useBulkUpsertAllocations` — keep narrow invalidation but skip optimistic update (bulk payload spans multiple years; complexity not worth the modest UX gain):

```typescript
export function useBulkUpsertAllocations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof giftsApi.bulkUpsert>[0]) => giftsApi.bulkUpsert(data),
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to update allocations");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["gifts", "state"] });
      void queryClient.invalidateQueries({ queryKey: ["gifts", "quickAddMatrix"] });
      void queryClient.invalidateQueries({ queryKey: ["gifts", "person"] });
      void queryClient.invalidateQueries({ queryKey: ["gifts", "upcoming"] });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useGifts.test.ts && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useGifts.ts apps/frontend/src/hooks/useGifts.test.ts
git commit -m "feat(hooks): optimistic updates for gift allocation matrix"
```

---

### Task 12: Optimistic — `useSetGiftMode`

**Files:**

- Modify: `apps/frontend/src/hooks/useGifts.ts`
- Modify: `apps/frontend/src/hooks/useGifts.test.ts`

`GIFTS_KEYS.settings()` returns `{ mode, ... }`. Optimistic flip the mode field.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/hooks/useGifts.test.ts`:

```typescript
describe("useSetGiftMode optimistic", () => {
  it("flips mode in settings cache before server resolves, rolls back on error", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(["gifts", "settings"], { mode: "quick" });

    const mod = await import("@/services/gifts.service");
    (mod.giftsApi.setMode as any).mockRejectedValueOnce(new Error("denied"));

    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { useSetGiftMode } = await import("./useGifts");
    const { result } = renderHook(() => useSetGiftMode(), { wrapper: localWrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync({ mode: "detailed" } as any);
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<any>(["gifts", "settings"])?.mode).toBe("quick"); // rolled back
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useGifts.test.ts`
Expected: FAIL — no rollback because no `onMutate` snapshot.

- [ ] **Step 3: Replace `useSetGiftMode` with optimistic version**

```typescript
export function useSetGiftMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof giftsApi.setMode>[0]) => giftsApi.setMode(data),
    onMutate: async (data) => {
      const settingsKey = GIFTS_KEYS.settings();
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const snapshot = queryClient.getQueryData<{ mode?: string }>(settingsKey);
      if (snapshot) {
        queryClient.setQueryData(settingsKey, {
          ...snapshot,
          mode: (data as { mode?: string }).mode,
        });
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(GIFTS_KEYS.settings(), ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to change mode");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.settings() });
      void queryClient.invalidateQueries({ queryKey: ["gifts", "state"] });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.years() });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useGifts.test.ts && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useGifts.ts apps/frontend/src/hooks/useGifts.test.ts
git commit -m "feat(hooks): optimistic update for useSetGiftMode"
```

---

### Task 13: Optimistic — `useConfirmWaterfallItem` + `useConfirmAsset` + `useConfirmAccount`

**Files:**

- Modify: `apps/frontend/src/hooks/useWaterfall.ts`
- Modify: `apps/frontend/src/hooks/useAssets.ts`
- Modify: `apps/frontend/src/hooks/useWaterfall.test.ts`
- Modify: `apps/frontend/src/hooks/useAssets.test.ts`

These three checkbox confirms each set `lastReviewedAt` (or equivalent confirm marker) on a row in a list. The `useTierItems(tier)` query returns `TierItemRow[]` with `lastReviewedAt`. The asset/account confirms update items inside `assetsApiService.listAssetsByType` / `listAccountsByType`.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/hooks/useWaterfall.test.ts`:

```typescript
describe("useConfirmWaterfallItem optimistic", () => {
  it("bumps lastReviewedAt for the targeted row before server resolves", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const before = new Date("2026-01-01T00:00:00.000Z");
    qc.setQueryData(
      ["waterfall", "tier-items", "income"],
      [{ id: "i1", name: "Salary", lastReviewedAt: before, amount: 100 }]
    );

    let resolveConfirm: (v: unknown) => void;
    const mod = await import("@/services/waterfall.service");
    (mod.waterfallService.confirmIncome as any).mockImplementationOnce(
      () => new Promise((r) => (resolveConfirm = r))
    );

    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { useConfirmWaterfallItem } = await import("./useWaterfall");
    const { result } = renderHook(() => useConfirmWaterfallItem("income", "i1"), {
      wrapper: localWrapper,
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => {
      const data = qc.getQueryData<any[]>(["waterfall", "tier-items", "income"]);
      const row = data?.find((r) => r.id === "i1");
      expect(new Date(row.lastReviewedAt).getTime()).toBeGreaterThan(before.getTime());
    });

    resolveConfirm!({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
```

Append a similar block to `apps/frontend/src/hooks/useAssets.test.ts` (full mock module already in place from Task 3):

```typescript
describe("useConfirmAsset optimistic", () => {
  it("bumps lastReviewedAt for the targeted asset row", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const before = new Date("2026-01-01T00:00:00.000Z");
    qc.setQueryData(
      ["assets", "assets", "property"],
      [{ id: "a1", name: "House", lastReviewedAt: before }]
    );

    let resolveConfirm: (v: unknown) => void;
    const mod = await import("../services/assets.service.js");
    (mod.assetsApiService.confirmAsset as any).mockImplementationOnce(
      () => new Promise((r) => (resolveConfirm = r))
    );

    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { useConfirmAsset } = await import("./useAssets");
    const { result } = renderHook(() => useConfirmAsset(), { wrapper: localWrapper });

    act(() => {
      result.current.mutate("a1" as any);
    });

    await waitFor(() => {
      const data = qc.getQueryData<any[]>(["assets", "assets", "property"]);
      const row = data?.find((r) => r.id === "a1");
      expect(new Date(row.lastReviewedAt).getTime()).toBeGreaterThan(before.getTime());
    });

    resolveConfirm!({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useWaterfall.test.ts && bun test src/hooks/useAssets.test.ts`
Expected: FAIL — `lastReviewedAt` unchanged.

- [ ] **Step 3: Replace each confirm hook with an optimistic version**

In `apps/frontend/src/hooks/useWaterfall.ts`, replace `useConfirmWaterfallItem` body:

```typescript
export function useConfirmWaterfallItem(
  tier: "income" | "committed" | "discretionary",
  id: string
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (tier === "income") return waterfallService.confirmIncome(id);
      if (tier === "committed") return waterfallService.confirmCommitted(id);
      return waterfallService.confirmDiscretionary(id);
    },
    onMutate: async () => {
      const itemsKey = TIER_ITEM_KEYS.items(tier);
      await qc.cancelQueries({ queryKey: itemsKey });
      const snapshot = qc.getQueryData<TierItemRow[]>(itemsKey);
      if (snapshot) {
        const now = new Date();
        qc.setQueryData<TierItemRow[]>(itemsKey, (prev) =>
          (prev ?? []).map((r) => (r.id === id ? { ...r, lastReviewedAt: now } : r))
        );
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(TIER_ITEM_KEYS.items(tier), ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to confirm item");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.summary });
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.financialSummary });
      void qc.invalidateQueries({ queryKey: ["forecast"] });
      void qc.invalidateQueries({ queryKey: TIER_ITEM_KEYS.items(tier) });
    },
  });
}
```

In `apps/frontend/src/hooks/useAssets.ts`, replace both `useConfirmAsset` and `useConfirmAccount`. Because the asset/account types are split across many cached `["assets", "assets", <type>]` / `["assets", "accounts", <type>]` keys, snapshot every list under `["assets"]` and patch matching rows in each:

```typescript
type AssetRow = { id: string; lastReviewedAt: Date | string; [key: string]: unknown };

function bumpLastReviewedAt(
  prefix: ["assets", "assets" | "accounts"],
  qc: ReturnType<typeof useQueryClient>,
  id: string
) {
  const now = new Date();
  const all = qc.getQueriesData<AssetRow[]>({ queryKey: prefix });
  const snapshots = all.map(([key, data]) => ({ key, data }));
  for (const { key, data } of snapshots) {
    if (!Array.isArray(data)) continue;
    qc.setQueryData<AssetRow[]>(
      key,
      data.map((r) => (r.id === id ? { ...r, lastReviewedAt: now } : r))
    );
  }
  return snapshots;
}

export function useConfirmAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assetsApiService.confirmAsset,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["assets", "assets"] });
      const snapshots = bumpLastReviewedAt(["assets", "assets"], qc, id);
      return { snapshots };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshots) {
        for (const { key, data } of ctx.snapshots) qc.setQueryData(key, data);
      }
      showError(error instanceof Error ? error.message : "Failed to confirm asset");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
}

export function useConfirmAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assetsApiService.confirmAccount,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["assets", "accounts"] });
      const snapshots = bumpLastReviewedAt(["assets", "accounts"], qc, id);
      return { snapshots };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshots) {
        for (const { key, data } of ctx.snapshots) qc.setQueryData(key, data);
      }
      showError(error instanceof Error ? error.message : "Failed to confirm account");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
}
```

Note: this assumes `confirmAsset` / `confirmAccount` accept the id as a string positionally. If their signatures take an object — e.g. `{ assetId: string }` — adjust both the `mutationFn` reference and the `onMutate` parameter destructuring accordingly. Read `apps/frontend/src/services/assets.service.ts` if uncertain.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useWaterfall.test.ts && bun test src/hooks/useAssets.test.ts && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useWaterfall.ts apps/frontend/src/hooks/useWaterfall.test.ts apps/frontend/src/hooks/useAssets.ts apps/frontend/src/hooks/useAssets.test.ts
git commit -m "feat(hooks): optimistic confirm toggles for waterfall items, assets, accounts"
```

---

### Task 14: Optimistic — `useUpdateMemberRole`

**Files:**

- Modify: `apps/frontend/src/hooks/useSettings.ts`
- Modify: `apps/frontend/src/hooks/useSettings.test.ts`

The role dropdown writes via `["household-members"]`. The `useHouseholdMembers` hook reads from `useHouseholdDetails(householdId)` → `data.household.memberProfiles`, which lives under `SETTINGS_KEYS.household(householdId)`. That nested shape needs an `onMutate` that patches the right member's role.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/hooks/useSettings.test.ts`:

```typescript
describe("useUpdateMemberRole optimistic", () => {
  it("flips role in household details cache before server resolves, rolls back on error", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(["household", "h1"], {
      household: {
        memberProfiles: [
          { id: "m1", userId: "u1", name: "Alex", role: "member" },
          { id: "m2", userId: "u2", name: "Sam", role: "admin" },
        ],
      },
    });

    const mod = await import("@/services/auditLog.service");
    (mod.updateMemberRole as any).mockRejectedValueOnce(new Error("forbidden"));
    mockShowError.mockClear();

    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { useUpdateMemberRole } = await import("./useSettings");
    const { result } = renderHook(() => useUpdateMemberRole("h1"), {
      wrapper: localWrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ targetUserId: "u1", role: "admin" });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = qc.getQueryData<any>(["household", "h1"]);
    const m1 = data.household.memberProfiles.find((m: any) => m.userId === "u1");
    expect(m1.role).toBe("member"); // rolled back
    expect(mockShowError).toHaveBeenCalledWith("forbidden");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/hooks/useSettings.test.ts`
Expected: FAIL — no rollback path.

- [ ] **Step 3: Replace `useUpdateMemberRole` body**

```typescript
type HouseholdDetails = {
  household: {
    memberProfiles: Array<{ id: string; userId: string; name: string; role: "member" | "admin" }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function useUpdateMemberRole(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetUserId, role }: { targetUserId: string; role: "member" | "admin" }) =>
      updateMemberRole(targetUserId, role, householdId),
    onMutate: async ({ targetUserId, role }) => {
      const key = SETTINGS_KEYS.household(householdId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<HouseholdDetails>(key);
      if (snapshot) {
        queryClient.setQueryData<HouseholdDetails>(key, {
          ...snapshot,
          household: {
            ...snapshot.household,
            memberProfiles: snapshot.household.memberProfiles.map((m) =>
              m.userId === targetUserId ? { ...m, role } : m
            ),
          },
        });
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(SETTINGS_KEYS.household(householdId), ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to update role");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["household-members"] });
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/hooks/useSettings.test.ts && bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useSettings.ts apps/frontend/src/hooks/useSettings.test.ts
git commit -m "feat(hooks): optimistic role change in useUpdateMemberRole"
```

---

## Testing

> Key scenarios that must pass end-to-end, beyond the per-task tests above.

### Frontend Tests

- [ ] Hook: every `useMutation` in `apps/frontend/src/hooks/*` calls `showError` on `onError` (verified by representative test per file in Tasks 1–8)
- [ ] Hook: `GIFTS_KEYS.all` is no longer invalidated by any gift mutation (Task 9 test)
- [ ] Hook: optimistic flip + rollback works for `useUpdateLinkedAccount`, `useUpsertAllocation`, `useSetGiftMode`, `useConfirmWaterfallItem`, `useConfirmAsset`, `useUpdateMemberRole` (Tasks 10–14)

### Key Scenarios

- [ ] Happy path: toggle a cashflow link checkbox → checkbox updates instantly with no flicker
- [ ] Happy path: edit a gift allocation matrix cell → cell updates instantly; budget total updates immediately
- [ ] Error case (devtools network throttle / API offline): toggle a link → checkbox flips, then snaps back when server fails, error toast appears
- [ ] Edge case: bulk gift allocation upsert succeeds → invalidation refetches narrow keys only (verify in network tab: no refetch of `configEvents` / `years`)

## Verification

> Commands to run after all tasks are complete. All must pass before marking done.

- [ ] `bun run build` passes clean (root)
- [ ] `bun run lint` — zero warnings (root)
- [ ] `bun run type-check` — zero errors (root)
- [ ] `cd apps/frontend && bun run test` — every hook test passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts` — backend tests still pass (no impact expected)
- [ ] Manual: in the running dev environment (`bun run start`):
  - Trigger each priority interaction: cashflow link toggle, gift matrix cell edit, gift mode radio, item-confirm checkbox, member-role dropdown.
  - Confirm UI updates instantly with no visible refetch flicker.
  - Open devtools → Network → block one of the mutation requests → repeat the action → confirm the cache rolls back and an error toast appears.
- [ ] Manual: open a DevTools `Network` panel while editing a gift allocation cell → confirm only `state`, `quickAddMatrix`, `person`, `upcoming` requests fire (no `configPeople`, `configEvents`, `years`, `settings`).

## Post-conditions

> What this feature enables for subsequent phases or dependent work.

- [ ] Every mutation hook surfaces failures via the existing `showError` toast helper — silent failures eliminated.
- [ ] Coarse `GIFTS_KEYS.all` invalidation eliminated — gift mutations refetch only the queries they actually affect.
- [ ] Five high-payoff rapid-interaction mutations are optimistic with rollback.
- [ ] Foundation is in place for extracting a shared `createOptimisticMutation` helper later (the 5 hooks now share a clear, repeated structure that an extractor can target).
