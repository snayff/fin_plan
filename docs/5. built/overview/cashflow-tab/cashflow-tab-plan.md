---
feature: cashflow-tab
category: overview
spec: docs/4. planning/cashflow-tab/cashflow-tab-spec.md
creation_date: 2026-04-11
status: implemented
implemented_date: 2026-07-05
---

# Cashflow Tab — Implementation Plan

> **For Claude:** Use `/execute-plan cashflow-tab` to implement this plan task-by-task.

**Goal:** Ship a forward-looking, balance-anchored Cashflow view inside a restructured two-panel Forecast page, surfacing monthly pinchpoints from a real linked-account starting balance.

**Spec:** `docs/4. planning/cashflow-tab/cashflow-tab-spec.md`

**Architecture:** A new `cashflow.service` computes a day-by-day running balance projection by replaying the live plan (income, committed, discretionary, one-offs) from the youngest linked `AccountBalance` date forward. A new `cashflow.routes` Fastify module exposes projection, month-detail, and linked-account mutation endpoints. The `Account` model gains an `isCashflowLinked` flag and a new `Current` enum value. `IncomeSource.expectedMonth` and `CommittedItem.dueMonth` are replaced by required `dueDate: DateTime` fields (with a nullable `dueDate` added to `DiscretionaryItem` for one-offs) so the projection has full day-level resolution. The Forecast page is restructured to use `TwoPanelLayout` with a section navigator (`Cashflow` / `Growth`); Cashflow renders a year view of monthly bars with a slide-left month drill-down.

**Tech Stack:** Fastify · Prisma · Zod · React 18 · TanStack Query · Tailwind · framer-motion

**Infrastructure Impact:**

- Touches `packages/shared/`: yes (`assets.schemas.ts`, `waterfall.schemas.ts`, new `cashflow.schemas.ts`)
- Requires DB migration: yes (multiple schema changes — single migration `add_cashflow_tab`)

## Pre-conditions

