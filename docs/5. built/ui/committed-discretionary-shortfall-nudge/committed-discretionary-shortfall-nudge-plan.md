---
feature: committed-discretionary-shortfall-nudge
category: ui
spec: docs/4. planning/committed-discretionary-shortfall-nudge/committed-discretionary-shortfall-nudge-spec.md
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# Committed / Discretionary Shortfall Nudge — Implementation Plan

> **For Claude:** Use `/execute-plan committed-discretionary-shortfall-nudge` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Add an item-level cashflow shortfall nudge to the Overview waterfall (Committed + Discretionary tier rows) and to the Committed/Discretionary tier-page left panels, driven by a new household-scoped read that walks the existing cashflow event stream and emits uncovered events.

**Spec:** `docs/4. planning/committed-discretionary-shortfall-nudge/committed-discretionary-shortfall-nudge-spec.md`

**Architecture:** A new `cashflowService.getShortfallItems` method reuses `loadPlanContext` and `buildEvents` from the existing cashflow service. It walks events in date order, maintains a running balance (incl. discretionary daily baseline), and emits `{ itemType, itemId, itemName, tierKey, dueDate, amount }` for any event that, when applied, drops the running balance below £0. The result is exposed at `GET /api/cashflow/shortfall`. Frontend introduces `useShortfall()` (full payload) and `useTierShortfall(tierKey)` (filtered + derived `daysToFirst`); a generic `AttentionStrip` component (just added to the design system) plus `ShortfallTooltip` and `ShortfallBadge` are wired into `WaterfallLeftPanel` and `TierPage`. Item mutation hooks gain `["cashflow"]`-prefix cache invalidation so the nudge updates as users edit.

**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind

**Infrastructure Impact:**

- Touches `packages/shared/`: yes (extending `cashflow.schemas.ts` with shortfall query + response types)
- Requires DB migration: no

## Pre-conditions

- [ ] `cashflowService.getProjection` and the underlying `loadPlanContext` / `buildEvents` / `computeMonthlyDiscretionaryBaseline` helpers exist in `apps/backend/src/services/cashflow.service.ts`
- [ ] `WaterfallLeftPanel` (with the existing `StaleCountBadge` slot) exists in `apps/frontend/src/components/overview/`
- [ ] `TierPage` exists in `apps/frontend/src/components/tier/` with `PageHeader` → scrollable content layout
- [ ] `AttentionStrip` is documented in `docs/2. design/design-system.md` § 2 (added during the design phase)
- [ ] Radix Tooltip primitive available at `apps/frontend/src/components/ui/tooltip.tsx`
- [ ] Backend test runner: `cd apps/backend && bun scripts/run-tests.ts <pattern>`
- [ ] Frontend test runner: `cd apps/frontend && bun test <pattern>`

## Tasks

> Each task is one action (2–5 minutes), follows red-green-commit, and contains complete code. Ordered: shared schemas → backend service → backend route → frontend service → frontend hook → frontend components → wiring → invalidation.

---

### Task 1: Shared schemas — shortfall query + response types

**Files:**

- Modify: `packages/shared/src/schemas/cashflow.schemas.ts`
- Modify: `packages/shared/src/schemas/cashflow.schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas/cashflow.schemas.test.ts`:

```typescript
import { cashflowShortfallQuerySchema } from "./cashflow.schemas";

describe("cashflowShortfallQuerySchema", () => {
  it("defaults windowDays to 30 when omitted", () => {
    const parsed = cashflowShortfallQuerySchema.parse({});
    expect(parsed.windowDays).toBe(30);
  });

  it("coerces string input to integer", () => {
    const parsed = cashflowShortfallQuerySchema.parse({ windowDays: "14" });
    expect(parsed.windowDays).toBe(14);
  });

  it("rejects values below 1", () => {
    expect(() => cashflowShortfallQuerySchema.parse({ windowDays: 0 })).toThrow();
  });

  it("rejects values above 90", () => {
    expect(() => cashflowShortfallQuerySchema.parse({ windowDays: 91 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test cashflow.schemas`
Expected: FAIL — "Cannot find name 'cashflowShortfallQuerySchema'"

- [ ] **Step 3: Add schema and response types**

Append to `packages/shared/src/schemas/cashflow.schemas.ts`:

```typescript
// ─── Shortfall ──────────────────────────────────────────────────────────────

export const cashflowShortfallQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(30),
});

export type CashflowShortfallQuery = z.infer<typeof cashflowShortfallQuerySchema>;

export type ShortfallTierKey = "committed" | "discretionary";

export interface ShortfallItem {
  itemType: "committed_item" | "discretionary_item";
  itemId: string;
  itemName: string;
  tierKey: ShortfallTierKey;
  dueDate: string; // ISO YYYY-MM-DD
  amount: number; // positive (the outflow that wasn't covered)
}

export interface CashflowShortfall {
  items: ShortfallItem[]; // sorted by dueDate asc, ties by itemName
  balanceToday: number;
  lowest: { value: number; date: string }; // ISO YYYY-MM-DD
  linkedAccountCount: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test cashflow.schemas`
Expected: PASS — all four schema tests green

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/cashflow.schemas.ts packages/shared/src/schemas/cashflow.schemas.test.ts
git commit -m "feat(shared): add cashflow shortfall query and response schemas"
```

---

### Task 2: Backend service — `getShortfallItems` (no shortfall case)

**Files:**

- Modify: `apps/backend/src/services/cashflow.service.ts`
- Test: `apps/backend/src/services/cashflow.service.shortfall.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/services/cashflow.service.shortfall.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { cashflowService } = await import("./cashflow.service.js");

beforeEach(() => resetPrismaMocks());

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

