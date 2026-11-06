---
feature: isa-allowance-indicator
category: surplus
spec: docs/4. planning/isa-allowance-indicator/isa-allowance-indicator-spec.md
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# ISA Allowance Indicator — Implementation Plan

> **For Claude:** Use `/execute-plan isa-allowance-indicator` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Add per-Member ISA allowance bars (with forecast) to the Savings right panel, plus an "Is ISA?" toggle on the Account form, an over-forecast nudge, the existing amber row dot triggered by ISA over-forecast, and a "new tax year" banner on the ISA AccountDetailPanel.

**Spec:** `docs/4. planning/isa-allowance-indicator/isa-allowance-indicator-spec.md`

**Architecture:** Two new fields on `Account` (`isISA`, `isaYearContribution`). A pure forecast utility counts scheduled occurrences of linked `DiscretionaryItem`s between today and 5 April; a new `getIsaAllowanceSummary` service method aggregates by Member. Frontend renders the indicator inside the existing `AccountItemArea` for Savings, alongside small extensions to `AccountForm`, `AssetAccountRow`, and `AccountDetailPanel`. No new external dependencies.

**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind

**Infrastructure Impact:**

- Touches `packages/shared/`: yes (extending `assets.schemas.ts`, adding ISA summary response schema)
- Requires DB migration: yes (`add_account_isa_fields`)

## Pre-conditions

- [ ] PR #45 (member-attribution) merged — `Account.memberId` references `Member.id`
- [ ] `HouseholdSettings.isaAnnualLimit` exists (already in schema, default 20000)
- [ ] `NudgeCard` component exists at `apps/frontend/src/components/common/NudgeCard.tsx`. **Note:** if `NudgeCard` does not currently forward arbitrary props (e.g. `data-testid`), tests in this plan select via text content instead — no plan dependency on prop-forwarding.
- [ ] `SkeletonLoader`, `PanelError`, `StaleDataBanner` all exist under `apps/frontend/src/components/common/`
- [ ] Amber-dot column lives in `AccountItemArea.tsx` (around line 126) — Task 14 modifies that file, **not** `AssetAccountRow.tsx`. The existing trigger expression is `const showDot = stale || hasLimitNudge;` where `hasLimitNudge = a.isOverCap || a.hasSpareCapacityNudge`.
- [ ] Backend test helpers in `apps/backend/src/test/helpers/test-db.ts`: `createTestHousehold()` (no args, returns `{id, name}`), `seedScenario()`, `seedUser()`, `truncateAllTables()`, `assertTestEnvironment()`. **There is no `createTestMember`, `resetDb`, or `testActorCtx`.** Tests in this plan use `truncateAllTables()` for reset, create members directly via `prisma.member.create`, and build an `ActorCtx` inline with the existing pattern (see existing tests in `apps/backend/src/services/assets.service.test.ts` for the exact shape).
- [ ] Frontend test infrastructure: `bun:test` runner with happy-dom (`apps/frontend/src/test/setup.ts`). Test render helper at `apps/frontend/src/test/helpers/render.tsx` exports `renderWithProviders` (wraps with `QueryClientProvider` + `MemoryRouter`). MSW server at `apps/frontend/src/test/msw/server.ts` exports `server`; `http`/`HttpResponse` come from `msw` directly. Run command is `bun test`, not `bunx vitest`.

## Tasks

> Each task is one action (2–5 minutes), follows red-green-commit. Ordered: schema → shared → backend service utilities → backend service methods → routes → frontend.

---

### Task 1: Prisma Schema — `Account.isISA` and `Account.isaYearContribution`

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Run: `bun run db:migrate`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/__tests__/account-isa-fields.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { prisma } from "../../config/database.js";
import { createTestHousehold, truncateAllTables } from "../../test/helpers/test-db.js";

