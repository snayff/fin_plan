---
feature: testability-improvements
spec: docs/4. planning/testability-improvements/testability-improvements-spec.md
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Testability Improvements — Implementation Plan

> **For Claude:** Use `/execute-plan testability-improvements` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Systematically improve backend testability: DI clock for date-sensitive functions, complete route test coverage, rounding utility, fixture snapshots, realistic seed data, and ReviewSession JSON validation.
**Spec:** `docs/4. planning/testability-improvements/testability-improvements-spec.md`
**Architecture:** Six independent improvements — each produces a working, testable commit. Shared utility (`toGBP`) and shared schemas (ReviewSession JSON) go first since route tests and service tests depend on them. DI clock refactors each touch one function signature. Fixture snapshots provide reusable test data. Route tests follow the established `mock.module + buildTestApp + app.inject` pattern. Seed script populates dev database with realistic data.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: no

## Pre-conditions

- [x] All waterfall, wealth, planner, review, setup, settings, and snapshot services exist and pass current tests
- [x] `buildTestApp()`, `prismaMock`, and `errorHandler` test infrastructure in place
- [x] `packages/shared/src/schemas/review-session.schemas.ts` exists with `updateReviewSessionSchema`

## Tasks

---

### Task 1: toGBP Shared Utility

**Files:**

- Create: `packages/shared/src/utils/toGBP.ts`
- Create: `packages/shared/src/utils/toGBP.test.ts`
- Create: `packages/shared/src/utils/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/utils/toGBP.test.ts
import { describe, it, expect } from "bun:test";
import { toGBP } from "./toGBP";

describe("toGBP", () => {
  it("rounds to exactly 2 decimal places", () => {
    expect(toGBP(10.555)).toBe(10.56);
    expect(toGBP(10.554)).toBe(10.55);
  });

  it("handles whole numbers", () => {
    expect(toGBP(100)).toBe(100);
  });

  it("handles negative numbers", () => {
    expect(toGBP(-10.555)).toBe(-10.56);
  });

  it("handles very small floating point drift", () => {
    // Classic JS issue: 0.1 + 0.2 = 0.30000000000000004
    expect(toGBP(0.1 + 0.2)).toBe(0.3);
  });

  it("handles zero", () => {
    expect(toGBP(0)).toBe(0);
  });

  it("rounds 1200/12 cleanly", () => {
    expect(toGBP(1200 / 12)).toBe(100);
  });

  it("rounds indivisible amounts", () => {
    // 1000 / 3 = 333.33333...
    expect(toGBP(1000 / 3)).toBe(333.33);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test src/utils/toGBP.test.ts`
Expected: FAIL — "Cannot find module './toGBP'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/utils/toGBP.ts

/**
 * Round a number to exactly 2 decimal places (GBP precision).
 *
 * This is an interim measure to control floating-point drift while
 * the full pence-integer arithmetic migration is pending.
 * See: docs/4. planning/_future/pence-integer-arithmetic/
 */