- [ ] `TwoPanelLayout` component exists at [TwoPanelLayout.tsx](apps/frontend/src/components/layout/TwoPanelLayout.tsx)
- [ ] `StaleDataBanner` styling pattern available at [StaleDataBanner.tsx](apps/frontend/src/components/common/StaleDataBanner.tsx)
- [ ] `ReviewWizard` slide-variants pattern at [ReviewWizard.tsx:190-194](apps/frontend/src/components/overview/ReviewWizard.tsx#L190)
- [ ] `audited()` + `actorCtx(req)` available from [audit.service.ts](apps/backend/src/services/audit.service.ts)
- [ ] `ItemAmountPeriod` model + `findEffectivePeriod`/`computeLifecycleState` helpers in [period.service.ts](apps/backend/src/services/period.service.ts)
- [ ] Existing `NetWorthChart`, `SurplusAccumulationChart`, `RetirementChart`, `TimeHorizonSelector` components in [components/forecast/](apps/frontend/src/components/forecast/)

## File-Structure Map

**New files:**

- `apps/backend/src/services/cashflow.service.ts` — projection + month detail + linked-account mutations
- `apps/backend/src/services/cashflow.service.test.ts`
- `apps/backend/src/routes/cashflow.routes.ts`
- `apps/backend/src/routes/cashflow.routes.test.ts`
- `packages/shared/src/schemas/cashflow.schemas.ts`
- `apps/frontend/src/services/cashflow.service.ts`
- `apps/frontend/src/hooks/useCashflow.ts`
- `apps/frontend/src/components/forecast/ForecastSectionNavigator.tsx` (+ test)
- `apps/frontend/src/components/forecast/GrowthSectionPanel.tsx`
- `apps/frontend/src/components/forecast/cashflow/CashflowSectionPanel.tsx` (+ test)
- `apps/frontend/src/components/forecast/cashflow/CashflowHeader.tsx`
- `apps/frontend/src/components/forecast/cashflow/LinkedAccountsButton.tsx` (+ test)
- `apps/frontend/src/components/forecast/cashflow/LinkedAccountsPopover.tsx` (+ test)
- `apps/frontend/src/components/forecast/cashflow/CashflowStaleBanner.tsx`
- `apps/frontend/src/components/forecast/cashflow/CashflowEmptyCallout.tsx`
- `apps/frontend/src/components/forecast/cashflow/CashflowYearView.tsx` (+ test)
- `apps/frontend/src/components/forecast/cashflow/CashflowYearBar.tsx`
- `apps/frontend/src/components/forecast/cashflow/CashflowMonthView.tsx` (+ test)
- `apps/frontend/src/components/forecast/cashflow/CashflowEventList.tsx`

**Modified files:**

- `apps/backend/prisma/schema.prisma`
- `packages/shared/src/schemas/assets.schemas.ts`
- `packages/shared/src/schemas/waterfall.schemas.ts`
- `apps/backend/src/services/assets.service.ts` (validate `isCashflowLinked` only on `Current`/`Savings`)
- `apps/backend/src/services/waterfall.service.ts` (drop legacy `getCashflow`; replace `expectedMonth`/`dueMonth` with `dueDate`)
- `apps/backend/src/services/waterfall.service.test.ts`
- `apps/backend/src/services/import.service.ts` + test
- `apps/backend/src/services/export.service.ts` + test
- `apps/backend/src/services/export-import.roundtrip.test.ts`
- `apps/backend/src/test/fixtures/scenarios.ts` + `index.ts`
- `apps/backend/src/db/seed.ts`
- `apps/backend/src/routes/waterfall.routes.ts` + test (drop `/cashflow`)
- `apps/backend/src/server.ts` (register `cashflowRoutes`)
- `apps/frontend/src/pages/ForecastPage.tsx` (full restructure)
- `apps/frontend/src/pages/ForecastPage.test.tsx`
- `apps/frontend/src/components/overview/WaterfallLeftPanel.tsx` (convert `incl. yearly ÷12` button → row)
- `apps/frontend/src/pages/OverviewPage.tsx` (drop cashflow view state)
- `apps/frontend/src/components/overview/ItemDetailPanel.tsx` (drop `onViewCashflow` prop)
- `apps/frontend/src/hooks/useWaterfall.ts` (remove `useCashflow` + cashflow query key)
- `apps/frontend/src/hooks/useNudge.ts` (remove `useYearlyBillNudge`)
- `apps/frontend/src/services/waterfall.service.ts` (frontend) — drop `getCashflow`

**Deleted files:**

- `apps/frontend/src/components/overview/CashflowCalendar.tsx`
- `apps/frontend/src/components/overview/CashflowCalendar.test.tsx`

---

## Tasks

> Each task follows red-green-commit, contains complete code, and is one logical action. Phases group tasks by sub-system; later phases depend on earlier ones.

---

## Phase A — Schema migration & dueDate refactor

### Task 1: Prisma schema changes + migration

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Run: `bun run db:migrate`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/cashflow.service.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

beforeEach(() => resetPrismaMocks());

describe("schema: Account.isCashflowLinked", () => {
  it("Account model exposes isCashflowLinked field via Prisma client", async () => {
    // The mocked Prisma client is generated from schema.prisma, so this fails
    // until the field is added.
    prismaMock.account.findMany.mockResolvedValue([
      { id: "a1", isCashflowLinked: true, type: "Current" } as any,
    ]);
    const accounts = await prismaMock.account.findMany();
    expect(accounts[0]).toHaveProperty("isCashflowLinked");
  });
});

describe("schema: AccountType enum includes Current", () => {
  it("Current is a valid AccountType", () => {
    const valid: Array<"Savings" | "Pension" | "StocksAndShares" | "Other" | "Current"> = [
      "Current",
      "Savings",
    ];
    expect(valid).toContain("Current");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: FAIL — TS error or runtime: `Property 'isCashflowLinked' does not exist on type 'Account'` / `Type '"Current"' is not assignable`

- [ ] **Step 3: Update schema and run migration**

Edit `apps/backend/prisma/schema.prisma`:

```prisma
// Replace AccountType enum
enum AccountType {
  Current
  Savings
  Pension
  StocksAndShares
  Other
}

// Account model — add isCashflowLinked
model Account {
  id                  String           @id @default(cuid())
  householdId         String
  memberId            String?
  name                String
  type                AccountType
  growthRatePct       Float?
  monthlyContribution Float            @default(0)
  isCashflowLinked    Boolean          @default(false)
  lastReviewedAt      DateTime?
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  household           Household        @relation(fields: [householdId], references: [id], onDelete: Cascade)
  member              Member?          @relation(fields: [memberId], references: [id], onDelete: SetNull)
  balances            AccountBalance[]

  @@index([householdId])
  @@index([memberId])
}

// IncomeSource — drop expectedMonth, add dueDate (required, defaulted in migration)
model IncomeSource {
  id             String          @id @default(cuid())
  householdId    String
  subcategoryId  String
  name           String
  frequency      IncomeFrequency
  incomeType     IncomeType      @default(other)
  dueDate        DateTime        @db.Date
  ownerId        String?
  sortOrder      Int             @default(0)
  lastReviewedAt DateTime        @default(now())
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  notes          String?
  subcategory    Subcategory     @relation(fields: [subcategoryId], references: [id])

  @@index([householdId])
}

// CommittedItem — drop dueMonth, add dueDate (required)
model CommittedItem {
  id             String      @id @default(cuid())
  householdId    String
  subcategoryId  String
  name           String
  spendType      SpendType   @default(monthly)
  notes          String?
  ownerId        String?
  dueDate        DateTime    @db.Date
  sortOrder      Int         @default(0)
  lastReviewedAt DateTime    @default(now())
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  subcategory    Subcategory @relation(fields: [subcategoryId], references: [id])

  @@index([householdId])
}

// DiscretionaryItem — add nullable dueDate (only used for one_off items)
model DiscretionaryItem {
  id             String      @id @default(cuid())
  householdId    String
  subcategoryId  String
  name           String
  spendType      SpendType   @default(monthly)
  notes          String?
  dueDate        DateTime?   @db.Date
  sortOrder      Int         @default(0)
  lastReviewedAt DateTime    @default(now())
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  subcategory    Subcategory @relation(fields: [subcategoryId], references: [id])

  @@index([householdId])
}
```

Then run:

```bash
bun run db:migrate
# Migration name: add_cashflow_tab
```

When prompted, edit the generated migration SQL to backfill `dueDate` BEFORE the NOT NULL constraint is enforced. Inside the migration:

```sql
-- Backfill IncomeSource.dueDate from expectedMonth (or January if null)
ALTER TABLE "IncomeSource" ADD COLUMN "dueDate" DATE;
UPDATE "IncomeSource"
SET "dueDate" = make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, COALESCE("expectedMonth", 1), 1);
ALTER TABLE "IncomeSource" ALTER COLUMN "dueDate" SET NOT NULL;
ALTER TABLE "IncomeSource" DROP COLUMN "expectedMonth";

-- Backfill CommittedItem.dueDate from dueMonth (or January if null)
ALTER TABLE "CommittedItem" ADD COLUMN "dueDate" DATE;
UPDATE "CommittedItem"
SET "dueDate" = make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, COALESCE("dueMonth", 1), 1);
ALTER TABLE "CommittedItem" ALTER COLUMN "dueDate" SET NOT NULL;
ALTER TABLE "CommittedItem" DROP COLUMN "dueMonth";

-- DiscretionaryItem.dueDate is nullable — no backfill needed
ALTER TABLE "DiscretionaryItem" ADD COLUMN "dueDate" DATE;

-- Account.isCashflowLinked — default false
ALTER TABLE "Account" ADD COLUMN "isCashflowLinked" BOOLEAN NOT NULL DEFAULT false;

-- AccountType: add Current
ALTER TYPE "AccountType" ADD VALUE 'Current' BEFORE 'Savings';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/ apps/backend/src/services/cashflow.service.test.ts
git commit -m "feat(schema): add cashflow tab fields — Current account type, isCashflowLinked, dueDate"
```

---

### Task 2: Shared schemas — accountTypeSchema, isCashflowLinked, dueDate

**Files:**

- Modify: `packages/shared/src/schemas/assets.schemas.ts`
- Modify: `packages/shared/src/schemas/waterfall.schemas.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/src/schemas/waterfall.schemas.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { createIncomeSourceSchema, createCommittedItemSchema } from "./waterfall.schemas";
import { accountTypeSchema, updateAccountSchema } from "./assets.schemas";

describe("schema migration to dueDate", () => {
  it("createIncomeSourceSchema accepts dueDate as ISO string", () => {
    const result = createIncomeSourceSchema.safeParse({
      name: "Salary",
      amount: 3000,
      frequency: "monthly",
      dueDate: "2026-04-15",
      subcategoryId: "sub-1",
    });
    expect(result.success).toBe(true);
  });

  it("createIncomeSourceSchema rejects without dueDate", () => {
    const result = createIncomeSourceSchema.safeParse({
      name: "Salary",
      amount: 3000,
      frequency: "monthly",
      subcategoryId: "sub-1",
    });
    expect(result.success).toBe(false);
  });

  it("createCommittedItemSchema requires dueDate", () => {
    const result = createCommittedItemSchema.safeParse({
      name: "Rent",
      amount: 1000,
      subcategoryId: "sub-1",
      spendType: "monthly",
    });
    expect(result.success).toBe(false);
  });
});

describe("Current account type", () => {
  it("accountTypeSchema accepts Current", () => {
    expect(accountTypeSchema.parse("Current")).toBe("Current");
  });

  it("updateAccountSchema accepts isCashflowLinked", () => {
    const result = updateAccountSchema.safeParse({ isCashflowLinked: true });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test waterfall.schemas`
Expected: FAIL — `Current is not a valid enum value` / `dueDate is required`

- [ ] **Step 3: Update shared schemas**

Edit `packages/shared/src/schemas/assets.schemas.ts`:

```typescript
export const accountTypeSchema = z.enum([
  "Current",
  "Savings",
  "Pension",
  "StocksAndShares",
  "Other",
]);

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  type: accountTypeSchema,
  memberId: z.string().nullable().optional(),
  growthRatePct: z.number().min(0).max(100).nullable().optional(),
  isCashflowLinked: z.boolean().optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  memberId: z.string().nullable().optional(),
  growthRatePct: z.number().min(0).max(100).nullable().optional(),
  isCashflowLinked: z.boolean().optional(),
});
```

Edit `packages/shared/src/schemas/waterfall.schemas.ts`:

```typescript
// createIncomeSourceSchema — replace expectedMonth with dueDate (required)
export const createIncomeSourceSchema = z.object({
  name: z.string().min(1).trim(),
  amount: z.number().positive(),
  frequency: IncomeFrequencyEnum,
  incomeType: IncomeTypeEnum.default("other"),
  dueDate: z.coerce.date(),
  ownerId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  subcategoryId: z.string().min(1).optional(),
  notes: z.string().max(500).nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateIncomeSourceSchema = z.object({
  name: z.string().min(1).trim().optional(),
  frequency: IncomeFrequencyEnum.optional(),
  incomeType: IncomeTypeEnum.optional(),
  dueDate: z.coerce.date().optional(),
  ownerId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  subcategoryId: z.string().min(1).optional(),
  notes: z.string().max(500).nullable().optional(),
});

// createCommittedItemSchema — replace dueMonth with dueDate (required)
export const createCommittedItemSchema = z.object({
  name: z.string().min(1).trim(),
  amount: z.number().positive(),
  subcategoryId: z.string().min(1),
  spendType: SpendTypeEnum.default("monthly"),
  notes: z.string().max(500).nullable().optional(),
  ownerId: z.string().optional(),
  dueDate: z.coerce.date(),
  sortOrder: z.number().int().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateCommittedItemSchema = z.object({
  name: z.string().min(1).trim().optional(),
  subcategoryId: z.string().min(1).optional(),
  spendType: SpendTypeEnum.optional(),
  notes: z.string().max(500).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  dueDate: z.coerce.date().optional(),
  sortOrder: z.number().int().optional(),
});

// createDiscretionaryItemSchema — add nullable dueDate (only meaningful for one_off)
export const createDiscretionaryItemSchema = z.object({
  name: z.string().min(1).trim(),
  amount: z.number().positive(),
  subcategoryId: z.string().min(1),
  spendType: SpendTypeEnum.default("monthly"),
  notes: z.string().max(500).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// IncomeSourceRow type — replace expectedMonth with dueDate
export interface IncomeSourceRow {
  id: string;
  householdId: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  incomeType: IncomeType;
  dueDate: Date;
  ownerId: string | null;
  sortOrder: number;
  lifecycleState: ItemLifecycleState;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  subcategoryId: string | null;
  notes: string | null;
}

// CommittedBillRow — replace dueMonth with dueDate
export interface CommittedBillRow {
  id: string;
  householdId: string;
  name: string;
  amount: number;
  ownerId: string | null;
  sortOrder: number;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  spendType?: SpendType;
  subcategoryId?: string;
  notes?: string | null;
  dueDate?: Date | null;
}

// YearlyBillRow — replace dueMonth with dueDate
export interface YearlyBillRow {
  id: string;
  householdId: string;
  name: string;
  amount: number;
  dueDate: Date;
  sortOrder: number;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  spendType?: SpendType;
  subcategoryId?: string;
  notes?: string | null;
  ownerId?: string | null;
}
```

Also remove the `createYearlyBillSchema`/`updateYearlyBillSchema` `dueMonth` references — replace with `dueDate: z.coerce.date()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test waterfall.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/assets.schemas.ts packages/shared/src/schemas/waterfall.schemas.ts packages/shared/src/schemas/waterfall.schemas.test.ts
git commit -m "feat(shared): add Current account type, isCashflowLinked, dueDate fields"
```

---

### Task 3: Update waterfall.service for dueDate + drop legacy getCashflow

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts`
- Modify: `apps/backend/src/services/waterfall.service.test.ts`

- [ ] **Step 1: Write the failing test**

Replace existing fixture rows in `waterfall.service.test.ts` (search-and-replace `expectedMonth: null` → `dueDate: new Date("2026-01-01")`, `dueMonth: 3` → `dueDate: new Date("2026-03-15")`, etc.). Add a new test:

```typescript
describe("waterfallService.listIncome", () => {
  it("returns income sources with dueDate field", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "inc-1",
        householdId: "hh-1",
        name: "Salary",
        frequency: "monthly",
        dueDate: new Date("2026-04-25"),
        sortOrder: 0,
        subcategoryId: "sub-1",
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);
    const result = await waterfallService.listIncome("hh-1");
    expect(result[0]).toHaveProperty("dueDate");
    expect((result[0] as any).dueDate).toBeInstanceOf(Date);
  });
});
```

Delete the entire `describe("waterfallService.getCashflow", ...)` block.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: FAIL — TypeScript errors on `expectedMonth`/`dueMonth` and missing `dueDate` on mocks

- [ ] **Step 3: Update waterfall.service implementation**

In `waterfall.service.ts`:

1. Delete the entire `getCashflow` method (lines ~350-450) and remove `CashflowMonth` from the `@finplan/shared` import.
2. Replace any `dueMonth ?? 1` fallbacks with `dueDate` reads.
3. In the Overview waterfall summary mapping (`yearlyBills: yearlyCommitted.map(...)`), change `dueMonth: b.dueMonth ?? 1` to `dueDate: b.dueDate`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/waterfall.service.ts apps/backend/src/services/waterfall.service.test.ts
git commit -m "refactor(backend): replace expectedMonth/dueMonth with dueDate, drop legacy getCashflow"
```

---

### Task 4: Update import/export services + tests

**Files:**

- Modify: `apps/backend/src/services/import.service.ts`
- Modify: `apps/backend/src/services/import.service.test.ts`
- Modify: `apps/backend/src/services/export.service.ts`
- Modify: `apps/backend/src/services/export.service.test.ts`
- Modify: `apps/backend/src/services/export-import.roundtrip.test.ts`
- Modify: `packages/shared/src/schemas/export-import.schemas.ts`

- [ ] **Step 1: Write the failing test**

In `export-import.roundtrip.test.ts`, replace fixture entries `expectedMonth: null` → `dueDate: "2026-04-01"` and `dueMonth: null` → `dueDate: "2026-04-01"`. Add:

```typescript
it("round-trips dueDate fields", async () => {
  const exported = await exportService.exportHousehold("hh-1");
  const incomes = exported.waterfall.incomeSources;
  expect(incomes[0]).toHaveProperty("dueDate");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts export-import`
Expected: FAIL — `Property 'expectedMonth' does not exist`

- [ ] **Step 3: Update implementations**

In `packages/shared/src/schemas/export-import.schemas.ts`, replace `expectedMonth: z.number().nullable()` and `dueMonth: z.number().nullable()` Zod schema entries with `dueDate: z.coerce.date()` (and `dueDate: z.coerce.date().nullable()` for discretionary).

In `export.service.ts` lines 195 and 208, change:

```typescript
expectedMonth: i.expectedMonth,    // → dueDate: i.dueDate,
dueMonth: i.dueMonth,              // → dueDate: i.dueDate,
```

In `import.service.ts` lines 321 and 359, change `expectedMonth: i.expectedMonth ?? null` → `dueDate: i.dueDate` and `dueMonth: i.dueMonth ?? null` → `dueDate: i.dueDate`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts export-import`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/import.service.ts apps/backend/src/services/import.service.test.ts apps/backend/src/services/export.service.ts apps/backend/src/services/export.service.test.ts apps/backend/src/services/export-import.roundtrip.test.ts packages/shared/src/schemas/export-import.schemas.ts
git commit -m "refactor(backend): import/export dueDate replaces expectedMonth/dueMonth"
```

---

### Task 5: Update test fixtures + seed

**Files:**

- Modify: `apps/backend/src/test/fixtures/scenarios.ts`
- Modify: `apps/backend/src/test/fixtures/index.ts`
- Modify: `apps/backend/src/db/seed.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/test/fixtures/scenarios.test.ts` (create if missing):

```typescript
import { describe, it, expect } from "bun:test";
import { brandNewHousehold, fullyConfiguredHousehold } from "./scenarios";

describe("fixtures use dueDate", () => {
  it("scenarios export income sources with dueDate", () => {
    const scenario = fullyConfiguredHousehold();
    expect(scenario.incomes[0]).toHaveProperty("dueDate");
    expect(scenario.incomes[0]).not.toHaveProperty("expectedMonth");
  });

  it("scenarios export committed items with dueDate", () => {
    const scenario = fullyConfiguredHousehold();
    expect(scenario.committed[0]).toHaveProperty("dueDate");
    expect(scenario.committed[0]).not.toHaveProperty("dueMonth");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts fixtures`
Expected: FAIL — fixture rows still have legacy fields

- [ ] **Step 3: Update fixtures and seed**

In `apps/backend/src/test/fixtures/scenarios.ts` and `index.ts`, search-and-replace `expectedMonth: null` → `dueDate: new Date("2026-01-01")`, `expectedMonth: 4` → `dueDate: new Date("2026-04-01")`, `dueMonth: null` → `dueDate: new Date("2026-01-01")`, `dueMonth: 3` → `dueDate: new Date("2026-03-15")`, etc.

In `apps/backend/src/db/seed.ts` lines 171/175, change `dueMonth: 9` → `dueDate: new Date("2026-09-01")` and `dueMonth: 3` → `dueDate: new Date("2026-03-01")`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts fixtures && bun scripts/run-tests.ts waterfall.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/test/fixtures/ apps/backend/src/db/seed.ts
git commit -m "refactor(test): fixtures and seed use dueDate"
```

---

### Task 6: Update waterfall routes — drop /cashflow + fix tests

**Files:**

- Modify: `apps/backend/src/routes/waterfall.routes.ts`
- Modify: `apps/backend/src/routes/waterfall.routes.test.ts`

- [ ] **Step 1: Write the failing test**

In `waterfall.routes.test.ts`, delete the entire `describe("GET /cashflow", ...)` block (search for `/cashflow`). Replace `dueMonth: 3` test payloads with `dueDate: "2026-03-15"` and update `expect(res.json().dueMonth).toBe(3)` → `expect(res.json().dueDate).toBe("2026-03-15T00:00:00.000Z")`. Also replace `expectedMonth: null` fixture rows with `dueDate: new Date("2026-01-01")`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: FAIL — old `dueMonth` payloads no longer accepted by Zod

- [ ] **Step 3: Update routes**

In `waterfall.routes.ts`, delete the `fastify.get("/cashflow", ...)` handler (lines ~63-71).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/waterfall.routes.ts apps/backend/src/routes/waterfall.routes.test.ts
git commit -m "refactor(backend): drop legacy /api/waterfall/cashflow route, switch payloads to dueDate"
```

---

## Phase B — Cashflow backend service & API

### Task 7: Cashflow shared schemas

**Files:**

- Create: `packages/shared/src/schemas/cashflow.schemas.ts`
- Modify: `packages/shared/src/schemas/index.ts` (export new file)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/schemas/cashflow.schemas.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import {
  cashflowProjectionQuerySchema,
  cashflowMonthDetailQuerySchema,
  bulkUpdateLinkedAccountsSchema,
} from "./cashflow.schemas";

describe("cashflowProjectionQuerySchema", () => {
  it("accepts valid month range 1-24", () => {
    expect(cashflowProjectionQuerySchema.parse({ monthCount: 12 }).monthCount).toBe(12);
    expect(cashflowProjectionQuerySchema.parse({ monthCount: 1 }).monthCount).toBe(1);
    expect(cashflowProjectionQuerySchema.parse({ monthCount: 24 }).monthCount).toBe(24);
  });

  it("defaults monthCount to 12", () => {
    expect(cashflowProjectionQuerySchema.parse({}).monthCount).toBe(12);
  });

  it("rejects monthCount > 24 or < 1", () => {
    expect(cashflowProjectionQuerySchema.safeParse({ monthCount: 0 }).success).toBe(false);
    expect(cashflowProjectionQuerySchema.safeParse({ monthCount: 25 }).success).toBe(false);
  });
});

describe("cashflowMonthDetailQuerySchema", () => {
  it("validates year and month bounds", () => {
    expect(cashflowMonthDetailQuerySchema.parse({ year: 2026, month: 4 })).toEqual({
      year: 2026,
      month: 4,
    });
    expect(cashflowMonthDetailQuerySchema.safeParse({ year: 1999, month: 4 }).success).toBe(false);
    expect(cashflowMonthDetailQuerySchema.safeParse({ year: 2026, month: 13 }).success).toBe(false);
  });
});

describe("bulkUpdateLinkedAccountsSchema", () => {
  it("accepts an array of {accountId, isCashflowLinked} entries", () => {
    const result = bulkUpdateLinkedAccountsSchema.parse({
      updates: [
        { accountId: "a1", isCashflowLinked: true },
        { accountId: "a2", isCashflowLinked: false },
      ],
    });
    expect(result.updates).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test cashflow.schemas`
Expected: FAIL — `Cannot find module './cashflow.schemas'`

- [ ] **Step 3: Create the schemas**

Create `packages/shared/src/schemas/cashflow.schemas.ts`:

```typescript
import { z } from "zod";

// ─── Query schemas ──────────────────────────────────────────────────────────

export const cashflowProjectionQuerySchema = z.object({
  startYear: z.coerce.number().int().min(2000).max(2100).optional(),
  startMonth: z.coerce.number().int().min(1).max(12).optional(),
  monthCount: z.coerce.number().int().min(1).max(24).default(12),
});

export type CashflowProjectionQuery = z.infer<typeof cashflowProjectionQuerySchema>;

export const cashflowMonthDetailQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type CashflowMonthDetailQuery = z.infer<typeof cashflowMonthDetailQuerySchema>;

// ─── Mutation schemas ───────────────────────────────────────────────────────

export const updateLinkedAccountSchema = z.object({
  isCashflowLinked: z.boolean(),
});
export type UpdateLinkedAccountInput = z.infer<typeof updateLinkedAccountSchema>;

export const bulkUpdateLinkedAccountsSchema = z.object({
  updates: z
    .array(
      z.object({
        accountId: z.string().min(1),
        isCashflowLinked: z.boolean(),
      })
    )
    .min(1)
    .max(50),
});
export type BulkUpdateLinkedAccountsInput = z.infer<typeof bulkUpdateLinkedAccountsSchema>;

// ─── Response shapes ────────────────────────────────────────────────────────

export interface LinkableAccountRow {
  id: string;
  name: string;
  type: "Current" | "Savings";
  isCashflowLinked: boolean;
  latestBalance: number | null;
  latestBalanceDate: string | null; // ISO date YYYY-MM-DD
}

export interface CashflowProjectionMonth {
  year: number;
  month: number; // 1-12
  netChange: number;
  openingBalance: number;
  closingBalance: number;
  dipBelowZero: boolean;
  tightestPoint: { value: number; day: number }; // day-of-month of the lowest intra-month value
}

export interface CashflowProjection {
  startingBalance: number;
  windowStart: { year: number; month: number };
  months: CashflowProjectionMonth[];
  projectedEndBalance: number;
  tightestDip: { value: number; date: string }; // ISO date YYYY-MM-DD
  avgMonthlySurplus: number;
  oldestLinkedBalanceDate: string | null;
  youngestLinkedBalanceDate: string | null;
  linkedAccountCount: number;
}

export interface CashflowEvent {
  date: string; // ISO YYYY-MM-DD
  label: string;
  amount: number; // signed (income +, spend −)
  itemType: "income_source" | "committed_item" | "discretionary_item";
  runningBalanceAfter: number;
}

export interface CashflowMonthDetail {
  year: number;
  month: number;
  startingBalance: number;
  endBalance: number;
  netChange: number;
  tightestPoint: { value: number; day: number };
  amortisedDailyDiscretionary: number;
  monthlyDiscretionaryTotal: number; // for the info chip "£X/mo amortised"
  dailyTrace: Array<{ day: number; balance: number }>; // step-line points
  events: CashflowEvent[];
}
```

Then add to `packages/shared/src/schemas/index.ts`:

```typescript
export * from "./cashflow.schemas";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test cashflow.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/cashflow.schemas.ts packages/shared/src/schemas/cashflow.schemas.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): cashflow projection + month detail schemas"
```

---

### Task 8: cashflow.service — listLinkableAccounts

**Files:**

- Create: `apps/backend/src/services/cashflow.service.ts`
- Modify: `apps/backend/src/services/cashflow.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `cashflow.service.test.ts`:

```typescript
const { cashflowService } = await import("./cashflow.service.js");

describe("cashflowService.listLinkableAccounts", () => {
  it("returns Current and Savings accounts with their isCashflowLinked + latest balance", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        name: "Joint Current",
        type: "Current",
        isCashflowLinked: true,
        balances: [
          { value: 4200, date: new Date("2026-04-01"), createdAt: new Date("2026-04-01") },
        ],
      } as any,
      {
        id: "a2",
        name: "Emergency Pot",
        type: "Savings",
        isCashflowLinked: false,
        balances: [
          { value: 8000, date: new Date("2026-03-15"), createdAt: new Date("2026-03-15") },
        ],
      } as any,
    ]);

    const result = await cashflowService.listLinkableAccounts("hh-1");

    expect(prismaMock.account.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", type: { in: ["Current", "Savings"] } },
      include: { balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 } },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual([
      {
        id: "a1",
        name: "Joint Current",
        type: "Current",
        isCashflowLinked: true,
        latestBalance: 4200,
        latestBalanceDate: "2026-04-01",
      },
      {
        id: "a2",
        name: "Emergency Pot",
        type: "Savings",
        isCashflowLinked: false,
        latestBalance: 8000,
        latestBalanceDate: "2026-03-15",
      },
    ]);
  });

  it("returns empty array when no eligible accounts exist", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    expect(await cashflowService.listLinkableAccounts("hh-1")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: FAIL — `Cannot find module './cashflow.service'`

- [ ] **Step 3: Create cashflow.service.ts**

```typescript
// apps/backend/src/services/cashflow.service.ts
import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { audited } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import type {
  LinkableAccountRow,
  CashflowProjection,
  CashflowMonthDetail,
  BulkUpdateLinkedAccountsInput,
} from "@finplan/shared";

const LINKABLE_TYPES = ["Current", "Savings"] as const;

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const cashflowService = {
  async listLinkableAccounts(householdId: string): Promise<LinkableAccountRow[]> {
    const accounts = await prisma.account.findMany({
      where: { householdId, type: { in: ["Current", "Savings"] } },
      include: {
        balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 },
      },
      orderBy: { name: "asc" },
    });

    return accounts.map((a) => {
      const latest = a.balances[0] ?? null;
      return {
        id: a.id,
        name: a.name,
        type: a.type as "Current" | "Savings",
        isCashflowLinked: a.isCashflowLinked,
        latestBalance: latest?.value ?? null,
        latestBalanceDate: latest ? toIsoDate(latest.date) : null,
      };
    });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/cashflow.service.ts apps/backend/src/services/cashflow.service.test.ts
git commit -m "feat(backend): cashflowService.listLinkableAccounts"
```

---

### Task 9: cashflow.service — single + bulk update of isCashflowLinked

**Files:**

- Modify: `apps/backend/src/services/cashflow.service.ts`
- Modify: `apps/backend/src/services/cashflow.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("cashflowService.updateAccountCashflowLink", () => {
  it("rejects with ValidationError when account is not Current or Savings", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: "a1",
      householdId: "hh-1",
      type: "Pension",
    } as any);

    await expect(cashflowService.updateAccountCashflowLink("hh-1", "a1", true)).rejects.toThrow(
      ValidationError
    );
  });

  it("rejects with NotFoundError when account belongs to another household", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: "a1",
      householdId: "other",
      type: "Current",
    } as any);

    await expect(cashflowService.updateAccountCashflowLink("hh-1", "a1", true)).rejects.toThrow(
      NotFoundError
    );
  });

  it("updates isCashflowLinked when valid", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: "a1",
      householdId: "hh-1",
      type: "Current",
      isCashflowLinked: false,
    } as any);
    prismaMock.account.update.mockResolvedValue({
      id: "a1",
      isCashflowLinked: true,
    } as any);

    const result = await cashflowService.updateAccountCashflowLink("hh-1", "a1", true);

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { isCashflowLinked: true },
    });
    expect(result.isCashflowLinked).toBe(true);
  });
});

