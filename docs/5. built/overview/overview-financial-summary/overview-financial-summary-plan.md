---
feature: overview-financial-summary
category: overview
spec: docs/4. planning/overview-financial-summary/overview-financial-summary-spec.md
creation_date: 2026-03-29
status: implemented
implemented_date: 2026-07-05
---

# Overview — Financial Summary Panel — Implementation Plan

> **For Claude:** Use `/execute-plan overview-financial-summary` to implement this plan task-by-task.

**Goal:** Replace the Overview page's empty right-panel default state with a Financial Summary Panel showing net worth, four waterfall tier totals, and trend sparklines powered by daily auto-snapshots.
**Spec:** `docs/4. planning/overview-financial-summary/overview-financial-summary-spec.md`
**Architecture:** No DB migration. Three backend changes: `snapshotService.ensureTodayAutoSnapshot` (upserts today's auto-snapshot, fire-and-forget via `onResponse` hook on all waterfall mutations), `snapshotService.getFinancialSummary` (new `GET /api/waterfall/financial-summary` endpoint returning current figures + sparkline series), and `AuthorizationError` guards on snapshot `PATCH`/`DELETE` for `isAuto: true` snapshots. Frontend: `useFinancialSummary` query drives four new components (`SummarySparkline`, `TierSummaryCard`, `NetWorthCard`, `FinancialSummaryPanel`) that replace the `analytics-placeholder` in `OverviewPage`.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: no

## Pre-conditions

- [ ] `Snapshot` model with `isAuto: Boolean` and unique constraint `[householdId, name]` exists in Prisma schema
- [ ] `WealthAccountHistory` model with relation to `WealthAccount` (via `wealthAccountId`) exists
- [ ] `waterfallService.getWaterfallSummary(householdId)` exists and returns `WaterfallSummary`
- [ ] `toGBP` utility exported from `@finplan/shared`
- [ ] Recharts `^2.15.4` and Framer Motion `^11.15.0` installed in `apps/frontend`

## Tasks

---

### Task 1: Shared — FinancialSummarySchema + index export

**Files:**

- Modify: `packages/shared/src/schemas/snapshot.schemas.ts`
- Create: `packages/shared/src/schemas/snapshot.schemas.test.ts`
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/snapshot.schemas.test.ts
import { describe, it, expect } from "bun:test";
import { FinancialSummarySchema } from "./snapshot.schemas";

describe("FinancialSummarySchema", () => {
  it("accepts a valid summary with null net worth", () => {
    const result = FinancialSummarySchema.safeParse({
      current: { netWorth: null, income: 5000, committed: 1200, discretionary: 800, surplus: 3000 },
      sparklines: { netWorth: [], income: [], committed: [], discretionary: [], surplus: [] },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a summary with sparkline data points", () => {
    const result = FinancialSummarySchema.safeParse({
      current: {
        netWorth: 45000,
        income: 5000,
        committed: 1200,
        discretionary: 800,
        surplus: 3000,
      },
      sparklines: {
        netWorth: [{ date: "2026-01-15", value: 44000 }],
        income: [{ date: "2026-01-01", value: 4800 }],
        committed: [],
        discretionary: [],
        surplus: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing sparklines section", () => {
    const result = FinancialSummarySchema.safeParse({
      current: { netWorth: null, income: 5000, committed: 1200, discretionary: 800, surplus: 3000 },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshot.schemas`
Expected: FAIL — "FinancialSummarySchema is not exported from './snapshot.schemas'"

- [ ] **Step 3: Write minimal implementation**

Replace `packages/shared/src/schemas/snapshot.schemas.ts`:

```typescript
import { z } from "zod";

export const createSnapshotSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  isAuto: z.boolean().optional(),
});

export const renameSnapshotSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

export const SparklinePointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

export const FinancialSummarySchema = z.object({
  current: z.object({
    netWorth: z.number().nullable(),
    income: z.number(),
    committed: z.number(),
    discretionary: z.number(),
    surplus: z.number(),
  }),
  sparklines: z.object({
    netWorth: z.array(SparklinePointSchema),
    income: z.array(SparklinePointSchema),
    committed: z.array(SparklinePointSchema),
    discretionary: z.array(SparklinePointSchema),
    surplus: z.array(SparklinePointSchema),
  }),
});

export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;
export type RenameSnapshotInput = z.infer<typeof renameSnapshotSchema>;
export type SparklinePoint = z.infer<typeof SparklinePointSchema>;
export type FinancialSummary = z.infer<typeof FinancialSummarySchema>;
```

Add to the snapshot section in `packages/shared/src/schemas/index.ts` (replace existing snapshot export block):

```typescript
// Snapshot schemas and types
export {
  createSnapshotSchema,
  renameSnapshotSchema,
  FinancialSummarySchema,
  SparklinePointSchema,
  type CreateSnapshotInput,
  type RenameSnapshotInput,
  type FinancialSummary,
  type SparklinePoint,
} from "./snapshot.schemas";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshot.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/snapshot.schemas.ts packages/shared/src/schemas/snapshot.schemas.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add FinancialSummarySchema and SparklinePoint types"
```

---

### Task 2: snapshotService — new methods + isAuto guards

**Files:**

- Modify: `apps/backend/src/services/snapshot.service.ts`
- Modify: `apps/backend/src/routes/snapshots.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/routes/snapshots.routes.test.ts`:

1. Add `AuthorizationError` to the top import:

```typescript
import { AuthenticationError, AuthorizationError } from "../utils/errors";
```

2. Add new describe blocks at the end of the file:

```typescript
describe("PATCH /api/snapshots/:id — auto-snapshot protection", () => {
  it("returns 403 when patching an auto-snapshot", async () => {
    snapshotServiceMock.renameSnapshot.mockRejectedValue(
      new AuthorizationError("Auto-snapshots cannot be renamed")
    );
    const res = await app.inject({
      method: "PATCH",
      url: "/api/snapshots/snap-auto",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /api/snapshots/:id — auto-snapshot protection", () => {
  it("returns 403 when deleting an auto-snapshot", async () => {
    snapshotServiceMock.deleteSnapshot.mockRejectedValue(
      new AuthorizationError("Auto-snapshots cannot be deleted")
    );
    const res = await app.inject({
      method: "DELETE",
      url: "/api/snapshots/snap-auto",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshots.routes`
Expected: FAIL — `AuthorizationError` not yet imported in test file (TypeScript error)

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/services/snapshot.service.ts` in full:

```typescript
import { prisma } from "../config/database.js";
import { NotFoundError, ConflictError, AuthorizationError } from "../utils/errors.js";
import { waterfallService } from "./waterfall.service.js";
import { toGBP } from "@finplan/shared";
import type { CreateSnapshotInput, RenameSnapshotInput, FinancialSummary } from "@finplan/shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildNetWorthSeries(
  householdId: string
): Promise<Array<{ date: string; value: number }>> {
  const history = await prisma.wealthAccountHistory.findMany({
    where: { wealthAccount: { householdId } },
    orderBy: { valuationDate: "asc" },
    select: { wealthAccountId: true, balance: true, valuationDate: true },
  });

  const accountBalances = new Map<string, number>();
  const dateMap = new Map<string, number>();

  for (const entry of history) {
    accountBalances.set(entry.wealthAccountId, entry.balance);
    const dateKey = entry.valuationDate.toISOString().slice(0, 10);
    const total = Array.from(accountBalances.values()).reduce((s, v) => s + v, 0);
    dateMap.set(dateKey, total);
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

function buildTierSeries(snapshots: Array<{ data: unknown; createdAt: Date }>) {
  type Point = { date: string; value: number };
  const income: Point[] = [];
  const committed: Point[] = [];
  const discretionary: Point[] = [];
  const surplus: Point[] = [];

  for (const snap of snapshots) {
    const d = snap.data as Record<string, any>;
    const date = snap.createdAt.toISOString().slice(0, 10);
    if (d?.income?.total !== undefined) income.push({ date, value: d.income.total as number });
    if (d?.committed !== undefined) {
      const ct =
        ((d.committed.monthlyTotal as number) ?? 0) + ((d.committed.monthlyAvg12 as number) ?? 0);
      committed.push({ date, value: ct });
    }
    if (d?.discretionary?.total !== undefined)
      discretionary.push({ date, value: d.discretionary.total as number });
    if (d?.surplus?.amount !== undefined) surplus.push({ date, value: d.surplus.amount as number });
  }

  return { income, committed, discretionary, surplus };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const snapshotService = {
  async listSnapshots(householdId: string) {
    return prisma.snapshot.findMany({
      where: { householdId },
      select: { id: true, name: true, isAuto: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async getSnapshot(householdId: string, id: string) {
    const snapshot = await prisma.snapshot.findUnique({ where: { id } });
    if (!snapshot || snapshot.householdId !== householdId) {
      throw new NotFoundError("Snapshot not found");
    }
    return snapshot;
  },

  async createSnapshot(householdId: string, input: CreateSnapshotInput) {
    const data = await waterfallService.getWaterfallSummary(householdId);
    try {
      return await prisma.snapshot.create({
        data: {
          householdId,
          name: input.name,
          isAuto: input.isAuto ?? false,
          data: data as object,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A snapshot with that name already exists");
      }
      throw err;
    }
  },

  async renameSnapshot(householdId: string, id: string, input: RenameSnapshotInput) {
    const snapshot = await prisma.snapshot.findUnique({ where: { id } });
    if (!snapshot || snapshot.householdId !== householdId) {
      throw new NotFoundError("Snapshot not found");
    }
    if (snapshot.isAuto) {
      throw new AuthorizationError("Auto-snapshots cannot be renamed");
    }
    try {
      return await prisma.snapshot.update({ where: { id }, data: { name: input.name } });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A snapshot with that name already exists");
      }
      throw err;
    }
  },

  async deleteSnapshot(householdId: string, id: string) {
    const snapshot = await prisma.snapshot.findUnique({ where: { id } });
    if (!snapshot || snapshot.householdId !== householdId) {
      throw new NotFoundError("Snapshot not found");
    }
    if (snapshot.isAuto) {
      throw new AuthorizationError("Auto-snapshots cannot be deleted");
    }
    await prisma.snapshot.delete({ where: { id } });
  },

  async ensureJan1Snapshot(householdId: string, now: Date = new Date()) {
    const today = now;
    if (today.getMonth() !== 0 || today.getDate() !== 1) return;

    const year = today.getFullYear();
    const autoName = `January ${year} — Auto`;
    const exists = await prisma.snapshot.findUnique({
      where: { householdId_name: { householdId, name: autoName } },
    });
    if (!exists) {
      await snapshotService.createSnapshot(householdId, { name: autoName, isAuto: true });
    }
  },

  async ensureTodayAutoSnapshot(householdId: string, now: Date = new Date()) {
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const name = `auto:${dateKey}`;
    const data = await waterfallService.getWaterfallSummary(householdId);
    await prisma.snapshot.upsert({
      where: { householdId_name: { householdId, name } },
      create: { householdId, name, isAuto: true, data: data as object },
      update: { data: data as object },
    });
  },

  async getFinancialSummary(householdId: string): Promise<FinancialSummary> {
    const [summary, autoSnapshots, wealthAccountCount] = await Promise.all([
      waterfallService.getWaterfallSummary(householdId),
      prisma.snapshot.findMany({
        where: { householdId, isAuto: true },
        orderBy: { createdAt: "asc" },
        select: { data: true, createdAt: true },
      }),
      prisma.wealthAccount.count({ where: { householdId } }),
    ]);

    let netWorth: number | null = null;
    let netWorthSeries: Array<{ date: string; value: number }> = [];

    if (wealthAccountCount > 0) {
      const accounts = await prisma.wealthAccount.findMany({
        where: { householdId, isTrust: false },
        select: { balance: true },
      });
      netWorth = toGBP(accounts.reduce((s, a) => s + a.balance, 0));
      netWorthSeries = await buildNetWorthSeries(householdId);
    }

    const tierSeries = buildTierSeries(autoSnapshots);

    return {
      current: {
        netWorth,
        income: summary.income.total,
        committed: toGBP(summary.committed.monthlyTotal + summary.committed.monthlyAvg12),
        discretionary: summary.discretionary.total,
        surplus: summary.surplus.amount,
      },
      sparklines: {
        netWorth: netWorthSeries,
        income: tierSeries.income,
        committed: tierSeries.committed,
        discretionary: tierSeries.discretionary,
        surplus: tierSeries.surplus,
      },
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshots.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/snapshot.service.ts apps/backend/src/routes/snapshots.routes.test.ts
git commit -m "feat(snapshot): add financial summary, auto-snapshot upsert, and isAuto guards"
```

---

### Task 3: Waterfall routes — financial-summary endpoint + auto-snapshot hook

**Files:**

- Modify: `apps/backend/src/routes/waterfall.routes.ts`
- Modify: `apps/backend/src/routes/waterfall.routes.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/backend/src/routes/waterfall.routes.test.ts`:

1. Replace `snapshotServiceMock` with an updated version that includes the new methods:

```typescript
const snapshotServiceMock = {
  ensureJan1Snapshot: mock(() => Promise.resolve()),
  ensureTodayAutoSnapshot: mock(() => Promise.resolve()),
  getFinancialSummary: mock(() =>
    Promise.resolve({
      current: { netWorth: null, income: 5000, committed: 1300, discretionary: 800, surplus: 2900 },
      sparklines: { netWorth: [], income: [], committed: [], discretionary: [], surplus: [] },
    })
  ),
};
```

2. Add new describe blocks (append to the end of the test file):

```typescript
describe("GET /api/waterfall/financial-summary", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/financial-summary",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with financial summary shape", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/financial-summary",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current).toBeDefined();
    expect(body.sparklines).toBeDefined();
    expect(snapshotServiceMock.getFinancialSummary.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("POST /api/waterfall/income — auto-snapshot hook", () => {
  it("triggers ensureTodayAutoSnapshot after a successful mutation", async () => {
    snapshotServiceMock.ensureTodayAutoSnapshot.mockClear();
    waterfallServiceMock.createIncome.mockResolvedValue(mockIncomeSource as any);
    await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Salary", amount: 5000, frequency: "monthly", subcategoryId: "sub-1" },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(snapshotServiceMock.ensureTodayAutoSnapshot.mock.calls.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: FAIL — `GET /api/waterfall/financial-summary` returns 404; auto-snapshot test shows 0 calls

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/routes/waterfall.routes.ts`:

1. Add `onResponse` hook at the start of the `waterfallRoutes` function body (before any route definitions):

```typescript
// At the top of the waterfallRoutes function, before any fastify.get/post/patch/delete:
fastify.addHook("onResponse", async (request, reply) => {
  if (
    ["POST", "PATCH", "DELETE"].includes(request.method) &&
    reply.statusCode < 300 &&
    request.householdId
  ) {
    snapshotService.ensureTodayAutoSnapshot(request.householdId).catch(() => {});
  }
});
```

2. Add `GET /financial-summary` route immediately after the `GET /cashflow` route (around line 39):

```typescript
fastify.get("/financial-summary", pre, async (req, reply) => {
  const summary = await snapshotService.getFinancialSummary(req.householdId!);
  return reply.send(summary);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/waterfall.routes.ts apps/backend/src/routes/waterfall.routes.test.ts
git commit -m "feat(waterfall): add financial-summary endpoint and daily auto-snapshot hook"
```

---

### Task 4: Frontend service method + useFinancialSummary hook

**Files:**

- Modify: `apps/frontend/src/services/waterfall.service.ts`
- Modify: `apps/frontend/src/hooks/useWaterfall.ts`

- [ ] **Step 1: Write the failing test**

Run: `bun run type-check`
Expected: FAIL — `FinancialSummary` type not resolved; `getFinancialSummary` missing from service; `useFinancialSummary` not exported from hook

- [ ] **Step 2: Run type-check to verify it fails**

Run: `bun run type-check`
Expected: TypeScript errors (the type and function don't exist yet)

- [ ] **Step 3: Write minimal implementation**

Add to `apps/frontend/src/services/waterfall.service.ts`:

At the top, add to existing imports:

```typescript
import type { FinancialSummary } from "@finplan/shared";
```

Add to `waterfallService` object (after the last existing method):

```typescript
  getFinancialSummary: () =>
    apiClient.get<FinancialSummary>("/api/waterfall/financial-summary"),
```

Update `apps/frontend/src/hooks/useWaterfall.ts`:

1. Add `financialSummary` to `WATERFALL_KEYS`:

```typescript
export const WATERFALL_KEYS = {
  summary: ["waterfall", "summary"] as const,
  cashflow: (year: number) => ["waterfall", "cashflow", year] as const,
  history: (type: string, id: string) => ["waterfall", "history", type, id] as const,
  subcategories: (tier: string) => ["waterfall", "subcategories", tier] as const,
  financialSummary: ["waterfall", "financial-summary"] as const,
};
```

2. Add the new query hook (after `useWaterfallSummary`):

```typescript
export function useFinancialSummary() {
  return useQuery({
    queryKey: WATERFALL_KEYS.financialSummary,
    queryFn: waterfallService.getFinancialSummary,
  });
}
```

3. Add `financialSummary` invalidation to every mutation's `onSuccess`. In each of these hooks — `useConfirmItem`, `useUpdateItem`, `useCreateItem`, `useConfirmWaterfallItem`, `useDeleteItem`, `useTierUpdateItem`, `useEndIncome` — add alongside the existing `summary` invalidation:

```typescript
void queryClient.invalidateQueries({ queryKey: WATERFALL_KEYS.financialSummary });
```

- [ ] **Step 4: Run type-check to verify it passes**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/waterfall.service.ts apps/frontend/src/hooks/useWaterfall.ts
git commit -m "feat(frontend): add useFinancialSummary hook and financial-summary service method"
```

---

### Task 5: SummarySparkline component

**Files:**

- Create: `apps/frontend/src/components/overview/SummarySparkline.tsx`

- [ ] **Step 1: Write the failing test**

Run: `bun run type-check` (after importing in the next task)
Expected: component file doesn't exist yet — verify with a quick check that the path is empty.

- [ ] **Step 2: Verify absence**

The file `apps/frontend/src/components/overview/SummarySparkline.tsx` does not yet exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/components/overview/SummarySparkline.tsx
import { useId } from "react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";

interface SummarySparklineProps {
  data: Array<{ date: string; value: number }>;
  color: string;
  currentValue?: number;
  paddingX?: number;
}

export function SummarySparkline({
  data,
  color,
  currentValue = 0,
  paddingX = 0,
}: SummarySparklineProps) {
  const id = useId();
  const gradientId = `sg-${id.replace(/:/g, "")}`;

  const chartData =
    data.length >= 2
      ? data
      : [
          { date: "start", value: currentValue },
          { date: "end", value: currentValue },
        ];

  const values = chartData.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const yMin = min - range * 0.1;
  const yMax = max + range * 0.15;

  return (
    <div style={{ marginLeft: paddingX, marginRight: paddingX }}>
      <ResponsiveContainer width="100%" height={40}>
        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[yMin, yMax]} hide />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Run type-check to verify it passes**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/SummarySparkline.tsx
git commit -m "feat(ui): add SummarySparkline component"
```

---

### Task 6: TierSummaryCard + NetWorthCard

**Files:**

- Create: `apps/frontend/src/components/overview/TierSummaryCard.tsx`
- Create: `apps/frontend/src/components/overview/NetWorthCard.tsx`

- [ ] **Step 1: Write the failing test**

Run: `bun run type-check`
Expected: FAIL — importing these in FinancialSummaryPanel (next task) will fail if files don't exist

- [ ] **Step 2: Verify absence**

Files `TierSummaryCard.tsx` and `NetWorthCard.tsx` do not exist under `apps/frontend/src/components/overview/`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/components/overview/TierSummaryCard.tsx
import type { SparklinePoint } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { SummarySparkline } from "./SummarySparkline";

const TIER_COLORS = {
  income: "#0ea5e9",
  committed: "#6366f1",
  discretionary: "#a855f7",
  surplus: "#4adcd0",
} as const;

const TIER_LABELS = {
  income: "INCOME",
  committed: "COMMITTED",
  discretionary: "DISCRETIONARY",
  surplus: "SURPLUS",
} as const;

interface TierSummaryCardProps {
  tier: keyof typeof TIER_COLORS;
  amount: number;
  sparklineData: SparklinePoint[];
}

export function TierSummaryCard({ tier, amount, sparklineData }: TierSummaryCardProps) {
  const color = TIER_COLORS[tier];

  return (
    <div
      className="rounded-xl py-4"
      style={{ background: "#0d1120", border: "1px solid #1a1f35" }}
    >
      <p
        className="text-center mb-2"
        style={{
          color,
          fontSize: "13px",
          fontFamily: "var(--font-heading, 'Outfit', sans-serif)",
          fontWeight: 600,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
        }}
      >
        {TIER_LABELS[tier]}
      </p>
      <p
        className="text-center mb-3 tabular-nums"
        style={{
          color: "rgba(238,242,255,0.92)",
          fontSize: "19px",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
        }}
      >
        {formatCurrency(amount)}
      </p>
      <SummarySparkline
        data={sparklineData}
        color={color}
        currentValue={amount}
        paddingX={14}
      />
    </div>
  );
}
```

```typescript
// apps/frontend/src/components/overview/NetWorthCard.tsx
import type { SparklinePoint } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { SummarySparkline } from "./SummarySparkline";

interface NetWorthCardProps {
  netWorth: number | null;
  sparklineData: SparklinePoint[];
}

export function NetWorthCard({ netWorth, sparklineData }: NetWorthCardProps) {
  return (
    <div
      className="rounded-xl pt-5 pb-4 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.05) 100%)",
        border: "1px solid rgba(99,102,241,0.1)",
      }}
    >
      <p
        className="text-center mb-2"
        style={{
          color: "rgba(238,242,255,0.65)",
          fontSize: "13px",
          fontFamily: "var(--font-heading, 'Outfit', sans-serif)",
          fontWeight: 600,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
        }}
      >
        NET WORTH
      </p>
      <p
        className="text-center tabular-nums"
        style={{
          color: "rgba(238,242,255,0.92)",
          fontSize: "36px",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
          lineHeight: 1.1,
        }}
      >
        {netWorth !== null ? formatCurrency(netWorth) : "£\u2014"}
      </p>
      {netWorth !== null && (
        <div className="mt-3">
          <SummarySparkline
            data={sparklineData}
            color="#818cf8"
            currentValue={netWorth}
            paddingX={0}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run type-check to verify it passes**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/TierSummaryCard.tsx apps/frontend/src/components/overview/NetWorthCard.tsx
git commit -m "feat(ui): add TierSummaryCard and NetWorthCard components"
```

---

### Task 7: FinancialSummaryPanel + OverviewPage wiring

**Files:**

- Create: `apps/frontend/src/components/overview/FinancialSummaryPanel.tsx`
- Modify: `apps/frontend/src/pages/OverviewPage.tsx`
- Modify: `apps/frontend/src/pages/OverviewPage.navigation.test.tsx`

- [ ] **Step 1: Write the failing test**

In `apps/frontend/src/pages/OverviewPage.navigation.test.tsx`:

1. Add `useFinancialSummary` to the existing `mock.module("@/hooks/useWaterfall", ...)` block:

```typescript
mock.module("@/hooks/useWaterfall", () => ({
  useWaterfallSummary: () => ({
    // ... existing mock ...
  }),
  useItemHistory: () => ({ data: undefined, isLoading: false }),
  useConfirmItem: () => ({ mutate: () => {}, isPending: false }),
  useUpdateItem: () => ({ mutate: () => {}, isPending: false }),
  useEndIncome: () => ({ mutate: () => {}, isPending: false }),
  useCashflow: () => ({ data: undefined, isLoading: false }),
  useFinancialSummary: () => ({
    data: undefined,
    isLoading: true,
    isError: false,
    refetch: () => {},
  }),
}));
```

2. Replace the analytics-placeholder describe block:

```typescript
// Replace:
describe("OverviewPage — analytics placeholder", () => {
  it("shows analytics placeholder in right panel by default", () => {
    renderWithProviders(<OverviewPage />, { initialEntries: ["/overview"] });
    expect(screen.getByTestId("analytics-placeholder")).toBeTruthy();
  });
});

// With:
describe("OverviewPage — financial summary panel", () => {
  it("shows financial summary panel in right panel by default", () => {
    renderWithProviders(<OverviewPage />, { initialEntries: ["/overview"] });
    expect(screen.getByTestId("financial-summary-panel")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test OverviewPage.navigation`
Expected: FAIL — `data-testid="financial-summary-panel"` not found (analytics placeholder still rendered)

- [ ] **Step 3: Write minimal implementation**

Create `apps/frontend/src/components/overview/FinancialSummaryPanel.tsx`:

```typescript
import { motion, useReducedMotion } from "framer-motion";
import { useFinancialSummary } from "@/hooks/useWaterfall";
import { NetWorthCard } from "./NetWorthCard";
import { TierSummaryCard } from "./TierSummaryCard";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 1, 0.5, 1] as const },
  },
};

const cardVariantsReduced = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

function SkeletonCard({ large = false }: { large?: boolean }) {
  return (
    <div
      className="rounded-xl p-6 animate-pulse"
      style={{ background: "#0d1120", border: "1px solid #1a1f35" }}
    >
      <div className="h-3 w-20 rounded bg-white/10 mx-auto mb-3" />
      <div
        className={`${large ? "h-9 w-32" : "h-5 w-24"} rounded bg-white/10 mx-auto mb-3`}
      />
      <div className="h-10 w-full rounded bg-white/10" />
    </div>
  );
}

export function FinancialSummaryPanel() {
  const shouldReduce = useReducedMotion();
  const { data, isLoading, isError, refetch } = useFinancialSummary();

  const cv = shouldReduce ? cardVariantsReduced : cardVariants;

  if (isLoading) {
    return (
      <div
        data-testid="financial-summary-panel"
        className="flex flex-col items-center justify-start h-full overflow-y-auto py-8"
      >
        <div className="flex flex-col gap-3 w-[62%]">
          <SkeletonCard large />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        data-testid="financial-summary-panel"
        className="flex h-full items-center justify-center"
      >
        <div className="text-center">
          <p className="text-sm text-foreground/40 mb-2">Could not load summary</p>
          <button
            onClick={() => void refetch()}
            className="text-xs text-foreground/30 hover:text-foreground/50 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      data-testid="financial-summary-panel"
      className="flex flex-col items-center justify-start h-full overflow-y-auto py-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="flex flex-col gap-3 w-[62%]">
        <motion.div variants={cv}>
          <NetWorthCard
            netWorth={data.current.netWorth}
            sparklineData={data.sparklines.netWorth}
          />
        </motion.div>
        <motion.div variants={cv}>
          <TierSummaryCard
            tier="income"
            amount={data.current.income}
            sparklineData={data.sparklines.income}
          />
        </motion.div>
        <motion.div variants={cv}>
          <TierSummaryCard
            tier="committed"
            amount={data.current.committed}
            sparklineData={data.sparklines.committed}
          />
        </motion.div>
        <motion.div variants={cv}>
          <TierSummaryCard
            tier="discretionary"
            amount={data.current.discretionary}
            sparklineData={data.sparklines.discretionary}
          />
        </motion.div>
        <motion.div variants={cv}>
          <TierSummaryCard
            tier="surplus"
            amount={data.current.surplus}
            sparklineData={data.sparklines.surplus}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
```

Update `apps/frontend/src/pages/OverviewPage.tsx`:

1. Add import (alongside other overview component imports):

```typescript
import { FinancialSummaryPanel } from "@/components/overview/FinancialSummaryPanel";
```

2. Replace the `else` branch at lines 135–147 (the analytics placeholder):

```typescript
// Before:
} else {
  right = (
    <div
      data-testid="analytics-placeholder"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p className="text-sm font-medium text-foreground/40">Analytics</p>
      <p className="max-w-xs text-xs text-foreground/25">
        Spending trends and cashflow analytics will be available here in a future update.
      </p>
    </div>
  );
}

// After:
} else {
  right = <FinancialSummaryPanel />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test OverviewPage.navigation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/FinancialSummaryPanel.tsx apps/frontend/src/pages/OverviewPage.tsx apps/frontend/src/pages/OverviewPage.navigation.test.tsx
git commit -m "feat(overview): replace analytics placeholder with FinancialSummaryPanel"
```

---

## Testing

### Backend Tests

- [ ] Service: `ensureTodayAutoSnapshot` upserts `Snapshot` with name `auto:YYYY-MM-DD` and `isAuto: true`; calling again on same day overwrites `data`
- [ ] Service: `getFinancialSummary` returns `netWorth: null` when no `WealthAccount` records exist for household
- [ ] Service: `getFinancialSummary` returns tier sparklines parsed from auto-snapshot `data` JSON
- [ ] Service: `renameSnapshot` throws `AuthorizationError` (403) for `isAuto: true` snapshot
- [ ] Service: `deleteSnapshot` throws `AuthorizationError` (403) for `isAuto: true` snapshot
- [ ] Endpoint: `GET /api/waterfall/financial-summary` returns 401 without JWT
- [ ] Endpoint: `GET /api/waterfall/financial-summary` returns 200 with `{ current, sparklines }` shape
- [ ] Endpoint: `PATCH /api/snapshots/:id` returns 403 when service throws `AuthorizationError`
- [ ] Endpoint: `DELETE /api/snapshots/:id` returns 403 when service throws `AuthorizationError`
- [ ] Hook: `POST /api/waterfall/income` triggers `ensureTodayAutoSnapshot` after 201 response

### Frontend Tests

- [ ] Component: `FinancialSummaryPanel` renders `data-testid="financial-summary-panel"` in loading state
- [ ] Component: `NetWorthCard` renders `£—` (no sparkline) when `netWorth === null`
- [ ] Component: `SummarySparkline` renders without error when `data` has 0 or 1 items (flat line)
- [ ] Hook: `useFinancialSummary` invalidated alongside waterfall `summary` on mutations

### Key Scenarios

- [ ] Happy path: open Overview → right panel shows financial summary panel with net worth + 4 tier cards
- [ ] No history: all sparklines render flat horizontal lines; current values display correctly
- [ ] No wealth accounts: net worth shows `£—`, no sparkline; tier cards unaffected
- [ ] Mutation: update an income source → financial summary re-fetches and current income value updates
- [ ] isAuto guard: attempting to rename or delete a `auto:*` snapshot returns 403

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `cd apps/backend && bun scripts/run-tests.ts snapshot` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts waterfall.routes` passes
- [ ] `cd apps/frontend && bun test OverviewPage.navigation` passes
- [ ] Manual: Open Overview page → financial summary panel appears with 5 cards; sparklines render (or flat lines on a fresh install); make a waterfall mutation → card values update on re-fetch

## Post-conditions

- [ ] Auto-snapshots accumulate daily for each household that makes waterfall changes
- [ ] `refine-snapshot-timeline` feature has auto-snapshot data (`isAuto: true`) to distinguish from review snapshots
- [ ] `financialSummary` query key established in `WATERFALL_KEYS` — available for deeper integration in `financial-forecast`