export function toGBP(n: number): number {
  return Math.round(n * 100) / 100;
}
```

```typescript
// packages/shared/src/utils/index.ts
export { toGBP } from "./toGBP";
```

Add to `packages/shared/src/index.ts` after the existing exports:

```typescript
// Utilities
export { toGBP } from "./utils";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test src/utils/toGBP.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/toGBP.ts packages/shared/src/utils/toGBP.test.ts packages/shared/src/utils/index.ts packages/shared/src/index.ts
git commit -m "feat(shared): add toGBP rounding utility for 2dp financial arithmetic"
```

---

### Task 2: Apply toGBP to Waterfall Surplus Calculation

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts`
- Modify: `apps/backend/src/services/waterfall.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the end of `apps/backend/src/services/waterfall.service.test.ts`:

```typescript
describe("waterfallService.getWaterfallSummary — toGBP rounding", () => {
  const makeSource = (overrides: object) => ({
    id: "s1",
    householdId: "hh-1",
    name: "Source",
    amount: 1000,
    frequency: "monthly" as const,
    incomeType: "other" as const,
    expectedMonth: null,
    ownerId: null,
    sortOrder: 0,
    endedAt: null,
    lastReviewedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it("rounds surplus amount to 2dp", async () => {
    // 1000/3 = 333.333... per month — surplus should be rounded
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "annual", amount: 1000 }),
    ] as any);
    prismaMock.committedBill.findMany.mockResolvedValue([]);
    prismaMock.yearlyBill.findMany.mockResolvedValue([]);
    prismaMock.discretionaryCategory.findMany.mockResolvedValue([]);
    prismaMock.savingsAllocation.findMany.mockResolvedValue([]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // income: 1000/12 = 83.333... → toGBP → 83.33
    expect(summary.income.total).toBe(83.33);
    expect(summary.surplus.amount).toBe(83.33);
  });

  it("rounds percentOfIncome to 2dp", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      makeSource({ id: "s1", frequency: "monthly", amount: 3000 }),
    ] as any);
    prismaMock.committedBill.findMany.mockResolvedValue([
      { id: "b1", householdId: "hh-1", name: "Rent", amount: 1000 },
    ] as any);
    prismaMock.yearlyBill.findMany.mockResolvedValue([
      { id: "y1", householdId: "hh-1", name: "Insurance", amount: 1000, dueMonth: 3 },
    ] as any);
    prismaMock.discretionaryCategory.findMany.mockResolvedValue([]);
    prismaMock.savingsAllocation.findMany.mockResolvedValue([]);

    const summary = await waterfallService.getWaterfallSummary("hh-1");

    // income: 3000
    // committed: 1000 bills + 1000/12 yearly = 1083.33
    // surplus: 3000 - 1083.33 = 1916.67
    // percent: (1916.67 / 3000) * 100 = 63.89
    expect(summary.surplus.amount).toBe(1916.67);
    expect(summary.surplus.percentOfIncome).toBe(63.89);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: FAIL — surplus amount is unrounded (e.g. 83.33333...)

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/services/waterfall.service.ts`, add import at top:

```typescript
import { toGBP } from "@finplan/shared";
```

Then replace the surplus calculation block (around lines 65-108) — wrap all arithmetic outputs with `toGBP`:

```typescript
const incomeTotal = toGBP(
  monthlyIncome.reduce((s, i) => s + i.amount, 0) +
    annualIncome.reduce((s, i) => s + i.amount / 12, 0)
);
```

```typescript
const yearlyMonthlyAvg = toGBP(yearlyBills.reduce((s, b) => s + b.amount, 0) / 12);
```

```typescript
const surplusAmount = toGBP(
  incomeTotal - committedMonthlyTotal - yearlyMonthlyAvg - discretionaryTotal - savingsTotal
);
const percentOfIncome = toGBP(incomeTotal > 0 ? (surplusAmount / incomeTotal) * 100 : 0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/waterfall.service.ts apps/backend/src/services/waterfall.service.test.ts
git commit -m "feat(waterfall): apply toGBP rounding to surplus and income calculations"
```

---

### Task 3: Apply toGBP to ISA Allowance Remaining

**Files:**

- Modify: `apps/backend/src/services/wealth.service.ts`
- Modify: `apps/backend/src/services/wealth.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the end of `apps/backend/src/services/wealth.service.test.ts`:

```typescript
describe("wealthService.getIsaAllowance — toGBP rounding", () => {
  it("rounds remaining to 2dp", async () => {
    prismaMock.householdSettings.findUnique.mockResolvedValue({
      isaAnnualLimit: 20000,
      isaYearStartMonth: 4,
      isaYearStartDay: 6,
    } as any);
    prismaMock.wealthAccount.findMany.mockResolvedValue([
      {
        id: "wa-1",
        householdId: "hh-1",
        isISA: true,
        ownerId: "user-1",
        isaYearContribution: 6666.67,
      },
    ] as any);
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1", name: "Alice" }] as any);

    const result = await wealthService.getIsaAllowance("hh-1");

    // remaining: 20000 - 6666.67 = 13333.33
    expect(result.byPerson[0]!.remaining).toBe(13333.33);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts wealth.service`
Expected: FAIL — remaining is unrounded (or test runs but the assertion fails due to floating point)

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/services/wealth.service.ts`, add import:

```typescript
import { toGBP } from "@finplan/shared";
```

In the `getIsaAllowance` method, update the `byPerson` mapping (around line 269-274):

```typescript
const byPerson = Array.from(groups.entries()).map(([ownerId, { label, used }]) => ({
  ownerId,
  name: label,
  used: toGBP(used),
  remaining: toGBP(Math.max(0, limit - used)),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts wealth.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/wealth.service.ts apps/backend/src/services/wealth.service.test.ts
git commit -m "feat(wealth): apply toGBP rounding to ISA allowance remaining calculation"
```

---

### Task 4: DI Clock — Staleness Utils (monthsElapsed, isStale)

**Files:**

- Modify: `apps/frontend/src/utils/staleness.ts`
- Create: `apps/frontend/src/utils/staleness.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/utils/staleness.test.ts
import { describe, it, expect } from "bun:test";
import { monthsElapsed, isStale, stalenessLabel } from "./staleness";

describe("monthsElapsed", () => {
  it("returns 0 for a date within the same month", () => {
    const now = new Date("2026-03-15");
    const reviewed = new Date("2026-03-01");
    expect(monthsElapsed(reviewed, now)).toBe(0);
  });

  it("returns 3 for a date exactly 3 months ago", () => {
    const now = new Date("2026-06-15");
    const reviewed = new Date("2026-03-10");
    expect(monthsElapsed(reviewed, now)).toBe(3);
  });

  it("accepts ISO string input", () => {
    const now = new Date("2026-06-15");
    expect(monthsElapsed("2026-03-10T00:00:00Z", now)).toBe(3);
  });
});

describe("isStale", () => {
  it("returns false when within threshold", () => {
    const now = new Date("2026-03-15");
    const reviewed = new Date("2026-01-20");
    expect(isStale(reviewed, 6, now)).toBe(false);
  });

  it("returns true when at or past threshold", () => {
    const now = new Date("2026-09-15");
    const reviewed = new Date("2026-03-10");
    expect(isStale(reviewed, 6, now)).toBe(true);
  });
});

describe("stalenessLabel", () => {
  it("returns 'this month' for recent review", () => {
    const now = new Date("2026-03-15");
    const reviewed = new Date("2026-03-01");
    expect(stalenessLabel(reviewed, now)).toBe("Last reviewed: this month");
  });

  it("returns '1 month ago' for singular", () => {
    const now = new Date("2026-04-15");
    const reviewed = new Date("2026-03-10");
    expect(stalenessLabel(reviewed, now)).toBe("Last reviewed: 1 month ago");
  });

  it("returns 'N months ago' for plural", () => {
    const now = new Date("2026-08-15");
    const reviewed = new Date("2026-03-10");
    expect(stalenessLabel(reviewed, now)).toBe("Last reviewed: 5 months ago");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bunx vitest run src/utils/staleness.test.ts`
Expected: FAIL — functions don't accept a `now` parameter

- [ ] **Step 3: Write minimal implementation**

Replace `apps/frontend/src/utils/staleness.ts`:

```typescript
import { differenceInMonths, parseISO } from "date-fns";

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : parseISO(value);
}

export function monthsElapsed(lastReviewedAt: Date | string, now: Date = new Date()): number {
  return differenceInMonths(now, toDate(lastReviewedAt));
}

export function isStale(
  lastReviewedAt: Date | string,
  thresholdMonths: number,
  now: Date = new Date()
): boolean {
  return monthsElapsed(lastReviewedAt, now) >= thresholdMonths;
}

export function stalenessLabel(lastReviewedAt: Date | string, now: Date = new Date()): string {
  const months = monthsElapsed(lastReviewedAt, now);
  if (months === 0) return "Last reviewed: this month";
  if (months === 1) return "Last reviewed: 1 month ago";
  return `Last reviewed: ${months} months ago`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bunx vitest run src/utils/staleness.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/utils/staleness.ts apps/frontend/src/utils/staleness.test.ts
git commit -m "refactor(staleness): add DI clock parameter to monthsElapsed, isStale, stalenessLabel"
```

---

### Task 5: DI Clock — ensureJan1Snapshot

**Files:**

- Modify: `apps/backend/src/services/snapshot.service.ts`
- Modify: `apps/backend/src/services/snapshot.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/services/snapshot.service.test.ts`:

```typescript
describe("snapshotService.ensureJan1Snapshot", () => {
  it("creates auto snapshot when now is Jan 1", async () => {
    const jan1 = new Date("2026-01-01T10:00:00Z");

    prismaMock.snapshot.findUnique.mockResolvedValue(null);
    prismaMock.snapshot.create.mockResolvedValue({
      id: "snap-1",
      name: "January 2026 — Auto",
    } as any);
    // Mock for createSnapshot's internal getWaterfallSummary call
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedBill.findMany.mockResolvedValue([]);
    prismaMock.yearlyBill.findMany.mockResolvedValue([]);
    prismaMock.discretionaryCategory.findMany.mockResolvedValue([]);
    prismaMock.savingsAllocation.findMany.mockResolvedValue([]);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null);

    await snapshotService.ensureJan1Snapshot("hh-1", jan1);

    expect(prismaMock.snapshot.findUnique).toHaveBeenCalledWith({
      where: { householdId_name: { householdId: "hh-1", name: "January 2026 — Auto" } },
    });
  });

  it("does nothing when now is not Jan 1", async () => {
    const feb15 = new Date("2026-02-15T10:00:00Z");

    await snapshotService.ensureJan1Snapshot("hh-1", feb15);

    expect(prismaMock.snapshot.findUnique).not.toHaveBeenCalled();
  });

  it("does nothing when auto snapshot already exists", async () => {
    const jan1 = new Date("2026-01-01T10:00:00Z");

    prismaMock.snapshot.findUnique.mockResolvedValue({ id: "snap-existing" } as any);

    await snapshotService.ensureJan1Snapshot("hh-1", jan1);

    expect(prismaMock.snapshot.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshot.service`
Expected: FAIL — `ensureJan1Snapshot` does not accept a `now` parameter

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/services/snapshot.service.ts`, update the function signature:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshot.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/snapshot.service.ts apps/backend/src/services/snapshot.service.test.ts
git commit -m "refactor(snapshot): add DI clock parameter to ensureJan1Snapshot"
```

---

### Task 6: DI Clock — getIsaAllowance

**Files:**

- Modify: `apps/backend/src/services/wealth.service.ts`
- Modify: `apps/backend/src/services/wealth.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/services/wealth.service.test.ts`:

```typescript
describe("wealthService.getIsaAllowance — DI clock", () => {
  it("computes correct tax year when now is before April 6", async () => {
    const now = new Date("2026-03-15");

    prismaMock.householdSettings.findUnique.mockResolvedValue({
      isaAnnualLimit: 20000,
      isaYearStartMonth: 4,
      isaYearStartDay: 6,
    } as any);
    prismaMock.wealthAccount.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await wealthService.getIsaAllowance("hh-1", now);

    // Before April 6, 2026 → tax year is 2025-04-06 to 2026-04-05
    expect(result.taxYearStart).toContain("2025");
    expect(result.taxYearEnd).toContain("2026");
  });

  it("computes correct tax year when now is after April 6", async () => {
    const now = new Date("2026-05-01");

    prismaMock.householdSettings.findUnique.mockResolvedValue({
      isaAnnualLimit: 20000,
      isaYearStartMonth: 4,
      isaYearStartDay: 6,
    } as any);
    prismaMock.wealthAccount.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await wealthService.getIsaAllowance("hh-1", now);

    // After April 6, 2026 → tax year is 2026-04-06 to 2027-04-05
    expect(result.taxYearStart).toContain("2026");
    expect(result.taxYearEnd).toContain("2027");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts wealth.service`
Expected: FAIL — `getIsaAllowance` does not accept a `now` parameter

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/services/wealth.service.ts`, update the function signature:

```typescript
  async getIsaAllowance(householdId: string, now: Date = new Date()): Promise<IsaAllowance> {
```

Remove the `const now = new Date();` line (line 238) since `now` is now a parameter.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts wealth.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/wealth.service.ts apps/backend/src/services/wealth.service.test.ts
git commit -m "refactor(wealth): add DI clock parameter to getIsaAllowance"
```

---

### Task 7: DI Clock — getUpcomingGifts

**Files:**

- Modify: `apps/backend/src/services/planner.service.ts`
- Modify: `apps/backend/src/services/planner.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/services/planner.service.test.ts`:

```typescript
describe("plannerService.getUpcomingGifts — DI clock", () => {
  it("marks past events as done based on injected now", async () => {
    const now = new Date("2026-07-01");

    prismaMock.giftEvent.findMany.mockResolvedValue([
      {
        id: "ge-1",
        householdId: "hh-1",
        giftPersonId: "gp-1",
        eventType: "birthday",
        recurrence: "annual",
        month: 3, // March — before July
        day: 15,
        giftPerson: { id: "gp-1", name: "Alice", householdId: "hh-1" },
        yearRecords: [],
      },
      {
        id: "ge-2",
        householdId: "hh-1",
        giftPersonId: "gp-1",
        eventType: "birthday",
        recurrence: "annual",
        month: 12, // December — after July
        day: 25,
        giftPerson: { id: "gp-1", name: "Bob", householdId: "hh-1" },
        yearRecords: [],
      },
    ] as any);

    const result = await plannerService.getUpcomingGifts("hh-1", 2026, now);

    const marchEvent = result.find((e) => e.id === "ge-1");
    const decEvent = result.find((e) => e.id === "ge-2");
    expect(marchEvent!.done).toBe(true); // March 15 < July 1
    expect(decEvent!.done).toBe(false); // Dec 25 > July 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts planner.service`
Expected: FAIL — `getUpcomingGifts` does not accept a `now` parameter

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/services/planner.service.ts`, update the function signature:

```typescript
  async getUpcomingGifts(householdId: string, year: number, now: Date = new Date()) {
```

Remove the `const now = new Date();` line (line 174) since `now` is now a parameter.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts planner.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/planner.service.ts apps/backend/src/services/planner.service.test.ts
git commit -m "refactor(planner): add DI clock parameter to getUpcomingGifts"
```

---

### Task 8: DI Clock Documentation

**Files:**

- Modify: `docs/3. architecture/testing/backend-testing.md`

- [ ] **Step 1: Write the failing test**

No automated test — documentation task. Verify manually.

- [ ] **Step 2: Skip**

- [ ] **Step 3: Write minimal implementation**

Add a new section before the "Infrastructure Reference" heading in `docs/3. architecture/testing/backend-testing.md`:

````markdown
---

## DI Clock Pattern

**When:** A function depends on the current date/time (`new Date()`), making its tests non-deterministic.

**Convention:** Add an optional `now` parameter with `new Date()` as the default. Call sites that don't pass `now` behave identically to before. Tests pass a synthetic date to exercise boundary conditions.

```typescript
// Service function — accepts optional now
async getIsaAllowance(householdId: string, now: Date = new Date()): Promise<IsaAllowance> {
  // Use `now` instead of `new Date()` throughout
}

// Test — injects synthetic date
it("computes correct tax year boundary", async () => {
  const now = new Date("2026-03-15");
  const result = await wealthService.getIsaAllowance("hh-1", now);
  expect(result.taxYearStart).toContain("2025"); // Before April 6
});
```
````

**Functions using this pattern:**

| Function             | File                          | Boundary tested                 |
| -------------------- | ----------------------------- | ------------------------------- |
| `ensureJan1Snapshot` | `snapshot.service.ts`         | Jan 1 auto-snapshot creation    |
| `getIsaAllowance`    | `wealth.service.ts`           | ISA tax year start/end          |
| `getUpcomingGifts`   | `planner.service.ts`          | Gift event done/upcoming status |
| `monthsElapsed`      | `frontend/utils/staleness.ts` | Staleness month calculation     |
| `isStale`            | `frontend/utils/staleness.ts` | Staleness threshold comparison  |
| `stalenessLabel`     | `frontend/utils/staleness.ts` | Human-readable staleness text   |

````

- [ ] **Step 4: Verify**

Read the file to confirm the section is correctly placed.

- [ ] **Step 5: Commit**

```bash
git add "docs/3. architecture/testing/backend-testing.md"
git commit -m "docs(testing): document DI clock pattern for date-sensitive functions"
````

---

### Task 9: ReviewSession JSON Validation Schemas

**Files:**

- Modify: `packages/shared/src/schemas/review-session.schemas.ts`
- Create: `packages/shared/src/schemas/review-session.schemas.test.ts`
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/review-session.schemas.test.ts
import { describe, it, expect } from "bun:test";
import { confirmedItemsSchema, updatedItemsSchema } from "./review-session.schemas";

describe("confirmedItemsSchema", () => {
  it("accepts valid record of string arrays", () => {
    const result = confirmedItemsSchema.safeParse({
      income_source: ["inc-1", "inc-2"],
      committed_bill: ["bill-1"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = confirmedItemsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects non-string array values", () => {
    const result = confirmedItemsSchema.safeParse({
      income_source: [123],
    });
    expect(result.success).toBe(false);
  });
});

describe("updatedItemsSchema", () => {
  it("accepts valid record of from/to objects", () => {
    const result = updatedItemsSchema.safeParse({
      "inc-1": { from: 3000, to: 3500 },
      "bill-1": { from: 50, to: 60 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updatedItemsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects missing 'to' field", () => {
    const result = updatedItemsSchema.safeParse({
      "inc-1": { from: 3000 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric values", () => {
    const result = updatedItemsSchema.safeParse({
      "inc-1": { from: "three thousand", to: 3500 },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test src/schemas/review-session.schemas.test.ts`
Expected: FAIL — `confirmedItemsSchema` and `updatedItemsSchema` are not exported

- [ ] **Step 3: Write minimal implementation**

Update `packages/shared/src/schemas/review-session.schemas.ts`:

```typescript
import { z } from "zod";

export const confirmedItemsSchema = z.record(z.array(z.string()));

export const updatedItemsSchema = z.record(z.object({ from: z.number(), to: z.number() }));

export const updateReviewSessionSchema = z.object({
  currentStep: z.number().int().min(0).optional(),
  confirmedItems: confirmedItemsSchema.optional(),
  updatedItems: updatedItemsSchema.optional(),
});

export type UpdateReviewSessionInput = z.infer<typeof updateReviewSessionSchema>;
```

Update `packages/shared/src/schemas/index.ts` — replace the review session export line:

```typescript
// Review session schemas and types
export {
  confirmedItemsSchema,
  updatedItemsSchema,
  updateReviewSessionSchema,
  type UpdateReviewSessionInput,
} from "./review-session.schemas";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test src/schemas/review-session.schemas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/review-session.schemas.ts packages/shared/src/schemas/review-session.schemas.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add confirmedItemsSchema and updatedItemsSchema for ReviewSession JSON validation"
```

---

### Task 10: Apply ReviewSession JSON Validation in Service

**Files:**

- Modify: `apps/backend/src/services/review-session.service.ts`
- Modify: `apps/backend/src/services/review-session.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/services/review-session.service.test.ts`:

```typescript
describe("reviewSessionService.getSession — JSON validation", () => {
  it("returns session with valid JSON fields", async () => {
    prismaMock.reviewSession.findUnique.mockResolvedValue({
      id: "rs-1",
      householdId: "hh-1",
      currentStep: 2,
      confirmedItems: { income_source: ["inc-1"] },
      updatedItems: { "inc-1": { from: 3000, to: 3500 } },
      startedAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const session = await reviewSessionService.getSession("hh-1");

    expect(session).toBeDefined();
    expect(session!.confirmedItems).toEqual({ income_source: ["inc-1"] });
  });

  it("throws ValidationError when confirmedItems has invalid shape", async () => {
    prismaMock.reviewSession.findUnique.mockResolvedValue({
      id: "rs-1",
      householdId: "hh-1",
      currentStep: 0,
      confirmedItems: { income_source: [123] }, // should be strings
      updatedItems: {},
      startedAt: new Date(),
      updatedAt: new Date(),
    } as any);

    await expect(reviewSessionService.getSession("hh-1")).rejects.toThrow("failed validation");
  });

  it("throws ValidationError when updatedItems has invalid shape", async () => {
    prismaMock.reviewSession.findUnique.mockResolvedValue({
      id: "rs-1",
      householdId: "hh-1",
      currentStep: 0,
      confirmedItems: {},
      updatedItems: { "inc-1": { from: "bad" } }, // should be numbers with 'to'
      startedAt: new Date(),
      updatedAt: new Date(),
    } as any);

    await expect(reviewSessionService.getSession("hh-1")).rejects.toThrow("failed validation");
  });

  it("returns null when no session exists", async () => {
    prismaMock.reviewSession.findUnique.mockResolvedValue(null);

    const session = await reviewSessionService.getSession("hh-1");
    expect(session).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts review-session.service`
Expected: FAIL — `getSession` does not validate JSON fields

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/services/review-session.service.ts`:

```typescript
import { prisma } from "../config/database.js";
import { confirmedItemsSchema, updatedItemsSchema } from "@finplan/shared";
import type { UpdateReviewSessionInput } from "@finplan/shared";
import { ValidationError } from "../utils/errors.js";

export const reviewSessionService = {
  async getSession(householdId: string) {
    const session = await prisma.reviewSession.findUnique({ where: { householdId } });
    if (!session) return null;

    const confirmedResult = confirmedItemsSchema.safeParse(session.confirmedItems);
    if (!confirmedResult.success) {
      throw new ValidationError(
        `ReviewSession confirmedItems failed validation: ${confirmedResult.error.message}`
      );
    }

    const updatedResult = updatedItemsSchema.safeParse(session.updatedItems);
    if (!updatedResult.success) {
      throw new ValidationError(
        `ReviewSession updatedItems failed validation: ${updatedResult.error.message}`
      );
    }

    return {
      ...session,
      confirmedItems: confirmedResult.data,
      updatedItems: updatedResult.data,
    };
  },

  async createOrResetSession(householdId: string) {
    return prisma.reviewSession.upsert({
      where: { householdId },
      create: { householdId },
      update: { currentStep: 0, confirmedItems: {}, updatedItems: {}, startedAt: new Date() },
    });
  },

  async updateSession(householdId: string, data: UpdateReviewSessionInput) {
    return prisma.reviewSession.update({
      where: { householdId },
      data,
    });
  },

  async deleteSession(householdId: string) {
    await prisma.reviewSession.deleteMany({ where: { householdId } });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts review-session.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/review-session.service.ts apps/backend/src/services/review-session.service.test.ts
git commit -m "feat(review-session): validate confirmedItems and updatedItems JSON on read"
```

---

### Task 11: Fixture Snapshots

**Files:**

- Create: `apps/backend/src/test/fixtures/scenarios.ts`
- Modify: `apps/backend/src/services/waterfall.service.test.ts` (verify usage)

- [ ] **Step 1: Write the failing test**

Add a test using the scenario at the end of `apps/backend/src/services/waterfall.service.test.ts`:

```typescript
describe("waterfallService.getWaterfallSummary — fixture scenarios", () => {
  it("returns zeroed summary for emptyHousehold", async () => {
    const { emptyHousehold } = await import("../test/fixtures/scenarios.js");

    prismaMock.incomeSource.findMany.mockResolvedValue(emptyHousehold.incomeSources);
    prismaMock.committedBill.findMany.mockResolvedValue(emptyHousehold.committedBills);
    prismaMock.yearlyBill.findMany.mockResolvedValue(emptyHousehold.yearlyBills);
    prismaMock.discretionaryCategory.findMany.mockResolvedValue(
      emptyHousehold.discretionaryCategories
    );
    prismaMock.savingsAllocation.findMany.mockResolvedValue(emptyHousehold.savingsAllocations);

    const summary = await waterfallService.getWaterfallSummary("hh-empty");

    expect(summary.income.total).toBe(0);
    expect(summary.surplus.amount).toBe(0);
  });

  it("computes correct totals for dualIncomeHousehold", async () => {
    const { dualIncomeHousehold } = await import("../test/fixtures/scenarios.js");

    prismaMock.incomeSource.findMany.mockResolvedValue(dualIncomeHousehold.incomeSources as any);
    prismaMock.committedBill.findMany.mockResolvedValue(dualIncomeHousehold.committedBills as any);
    prismaMock.yearlyBill.findMany.mockResolvedValue(dualIncomeHousehold.yearlyBills as any);
    prismaMock.discretionaryCategory.findMany.mockResolvedValue(
      dualIncomeHousehold.discretionaryCategories as any
    );
    prismaMock.savingsAllocation.findMany.mockResolvedValue(
      dualIncomeHousehold.savingsAllocations as any
    );

    const summary = await waterfallService.getWaterfallSummary("hh-dual");

    // 2 salaries: 3500 + 2800 = 6300
    expect(summary.income.total).toBe(6300);
    // committed: 1200 + 45 = 1245, yearly avg: 600/12 = 50
    // discretionary: 500 + 150 = 650, savings: 200
    // surplus: 6300 - 1245 - 50 - 650 - 200 = 4155
    expect(summary.surplus.amount).toBe(4155);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: FAIL — "Cannot find module '../test/fixtures/scenarios.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/test/fixtures/scenarios.ts

const now = new Date("2026-01-15T12:00:00Z");

// ─── Empty Household ──────────────────────────────────────────────────────────

export const emptyHousehold = {
  user: {
    id: "user-empty",
    email: "owner@empty.test",
    passwordHash: "$hashed",
    name: "Solo Owner",
    createdAt: now,
    updatedAt: now,
    preferences: {},
    twoFactorEnabled: false,
    twoFactorSecret: null,
    activeHouseholdId: "hh-empty",
  },
  household: {
    id: "hh-empty",
    name: "Empty Household",
    createdAt: now,
    updatedAt: now,
  },
  member: {
    householdId: "hh-empty",
    userId: "user-empty",
    role: "owner" as const,
    joinedAt: now,
  },
  incomeSources: [],
  committedBills: [],
  yearlyBills: [],
  discretionaryCategories: [],
  savingsAllocations: [],
  wealthAccounts: [],
};

// ─── Dual Income Household ────────────────────────────────────────────────────

export const dualIncomeHousehold = {
  users: [
    {
      id: "user-alice",
      email: "alice@dual.test",
      passwordHash: "$hashed",
      name: "Alice",
      createdAt: now,
      updatedAt: now,
      preferences: {},
      twoFactorEnabled: false,
      twoFactorSecret: null,
      activeHouseholdId: "hh-dual",
    },
    {
      id: "user-bob",
      email: "bob@dual.test",
      passwordHash: "$hashed",
      name: "Bob",
      createdAt: now,
      updatedAt: now,
      preferences: {},
      twoFactorEnabled: false,
      twoFactorSecret: null,
      activeHouseholdId: "hh-dual",
    },
  ],
  household: {
    id: "hh-dual",
    name: "Alice & Bob",
    createdAt: now,
    updatedAt: now,
  },
  members: [
    { householdId: "hh-dual", userId: "user-alice", role: "owner" as const, joinedAt: now },
    { householdId: "hh-dual", userId: "user-bob", role: "member" as const, joinedAt: now },
  ],
  settings: {
    id: "settings-dual",
    householdId: "hh-dual",
    surplusBenchmarkPct: 10,
    isaAnnualLimit: 20000,
    isaYearStartMonth: 4,
    isaYearStartDay: 6,
    stalenessThresholds: {
      income_source: 12,
      committed_bill: 6,
      yearly_bill: 12,
      discretionary_category: 12,
      savings_allocation: 12,
      wealth_account: 3,
    },
    createdAt: now,
    updatedAt: now,
  },
  incomeSources: [
    {
      id: "inc-alice",
      householdId: "hh-dual",
      name: "Alice Salary",
      amount: 3500,
      frequency: "monthly" as const,
      incomeType: "salary" as const,
      expectedMonth: null,
      ownerId: "user-alice",
      sortOrder: 0,
      endedAt: null,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "inc-bob",
      householdId: "hh-dual",
      name: "Bob Salary",
      amount: 2800,
      frequency: "monthly" as const,
      incomeType: "salary" as const,
      expectedMonth: null,
      ownerId: "user-bob",
      sortOrder: 1,
      endedAt: null,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  committedBills: [
    {
      id: "bill-rent",
      householdId: "hh-dual",
      name: "Rent",
      amount: 1200,
      ownerId: null,
      sortOrder: 0,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bill-internet",
      householdId: "hh-dual",
      name: "Internet",
      amount: 45,
      ownerId: null,
      sortOrder: 1,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  yearlyBills: [
    {
      id: "yearly-insurance",
      householdId: "hh-dual",
      name: "Home Insurance",
      amount: 600,
      dueMonth: 9,
      sortOrder: 0,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  discretionaryCategories: [
    {
      id: "disc-groceries",
      householdId: "hh-dual",
      name: "Groceries",
      monthlyBudget: 500,
      sortOrder: 0,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "disc-dining",
      householdId: "hh-dual",
      name: "Dining Out",
      monthlyBudget: 150,
      sortOrder: 1,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  savingsAllocations: [
    {
      id: "sav-emergency",
      householdId: "hh-dual",
      name: "Emergency Fund",
      monthlyAmount: 200,
      sortOrder: 0,
      wealthAccountId: "wa-isa",
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  wealthAccounts: [
    {
      id: "wa-isa",
      householdId: "hh-dual",
      assetClass: "cash" as const,
      name: "Alice ISA",
      provider: "Vanguard",
      notes: null,
      balance: 15000,
      interestRate: null,
      isISA: true,
      isaYearContribution: 4000,
      ownerId: "user-alice",
      isTrust: false,
      trustBeneficiaryName: null,
      valuationDate: now,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

// ─── Complex Household ────────────────────────────────────────────────────────

export const complexHousehold = {
  users: [
    {
      id: "user-carol",
      email: "carol@complex.test",
      passwordHash: "$hashed",
      name: "Carol",
      createdAt: now,
      updatedAt: now,
      preferences: {},
      twoFactorEnabled: false,
      twoFactorSecret: null,
      activeHouseholdId: "hh-complex",
    },
    {
      id: "user-dave",
      email: "dave@complex.test",
      passwordHash: "$hashed",
      name: "Dave",
      createdAt: now,
      updatedAt: now,
      preferences: {},
      twoFactorEnabled: false,
      twoFactorSecret: null,
      activeHouseholdId: "hh-complex",
    },
  ],
  household: {
    id: "hh-complex",
    name: "Carol & Dave",
    createdAt: now,
    updatedAt: now,
  },
  members: [
    { householdId: "hh-complex", userId: "user-carol", role: "owner" as const, joinedAt: now },
    { householdId: "hh-complex", userId: "user-dave", role: "member" as const, joinedAt: now },
  ],
  settings: {
    id: "settings-complex",
    householdId: "hh-complex",
    surplusBenchmarkPct: 15,
    isaAnnualLimit: 20000,
    isaYearStartMonth: 4,
    isaYearStartDay: 6,
    stalenessThresholds: {
      income_source: 12,
      committed_bill: 6,
      yearly_bill: 12,
      discretionary_category: 12,
      savings_allocation: 12,
      wealth_account: 3,
    },
    createdAt: now,
    updatedAt: now,
  },
  incomeSources: [
    {
      id: "inc-carol-salary",
      householdId: "hh-complex",
      name: "Carol Salary",
      amount: 4200,
      frequency: "monthly" as const,
      incomeType: "salary" as const,
      expectedMonth: null,
      ownerId: "user-carol",
      sortOrder: 0,
      endedAt: null,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "inc-dave-dividends",
      householdId: "hh-complex",
      name: "Dave Dividends",
      amount: 6000,
      frequency: "annual" as const,
      incomeType: "dividends" as const,
      expectedMonth: 4,
      ownerId: "user-dave",
      sortOrder: 1,
      endedAt: null,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "inc-bonus",
      householdId: "hh-complex",
      name: "Annual Bonus",
      amount: 3000,
      frequency: "one_off" as const,
      incomeType: "other" as const,
      expectedMonth: 12,
      ownerId: "user-carol",
      sortOrder: 2,
      endedAt: null,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  committedBills: [
    {
      id: "bill-mortgage",
      householdId: "hh-complex",
      name: "Mortgage",
      amount: 1800,
      ownerId: null,
      sortOrder: 0,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bill-council-tax",
      householdId: "hh-complex",
      name: "Council Tax",
      amount: 180,
      ownerId: null,
      sortOrder: 1,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bill-energy",
      householdId: "hh-complex",
      name: "Energy",
      amount: 150,
      ownerId: null,
      sortOrder: 2,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  yearlyBills: [
    {
      id: "yearly-car-insurance",
      householdId: "hh-complex",
      name: "Car Insurance",
      amount: 900,
      dueMonth: 3,
      sortOrder: 0,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "yearly-home-insurance",
      householdId: "hh-complex",
      name: "Home Insurance",
      amount: 480,
      dueMonth: 7,
      sortOrder: 1,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  discretionaryCategories: [
    {
      id: "disc-groceries-c",
      householdId: "hh-complex",
      name: "Groceries",
      monthlyBudget: 600,
      sortOrder: 0,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "disc-transport",
      householdId: "hh-complex",
      name: "Transport",
      monthlyBudget: 200,
      sortOrder: 1,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "disc-entertainment",
      householdId: "hh-complex",
      name: "Entertainment",
      monthlyBudget: 100,
      sortOrder: 2,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  savingsAllocations: [
    {
      id: "sav-isa-carol",
      householdId: "hh-complex",
      name: "Carol ISA",
      monthlyAmount: 500,
      sortOrder: 0,
      wealthAccountId: "wa-carol-isa",
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "sav-rainy-day",
      householdId: "hh-complex",
      name: "Rainy Day Fund",
      monthlyAmount: 100,
      sortOrder: 1,
      wealthAccountId: null,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  wealthAccounts: [
    {
      id: "wa-carol-isa",
      householdId: "hh-complex",
      assetClass: "cash" as const,
      name: "Carol S&S ISA",
      provider: "Hargreaves Lansdown",
      notes: null,
      balance: 42000,
      interestRate: null,
      isISA: true,
      isaYearContribution: 12000,
      ownerId: "user-carol",
      isTrust: false,
      trustBeneficiaryName: null,
      valuationDate: now,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "wa-dave-current",
      householdId: "hh-complex",
      assetClass: "cash" as const,
      name: "Dave Current Account",
      provider: "Monzo",
      notes: null,
      balance: 5000,
      interestRate: 1.5,
      isISA: false,
      isaYearContribution: null,
      ownerId: "user-dave",
      isTrust: false,
      trustBeneficiaryName: null,
      valuationDate: now,
      lastReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ],
  purchases: [
    {
      id: "purchase-sofa",
      householdId: "hh-complex",
      name: "New Sofa",
      estimatedCost: 1500,
      targetYear: 2026,
      targetMonth: 6,
      priority: "want" as const,
      status: "planned" as const,
      notes: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/test/fixtures/scenarios.ts apps/backend/src/services/waterfall.service.test.ts
git commit -m "feat(test): add emptyHousehold, dualIncomeHousehold, complexHousehold fixture snapshots"
```

---

### Task 12: Route Tests — settings.routes.test.ts

**Files:**

- Create: `apps/backend/src/routes/settings.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/settings.routes.test.ts
import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const settingsServiceMock = {
  getSettings: mock(() => Promise.resolve(null)),
  updateSettings: mock(() => Promise.resolve(null)),
};

mock.module("../services/settings.service", () => ({
  settingsService: settingsServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { settingsRoutes } from "./settings.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockSettings = {
  id: "s-1",
  householdId: "hh-1",
  surplusBenchmarkPct: 10,
  isaAnnualLimit: 20000,
  isaYearStartMonth: 4,
  isaYearStartDay: 6,
  stalenessThresholds: {},
};

beforeEach(() => {
  for (const method of Object.values(settingsServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  settingsServiceMock.getSettings.mockResolvedValue(mockSettings as any);
  settingsServiceMock.updateSettings.mockResolvedValue(mockSettings as any);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

describe("GET /api/settings", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with settings when authenticated", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().surplusBenchmarkPct).toBe(10);
  });
});

describe("PATCH /api/settings", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload: { surplusBenchmarkPct: 15 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with updated settings", async () => {
    const updated = { ...mockSettings, surplusBenchmarkPct: 15 };
    settingsServiceMock.updateSettings.mockResolvedValue(updated as any);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { surplusBenchmarkPct: 15 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().surplusBenchmarkPct).toBe(15);
  });

  it("returns 400 for invalid surplusBenchmarkPct", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { surplusBenchmarkPct: 200 },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts settings.routes`
Expected: FAIL initially (or PASS if the test code is correct and mocks work). Verify test file is found and runs.

- [ ] **Step 3: Skip** (test-first task — implementation already exists)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts settings.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/settings.routes.test.ts
git commit -m "test(settings): add route tests for GET and PATCH /api/settings"
```

---

### Task 13: Route Tests — review-session.routes.test.ts

**Files:**

- Create: `apps/backend/src/routes/review-session.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/review-session.routes.test.ts
import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const reviewSessionServiceMock = {
  getSession: mock(() => Promise.resolve(null)),
  createOrResetSession: mock(() => Promise.resolve(null)),
  updateSession: mock(() => Promise.resolve(null)),
  deleteSession: mock(() => Promise.resolve()),
};

mock.module("../services/review-session.service", () => ({
  reviewSessionService: reviewSessionServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { reviewRoutes } from "./review-session.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(reviewRoutes, { prefix: "/api/review" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockSession = {
  id: "rs-1",
  householdId: "hh-1",
  currentStep: 0,
  confirmedItems: {},
  updatedItems: {},
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  for (const method of Object.values(reviewSessionServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  reviewSessionServiceMock.getSession.mockResolvedValue(mockSession as any);
  reviewSessionServiceMock.createOrResetSession.mockResolvedValue(mockSession as any);
  reviewSessionServiceMock.updateSession.mockResolvedValue(mockSession as any);
  reviewSessionServiceMock.deleteSession.mockResolvedValue(undefined);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

describe("GET /api/review", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/review" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with session data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/review",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 with null when no session exists", async () => {
    reviewSessionServiceMock.getSession.mockResolvedValue(null);
    const res = await app.inject({
      method: "GET",
      url: "/api/review",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });
});

describe("POST /api/review", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "POST", url: "/api/review" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 when creating session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/review",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("PATCH /api/review", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/review",
      payload: { currentStep: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with updated session", async () => {
    const updated = { ...mockSession, currentStep: 2 };
    reviewSessionServiceMock.updateSession.mockResolvedValue(updated as any);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/review",
      headers: { authorization: "Bearer valid-token" },
      payload: { currentStep: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().currentStep).toBe(2);
  });

  it("returns 400 for invalid currentStep", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/review",
      headers: { authorization: "Bearer valid-token" },
      payload: { currentStep: -1 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/review", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/review" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 when deleting", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/review",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts review-session.routes`
Expected: PASS

- [ ] **Step 3: Skip** (test-only task)

- [ ] **Step 4: Verify**

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/review-session.routes.test.ts
git commit -m "test(review-session): add route tests for all review session endpoints"
```

---

### Task 14: Route Tests — setup-session.routes.test.ts

**Files:**

- Create: `apps/backend/src/routes/setup-session.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/setup-session.routes.test.ts
import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const setupSessionServiceMock = {
  getSession: mock(() => Promise.resolve(null)),
  createOrResetSession: mock(() => Promise.resolve(null)),
  updateSession: mock(() => Promise.resolve(null)),
  deleteSession: mock(() => Promise.resolve()),
};

mock.module("../services/setup-session.service", () => ({
  setupSessionService: setupSessionServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { setupRoutes } from "./setup-session.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(setupRoutes, { prefix: "/api/setup" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockSession = {
  id: "ss-1",
  householdId: "hh-1",
  currentStep: 0,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  for (const method of Object.values(setupSessionServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  setupSessionServiceMock.getSession.mockResolvedValue(mockSession as any);
  setupSessionServiceMock.createOrResetSession.mockResolvedValue(mockSession as any);
  setupSessionServiceMock.updateSession.mockResolvedValue(mockSession as any);
  setupSessionServiceMock.deleteSession.mockResolvedValue(undefined);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

describe("GET /api/setup", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/setup" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with session data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/setup",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/setup", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "POST", url: "/api/setup" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 when creating session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/setup",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("PATCH /api/setup", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/setup",
      payload: { currentStep: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with updated session", async () => {
    const updated = { ...mockSession, currentStep: 2 };
    setupSessionServiceMock.updateSession.mockResolvedValue(updated as any);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/setup",
      headers: { authorization: "Bearer valid-token" },
      payload: { currentStep: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().currentStep).toBe(2);
  });

  it("returns 400 for negative currentStep", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/setup",
      headers: { authorization: "Bearer valid-token" },
      payload: { currentStep: -1 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/setup", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/setup" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 when deleting", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/setup",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts setup-session.routes`
Expected: PASS

- [ ] **Step 3: Skip** (test-only task)

- [ ] **Step 4: Verify**

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/setup-session.routes.test.ts
git commit -m "test(setup-session): add route tests for all setup session endpoints"
```

---

### Task 15: Route Tests — snapshots.routes.test.ts

**Files:**

- Create: `apps/backend/src/routes/snapshots.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/snapshots.routes.test.ts
import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const snapshotServiceMock = {
  listSnapshots: mock(() => Promise.resolve([])),
  getSnapshot: mock(() => Promise.resolve(null)),
  createSnapshot: mock(() => Promise.resolve(null)),
  renameSnapshot: mock(() => Promise.resolve(null)),
  deleteSnapshot: mock(() => Promise.resolve()),
};

mock.module("../services/snapshot.service", () => ({
  snapshotService: snapshotServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { snapshotRoutes } from "./snapshots.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(snapshotRoutes, { prefix: "/api/snapshots" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockSnapshot = {
  id: "snap-1",
  householdId: "hh-1",
  name: "March 2026",
  data: {},
  isAuto: false,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  for (const method of Object.values(snapshotServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  snapshotServiceMock.listSnapshots.mockResolvedValue([mockSnapshot] as any);
  snapshotServiceMock.getSnapshot.mockResolvedValue(mockSnapshot as any);
  snapshotServiceMock.createSnapshot.mockResolvedValue(mockSnapshot as any);
  snapshotServiceMock.renameSnapshot.mockResolvedValue(mockSnapshot as any);
  snapshotServiceMock.deleteSnapshot.mockResolvedValue(undefined);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

describe("GET /api/snapshots", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/snapshots" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with snapshot list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/snapshots",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});

describe("GET /api/snapshots/:id", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/snapshots/snap-1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with snapshot data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/snapshots/snap-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("March 2026");
  });
});

describe("POST /api/snapshots", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/snapshots",
      payload: { name: "Test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created snapshot", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/snapshots",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Test Snapshot" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/snapshots",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/snapshots/:id", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/snapshots/snap-1",
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with renamed snapshot", async () => {
    const renamed = { ...mockSnapshot, name: "Renamed" };
    snapshotServiceMock.renameSnapshot.mockResolvedValue(renamed as any);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/snapshots/snap-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed");
  });
});

describe("DELETE /api/snapshots/:id", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/snapshots/snap-1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 when deleting", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/snapshots/snap-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshots.routes`
Expected: PASS

- [ ] **Step 3: Skip** (test-only task)

- [ ] **Step 4: Verify**

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/snapshots.routes.test.ts
git commit -m "test(snapshots): add route tests for all snapshot endpoints"
```

---

### Task 16: Route Tests — wealth.routes.test.ts

**Files:**

- Create: `apps/backend/src/routes/wealth.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/wealth.routes.test.ts
import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const wealthServiceMock = {
  getWealthSummary: mock(() => Promise.resolve({ totalBalance: 0, accounts: [] })),
  getIsaAllowance: mock(() =>
    Promise.resolve({ taxYearStart: "", taxYearEnd: "", annualLimit: 20000, byPerson: [] })
  ),
  listAccounts: mock(() => Promise.resolve([])),
  getAccount: mock(() => Promise.resolve(null)),
  createAccount: mock(() => Promise.resolve(null)),
  updateAccount: mock(() => Promise.resolve(null)),
  deleteAccount: mock(() => Promise.resolve()),
  updateValuation: mock(() => Promise.resolve(null)),
  confirmAccount: mock(() => Promise.resolve(null)),
  confirmBatch: mock(() => Promise.resolve()),
  getHistory: mock(() => Promise.resolve([])),
};

mock.module("../services/wealth.service", () => ({
  wealthService: wealthServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { wealthRoutes } from "./wealth.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(wealthRoutes, { prefix: "/api/wealth" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockAccount = {
  id: "wa-1",
  householdId: "hh-1",
  assetClass: "cash",
  name: "Test ISA",
  balance: 10000,
};

beforeEach(() => {
  for (const method of Object.values(wealthServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  wealthServiceMock.getWealthSummary.mockResolvedValue({ totalBalance: 0, accounts: [] } as any);
  wealthServiceMock.getIsaAllowance.mockResolvedValue({
    taxYearStart: "",
    taxYearEnd: "",
    annualLimit: 20000,
    byPerson: [],
  } as any);
  wealthServiceMock.listAccounts.mockResolvedValue([mockAccount] as any);
  wealthServiceMock.getAccount.mockResolvedValue(mockAccount as any);
  wealthServiceMock.createAccount.mockResolvedValue(mockAccount as any);
  wealthServiceMock.updateAccount.mockResolvedValue(mockAccount as any);
  wealthServiceMock.updateValuation.mockResolvedValue(mockAccount as any);
  wealthServiceMock.confirmAccount.mockResolvedValue(mockAccount as any);
  wealthServiceMock.confirmBatch.mockResolvedValue(undefined);
  wealthServiceMock.getHistory.mockResolvedValue([] as any);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

describe("GET /api/wealth", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/wealth" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with wealth summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/wealth",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /api/wealth/isa-allowance", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/wealth/isa-allowance" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with ISA allowance", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/wealth/isa-allowance",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().annualLimit).toBe(20000);
  });
});

describe("GET /api/wealth/accounts", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/wealth/accounts" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with account list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/wealth/accounts",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});

describe("POST /api/wealth/accounts", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/wealth/accounts",
      payload: { name: "Test", assetClass: "cash", balance: 0 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created account", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/wealth/accounts",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "New Account", assetClass: "cash", balance: 5000 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/wealth/accounts",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/wealth/accounts/:id", () => {
  it("returns 200 with updated account", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/wealth/accounts/wa-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("DELETE /api/wealth/accounts/:id", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/wealth/accounts/wa-1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 when deleting", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/wealth/accounts/wa-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(204);
  });
});

describe("POST /api/wealth/accounts/:id/valuation", () => {
  it("returns 200 with updated valuation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/wealth/accounts/wa-1/valuation",
      headers: { authorization: "Bearer valid-token" },
      payload: { balance: 12000 },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/wealth/accounts/:id/confirm", () => {
  it("returns 200 confirming account", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/wealth/accounts/wa-1/confirm",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/wealth/accounts/confirm-batch", () => {
  it("returns 204 when batch confirming", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/wealth/accounts/confirm-batch",
      headers: { authorization: "Bearer valid-token" },
      payload: { accountIds: ["wa-1"] },
    });
    expect(res.statusCode).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts wealth.routes`
Expected: PASS

- [ ] **Step 3: Skip** (test-only task)

- [ ] **Step 4: Verify**

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/wealth.routes.test.ts
git commit -m "test(wealth): add route tests for all wealth endpoints"
```

---

### Task 17: Route Tests — waterfall.routes.test.ts

**Files:**

- Create: `apps/backend/src/routes/waterfall.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/waterfall.routes.test.ts
import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const waterfallServiceMock = {
  getWaterfallSummary: mock(() =>
    Promise.resolve({ income: {}, committed: {}, discretionary: {}, surplus: {} })
  ),
  getCashflow: mock(() => Promise.resolve([])),
  listIncome: mock(() => Promise.resolve([])),
  listEndedIncome: mock(() => Promise.resolve([])),
  createIncome: mock(() => Promise.resolve(null)),
  updateIncome: mock(() => Promise.resolve(null)),
  deleteIncome: mock(() => Promise.resolve()),
  endIncome: mock(() => Promise.resolve(null)),
  reactivateIncome: mock(() => Promise.resolve(null)),
  confirmIncome: mock(() => Promise.resolve(null)),
  listCommitted: mock(() => Promise.resolve([])),
  createCommitted: mock(() => Promise.resolve(null)),
  updateCommitted: mock(() => Promise.resolve(null)),
  deleteCommitted: mock(() => Promise.resolve()),
  confirmCommitted: mock(() => Promise.resolve(null)),
  listYearly: mock(() => Promise.resolve([])),
  createYearly: mock(() => Promise.resolve(null)),
  updateYearly: mock(() => Promise.resolve(null)),
  deleteYearly: mock(() => Promise.resolve()),
  confirmYearly: mock(() => Promise.resolve(null)),
  listDiscretionary: mock(() => Promise.resolve([])),
  createDiscretionary: mock(() => Promise.resolve(null)),
  updateDiscretionary: mock(() => Promise.resolve(null)),
  deleteDiscretionary: mock(() => Promise.resolve()),
  confirmDiscretionary: mock(() => Promise.resolve(null)),
  listSavings: mock(() => Promise.resolve([])),
  createSavings: mock(() => Promise.resolve(null)),
  updateSavings: mock(() => Promise.resolve(null)),
  deleteSavings: mock(() => Promise.resolve()),
  confirmSavings: mock(() => Promise.resolve(null)),
  getHistory: mock(() => Promise.resolve([])),
  confirmBatch: mock(() => Promise.resolve()),
  deleteAll: mock(() => Promise.resolve()),
};

const snapshotServiceMock = {
  ensureJan1Snapshot: mock(() => Promise.resolve()),
};

mock.module("../services/waterfall.service", () => ({
  waterfallService: waterfallServiceMock,
}));

mock.module("../services/snapshot.service", () => ({
  snapshotService: snapshotServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { waterfallRoutes } from "./waterfall.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(waterfallRoutes, { prefix: "/api/waterfall" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  for (const method of Object.values(waterfallServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  for (const method of Object.values(snapshotServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }

  // Default return values
  waterfallServiceMock.getWaterfallSummary.mockResolvedValue({
    income: {},
    committed: {},
    discretionary: {},
    surplus: {},
  } as any);
  waterfallServiceMock.getCashflow.mockResolvedValue([] as any);
  waterfallServiceMock.listIncome.mockResolvedValue([]);
  waterfallServiceMock.createIncome.mockResolvedValue({ id: "inc-1" } as any);
  waterfallServiceMock.updateIncome.mockResolvedValue({ id: "inc-1" } as any);
  waterfallServiceMock.confirmIncome.mockResolvedValue({ id: "inc-1" } as any);
  waterfallServiceMock.listCommitted.mockResolvedValue([]);
  waterfallServiceMock.createCommitted.mockResolvedValue({ id: "bill-1" } as any);
  waterfallServiceMock.listYearly.mockResolvedValue([]);
  waterfallServiceMock.createYearly.mockResolvedValue({ id: "yearly-1" } as any);
  waterfallServiceMock.listDiscretionary.mockResolvedValue([]);
  waterfallServiceMock.createDiscretionary.mockResolvedValue({ id: "disc-1" } as any);
  waterfallServiceMock.listSavings.mockResolvedValue([]);
  waterfallServiceMock.createSavings.mockResolvedValue({ id: "sav-1" } as any);
  waterfallServiceMock.confirmBatch.mockResolvedValue(undefined);
  waterfallServiceMock.deleteAll.mockResolvedValue(undefined);
  snapshotServiceMock.ensureJan1Snapshot.mockResolvedValue(undefined);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

// ─── Summary & Cashflow ──────────────────────────────────────────────────────

describe("GET /api/waterfall", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/waterfall" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with waterfall summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /api/waterfall/cashflow", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/waterfall/cashflow" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with cashflow data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/cashflow?year=2026",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ─── Income CRUD ─────────────────────────────────────────────────────────────

describe("GET /api/waterfall/income", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/waterfall/income" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with income sources", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/waterfall/income", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      payload: { name: "Salary", amount: 3000, frequency: "monthly" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created income", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Salary", amount: 3000, frequency: "monthly" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for invalid frequency", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Salary", amount: 3000, frequency: "weekly" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for missing name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { amount: 3000, frequency: "monthly" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Committed Bills CRUD ────────────────────────────────────────────────────

describe("POST /api/waterfall/committed", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      payload: { name: "Rent", amount: 1200 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created bill", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Rent", amount: 1200 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing amount", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/committed",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Rent" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Yearly Bills CRUD ──────────────────────────────────────────────────────

describe("POST /api/waterfall/yearly", () => {
  it("returns 201 with created yearly bill", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/yearly",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Car Tax", amount: 600, dueMonth: 3 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing dueMonth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/yearly",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Car Tax", amount: 600 },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Discretionary CRUD ──────────────────────────────────────────────────────

describe("POST /api/waterfall/discretionary", () => {
  it("returns 201 with created category", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/discretionary",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Groceries", monthlyBudget: 500 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing monthlyBudget", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/discretionary",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Groceries" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Savings CRUD ────────────────────────────────────────────────────────────

describe("POST /api/waterfall/savings", () => {
  it("returns 201 with created allocation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/savings",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Emergency Fund", monthlyAmount: 200 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing monthlyAmount", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/savings",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Emergency Fund" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Batch operations ────────────────────────────────────────────────────────

describe("POST /api/waterfall/confirm-batch", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/confirm-batch",
      payload: { items: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 with valid batch", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/confirm-batch",
      headers: { authorization: "Bearer valid-token" },
      payload: { items: [{ type: "income_source", id: "inc-1" }] },
    });
    expect(res.statusCode).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: PASS

- [ ] **Step 3: Skip** (test-only task)

- [ ] **Step 4: Verify**

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/waterfall.routes.test.ts
git commit -m "test(waterfall): add route tests for all waterfall endpoints"
```

---

### Task 18: Route Tests — planner.routes.test.ts

**Files:**

- Create: `apps/backend/src/routes/planner.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/planner.routes.test.ts
import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const plannerServiceMock = {
  listPurchases: mock(() => Promise.resolve([])),
  createPurchase: mock(() => Promise.resolve(null)),
  updatePurchase: mock(() => Promise.resolve(null)),
  deletePurchase: mock(() => Promise.resolve()),
  getYearBudget: mock(() => Promise.resolve(null)),
  upsertYearBudget: mock(() => Promise.resolve(null)),
  getUpcomingGifts: mock(() => Promise.resolve([])),
  listGiftPersons: mock(() => Promise.resolve([])),
  getGiftPerson: mock(() => Promise.resolve(null)),
  createGiftPerson: mock(() => Promise.resolve(null)),
  updateGiftPerson: mock(() => Promise.resolve(null)),
  deleteGiftPerson: mock(() => Promise.resolve()),
  createGiftEvent: mock(() => Promise.resolve(null)),
  updateGiftEvent: mock(() => Promise.resolve(null)),
  deleteGiftEvent: mock(() => Promise.resolve()),
  upsertGiftYearRecord: mock(() => Promise.resolve(null)),
};

mock.module("../services/planner.service", () => ({
  plannerService: plannerServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { plannerRoutes } from "./planner.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(plannerRoutes, { prefix: "/api/planner" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockPurchase = { id: "p-1", householdId: "hh-1", name: "Sofa", estimatedCost: 1500 };

beforeEach(() => {
  for (const method of Object.values(plannerServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  plannerServiceMock.listPurchases.mockResolvedValue([mockPurchase] as any);
  plannerServiceMock.createPurchase.mockResolvedValue(mockPurchase as any);
  plannerServiceMock.updatePurchase.mockResolvedValue(mockPurchase as any);
  plannerServiceMock.getYearBudget.mockResolvedValue({ id: "yb-1", amount: 5000 } as any);
  plannerServiceMock.upsertYearBudget.mockResolvedValue({ id: "yb-1", amount: 5000 } as any);
  plannerServiceMock.getUpcomingGifts.mockResolvedValue([]);
  plannerServiceMock.listGiftPersons.mockResolvedValue([]);
  plannerServiceMock.getGiftPerson.mockResolvedValue({ id: "gp-1", name: "Alice" } as any);
  plannerServiceMock.createGiftPerson.mockResolvedValue({ id: "gp-1", name: "Alice" } as any);
  plannerServiceMock.updateGiftPerson.mockResolvedValue({ id: "gp-1" } as any);
  plannerServiceMock.createGiftEvent.mockResolvedValue({ id: "ge-1" } as any);
  plannerServiceMock.updateGiftEvent.mockResolvedValue({ id: "ge-1" } as any);
  plannerServiceMock.upsertGiftYearRecord.mockResolvedValue({ id: "gyr-1" } as any);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

// ─── Purchases ───────────────────────────────────────────────────────────────

describe("GET /api/planner/purchases", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/planner/purchases" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with purchases", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/planner/purchases",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/planner/purchases", () => {
  it("returns 201 with created purchase", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/planner/purchases",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Sofa",
        estimatedCost: 1500,
        targetYear: 2026,
        priority: "want",
        status: "planned",
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/planner/purchases",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Sofa" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/planner/purchases/:id", () => {
  it("returns 200 with updated purchase", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/planner/purchases/p-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "New Sofa" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("DELETE /api/planner/purchases/:id", () => {
  it("returns 204 when deleting", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/planner/purchases/p-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(204);
  });
});

// ─── Year budget ─────────────────────────────────────────────────────────────

describe("GET /api/planner/budget/:year", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/planner/budget/2026" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with budget", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/planner/budget/2026",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("PUT /api/planner/budget/:year", () => {
  it("returns 200 with upserted budget", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/planner/budget/2026",
      headers: { authorization: "Bearer valid-token" },
      payload: { amount: 6000 },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ─── Gift persons ────────────────────────────────────────────────────────────

describe("GET /api/planner/gifts/persons", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/planner/gifts/persons" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with gift persons", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/planner/gifts/persons",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/planner/gifts/persons", () => {
  it("returns 201 with created person", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/planner/gifts/persons",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Alice" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/planner/gifts/persons",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Gift events ─────────────────────────────────────────────────────────────

describe("POST /api/planner/gifts/persons/:id/events", () => {
  it("returns 201 with created event", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/planner/gifts/persons/gp-1/events",
      headers: { authorization: "Bearer valid-token" },
      payload: { eventType: "birthday", recurrence: "annual", month: 6, day: 15 },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("DELETE /api/planner/gifts/events/:id", () => {
  it("returns 204 when deleting event", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/planner/gifts/events/ge-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(204);
  });
});

// ─── Upcoming gifts ──────────────────────────────────────────────────────────

describe("GET /api/planner/gifts/upcoming", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/planner/gifts/upcoming" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with upcoming gifts", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/planner/gifts/upcoming?year=2026",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts planner.routes`
Expected: PASS

- [ ] **Step 3: Skip** (test-only task)

- [ ] **Step 4: Verify**

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/planner.routes.test.ts
git commit -m "test(planner): add route tests for all planner endpoints"
```

---

### Task 19: Seed Data

**Files:**

- Modify: `apps/backend/src/db/seed.ts`

- [ ] **Step 1: Write the failing test**

No automated unit test for the seed script. Manual verification via `bun run db:seed`.

- [ ] **Step 2: Skip**

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/db/seed.ts`:

```typescript
import { prisma } from "../config/database";
import { hashPassword } from "../utils/password";

if (process.env.NODE_ENV === "production") {
  console.log("Seed skipped in production");
  process.exit(0);
}

async function main() {
  const email = "owner@finplan.test";
  const password = "BrowserTest123!";

  // ─── User & Household ──────────────────────────────────────────────────────

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: "Test Owner",
    },
    update: { passwordHash, name: "Test Owner" },
  });

  const household = await prisma.household.upsert({
    where: { id: user.activeHouseholdId ?? "seed-household" },
    create: {
      name: "Test Household",
      members: {
        create: { userId: user.id, role: "owner" },
      },
    },
    update: {},
  });

  // Update active household
  await prisma.user.update({
    where: { id: user.id },
    data: { activeHouseholdId: household.id },
  });

  const hId = household.id;

  // ─── Household Settings ────────────────────────────────────────────────────

  await prisma.householdSettings.upsert({
    where: { householdId: hId },
    create: { householdId: hId },
    update: {},
  });

  // ─── Income Sources ────────────────────────────────────────────────────────

  const incomeData = [
    {
      name: "Alice Salary",
      amount: 3500,
      frequency: "monthly" as const,
      incomeType: "salary" as const,
      ownerId: user.id,
      sortOrder: 0,
    },
    {
      name: "Bob Salary",
      amount: 2800,
      frequency: "monthly" as const,
      incomeType: "salary" as const,
      sortOrder: 1,
    },
  ];

  for (const income of incomeData) {
    const existing = await prisma.incomeSource.findFirst({
      where: { householdId: hId, name: income.name },
    });
    if (!existing) {
      await prisma.incomeSource.create({ data: { householdId: hId, ...income } });
    }
  }

  // ─── Committed Bills ──────────────────────────────────────────────────────

  const committedData = [
    { name: "Rent", amount: 1200, sortOrder: 0 },
    { name: "Internet", amount: 45, sortOrder: 1 },
    { name: "Phone", amount: 25, sortOrder: 2 },
  ];

  for (const bill of committedData) {
    const existing = await prisma.committedBill.findFirst({
      where: { householdId: hId, name: bill.name },
    });
    if (!existing) {
      await prisma.committedBill.create({ data: { householdId: hId, ...bill } });
    }
  }

  // ─── Yearly Bills ─────────────────────────────────────────────────────────

  const yearlyData = [
    { name: "Home Insurance", amount: 600, dueMonth: 9, sortOrder: 0 },
    { name: "Car Tax", amount: 180, dueMonth: 3, sortOrder: 1 },
  ];

  for (const bill of yearlyData) {
    const existing = await prisma.yearlyBill.findFirst({
      where: { householdId: hId, name: bill.name },
    });
    if (!existing) {
      await prisma.yearlyBill.create({ data: { householdId: hId, ...bill } });
    }
  }

  // ─── Discretionary Categories ──────────────────────────────────────────────

  const discretionaryData = [
    { name: "Groceries", monthlyBudget: 500, sortOrder: 0 },
    { name: "Dining Out", monthlyBudget: 150, sortOrder: 1 },
    { name: "Entertainment", monthlyBudget: 80, sortOrder: 2 },
  ];

  for (const cat of discretionaryData) {
    const existing = await prisma.discretionaryCategory.findFirst({
      where: { householdId: hId, name: cat.name },
    });
    if (!existing) {
      await prisma.discretionaryCategory.create({ data: { householdId: hId, ...cat } });
    }
  }

  // ─── Savings Allocations ───────────────────────────────────────────────────

  const savingsData = [{ name: "Emergency Fund", monthlyAmount: 200, sortOrder: 0 }];

  for (const sav of savingsData) {
    const existing = await prisma.savingsAllocation.findFirst({
      where: { householdId: hId, name: sav.name },
    });
    if (!existing) {
      await prisma.savingsAllocation.create({ data: { householdId: hId, ...sav } });
    }
  }

  // ─── Wealth Account ────────────────────────────────────────────────────────

  const accountData = [
    {
      name: "Cash ISA",
      assetClass: "cash" as const,
      balance: 15000,
      isISA: true,
      isaYearContribution: 4000,
      ownerId: user.id,
    },
  ];

  for (const acc of accountData) {
    const existing = await prisma.wealthAccount.findFirst({
      where: { householdId: hId, name: acc.name },
    });
    if (!existing) {
      await prisma.wealthAccount.create({ data: { householdId: hId, ...acc } });
    }
  }

  console.log(`Seed complete: user=${email}, household=${household.name} (${hId})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Run to verify**

Run: `bun run db:seed`
Expected: "Seed complete: user=owner@finplan.test, household=Test Household (...)"

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/seed.ts
git commit -m "feat(seed): add realistic development seed data with browser test user"
```

---

## Testing

### Backend Tests

- [ ] Service: `toGBP` rounds surplus and ISA remaining to 2dp
- [ ] Service: `ensureJan1Snapshot` creates auto snapshot only on Jan 1 via DI clock
- [ ] Service: `getIsaAllowance` computes correct tax year boundary via DI clock
- [ ] Service: `getUpcomingGifts` marks events as done/upcoming via DI clock
- [ ] Service: `getSession` validates JSON and throws `ValidationError` on bad data
- [ ] Route: all 7 untested routes have 401, 400, and 2xx coverage
- [ ] Fixture: `emptyHousehold` produces zeroed waterfall summary
- [ ] Fixture: `dualIncomeHousehold` produces correct surplus calculation

### Frontend Tests

- [ ] `monthsElapsed` returns correct months with injected `now`
- [ ] `isStale` respects threshold with injected `now`
- [ ] `stalenessLabel` returns correct text with injected `now`

### Key Scenarios

- [ ] Happy path: all existing tests continue to pass (DI clock default = `new Date()`)
- [ ] Edge case: `toGBP(1000/3)` returns exactly `333.33`
- [ ] Edge case: ISA allowance boundary at exactly April 6
- [ ] Edge case: ReviewSession with corrupt JSON throws `ValidationError`

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `cd apps/backend && bun scripts/run-tests.ts` — all tests pass
- [ ] `cd apps/frontend && bunx vitest run src/utils/staleness.test.ts` — passes
- [ ] `cd packages/shared && bun test` — all shared tests pass
- [ ] `bun run db:seed` runs cleanly on fresh database
- [ ] Manual: verify seeded app shows data on waterfall, wealth, and planner pages

## Post-conditions

- [ ] All 10 route files now have test coverage (auth + invite + 7 new)
- [ ] Date-sensitive functions are deterministically testable — enables reliable CI for boundary conditions
- [ ] `toGBP` available for future calculations — prepares for pence-integer migration
- [ ] Fixture snapshots available for future service tests — reduces boilerplate
- [ ] Seed data enables browser automation testing (`/verify-implementation`)
- [ ] ReviewSession JSON validated on read — prevents silent frontend errors from serialisation drift