describe("cashflowService.getShortfallItems", () => {
  it("returns empty items + zero counts when household has no linked accounts", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);

    const result = await cashflowService.getShortfallItems("hh-1", { windowDays: 30 });

    expect(result.items).toEqual([]);
    expect(result.linkedAccountCount).toBe(0);
    expect(result.balanceToday).toBe(0);
  });

  it("returns no shortfall items when balance comfortably covers all events in window", async () => {
    const today = todayUtc();
    const due = new Date(today);
    due.setUTCDate(due.getUTCDate() + 5);

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 5000, date: today, createdAt: today }],
      } as any,
    ]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "c1", name: "Mortgage", spendType: "monthly", dueDate: due } as any,
    ]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 1200,
      } as any,
    ]);

    const result = await cashflowService.getShortfallItems("hh-1", { windowDays: 30 });

    expect(result.items).toEqual([]);
    expect(result.linkedAccountCount).toBe(1);
    expect(result.balanceToday).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service.shortfall`
Expected: FAIL — "cashflowService.getShortfallItems is not a function"

- [ ] **Step 3: Implement the method**

In `apps/backend/src/services/cashflow.service.ts`, add a new top-level helper near the other helpers, and add `getShortfallItems` to the service. The implementation reuses `loadPlanContext`, `buildEvents`, and `computeMonthlyDiscretionaryBaseline` (already in the file).

Add to the imports area (top of file):

```typescript
import type {
  // ... existing imports unchanged ...
  CashflowShortfall,
  CashflowShortfallQuery,
  ShortfallItem,
} from "@finplan/shared";
```

Add to the `cashflowService` object (after `getMonthDetail`):

```typescript
async getShortfallItems(
  householdId: string,
  query: CashflowShortfallQuery
): Promise<CashflowShortfall> {
  const windowDays = query.windowDays;

  const linked = await prisma.account.findMany({
    where: { householdId, isCashflowLinked: true, type: { in: ["Current", "Savings"] } },
    include: {
      balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 },
    },
  });
  const latestBalances = linked
    .map((a) => a.balances[0])
    .filter((b): b is NonNullable<typeof b> => b != null);
  const startingBalance = latestBalances.reduce((s, b) => s + b.value, 0);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays);

  const { income, committed, discretionary, periodsByKey, disposalSources } =
    await loadPlanContext(householdId);
  const linkedAccountIds = new Set(linked.map((a) => a.id));

  // Anchor-replay to compute today's projected balance, mirroring getProjection.
  const youngest =
    latestBalances.length > 0 ? latestBalances.reduce((y, b) => (b.date > y.date ? b : y)) : null;
  const anchor = youngest?.date ?? today;

  let balanceToday = startingBalance;
  if (anchor < today) {
    const replay = buildEvents(
      anchor,
      today,
      income,
      committed,
      discretionary,
      periodsByKey,
      disposalSources,
      linkedAccountIds
    );
    const cursor = new Date(anchor);
    for (const e of replay) {
      while (cursor < e.date) {
        const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
        balanceToday -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      balanceToday += e.amount;
    }
    while (cursor < today) {
      const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
      balanceToday -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else if (anchor > today) {
    const replay = buildEvents(
      today,
      anchor,
      income,
      committed,
      discretionary,
      periodsByKey,
      disposalSources,
      linkedAccountIds
    );
    const eventsByDay = new Map<number, number>();
    for (const e of replay) {
      const key = e.date.getTime();
      eventsByDay.set(key, (eventsByDay.get(key) ?? 0) + e.amount);
    }
    const cursor = new Date(anchor);
    while (cursor > today) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
      balanceToday += baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
      const evAmount = eventsByDay.get(cursor.getTime());
      if (evAmount !== undefined) balanceToday -= evAmount;
    }
  }

  // Walk events within the window, applying baseline daily, marking uncovered.
  // Pass disposalSources + linkedAccountIds so liquidation events fund the
  // running balance the same way getProjection treats them.
  const events = buildEvents(
    today,
    windowEnd,
    income,
    committed,
    discretionary,
    periodsByKey,
    disposalSources,
    linkedAccountIds
  );
  const uncovered: ShortfallItem[] = [];
  let running = balanceToday;
  let lowestValue = balanceToday;
  let lowestDate = today;
  const cursor = new Date(today);
  let eIdx = 0;
  while (cursor < windowEnd) {
    const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
    running -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
    while (eIdx < events.length && events[eIdx]!.date.getTime() === cursor.getTime()) {
      const ev = events[eIdx]!;
      const newBalance = running + ev.amount;
      if (ev.amount < 0 && newBalance < 0) {
        const tierKey: "committed" | "discretionary" =
          ev.itemType === "discretionary_item" ? "discretionary" : "committed";
        if (ev.itemType !== "income_source") {
          uncovered.push({
            itemType: ev.itemType,
            itemId: ev.itemId ?? "",
            itemName: ev.label,
            tierKey,
            dueDate: toIsoDate(ev.date),
            amount: -ev.amount,
          });
        }
      }
      running = newBalance;
      eIdx++;
    }
    if (running < lowestValue) {
      lowestValue = running;
      lowestDate = new Date(cursor);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  uncovered.sort((a, b) => {
    const d = a.dueDate.localeCompare(b.dueDate);
    return d !== 0 ? d : a.itemName.localeCompare(b.itemName);
  });

  return {
    items: uncovered,
    balanceToday,
    lowest: { value: lowestValue, date: toIsoDate(lowestDate) },
    linkedAccountCount: linked.length,
  };
},
```

Note: this requires `buildEvents` to also expose `itemId` on each emitted event. Update the `ProjectionEvent` interface and **seven** push sites in `cashflow.service.ts`:

- The four `expandRecurring` push sites in `buildEvents` (monthly, weekly, annual/yearly, quarterly) — use `itemId: item.id`.
- The one_off branch in `expandRecurring` — use `itemId: item.id`.
- The discretionary one_off push in `buildEvents` — use `itemId: d.id`.
- The liquidation event in `buildLiquidationEvent` (around line 88) — use `itemId: source.id` (the disposal source id is the most stable handle).

Add `itemId: string` to the `ProjectionEvent` interface. The change is additive, so existing call sites of `buildEvents` (`getProjection`, `getMonthDetail`) compile unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service.shortfall`
Expected: PASS — both tests green

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/cashflow.service.ts apps/backend/src/services/cashflow.service.shortfall.test.ts
git commit -m "feat(backend): add cashflowService.getShortfallItems"
```

---

### Task 3: Backend service — uncovered detection (positive case)

**Files:**

- Modify: `apps/backend/src/services/cashflow.service.shortfall.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `cashflow.service.shortfall.test.ts`:

```typescript
describe("cashflowService.getShortfallItems — uncovered events", () => {
  it("emits a committed-tier ShortfallItem when a bill drops the balance below zero", async () => {
    const today = todayUtc();
    const due = new Date(today);
    due.setUTCDate(due.getUTCDate() + 7);

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 100, date: today, createdAt: today }],
      } as any,
    ]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "c1", name: "Council Tax", spendType: "monthly", dueDate: due } as any,
    ]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 420,
      } as any,
    ]);

    const result = await cashflowService.getShortfallItems("hh-1", { windowDays: 30 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemType: "committed_item",
      itemId: "c1",
      itemName: "Council Tax",
      tierKey: "committed",
      amount: 420,
    });
    expect(result.lowest.value).toBeLessThan(0);
  });

  it("sorts uncovered items by dueDate asc, ties by name", async () => {
    const today = todayUtc();
    const sameDay = new Date(today);
    sameDay.setUTCDate(sameDay.getUTCDate() + 5);
    const laterDay = new Date(today);
    laterDay.setUTCDate(laterDay.getUTCDate() + 10);

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 0, date: today, createdAt: today }],
      } as any,
    ]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "c1", name: "Zebra Bill", spendType: "monthly", dueDate: sameDay } as any,
      { id: "c2", name: "Apple Bill", spendType: "monthly", dueDate: sameDay } as any,
      { id: "c3", name: "Middle Bill", spendType: "monthly", dueDate: laterDay } as any,
    ]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 50,
      } as any,
      {
        itemType: "committed_item",
        itemId: "c2",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 50,
      } as any,
      {
        itemType: "committed_item",
        itemId: "c3",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 50,
      } as any,
    ]);

    const result = await cashflowService.getShortfallItems("hh-1", { windowDays: 30 });

    expect(result.items.map((i) => i.itemName)).toEqual([
      "Apple Bill",
      "Zebra Bill",
      "Middle Bill",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service.shortfall`
Expected: PASS if Task 2's implementation is complete. If FAIL, refine the algorithm in `cashflow.service.ts` until both new tests pass.

- [ ] **Step 3: (No new code expected — Task 2 should already cover this.)**

If tests fail, revisit the algorithm — most likely the sort comparator or the discretionary baseline handling needs adjustment.

- [ ] **Step 4: Run test to verify it passes**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit (only if changes were needed)**

```bash
git add apps/backend/src/services/cashflow.service.ts apps/backend/src/services/cashflow.service.shortfall.test.ts
git commit -m "test(backend): cover ordered uncovered shortfall items"
```

---

### Task 4: Backend route — `GET /api/cashflow/shortfall`

**Files:**

- Modify: `apps/backend/src/routes/cashflow.routes.ts`
- Modify: `apps/backend/src/routes/cashflow.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `cashflow.routes.test.ts` (follow the existing route-test pattern in that file):

```typescript
describe("GET /api/cashflow/shortfall", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cashflow/shortfall" });
    expect(res.statusCode).toBe(401);
  });

  it("returns shortfall payload for authenticated user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/cashflow/shortfall?windowDays=30",
      headers: authHeaders, // existing helper from this test file
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("balanceToday");
    expect(body).toHaveProperty("lowest");
    expect(body).toHaveProperty("linkedAccountCount");
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("rejects windowDays > 90", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/cashflow/shortfall?windowDays=120",
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(400);
  });

  it("does not leak items from another household", async () => {
    // Seed a committed item in household B that would otherwise be uncovered.
    // Authenticate as household A.
    // Assert items array contains nothing from household B.
    // (Use existing test seeding helpers in this file.)
    const res = await app.inject({
      method: "GET",
      url: "/api/cashflow/shortfall",
      headers: authHeaders,
    });
    const body = res.json();
    for (const item of body.items) {
      expect(item.itemId).not.toBe(otherHouseholdItemId); // helper var from existing file
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.routes`
Expected: FAIL — 404 on `/api/cashflow/shortfall` (route does not exist yet)

- [ ] **Step 3: Add the route**

In `apps/backend/src/routes/cashflow.routes.ts`:

```typescript
// Add to the existing imports from @finplan/shared
import {
  cashflowProjectionQuerySchema,
  cashflowMonthDetailQuerySchema,
  cashflowShortfallQuerySchema,
  updateLinkedAccountSchema,
  bulkUpdateLinkedAccountsSchema,
} from "@finplan/shared";
```

Add a new route inside `cashflowRoutes`, immediately after the `/month` route:

```typescript
fastify.get("/shortfall", preRead, async (req, reply) => {
  const query = cashflowShortfallQuerySchema.parse(req.query);
  const result = await cashflowService.getShortfallItems(req.householdId!, query);
  return reply.send(result);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.routes`
Expected: PASS — all four shortfall route tests green

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/cashflow.routes.ts apps/backend/src/routes/cashflow.routes.test.ts
git commit -m "feat(backend): expose GET /api/cashflow/shortfall"
```

---

### Task 5: Frontend service — `getShortfall`

**Files:**

- Modify: `apps/frontend/src/services/cashflow.service.ts`

- [ ] **Step 1: Write the failing test**

This is a thin pass-through — the test belongs to the hook (Task 6). Skip this task's test step and proceed to implementation. (Step 5 commit is bundled with Task 6.)

- [ ] **Step 3: Add the method**

In `apps/frontend/src/services/cashflow.service.ts`:

```typescript
// Add to imports
import type {
  CashflowProjection,
  CashflowMonthDetail,
  CashflowProjectionQuery,
  CashflowShortfall,
  CashflowShortfallQuery,
  LinkableAccountRow,
  BulkUpdateLinkedAccountsInput,
} from "@finplan/shared";
```

Add to the `cashflowService` object (after `getMonthDetail`):

```typescript
getShortfall: (query: CashflowShortfallQuery = { windowDays: 30 }) =>
  apiClient.get<CashflowShortfall>(
    `/api/cashflow/shortfall${toQueryString({ windowDays: query.windowDays })}`
  ),
```

- [ ] **Step 5: (Commit bundled with Task 6.)**

---

### Task 6: Frontend hook — `useShortfall` and `useTierShortfall`

**Files:**

- Create: `apps/frontend/src/hooks/useShortfall.ts`
- Create: `apps/frontend/src/hooks/useShortfall.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useShortfall.test.tsx`:

```tsx
import { describe, it, expect } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "@/test/msw/server";
import { useShortfall, useTierShortfall } from "./useShortfall";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const samplePayload = {
  items: [
    {
      itemType: "committed_item",
      itemId: "c1",
      itemName: "Council Tax",
      tierKey: "committed",
      dueDate: "2026-05-08",
      amount: 420,
    },
    {
      itemType: "discretionary_item",
      itemId: "d1",
      itemName: "Holiday",
      tierKey: "discretionary",
      dueDate: "2026-05-15",
      amount: 600,
    },
  ],
  balanceToday: 540,
  lowest: { value: -123, date: "2026-05-08" },
  linkedAccountCount: 2,
};

describe("useShortfall", () => {
  it("fetches and returns the shortfall payload", async () => {
    server.use(http.get("/api/cashflow/shortfall", () => HttpResponse.json(samplePayload)));
    const { result } = renderHook(() => useShortfall(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.items).toHaveLength(2);
  });
});

describe("useTierShortfall", () => {
  it("filters items to the requested tier and computes daysToFirst", async () => {
    server.use(http.get("/api/cashflow/shortfall", () => HttpResponse.json(samplePayload)));
    const { result } = renderHook(() => useTierShortfall("committed"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]?.itemId).toBe("c1");
    expect(result.current.count).toBe(1);
    expect(typeof result.current.daysToFirst).toBe("number");
    expect(result.current.isLive).toBe(true);
  });

  it("returns isLive=false when there are no linked accounts", async () => {
    server.use(
      http.get("/api/cashflow/shortfall", () =>
        HttpResponse.json({ ...samplePayload, items: [], linkedAccountCount: 0 })
      )
    );
    const { result } = renderHook(() => useTierShortfall("committed"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLive).toBe(false));
    expect(result.current.count).toBe(0);
  });

  it("returns isLive=false when isSnapshot=true (does not fetch)", () => {
    const { result } = renderHook(() => useTierShortfall("committed", { isSnapshot: true }), {
      wrapper: wrapper(),
    });
    expect(result.current.isLive).toBe(false);
    expect(result.current.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useShortfall`
Expected: FAIL — "Cannot find module './useShortfall'"

- [ ] **Step 3: Implement the hook**

Create `apps/frontend/src/hooks/useShortfall.ts`:

```typescript
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cashflowService } from "@/services/cashflow.service";
import type {
  CashflowShortfall,
  CashflowShortfallQuery,
  ShortfallItem,
  ShortfallTierKey,
} from "@finplan/shared";

const SHORTFALL_KEY = (q: CashflowShortfallQuery) => ["cashflow", "shortfall", q] as const;

export function useShortfall(query: CashflowShortfallQuery = { windowDays: 30 }) {
  return useQuery({
    queryKey: SHORTFALL_KEY(query),
    queryFn: () => cashflowService.getShortfall(query),
  });
}

interface UseTierShortfallOptions {
  isSnapshot?: boolean;
  windowDays?: number;
}

export interface TierShortfallResult {
  items: ShortfallItem[];
  count: number;
  daysToFirst: number | null;
  balanceToday: number;
  lowest: CashflowShortfall["lowest"] | null;
  isLive: boolean;
}

export function useTierShortfall(
  tierKey: ShortfallTierKey,
  options: UseTierShortfallOptions = {}
): TierShortfallResult {
  const isSnapshot = options.isSnapshot ?? false;
  const windowDays = options.windowDays ?? 30;
  const enabled = !isSnapshot;

  const query = useQuery({
    queryKey: SHORTFALL_KEY({ windowDays }),
    queryFn: () => cashflowService.getShortfall({ windowDays }),
    enabled,
  });

  return useMemo<TierShortfallResult>(() => {
    if (!enabled || !query.data || query.data.linkedAccountCount === 0) {
      return {
        items: [],
        count: 0,
        daysToFirst: null,
        balanceToday: query.data?.balanceToday ?? 0,
        lowest: query.data?.lowest ?? null,
        isLive: false,
      };
    }
    const items = query.data.items.filter((i) => i.tierKey === tierKey);
    let daysToFirst: number | null = null;
    if (items.length > 0) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const due = new Date(items[0]!.dueDate + "T00:00:00.000Z");
      daysToFirst = Math.max(
        0,
        Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      );
    }
    return {
      items,
      count: items.length,
      daysToFirst,
      balanceToday: query.data.balanceToday,
      lowest: query.data.lowest,
      isLive: items.length > 0,
    };
  }, [enabled, query.data, tierKey]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useShortfall`
Expected: PASS — all four tests green

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/cashflow.service.ts apps/frontend/src/hooks/useShortfall.ts apps/frontend/src/hooks/useShortfall.test.tsx
git commit -m "feat(frontend): add useShortfall and useTierShortfall hooks"
```

---

### Task 7: `AttentionStrip` component

**Files:**

- Create: `apps/frontend/src/components/common/AttentionStrip.tsx`
- Create: `apps/frontend/src/components/common/AttentionStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/common/AttentionStrip.test.tsx`:

```tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttentionStrip } from "./AttentionStrip";

describe("AttentionStrip", () => {
  it("renders body content with status role and amber dot", () => {
    render(
      <AttentionStrip
        body={
          <>
            Cashflow won't cover <strong>2 items</strong>
          </>
        }
        tooltip={<div>tooltip body</div>}
        ariaLabel="Cashflow shortfall: 2 items"
      />
    );
    const strip = screen.getByRole("status");
    expect(strip).toHaveAttribute("aria-live", "polite");
    expect(strip).toHaveAttribute("aria-label", "Cashflow shortfall: 2 items");
    expect(strip.textContent).toContain("Cashflow won't cover");
    expect(strip.textContent).toContain("2 items");
  });

  it("reveals tooltip on hover", async () => {
    const user = userEvent.setup();
    render(<AttentionStrip body={<>Heads up</>} tooltip={<div>Tooltip details</div>} />);
    await user.hover(screen.getByRole("status"));
    expect(await screen.findByText("Tooltip details")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test AttentionStrip`
Expected: FAIL — "Cannot find module './AttentionStrip'"

- [ ] **Step 3: Implement the component**

Create `apps/frontend/src/components/common/AttentionStrip.tsx`:

```tsx
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AttentionStripProps {
  body: ReactNode;
  tooltip: ReactNode;
  ariaLabel?: string;
}

export function AttentionStrip({ body, tooltip, ariaLabel }: AttentionStripProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="status"
            aria-live="polite"
            aria-label={ariaLabel}
            tabIndex={0}
            className="flex items-center gap-2 px-4 py-2 text-xs text-attention bg-attention-bg border-t border-b border-attention-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full shrink-0 bg-attention"
              aria-hidden
            />
            <span className="font-numeric">{body}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-80 p-0">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test AttentionStrip`
Expected: PASS — both tests green

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/common/AttentionStrip.tsx apps/frontend/src/components/common/AttentionStrip.test.tsx
git commit -m "feat(frontend): add AttentionStrip component"
```

---

### Task 8: `ShortfallTooltip` component

**Files:**

- Create: `apps/frontend/src/components/common/ShortfallTooltip.tsx`
- Create: `apps/frontend/src/components/common/ShortfallTooltip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/common/ShortfallTooltip.test.tsx`:

```tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ShortfallTooltip } from "./ShortfallTooltip";

const items = [
  {
    itemType: "committed_item" as const,
    itemId: "c1",
    itemName: "Council Tax",
    tierKey: "committed" as const,
    dueDate: "2026-05-08",
    amount: 420,
  },
  {
    itemType: "committed_item" as const,
    itemId: "c2",
    itemName: "Car Insurance",
    tierKey: "committed" as const,
    dueDate: "2026-05-14",
    amount: 540,
  },
];

describe("ShortfallTooltip", () => {
  it("renders lede, items, and grounding figures", () => {
    render(
      <MemoryRouter>
        <ShortfallTooltip
          items={items}
          balanceToday={540}
          lowest={{ value: -123, date: "2026-05-08" }}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/Some items won't be covered/)).toBeInTheDocument();
    expect(screen.getByText("Council Tax")).toBeInTheDocument();
    expect(screen.getByText("Car Insurance")).toBeInTheDocument();
    expect(screen.getByText(/Balance today/)).toBeInTheDocument();
    expect(screen.getByText(/Lowest in 30 days/)).toBeInTheDocument();
  });

  it("caps visible items at 3 and shows a Forecast → Cashflow link for overflow", () => {
    const many = Array.from({ length: 6 }).map((_, i) => ({
      itemType: "committed_item" as const,
      itemId: `c${i}`,
      itemName: `Bill ${i}`,
      tierKey: "committed" as const,
      dueDate: `2026-05-0${i + 1}`,
      amount: 100,
    }));
    render(
      <MemoryRouter>
        <ShortfallTooltip
          items={many}
          balanceToday={0}
          lowest={{ value: -300, date: "2026-05-06" }}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByTestId("shortfall-item")).toHaveLength(3);
    const link = screen.getByRole("link", { name: /open Forecast → Cashflow/ });
    expect(link).toHaveAttribute("href", "/forecast");
    expect(screen.getByText(/\+ 3 more/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ShortfallTooltip`
Expected: FAIL — "Cannot find module './ShortfallTooltip'"

- [ ] **Step 3: Implement the component**

Create `apps/frontend/src/components/common/ShortfallTooltip.tsx`:

```tsx
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import type { ShortfallItem } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";

interface ShortfallTooltipProps {
  items: ShortfallItem[];
  balanceToday: number;
  lowest: { value: number; date: string };
}

const VISIBLE_LIMIT = 3;

export function ShortfallTooltip({ items, balanceToday, lowest }: ShortfallTooltipProps) {
  const visible = items.slice(0, VISIBLE_LIMIT);
  const overflow = Math.max(0, items.length - VISIBLE_LIMIT);
  return (
    <div className="p-3 text-xs leading-relaxed">
      <p className="text-foreground/85 mb-2">Some items won't be covered by your cashflow.</p>
      <div className="space-y-1">
        {visible.map((item) => (
          <div
            key={item.itemId}
            data-testid="shortfall-item"
            className="grid grid-cols-[1fr_auto_auto] gap-3 items-baseline"
          >
            <span className="text-foreground/85 truncate">{item.itemName}</span>
            <span className="text-foreground/45 font-numeric">
              {format(parseISO(item.dueDate), "d MMM")}
            </span>
            <span className="text-attention font-numeric font-semibold">
              {formatCurrency(item.amount, false)}
            </span>
          </div>
        ))}
      </div>
      {overflow > 0 && (
        <div className="mt-2 pt-2 border-t border-foreground/5 text-foreground/55 text-[11px]">
          + {overflow} more ·{" "}
          <Link to="/forecast" className="underline underline-offset-2 hover:text-foreground/85">
            open Forecast → Cashflow for the full list
          </Link>
        </div>
      )}
      <div className="mt-3 pt-2 border-t border-foreground/5 space-y-1">
        <div className="flex justify-between">
          <span className="text-foreground/55">Balance today</span>
          <span className="font-numeric">{formatCurrency(balanceToday, false)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground/55">Lowest in 30 days</span>
          <span className="font-numeric text-attention">
            {formatCurrency(lowest.value, false)} · {format(parseISO(lowest.date), "d MMM")}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ShortfallTooltip`
Expected: PASS — both tests green

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/common/ShortfallTooltip.tsx apps/frontend/src/components/common/ShortfallTooltip.test.tsx
git commit -m "feat(frontend): add ShortfallTooltip shared body component"
```

---

### Task 9: `ShortfallBadge` component

**Files:**

- Create: `apps/frontend/src/components/common/ShortfallBadge.tsx`
- Create: `apps/frontend/src/components/common/ShortfallBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/common/ShortfallBadge.test.tsx`:

```tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ShortfallBadge } from "./ShortfallBadge";

const items = [
  {
    itemType: "committed_item" as const,
    itemId: "c1",
    itemName: "Council Tax",
    tierKey: "committed" as const,
    dueDate: "2026-05-08",
    amount: 420,
  },
];

describe("ShortfallBadge", () => {
  it("renders countdown badge with aria-label and amber dot", () => {
    render(
      <MemoryRouter>
        <ShortfallBadge
          daysToFirst={12}
          count={1}
          items={items}
          balanceToday={540}
          lowest={{ value: -123, date: "2026-05-08" }}
        />
      </MemoryRouter>
    );
    const badge = screen.getByLabelText("Cashflow shortfall: 1 item in the next 30 days");
    expect(badge).toHaveTextContent("shortfall in 12d");
  });

  it("uses plural 'items' in aria-label when count > 1", () => {
    render(
      <MemoryRouter>
        <ShortfallBadge
          daysToFirst={3}
          count={2}
          items={items}
          balanceToday={540}
          lowest={{ value: -123, date: "2026-05-08" }}
        />
      </MemoryRouter>
    );
    expect(
      screen.getByLabelText("Cashflow shortfall: 2 items in the next 30 days")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ShortfallBadge`
Expected: FAIL — "Cannot find module './ShortfallBadge'"

- [ ] **Step 3: Implement the component**

Create `apps/frontend/src/components/common/ShortfallBadge.tsx`:

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShortfallTooltip } from "./ShortfallTooltip";
import type { ShortfallItem } from "@finplan/shared";

interface ShortfallBadgeProps {
  daysToFirst: number;
  count: number;
  items: ShortfallItem[];
  balanceToday: number;
  lowest: { value: number; date: string };
}

export function ShortfallBadge({
  daysToFirst,
  count,
  items,
  balanceToday,
  lowest,
}: ShortfallBadgeProps) {
  const label = `Cashflow shortfall: ${count} item${count === 1 ? "" : "s"} in the next 30 days`;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={label}
            className="inline-flex items-center gap-1 text-xs text-attention focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full shrink-0 bg-attention"
              aria-hidden
            />
            shortfall in {daysToFirst}d
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-80 p-0">
          <ShortfallTooltip items={items} balanceToday={balanceToday} lowest={lowest} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ShortfallBadge`
Expected: PASS — both tests green

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/common/ShortfallBadge.tsx apps/frontend/src/components/common/ShortfallBadge.test.tsx
git commit -m "feat(frontend): add ShortfallBadge tier-row indicator"
```

---

### Task 10: Wire `AttentionStrip` into `TierPage`

**Files:**

- Modify: `apps/frontend/src/components/tier/TierPage.tsx`
- Modify: `apps/frontend/src/components/tier/TierPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/components/tier/TierPage.test.tsx` (assuming the file uses MSW; if not, follow the pattern of other tier-page tests in the repo):

```tsx
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/helpers/render";
import { screen } from "@testing-library/react";

it("renders the AttentionStrip on the Committed tier when shortfall items exist", async () => {
  server.use(
    http.get("/api/cashflow/shortfall", () =>
      HttpResponse.json({
        items: [
          {
            itemType: "committed_item",
            itemId: "c1",
            itemName: "Council Tax",
            tierKey: "committed",
            dueDate: "2026-05-08",
            amount: 420,
          },
          {
            itemType: "committed_item",
            itemId: "c2",
            itemName: "Car Insurance",
            tierKey: "committed",
            dueDate: "2026-05-14",
            amount: 540,
          },
        ],
        balanceToday: 540,
        lowest: { value: -123, date: "2026-05-08" },
        linkedAccountCount: 1,
      })
    )
  );
  renderWithProviders(<TierPage tier="committed" />);
  expect(await screen.findByText(/Cashflow won't cover/)).toBeInTheDocument();
  expect(screen.getByText(/2 items/)).toBeInTheDocument();
});

it("does not render the AttentionStrip on the Income tier", async () => {
  server.use(
    http.get("/api/cashflow/shortfall", () =>
      HttpResponse.json({
        items: [],
        balanceToday: 540,
        lowest: { value: 540, date: "2026-04-26" },
        linkedAccountCount: 1,
      })
    )
  );
  renderWithProviders(<TierPage tier="income" />);
  expect(screen.queryByText(/Cashflow won't cover/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test TierPage`
Expected: FAIL — `Cashflow won't cover` text not found.

- [ ] **Step 3: Wire the strip into TierPage**

In `apps/frontend/src/components/tier/TierPage.tsx`, add the import:

```typescript
import { AttentionStrip } from "@/components/common/AttentionStrip";
import { ShortfallTooltip } from "@/components/common/ShortfallTooltip";
import { useTierShortfall } from "@/hooks/useShortfall";
```

Inside the `TierPage` component, after the existing `tierTotal` calculation:

```typescript
const isShortfallTier = tier === "committed" || tier === "discretionary";
// Pass isSnapshot=true on non-shortfall tiers (income/surplus) to skip the fetch entirely.
const shortfall = useTierShortfall(isShortfallTier ? tier : "committed", {
  isSnapshot: !isShortfallTier,
});
const showShortfallStrip = isShortfallTier && shortfall.isLive && shortfall.count > 0;
```

In the JSX, change the left panel to:

```tsx
left={
  <div className="flex flex-col h-full">
    <PageHeader
      title={config.label}
      colorClass={config.textClass}
      total={tierTotal}
      totalColorClass={config.textClass}
    />
    {showShortfallStrip && shortfall.lowest && (
      <AttentionStrip
        ariaLabel={`Cashflow shortfall: ${shortfall.count} item${shortfall.count === 1 ? "" : "s"} in the next 30 days`}
        body={
          <>
            Cashflow won't cover{" "}
            <strong>{shortfall.count} item{shortfall.count === 1 ? "" : "s"}</strong>
          </>
        }
        tooltip={
          <ShortfallTooltip
            items={shortfall.items}
            balanceToday={shortfall.balanceToday}
            lowest={shortfall.lowest}
          />
        }
      />
    )}
    <div className="flex-1 overflow-y-auto">
      <SubcategoryList
        tier={tier}
        config={config}
        subcategories={subcategories ?? []}
        subcategoryTotals={subcategoryTotals}
        tierTotal={tierTotal}
        selectedId={resolvedSelectedId}
        onSelect={setSelectedId}
        isLoading={subsLoading}
      />
    </div>
  </div>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test TierPage`
Expected: PASS — both new tests green; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/TierPage.tsx apps/frontend/src/components/tier/TierPage.test.tsx
git commit -m "feat(frontend): render shortfall AttentionStrip on Committed/Discretionary tier pages"
```

---

### Task 11: Wire `ShortfallBadge` into `WaterfallLeftPanel`

**Files:**

- Modify: `apps/frontend/src/components/overview/WaterfallLeftPanel.tsx`
- Modify: `apps/frontend/src/components/overview/WaterfallLeftPanel.test.tsx` (or create if missing)
- Modify: `apps/frontend/src/pages/OverviewPage.tsx` (pass `isSnapshot={false}` prop)

- [ ] **Step 1: Write the failing test**

Add a test (same MSW pattern as Task 10) that mounts `WaterfallLeftPanel` (via OverviewPage or directly) with a mocked shortfall payload containing items in the Committed tier, then asserts:

```typescript
expect(await screen.findByText(/shortfall in/)).toBeInTheDocument();
expect(screen.getByLabelText(/Cashflow shortfall:/)).toBeInTheDocument();
// Stale badge still present if applicable:
expect(screen.queryByLabelText(/items? need review/)).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test WaterfallLeftPanel`
Expected: FAIL — `shortfall in` text not found.

- [ ] **Step 3: Wire the badge in**

In `apps/frontend/src/components/overview/WaterfallLeftPanel.tsx`:

Add imports:

```typescript
import { ShortfallBadge } from "@/components/common/ShortfallBadge";
import { useTierShortfall } from "@/hooks/useShortfall";
```

Add `isSnapshot` to the props interface (default `false`):

```typescript
interface WaterfallLeftPanelProps {
  summary: WaterfallSummary;
  selectedItemId: string | null;
  isSnapshot?: boolean;
}
```

Update the component signature to destructure `isSnapshot = false`.

Replace `staleCount: number` in `SectionHeader` with the existing prop, but allow an additional `extraBadge?: ReactNode` slot. Update `SectionHeader` to render both badges side-by-side:

```tsx
<div className="flex items-center gap-2">
  <h3 ...>{label}</h3>
  <StaleCountBadge count={staleCount} />
  {extraBadge}
</div>
```

Inside the component body, just before `return`, compute the per-tier shortfall:

```typescript
const committedShortfall = useTierShortfall("committed", { isSnapshot });
const discretionaryShortfall = useTierShortfall("discretionary", { isSnapshot });
```

In the Committed `SectionHeader` JSX, pass:

```tsx
extraBadge={
  committedShortfall.isLive && committedShortfall.daysToFirst !== null && committedShortfall.lowest ? (
    <ShortfallBadge
      daysToFirst={committedShortfall.daysToFirst}
      count={committedShortfall.count}
      items={committedShortfall.items}
      balanceToday={committedShortfall.balanceToday}
      lowest={committedShortfall.lowest}
    />
  ) : null
}
```

Same for Discretionary.

Update `OverviewPage.tsx` to pass `isSnapshot={false}` to `WaterfallLeftPanel`:

```tsx
<WaterfallLeftPanel
  summary={summary}
  selectedItemId={...}
  isSnapshot={false}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test WaterfallLeftPanel`
Expected: PASS — new test green; existing stale-badge tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/WaterfallLeftPanel.tsx apps/frontend/src/components/overview/WaterfallLeftPanel.test.tsx apps/frontend/src/pages/OverviewPage.tsx
git commit -m "feat(frontend): render shortfall badge alongside stale badge in waterfall tier rows"
```

---

### Task 12: Cache invalidation — extend mutations to refresh shortfall

**Files:**

- Modify: `apps/frontend/src/hooks/useCashflow.ts`
- Modify: `apps/frontend/src/hooks/useWaterfall.ts`

- [ ] **Step 1: Write the failing test**

Add a test in `apps/frontend/src/hooks/useShortfall.test.tsx` (or a new file) that mounts `useShortfall` together with `useCreateItem` from `useWaterfall`, fires the create mutation, and asserts the shortfall query refetches:

```tsx
it("refetches when a committed item is created", async () => {
  let calls = 0;
  server.use(
    http.get("/api/cashflow/shortfall", () => {
      calls++;
      return HttpResponse.json({
        items: [],
        balanceToday: 0,
        lowest: { value: 0, date: "2026-04-26" },
        linkedAccountCount: 1,
      });
    }),
    http.post("/api/waterfall/committed", () => HttpResponse.json({ id: "new-c" }))
  );
  // render hooks together, await first fetch, run mutation, await second fetch
  // assert calls === 2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useShortfall`
Expected: FAIL — `calls === 1` because no invalidation runs.

- [ ] **Step 3: Add invalidation**

In `apps/frontend/src/hooks/useCashflow.ts` — add to both `useUpdateLinkedAccount.onSuccess` and `useBulkUpdateLinkedAccounts.onSuccess`:

```typescript
void qc.invalidateQueries({ queryKey: ["cashflow", "shortfall"] });
```

In `apps/frontend/src/hooks/useWaterfall.ts` — add the same line to the `onSuccess` of every mutation hook that currently invalidates `["forecast"]`. Explicit list (verified against the file):

- `useConfirmItem` (line 58)
- `useUpdateItem` (line 87)
- `useCreateItem` (line 144)
- `useConfirmWaterfallItem` (line 174)
- `useDeleteItem` (line 194)
- `useTierUpdateItem` (line 212)
- `useCreatePeriod` (line 386)
- `useUpdatePeriod` (line 399)
- `useDeletePeriod` (line 412)
- `useDeleteAllWaterfall` (line 424)

The period hooks matter because changing an item's amount via a period directly changes the events the shortfall walk sees. The bulk-delete hook matters because it can flip a household from "shortfall" to "no shortfall" instantly. Run a final `grep "invalidateQueries.*forecast" apps/frontend/src/hooks/useWaterfall.ts` to confirm every match has the new shortfall invalidation alongside it.

Pattern in each:

```typescript
onSuccess: () => {
  void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.summary });
  void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.financialSummary });
  void qc.invalidateQueries({ queryKey: ["forecast"] });
  void qc.invalidateQueries({ queryKey: ["cashflow", "shortfall"] }); // ← new
  // ... rest unchanged
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useShortfall`
Expected: PASS — `calls === 2`.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useCashflow.ts apps/frontend/src/hooks/useWaterfall.ts apps/frontend/src/hooks/useShortfall.test.tsx
git commit -m "feat(frontend): invalidate shortfall query on item and linked-account mutations"
```

---

## Testing

### Backend Tests

- [ ] Service: `getShortfallItems` returns empty when household has no linked accounts
- [ ] Service: `getShortfallItems` returns empty when balance covers all events
- [ ] Service: `getShortfallItems` emits a committed shortfall when a bill drops the balance below £0
- [ ] Service: items sorted by `dueDate` asc, ties by `itemName`
- [ ] Service: discretionary daily baseline affects running balance but never emits an item
- [ ] Service: only `windowDays` ahead are considered (event after window is ignored)
- [ ] Endpoint: `GET /api/cashflow/shortfall` requires JWT (401 without)
- [ ] Endpoint: returns `200` with valid payload for authenticated user
- [ ] Endpoint: `windowDays > 90` rejected with `400`
- [ ] Endpoint: cross-household leakage — items from another household never appear

### Frontend Tests

- [ ] Hook: `useShortfall` fetches and returns the payload
- [ ] Hook: `useTierShortfall` filters to the tier and computes `daysToFirst`
- [ ] Hook: `useTierShortfall` returns `isLive: false` when `linkedAccountCount === 0`
- [ ] Hook: `useTierShortfall` skips the fetch when `isSnapshot: true`
- [ ] Hook: shortfall query refetches after a committed/discretionary/income item mutation
- [ ] Component: `AttentionStrip` renders body, has `role="status"`, opens tooltip on hover
- [ ] Component: `ShortfallTooltip` shows lede + items + grounding figures; caps at 3 with `+ N more` link to `/forecast`
- [ ] Component: `ShortfallBadge` renders `shortfall in {N}d` with correct singular/plural `aria-label`
- [ ] Page: `TierPage` renders the strip on Committed when shortfall exists
- [ ] Page: `TierPage` does not render the strip on Income or Surplus
- [ ] Page: `WaterfallLeftPanel` renders both stale badge and shortfall badge side by side when both signals fire
- [ ] Page: `WaterfallLeftPanel` renders no shortfall badge when `isSnapshot` is true

### Key Scenarios

- [ ] **Happy path:** household with 1 linked account at £100 and a £420 Council Tax bill in 7 days. Both Overview and Committed tier page show the nudge. Tooltip lists Council Tax with date and amount and shows Balance today £100 / Lowest in 30 days −£320 · 8 May.
- [ ] **No-shortfall path:** same bills, but linked-account balance £5,000. No badge, no strip on either surface.
- [ ] **Multi-tier path:** household has both committed AND discretionary uncovered items. Both tier rows on Overview show their own badge; both tier pages show their own strip. Each tooltip lists only its own tier's items.
- [ ] **Overflow path:** 6 uncovered items in committed. Strip says "Cashflow won't cover **6 items**". Tooltip shows 3 items + "+ 3 more · open Forecast → Cashflow for the full list" as a clickable link.
- [ ] **Empty path:** household has no cashflow-linked accounts. No nudge anywhere.
- [ ] **Mutation invalidation:** add a new committed item that causes a shortfall via the Committed tier page Add flow. Strip appears within one render cycle of the mutation completing.

## Verification

- [ ] `cd packages/shared && bun test` — all green
- [ ] `cd apps/backend && bun scripts/run-tests.ts cashflow` — all green
- [ ] `cd apps/frontend && bun test` — all green (including the design-system invariant tests; AttentionStrip should not break the `PageHeader → flex-1 overflow-y-auto` invariant on TierPage because `TierPage` is treated as a wrapper, not an inline-left-panel page)
- [ ] `bun run lint` — zero warnings (project standard)
- [ ] `bun run type-check` — zero errors
- [ ] `bun run build` — passes clean
- [ ] **Manual:** With Docker dev (`bun run start`), seed/edit data so an upcoming committed bill in the next 14 days exceeds the linked-account balance. Visit `/`, see the amber `shortfall in Nd` badge on Committed. Visit `/committed`, see the strip. Hover both — same item list and grounding figures. Visit `/income`, no badge. Edit the Council Tax due date past the 30-day window — strip and badge disappear after the next render.

## Post-conditions

- [ ] `AttentionStrip` is available as a reusable left-panel attention pattern for any future left-panel signal (ISA allowance, sync warnings, etc. — see design-system.md § 2)
- [ ] `cashflowService.getShortfallItems` is available for any future surface that needs uncovered-event data (e.g. a household digest email)
- [ ] All waterfall item mutations now invalidate `["cashflow", "shortfall"]`, keeping the new nudge fresh as users edit
- [ ] The cross-household leakage unit test on the new endpoint sets a precedent for similar tests on other multi-tenant reads

## Breaking change impact analysis

- **`ProjectionEvent` interface gains an `itemId` field.** Internal to `cashflow.service.ts`; no exports affected. Existing call sites of `buildEvents` (`getProjection`, `getMonthDetail`) ignore the new field — no compile or runtime break.
- **`CashflowEvent` (shared)** already exposes the same field set as the new `ShortfallItem`. No shared type changes affecting existing consumers — the new types are additive.
- **`useUpdateLinkedAccount` and `useBulkUpdateLinkedAccounts`** gain an extra `invalidateQueries` call. Net effect: one additional cache key is invalidated; existing consumers see the same projection/month invalidation behaviour. No regression.
- **Waterfall item mutation hooks** gain an extra `invalidateQueries` call for `["cashflow", "shortfall"]`. Existing forecast/summary invalidation unchanged. No regression.
- **`WaterfallLeftPanel` adds an optional `isSnapshot?: boolean` prop with default `false`.** All existing call sites work without modification. The OverviewPage call site is updated explicitly to make the contract clear.
- **`SectionHeader` (private to `WaterfallLeftPanel`) gains an `extraBadge?: ReactNode` prop.** Internal; no external impact.
- **`TierPage` adds left-panel content above the scroll wrapper.** The design-system test exempts `*Page.tsx` files that use `<TierPage>` as a wrapper from the inline-left-panel invariants — adding a sibling between PageHeader and the scroll wrapper does not break any documented page-level invariant. No EXEMPT_PAGES change required.
- **No removed fields, no renamed fields, no changed return types**, so no consumer-trace work is required beyond the items above.