describe("Account ISA fields", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("persists isISA and isaYearContribution", async () => {
    const household = await createTestHousehold();
    const member = await prisma.member.create({
      data: { householdId: household.id, name: "Alice" },
    });
    const account = await prisma.account.create({
      data: {
        householdId: household.id,
        memberId: member.id,
        name: "Cash ISA",
        type: "Savings",
        isISA: true,
        isaYearContribution: 12400,
      },
    });
    expect(account.isISA).toBe(true);
    expect(account.isaYearContribution).toBe(12400);
  });

  it("defaults isISA to false and isaYearContribution to null", async () => {
    const household = await createTestHousehold();
    const account = await prisma.account.create({
      data: { householdId: household.id, name: "Current", type: "Current" },
    });
    expect(account.isISA).toBe(false);
    expect(account.isaYearContribution).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts account-isa-fields`
Expected: FAIL — "Unknown arg `isISA`" (Prisma type error)

- [ ] **Step 3: Add fields to schema and migrate**

In `apps/backend/prisma/schema.prisma`, add to `model Account` (just after `monthlyContributionLimit` if present, otherwise after `growthRatePct`):

```prisma
  isISA               Boolean          @default(false)
  isaYearContribution Float?
```

Then run:

```bash
bun run db:migrate
# Migration name: add_account_isa_fields
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts account-isa-fields`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/ apps/backend/src/services/__tests__/account-isa-fields.test.ts
git commit -m "feat(schema): add isISA and isaYearContribution to Account"
```

---

### Task 2: Shared Zod — extend account schemas with ISA fields + refinement

**Files:**

- Modify: `packages/shared/src/schemas/assets.schemas.ts`
- Test: `packages/shared/src/schemas/__tests__/assets.schemas.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/__tests__/assets.schemas.test.ts
import { describe, it, expect } from "bun:test";
import { createAccountSchema, updateAccountSchema } from "../assets.schemas";

describe("Account ISA validation", () => {
  it("accepts isISA=true with Savings type and memberId", () => {
    const r = createAccountSchema.safeParse({
      name: "Cash ISA",
      type: "Savings",
      memberId: "m1",
      isISA: true,
      isaYearContribution: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects isISA=true without memberId", () => {
    const r = createAccountSchema.safeParse({
      name: "Cash ISA",
      type: "Savings",
      memberId: null,
      isISA: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects isISA=true with non-Savings type", () => {
    const r = createAccountSchema.safeParse({
      name: "Cash ISA",
      type: "Current",
      memberId: "m1",
      isISA: true,
    });
    expect(r.success).toBe(false);
  });

  it("accepts isISA=false on any type", () => {
    const r = createAccountSchema.safeParse({
      name: "Current",
      type: "Current",
      isISA: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects negative isaYearContribution", () => {
    const r = createAccountSchema.safeParse({
      name: "Cash ISA",
      type: "Savings",
      memberId: "m1",
      isISA: true,
      isaYearContribution: -1,
    });
    expect(r.success).toBe(false);
  });

  it("update schema enforces same isa-requires-member rule", () => {
    const r = updateAccountSchema.safeParse({ isISA: true, memberId: null });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.schemas`
Expected: FAIL — refinement does not exist

- [ ] **Step 3: Modify the schemas**

In `packages/shared/src/schemas/assets.schemas.ts`, replace the existing `createAccountSchema` and `updateAccountSchema` blocks with:

```typescript
type IsaShape = {
  isISA?: boolean;
  memberId?: string | null;
  type?: "Current" | "Savings" | "Pension" | "StocksAndShares" | "Other";
};

function isaRefine(data: IsaShape): boolean {
  if (data.isISA !== true) return true;
  if (data.memberId == null) return false;
  // type may be absent on update payloads; if present it must be Savings
  if (data.type !== undefined && data.type !== "Savings") return false;
  return true;
}

const isaRefineMessage: { message: string; path: (string | number)[] } = {
  message: "ISA accounts must be Savings type and have a memberId assigned",
  path: ["isISA"],
};

export const createAccountSchema = z
  .object({
    name: z.string().min(1).max(100).trim(),
    type: accountTypeSchema,
    memberId: z.string().nullable().optional(),
    growthRatePct: z.number().min(0).max(100).nullable().optional(),
    monthlyContributionLimit: z.number().min(0).nullable().optional(),
    isCashflowLinked: z.boolean().optional(),
    initialValue: z.number().positive().optional(),
    isISA: z.boolean().optional(),
    isaYearContribution: z.number().min(0).nullable().optional(),
    ...disposalPair,
  })
  .refine(disposalRefine, disposalRefineMessage)
  .refine(isaRefine, isaRefineMessage);

export const updateAccountSchema = z
  .object({
    name: z.string().min(1).max(100).trim().optional(),
    memberId: z.string().nullable().optional(),
    growthRatePct: z.number().min(0).max(100).nullable().optional(),
    monthlyContributionLimit: z.number().min(0).nullable().optional(),
    isCashflowLinked: z.boolean().optional(),
    isISA: z.boolean().optional(),
    isaYearContribution: z.number().min(0).nullable().optional(),
    ...disposalPair,
  })
  .refine(disposalRefine, disposalRefineMessage)
  .refine(isaRefine, isaRefineMessage);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.schemas`
Expected: PASS (all 6)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/assets.schemas.ts packages/shared/src/schemas/__tests__/assets.schemas.test.ts
git commit -m "feat(shared): extend account schemas with ISA fields and refinement"
```

---

### Task 3: Shared Zod — IsaAllowanceSummary response schema

**Files:**

- Modify: `packages/shared/src/schemas/assets.schemas.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/__tests__/assets.schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas/__tests__/assets.schemas.test.ts`:

```typescript
import { isaAllowanceSummarySchema } from "../assets.schemas";

describe("IsaAllowanceSummary schema", () => {
  it("accepts a valid summary with members", () => {
    const r = isaAllowanceSummarySchema.safeParse({
      taxYearStart: "2026-04-06",
      taxYearEnd: "2027-04-05",
      daysRemaining: 200,
      annualLimit: 20000,
      byMember: [
        {
          memberId: "m1",
          name: "Alice",
          used: 12400,
          forecast: 5600,
          forecastedYearTotal: 18000,
          monthlyPlanned: 500,
          estimatedFlag: false,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty byMember array", () => {
    const r = isaAllowanceSummarySchema.safeParse({
      taxYearStart: "2026-04-06",
      taxYearEnd: "2027-04-05",
      daysRemaining: 200,
      annualLimit: 20000,
      byMember: [],
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.schemas`
Expected: FAIL — `isaAllowanceSummarySchema` not exported

- [ ] **Step 3: Add schema and export**

Append to `packages/shared/src/schemas/assets.schemas.ts`:

```typescript
export const isaMemberPositionSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  used: z.number().min(0),
  forecast: z.number().min(0),
  forecastedYearTotal: z.number().min(0),
  monthlyPlanned: z.number().min(0),
  estimatedFlag: z.boolean(),
});

export const isaAllowanceSummarySchema = z.object({
  taxYearStart: isoDateString,
  taxYearEnd: isoDateString,
  daysRemaining: z.number().int().min(0),
  annualLimit: z.number().min(0),
  byMember: z.array(isaMemberPositionSchema),
});

export type IsaMemberPosition = z.infer<typeof isaMemberPositionSchema>;
export type IsaAllowanceSummary = z.infer<typeof isaAllowanceSummarySchema>;
```

The `index.ts` already exports everything from `assets.schemas.ts` via `export * from "./schemas/assets.schemas"` — no change needed unless your `index.ts` uses named re-exports; in that case add `IsaAllowanceSummary` and `IsaMemberPosition`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/assets.schemas.ts packages/shared/src/schemas/__tests__/assets.schemas.test.ts
git commit -m "feat(shared): add IsaAllowanceSummary response schema"
```

---

### Task 4: Backend utility — tax-year window calculator

**Files:**

- Create: `apps/backend/src/utils/isa-tax-year.ts`
- Create: `apps/backend/src/utils/__tests__/isa-tax-year.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/utils/__tests__/isa-tax-year.test.ts
import { describe, it, expect } from "bun:test";
import { getIsaTaxYearWindow } from "../isa-tax-year.js";

describe("getIsaTaxYearWindow", () => {
  it("returns this year's 5 April when today is before that", () => {
    const w = getIsaTaxYearWindow(new Date("2026-02-15"));
    expect(w.start.toISOString().slice(0, 10)).toBe("2025-04-06");
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-04-05");
  });

  it("returns next year's 5 April when today is past 5 April", () => {
    const w = getIsaTaxYearWindow(new Date("2026-04-10"));
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-04-06");
    expect(w.end.toISOString().slice(0, 10)).toBe("2027-04-05");
  });

  it("treats 5 April itself as still inside this tax year", () => {
    const w = getIsaTaxYearWindow(new Date("2026-04-05"));
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-04-05");
  });

  it("computes daysRemaining as whole days from today to end", () => {
    const w = getIsaTaxYearWindow(new Date("2026-04-01"));
    expect(w.daysRemaining).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts isa-tax-year`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// apps/backend/src/utils/isa-tax-year.ts
export interface IsaTaxYearWindow {
  start: Date; // 6 April of the start year
  end: Date; // 5 April of the end year
  daysRemaining: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns the current UK ISA tax year window relative to `today`.
 *  Tax year runs 6 April → 5 April. If today is on or before 5 April, the
 *  window ends this calendar year; otherwise it ends next calendar year. */
export function getIsaTaxYearWindow(today: Date): IsaTaxYearWindow {
  const y = today.getUTCFullYear();
  const thisYearEnd = new Date(Date.UTC(y, 3, 5)); // April is month index 3
  const endYear = today.getTime() <= thisYearEnd.getTime() ? y : y + 1;
  const end = new Date(Date.UTC(endYear, 3, 5));
  const start = new Date(Date.UTC(endYear - 1, 3, 6));

  // Whole-day count from today (UTC midnight) to end (UTC midnight).
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysRemaining = Math.max(0, Math.round((end.getTime() - todayUTC) / MS_PER_DAY));

  return { start, end, daysRemaining };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts isa-tax-year`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/utils/isa-tax-year.ts apps/backend/src/utils/__tests__/isa-tax-year.test.ts
git commit -m "feat(backend): add ISA tax year window utility"
```

---

### Task 5: Backend utility — forecast contribution calculator

**Files:**

- Create: `apps/backend/src/utils/isa-forecast.ts`
- Create: `apps/backend/src/utils/__tests__/isa-forecast.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/utils/__tests__/isa-forecast.test.ts
import { describe, it, expect } from "bun:test";
import { forecastContribution, type ForecastInput } from "../isa-forecast.js";

const today = new Date("2026-08-01"); // mid-tax-year, ~248 days to 5 Apr 2027
const end = new Date("2027-04-05");

describe("forecastContribution", () => {
  it("monthly with dueDate counts occurrences in window", () => {
    const result = forecastContribution(
      [{ amount: 500, spendType: "monthly", dueDate: new Date("2026-08-15") }],
      today,
      end
    );
    // Aug 15 through Mar 15 inclusive = 8 occurrences
    expect(result.amount).toBeCloseTo(500 * 8, 5);
    expect(result.estimated).toBe(false);
  });

  it("yearly with dueDate inside window includes full amount", () => {
    const result = forecastContribution(
      [{ amount: 3000, spendType: "yearly", dueDate: new Date("2027-03-30") }],
      today,
      end
    );
    expect(result.amount).toBe(3000);
    expect(result.estimated).toBe(false);
  });

  it("yearly with dueDate outside window contributes 0", () => {
    const result = forecastContribution(
      [{ amount: 3000, spendType: "yearly", dueDate: new Date("2027-05-01") }],
      today,
      end
    );
    expect(result.amount).toBe(0);
    expect(result.estimated).toBe(false);
  });

  it("one_off with dueDate in window includes full amount", () => {
    const result = forecastContribution(
      [{ amount: 1000, spendType: "one_off", dueDate: new Date("2026-12-01") }],
      today,
      end
    );
    expect(result.amount).toBe(1000);
  });

  it("monthly without dueDate pro-rates and flags estimated", () => {
    const result = forecastContribution(
      [{ amount: 200, spendType: "monthly", dueDate: null }],
      today,
      end
    );
    // 8 whole months from Aug to Apr — implementation may use floor or round; assert range.
    expect(result.amount).toBeGreaterThanOrEqual(200 * 7);
    expect(result.amount).toBeLessThanOrEqual(200 * 9);
    expect(result.estimated).toBe(true);
  });

  it("yearly without dueDate contributes 0 and is not estimated", () => {
    const result = forecastContribution(
      [{ amount: 3000, spendType: "yearly", dueDate: null }],
      today,
      end
    );
    expect(result.amount).toBe(0);
    expect(result.estimated).toBe(false);
  });

  it("aggregates multiple items", () => {
    const result = forecastContribution(
      [
        { amount: 500, spendType: "monthly", dueDate: new Date("2026-08-15") },
        { amount: 3000, spendType: "yearly", dueDate: new Date("2027-03-30") },
      ],
      today,
      end
    );
    expect(result.amount).toBeCloseTo(500 * 8 + 3000, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts isa-forecast`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// apps/backend/src/utils/isa-forecast.ts
import type { SpendType } from "@prisma/client";

export interface ForecastInput {
  amount: number;
  spendType: SpendType;
  dueDate: Date | null;
}

export interface ForecastResult {
  amount: number;
  estimated: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Counts scheduled occurrences of a single item between today (inclusive) and
 *  end (inclusive) using `frequency` + `dueDate`. Returns the total contribution
 *  amount over that window. Falls back to time-pro-rating for monthly/weekly/quarterly
 *  items missing a dueDate; yearly/one_off without a dueDate contribute zero. */
export function forecastContribution(
  items: ForecastInput[],
  today: Date,
  end: Date
): ForecastResult {
  let total = 0;
  let estimated = false;

  for (const item of items) {
    const r = forecastSingle(item, today, end);
    total += r.amount;
    if (r.estimated) estimated = true;
  }

  return { amount: total, estimated };
}

function forecastSingle(item: ForecastInput, today: Date, end: Date): ForecastResult {
  const { amount, spendType, dueDate } = item;
  if (amount <= 0) return { amount: 0, estimated: false };

  if (dueDate == null) {
    return forecastWithoutDate(amount, spendType, today, end);
  }

  switch (spendType) {
    case "monthly":
      return { amount: amount * countMonthlyOccurrences(dueDate, today, end), estimated: false };
    case "weekly":
      return { amount: amount * countWeeklyOccurrences(dueDate, today, end), estimated: false };
    case "quarterly":
      return {
        amount: amount * countPeriodicOccurrences(dueDate, today, end, 3, "month"),
        estimated: false,
      };
    case "yearly":
    case "one_off":
      return {
        amount: dueDate >= today && dueDate <= end ? amount : 0,
        estimated: false,
      };
  }
}

function forecastWithoutDate(
  amount: number,
  spendType: SpendType,
  today: Date,
  end: Date
): ForecastResult {
  const days = Math.max(0, (end.getTime() - today.getTime()) / MS_PER_DAY);
  switch (spendType) {
    case "monthly":
      return { amount: amount * (days / 30.4375), estimated: true };
    case "weekly":
      return { amount: amount * (days / 7), estimated: true };
    case "quarterly":
      return { amount: amount * (days / 91.3125), estimated: true };
    case "yearly":
    case "one_off":
      return { amount: 0, estimated: false };
  }
}

/** Count same-day-of-month dates in [start, end] inclusive, anchored at base.day */
function countMonthlyOccurrences(base: Date, start: Date, end: Date): number {
  return countPeriodicOccurrences(base, start, end, 1, "month");
}

function countWeeklyOccurrences(base: Date, start: Date, end: Date): number {
  if (end < start) return 0;
  // Find first occurrence on or after start that aligns to base's weekday/date offset
  const baseTs = base.getTime();
  const startTs = start.getTime();
  const stepMs = 7 * MS_PER_DAY;
  const diff = startTs - baseTs;
  let firstTs: number;
  if (diff <= 0) {
    firstTs = baseTs;
  } else {
    const stepsBack = Math.ceil(diff / stepMs);
    firstTs = baseTs + stepsBack * stepMs;
  }
  if (firstTs > end.getTime()) return 0;
  return Math.floor((end.getTime() - firstTs) / stepMs) + 1;
}

function countPeriodicOccurrences(
  base: Date,
  start: Date,
  end: Date,
  step: number,
  unit: "month"
): number {
  if (end < start) return 0;
  // Walk forward from base in `step` units, counting occurrences in [start, end].
  let count = 0;
  const cursor = new Date(base.getTime());
  // Roll cursor backwards if it's after end (shouldn't happen in normal use, but safe)
  while (cursor > end) {
    cursor.setUTCMonth(cursor.getUTCMonth() - step);
  }
  // Roll cursor forward to first date >= start
  while (cursor < start) {
    cursor.setUTCMonth(cursor.getUTCMonth() + step);
  }
  while (cursor <= end) {
    count++;
    cursor.setUTCMonth(cursor.getUTCMonth() + step);
  }
  return count;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts isa-forecast`
Expected: PASS (7)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/utils/isa-forecast.ts apps/backend/src/utils/__tests__/isa-forecast.test.ts
git commit -m "feat(backend): add ISA forecast contribution calculator"
```

---

### Task 6: Backend service — `getIsaAllowanceSummary`

**Files:**

- Modify: `apps/backend/src/services/assets.service.ts` (add new method to `assetsService` object)
- Test: `apps/backend/src/services/__tests__/isa-allowance-summary.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/__tests__/isa-allowance-summary.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { prisma } from "../../config/database.js";
import { assetsService } from "../assets.service.js";
import { createTestHousehold, truncateAllTables } from "../../test/helpers/test-db.js";

async function makeMember(householdId: string, name: string) {
  return prisma.member.create({ data: { householdId, name } });
}

describe("getIsaAllowanceSummary", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("returns empty byMember when household has no ISA accounts", async () => {
    const household = await createTestHousehold();
    const summary = await assetsService.getIsaAllowanceSummary(
      household.id,
      new Date("2026-08-01")
    );
    expect(summary.byMember).toEqual([]);
    expect(summary.annualLimit).toBe(20000);
  });

  it("groups ISA accounts by member, alphabetical by name", async () => {
    const household = await createTestHousehold();
    const alice = await makeMember(household.id, "Alice");
    const bob = await makeMember(household.id, "Bob");

    await prisma.account.create({
      data: {
        householdId: household.id,
        memberId: alice.id,
        name: "Alice ISA",
        type: "Savings",
        isISA: true,
        isaYearContribution: 12400,
      },
    });
    await prisma.account.create({
      data: {
        householdId: household.id,
        memberId: bob.id,
        name: "Bob ISA",
        type: "Savings",
        isISA: true,
        isaYearContribution: 14000,
      },
    });

    const summary = await assetsService.getIsaAllowanceSummary(
      household.id,
      new Date("2026-08-01")
    );
    expect(summary.byMember).toHaveLength(2);
    expect(summary.byMember[0].name).toBe("Alice");
    expect(summary.byMember[0].used).toBe(12400);
    expect(summary.byMember[1].name).toBe("Bob");
    expect(summary.byMember[1].used).toBe(14000);
  });

  it("excludes non-ISA accounts and members with no ISAs", async () => {
    const household = await createTestHousehold();
    const member = await makeMember(household.id, "Solo");
    await prisma.account.create({
      data: {
        householdId: household.id,
        memberId: member.id,
        name: "Plain Savings",
        type: "Savings",
        isISA: false,
      },
    });
    const summary = await assetsService.getIsaAllowanceSummary(
      household.id,
      new Date("2026-08-01")
    );
    expect(summary.byMember).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts isa-allowance-summary`
Expected: FAIL — `assetsService.getIsaAllowanceSummary is not a function`

- [ ] **Step 3: Implement**

In `apps/backend/src/services/assets.service.ts`, add imports near the top:

```typescript
import { getIsaTaxYearWindow } from "../utils/isa-tax-year.js";
import { forecastContribution, type ForecastInput } from "../utils/isa-forecast.js";
```

Then add a new method to the `assetsService` object (after `confirmAccount`):

```typescript
  async getIsaAllowanceSummary(householdId: string, today: Date = new Date()) {
    const settings = await prisma.householdSettings.findUnique({ where: { householdId } });
    const annualLimit = settings?.isaAnnualLimit ?? 20000;
    const window = getIsaTaxYearWindow(today);

    const isaAccounts = await prisma.account.findMany({
      where: {
        householdId,
        isISA: true,
        type: "Savings",
        ...activeWhere(),
      },
      include: {
        member: { select: { id: true, name: true } },
        linkedItems: { select: { id: true, spendType: true, dueDate: true } },
      },
    });

    if (isaAccounts.length === 0) {
      return {
        taxYearStart: window.start.toISOString().slice(0, 10),
        taxYearEnd: window.end.toISOString().slice(0, 10),
        daysRemaining: window.daysRemaining,
        annualLimit,
        byMember: [],
      };
    }

    // Resolve current amounts for all linked items via ItemAmountPeriod (matches existing pattern).
    const allLinkedItemIds = isaAccounts.flatMap((a) => a.linkedItems.map((i) => i.id));
    const periods =
      allLinkedItemIds.length > 0
        ? await prisma.itemAmountPeriod.findMany({
            where: {
              itemType: "discretionary_item",
              itemId: { in: allLinkedItemIds },
              startDate: { lte: today },
              OR: [{ endDate: null }, { endDate: { gt: today } }],
            },
          })
        : [];
    const amountByItemId = new Map<string, number>();
    for (const p of periods) amountByItemId.set(p.itemId, p.amount);

    // Group by member.
    type Bucket = {
      memberId: string;
      name: string;
      used: number;
      forecastInputs: ForecastInput[];
    };
    const buckets = new Map<string, Bucket>();
    for (const a of isaAccounts) {
      if (!a.memberId || !a.member) continue; // guarded by Zod refinement, defensive here
      const b = buckets.get(a.memberId) ?? {
        memberId: a.memberId,
        name: a.member.name,
        used: 0,
        forecastInputs: [],
      };
      b.used += a.isaYearContribution ?? 0;
      for (const item of a.linkedItems) {
        b.forecastInputs.push({
          amount: amountByItemId.get(item.id) ?? 0,
          spendType: item.spendType,
          dueDate: item.dueDate,
        });
      }
      buckets.set(a.memberId, b);
    }

    const byMember = Array.from(buckets.values())
      .map((b) => {
        const f = forecastContribution(b.forecastInputs, today, window.end);
        const monthlyPlanned =
          f.amount > 0 && window.daysRemaining > 0
            ? (f.amount * 30.4375) / Math.max(1, window.daysRemaining)
            : 0;
        return {
          memberId: b.memberId,
          name: b.name,
          used: b.used,
          forecast: f.amount,
          forecastedYearTotal: b.used + f.amount,
          monthlyPlanned,
          estimatedFlag: f.estimated,
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name));

    return {
      taxYearStart: window.start.toISOString().slice(0, 10),
      taxYearEnd: window.end.toISOString().slice(0, 10),
      daysRemaining: window.daysRemaining,
      annualLimit,
      byMember,
    };
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts isa-allowance-summary`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/assets.service.ts apps/backend/src/services/__tests__/isa-allowance-summary.test.ts
git commit -m "feat(backend): add getIsaAllowanceSummary service method"
```

---

### Task 7: Backend route — `GET /api/accounts/isa-allowance`

**Files:**

- Modify: `apps/backend/src/routes/assets.routes.ts`
- Test: `apps/backend/src/routes/assets.routes.test.ts` (extend existing — file lives at the routes/ root, no `__tests__/` subdir)

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/routes/assets.routes.test.ts`:

```typescript
describe("GET /api/accounts/isa-allowance", () => {
  it("returns 401 without JWT", async () => {
    const res = await app.inject({ method: "GET", url: "/api/accounts/isa-allowance" });
    expect(res.statusCode).toBe(401);
  });

  it("returns the household's ISA allowance summary", async () => {
    const { token } = await createUserAndHousehold();
    const res = await app.inject({
      method: "GET",
      url: "/api/accounts/isa-allowance",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("annualLimit", 20000);
    expect(body).toHaveProperty("byMember");
    expect(Array.isArray(body.byMember)).toBe(true);
  });

  it("never exposes another household's ISA data", async () => {
    const { token: tokenA } = await createUserAndHousehold();
    const { household: householdB, member: memberB } = await createUserAndHousehold();
    await prisma.account.create({
      data: {
        householdId: householdB.id,
        memberId: memberB.id,
        name: "Other ISA",
        type: "Savings",
        isISA: true,
        isaYearContribution: 9999,
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/accounts/isa-allowance",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.byMember).toEqual([]);
  });
});
```

(Adapt `createUserAndHousehold` to whatever helper your existing test file uses.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.routes`
Expected: FAIL — 404 on the new path

- [ ] **Step 3: Add route**

In `apps/backend/src/routes/assets.routes.ts`, add **before** `fastify.get("/accounts/:type", ...)` (more specific path first):

```typescript
fastify.get("/accounts/isa-allowance", pre, async (req, reply) => {
  const summary = await assetsService.getIsaAllowanceSummary(req.householdId!);
  return reply.send(summary);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/assets.routes.ts apps/backend/src/routes/assets.routes.test.ts
git commit -m "feat(backend): GET /api/accounts/isa-allowance returns ISA summary"
```

---

### Task 8: Backend — extend `createAccount`/`updateAccount` to persist ISA fields

**Files:**

- Modify: `apps/backend/src/services/assets.service.ts`
- Test: `apps/backend/src/services/__tests__/account-isa-mutation.test.ts`

The existing `createAccount`/`updateAccount` use `...rest` after stripping `disposedAt`/`disposalAccountId`/`initialValue`. Verify Prisma accepts the new `isISA` and `isaYearContribution` fields automatically through the spread; if so, no service-layer code changes are needed beyond the schema/refinement done in Task 2.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/__tests__/account-isa-mutation.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { prisma } from "../../config/database.js";
import { assetsService } from "../assets.service.js";
import type { ActorCtx } from "../audit.service.js";
import { createTestHousehold, truncateAllTables } from "../../test/helpers/test-db.js";

const baseCtx: Omit<ActorCtx, "householdId"> = {
  actorId: "user-1",
  actorName: "Tester",
  ipAddress: "1.2.3.4",
  userAgent: "bun:test",
};

describe("Account ISA mutations", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("createAccount persists isISA and isaYearContribution", async () => {
    const household = await createTestHousehold();
    const member = await prisma.member.create({
      data: { householdId: household.id, name: "Alice" },
    });
    const acc = await assetsService.createAccount(
      household.id,
      {
        name: "Cash ISA",
        type: "Savings",
        memberId: member.id,
        isISA: true,
        isaYearContribution: 5000,
      },
      { ...baseCtx, householdId: household.id }
    );
    expect(acc.isISA).toBe(true);
    expect(acc.isaYearContribution).toBe(5000);
  });

  it("updateAccount can zero isaYearContribution", async () => {
    const household = await createTestHousehold();
    const member = await prisma.member.create({
      data: { householdId: household.id, name: "Alice" },
    });
    const created = await prisma.account.create({
      data: {
        householdId: household.id,
        memberId: member.id,
        name: "ISA",
        type: "Savings",
        isISA: true,
        isaYearContribution: 8000,
      },
    });
    const updated = await assetsService.updateAccount(
      household.id,
      created.id,
      { isaYearContribution: 0 },
      { ...baseCtx, householdId: household.id }
    );
    expect(updated.isaYearContribution).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts account-isa-mutation`
Expected: PASS already if `...rest` propagates the new fields, FAIL otherwise.

- [ ] **Step 3: Make any required service-layer changes**

If the test failed because `...rest` filters the fields, make `createAccount` and `updateAccount` explicitly include `isISA` and `isaYearContribution` in the data passed to `tx.account.create`/`tx.account.update`. Concretely, in both `createAccount` and `updateAccount`, change the destructuring at the top of the function from:

```typescript
const { disposedAt: _ignoredDate, disposalAccountId: _ignoredAcct, ...rest } = data;
```

to a form that retains the ISA fields explicitly. The simplest fix: keep `...rest` and ensure `CreateAccountInput`/`UpdateAccountInput` (Zod-inferred types) now include the new fields so they survive the spread. They do, after Task 2 — so no code change is usually needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts account-isa-mutation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/__tests__/account-isa-mutation.test.ts apps/backend/src/services/assets.service.ts
git commit -m "test(backend): verify ISA fields persist through createAccount/updateAccount"
```

---

### Task 9: Frontend — extend `AccountForm` with "Is ISA?" toggle and contribution input

**Files:**

- Modify: `apps/frontend/src/components/assets/AccountForm.tsx`
- Modify: `apps/frontend/src/components/assets/AccountItemArea.tsx` (thread new fields through)
- Test: `apps/frontend/src/components/assets/__tests__/AccountForm.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/assets/__tests__/AccountForm.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountForm } from "../AccountForm";

describe("AccountForm — ISA fields", () => {
  it("does not render the Is ISA toggle for non-Savings types", () => {
    render(
      <AccountForm mode="add" type="Current" onSave={mock(() => {})} onCancel={mock(() => {})} />
    );
    expect(screen.queryByLabelText(/Is ISA/i)).toBeNull();
  });

  it("renders the Is ISA toggle for Savings type", () => {
    render(
      <AccountForm mode="add" type="Savings" onSave={mock(() => {})} onCancel={mock(() => {})} />
    );
    expect(screen.getByLabelText(/Is ISA/i)).toBeInTheDocument();
  });

  it("blocks save when Is ISA is on but no member is assigned", () => {
    const onSave = mock(() => {});
    render(<AccountForm mode="add" type="Savings" onSave={onSave} onCancel={mock(() => {})} />);
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Cash ISA" } });
    fireEvent.click(screen.getByLabelText(/Is ISA/i));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/must be assigned to a member/i)).toBeInTheDocument();
  });

  it("includes isISA and isaYearContribution in onSave payload", () => {
    const onSave = mock(() => {});
    render(
      <AccountForm
        mode="add"
        type="Savings"
        onSave={onSave}
        onCancel={mock(() => {})}
        // a member is selected via the existing select; assume mock member id "m1"
      />
    );
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Cash ISA" } });
    fireEvent.change(screen.getByLabelText(/Assigned to/i), { target: { value: "m1" } });
    fireEvent.click(screen.getByLabelText(/Is ISA/i));
    fireEvent.change(screen.getByLabelText(/ISA contribution this tax year/i), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ isISA: true, isaYearContribution: 5000 })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test AccountForm`
Expected: FAIL — toggle not present

- [ ] **Step 3: Modify `AccountForm.tsx`**

Add to `Props`:

```typescript
  initialIsISA?: boolean;
  initialIsaYearContribution?: number | null;
```

Update `onSave` payload type to include `isISA: boolean` and `isaYearContribution: number | null`.

Add state hooks near the existing `limitRaw` state:

```typescript
const [isISA, setIsISA] = useState(initialIsISA ?? false);
const [isaContribRaw, setIsaContribRaw] = useState(
  initialIsaYearContribution != null ? initialIsaYearContribution.toString() : ""
);
const [isaError, setIsaError] = useState<string | null>(null);
```

Add to `handleSave`, before `if (!valid) return`:

```typescript
if (isISA) {
  if (!memberId) {
    setIsaError("ISA accounts must be assigned to a member");
    valid = false;
  } else if (type !== "Savings") {
    // Defensive — UI prevents this, but fail safely
    setIsaError("Only Savings accounts can be ISAs");
    valid = false;
  } else {
    setIsaError(null);
  }
} else {
  setIsaError(null);
}
let parsedIsaContrib: number | null = null;
if (isISA && isaContribRaw.trim() !== "") {
  const n = parseFloat(isaContribRaw);
  if (!isNaN(n) && n >= 0) parsedIsaContrib = n;
}
```

Add `isISA` and `isaYearContribution: parsedIsaContrib` to the `onSave({...})` call.

Add the JSX block immediately after the existing `monthlyContributionLimit` block (still inside `{type === "Savings" && (...)}` is wrong — these fields need to be siblings, both inside the Savings condition):

```tsx
{
  type === "Savings" && (
    <>
      <div className="col-span-2 flex items-center gap-2">
        <input
          type="checkbox"
          id="isISA"
          checked={isISA}
          onChange={(e) => {
            setIsISA(e.target.checked);
            setIsaError(null);
          }}
        />
        <label htmlFor="isISA" className="text-xs text-text-secondary">
          Is ISA?
        </label>
        {isaError && <span className="ml-2 text-xs text-amber-400">{isaError}</span>}
      </div>
      {isISA && (
        <div className="col-span-2 flex flex-col gap-1">
          <label htmlFor="isaYearContribution" className={labelClass}>
            ISA contribution this tax year
          </label>
          <input
            id="isaYearContribution"
            type="number"
            step="1"
            min="0"
            value={isaContribRaw}
            onChange={(e) => setIsaContribRaw(e.target.value)}
            placeholder="£0"
            aria-label="ISA contribution this tax year"
            className={[inputClass, "font-numeric"].join(" ")}
          />
          <p className="text-[11px] text-text-muted">
            How much you've already paid into this ISA in the current UK tax year (6 April → 5
            April).
          </p>
        </div>
      )}
    </>
  );
}
```

**Verified state of the file:** the existing `monthlyContributionLimit` block lives inside its own `{type === "Savings" && (<div ...>)}` at lines 266–293 (not a fragment). To keep the markup compact, restructure that block into a single `{type === "Savings" && (<>...</>)}` fragment that contains both the existing limit field and the new ISA toggle/contribution fields as siblings. Do not duplicate the `type === "Savings"` guard.

In `AccountItemArea.tsx`, thread `initialIsISA={item.isISA}` and `initialIsaYearContribution={item.isaYearContribution}` into `<AccountForm mode="edit" ...>`, and forward the new `isISA` / `isaYearContribution` properties from the `onSave` callback into the existing `useUpdateAccount` and `useCreateAccount` mutation calls (both call sites — the add-form path at the top of the panel and the edit-form path inside the row map).

**Type contract (must be updated in both files together):** the `onSave` prop type at the top of `AccountForm.tsx` (currently lines 43–51) is a strict object literal. Widen it in lockstep with the `AccountItemArea.tsx` callsite signatures:

```typescript
  onSave: (data: {
    name: string;
    memberId: string | null;
    growthRatePct: number | null;
    monthlyContributionLimit: number | null;
    isISA: boolean;
    isaYearContribution: number | null;
    disposedAt: string | null;
    disposalAccountId: string | null;
    initialValue?: number;
  }) => void;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test AccountForm`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/assets/AccountForm.tsx apps/frontend/src/components/assets/AccountItemArea.tsx apps/frontend/src/components/assets/__tests__/AccountForm.test.tsx
git commit -m "feat(frontend): add 'Is ISA?' toggle and contribution input to AccountForm"
```

---

### Task 10: Frontend — `useIsaAllowance` query hook + service call

**Files:**

- Modify: `apps/frontend/src/services/assets.service.ts` (add `getIsaAllowance` API call)
- Create: `apps/frontend/src/hooks/useIsaAllowance.ts`
- Test: `apps/frontend/src/hooks/__tests__/useIsaAllowance.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/hooks/__tests__/useIsaAllowance.test.tsx
import { describe, it, expect } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useIsaAllowance } from "../useIsaAllowance";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useIsaAllowance", () => {
  it("fetches ISA allowance summary from /api/accounts/isa-allowance", async () => {
    server.use(
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          taxYearStart: "2026-04-06",
          taxYearEnd: "2027-04-05",
          daysRemaining: 200,
          annualLimit: 20000,
          byMember: [],
        })
      )
    );
    const { result } = renderHook(() => useIsaAllowance(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.annualLimit).toBe(20000);
    expect(result.current.data?.byMember).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useIsaAllowance`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

In `apps/frontend/src/services/assets.service.ts`, add:

```typescript
import type { IsaAllowanceSummary } from "@finplan/shared";

export async function getIsaAllowance(): Promise<IsaAllowanceSummary> {
  const res = await api.get("/accounts/isa-allowance");
  return res.data as IsaAllowanceSummary;
}
```

Create `apps/frontend/src/hooks/useIsaAllowance.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { getIsaAllowance } from "@/services/assets.service";

export const ISA_ALLOWANCE_KEY = ["isa-allowance"] as const;

export function useIsaAllowance() {
  return useQuery({
    queryKey: ISA_ALLOWANCE_KEY,
    queryFn: getIsaAllowance,
    staleTime: 60 * 1000,
  });
}
```

Then update the existing `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount` mutations (in `apps/frontend/src/hooks/useAssets.ts`) and any discretionary-item mutation hooks to add `queryClient.invalidateQueries({ queryKey: ISA_ALLOWANCE_KEY })` to their `onSuccess` callbacks.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useIsaAllowance`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/assets.service.ts apps/frontend/src/hooks/useIsaAllowance.ts apps/frontend/src/hooks/useAssets.ts apps/frontend/src/hooks/__tests__/useIsaAllowance.test.tsx
git commit -m "feat(frontend): add useIsaAllowance query hook and cache invalidation"
```

---

### Task 11: Frontend — `IsaMemberBar` component

**Files:**

- Create: `apps/frontend/src/components/assets/IsaMemberBar.tsx`
- Test: `apps/frontend/src/components/assets/__tests__/IsaMemberBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/assets/__tests__/IsaMemberBar.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { IsaMemberBar } from "../IsaMemberBar";

const base = {
  memberId: "m1",
  name: "Alice",
  used: 12400,
  forecast: 5600,
  forecastedYearTotal: 18000,
  monthlyPlanned: 500,
  estimatedFlag: false,
};

describe("IsaMemberBar", () => {
  it("renders used / remaining values in the meta row", () => {
    render(<IsaMemberBar pos={base} annualLimit={20000} showName showPence={false} />);
    expect(screen.getByText(/£12,400/)).toBeInTheDocument();
    expect(screen.getByText(/£2,000 remaining/)).toBeInTheDocument();
  });

  it("does not render the limit marker when forecast within cap", () => {
    const { container } = render(
      <IsaMemberBar pos={base} annualLimit={20000} showName showPence={false} />
    );
    expect(container.querySelector('[data-testid="limit-marker"]')).toBeNull();
  });

  it("renders the limit marker and amber meta when forecast exceeds cap", () => {
    const over = { ...base, forecast: 11000, forecastedYearTotal: 23400 };
    render(<IsaMemberBar pos={over} annualLimit={20000} showName showPence={false} />);
    expect(screen.getByTestId("limit-marker")).toBeInTheDocument();
    expect(screen.getByText(/over.*limit/i)).toBeInTheDocument();
  });

  it("appends '(estimated)' when estimatedFlag is true", () => {
    render(
      <IsaMemberBar
        pos={{ ...base, estimatedFlag: true }}
        annualLimit={20000}
        showName
        showPence={false}
      />
    );
    expect(screen.getByText(/\(estimated\)/i)).toBeInTheDocument();
  });

  it("hides member name when showName=false", () => {
    render(<IsaMemberBar pos={base} annualLimit={20000} showName={false} showPence={false} />);
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("renders amber over-allowance meta when used exceeds limit (past-tense)", () => {
    const overUsed = { ...base, used: 21000, forecast: 0, forecastedYearTotal: 21000 };
    render(<IsaMemberBar pos={overUsed} annualLimit={20000} showName showPence={false} />);
    expect(screen.getByText(/£1,000 over allowance/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test IsaMemberBar`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/assets/IsaMemberBar.tsx
import type { IsaMemberPosition } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";

interface Props {
  pos: IsaMemberPosition;
  annualLimit: number;
  showName: boolean;
  showPence: boolean;
}

export function IsaMemberBar({ pos, annualLimit, showName, showPence }: Props) {
  const { name, used, forecast, forecastedYearTotal, monthlyPlanned, estimatedFlag } = pos;
  const remaining = Math.max(0, annualLimit - used);
  const overUsed = used > annualLimit;
  const overUsedAmount = Math.max(0, used - annualLimit);
  const overForecast = !overUsed && forecastedYearTotal > annualLimit;
  const barMax = Math.max(annualLimit, used + forecast);
  const usedPct = barMax > 0 ? (used / barMax) * 100 : 0;
  const forecastPct = barMax > 0 ? (forecast / barMax) * 100 : 0;
  const limitPct = barMax > 0 ? (annualLimit / barMax) * 100 : 0;

  const tooltip = `Used so far: ${formatCurrency(used, showPence)} · Forecast: ${formatCurrency(
    forecast,
    showPence
  )} · Limit: ${formatCurrency(annualLimit, showPence)}`;

  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-baseline justify-between">
        {showName ? (
          <span className="text-[12px] font-semibold text-text-primary">{name}</span>
        ) : (
          <span className="text-[12px] font-semibold text-text-primary">ISA allowance</span>
        )}
        <span className="font-numeric text-[11px] text-text-secondary">
          <strong className="text-text-primary">{formatCurrency(used, showPence)}</strong> of{" "}
          {formatCurrency(annualLimit, showPence)} used
          {!overUsed && ` · ${formatCurrency(remaining, showPence)} remaining`}
        </span>
      </div>
      <div
        className="relative h-2 rounded-full bg-foreground/[0.05]"
        title={tooltip}
        data-testid="isa-bar"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-tier-surplus/70"
          style={{ width: `${usedPct}%` }}
        />
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${usedPct}%`,
            width: `${forecastPct}%`,
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--tier-surplus) 0 3px, transparent 3px 6px)",
            opacity: 0.4,
          }}
        />
        {(overForecast || overUsed) && (
          <div
            data-testid="limit-marker"
            className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-sm bg-text-secondary"
            style={{ left: `${limitPct}%` }}
          />
        )}
      </div>
      <div className="flex items-baseline justify-between text-[10px] text-text-tertiary">
        <span className={overForecast || overUsed ? "text-attention" : undefined}>
          {overUsed
            ? `${formatCurrency(overUsedAmount, showPence)} over allowance`
            : overForecast
              ? `Forecast ${formatCurrency(forecastedYearTotal, showPence)} — ${formatCurrency(
                  forecastedYearTotal - annualLimit,
                  showPence
                )} over limit`
              : `Forecast ${formatCurrency(forecastedYearTotal, showPence)} by year end`}
          {estimatedFlag && " (estimated)"}
        </span>
        {monthlyPlanned > 0 && <span>{formatCurrency(monthlyPlanned, showPence)}/mo planned</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test IsaMemberBar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/assets/IsaMemberBar.tsx apps/frontend/src/components/assets/__tests__/IsaMemberBar.test.tsx
git commit -m "feat(frontend): add IsaMemberBar component"
```

---

### Task 12: Frontend — `IsaAllowanceIndicator` component

**Files:**

- Create: `apps/frontend/src/components/assets/IsaAllowanceIndicator.tsx`
- Test: `apps/frontend/src/components/assets/__tests__/IsaAllowanceIndicator.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/assets/__tests__/IsaAllowanceIndicator.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { IsaAllowanceIndicator } from "../IsaAllowanceIndicator";
import { renderWithProviders } from "@/test/helpers/render";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";

const empty = {
  taxYearStart: "2026-04-06",
  taxYearEnd: "2027-04-05",
  daysRemaining: 200,
  annualLimit: 20000,
  byMember: [],
};

describe("IsaAllowanceIndicator", () => {
  it("renders nothing when byMember is empty", () => {
    server.use(http.get("/api/accounts/isa-allowance", () => HttpResponse.json(empty)));
    const { container } = renderWithProviders(<IsaAllowanceIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one bar per member and shows the deadline line", async () => {
    server.use(
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          ...empty,
          byMember: [
            {
              memberId: "m1",
              name: "Alice",
              used: 12400,
              forecast: 5600,
              forecastedYearTotal: 18000,
              monthlyPlanned: 500,
              estimatedFlag: false,
            },
            {
              memberId: "m2",
              name: "Bob",
              used: 14000,
              forecast: 9000,
              forecastedYearTotal: 23000,
              monthlyPlanned: 750,
              estimatedFlag: false,
            },
          ],
        })
      )
    );
    renderWithProviders(<IsaAllowanceIndicator />);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText(/Resets 6 April/i)).toBeInTheDocument();
  });

  it("renders a single NudgeCard naming the most-over member", async () => {
    server.use(
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          ...empty,
          byMember: [
            {
              memberId: "m1",
              name: "Alice",
              used: 12000,
              forecast: 9000,
              forecastedYearTotal: 21000,
              monthlyPlanned: 750,
              estimatedFlag: false,
            },
            {
              memberId: "m2",
              name: "Bob",
              used: 14000,
              forecast: 12000,
              forecastedYearTotal: 26000,
              monthlyPlanned: 1000,
              estimatedFlag: false,
            },
          ],
        })
      )
    );
    renderWithProviders(<IsaAllowanceIndicator />);
    const nudge = await screen.findByTestId("nudge-card");
    expect(nudge).toHaveTextContent(/Bob/);
    expect(nudge).toHaveTextContent(/£26,000/);
    expect(nudge).toHaveTextContent(/£6,000 over/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test IsaAllowanceIndicator`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/assets/IsaAllowanceIndicator.tsx
import { useIsaAllowance } from "@/hooks/useIsaAllowance";
import { useSettings } from "@/hooks/useSettings";
import { IsaMemberBar } from "./IsaMemberBar";
import { NudgeCard } from "@/components/common/NudgeCard";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { PanelError } from "@/components/common/PanelError";
import { formatCurrency } from "@/utils/format";
import type { IsaMemberPosition } from "@finplan/shared";

export function IsaAllowanceIndicator() {
  const { data, isLoading, isError, refetch } = useIsaAllowance();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;

  if (isLoading) return <SkeletonLoader className="h-32" />;
  if (isError && !data) return <PanelError onRetry={() => void refetch()} />;
  if (!data || data.byMember.length === 0) return null;

  const { byMember, annualLimit, daysRemaining } = data;
  const overForecastMembers = byMember.filter(
    (m) => m.used <= annualLimit && m.forecastedYearTotal > annualLimit
  );
  const mostOver: IsaMemberPosition | null = overForecastMembers.length
    ? overForecastMembers.reduce((best, m) =>
        m.forecastedYearTotal - annualLimit > best.forecastedYearTotal - annualLimit ? m : best
      )
    : null;
  const showName = byMember.length > 1;

  return (
    <div className="flex flex-col gap-2 px-4 pb-4 pt-2 border-t border-foreground/5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
        ISA allowance · 2026/27 tax year
      </div>
      <div className="divide-y divide-foreground/[0.05]">
        {byMember.map((m) => (
          <IsaMemberBar
            key={m.memberId}
            pos={m}
            annualLimit={annualLimit}
            showName={showName}
            showPence={showPence}
          />
        ))}
      </div>
      <div className="text-center text-[10px] uppercase tracking-wider text-text-muted">
        Resets 6 April · {daysRemaining} days remaining
      </div>
      {mostOver && (
        <NudgeCard
          data-testid="nudge-card"
          message={`${mostOver.name}'s planned contributions would reach ${formatCurrency(
            mostOver.forecastedYearTotal,
            showPence
          )} by 5 April — ${formatCurrency(
            mostOver.forecastedYearTotal - annualLimit,
            showPence
          )} over the ${formatCurrency(annualLimit, showPence)} limit.`}
        />
      )}
    </div>
  );
}
```

If `NudgeCard` does not currently support `data-testid`, pass it through in the component or use `aria-label` for the test selector instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test IsaAllowanceIndicator`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/assets/IsaAllowanceIndicator.tsx apps/frontend/src/components/assets/__tests__/IsaAllowanceIndicator.test.tsx
git commit -m "feat(frontend): add IsaAllowanceIndicator with per-member bars and NudgeCard"
```

---

### Task 13: Frontend — mount `IsaAllowanceIndicator` in `AccountItemArea` for Savings

**Files:**

- Modify: `apps/frontend/src/components/assets/AccountItemArea.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/components/assets/__tests__/AccountItemArea.test.tsx` (create file if absent):

```tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AccountItemArea } from "../AccountItemArea";
import { renderWithProviders } from "@/test/helpers/render";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";

describe("AccountItemArea — Savings", () => {
  it("mounts the IsaAllowanceIndicator below the account list", async () => {
    server.use(
      http.get("/api/accounts/Savings", () => HttpResponse.json([])),
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          taxYearStart: "2026-04-06",
          taxYearEnd: "2027-04-05",
          daysRemaining: 200,
          annualLimit: 20000,
          byMember: [
            {
              memberId: "m1",
              name: "Alice",
              used: 5000,
              forecast: 0,
              forecastedYearTotal: 5000,
              monthlyPlanned: 0,
              estimatedFlag: false,
            },
          ],
        })
      )
    );
    renderWithProviders(<AccountItemArea type="Savings" />);
    expect(await screen.findByText(/ISA allowance/i)).toBeInTheDocument();
  });

  it("does not mount the indicator for non-Savings types", () => {
    server.use(http.get("/api/accounts/Current", () => HttpResponse.json([])));
    renderWithProviders(<AccountItemArea type="Current" />);
    expect(screen.queryByText(/ISA allowance/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test AccountItemArea`
Expected: FAIL — indicator not mounted

- [ ] **Step 3: Modify `AccountItemArea.tsx`**

Add the import:

```typescript
import { IsaAllowanceIndicator } from "./IsaAllowanceIndicator";
```

Render the indicator at the **bottom** of the scrollable content region (after the account-list mapping `{items?.map(...)}`, still inside the same `<div className="px-6 flex-1 min-h-0 overflow-y-auto">`):

```tsx
{
  type === "Savings" && <IsaAllowanceIndicator />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test AccountItemArea`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/assets/AccountItemArea.tsx apps/frontend/src/components/assets/__tests__/AccountItemArea.test.tsx
git commit -m "feat(frontend): mount IsaAllowanceIndicator in Savings AccountItemArea"
```

---

### Task 14: Frontend — extend amber-dot trigger in `AccountItemArea` for ISA over-forecast

**Files:**

- Modify: `apps/frontend/src/components/assets/AccountItemArea.tsx` (the dot lives here — see existing `hasLimitNudge` / `showDot` computation around line 124–128)
- Test: `apps/frontend/src/components/assets/__tests__/AccountItemArea.test.tsx` (the same test file from Task 13)

- [ ] **Step 1: Write the failing test**

Append to `AccountItemArea.test.tsx`:

```tsx
it("shows amber dot on an ISA row whose member is forecast over the cap", async () => {
  const accounts = [
    {
      id: "a1",
      name: "Bob ISA",
      type: "Savings",
      memberId: "m2",
      isISA: true,
      isaYearContribution: 14000,
      monthlyContribution: 0,
      monthlyContributionLimit: null,
      isOverCap: false,
      hasSpareCapacityNudge: false,
      currentBalance: 14000,
      lastReviewedAt: new Date().toISOString(),
      // ...other required defaults
    },
  ];
  server.use(
    http.get("/api/accounts/Savings", () => HttpResponse.json(accounts)),
    http.get("/api/accounts/isa-allowance", () =>
      HttpResponse.json({
        taxYearStart: "2026-04-06",
        taxYearEnd: "2027-04-05",
        daysRemaining: 200,
        annualLimit: 20000,
        byMember: [
          {
            memberId: "m2",
            name: "Bob",
            used: 14000,
            forecast: 9000,
            forecastedYearTotal: 23000,
            monthlyPlanned: 750,
            estimatedFlag: false,
          },
        ],
      })
    )
  );
  renderWithProviders(<AccountItemArea type="Savings" />);
  // Existing amber-dot DOM is rendered alongside each row; pick a stable selector
  // (e.g. data-testid="account-row-dot-a1") and assert visibility.
  expect(await screen.findByTestId("account-row-dot-a1")).toBeInTheDocument();
});
```

If the existing dot has no `data-testid`, add one in Step 3 alongside the trigger change — that's the lightest path to a testable assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test AccountItemArea`
Expected: FAIL — dot not rendered for ISA over-forecast

- [ ] **Step 3: Modify `AccountItemArea.tsx`**

Add the import and query at the top of the component:

```typescript
import { useIsaAllowance } from "@/hooks/useIsaAllowance";

// inside AccountItemArea(), after other hooks:
const { data: isaSummary } = useIsaAllowance();
const isaOverForecastMemberIds = new Set(
  (isaSummary?.byMember ?? [])
    .filter(
      (m) =>
        m.used <= (isaSummary?.annualLimit ?? 0) &&
        m.forecastedYearTotal > (isaSummary?.annualLimit ?? 0)
    )
    .map((m) => m.memberId)
);
```

Locate the existing `hasLimitNudge` / `showDot` block (currently at approximately line 124–128 of `AccountItemArea.tsx`):

```typescript
const hasLimitNudge = itemKind === "account" && (a.isOverCap || a.hasSpareCapacityNudge);
const showDot = stale || hasLimitNudge;
```

Extend it:

```typescript
const hasLimitNudge = itemKind === "account" && (a.isOverCap || a.hasSpareCapacityNudge);
const hasIsaOverForecast =
  itemKind === "account" && a.isISA === true && isaOverForecastMemberIds.has(a.memberId ?? "");
const showDot = stale || hasLimitNudge || hasIsaOverForecast;
```

Also add a `data-testid={\`account-row-dot-${a.id}\`}` on the dot element if not already present.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test AccountItemArea`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/assets/AccountItemArea.tsx apps/frontend/src/components/assets/__tests__/AccountItemArea.test.tsx
git commit -m "feat(frontend): trigger amber dot when ISA member is forecast over cap"
```

---

### Task 15: Frontend — `AccountDetailPanel` "new tax year" banner

**Files:**

- Modify: `apps/frontend/src/components/assets/AccountForm.tsx` (or wherever the ISA detail panel lives — verify during task)
- Test: corresponding test file

The spec calls this the `AccountDetailPanel` banner. In the current codebase, account detail editing lives inside `AccountForm` rendered within `AccountItemArea`'s edit mode. The banner should render **above** the form when the account satisfies all of: `type === 'Savings'`, `isISA === true`, `(isaYearContribution ?? 0) > 0`, `today >= mostRecent6April`, and `account.updatedAt < mostRecent6April`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/assets/__tests__/IsaTaxYearBanner.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { IsaTaxYearBanner } from "../IsaTaxYearBanner";

describe("IsaTaxYearBanner", () => {
  const account = {
    id: "a1",
    type: "Savings" as const,
    isISA: true,
    isaYearContribution: 12000,
    updatedAt: "2026-03-15T10:00:00Z",
    memberId: "m1",
  };

  it("renders the banner when conditions are met", () => {
    render(
      <IsaTaxYearBanner
        account={account}
        today={new Date("2026-04-10")}
        onZero={mock(() => {})}
        showPence={false}
      />
    );
    expect(screen.getByText(/new tax year began/i)).toBeInTheDocument();
    expect(screen.getByText(/£12,000/)).toBeInTheDocument();
  });

  it("does not render when isaYearContribution is 0", () => {
    const { container } = render(
      <IsaTaxYearBanner
        account={{ ...account, isaYearContribution: 0 }}
        today={new Date("2026-04-10")}
        onZero={mock(() => {})}
        showPence={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not render when account has been updated since 6 April", () => {
    const { container } = render(
      <IsaTaxYearBanner
        account={{ ...account, updatedAt: "2026-04-08T10:00:00Z" }}
        today={new Date("2026-04-10")}
        onZero={mock(() => {})}
        showPence={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not render before 6 April", () => {
    const { container } = render(
      <IsaTaxYearBanner
        account={account}
        today={new Date("2026-04-03")}
        onZero={mock(() => {})}
        showPence={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onZero when the action button is clicked", () => {
    const onZero = mock(() => {});
    render(
      <IsaTaxYearBanner
        account={account}
        today={new Date("2026-04-10")}
        onZero={onZero}
        showPence={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /zero this year's contribution/i }));
    expect(onZero).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test IsaTaxYearBanner`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/assets/IsaTaxYearBanner.tsx
import { formatCurrency } from "@/utils/format";

interface Props {
  account: {
    id: string;
    type: "Savings" | "Current" | "Pension" | "StocksAndShares" | "Other";
    isISA: boolean;
    isaYearContribution: number | null;
    updatedAt: string | Date;
    memberId: string | null;
  };
  today?: Date;
  onZero: () => void;
  showPence: boolean;
}

function mostRecent6April(today: Date): Date {
  const y = today.getUTCFullYear();
  const thisYearStart = new Date(Date.UTC(y, 3, 6));
  return today.getTime() >= thisYearStart.getTime()
    ? thisYearStart
    : new Date(Date.UTC(y - 1, 3, 6));
}

export function IsaTaxYearBanner({ account, today = new Date(), onZero, showPence }: Props) {
  if (account.type !== "Savings" || !account.isISA) return null;
  const contrib = account.isaYearContribution ?? 0;
  if (contrib <= 0) return null;

  const boundary = mostRecent6April(today);
  if (today.getTime() < boundary.getTime()) return null;

  const updated = new Date(account.updatedAt);
  if (updated.getTime() >= boundary.getTime()) return null;

  return (
    <div
      data-testid="isa-tax-year-banner"
      className="rounded-md border border-attention/20 bg-attention/[0.05] px-3 py-2 text-xs text-text-secondary"
    >
      <p>
        A new tax year began on 6 April. Last year's contribution was{" "}
        <strong className="text-text-primary">{formatCurrency(contrib, showPence)}</strong> — zero
        it to start tracking this year.
      </p>
      <button
        type="button"
        onClick={onZero}
        className="mt-2 rounded-md border border-attention/30 bg-attention/10 px-2.5 py-1 text-[11px] font-medium text-attention hover:bg-attention/20 transition-colors"
      >
        Zero this year's contribution
      </button>
    </div>
  );
}
```

Mount the banner inside the existing edit-mode flow in `AccountItemArea.tsx`, immediately above the `<AccountForm mode="edit" ... />` render, wired to:

```typescript
const updateAccount = useUpdateAccount();
// inside the row's edit branch:
<IsaTaxYearBanner
  account={item}
  showPence={showPence}
  onZero={() =>
    updateAccount.mutate({ accountId: item.id, data: { isaYearContribution: 0 } })
  }
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test IsaTaxYearBanner`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/assets/IsaTaxYearBanner.tsx apps/frontend/src/components/assets/AccountItemArea.tsx apps/frontend/src/components/assets/__tests__/IsaTaxYearBanner.test.tsx
git commit -m "feat(frontend): add ISA new-tax-year banner with zero action"
```

---

### Task 16: Backend — verify export/import round-trips ISA fields

**Files:**

- Modify: `apps/backend/src/services/export.service.ts`
- Modify: `apps/backend/src/services/import.service.ts`
- Modify: `packages/shared/src/schemas/export-import.schemas.ts`
- Test: `apps/backend/src/services/__tests__/export-import.roundtrip.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

Append a case to the existing round-trip test:

```typescript
it("round-trips isISA and isaYearContribution on accounts", async () => {
  // create household with an ISA account, export, wipe, import, re-export, expect equal
  // Use existing test scenario builder — full code follows the existing test's pattern.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts export-import.roundtrip`
Expected: FAIL — fields stripped

- [ ] **Step 3: Implement**

Add `isISA` and `isaYearContribution` to the `Account` shape in `export-import.schemas.ts`, and to the projection in `export.service.ts` and `import.service.ts`. Match the existing pattern for `monthlyContributionLimit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts export-import.roundtrip`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/export.service.ts apps/backend/src/services/import.service.ts packages/shared/src/schemas/export-import.schemas.ts apps/backend/src/services/__tests__/export-import.roundtrip.test.ts
git commit -m "feat(export): round-trip ISA fields through data export/import"
```

---

## Breaking Change Impact Analysis

For each schema/contract change, every consumer is verified or scheduled:

- **`Account.isISA` and `Account.isaYearContribution` added (additive, default false/null)** — no existing consumer breaks. Account read paths (`listAccountsByType`, `getSummary`) automatically include the new fields via Prisma's default selection. Frontend `AccountItem` type widens through the existing `assets.service.ts` return type.
- **`createAccountSchema`/`updateAccountSchema` extended** — additive only; existing payloads still parse. The `isaRefine` refinement only fails when `isISA: true` is explicitly sent, which no existing caller does.
- **Export/import** — covered by Task 16.
- **Frontend `useCreateAccount`/`useUpdateAccount` mutations** — Task 9 threads the new fields through; Task 10 adds the cache invalidation.
- **Frontend `AccountItem` consumers** — `AssetAccountRow` (Task 14), `AccountForm` edit mode (Task 9), `AccountItemArea` (Tasks 13, 14, 15). All other consumers don't read the new fields and remain unaffected.

No removed fields, no renamed fields, no removed endpoints.

## Testing

### Backend Tests

- [ ] Service: `getIsaAllowanceSummary` returns empty `byMember` for households with no ISA accounts
- [ ] Service: members are alphabetical by name in `byMember`
- [ ] Service: `used` is the sum across all that member's ISA accounts
- [ ] Service: `forecast` matches `forecastContribution` output for the linked items
- [ ] Service: `estimatedFlag` propagates from any pro-rated linked item
- [ ] Service: non-ISA accounts and disposed accounts are excluded
- [ ] Endpoint: `GET /api/accounts/isa-allowance` returns 401 without JWT
- [ ] Endpoint: never reveals another household's ISA data (test creates two households)
- [ ] Edge case: `createAccount` rejects `isISA: true, memberId: null`
- [ ] Edge case: `createAccount` rejects `isISA: true, type: "Current"`
- [ ] Edge case: `updateAccount` allows zeroing `isaYearContribution`
- [ ] Forecast: monthly with `dueDate` counts occurrences correctly
- [ ] Forecast: yearly outside window contributes £0
- [ ] Forecast: yearly inside window contributes the full amount
- [ ] Forecast: monthly without `dueDate` pro-rates and sets `estimated`
- [ ] Forecast: yearly without `dueDate` excluded and does not set `estimated`
- [ ] Tax-year window: 5 April is treated as still inside the current tax year
- [ ] Tax-year window: 6 April rolls forward to next year's window

### Frontend Tests

- [ ] Hook: `useIsaAllowance` fetches the summary and exposes `data`
- [ ] Component: `IsaMemberBar` renders used/remaining text
- [ ] Component: `IsaMemberBar` renders limit marker only when forecast exceeds cap
- [ ] Component: `IsaMemberBar` renders amber over-allowance meta when used exceeds cap (past-tense)
- [ ] Component: `IsaMemberBar` appends "(estimated)" when `estimatedFlag` is true
- [ ] Component: `IsaAllowanceIndicator` returns null when `byMember` is empty
- [ ] Component: `IsaAllowanceIndicator` renders one bar per member, alphabetical order
- [ ] Component: `IsaAllowanceIndicator` shows a single NudgeCard naming the most-over member
- [ ] Component: `IsaAllowanceIndicator` shows no NudgeCard when no member is over forecast
- [ ] Component: `AccountForm` renders the "Is ISA?" toggle only on Savings type
- [ ] Component: `AccountForm` blocks save when `isISA && !memberId`
- [ ] Component: `AccountForm` includes ISA fields in `onSave` payload
- [ ] Component: `AccountItemArea` mounts indicator only for Savings type
- [ ] Component: `AssetAccountRow` shows amber dot when its memberId is in `isaOverForecastMemberIds`
- [ ] Component: `IsaTaxYearBanner` only renders when all five conditions hold
- [ ] Component: `IsaTaxYearBanner` zero action calls `useUpdateAccount` with `isaYearContribution: 0`

### Key Scenarios

- [ ] Happy path: household with two members, one ISA each, contributions and linked items present → indicator shows two bars with correct figures, no nudge
- [ ] Over-forecast: one member's linked items will push them over → single NudgeCard appears naming that member, amber dot fires on their ISA row
- [ ] Past-tense over-cap: `isaYearContribution` already exceeds £20k → bar shows over-allowance meta in amber, no NudgeCard, no row dot
- [ ] Tax-year rollover: AccountDetailPanel banner appears post-6-April for un-zeroed ISAs; clicking the action zeros the field; banner self-dismisses; indicator updates
- [ ] Form validation: attempting to save an ISA with no member shows inline error; toggling off Is ISA clears the error
- [ ] Empty: household with no ISA accounts → indicator is hidden entirely
- [ ] Cross-household isolation: User A cannot see User B's ISA data even with two households containing ISAs
- [ ] Settings change: editing `HouseholdSettings.isaAnnualLimit` re-renders the indicator with the new cap

## Verification

- [ ] `bun run lint` — zero warnings (zero-warnings policy)
- [ ] `bun run type-check` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts isa` passes (covers tax-year, forecast, summary, mutation, route tests)
- [ ] `cd apps/frontend && bunx vitest run` passes for new and modified components
- [ ] `bun run build` passes clean
- [ ] Manual: in dev, create two members, one ISA each with linked monthly discretionary items; verify indicator renders, change limit in settings, verify update; mark contributions to push one member over forecast and verify the NudgeCard + row dot; advance system date past 6 April and verify the AccountDetailPanel banner; click zero and verify the banner disappears and the indicator refreshes

## Post-conditions

- [ ] Users can mark accounts as ISAs and track contribution-to-date per member
- [ ] Users get a calm, arithmetic forecast of where their planned contributions will land
- [ ] Users get a single non-judgemental nudge when forecast exceeds the cap
- [ ] Users get prompted to roll over each ISA's contribution figure once a new tax year starts
- [ ] Pattern (`monthlyContribution` + `getXSummary` + per-Member aggregation) is now established for further per-Member financial-rule features (e.g. pension annual allowance, capital gains allowance) without rework