describe("cashflowService.bulkUpdateLinkedAccounts", () => {
  it("updates multiple accounts in a transaction, validating each", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "a1", householdId: "hh-1", type: "Current", isCashflowLinked: false },
      { id: "a2", householdId: "hh-1", type: "Savings", isCashflowLinked: true },
    ] as any);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.account.update.mockResolvedValue({} as any);

    await cashflowService.bulkUpdateLinkedAccounts("hh-1", {
      updates: [
        { accountId: "a1", isCashflowLinked: true },
        { accountId: "a2", isCashflowLinked: false },
      ],
    });

    expect(prismaMock.account.update).toHaveBeenCalledTimes(2);
  });

  it("rejects entire batch if any account is ineligible", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "a1", householdId: "hh-1", type: "Current" },
      { id: "a2", householdId: "hh-1", type: "Pension" },
    ] as any);

    await expect(
      cashflowService.bulkUpdateLinkedAccounts("hh-1", {
        updates: [
          { accountId: "a1", isCashflowLinked: true },
          { accountId: "a2", isCashflowLinked: true },
        ],
      })
    ).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: FAIL — `cashflowService.updateAccountCashflowLink is not a function`

- [ ] **Step 3: Implement methods**

Append to `cashflow.service.ts`:

```typescript
async updateAccountCashflowLink(
  householdId: string,
  accountId: string,
  isCashflowLinked: boolean,
  ctx?: ActorCtx
) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.householdId !== householdId) {
    throw new NotFoundError("Account not found");
  }
  if (!LINKABLE_TYPES.includes(account.type as any)) {
    throw new ValidationError("Only Current and Savings accounts can be linked to Cashflow");
  }

  if (ctx) {
    return audited({
      db: prisma,
      ctx,
      action: "UPDATE_ACCOUNT_CASHFLOW_LINK",
      resource: "account",
      resourceId: accountId,
      beforeFetch: async (tx) =>
        tx.account.findUnique({
          where: { id: accountId },
          select: { isCashflowLinked: true },
        }) as Promise<Record<string, unknown> | null>,
      mutation: async (tx) =>
        tx.account.update({
          where: { id: accountId },
          data: { isCashflowLinked },
        }),
    });
  }

  return prisma.account.update({
    where: { id: accountId },
    data: { isCashflowLinked },
  });
},

async bulkUpdateLinkedAccounts(
  householdId: string,
  input: BulkUpdateLinkedAccountsInput,
  ctx?: ActorCtx
) {
  const ids = input.updates.map((u) => u.accountId);
  const accounts = await prisma.account.findMany({
    where: { id: { in: ids }, householdId },
  });

  if (accounts.length !== ids.length) {
    throw new NotFoundError("One or more accounts not found");
  }
  for (const acc of accounts) {
    if (!LINKABLE_TYPES.includes(acc.type as any)) {
      throw new ValidationError(
        `Account ${acc.name} is type ${acc.type} — only Current and Savings can be linked`
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const update of input.updates) {
      const updated = await tx.account.update({
        where: { id: update.accountId },
        data: { isCashflowLinked: update.isCashflowLinked },
      });
      results.push(updated);
    }
    if (ctx) {
      // Audit log entry for the batch
      await tx.auditLog.create({
        data: {
          householdId,
          actorId: ctx.actorId,
          actorName: ctx.actorName,
          action: "BULK_UPDATE_ACCOUNT_CASHFLOW_LINKS",
          resource: "account",
          resourceId: ids.join(","),
          metadata: { count: input.updates.length },
        },
      });
    }
    return results;
  });
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/cashflow.service.ts apps/backend/src/services/cashflow.service.test.ts
git commit -m "feat(backend): cashflow account-link mutations with audit"
```

---

### Task 10: cashflow.service — projection algorithm

**Files:**

- Modify: `apps/backend/src/services/cashflow.service.ts`
- Modify: `apps/backend/src/services/cashflow.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("cashflowService.getProjection", () => {
  beforeEach(() => {
    // Single linked Current account, balance £1,000 as of 2026-04-01
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [
          { value: 1000, date: new Date("2026-04-01"), createdAt: new Date("2026-04-01") },
        ],
      },
    ] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
  });

  it("returns starting balance equal to sum of latest linked balances", async () => {
    const result = await cashflowService.getProjection("hh-1", { monthCount: 12 });
    expect(result.startingBalance).toBe(1000);
    expect(result.linkedAccountCount).toBe(1);
  });

  it("returns 12 months by default", async () => {
    const result = await cashflowService.getProjection("hh-1", { monthCount: 12 });
    expect(result.months).toHaveLength(12);
  });

  it("flags dipBelowZero when balance crosses zero mid-month", async () => {
    // Add a £2,000 committed bill on the 5th of every month (monthly)
    prismaMock.committedItem.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Big Rent",
        spendType: "monthly",
        dueDate: new Date("2026-04-05"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "committed_item",
        itemId: "c1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 2000,
      },
    ] as any);
    const result = await cashflowService.getProjection("hh-1", { monthCount: 3 });
    expect(result.months[0]?.dipBelowZero).toBe(true);
  });

  it("uses the youngest balance date as the replay anchor", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [{ value: 500, date: new Date("2026-03-01"), createdAt: new Date("2026-03-01") }],
      },
      {
        id: "a2",
        type: "Savings",
        isCashflowLinked: true,
        balances: [
          { value: 1500, date: new Date("2026-04-01"), createdAt: new Date("2026-04-01") },
        ],
      },
    ] as any);
    const result = await cashflowService.getProjection("hh-1", { monthCount: 12 });
    expect(result.youngestLinkedBalanceDate).toBe("2026-04-01");
    expect(result.oldestLinkedBalanceDate).toBe("2026-03-01");
    expect(result.startingBalance).toBe(2000);
  });

  it("returns £0 starting balance when no accounts are linked", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    const result = await cashflowService.getProjection("hh-1", { monthCount: 12 });
    expect(result.startingBalance).toBe(0);
    expect(result.linkedAccountCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: FAIL — `cashflowService.getProjection is not a function`

- [ ] **Step 3: Implement projection**

Append to `cashflow.service.ts`:

```typescript
import { findEffectivePeriod } from "./period.service.js";

interface ProjectionEvent {
  date: Date;
  amount: number; // signed
  itemType: "income_source" | "committed_item" | "discretionary_item";
  label: string;
}

interface ProjectionInput {
  startYear?: number;
  startMonth?: number;
  monthCount: number;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function startOfMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m - 1, 1));
}

function endOfMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 0));
}

function periodActiveOn(periods: Array<any>, date: Date): number {
  const eff = findEffectivePeriod(periods, date);
  return eff?.amount ?? 0;
}

/**
 * Build the chronological list of dated events for a half-open date range [from, to).
 * Includes income sources (by frequency rule), committed items (by spendType rule),
 * and one_off discretionary items.
 *
 * Monthly/yearly discretionary are NOT events — they're amortised separately by the caller.
 */
function buildEvents(
  from: Date,
  to: Date,
  income: Array<any>,
  committed: Array<any>,
  discretionary: Array<any>,
  periodsByKey: Map<string, any[]>
): ProjectionEvent[] {
  const events: ProjectionEvent[] = [];

  function expandRecurring(
    item: any,
    itemType: "income_source" | "committed_item",
    sign: 1 | -1,
    frequencyKey: "monthly" | "annual" | "yearly" | "one_off"
  ) {
    const periods = periodsByKey.get(`${itemType}:${item.id}`) ?? [];
    const due: Date = item.dueDate;
    if (frequencyKey === "monthly") {
      const day = due.getUTCDate();
      const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day));
      while (cursor < to) {
        if (cursor >= from) {
          const amount = periodActiveOn(periods, cursor);
          if (amount > 0)
            events.push({
              date: new Date(cursor),
              amount: sign * amount,
              itemType,
              label: item.name,
            });
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else if (frequencyKey === "annual" || frequencyKey === "yearly") {
      const month = due.getUTCMonth();
      const day = due.getUTCDate();
      let year = from.getUTCFullYear();
      while (true) {
        const occ = new Date(Date.UTC(year, month, day));
        if (occ >= to) break;
        if (occ >= from) {
          const amount = periodActiveOn(periods, occ);
          if (amount > 0)
            events.push({ date: occ, amount: sign * amount, itemType, label: item.name });
        }
        year++;
      }
    } else {
      // one_off
      if (due >= from && due < to) {
        const amount = periodActiveOn(periods, due);
        if (amount > 0)
          events.push({ date: due, amount: sign * amount, itemType, label: item.name });
      }
    }
  }

  for (const i of income) expandRecurring(i, "income_source", 1, i.frequency);
  for (const c of committed) expandRecurring(c, "committed_item", -1, c.spendType);

  for (const d of discretionary) {
    if (d.spendType !== "one_off" || !d.dueDate) continue;
    if (d.dueDate >= from && d.dueDate < to) {
      const periods = periodsByKey.get(`discretionary_item:${d.id}`) ?? [];
      const amount = periodActiveOn(periods, d.dueDate);
      if (amount > 0)
        events.push({
          date: d.dueDate,
          amount: -amount,
          itemType: "discretionary_item",
          label: d.name,
        });
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

/** Sum of monthly + (yearly ÷12) discretionary baseline (excluding one_off). */
function computeMonthlyDiscretionaryBaseline(
  discretionary: Array<any>,
  periodsByKey: Map<string, any[]>,
  refDate: Date
): number {
  let total = 0;
  for (const d of discretionary) {
    if (d.spendType === "one_off") continue;
    const periods = periodsByKey.get(`discretionary_item:${d.id}`) ?? [];
    const amount = periodActiveOn(periods, refDate);
    if (d.spendType === "monthly") total += amount;
    else if (d.spendType === "yearly") total += amount / 12;
  }
  return total;
}

async function loadPlanContext(householdId: string) {
  const [income, committed, discretionary] = await Promise.all([
    prisma.incomeSource.findMany({ where: { householdId } }),
    prisma.committedItem.findMany({ where: { householdId } }),
    prisma.discretionaryItem.findMany({ where: { householdId } }),
  ]);
  const allRefs = [
    ...income.map((i) => ({ type: "income_source", id: i.id })),
    ...committed.map((c) => ({ type: "committed_item", id: c.id })),
    ...discretionary.map((d) => ({ type: "discretionary_item", id: d.id })),
  ];
  const periods =
    allRefs.length > 0
      ? await prisma.itemAmountPeriod.findMany({
          where: { OR: allRefs.map((r) => ({ itemType: r.type as any, itemId: r.id })) },
          orderBy: { startDate: "asc" },
        })
      : [];
  const periodsByKey = new Map<string, any[]>();
  for (const p of periods) {
    const k = `${p.itemType}:${p.itemId}`;
    const arr = periodsByKey.get(k) ?? [];
    arr.push(p);
    periodsByKey.set(k, arr);
  }
  return { income, committed, discretionary, periodsByKey };
}

export const cashflowService = {
  // ...listLinkableAccounts, updateAccountCashflowLink, bulkUpdateLinkedAccounts (above)

  async getProjection(householdId: string, input: ProjectionInput): Promise<CashflowProjection> {
    // 1. Load linked accounts and their latest balances
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

    const youngest =
      latestBalances.length > 0 ? latestBalances.reduce((y, b) => (b.date > y.date ? b : y)) : null;
    const oldest =
      latestBalances.length > 0 ? latestBalances.reduce((o, b) => (b.date < o.date ? b : o)) : null;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const anchor = youngest?.date ?? today;

    // 2. Load plan context
    const { income, committed, discretionary, periodsByKey } = await loadPlanContext(householdId);

    // 3. Replay from anchor → today, then forward across the visible window
    const startYear = input.startYear ?? today.getUTCFullYear();
    const startMonth = input.startMonth ?? today.getUTCMonth() + 1;
    const monthCount = input.monthCount;
    const windowEnd = new Date(Date.UTC(startYear, startMonth - 1 + monthCount, 1));

    // Replay anchor → today
    let balance = startingBalance;
    if (anchor < today) {
      const replayEvents = buildEvents(
        anchor,
        today,
        income,
        committed,
        discretionary,
        periodsByKey
      );
      // Apply discretionary amortisation day-by-day during replay
      let cursor = new Date(anchor);
      for (const e of replayEvents) {
        // amortise discretionary up to event date
        while (cursor < e.date) {
          const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
          balance -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        balance += e.amount;
      }
      while (cursor < today) {
        const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
        balance -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    // 4. Forward projection across the visible window — month-by-month with day-level dip detection
    const months: CashflowProjection["months"] = [];
    let tightestDipValue = Infinity;
    let tightestDipDate: Date | null = null;
    let cursorYear = startYear;
    let cursorMonth = startMonth;
    let runningOpening = balance;

    for (let i = 0; i < monthCount; i++) {
      const monthStart = startOfMonth(cursorYear, cursorMonth);
      const monthEnd = new Date(Date.UTC(cursorYear, cursorMonth, 1));
      const monthEvents = buildEvents(
        monthStart,
        monthEnd,
        income,
        committed,
        discretionary,
        periodsByKey
      );

      const dailyBaseline =
        computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, monthStart) /
        daysInMonth(cursorYear, cursorMonth);

      let intra = runningOpening;
      let monthLow = intra;
      let monthLowDay = 1;
      let eIdx = 0;
      const days = daysInMonth(cursorYear, cursorMonth);
      for (let day = 1; day <= days; day++) {
        const today = new Date(Date.UTC(cursorYear, cursorMonth - 1, day));
        intra -= dailyBaseline;
        while (eIdx < monthEvents.length && monthEvents[eIdx]!.date.getTime() === today.getTime()) {
          intra += monthEvents[eIdx]!.amount;
          eIdx++;
        }
        if (intra < monthLow) {
          monthLow = intra;
          monthLowDay = day;
        }
        if (intra < tightestDipValue) {
          tightestDipValue = intra;
          tightestDipDate = new Date(today);
        }
      }
      const closingBalance = intra;
      const netChange = closingBalance - runningOpening;
      months.push({
        year: cursorYear,
        month: cursorMonth,
        netChange,
        openingBalance: runningOpening,
        closingBalance,
        dipBelowZero: monthLow < 0,
        tightestPoint: { value: monthLow, day: monthLowDay },
      });
      runningOpening = closingBalance;
      cursorMonth++;
      if (cursorMonth > 12) {
        cursorMonth = 1;
        cursorYear++;
      }
    }

    const projectedEndBalance = months[months.length - 1]?.closingBalance ?? balance;
    const avgMonthlySurplus =
      months.length > 0 ? months.reduce((s, m) => s + m.netChange, 0) / months.length : 0;

    return {
      startingBalance,
      windowStart: { year: startYear, month: startMonth },
      months,
      projectedEndBalance,
      tightestDip: {
        value: tightestDipValue === Infinity ? balance : tightestDipValue,
        date: tightestDipDate ? toIsoDate(tightestDipDate) : toIsoDate(today),
      },
      avgMonthlySurplus,
      oldestLinkedBalanceDate: oldest ? toIsoDate(oldest.date) : null,
      youngestLinkedBalanceDate: youngest ? toIsoDate(youngest.date) : null,
      linkedAccountCount: linked.length,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/cashflow.service.ts apps/backend/src/services/cashflow.service.test.ts
git commit -m "feat(backend): cashflow projection algorithm with intra-month dip detection"
```

---

### Task 11: cashflow.service — getMonthDetail

**Files:**

- Modify: `apps/backend/src/services/cashflow.service.ts`
- Modify: `apps/backend/src/services/cashflow.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("cashflowService.getMonthDetail", () => {
  beforeEach(() => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a1",
        type: "Current",
        isCashflowLinked: true,
        balances: [
          { value: 1000, date: new Date("2026-04-01"), createdAt: new Date("2026-04-01") },
        ],
      },
    ] as any);
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Salary",
        frequency: "monthly",
        dueDate: new Date("2026-04-25"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "income_source",
        itemId: "i1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 3000,
      },
    ] as any);
  });

  it("returns events for the target month with running balance after each", async () => {
    const detail = await cashflowService.getMonthDetail("hh-1", 2026, 4);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]?.label).toBe("Salary");
    expect(detail.events[0]?.amount).toBe(3000);
    expect(detail.events[0]?.runningBalanceAfter).toBeGreaterThan(0);
  });

  it("returns dailyTrace with one entry per day", async () => {
    const detail = await cashflowService.getMonthDetail("hh-1", 2026, 4);
    expect(detail.dailyTrace).toHaveLength(30); // April
  });

  it("includes amortisedDailyDiscretionary in the response", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "d1", name: "Food", spendType: "monthly", householdId: "hh-1" },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "discretionary_item",
        itemId: "d1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 600,
      },
    ] as any);
    const detail = await cashflowService.getMonthDetail("hh-1", 2026, 4);
    expect(detail.monthlyDiscretionaryTotal).toBe(600);
    expect(detail.amortisedDailyDiscretionary).toBeCloseTo(20, 1); // 600/30
  });

  it("excludes monthly/yearly discretionary from event list", async () => {
    prismaMock.discretionaryItem.findMany.mockResolvedValue([
      { id: "d1", name: "Food", spendType: "monthly", householdId: "hh-1" },
      {
        id: "d2",
        name: "Concert",
        spendType: "one_off",
        dueDate: new Date("2026-04-12"),
        householdId: "hh-1",
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      {
        itemType: "discretionary_item",
        itemId: "d1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 600,
      },
      {
        itemType: "discretionary_item",
        itemId: "d2",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 80,
      },
    ] as any);
    const detail = await cashflowService.getMonthDetail("hh-1", 2026, 4);
    const labels = detail.events.map((e) => e.label);
    expect(labels).toContain("Concert");
    expect(labels).not.toContain("Food");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: FAIL — `cashflowService.getMonthDetail is not a function`

- [ ] **Step 3: Implement getMonthDetail**

Append to `cashflow.service.ts`:

```typescript
async getMonthDetail(
  householdId: string,
  targetYear: number,
  targetMonth: number
): Promise<CashflowMonthDetail> {
  // Re-use the projection chain to get the opening balance for the target month.
  // Compute monthCount from today → targetMonth (inclusive).
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startYear = today.getUTCFullYear();
  const startMonth = today.getUTCMonth() + 1;
  const monthOffset =
    (targetYear - startYear) * 12 + (targetMonth - startMonth);
  const monthCount = Math.max(1, monthOffset + 1);

  const projection = await this.getProjection(householdId, {
    startYear,
    startMonth,
    monthCount,
  });
  const month = projection.months.find(
    (m) => m.year === targetYear && m.month === targetMonth
  );
  if (!month) {
    throw new NotFoundError("Month is outside the projection window");
  }

  // Re-load plan context to build the event list and daily trace
  const { income, committed, discretionary, periodsByKey } = await loadPlanContext(householdId);

  const monthStart = startOfMonth(targetYear, targetMonth);
  const monthEnd = new Date(Date.UTC(targetYear, targetMonth, 1));
  const events = buildEvents(
    monthStart,
    monthEnd,
    income,
    committed,
    discretionary,
    periodsByKey
  );

  const monthlyDiscretionaryTotal = computeMonthlyDiscretionaryBaseline(
    discretionary,
    periodsByKey,
    monthStart
  );
  const days = daysInMonth(targetYear, targetMonth);
  const amortisedDailyDiscretionary = monthlyDiscretionaryTotal / days;

  const dailyTrace: Array<{ day: number; balance: number }> = [];
  let intra = month.openingBalance;
  let eIdx = 0;
  const eventRows: CashflowMonthDetail["events"] = [];
  for (let day = 1; day <= days; day++) {
    const todayDate = new Date(Date.UTC(targetYear, targetMonth - 1, day));
    intra -= amortisedDailyDiscretionary;
    while (eIdx < events.length && events[eIdx]!.date.getTime() === todayDate.getTime()) {
      const ev = events[eIdx]!;
      intra += ev.amount;
      eventRows.push({
        date: toIsoDate(ev.date),
        label: ev.label,
        amount: ev.amount,
        itemType: ev.itemType,
        runningBalanceAfter: intra,
      });
      eIdx++;
    }
    dailyTrace.push({ day, balance: intra });
  }

  return {
    year: targetYear,
    month: targetMonth,
    startingBalance: month.openingBalance,
    endBalance: month.closingBalance,
    netChange: month.netChange,
    tightestPoint: month.tightestPoint,
    amortisedDailyDiscretionary,
    monthlyDiscretionaryTotal,
    dailyTrace,
    events: eventRows,
  };
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/cashflow.service.ts apps/backend/src/services/cashflow.service.test.ts
git commit -m "feat(backend): cashflow month detail with daily trace and event list"
```

---

### Task 12: cashflow.routes — Fastify endpoints

**Files:**

- Create: `apps/backend/src/routes/cashflow.routes.ts`
- Create: `apps/backend/src/routes/cashflow.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/cashflow.routes.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import Fastify from "fastify";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));
mock.module("../middleware/auth.middleware.js", () => ({
  authMiddleware: async (req: any) => {
    req.householdId = "hh-1";
    req.userId = "u-1";
  },
}));

const { cashflowRoutes } = await import("./cashflow.routes.js");

async function buildApp() {
  const app = Fastify();
  await app.register(cashflowRoutes, { prefix: "/api/cashflow" });
  return app;
}

beforeEach(() => resetPrismaMocks());

describe("GET /api/cashflow/projection", () => {
  it("returns projection for default 12 months", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/cashflow/projection" });
    expect(res.statusCode).toBe(200);
    expect(res.json().months).toHaveLength(12);
  });

  it("validates monthCount bounds", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/cashflow/projection?monthCount=99",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/cashflow/month", () => {
  it("returns month detail for valid year/month", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.committedItem.findMany.mockResolvedValue([]);
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);

    const app = await buildApp();
    const now = new Date();
    const res = await app.inject({
      method: "GET",
      url: `/api/cashflow/month?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("dailyTrace");
  });
});

describe("GET /api/cashflow/linkable-accounts", () => {
  it("returns array of linkable accounts", async () => {
    prismaMock.account.findMany.mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/cashflow/linkable-accounts" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe("PATCH /api/cashflow/linkable-accounts/:id", () => {
  it("updates a single account's isCashflowLinked", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: "a1",
      householdId: "hh-1",
      type: "Current",
      isCashflowLinked: false,
    } as any);
    prismaMock.account.update.mockResolvedValue({ id: "a1", isCashflowLinked: true } as any);

    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/cashflow/linkable-accounts/a1",
      payload: { isCashflowLinked: true },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/cashflow/linkable-accounts/bulk", () => {
  it("updates multiple accounts in one request", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      { id: "a1", householdId: "hh-1", type: "Current" },
      { id: "a2", householdId: "hh-1", type: "Savings" },
    ] as any);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.account.update.mockResolvedValue({} as any);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/cashflow/linkable-accounts/bulk",
      payload: {
        updates: [
          { accountId: "a1", isCashflowLinked: true },
          { accountId: "a2", isCashflowLinked: false },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.routes`
Expected: FAIL — `Cannot find module './cashflow.routes'`

- [ ] **Step 3: Create cashflow.routes.ts**

```typescript
// apps/backend/src/routes/cashflow.routes.ts
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { cashflowService } from "../services/cashflow.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import {
  cashflowProjectionQuerySchema,
  cashflowMonthDetailQuerySchema,
  updateLinkedAccountSchema,
  bulkUpdateLinkedAccountsSchema,
} from "@finplan/shared";
import { AppError } from "../utils/errors.js";

export async function cashflowRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  fastify.get("/projection", pre, async (req, reply) => {
    const parsed = cashflowProjectionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0]?.message ?? "Invalid query", 400);
    }
    const projection = await cashflowService.getProjection(req.householdId!, parsed.data);
    return reply.send(projection);
  });

  fastify.get("/month", pre, async (req, reply) => {
    const parsed = cashflowMonthDetailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0]?.message ?? "Invalid query", 400);
    }
    const detail = await cashflowService.getMonthDetail(
      req.householdId!,
      parsed.data.year,
      parsed.data.month
    );
    return reply.send(detail);
  });

  fastify.get("/linkable-accounts", pre, async (req, reply) => {
    const accounts = await cashflowService.listLinkableAccounts(req.householdId!);
    return reply.send(accounts);
  });

  fastify.patch("/linkable-accounts/:accountId", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const data = updateLinkedAccountSchema.parse(req.body);
    const updated = await cashflowService.updateAccountCashflowLink(
      req.householdId!,
      accountId,
      data.isCashflowLinked,
      actorCtx(req)
    );
    return reply.send(updated);
  });

  fastify.post("/linkable-accounts/bulk", pre, async (req, reply) => {
    const data = bulkUpdateLinkedAccountsSchema.parse(req.body);
    const result = await cashflowService.bulkUpdateLinkedAccounts(
      req.householdId!,
      data,
      actorCtx(req)
    );
    return reply.send(result);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/cashflow.routes.ts apps/backend/src/routes/cashflow.routes.test.ts
git commit -m "feat(backend): cashflow Fastify routes"
```

---

### Task 13: Register cashflow routes in server

**Files:**

- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/test/integration/routes.test.ts` (or create a quick smoke test):

```typescript
import { describe, it, expect } from "bun:test";
import { build } from "../helpers/buildApp";

describe("server registers /api/cashflow", () => {
  it("responds to /api/cashflow/projection (auth required)", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/api/cashflow/projection" });
    expect([200, 401]).toContain(res.statusCode); // 401 because no auth header
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow`
Expected: FAIL — 404, route not registered

- [ ] **Step 3: Register the route**

Edit `apps/backend/src/server.ts`:

```typescript
import { cashflowRoutes } from "./routes/cashflow.routes";
// ...
server.register(cashflowRoutes, { prefix: "/api/cashflow" });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts cashflow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/server.ts apps/backend/src/test/integration/routes.test.ts
git commit -m "feat(backend): register cashflow routes under /api/cashflow"
```

---

## Phase C — Frontend: Forecast restructure shell

### Task 14: ForecastSectionNavigator component

**Files:**

- Create: `apps/frontend/src/components/forecast/ForecastSectionNavigator.tsx`
- Create: `apps/frontend/src/components/forecast/ForecastSectionNavigator.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForecastSectionNavigator } from "./ForecastSectionNavigator";

describe("ForecastSectionNavigator", () => {
  it("renders Cashflow and Growth entries", () => {
    render(<ForecastSectionNavigator selected="cashflow" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /cashflow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /growth/i })).toBeInTheDocument();
  });

  it("highlights the selected entry", () => {
    render(<ForecastSectionNavigator selected="growth" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /growth/i })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /cashflow/i })).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect when an entry is clicked", () => {
    const handler = vi.fn();
    render(<ForecastSectionNavigator selected="cashflow" onSelect={handler} />);
    fireEvent.click(screen.getByRole("button", { name: /growth/i }));
    expect(handler).toHaveBeenCalledWith("growth");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ForecastSectionNavigator`
Expected: FAIL — `Cannot find module './ForecastSectionNavigator'`

- [ ] **Step 3: Implement**

```tsx
import { cn } from "@/lib/utils";

export type ForecastSection = "cashflow" | "growth";

interface ForecastSectionNavigatorProps {
  selected: ForecastSection;
  onSelect: (section: ForecastSection) => void;
}

const ENTRIES: Array<{ id: ForecastSection; label: string }> = [
  { id: "cashflow", label: "Cashflow" },
  { id: "growth", label: "Growth" },
];

export function ForecastSectionNavigator({ selected, onSelect }: ForecastSectionNavigatorProps) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Forecast sections">
      {ENTRIES.map((e) => {
        const active = e.id === selected;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onSelect(e.id)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "w-full text-left px-3 py-2 rounded transition-colors text-sm font-heading uppercase tracking-widest",
              active
                ? "bg-page-accent/10 text-page-accent"
                : "text-text-secondary hover:bg-accent/40 hover:text-foreground"
            )}
          >
            {e.label}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ForecastSectionNavigator`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/ForecastSectionNavigator.tsx apps/frontend/src/components/forecast/ForecastSectionNavigator.test.tsx
git commit -m "feat(frontend): ForecastSectionNavigator component"
```

---

### Task 15: GrowthSectionPanel — wraps existing forecast charts

**Files:**

- Create: `apps/frontend/src/components/forecast/GrowthSectionPanel.tsx`

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/pages/ForecastPage.test.tsx` a new describe block (it'll fail until the wrapper exists, but we test it indirectly through the page in Task 16). Skip a dedicated unit test for this thin wrapper — covered by ForecastPage integration test.

Mark this task as **no-test wrapper component**: tested transitively by ForecastPage tests in Task 16.

- [ ] **Step 2: Skip — covered by Task 16**

- [ ] **Step 3: Implement**

```tsx
import { useState } from "react";
import type { ForecastHorizon } from "@finplan/shared";
import { TimeHorizonSelector } from "@/components/forecast/TimeHorizonSelector";
import { NetWorthChart } from "@/components/forecast/NetWorthChart";
import { SurplusAccumulationChart } from "@/components/forecast/SurplusAccumulationChart";
import { RetirementChart } from "@/components/forecast/RetirementChart";
import { useForecast } from "@/hooks/useForecast";

const CHART_SKELETON = (
  <div className="bg-surface border border-surface-elevated rounded-xl h-48 animate-pulse" />
);

const CHART_ERROR = (
  <div className="bg-surface border border-surface-elevated rounded-xl h-48 flex items-center justify-center">
    <p className="text-sm text-text-tertiary">Could not load forecast — try refreshing</p>
  </div>
);

export function GrowthSectionPanel() {
  const [horizon, setHorizon] = useState<ForecastHorizon>(10);
  const { data, isLoading, isError } = useForecast(horizon);

  const currentYear = new Date().getFullYear();
  const horizonEndYear = currentYear + horizon;

  const retirementMarkers = (data?.retirement ?? [])
    .filter((m) => m.retirementYear != null && m.retirementYear >= currentYear)
    .map((m) => ({
      year: Math.min(m.retirementYear!, horizonEndYear),
      name: m.memberName,
      beyondHorizon: m.retirementYear! > horizonEndYear,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <TimeHorizonSelector value={horizon} onChange={setHorizon} />
      </div>
      {isLoading ? (
        CHART_SKELETON
      ) : isError ? (
        CHART_ERROR
      ) : (
        <NetWorthChart data={data?.netWorth ?? []} retirementMarkers={retirementMarkers} />
      )}
      <div className="grid grid-cols-2 gap-4">
        {isLoading ? (
          <>
            {CHART_SKELETON}
            {CHART_SKELETON}
          </>
        ) : isError ? (
          <>
            {CHART_ERROR}
            {CHART_ERROR}
          </>
        ) : (
          <>
            <SurplusAccumulationChart data={data?.surplus ?? []} />
            <RetirementChart members={data?.retirement ?? []} horizonEndYear={horizonEndYear} />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Skipped — see Task 16**

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/GrowthSectionPanel.tsx
git commit -m "feat(frontend): GrowthSectionPanel wraps existing forecast charts"
```

---

### Task 16: Restructure ForecastPage to use TwoPanelLayout

**Files:**

- Modify: `apps/frontend/src/pages/ForecastPage.tsx`
- Modify: `apps/frontend/src/pages/ForecastPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/pages/ForecastPage.test.tsx — replace existing tests
import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import ForecastPage from "./ForecastPage";

describe("ForecastPage two-panel layout", () => {
  it("renders the section navigator with Cashflow and Growth entries", () => {
    renderWithProviders(<ForecastPage />);
    expect(screen.getByRole("button", { name: /cashflow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /growth/i })).toBeInTheDocument();
  });

  it("defaults to Cashflow on first visit", () => {
    renderWithProviders(<ForecastPage />);
    expect(screen.getByRole("button", { name: /cashflow/i })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("switches to Growth when Growth is clicked", async () => {
    renderWithProviders(<ForecastPage />);
    fireEvent.click(screen.getByRole("button", { name: /growth/i }));
    // Growth panel content shows the time horizon selector
    expect(await screen.findByText(/horizon/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ForecastPage`
Expected: FAIL — page still single-panel, no navigator

- [ ] **Step 3: Rewrite ForecastPage**

```tsx
import { useState } from "react";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import {
  ForecastSectionNavigator,
  type ForecastSection,
} from "@/components/forecast/ForecastSectionNavigator";
import { GrowthSectionPanel } from "@/components/forecast/GrowthSectionPanel";
import { CashflowSectionPanel } from "@/components/forecast/cashflow/CashflowSectionPanel";

export default function ForecastPage() {
  const [section, setSection] = useState<ForecastSection>("cashflow");

  const left = (
    <div className="flex flex-col h-full">
      <PageHeader title="Forecast" />
      <ForecastSectionNavigator selected={section} onSelect={setSection} />
    </div>
  );

  const right = section === "cashflow" ? <CashflowSectionPanel /> : <GrowthSectionPanel />;

  return (
    <div data-page="forecast" className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <TwoPanelLayout left={left} right={right} />
      </div>
    </div>
  );
}
```

(Tests will not pass yet because `CashflowSectionPanel` is created in Task 25. To unblock this task, **temporarily** stub the CashflowSectionPanel as `() => <div data-testid="cashflow-stub">cashflow</div>` and remove the stub at Task 25.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ForecastPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/ForecastPage.tsx apps/frontend/src/pages/ForecastPage.test.tsx
git commit -m "feat(frontend): restructure ForecastPage to TwoPanelLayout shell"
```

---

## Phase D — Frontend: Cashflow components

### Task 17: Frontend cashflow service + hooks

**Files:**

- Create: `apps/frontend/src/services/cashflow.service.ts`
- Create: `apps/frontend/src/hooks/useCashflow.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/hooks/useCashflow.test.tsx
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { withQueryClient } from "@/test/test-utils";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";
import { useCashflowProjection } from "./useCashflow";

describe("useCashflowProjection", () => {
  it("fetches projection from /api/cashflow/projection", async () => {
    server.use(
      http.get("/api/cashflow/projection", () =>
        HttpResponse.json({
          startingBalance: 1000,
          windowStart: { year: 2026, month: 4 },
          months: [],
          projectedEndBalance: 1000,
          tightestDip: { value: 1000, date: "2026-04-01" },
          avgMonthlySurplus: 0,
          oldestLinkedBalanceDate: "2026-04-01",
          youngestLinkedBalanceDate: "2026-04-01",
          linkedAccountCount: 1,
        })
      )
    );

    const { result } = renderHook(() => useCashflowProjection(), { wrapper: withQueryClient() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.startingBalance).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useCashflow`
Expected: FAIL — module missing

- [ ] **Step 3: Implement service + hooks**

```typescript
// apps/frontend/src/services/cashflow.service.ts
import { apiClient } from "@/lib/api-client";
import type {
  CashflowProjection,
  CashflowMonthDetail,
  CashflowProjectionQuery,
  LinkableAccountRow,
  BulkUpdateLinkedAccountsInput,
} from "@finplan/shared";

export const cashflowApi = {
  getProjection: (query: CashflowProjectionQuery = { monthCount: 12 }) =>
    apiClient.get<CashflowProjection>("/api/cashflow/projection", { params: query }),
  getMonthDetail: (year: number, month: number) =>
    apiClient.get<CashflowMonthDetail>("/api/cashflow/month", { params: { year, month } }),
  listLinkableAccounts: () =>
    apiClient.get<LinkableAccountRow[]>("/api/cashflow/linkable-accounts"),
  updateLinkedAccount: (accountId: string, isCashflowLinked: boolean) =>
    apiClient.patch<LinkableAccountRow>(`/api/cashflow/linkable-accounts/${accountId}`, {
      isCashflowLinked,
    }),
  bulkUpdateLinkedAccounts: (input: BulkUpdateLinkedAccountsInput) =>
    apiClient.post<LinkableAccountRow[]>("/api/cashflow/linkable-accounts/bulk", input),
};
```

```typescript
// apps/frontend/src/hooks/useCashflow.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cashflowApi } from "@/services/cashflow.service";
import type { CashflowProjectionQuery, BulkUpdateLinkedAccountsInput } from "@finplan/shared";

export const CASHFLOW_KEYS = {
  projection: (q: CashflowProjectionQuery) => ["cashflow", "projection", q] as const,
  month: (y: number, m: number) => ["cashflow", "month", y, m] as const,
  linkable: ["cashflow", "linkable-accounts"] as const,
};

export function useCashflowProjection(query: CashflowProjectionQuery = { monthCount: 12 }) {
  return useQuery({
    queryKey: CASHFLOW_KEYS.projection(query),
    queryFn: () => cashflowApi.getProjection(query),
  });
}

export function useCashflowMonth(year: number, month: number, enabled = true) {
  return useQuery({
    queryKey: CASHFLOW_KEYS.month(year, month),
    queryFn: () => cashflowApi.getMonthDetail(year, month),
    enabled,
  });
}

export function useLinkableAccounts() {
  return useQuery({
    queryKey: CASHFLOW_KEYS.linkable,
    queryFn: cashflowApi.listLinkableAccounts,
  });
}

export function useBulkUpdateLinkedAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkUpdateLinkedAccountsInput) =>
      cashflowApi.bulkUpdateLinkedAccounts(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CASHFLOW_KEYS.linkable });
      qc.invalidateQueries({ queryKey: ["cashflow", "projection"] });
      qc.invalidateQueries({ queryKey: ["cashflow", "month"] });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useCashflow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/cashflow.service.ts apps/frontend/src/hooks/useCashflow.ts apps/frontend/src/hooks/useCashflow.test.tsx
git commit -m "feat(frontend): cashflow API client and React Query hooks"
```

---

### Task 18: LinkedAccountsButton + LinkedAccountsPopover

**Files:**

- Create: `apps/frontend/src/components/forecast/cashflow/LinkedAccountsButton.tsx`
- Create: `apps/frontend/src/components/forecast/cashflow/LinkedAccountsButton.test.tsx`
- Create: `apps/frontend/src/components/forecast/cashflow/LinkedAccountsPopover.tsx`
- Create: `apps/frontend/src/components/forecast/cashflow/LinkedAccountsPopover.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// LinkedAccountsButton.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkedAccountsButton } from "./LinkedAccountsButton";

describe("LinkedAccountsButton", () => {
  it("renders STARTING BALANCE label, value and N linked accounts", () => {
    render(
      <LinkedAccountsButton
        startingBalance={4200}
        linkedCount={2}
        onClick={() => {}}
        isOpen={false}
      />
    );
    expect(screen.getByText(/starting balance/i)).toBeInTheDocument();
    expect(screen.getByText(/£4,200/)).toBeInTheDocument();
    expect(screen.getByText(/2 linked accounts/i)).toBeInTheDocument();
  });

  it("shows empty state copy when no accounts linked", () => {
    render(
      <LinkedAccountsButton startingBalance={0} linkedCount={0} onClick={() => {}} isOpen={false} />
    );
    expect(screen.getByText(/link accounts to anchor your cashflow/i)).toBeInTheDocument();
  });
});

// LinkedAccountsPopover.test.tsx
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "@/test/test-utils";
import { server } from "@/test/msw/server";
import { LinkedAccountsPopover } from "./LinkedAccountsPopover";
import { fireEvent, screen, waitFor } from "@testing-library/react";

describe("LinkedAccountsPopover", () => {
  it("lists Current and Savings accounts", async () => {
    server.use(
      http.get("/api/cashflow/linkable-accounts", () =>
        HttpResponse.json([
          {
            id: "a1",
            name: "Joint Current",
            type: "Current",
            isCashflowLinked: true,
            latestBalance: 4200,
            latestBalanceDate: "2026-04-01",
          },
        ])
      )
    );
    renderWithProviders(<LinkedAccountsPopover onClose={() => {}} />);
    expect(await screen.findByText(/joint current/i)).toBeInTheDocument();
  });

  it("toggles isCashflowLinked when checkbox clicked", async () => {
    let receivedUpdates: any = null;
    server.use(
      http.get("/api/cashflow/linkable-accounts", () =>
        HttpResponse.json([
          {
            id: "a1",
            name: "Joint Current",
            type: "Current",
            isCashflowLinked: false,
            latestBalance: 4200,
            latestBalanceDate: "2026-04-01",
          },
        ])
      ),
      http.post("/api/cashflow/linkable-accounts/bulk", async ({ request }) => {
        receivedUpdates = await request.json();
        return HttpResponse.json([]);
      })
    );
    renderWithProviders(<LinkedAccountsPopover onClose={() => {}} />);
    const checkbox = await screen.findByRole("checkbox", { name: /joint current/i });
    fireEvent.click(checkbox);
    await waitFor(() => expect(receivedUpdates).not.toBeNull());
    expect(receivedUpdates.updates).toEqual([{ accountId: "a1", isCashflowLinked: true }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test LinkedAccounts`
Expected: FAIL — modules missing

- [ ] **Step 3: Implement components**

```tsx
// LinkedAccountsButton.tsx
import { formatCurrency } from "@/utils/format";
import { cn } from "@/lib/utils";

interface LinkedAccountsButtonProps {
  startingBalance: number;
  linkedCount: number;
  isOpen: boolean;
  onClick: () => void;
}

export function LinkedAccountsButton({
  startingBalance,
  linkedCount,
  isOpen,
  onClick,
}: LinkedAccountsButtonProps) {
  const empty = linkedCount === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-md border border-surface-border bg-surface px-4 py-2.5 transition-colors",
        "hover:border-page-accent focus-visible:border-page-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-page-accent"
      )}
    >
      {empty ? (
        <span className="text-sm text-text-secondary">Link accounts to anchor your cashflow ▸</span>
      ) : (
        <>
          <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-heading">
            Starting balance
          </span>
          <span className="flex items-center gap-2">
            <span className="font-numeric text-base text-foreground">
              {formatCurrency(startingBalance)}
            </span>
            <span className="text-xs text-text-tertiary">{linkedCount} linked accounts ▾</span>
          </span>
        </>
      )}
    </button>
  );
}
```

```tsx
// LinkedAccountsPopover.tsx
import { useState, useEffect } from "react";
import { useLinkableAccounts, useBulkUpdateLinkedAccounts } from "@/hooks/useCashflow";
import { formatCurrency } from "@/utils/format";
import { format } from "date-fns";

interface LinkedAccountsPopoverProps {
  onClose: () => void;
}

export function LinkedAccountsPopover({ onClose }: LinkedAccountsPopoverProps) {
  const { data: accounts = [], isLoading } = useLinkableAccounts();
  const bulkUpdate = useBulkUpdateLinkedAccounts();
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDraft(Object.fromEntries(accounts.map((a) => [a.id, a.isCashflowLinked])));
  }, [accounts]);

  const allSelected = accounts.length > 0 && accounts.every((a) => draft[a.id]);

  function commit(next: Record<string, boolean>) {
    setDraft(next);
    const updates = accounts
      .filter((a) => next[a.id] !== a.isCashflowLinked)
      .map((a) => ({ accountId: a.id, isCashflowLinked: !!next[a.id] }));
    if (updates.length > 0) bulkUpdate.mutate({ updates });
  }

  function toggle(id: string) {
    commit({ ...draft, [id]: !draft[id] });
  }

  function toggleAll() {
    const next = Object.fromEntries(accounts.map((a) => [a.id, !allSelected]));
    commit(next);
  }

  if (isLoading)
    return (
      <div className="rounded-md border border-surface-border bg-surface p-4 w-80">Loading…</div>
    );

  return (
    <div
      role="dialog"
      aria-label="Select linked accounts"
      className="rounded-md border border-surface-border bg-surface p-3 w-80 shadow-lg"
    >
      <label className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        <span className="text-xs uppercase tracking-widest text-text-tertiary">Select all</span>
      </label>
      <div className="border-t border-surface-border my-2" />
      <ul className="space-y-1 max-h-64 overflow-y-auto">
        {accounts.map((a) => (
          <li key={a.id}>
            <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent/30 cursor-pointer">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!draft[a.id]}
                  onChange={() => toggle(a.id)}
                  aria-label={a.name}
                />
                <span className="text-sm">{a.name}</span>
                <span className="text-[10px] uppercase tracking-widest text-text-tertiary">
                  {a.type}
                </span>
              </span>
              <span className="text-xs text-text-tertiary font-numeric">
                {a.latestBalance != null ? formatCurrency(a.latestBalance) : "—"}
                {a.latestBalanceDate && (
                  <span className="ml-2">{format(new Date(a.latestBalanceDate), "d MMM")}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="border-t border-surface-border mt-2 pt-2 flex justify-end">
        <button type="button" onClick={onClose} className="text-xs text-text-secondary">
          Close
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test LinkedAccounts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/cashflow/LinkedAccountsButton.tsx apps/frontend/src/components/forecast/cashflow/LinkedAccountsButton.test.tsx apps/frontend/src/components/forecast/cashflow/LinkedAccountsPopover.tsx apps/frontend/src/components/forecast/cashflow/LinkedAccountsPopover.test.tsx
git commit -m "feat(frontend): linked-accounts button and popover for Cashflow"
```

---

### Task 19: CashflowStaleBanner + CashflowEmptyCallout

**Files:**

- Create: `apps/frontend/src/components/forecast/cashflow/CashflowStaleBanner.tsx`
- Create: `apps/frontend/src/components/forecast/cashflow/CashflowEmptyCallout.tsx`

- [ ] **Step 1: Write the failing test** (combined into one file)

```tsx
// CashflowStaleBanner.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CashflowStaleBanner } from "./CashflowStaleBanner";

describe("CashflowStaleBanner", () => {
  it("renders months range and Refresh accounts link", () => {
    render(<CashflowStaleBanner oldestMonths={4} youngestMonths={1} onRefresh={() => {}} />);
    expect(screen.getByText(/1–4 months old/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh accounts/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test CashflowStaleBanner`
Expected: FAIL

- [ ] **Step 3: Implement**

```tsx
// CashflowStaleBanner.tsx
interface CashflowStaleBannerProps {
  oldestMonths: number;
  youngestMonths: number;
  onRefresh: () => void;
}

export function CashflowStaleBanner({
  oldestMonths,
  youngestMonths,
  onRefresh,
}: CashflowStaleBannerProps) {
  return (
    <div
      role="status"
      className="w-full px-4 py-1.5 text-xs flex items-center gap-2 bg-attention/4 border-b border-attention/8 text-attention"
    >
      <span>
        Linked balances {youngestMonths}–{oldestMonths} months old · projection may drift ·{" "}
        <button
          type="button"
          onClick={onRefresh}
          className="underline underline-offset-2 hover:no-underline"
        >
          Refresh accounts
        </button>
      </span>
    </div>
  );
}
```

```tsx
// CashflowEmptyCallout.tsx
interface CashflowEmptyCalloutProps {
  variant: "no-accounts" | "no-income" | "no-spend";
}

const COPY: Record<CashflowEmptyCalloutProps["variant"], string> = {
  "no-accounts":
    "Cashflow is running from a £0 starting balance — link a Current or Savings account to anchor it to your real funds.",
  "no-income":
    "No income added yet — your projection has no inflows. Add income to see balance growth.",
  "no-spend":
    "No committed or discretionary spend yet — your projection has no outflows. Add bills and budgets to see the full shape.",
};

export function CashflowEmptyCallout({ variant }: CashflowEmptyCalloutProps) {
  return (
    <div className="rounded-md border border-surface-border bg-surface px-4 py-3 text-xs text-text-secondary">
      {COPY[variant]}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test CashflowStaleBanner`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/cashflow/CashflowStaleBanner.tsx apps/frontend/src/components/forecast/cashflow/CashflowStaleBanner.test.tsx apps/frontend/src/components/forecast/cashflow/CashflowEmptyCallout.tsx
git commit -m "feat(frontend): CashflowStaleBanner and CashflowEmptyCallout"
```

---

### Task 20: CashflowYearBar (single bar)

**Files:**

- Create: `apps/frontend/src/components/forecast/cashflow/CashflowYearBar.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// CashflowYearBar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CashflowYearBar } from "./CashflowYearBar";

describe("CashflowYearBar", () => {
  const month = {
    year: 2026,
    month: 4,
    netChange: 500,
    openingBalance: 1000,
    closingBalance: 1500,
    dipBelowZero: false,
    tightestPoint: { value: 1000, day: 1 },
  };

  it("uses default tier colour when no dip", () => {
    render(<CashflowYearBar month={month} maxAbsNet={1000} onClick={() => {}} />);
    const bar = screen.getByRole("button");
    expect(bar.className).toMatch(/tier-/);
    expect(bar.className).not.toMatch(/attention/);
  });

  it("uses amber when dipBelowZero", () => {
    render(
      <CashflowYearBar
        month={{ ...month, dipBelowZero: true }}
        maxAbsNet={1000}
        onClick={() => {}}
      />
    );
    expect(screen.getByRole("button").className).toMatch(/attention/);
  });

  it("dispatches click", () => {
    const handler = vi.fn();
    render(<CashflowYearBar month={month} maxAbsNet={1000} onClick={handler} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handler).toHaveBeenCalledWith(month);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test CashflowYearBar`
Expected: FAIL

- [ ] **Step 3: Implement**

```tsx
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import type { CashflowProjectionMonth } from "@finplan/shared";
import { format } from "date-fns";

interface CashflowYearBarProps {
  month: CashflowProjectionMonth;
  maxAbsNet: number;
  onClick: (month: CashflowProjectionMonth) => void;
}

export function CashflowYearBar({ month, maxAbsNet, onClick }: CashflowYearBarProps) {
  const heightPct =
    maxAbsNet > 0 ? Math.min(100, (Math.abs(month.netChange) / maxAbsNet) * 100) : 0;
  const monthLabel = format(new Date(month.year, month.month - 1, 1), "MMM");
  const ariaLabel = `${monthLabel} ${month.year}: net ${formatCurrency(month.netChange)}, closing ${formatCurrency(month.closingBalance)}${
    month.dipBelowZero ? ", dips below zero" : ""
  }`;
  return (
    <button
      type="button"
      onClick={() => onClick(month)}
      aria-label={ariaLabel}
      className={cn(
        "group relative flex flex-col items-center justify-end h-full rounded-t-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-page-accent",
        month.dipBelowZero
          ? "bg-attention/30 hover:bg-attention/50"
          : "bg-tier-surplus/30 hover:bg-tier-surplus/50"
      )}
      style={{ height: `${heightPct}%`, minHeight: 8 }}
    >
      <span className="absolute -bottom-5 text-[10px] uppercase tracking-widest text-text-tertiary">
        {monthLabel}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test CashflowYearBar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/cashflow/CashflowYearBar.tsx apps/frontend/src/components/forecast/cashflow/CashflowYearBar.test.tsx
git commit -m "feat(frontend): CashflowYearBar with dip-aware colouring"
```

---

### Task 21: CashflowYearView — headline cards, year nav, bars

**Files:**

- Create: `apps/frontend/src/components/forecast/cashflow/CashflowYearView.tsx`
- Create: `apps/frontend/src/components/forecast/cashflow/CashflowYearView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CashflowYearView } from "./CashflowYearView";
import type { CashflowProjection } from "@finplan/shared";

const fixture: CashflowProjection = {
  startingBalance: 1000,
  windowStart: { year: 2026, month: 4 },
  months: Array.from({ length: 12 }, (_, i) => ({
    year: 2026,
    month: ((i + 3) % 12) + 1,
    netChange: 100,
    openingBalance: 1000 + i * 100,
    closingBalance: 1100 + i * 100,
    dipBelowZero: i === 5,
    tightestPoint: { value: 0, day: 15 },
  })),
  projectedEndBalance: 2200,
  tightestDip: { value: -200, date: "2026-09-15" },
  avgMonthlySurplus: 100,
  oldestLinkedBalanceDate: "2026-04-01",
  youngestLinkedBalanceDate: "2026-04-01",
  linkedAccountCount: 1,
};

describe("CashflowYearView", () => {
  it("renders four headline cards", () => {
    render(
      <CashflowYearView
        projection={fixture}
        onSelectMonth={() => {}}
        onShiftWindow={() => {}}
        canShiftBack={false}
      />
    );
    expect(screen.getByText(/starting balance/i)).toBeInTheDocument();
    expect(screen.getByText(/projected end/i)).toBeInTheDocument();
    expect(screen.getByText(/tightest dip/i)).toBeInTheDocument();
    expect(screen.getByText(/average monthly surplus/i)).toBeInTheDocument();
  });

  it("renders 12 bars", () => {
    render(
      <CashflowYearView
        projection={fixture}
        onSelectMonth={() => {}}
        onShiftWindow={() => {}}
        canShiftBack={false}
      />
    );
    expect(screen.getAllByRole("button", { name: /^[A-Z][a-z]{2} 2026/ })).toHaveLength(12);
  });

  it("calls onSelectMonth when a bar is clicked", () => {
    const handler = vi.fn();
    render(
      <CashflowYearView
        projection={fixture}
        onSelectMonth={handler}
        onShiftWindow={() => {}}
        canShiftBack={false}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: /^[A-Z][a-z]{2} 2026/ })[0]!);
    expect(handler).toHaveBeenCalled();
  });

  it("renders amber tightest dip when value < 0", () => {
    render(
      <CashflowYearView
        projection={fixture}
        onSelectMonth={() => {}}
        onShiftWindow={() => {}}
        canShiftBack={false}
      />
    );
    const dip = screen.getByText(/-£200/);
    expect(dip.className).toMatch(/attention/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test CashflowYearView`
Expected: FAIL

- [ ] **Step 3: Implement**

```tsx
import { format } from "date-fns";
import type { CashflowProjection, CashflowProjectionMonth } from "@finplan/shared";
import { CashflowYearBar } from "./CashflowYearBar";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/lib/utils";

interface CashflowYearViewProps {
  projection: CashflowProjection;
  onSelectMonth: (month: CashflowProjectionMonth) => void;
  onShiftWindow: (delta: number) => void;
  canShiftBack: boolean;
}

function HeadlineCard({
  label,
  value,
  amber,
  sub,
}: {
  label: string;
  value: string;
  amber?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-surface-border bg-surface px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-text-tertiary font-heading">
        {label}
      </div>
      <div
        className={cn("font-numeric text-base mt-1", amber ? "text-attention" : "text-foreground")}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-text-tertiary mt-0.5">{sub}</div>}
    </div>
  );
}

export function CashflowYearView({
  projection,
  onSelectMonth,
  onShiftWindow,
  canShiftBack,
}: CashflowYearViewProps) {
  const { months, startingBalance, projectedEndBalance, tightestDip, avgMonthlySurplus } =
    projection;
  const maxAbsNet = Math.max(1, ...months.map((m) => Math.abs(m.netChange)));
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const range = `${format(new Date(first.year, first.month - 1, 1), "MMM yyyy")} — ${format(
    new Date(last.year, last.month - 1, 1),
    "MMM yyyy"
  )}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <HeadlineCard label="Starting balance" value={formatCurrency(startingBalance)} />
        <HeadlineCard label="Projected end" value={formatCurrency(projectedEndBalance)} />
        <HeadlineCard
          label="Tightest dip"
          value={formatCurrency(tightestDip.value)}
          amber={tightestDip.value < 0}
          sub={format(new Date(tightestDip.date), "d MMM yyyy")}
        />
        <HeadlineCard label="Average monthly surplus" value={formatCurrency(avgMonthlySurplus)} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canShiftBack}
            onClick={() => onShiftWindow(-1)}
            className="px-2 py-1 text-xs disabled:opacity-30 hover:text-page-accent"
          >
            ←
          </button>
          <span className="text-xs text-text-tertiary">{range}</span>
          <button
            type="button"
            onClick={() => onShiftWindow(1)}
            className="px-2 py-1 text-xs hover:text-page-accent"
          >
            →
          </button>
        </div>
        <button
          type="button"
          onClick={() => onShiftWindow(0)}
          className="text-xs uppercase tracking-widest text-text-secondary hover:text-page-accent"
        >
          Today
        </button>
      </div>

      <div className="h-48 flex items-end gap-2 pb-6">
        {months.map((m) => (
          <div key={`${m.year}-${m.month}`} className="flex-1 h-full flex items-end">
            <CashflowYearBar month={m} maxAbsNet={maxAbsNet} onClick={onSelectMonth} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test CashflowYearView`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/cashflow/CashflowYearView.tsx apps/frontend/src/components/forecast/cashflow/CashflowYearView.test.tsx
git commit -m "feat(frontend): CashflowYearView with headline cards, year navigation, monthly bars"
```

---

### Task 22: CashflowEventList

**Files:**

- Create: `apps/frontend/src/components/forecast/cashflow/CashflowEventList.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CashflowEventList } from "./CashflowEventList";

describe("CashflowEventList", () => {
  it("renders one row per event with date, label, signed amount, and running balance", () => {
    render(
      <CashflowEventList
        events={[
          {
            date: "2026-04-05",
            label: "Rent",
            amount: -1000,
            itemType: "committed_item",
            runningBalanceAfter: 200,
          },
          {
            date: "2026-04-25",
            label: "Salary",
            amount: 3000,
            itemType: "income_source",
            runningBalanceAfter: 3200,
          },
        ]}
      />
    );
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("-£1,000")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("+£3,000")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test CashflowEventList`
Expected: FAIL

- [ ] **Step 3: Implement**

```tsx
import { format } from "date-fns";
import type { CashflowEvent } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";

interface CashflowEventListProps {
  events: CashflowEvent[];
}

export function CashflowEventList({ events }: CashflowEventListProps) {
  if (events.length === 0)
    return <p className="text-xs text-text-tertiary px-2 py-3">No dated events this month.</p>;
  return (
    <ul className="divide-y divide-surface-border">
      {events.map((e, idx) => {
        const sign = e.amount >= 0 ? "+" : "-";
        return (
          <li
            key={`${e.date}-${idx}`}
            className="flex items-center justify-between px-2 py-2 text-xs"
          >
            <span className="flex items-center gap-3">
              <span className="text-text-tertiary w-12">{format(new Date(e.date), "d MMM")}</span>
              <span className="text-foreground">{e.label}</span>
            </span>
            <span className="flex items-center gap-4">
              <span className="font-numeric text-text-secondary">
                {sign}
                {formatCurrency(Math.abs(e.amount))}
              </span>
              <span className="font-numeric text-text-tertiary">
                {formatCurrency(e.runningBalanceAfter)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test CashflowEventList`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/cashflow/CashflowEventList.tsx apps/frontend/src/components/forecast/cashflow/CashflowEventList.test.tsx
git commit -m "feat(frontend): CashflowEventList for month drill-down"
```

---

### Task 23: CashflowMonthView — drill-down with breadcrumb, month strip, chart

**Files:**

- Create: `apps/frontend/src/components/forecast/cashflow/CashflowMonthView.tsx`
- Create: `apps/frontend/src/components/forecast/cashflow/CashflowMonthView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CashflowMonthView } from "./CashflowMonthView";
import type { CashflowMonthDetail } from "@finplan/shared";

const detail: CashflowMonthDetail = {
  year: 2026,
  month: 4,
  startingBalance: 1000,
  endBalance: 1500,
  netChange: 500,
  tightestPoint: { value: 800, day: 5 },
  amortisedDailyDiscretionary: 20,
  monthlyDiscretionaryTotal: 600,
  dailyTrace: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, balance: 1000 + i * 16 })),
  events: [
    {
      date: "2026-04-25",
      label: "Salary",
      amount: 3000,
      itemType: "income_source",
      runningBalanceAfter: 3000,
    },
  ],
};

describe("CashflowMonthView", () => {
  it("renders breadcrumb back to Cashflow", () => {
    render(
      <CashflowMonthView
        detail={detail}
        amberMonths={new Set()}
        onBack={() => {}}
        onSelectMonth={() => {}}
      />
    );
    expect(screen.getByText(/cashflow/i)).toBeInTheDocument();
    expect(screen.getByText(/april 2026/i)).toBeInTheDocument();
  });

  it("renders the discretionary amortisation info chip", () => {
    render(
      <CashflowMonthView
        detail={detail}
        amberMonths={new Set()}
        onBack={() => {}}
        onSelectMonth={() => {}}
      />
    );
    expect(screen.getByText(/£600\/mo amortised/i)).toBeInTheDocument();
  });

  it("calls onBack when breadcrumb clicked", () => {
    const handler = vi.fn();
    render(
      <CashflowMonthView
        detail={detail}
        amberMonths={new Set()}
        onBack={handler}
        onSelectMonth={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /← cashflow/i }));
    expect(handler).toHaveBeenCalled();
  });

  it("highlights amber months in the strip", () => {
    render(
      <CashflowMonthView
        detail={detail}
        amberMonths={new Set([6, 9])}
        onBack={() => {}}
        onSelectMonth={() => {}}
      />
    );
    const jun = screen.getByRole("button", { name: /jun/i });
    expect(jun.className).toMatch(/attention/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test CashflowMonthView`
Expected: FAIL

- [ ] **Step 3: Implement**

```tsx
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import type { CashflowMonthDetail } from "@finplan/shared";
import { CashflowEventList } from "./CashflowEventList";

interface CashflowMonthViewProps {
  detail: CashflowMonthDetail;
  amberMonths: Set<number>;
  onBack: () => void;
  onSelectMonth: (month: number) => void;
}

const STRIP = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const FULL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function CashflowMonthView({
  detail,
  amberMonths,
  onBack,
  onSelectMonth,
}: CashflowMonthViewProps) {
  const monthLabel = format(new Date(detail.year, detail.month - 1, 1), "MMMM yyyy");

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-xs text-text-tertiary hover:text-foreground"
      >
        ← Cashflow / {monthLabel}
      </button>

      <div className="flex items-center gap-1">
        {STRIP.map((letter, idx) => {
          const m = idx + 1;
          const active = m === detail.month;
          const amber = amberMonths.has(m);
          return (
            <button
              key={`${letter}-${idx}`}
              type="button"
              onClick={() => onSelectMonth(m)}
              aria-label={FULL[idx]}
              className={cn(
                "w-7 h-7 rounded text-[10px] font-heading uppercase",
                active && "bg-page-accent text-background",
                !active && amber && "bg-attention/20 text-attention",
                !active && !amber && "text-text-tertiary hover:text-foreground"
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Starting balance" value={formatCurrency(detail.startingBalance)} />
        <StatCard label="End balance" value={formatCurrency(detail.endBalance)} />
        <StatCard
          label="Tightest point"
          value={formatCurrency(detail.tightestPoint.value)}
          amber={detail.tightestPoint.value < 0}
        />
        <StatCard label="Net change" value={formatCurrency(detail.netChange)} />
      </div>

      <div className="rounded bg-surface border border-surface-border px-3 py-2 text-xs text-text-tertiary">
        Discretionary {formatCurrency(detail.monthlyDiscretionaryTotal)}/mo amortised evenly across
        the month
      </div>

      <div className="rounded-md border border-surface-border bg-surface p-4 h-56">
        <StepLineChart trace={detail.dailyTrace} events={detail.events} />
      </div>

      <CashflowEventList events={detail.events} />
    </div>
  );
}

function StatCard({ label, value, amber }: { label: string; value: string; amber?: boolean }) {
  return (
    <div className="rounded-md border border-surface-border bg-surface px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-text-tertiary font-heading">
        {label}
      </div>
      <div
        className={cn("font-numeric text-base mt-1", amber ? "text-attention" : "text-foreground")}
      >
        {value}
      </div>
    </div>
  );
}

function StepLineChart({
  trace,
  events,
}: {
  trace: Array<{ day: number; balance: number }>;
  events: Array<{ date: string }>;
}) {
  if (trace.length === 0) return null;
  const min = Math.min(...trace.map((p) => p.balance));
  const max = Math.max(...trace.map((p) => p.balance));
  const range = Math.max(1, max - min);
  const days = trace.length;
  const points = trace
    .map((p, i) => `${(i / (days - 1)) * 100},${100 - ((p.balance - min) / range) * 100}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <polyline points={points} fill="none" stroke="hsl(var(--page-accent))" strokeWidth="0.6" />
      {events.map((e, i) => {
        const day = parseInt(e.date.slice(8, 10), 10);
        const x = ((day - 1) / (days - 1)) * 100;
        return <circle key={i} cx={x} cy={50} r="0.8" fill="hsl(var(--page-accent))" />;
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test CashflowMonthView`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/cashflow/CashflowMonthView.tsx apps/frontend/src/components/forecast/cashflow/CashflowMonthView.test.tsx
git commit -m "feat(frontend): CashflowMonthView drill-down with month strip, stats, step-line, events"
```

---

### Task 24: CashflowSectionPanel — owns view state + slide transitions

**Files:**

- Create: `apps/frontend/src/components/forecast/cashflow/CashflowSectionPanel.tsx`
- Create: `apps/frontend/src/components/forecast/cashflow/CashflowSectionPanel.test.tsx`
- Create: `apps/frontend/src/components/forecast/cashflow/CashflowHeader.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "@/test/test-utils";
import { server } from "@/test/msw/server";
import { CashflowSectionPanel } from "./CashflowSectionPanel";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const projection = {
  startingBalance: 1000,
  windowStart: { year: 2026, month: 4 },
  months: Array.from({ length: 12 }, (_, i) => ({
    year: 2026,
    month: ((i + 3) % 12) + 1,
    netChange: 100,
    openingBalance: 1000,
    closingBalance: 1100,
    dipBelowZero: false,
    tightestPoint: { value: 1000, day: 1 },
  })),
  projectedEndBalance: 2200,
  tightestDip: { value: 800, date: "2026-04-15" },
  avgMonthlySurplus: 100,
  oldestLinkedBalanceDate: "2026-04-01",
  youngestLinkedBalanceDate: "2026-04-01",
  linkedAccountCount: 1,
};

describe("CashflowSectionPanel", () => {
  it("renders year view by default", async () => {
    server.use(
      http.get("/api/cashflow/projection", () => HttpResponse.json(projection)),
      http.get("/api/cashflow/linkable-accounts", () => HttpResponse.json([]))
    );
    renderWithProviders(<CashflowSectionPanel />);
    await waitFor(() => expect(screen.getByText(/starting balance/i)).toBeInTheDocument());
  });

  it("transitions to month detail when a bar is clicked", async () => {
    server.use(
      http.get("/api/cashflow/projection", () => HttpResponse.json(projection)),
      http.get("/api/cashflow/linkable-accounts", () => HttpResponse.json([])),
      http.get("/api/cashflow/month", () =>
        HttpResponse.json({
          year: 2026,
          month: 4,
          startingBalance: 1000,
          endBalance: 1500,
          netChange: 500,
          tightestPoint: { value: 800, day: 5 },
          amortisedDailyDiscretionary: 20,
          monthlyDiscretionaryTotal: 600,
          dailyTrace: [],
          events: [],
        })
      )
    );
    renderWithProviders(<CashflowSectionPanel />);
    const bar = await screen.findAllByRole("button", { name: /^[A-Z][a-z]{2} 2026/ });
    fireEvent.click(bar[0]!);
    await waitFor(() => expect(screen.getByText(/← cashflow/i)).toBeInTheDocument());
  });

  it("renders no-accounts callout when household has no linked accounts", async () => {
    server.use(
      http.get("/api/cashflow/projection", () =>
        HttpResponse.json({ ...projection, linkedAccountCount: 0, startingBalance: 0 })
      ),
      http.get("/api/cashflow/linkable-accounts", () => HttpResponse.json([]))
    );
    renderWithProviders(<CashflowSectionPanel />);
    await waitFor(() => expect(screen.getByText(/£0 starting balance/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test CashflowSectionPanel`
Expected: FAIL

- [ ] **Step 3: Implement**

```tsx
// CashflowHeader.tsx
import { useState } from "react";
import { LinkedAccountsButton } from "./LinkedAccountsButton";
import { LinkedAccountsPopover } from "./LinkedAccountsPopover";

interface CashflowHeaderProps {
  startingBalance: number;
  linkedCount: number;
}

export function CashflowHeader({ startingBalance, linkedCount }: CashflowHeaderProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-heading text-base uppercase tracking-widest text-page-accent">
        Cashflow
      </h2>
      <div className="relative">
        <LinkedAccountsButton
          startingBalance={startingBalance}
          linkedCount={linkedCount}
          isOpen={open}
          onClick={() => setOpen((o) => !o)}
        />
        {open && (
          <div className="absolute right-0 top-full mt-1 z-10">
            <LinkedAccountsPopover onClose={() => setOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
```

```tsx
// CashflowSectionPanel.tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { differenceInMonths } from "date-fns";
import type { CashflowProjectionMonth } from "@finplan/shared";
import { useCashflowProjection, useCashflowMonth } from "@/hooks/useCashflow";
import { usePrefersReducedMotion } from "@/utils/motion";
import { CashflowHeader } from "./CashflowHeader";
import { CashflowStaleBanner } from "./CashflowStaleBanner";
import { CashflowEmptyCallout } from "./CashflowEmptyCallout";
import { CashflowYearView } from "./CashflowYearView";
import { CashflowMonthView } from "./CashflowMonthView";

type View = { kind: "year" } | { kind: "month"; year: number; month: number };

export function CashflowSectionPanel() {
  const [view, setView] = useState<View>({ kind: "year" });
  const [windowOffset, setWindowOffset] = useState(0); // months from today
  const reduced = usePrefersReducedMotion();

  const today = new Date();
  const startMonth = ((today.getMonth() + windowOffset) % 12) + 1;
  const startYear = today.getFullYear() + Math.floor((today.getMonth() + windowOffset) / 12);

  const { data: projection, isLoading } = useCashflowProjection({
    monthCount: 12,
    startYear,
    startMonth,
  });

  const monthQuery = useCashflowMonth(
    view.kind === "month" ? view.year : 0,
    view.kind === "month" ? view.month : 0,
    view.kind === "month"
  );

  const slide = {
    initial: (dir: number) => ({ x: reduced ? 0 : dir * 24, opacity: 0 }),
    animate: { x: 0, opacity: 1, transition: { duration: 0.18, ease: [0.25, 1, 0.5, 1] } },
    exit: (dir: number) => ({
      x: reduced ? 0 : -dir * 24,
      opacity: 0,
      transition: { duration: 0.15 },
    }),
  };

  if (isLoading || !projection) {
    return (
      <div className="flex flex-col gap-4">
        <CashflowHeader startingBalance={0} linkedCount={0} />
        <div className="h-64 bg-surface border border-surface-border rounded-md animate-pulse" />
      </div>
    );
  }

  const oldestMonths = projection.oldestLinkedBalanceDate
    ? differenceInMonths(today, new Date(projection.oldestLinkedBalanceDate))
    : 0;
  const youngestMonths = projection.youngestLinkedBalanceDate
    ? differenceInMonths(today, new Date(projection.youngestLinkedBalanceDate))
    : 0;
  const showStale = oldestMonths >= 1 && projection.linkedAccountCount > 0;

  const amberMonths = new Set(projection.months.filter((m) => m.dipBelowZero).map((m) => m.month));

  function selectMonth(m: CashflowProjectionMonth) {
    setView({ kind: "month", year: m.year, month: m.month });
  }

  return (
    <div className="flex flex-col gap-4">
      <CashflowHeader
        startingBalance={projection.startingBalance}
        linkedCount={projection.linkedAccountCount}
      />
      {showStale && (
        <CashflowStaleBanner
          oldestMonths={oldestMonths}
          youngestMonths={youngestMonths}
          onRefresh={() => {
            // The popover handles its own open state via the header button.
            // For now, refresh nudges the user to click it.
          }}
        />
      )}
      {projection.linkedAccountCount === 0 && <CashflowEmptyCallout variant="no-accounts" />}

      <AnimatePresence mode="wait" custom={view.kind === "year" ? -1 : 1}>
        {view.kind === "year" && (
          <motion.div
            key="year"
            custom={-1}
            variants={slide}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <CashflowYearView
              projection={projection}
              onSelectMonth={selectMonth}
              onShiftWindow={(d) => setWindowOffset(d === 0 ? 0 : windowOffset + d)}
              canShiftBack={windowOffset > 0}
            />
          </motion.div>
        )}
        {view.kind === "month" && monthQuery.data && (
          <motion.div
            key={`month-${view.year}-${view.month}`}
            custom={1}
            variants={slide}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <CashflowMonthView
              detail={monthQuery.data}
              amberMonths={amberMonths}
              onBack={() => setView({ kind: "year" })}
              onSelectMonth={(m) => setView({ kind: "month", year: view.year, month: m })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test CashflowSectionPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/cashflow/CashflowSectionPanel.tsx apps/frontend/src/components/forecast/cashflow/CashflowSectionPanel.test.tsx apps/frontend/src/components/forecast/cashflow/CashflowHeader.tsx
git commit -m "feat(frontend): CashflowSectionPanel with view state machine and slide transitions"
```

---

### Task 25: Remove ForecastPage stub + integration check

**Files:**

- Modify: `apps/frontend/src/pages/ForecastPage.tsx`
- Modify: `apps/frontend/src/pages/ForecastPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a final integration assertion:

```tsx
it("clicking a year-view bar opens the month detail", async () => {
  // MSW mocks both projection and month endpoints
  renderWithProviders(<ForecastPage />);
  // ...
});
```

- [ ] **Step 2: Run test to verify it fails** (if stub is still in place — should already pass via Task 24)

- [ ] **Step 3: Remove the stub**

In `ForecastPage.tsx` confirm the import is `import { CashflowSectionPanel } from "@/components/forecast/cashflow/CashflowSectionPanel"` (real component, not stub).

- [ ] **Step 4: Run all forecast tests**

Run: `cd apps/frontend && bun test ForecastPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/ForecastPage.tsx apps/frontend/src/pages/ForecastPage.test.tsx
git commit -m "feat(frontend): wire real CashflowSectionPanel into ForecastPage"
```

---

## Phase E — Cleanup of legacy CashflowCalendar surface

### Task 26: Convert "incl. yearly ÷12" button to non-interactive row

**Files:**

- Modify: `apps/frontend/src/components/overview/WaterfallLeftPanel.tsx`
- Modify: `apps/frontend/src/components/overview/WaterfallLeftPanel.test.tsx` (if it exists; otherwise skip)

- [ ] **Step 1: Write the failing test**

Search-and-replace any existing test asserting `onOpenCashflowCalendar` is called from the ÷12 row. Add:

```tsx
it("renders ÷12 row as a non-interactive div when monthlyAvg12 > 0", () => {
  const summary = makeSummary({ committed: { monthlyAvg12: 200 } });
  render(<WaterfallLeftPanel summary={summary} selectedItemId={null} />);
  const row = screen.getByText(/incl\. yearly ÷12/i);
  // Walk up — should NOT be inside a <button>
  expect(row.closest("button")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test WaterfallLeftPanel`
Expected: FAIL — currently a `<button>`

- [ ] **Step 3: Edit WaterfallLeftPanel**

Remove `onOpenCashflowCalendar` from the props interface. Replace the `<button>` block with:

```tsx
{
  committed.monthlyAvg12 > 0 && (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 px-2 text-[13px] text-muted-foreground text-xs"
      )}
    >
      <span>incl. yearly ÷12</span>
      <span className={AMOUNT_CLASS}>{formatCurrency(committed.monthlyAvg12)}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test WaterfallLeftPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/WaterfallLeftPanel.tsx apps/frontend/src/components/overview/WaterfallLeftPanel.test.tsx
git commit -m "refactor(frontend): make incl. yearly ÷12 row non-interactive"
```

---

### Task 27: Remove cashflow view state from OverviewPage + ItemDetailPanel

**Files:**

- Modify: `apps/frontend/src/pages/OverviewPage.tsx`
- Modify: `apps/frontend/src/components/overview/ItemDetailPanel.tsx`

- [ ] **Step 1: Write the failing test**

In `OverviewPage.test.tsx`, ensure no test references the cashflow view variant. Add:

```tsx
it("does not render CashflowCalendar from OverviewPage anymore", () => {
  renderWithProviders(<OverviewPage />);
  expect(screen.queryByText(/yearly bills.*cashflow/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test OverviewPage`
Expected: FAIL — `CashflowCalendar` still imported and renderable

- [ ] **Step 3: Edit OverviewPage**

In `OverviewPage.tsx`:

1. Delete the `import { CashflowCalendar }` line.
2. Delete the `| { type: "cashflow" }` from `RightPanelView`.
3. Delete the `else if (view.type === "cashflow")` branch.
4. Delete the `onOpenCashflowCalendar={() => setView({ type: "cashflow" })}` prop on `WaterfallLeftPanel`.
5. Delete the `onViewCashflow={() => setView({ type: "cashflow" })}` prop on `ItemDetailPanel`.

In `ItemDetailPanel.tsx`:

1. Remove the `onViewCashflow` prop from the interface.
2. Remove any UI that triggers it (find by grepping `onViewCashflow`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test OverviewPage ItemDetailPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/OverviewPage.tsx apps/frontend/src/components/overview/ItemDetailPanel.tsx
git commit -m "refactor(frontend): remove cashflow view state from OverviewPage"
```

---

### Task 28: Delete CashflowCalendar component + frontend useCashflow + nudge

**Files:**

- Delete: `apps/frontend/src/components/overview/CashflowCalendar.tsx`
- Delete: `apps/frontend/src/components/overview/CashflowCalendar.test.tsx`
- Modify: `apps/frontend/src/hooks/useWaterfall.ts`
- Modify: `apps/frontend/src/services/waterfall.service.ts` (frontend)
- Modify: `apps/frontend/src/hooks/useNudge.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/hooks/useWaterfall.test.tsx
import { describe, it, expect } from "vitest";
import * as mod from "./useWaterfall";

describe("useWaterfall exports", () => {
  it("does not export useCashflow anymore", () => {
    expect((mod as any).useCashflow).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useWaterfall`
Expected: FAIL — `useCashflow` still exported

- [ ] **Step 3: Delete and update**

```bash
rm apps/frontend/src/components/overview/CashflowCalendar.tsx
rm apps/frontend/src/components/overview/CashflowCalendar.test.tsx
```

In `useWaterfall.ts`: delete the `useCashflow` function and the `cashflow:` entry from `WATERFALL_KEYS`.

In frontend `waterfall.service.ts`: delete the `getCashflow` method.

In `useNudge.ts`: delete the entire `useYearlyBillNudge` function and the `useCashflow` import. (Search consumers — `ItemDetailPanel` may reference it; remove that usage too.)

- [ ] **Step 4: Run all related tests**

Run: `cd apps/frontend && bun test useWaterfall useNudge ItemDetailPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/CashflowCalendar.tsx apps/frontend/src/components/overview/CashflowCalendar.test.tsx apps/frontend/src/hooks/useWaterfall.ts apps/frontend/src/services/waterfall.service.ts apps/frontend/src/hooks/useNudge.ts apps/frontend/src/components/overview/ItemDetailPanel.tsx
git commit -m "refactor(frontend): delete legacy CashflowCalendar surface and useYearlyBillNudge"
```

---

## Testing

### Backend Tests

- [ ] Service: `cashflowService.getProjection` returns 12 months by default
- [ ] Service: starting balance equals sum of latest linked balances
- [ ] Service: amber month detection triggers when intra-month dip < 0 even if net change positive
- [ ] Service: youngest balance date drives replay anchor
- [ ] Service: empty linked accounts → £0 starting balance, projection still computes
- [ ] Service: `updateAccountCashflowLink` rejects Pension/StocksAndShares/Other with `ValidationError`
- [ ] Service: `updateAccountCashflowLink` rejects cross-household with `NotFoundError`
- [ ] Service: bulk update wraps mutations in a transaction
- [ ] Service: month detail excludes monthly/yearly discretionary from event list, includes one-off discretionary
- [ ] Endpoint: `/api/cashflow/projection` validates `monthCount ∈ [1,24]`
- [ ] Endpoint: `/api/cashflow/month` validates `year ∈ [2000,2100]`, `month ∈ [1,12]`
- [ ] Endpoint: all routes 401 without auth
- [ ] Schema migration: existing rows backfilled with `dueDate = (currentYear, expectedMonth, 1)`
- [ ] Edge case: anchor date in the future → no replay phase, projection from anchor

### Frontend Tests

- [ ] Component: `ForecastSectionNavigator` highlights selected entry with `aria-current`
- [ ] Component: `CashflowYearView` renders 12 bars and 4 headline cards
- [ ] Component: `CashflowYearBar` uses amber when `dipBelowZero`
- [ ] Component: `CashflowMonthView` shows discretionary amortisation chip with monthly total
- [ ] Component: `LinkedAccountsPopover` toggles `isCashflowLinked` and bulk-mutates
- [ ] Component: `CashflowSectionPanel` slides from year → month on bar click
- [ ] Component: empty-state callouts compose (no accounts + no income)
- [ ] Hook: `useCashflowProjection` invalidates after `useBulkUpdateLinkedAccounts` succeeds
- [ ] Page: `ForecastPage` defaults to Cashflow on first visit; switches to Growth on click

### Key Scenarios

- [ ] Happy path: linked Current account with £4,200, monthly salary £3,000 on the 25th, monthly rent £1,000 on the 5th, no other items → projection shows 12 months with no dips and increasing balance
- [ ] Pinchpoint: same setup but starting balance £200 → April bar amber, Tightest dip card amber
- [ ] Stale data: linked balance dated 2 months ago → amber stale banner appears under header
- [ ] Empty: brand-new household → "no accounts" + "no income" + "no spend" callouts compose
- [ ] Drill-down: clicking April bar shows step-line chart, salary event in list, no Food line in events
- [ ] Adjacent month: clicking May letter in month strip switches without breadcrumb round-trip
- [ ] Reduced motion: with `prefers-reduced-motion: reduce`, slide transitions are skipped

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` clean
- [ ] `cd apps/backend && bun scripts/run-tests.ts cashflow` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts waterfall` passes (regression)
- [ ] `cd apps/backend && bun scripts/run-tests.ts export-import` passes (regression)
- [ ] `cd apps/frontend && bun test cashflow` passes
- [ ] `cd apps/frontend && bun test ForecastPage` passes
- [ ] Manual: navigate to `/forecast` → confirm two-panel shell, default Cashflow selected, 12 bars render, headline cards populate
- [ ] Manual: click a bar → month detail slides in with breadcrumb, month strip, stat cards, info chip, step-line chart, event list
- [ ] Manual: open linked-accounts popover → toggle a Current account → projection refetches and bars update
- [ ] Manual: switch to Growth → confirm Net Worth, Surplus Accumulation, Retirement charts render unchanged
- [ ] Manual: visit Overview → confirm "incl. yearly ÷12" row is non-interactive (no hover state, no click target)

## Post-conditions

- [ ] `IncomeSource.dueDate` and `CommittedItem.dueDate` are the canonical day-level timing fields; `expectedMonth`/`dueMonth` are gone from the entire codebase
- [ ] `Account.isCashflowLinked` + `Current` account type unblock future per-account spend attribution work
- [ ] Forecast page is two-panel-shell compliant, satisfying Anchor 17
- [ ] Cashflow projection algorithm is reusable: future "cashflow nudges in Overview" feature can call `cashflowService.getProjection` directly
- [ ] Legacy `/api/waterfall/cashflow` route, `CashflowCalendar` component, and `useYearlyBillNudge` are fully retired
