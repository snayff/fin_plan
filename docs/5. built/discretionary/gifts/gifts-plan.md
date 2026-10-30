---
feature: gifts
category: discretionary
spec: docs/4. planning/gifts/gifts-spec.md
creation_date: 2026-04-11
status: implemented
implemented_date: 2026-07-05
---

# Gifts — Implementation Plan

> **For Claude:** Use `/execute-plan gifts` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Build the Gifts planner — a People × Events matrix at `/gifts` with three modes (Gifts, Upcoming, Config), Quick Add bulk editor, Synced/Independent waterfall integration, automatic year rollover, and household-member auto-link — replacing the unused legacy gift schema and stub UI.

**Spec:** `docs/4. planning/gifts/gifts-spec.md`

**Architecture:** A new `gifts.service` owns all gift-domain logic against a redesigned matrix schema (`GiftPerson`, `GiftEvent`, `GiftAllocation`, `GiftPlannerSettings`, `GiftRolloverDismissal`). A new `gifts.routes` Fastify module exposes reads, mutations, mode-switch, and rollover-dismissal endpoints under `/api/gifts`. The Discretionary "Gifts" subcategory gains a `lockedByPlanner` flag and the planner-owned `DiscretionaryItem` gains an `isPlannerOwned` flag; `waterfall.service` honours both to block manual mutation and exclude the item from staleness. Year rollover runs lazily on first read after 1 January per household — no cron infrastructure. The frontend ships a single `GiftsPage` with a left-aside mode switcher (Gifts / Upcoming / Config) and right-panel drill states; the legacy `planner.*` gift code, frontend stubs, and `gift-dates.ts` are removed in the same migration.

**Tech Stack:** Fastify · Prisma · Zod · React 18 · TanStack Query · Tailwind · framer-motion

**Infrastructure Impact:**

- Touches `packages/shared/`: yes (new `gifts.schemas.ts`, removal of gift exports from `planner.schemas.ts`, update to `export-import.schemas.ts`)
- Requires DB migration: yes (single migration `replace_gifts_schema` — destructive drop of legacy tables + new tables + new flags on `Subcategory` and `DiscretionaryItem`)

## Pre-conditions

- [ ] `TwoPanelLayout` component exists at [TwoPanelLayout.tsx](apps/frontend/src/components/layout/TwoPanelLayout.tsx)
- [ ] `audited()` + `actorCtx(req)` available from [audit.service.ts](apps/backend/src/services/audit.service.ts)
- [ ] `ItemAmountPeriod` model + period helpers in [period.service.ts](apps/backend/src/services/period.service.ts)
- [ ] Per-file isolated test runner [run-tests.ts](apps/backend/scripts/run-tests.ts)
- [ ] `prismaMock` factory at [prisma.ts](apps/backend/src/test/mocks/prisma.ts)
- [ ] Pre-seeded "Gifts" subcategory in `subcategory.service.ts:DEFAULT_SUBCATEGORIES`
- [ ] `Member` model exposes household linkage and is mutated only via [member.service.ts](apps/backend/src/services/member.service.ts)
- [ ] Existing right-panel drill pattern (§3.2 of `design-system.md`) and inline-edit pattern (§4.11) — referenced in waterfall pages

## File-Structure Map

**New files:**

- `apps/backend/src/services/gifts.service.ts` — all gift-domain logic (people, events, allocations, settings, mode-switch, rollover, reads)
- `apps/backend/src/services/gifts.service.test.ts`
- `apps/backend/src/routes/gifts.routes.ts` — Fastify route module mounted at `/api/gifts`
- `apps/backend/src/routes/gifts.routes.test.ts`
- `packages/shared/src/schemas/gifts.schemas.ts` — Zod schemas + types for the gifts domain
- `packages/shared/src/schemas/gifts.schemas.test.ts`
- `apps/frontend/src/services/gifts.service.ts` — frontend API client wrapper
- `apps/frontend/src/hooks/useGifts.ts` — TanStack Query hooks
- `apps/frontend/src/components/gifts/GiftsLeftAside.tsx` (+ test)
- `apps/frontend/src/components/gifts/GiftsBudgetSummary.tsx` (+ test)
- `apps/frontend/src/components/gifts/GiftsRightPanel.tsx`
- `apps/frontend/src/components/gifts/GiftsModePanel.tsx` (+ test)
- `apps/frontend/src/components/gifts/GiftPersonList.tsx` (+ test)
- `apps/frontend/src/components/gifts/GiftPersonDetail.tsx` (+ test)
- `apps/frontend/src/components/gifts/UpcomingModePanel.tsx` (+ test)
- `apps/frontend/src/components/gifts/ConfigModePanel.tsx` (+ test)
- `apps/frontend/src/components/gifts/ConfigPeoplePanel.tsx` (+ test)
- `apps/frontend/src/components/gifts/ConfigEventsPanel.tsx` (+ test)
- `apps/frontend/src/components/gifts/ConfigPlannerModePanel.tsx` (+ test)
- `apps/frontend/src/components/gifts/ModeSwitchConfirmDialog.tsx` (+ test)
- `apps/frontend/src/components/gifts/QuickAddPanel.tsx` (+ test)
- `apps/frontend/src/components/gifts/YearRolloverBanner.tsx` (+ test)
- `apps/frontend/src/components/gifts/OverBudgetSignal.tsx`

**Modified files:**

- `apps/backend/prisma/schema.prisma` — drop legacy gift models, add new models, add `Subcategory.lockedByPlanner`, `DiscretionaryItem.isPlannerOwned`
- `apps/backend/src/test/mocks/prisma.ts` — drop `giftYearRecord`; add `giftAllocation`, `giftPlannerSettings`, `giftRolloverDismissal`
- `apps/backend/src/services/planner.service.ts` — remove all gift methods (keep purchases + year budget)
- `apps/backend/src/services/planner.service.test.ts` — remove gift tests
- `apps/backend/src/routes/planner.routes.ts` — remove gift routes
- `apps/backend/src/routes/planner.routes.test.ts` — remove gift route tests
- `packages/shared/src/schemas/planner.schemas.ts` — remove gift schemas/enums/types
- `packages/shared/src/schemas/index.ts` — remove gift re-exports from planner; add gifts re-exports
- `apps/backend/src/services/waterfall.service.ts` — block mutations on planner-owned discretionary items / planner-locked Gifts subcategory; exclude planner-owned items from staleness
- `apps/backend/src/services/waterfall.service.test.ts` — assertions for new guards
- `apps/backend/src/services/subcategory.service.ts` — set `lockedByPlanner` on Gifts subcategory at seed time iff Synced is the seed default
- `apps/backend/src/services/member.service.ts` — auto-create `GiftPerson` on member create; nullify `memberId` on member delete
- `apps/backend/src/services/member.service.test.ts` — assertions for the hook
- `apps/backend/src/services/export.service.ts` — emit new gift export shape
- `apps/backend/src/services/export.service.test.ts`
- `apps/backend/src/services/import.service.ts` — accept new gift export shape
- `apps/backend/src/services/import.service.test.ts`
- `apps/backend/src/services/export-import.roundtrip.test.ts`
- `packages/shared/src/schemas/export-import.schemas.ts` — bump `CURRENT_SCHEMA_VERSION`, replace gift export schema
- `packages/shared/src/schemas/export-import.schemas.test.ts`
- `apps/backend/src/server.ts` — register `giftsRoutes` at `/api/gifts`
- `apps/frontend/src/services/planner.service.ts` — remove gift methods
- `apps/frontend/src/hooks/usePlanner.ts` — remove gift hooks
- `apps/frontend/src/components/planner/PlannerLeftPanel.tsx` — remove gift section
- `apps/frontend/src/pages/GiftsPage.tsx` — full rewrite
- `apps/frontend/src/pages/GiftsPage.test.tsx` — full rewrite

**Deleted files:**

- `apps/backend/src/utils/gift-dates.ts`
- `apps/frontend/src/components/planner/GiftPersonDetailPanel.tsx`
- `apps/frontend/src/components/planner/GiftPersonDetailPanel.test.tsx`
- `apps/frontend/src/components/planner/GiftPersonListPanel.tsx`
- `apps/frontend/src/components/planner/GiftUpcomingPanel.tsx`

---

## Tasks

> Each task follows red-green-commit, contains complete code, and is one logical action. Phases group tasks by sub-system; later phases depend on earlier ones.

---

## Phase A — Schema migration & legacy demolition

### Task 1: Replace legacy gift schema in Prisma + run migration

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Run: `bun run db:migrate`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/gifts.service.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

beforeEach(() => resetPrismaMocks());

describe("schema: new gift models exist on prisma client", () => {
  it("exposes giftAllocation, giftPlannerSettings, giftRolloverDismissal", () => {
    expect(prismaMock.giftAllocation).toBeDefined();
    expect(prismaMock.giftPlannerSettings).toBeDefined();
    expect(prismaMock.giftRolloverDismissal).toBeDefined();
  });

  it("exposes giftAllocation.upsert as a mock fn", () => {
    expect(typeof prismaMock.giftAllocation.upsert).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `prismaMock.giftAllocation is undefined`

- [ ] **Step 3: Edit `apps/backend/prisma/schema.prisma`**

Remove the legacy `GiftEventType` and `GiftRecurrence` enums and the legacy `GiftPerson`, `GiftEvent`, `GiftYearRecord` models (lines ~434-491). Add the new schema below in the same place:

```prisma
enum GiftDateType {
  shared
  personal
}

enum GiftAllocationStatus {
  planned
  bought
  skipped
}

enum GiftPlannerMode {
  synced
  independent
}

model GiftPlannerSettings {
  id                          String          @id @default(cuid())
  householdId                 String          @unique
  mode                        GiftPlannerMode @default(synced)
  syncedDiscretionaryItemId   String?
  createdAt                   DateTime        @default(now())
  updatedAt                   DateTime        @updatedAt
}

model GiftPerson {
  id          String           @id @default(cuid())
  householdId String
  name        String
  notes       String?
  sortOrder   Int              @default(0)
  memberId    String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  allocations GiftAllocation[]

  @@unique([householdId, name])
  @@index([householdId])
  @@index([memberId])
}

model GiftEvent {
  id          String           @id @default(cuid())
  householdId String
  name        String
  dateType    GiftDateType
  dateMonth   Int?
  dateDay     Int?
  isLocked    Boolean          @default(false)
  sortOrder   Int              @default(0)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  allocations GiftAllocation[]

  @@unique([householdId, name])
  @@index([householdId])
}

model GiftAllocation {
  id           String               @id @default(cuid())
  householdId  String
  giftPersonId String
  giftEventId  String
  year         Int
  planned      Float                @default(0)
  spent        Float?
  status       GiftAllocationStatus @default(planned)
  notes        String?
  dateMonth    Int?
  dateDay      Int?
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
  giftPerson   GiftPerson           @relation(fields: [giftPersonId], references: [id], onDelete: Cascade)
  giftEvent    GiftEvent            @relation(fields: [giftEventId], references: [id], onDelete: Cascade)

  @@unique([giftPersonId, giftEventId, year])
  @@index([householdId, year])
  @@index([giftEventId, year])
}

model GiftRolloverDismissal {
  id          String   @id @default(cuid())
  householdId String
  userId      String
  year        Int
  createdAt   DateTime @default(now())

  @@unique([householdId, userId, year])
}
```

Then add `lockedByPlanner Boolean @default(false)` to `model Subcategory` (after `isDefault`) and `isPlannerOwned Boolean @default(false)` to `model DiscretionaryItem` (after `lastReviewedAt`).

Run the migration:

```bash
cd apps/backend && bun run db:migrate
```

Use migration name: `replace_gifts_schema`. Accept the destructive drop of `GiftPerson`, `GiftEvent`, `GiftYearRecord`, `GiftEventType`, `GiftRecurrence`.

- [ ] **Step 4: Update `apps/backend/src/test/mocks/prisma.ts`**

Replace `giftYearRecord: buildModelMock(),` with the new entries:

```typescript
  giftAllocation: buildModelMock(),
  giftPlannerSettings: buildModelMock(),
  giftRolloverDismissal: buildModelMock(),
```

Keep `giftPerson` and `giftEvent` (still present in schema, just reshaped).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations apps/backend/src/test/mocks/prisma.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): replace legacy gift schema with matrix model"
```

---

### Task 2: Remove legacy gift code from `planner.service`, `planner.routes`, `planner.schemas`

**Files:**

- Modify: `apps/backend/src/services/planner.service.ts`
- Modify: `apps/backend/src/services/planner.service.test.ts`
- Modify: `apps/backend/src/routes/planner.routes.ts`
- Modify: `apps/backend/src/routes/planner.routes.test.ts`
- Modify: `packages/shared/src/schemas/planner.schemas.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Delete: `apps/backend/src/utils/gift-dates.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/planner.service.test.ts — append at the bottom
describe("plannerService gift API removal", () => {
  it("no longer exposes gift methods", async () => {
    const { plannerService } = await import("./planner.service.js");
    expect((plannerService as any).listGiftPersons).toBeUndefined();
    expect((plannerService as any).createGiftPerson).toBeUndefined();
    expect((plannerService as any).getUpcomingGifts).toBeUndefined();
    expect((plannerService as any).upsertGiftYearRecord).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts planner.service`
Expected: FAIL — `listGiftPersons` is defined

- [ ] **Step 3: Edit `apps/backend/src/services/planner.service.ts`**

Remove imports of `nextEventDate`, `CreateGiftPersonInput`, `UpdateGiftPersonInput`, `CreateGiftEventInput`, `UpdateGiftEventInput`, `UpsertGiftYearRecordInput`. Delete every section under `// ─── Gift persons ───`, `// ─── Gift events ───`, `// ─── Gift year records ───`, and `// ─── Upcoming gifts ───`. Keep purchases and year-budget sections intact.

Remove the corresponding `describe(...)` blocks from `planner.service.test.ts` (every block whose subject starts with `gift` or `Gift`).

Edit `apps/backend/src/routes/planner.routes.ts`:

- Remove imports of `createGiftPersonSchema`, `updateGiftPersonSchema`, `createGiftEventSchema`, `updateGiftEventSchema`, `upsertGiftYearRecordSchema`.
- Delete every route handler under the `Upcoming gifts`, `Gift persons`, `Gift events`, and `Gift year records` sections.

Remove the corresponding describe blocks from `planner.routes.test.ts`.

Edit `packages/shared/src/schemas/planner.schemas.ts` — delete `GiftEventTypeEnum`, `GiftRecurrenceEnum`, `createGiftPersonSchema`, `updateGiftPersonSchema`, `createGiftEventSchema`, `updateGiftEventSchema`, `upsertGiftYearRecordSchema` and their inferred types. Keep purchase + year-budget exports.

Edit `packages/shared/src/schemas/index.ts` — remove the gift names from the planner re-export block. After this task it should re-export only `PurchasePriorityEnum`, `PurchaseStatusEnum`, `createPurchaseSchema`, `updatePurchaseSchema`, `upsertYearBudgetSchema`, and the matching types.

Delete `apps/backend/src/utils/gift-dates.ts` (no longer used).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts planner`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/planner.service.ts apps/backend/src/services/planner.service.test.ts apps/backend/src/routes/planner.routes.ts apps/backend/src/routes/planner.routes.test.ts packages/shared/src/schemas/planner.schemas.ts packages/shared/src/schemas/index.ts
git rm apps/backend/src/utils/gift-dates.ts
git commit -m "refactor(gifts): remove legacy gift code from planner module"
```

---

### Task 3: Add new shared Zod schemas for gifts

**Files:**

- Create: `packages/shared/src/schemas/gifts.schemas.ts`
- Create: `packages/shared/src/schemas/gifts.schemas.test.ts`
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/gifts.schemas.test.ts
import { describe, it, expect } from "bun:test";
import {
  GiftDateTypeEnum,
  GiftAllocationStatusEnum,
  GiftPlannerModeEnum,
  createGiftPersonSchema,
  createGiftEventSchema,
  upsertGiftAllocationSchema,
  bulkUpsertAllocationsSchema,
  setGiftBudgetSchema,
  setGiftPlannerModeSchema,
} from "./gifts.schemas";

describe("gifts schemas", () => {
  it("GiftDateTypeEnum allows shared and personal", () => {
    expect(GiftDateTypeEnum.parse("shared")).toBe("shared");
    expect(GiftDateTypeEnum.parse("personal")).toBe("personal");
    expect(() => GiftDateTypeEnum.parse("other")).toThrow();
  });

  it("createGiftPersonSchema requires non-empty name", () => {
    expect(() => createGiftPersonSchema.parse({ name: "" })).toThrow();
    expect(createGiftPersonSchema.parse({ name: "Mum" })).toEqual({ name: "Mum" });
  });

  it("createGiftEventSchema requires shared events to have month + day", () => {
    expect(() => createGiftEventSchema.parse({ name: "Christmas", dateType: "shared" })).toThrow();
    expect(
      createGiftEventSchema.parse({
        name: "Christmas",
        dateType: "shared",
        dateMonth: 12,
        dateDay: 25,
      })
    ).toMatchObject({ name: "Christmas", dateType: "shared", dateMonth: 12, dateDay: 25 });
  });

  it("createGiftEventSchema rejects month/day for personal events", () => {
    const parsed = createGiftEventSchema.parse({
      name: "Birthday",
      dateType: "personal",
    });
    expect(parsed.dateMonth).toBeUndefined();
    expect(parsed.dateDay).toBeUndefined();
  });

  it("upsertGiftAllocationSchema rejects negative planned/spent", () => {
    expect(() => upsertGiftAllocationSchema.parse({ planned: -1 })).toThrow();
    expect(() => upsertGiftAllocationSchema.parse({ spent: -5 })).toThrow();
    expect(upsertGiftAllocationSchema.parse({ planned: 50, spent: 0 })).toEqual({
      planned: 50,
      spent: 0,
    });
  });

  it("upsertGiftAllocationSchema accepts spent: null to clear", () => {
    expect(upsertGiftAllocationSchema.parse({ spent: null })).toEqual({ spent: null });
  });

  it("bulkUpsertAllocationsSchema caps payload at 500 cells", () => {
    const cell = { personId: "p", eventId: "e", year: 2026, planned: 1 };
    expect(() =>
      bulkUpsertAllocationsSchema.parse({
        cells: Array.from({ length: 501 }, () => cell),
      })
    ).toThrow();
    const ok = bulkUpsertAllocationsSchema.parse({
      cells: Array.from({ length: 500 }, () => cell),
    });
    expect(ok.cells).toHaveLength(500);
  });

  it("setGiftBudgetSchema requires non-negative budget", () => {
    expect(() => setGiftBudgetSchema.parse({ annualBudget: -1 })).toThrow();
    expect(setGiftBudgetSchema.parse({ annualBudget: 1500 })).toEqual({ annualBudget: 1500 });
  });

  it("setGiftPlannerModeSchema only accepts known modes", () => {
    expect(setGiftPlannerModeSchema.parse({ mode: "synced" }).mode).toBe("synced");
    expect(setGiftPlannerModeSchema.parse({ mode: "independent" }).mode).toBe("independent");
    expect(() => setGiftPlannerModeSchema.parse({ mode: "off" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test gifts.schemas`
Expected: FAIL — module not found

- [ ] **Step 3: Create `packages/shared/src/schemas/gifts.schemas.ts`**

```typescript
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const GiftDateTypeEnum = z.enum(["shared", "personal"]);
export type GiftDateType = z.infer<typeof GiftDateTypeEnum>;

export const GiftAllocationStatusEnum = z.enum(["planned", "bought", "skipped"]);
export type GiftAllocationStatus = z.infer<typeof GiftAllocationStatusEnum>;

export const GiftPlannerModeEnum = z.enum(["synced", "independent"]);
export type GiftPlannerMode = z.infer<typeof GiftPlannerModeEnum>;

// ─── Person ──────────────────────────────────────────────────────────────────

export const createGiftPersonSchema = z.object({
  name: z.string().trim().min(1),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateGiftPersonSchema = z.object({
  name: z.string().trim().min(1).optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateGiftPersonInput = z.infer<typeof createGiftPersonSchema>;
export type UpdateGiftPersonInput = z.infer<typeof updateGiftPersonSchema>;

// ─── Event ───────────────────────────────────────────────────────────────────

export const createGiftEventSchema = z
  .object({
    name: z.string().trim().min(1),
    dateType: GiftDateTypeEnum,
    dateMonth: z.number().int().min(1).max(12).optional(),
    dateDay: z.number().int().min(1).max(31).optional(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.dateType === "shared") {
      if (val.dateMonth === undefined || val.dateDay === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Shared-date events require dateMonth and dateDay",
        });
      }
    } else {
      // personal: month/day live on the allocation, not the event
      if (val.dateMonth !== undefined || val.dateDay !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Personal-date events must not specify dateMonth/dateDay on the event",
        });
      }
    }
  });

export const updateGiftEventSchema = z.object({
  name: z.string().trim().min(1).optional(),
  dateMonth: z.number().int().min(1).max(12).nullable().optional(),
  dateDay: z.number().int().min(1).max(31).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateGiftEventInput = z.infer<typeof createGiftEventSchema>;
export type UpdateGiftEventInput = z.infer<typeof updateGiftEventSchema>;

// ─── Allocation ──────────────────────────────────────────────────────────────

export const upsertGiftAllocationSchema = z.object({
  planned: z.number().min(0).optional(),
  spent: z.number().min(0).nullable().optional(),
  status: GiftAllocationStatusEnum.optional(),
  notes: z.string().nullable().optional(),
  dateMonth: z.number().int().min(1).max(12).nullable().optional(),
  dateDay: z.number().int().min(1).max(31).nullable().optional(),
});

export type UpsertGiftAllocationInput = z.infer<typeof upsertGiftAllocationSchema>;

export const bulkUpsertCellSchema = z.object({
  personId: z.string().min(1),
  eventId: z.string().min(1),
  year: z.number().int(),
  planned: z.number().min(0),
});

export const bulkUpsertAllocationsSchema = z.object({
  cells: z.array(bulkUpsertCellSchema).max(500),
});

export type BulkUpsertCell = z.infer<typeof bulkUpsertCellSchema>;
export type BulkUpsertAllocationsInput = z.infer<typeof bulkUpsertAllocationsSchema>;

// ─── Budget + mode ───────────────────────────────────────────────────────────

export const setGiftBudgetSchema = z.object({
  annualBudget: z.number().min(0),
});
export type SetGiftBudgetInput = z.infer<typeof setGiftBudgetSchema>;

export const setGiftPlannerModeSchema = z.object({
  mode: GiftPlannerModeEnum,
});
export type SetGiftPlannerModeInput = z.infer<typeof setGiftPlannerModeSchema>;

// ─── Read DTOs (server-shaped, mirrored on the frontend) ─────────────────────

export type GiftBudgetSummary = {
  annualBudget: number;
  planned: number;
  spent: number;
  plannedOverBudgetBy: number; // 0 if not over
  spentOverBudgetBy: number; // 0 if not over
};

export type GiftPersonRow = {
  id: string;
  name: string;
  notes: string | null;
  sortOrder: number;
  isHouseholdMember: boolean;
  plannedCount: number;
  boughtCount: number;
  plannedTotal: number;
  spentTotal: number;
  hasOverspend: boolean;
};

export type GiftAllocationRow = {
  id: string | null;
  giftPersonId: string;
  giftEventId: string;
  eventName: string;
  eventDateType: GiftDateType;
  eventIsLocked: boolean;
  year: number;
  planned: number;
  spent: number | null;
  status: GiftAllocationStatus;
  notes: string | null;
  dateMonth: number | null;
  dateDay: number | null;
  resolvedMonth: number | null;
  resolvedDay: number | null;
};

export type GiftPlannerStateResponse = {
  mode: GiftPlannerMode;
  year: number;
  isReadOnly: boolean;
  budget: GiftBudgetSummary;
  people: GiftPersonRow[];
  rolloverPending: boolean;
};

export type GiftPersonDetailResponse = {
  person: GiftPersonRow;
  allocations: GiftAllocationRow[];
};

export type GiftUpcomingCallouts = {
  thisMonth: { count: number; total: number };
  nextThreeMonths: { count: number; total: number };
  restOfYear: { count: number; total: number };
  dateless: { count: number; total: number };
};

export type GiftUpcomingGroup = {
  month: number; // 1–12 ; 0 represents Dateless
  rows: Array<{
    eventId: string;
    eventName: string;
    eventDateType: GiftDateType;
    day: number | null;
    recipients: Array<{
      personId: string;
      personName: string;
      planned: number;
      spent: number | null;
    }>;
    plannedTotal: number;
    spentTotal: number | null;
  }>;
};

export type GiftUpcomingResponse = {
  callouts: GiftUpcomingCallouts;
  groups: GiftUpcomingGroup[];
};
```

- [ ] **Step 4: Wire `gifts.schemas` into `packages/shared/src/schemas/index.ts`**

Append:

```typescript
// Gifts schemas and types
export * from "./gifts.schemas";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/shared && bun test gifts.schemas`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/gifts.schemas.ts packages/shared/src/schemas/gifts.schemas.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(gifts): add shared zod schemas and DTOs for gifts planner"
```

---

## Phase B — Backend service (`gifts.service`)

> All tasks below add to the same file `apps/backend/src/services/gifts.service.ts` and its test sibling. Each task is one TDD cycle.

### Task 4: Service skeleton + `getOrCreateSettings`

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts` (create)
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/services/gifts.service.test.ts`:

```typescript
const { giftsService } = await import("./gifts.service.js");

describe("giftsService.getOrCreateSettings", () => {
  it("returns existing settings when present", async () => {
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "hh-1",
      mode: "synced",
      syncedDiscretionaryItemId: "d1",
    } as any);

    const s = await giftsService.getOrCreateSettings("hh-1");
    expect(s.mode).toBe("synced");
    expect(prismaMock.giftPlannerSettings.create).not.toHaveBeenCalled();
  });

  it("creates with synced default when missing", async () => {
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue(null);
    prismaMock.giftPlannerSettings.create.mockResolvedValue({
      id: "s2",
      householdId: "hh-1",
      mode: "synced",
      syncedDiscretionaryItemId: null,
    } as any);

    const s = await giftsService.getOrCreateSettings("hh-1");
    expect(s.mode).toBe("synced");
    expect(prismaMock.giftPlannerSettings.create).toHaveBeenCalledWith({
      data: { householdId: "hh-1", mode: "synced" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `Cannot find module './gifts.service.js'`

- [ ] **Step 3: Create `apps/backend/src/services/gifts.service.ts`**

```typescript
import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";
import { audited, type ActorCtx } from "./audit.service.js";
import type {
  CreateGiftPersonInput,
  UpdateGiftPersonInput,
  CreateGiftEventInput,
  UpdateGiftEventInput,
  UpsertGiftAllocationInput,
  BulkUpsertAllocationsInput,
  SetGiftBudgetInput,
  GiftPlannerMode,
} from "@finplan/shared";

function assertOwned(item: { householdId: string } | null, householdId: string, label: string) {
  if (!item) throw new NotFoundError(`${label} not found`);
  if (item.householdId !== householdId) throw new NotFoundError(`${label} not found`);
}

export const giftsService = {
  // ─── Settings ───────────────────────────────────────────────────────────────
  async getOrCreateSettings(householdId: string) {
    const existing = await prisma.giftPlannerSettings.findUnique({ where: { householdId } });
    if (existing) return existing;
    return prisma.giftPlannerSettings.create({
      data: { householdId, mode: "synced" },
    });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): scaffold gifts service with settings bootstrap"
```

---

### Task 5: People CRUD with duplicate-name guard

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService people CRUD", () => {
  it("listPeople returns rows ordered by sortOrder asc", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([
      { id: "a", name: "Mum", sortOrder: 0, memberId: null },
      { id: "b", name: "Dad", sortOrder: 1, memberId: "m1" },
    ] as any);
    const rows = await giftsService.listPeople("hh-1");
    expect(rows).toHaveLength(2);
    expect(prismaMock.giftPerson.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  });

  it("createPerson rejects duplicate names with ConflictError", async () => {
    prismaMock.giftPerson.create.mockRejectedValue({ code: "P2002" });
    await expect(giftsService.createPerson("hh-1", { name: "Mum" })).rejects.toMatchObject({
      name: "ConflictError",
    });
  });

  it("createPerson persists with householdId", async () => {
    prismaMock.giftPerson.create.mockResolvedValue({ id: "p1" } as any);
    await giftsService.createPerson("hh-1", { name: "Sis", notes: "fav books" });
    expect(prismaMock.giftPerson.create).toHaveBeenCalledWith({
      data: { householdId: "hh-1", name: "Sis", notes: "fav books" },
    });
  });

  it("updatePerson asserts ownership", async () => {
    prismaMock.giftPerson.findUnique.mockResolvedValue({
      id: "p1",
      householdId: "other",
    } as any);
    await expect(giftsService.updatePerson("hh-1", "p1", { name: "x" })).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });

  it("deletePerson cascades via prisma onDelete", async () => {
    prismaMock.giftPerson.findUnique.mockResolvedValue({
      id: "p1",
      householdId: "hh-1",
    } as any);
    prismaMock.giftPerson.delete.mockResolvedValue({} as any);
    await giftsService.deletePerson("hh-1", "p1");
    expect(prismaMock.giftPerson.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `giftsService.listPeople is not a function`

- [ ] **Step 3: Append to `gifts.service.ts` (above the closing `}` of the `giftsService` object)**

```typescript
  // ─── People ─────────────────────────────────────────────────────────────────
  async listPeople(householdId: string) {
    return prisma.giftPerson.findMany({
      where: { householdId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },

  async createPerson(householdId: string, data: CreateGiftPersonInput) {
    try {
      return await prisma.giftPerson.create({ data: { householdId, ...data } });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A gift person with that name already exists");
      }
      throw err;
    }
  },

  async updatePerson(householdId: string, id: string, data: UpdateGiftPersonInput) {
    const existing = await prisma.giftPerson.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Gift person");
    try {
      return await prisma.giftPerson.update({ where: { id }, data });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A gift person with that name already exists");
      }
      throw err;
    }
  },

  async deletePerson(householdId: string, id: string) {
    const existing = await prisma.giftPerson.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Gift person");
    await prisma.giftPerson.delete({ where: { id } });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): people CRUD with duplicate-name guard"
```

---

### Task 6: Events CRUD with locked-event guard

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService events CRUD", () => {
  it("createEvent persists with householdId", async () => {
    prismaMock.giftEvent.create.mockResolvedValue({ id: "e1" } as any);
    await giftsService.createEvent("hh-1", {
      name: "Christmas",
      dateType: "shared",
      dateMonth: 12,
      dateDay: 25,
    });
    expect(prismaMock.giftEvent.create).toHaveBeenCalledWith({
      data: {
        householdId: "hh-1",
        name: "Christmas",
        dateType: "shared",
        dateMonth: 12,
        dateDay: 25,
        isLocked: false,
      },
    });
  });

  it("createEvent rejects duplicates", async () => {
    prismaMock.giftEvent.create.mockRejectedValue({ code: "P2002" });
    await expect(
      giftsService.createEvent("hh-1", { name: "Birthday", dateType: "personal" })
    ).rejects.toMatchObject({ name: "ConflictError" });
  });

  it("updateEvent rejects rename of locked event", async () => {
    prismaMock.giftEvent.findUnique.mockResolvedValue({
      id: "e1",
      householdId: "hh-1",
      isLocked: true,
      name: "Christmas",
    } as any);
    await expect(giftsService.updateEvent("hh-1", "e1", { name: "Xmas" })).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("updateEvent allows date override on a locked event", async () => {
    prismaMock.giftEvent.findUnique.mockResolvedValue({
      id: "e1",
      householdId: "hh-1",
      isLocked: true,
      name: "Mother's Day",
    } as any);
    prismaMock.giftEvent.update.mockResolvedValue({} as any);
    await giftsService.updateEvent("hh-1", "e1", { dateMonth: 3, dateDay: 22 });
    expect(prismaMock.giftEvent.update).toHaveBeenCalled();
  });

  it("deleteEvent rejects locked events", async () => {
    prismaMock.giftEvent.findUnique.mockResolvedValue({
      id: "e1",
      householdId: "hh-1",
      isLocked: true,
    } as any);
    await expect(giftsService.deleteEvent("hh-1", "e1")).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("deleteEvent succeeds for custom events", async () => {
    prismaMock.giftEvent.findUnique.mockResolvedValue({
      id: "e2",
      householdId: "hh-1",
      isLocked: false,
    } as any);
    prismaMock.giftEvent.delete.mockResolvedValue({} as any);
    await giftsService.deleteEvent("hh-1", "e2");
    expect(prismaMock.giftEvent.delete).toHaveBeenCalledWith({ where: { id: "e2" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `giftsService.createEvent is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  // ─── Events ─────────────────────────────────────────────────────────────────
  async listEvents(householdId: string) {
    return prisma.giftEvent.findMany({
      where: { householdId },
      orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  },

  async createEvent(householdId: string, data: CreateGiftEventInput) {
    const payload: any = {
      householdId,
      name: data.name,
      dateType: data.dateType,
      isLocked: false,
    };
    if (data.dateType === "shared") {
      payload.dateMonth = data.dateMonth;
      payload.dateDay = data.dateDay;
    }
    if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;
    try {
      return await prisma.giftEvent.create({ data: payload });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A gift event with that name already exists");
      }
      throw err;
    }
  },

  async updateEvent(householdId: string, id: string, data: UpdateGiftEventInput) {
    const existing = await prisma.giftEvent.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Gift event");
    if (existing!.isLocked && data.name !== undefined) {
      throw new ValidationError("Locked events cannot be renamed");
    }
    try {
      return await prisma.giftEvent.update({ where: { id }, data });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A gift event with that name already exists");
      }
      throw err;
    }
  },

  async deleteEvent(householdId: string, id: string) {
    const existing = await prisma.giftEvent.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Gift event");
    if (existing!.isLocked) {
      throw new ValidationError("Locked events cannot be deleted");
    }
    await prisma.giftEvent.delete({ where: { id } });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): events CRUD with locked-event guard"
```

---

### Task 7: Locked-event seeding helper

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.seedLockedEventsIfMissing", () => {
  it("creates the seven locked events when none exist", async () => {
    prismaMock.giftEvent.findMany.mockResolvedValue([] as any);
    prismaMock.giftEvent.createMany.mockResolvedValue({ count: 7 } as any);

    await giftsService.seedLockedEventsIfMissing("hh-1");

    expect(prismaMock.giftEvent.createMany).toHaveBeenCalledTimes(1);
    const args = (prismaMock.giftEvent.createMany.mock.calls[0] as any)[0];
    const names = args.data.map((d: any) => d.name);
    expect(names).toEqual([
      "Birthday",
      "Wedding Anniversary",
      "Valentine's Day",
      "Mother's Day",
      "Easter",
      "Father's Day",
      "Christmas",
    ]);
    expect(args.skipDuplicates).toBe(true);
    expect(args.data.every((d: any) => d.isLocked === true)).toBe(true);
    expect(args.data.find((d: any) => d.name === "Christmas")).toMatchObject({
      dateType: "shared",
      dateMonth: 12,
      dateDay: 25,
    });
    expect(args.data.find((d: any) => d.name === "Birthday")).toMatchObject({
      dateType: "personal",
      dateMonth: null,
      dateDay: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `seedLockedEventsIfMissing is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  // ─── Locked event seeding ───────────────────────────────────────────────────
  async seedLockedEventsIfMissing(householdId: string) {
    const seeds = [
      { name: "Birthday", dateType: "personal" as const, dateMonth: null, dateDay: null, sortOrder: 0 },
      { name: "Wedding Anniversary", dateType: "personal" as const, dateMonth: null, dateDay: null, sortOrder: 1 },
      { name: "Valentine's Day", dateType: "shared" as const, dateMonth: 2, dateDay: 14, sortOrder: 2 },
      { name: "Mother's Day", dateType: "shared" as const, dateMonth: 3, dateDay: 15, sortOrder: 3 },
      { name: "Easter", dateType: "shared" as const, dateMonth: 4, dateDay: 10, sortOrder: 4 },
      { name: "Father's Day", dateType: "shared" as const, dateMonth: 6, dateDay: 15, sortOrder: 5 },
      { name: "Christmas", dateType: "shared" as const, dateMonth: 12, dateDay: 25, sortOrder: 6 },
    ];
    await prisma.giftEvent.createMany({
      data: seeds.map((s) => ({ ...s, householdId, isLocked: true })),
      skipDuplicates: true,
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): seed locked events for new households"
```

---

### Task 8: Allocation upsert with status transitions

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.upsertAllocation status transitions", () => {
  beforeEach(() => {
    prismaMock.giftPerson.findUnique.mockResolvedValue({ id: "p1", householdId: "hh-1" } as any);
    prismaMock.giftEvent.findUnique.mockResolvedValue({ id: "e1", householdId: "hh-1" } as any);
  });

  it("rejects when year is in the past", async () => {
    const lastYear = new Date().getFullYear() - 1;
    await expect(
      giftsService.upsertAllocation("hh-1", "p1", "e1", lastYear, { planned: 10 })
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("setting spent to a number flips status to bought", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftAllocation.upsert.mockResolvedValue({} as any);
    await giftsService.upsertAllocation("hh-1", "p1", "e1", year, { spent: 25 });
    const args = (prismaMock.giftAllocation.upsert.mock.calls[0] as any)[0];
    expect(args.create.status).toBe("bought");
    expect(args.update.status).toBe("bought");
  });

  it("spent of 0 still flips status to bought", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftAllocation.upsert.mockResolvedValue({} as any);
    await giftsService.upsertAllocation("hh-1", "p1", "e1", year, { spent: 0 });
    const args = (prismaMock.giftAllocation.upsert.mock.calls[0] as any)[0];
    expect(args.update.status).toBe("bought");
  });

  it("clearing spent (null) reverts to planned", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftAllocation.upsert.mockResolvedValue({} as any);
    await giftsService.upsertAllocation("hh-1", "p1", "e1", year, { spent: null });
    const args = (prismaMock.giftAllocation.upsert.mock.calls[0] as any)[0];
    expect(args.update.status).toBe("planned");
    expect(args.update.spent).toBe(null);
  });

  it("explicit status: skipped is honoured even when spent provided", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftAllocation.upsert.mockResolvedValue({} as any);
    await giftsService.upsertAllocation("hh-1", "p1", "e1", year, {
      spent: null,
      status: "skipped",
    });
    const args = (prismaMock.giftAllocation.upsert.mock.calls[0] as any)[0];
    expect(args.update.status).toBe("skipped");
  });

  it("rejects person from another household", async () => {
    prismaMock.giftPerson.findUnique.mockResolvedValue({ id: "p1", householdId: "other" } as any);
    const year = new Date().getFullYear();
    await expect(
      giftsService.upsertAllocation("hh-1", "p1", "e1", year, { planned: 10 })
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `giftsService.upsertAllocation is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  // ─── Allocations ────────────────────────────────────────────────────────────
  _resolveStatus(input: UpsertGiftAllocationInput): "planned" | "bought" | "skipped" | undefined {
    if (input.status === "skipped") return "skipped";
    if (input.spent === null) return "planned";
    if (input.spent !== undefined) return "bought";
    return input.status;
  },

  _assertCurrentYear(year: number) {
    if (year < new Date().getFullYear()) {
      throw new ValidationError("Prior years are read-only");
    }
  },

  async upsertAllocation(
    householdId: string,
    personId: string,
    eventId: string,
    year: number,
    input: UpsertGiftAllocationInput
  ) {
    this._assertCurrentYear(year);
    const person = await prisma.giftPerson.findUnique({ where: { id: personId } });
    assertOwned(person, householdId, "Gift person");
    const event = await prisma.giftEvent.findUnique({ where: { id: eventId } });
    assertOwned(event, householdId, "Gift event");

    const status = this._resolveStatus(input);
    const writable: Record<string, unknown> = {};
    if (input.planned !== undefined) writable.planned = input.planned;
    if (input.spent !== undefined) writable.spent = input.spent;
    if (input.notes !== undefined) writable.notes = input.notes;
    if (input.dateMonth !== undefined) writable.dateMonth = input.dateMonth;
    if (input.dateDay !== undefined) writable.dateDay = input.dateDay;
    if (status !== undefined) writable.status = status;

    return prisma.giftAllocation.upsert({
      where: { giftPersonId_giftEventId_year: { giftPersonId: personId, giftEventId: eventId, year } },
      create: {
        householdId,
        giftPersonId: personId,
        giftEventId: eventId,
        year,
        planned: input.planned ?? 0,
        spent: input.spent ?? null,
        status: status ?? "planned",
        notes: input.notes ?? null,
        dateMonth: input.dateMonth ?? null,
        dateDay: input.dateDay ?? null,
      },
      update: writable,
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): allocation upsert with status transitions"
```

---

### Task 9: Bulk allocation upsert (Quick Add)

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.bulkUpsertAllocations", () => {
  it("rejects past-year cells", async () => {
    const lastYear = new Date().getFullYear() - 1;
    await expect(
      giftsService.bulkUpsertAllocations("hh-1", {
        cells: [{ personId: "p1", eventId: "e1", year: lastYear, planned: 10 }],
      })
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("upserts every cell in a transaction", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findMany.mockResolvedValue([
      { id: "p1", householdId: "hh-1" },
      { id: "p2", householdId: "hh-1" },
    ] as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([{ id: "e1", householdId: "hh-1" }] as any);
    prismaMock.giftAllocation.upsert.mockResolvedValue({} as any);

    await giftsService.bulkUpsertAllocations("hh-1", {
      cells: [
        { personId: "p1", eventId: "e1", year, planned: 25 },
        { personId: "p2", eventId: "e1", year, planned: 30 },
      ],
    });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.giftAllocation.upsert).toHaveBeenCalledTimes(2);
  });

  it("rejects cells with mismatched household ids", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findMany.mockResolvedValue([{ id: "p1", householdId: "other" }] as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([{ id: "e1", householdId: "hh-1" }] as any);

    await expect(
      giftsService.bulkUpsertAllocations("hh-1", {
        cells: [{ personId: "p1", eventId: "e1", year, planned: 10 }],
      })
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `bulkUpsertAllocations is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  async bulkUpsertAllocations(householdId: string, input: BulkUpsertAllocationsInput) {
    if (input.cells.length === 0) return { count: 0 };
    for (const cell of input.cells) this._assertCurrentYear(cell.year);

    const personIds = Array.from(new Set(input.cells.map((c) => c.personId)));
    const eventIds = Array.from(new Set(input.cells.map((c) => c.eventId)));

    const [persons, events] = await Promise.all([
      prisma.giftPerson.findMany({ where: { id: { in: personIds } } }),
      prisma.giftEvent.findMany({ where: { id: { in: eventIds } } }),
    ]);
    if (persons.length !== personIds.length) throw new NotFoundError("Gift person not found");
    if (events.length !== eventIds.length) throw new NotFoundError("Gift event not found");
    for (const p of persons) if (p.householdId !== householdId) throw new NotFoundError("Gift person not found");
    for (const e of events) if (e.householdId !== householdId) throw new NotFoundError("Gift event not found");

    await prisma.$transaction(async (tx) => {
      for (const cell of input.cells) {
        await tx.giftAllocation.upsert({
          where: {
            giftPersonId_giftEventId_year: {
              giftPersonId: cell.personId,
              giftEventId: cell.eventId,
              year: cell.year,
            },
          },
          create: {
            householdId,
            giftPersonId: cell.personId,
            giftEventId: cell.eventId,
            year: cell.year,
            planned: cell.planned,
          },
          update: { planned: cell.planned },
        });
      }
    });
    return { count: input.cells.length };
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): bulk allocation upsert for Quick Add"
```

---

### Task 10: Annual budget setter (Synced writes ItemAmountPeriod)

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.setAnnualBudget", () => {
  it("rejects past years", async () => {
    const lastYear = new Date().getFullYear() - 1;
    await expect(
      giftsService.setAnnualBudget("hh-1", lastYear, { annualBudget: 1500 })
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("upserts the per-year planner budget", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "hh-1",
      mode: "independent",
      syncedDiscretionaryItemId: null,
    } as any);
    prismaMock.plannerYearBudget.upsert.mockResolvedValue({} as any);

    await giftsService.setAnnualBudget("hh-1", year, { annualBudget: 1500 });

    expect(prismaMock.plannerYearBudget.upsert).toHaveBeenCalledWith({
      where: { householdId_year: { householdId: "hh-1", year } },
      create: { householdId: "hh-1", year, giftBudget: 1500 },
      update: { giftBudget: 1500 },
    });
  });

  it("in synced mode also upserts ItemAmountPeriod for the planner-owned item", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "hh-1",
      mode: "synced",
      syncedDiscretionaryItemId: "d1",
    } as any);
    prismaMock.plannerYearBudget.upsert.mockResolvedValue({} as any);
    prismaMock.itemAmountPeriod.upsert.mockResolvedValue({} as any);

    await giftsService.setAnnualBudget("hh-1", year, { annualBudget: 1500 });

    expect(prismaMock.itemAmountPeriod.upsert).toHaveBeenCalledTimes(1);
    const call = (prismaMock.itemAmountPeriod.upsert.mock.calls[0] as any)[0];
    expect(call.where.itemType_itemId_startDate).toMatchObject({
      itemType: "discretionary_item",
      itemId: "d1",
    });
    expect(call.update.amount).toBe(1500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `setAnnualBudget is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  // ─── Budget ─────────────────────────────────────────────────────────────────
  async setAnnualBudget(householdId: string, year: number, input: SetGiftBudgetInput) {
    this._assertCurrentYear(year);
    const settings = await this.getOrCreateSettings(householdId);
    await prisma.plannerYearBudget.upsert({
      where: { householdId_year: { householdId, year } },
      create: { householdId, year, giftBudget: input.annualBudget },
      update: { giftBudget: input.annualBudget },
    });

    if (settings.mode === "synced" && settings.syncedDiscretionaryItemId) {
      const startDate = new Date(Date.UTC(year, 0, 1));
      await prisma.itemAmountPeriod.upsert({
        where: {
          itemType_itemId_startDate: {
            itemType: "discretionary_item",
            itemId: settings.syncedDiscretionaryItemId,
            startDate,
          },
        },
        create: {
          itemType: "discretionary_item",
          itemId: settings.syncedDiscretionaryItemId,
          startDate,
          endDate: null,
          amount: input.annualBudget,
        },
        update: { amount: input.annualBudget },
      });
    }

    return { annualBudget: input.annualBudget };
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): set annual budget with synced waterfall write"
```

---

### Task 11: Mode switch (synced ↔ independent)

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.setMode", () => {
  it("synced→independent deletes the planner-owned item, periods, clears flags", async () => {
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "hh-1",
      mode: "synced",
      syncedDiscretionaryItemId: "d1",
    } as any);
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-gifts",
      householdId: "hh-1",
      tier: "discretionary",
      name: "Gifts",
    } as any);
    prismaMock.itemAmountPeriod.deleteMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.discretionaryItem.delete.mockResolvedValue({} as any);
    prismaMock.subcategory.update.mockResolvedValue({} as any);
    prismaMock.giftPlannerSettings.update.mockResolvedValue({} as any);

    await giftsService.setMode("hh-1", { mode: "independent" });

    expect(prismaMock.itemAmountPeriod.deleteMany).toHaveBeenCalledWith({
      where: { itemType: "discretionary_item", itemId: "d1" },
    });
    expect(prismaMock.discretionaryItem.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
      where: { id: "sub-gifts" },
      data: { lockedByPlanner: false },
    });
    expect(prismaMock.giftPlannerSettings.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { mode: "independent", syncedDiscretionaryItemId: null },
    });
  });

  it("independent→synced creates planner-owned item, sets flags, writes ItemAmountPeriod", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "hh-1",
      mode: "independent",
      syncedDiscretionaryItemId: null,
    } as any);
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-gifts",
      householdId: "hh-1",
      tier: "discretionary",
      name: "Gifts",
    } as any);
    prismaMock.discretionaryItem.create.mockResolvedValue({ id: "d-new" } as any);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({ giftBudget: 800 } as any);
    prismaMock.itemAmountPeriod.upsert.mockResolvedValue({} as any);
    prismaMock.subcategory.update.mockResolvedValue({} as any);
    prismaMock.giftPlannerSettings.update.mockResolvedValue({} as any);

    await giftsService.setMode("hh-1", { mode: "synced" });

    expect(prismaMock.discretionaryItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: "hh-1",
        subcategoryId: "sub-gifts",
        name: "Gifts",
        spendType: "monthly",
        isPlannerOwned: true,
      }),
    });
    expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
      where: { id: "sub-gifts" },
      data: { lockedByPlanner: true },
    });
    const periodCall = (prismaMock.itemAmountPeriod.upsert.mock.calls[0] as any)[0];
    expect(periodCall.create.amount).toBe(800);
    expect(prismaMock.giftPlannerSettings.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { mode: "synced", syncedDiscretionaryItemId: "d-new" },
    });
  });

  it("noop when target mode already matches current mode", async () => {
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "hh-1",
      mode: "synced",
      syncedDiscretionaryItemId: "d1",
    } as any);
    await giftsService.setMode("hh-1", { mode: "synced" });
    expect(prismaMock.discretionaryItem.create).not.toHaveBeenCalled();
    expect(prismaMock.discretionaryItem.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `setMode is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  // ─── Mode switch ────────────────────────────────────────────────────────────
  async setMode(householdId: string, input: { mode: GiftPlannerMode }, ctx?: ActorCtx) {
    const settings = await this.getOrCreateSettings(householdId);
    if (settings.mode === input.mode) return settings;

    const giftsSubcategory = await prisma.subcategory.findFirst({
      where: { householdId, tier: "discretionary", name: "Gifts" },
    });
    if (!giftsSubcategory) throw new NotFoundError("Gifts subcategory not found");

    if (settings.mode === "synced" && input.mode === "independent") {
      const itemId = settings.syncedDiscretionaryItemId;
      await prisma.$transaction(async (tx) => {
        if (itemId) {
          await tx.itemAmountPeriod.deleteMany({
            where: { itemType: "discretionary_item", itemId },
          });
          await tx.discretionaryItem.delete({ where: { id: itemId } });
        }
        await tx.subcategory.update({
          where: { id: giftsSubcategory.id },
          data: { lockedByPlanner: false },
        });
        await tx.giftPlannerSettings.update({
          where: { id: settings.id },
          data: { mode: "independent", syncedDiscretionaryItemId: null },
        });
      });
      if (ctx) {
        await audited({
          db: prisma,
          ctx,
          action: "GIFTS_MODE_SWITCH",
          resource: "gift-planner-settings",
          resourceId: settings.id,
          beforeFetch: async () => settings as any,
          mutation: async () => ({ mode: "independent" }) as any,
        });
      }
      return { ...settings, mode: "independent" as const, syncedDiscretionaryItemId: null };
    }

    // independent → synced
    const year = new Date().getFullYear();
    const yearBudget = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year } },
    });
    const annualBudget = yearBudget?.giftBudget ?? 0;
    const startDate = new Date(Date.UTC(year, 0, 1));

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.discretionaryItem.create({
        data: {
          householdId,
          subcategoryId: giftsSubcategory.id,
          name: "Gifts",
          spendType: "monthly",
          isPlannerOwned: true,
          lastReviewedAt: new Date(),
        },
      });
      await tx.itemAmountPeriod.upsert({
        where: {
          itemType_itemId_startDate: {
            itemType: "discretionary_item",
            itemId: created.id,
            startDate,
          },
        },
        create: {
          itemType: "discretionary_item",
          itemId: created.id,
          startDate,
          endDate: null,
          amount: annualBudget,
        },
        update: { amount: annualBudget },
      });
      await tx.subcategory.update({
        where: { id: giftsSubcategory.id },
        data: { lockedByPlanner: true },
      });
      await tx.giftPlannerSettings.update({
        where: { id: settings.id },
        data: { mode: "synced", syncedDiscretionaryItemId: created.id },
      });
      return created;
    });
    if (ctx) {
      await audited({
        db: prisma,
        ctx,
        action: "GIFTS_MODE_SWITCH",
        resource: "gift-planner-settings",
        resourceId: settings.id,
        beforeFetch: async () => settings as any,
        mutation: async () => ({ mode: "synced", syncedDiscretionaryItemId: result.id }) as any,
      });
    }
    return { ...settings, mode: "synced" as const, syncedDiscretionaryItemId: result.id };
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): synced↔independent mode switch with destructive audit"
```

---

### Task 12: Reads — `getPlannerState` (budget summary + people aggregates)

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.getPlannerState", () => {
  it("returns budget, mode, and per-person aggregates", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "hh-1",
      mode: "synced",
      syncedDiscretionaryItemId: "d1",
    } as any);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({ giftBudget: 1000 } as any);
    prismaMock.giftPerson.findMany.mockResolvedValue([
      { id: "p1", name: "Mum", notes: null, sortOrder: 0, memberId: null },
      { id: "p2", name: "Dad", notes: null, sortOrder: 1, memberId: "m1" },
    ] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      { giftPersonId: "p1", planned: 100, spent: 90, status: "bought" },
      { giftPersonId: "p1", planned: 50, spent: null, status: "planned" },
      { giftPersonId: "p2", planned: 200, spent: 250, status: "bought" }, // overspend
    ] as any);
    prismaMock.giftRolloverDismissal.findUnique.mockResolvedValue(null);

    const state = await giftsService.getPlannerState("hh-1", year, "user-1");

    expect(state.mode).toBe("synced");
    expect(state.year).toBe(year);
    expect(state.isReadOnly).toBe(false);
    expect(state.budget.annualBudget).toBe(1000);
    expect(state.budget.planned).toBe(350);
    expect(state.budget.spent).toBe(340);
    expect(state.budget.plannedOverBudgetBy).toBe(0);
    expect(state.budget.spentOverBudgetBy).toBe(0);

    const mum = state.people.find((p) => p.id === "p1")!;
    expect(mum.plannedTotal).toBe(150);
    expect(mum.spentTotal).toBe(90);
    expect(mum.plannedCount).toBe(1);
    expect(mum.boughtCount).toBe(1);
    expect(mum.hasOverspend).toBe(false);

    const dad = state.people.find((p) => p.id === "p2")!;
    expect(dad.isHouseholdMember).toBe(true);
    expect(dad.hasOverspend).toBe(true);
  });

  it("computes plannedOverBudgetBy and spentOverBudgetBy when over", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      mode: "independent",
      syncedDiscretionaryItemId: null,
    } as any);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({ giftBudget: 100 } as any);
    prismaMock.giftPerson.findMany.mockResolvedValue([] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      { giftPersonId: "p1", planned: 150, spent: 200, status: "bought" },
    ] as any);
    prismaMock.giftRolloverDismissal.findUnique.mockResolvedValue(null);

    const state = await giftsService.getPlannerState("hh-1", year, "user-1");
    expect(state.budget.plannedOverBudgetBy).toBe(50);
    expect(state.budget.spentOverBudgetBy).toBe(100);
  });

  it("flags prior years as read-only", async () => {
    const lastYear = new Date().getFullYear() - 1;
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      mode: "synced",
      syncedDiscretionaryItemId: "d1",
    } as any);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({ giftBudget: 0 } as any);
    prismaMock.giftPerson.findMany.mockResolvedValue([] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([] as any);
    prismaMock.giftRolloverDismissal.findUnique.mockResolvedValue(null);

    const state = await giftsService.getPlannerState("hh-1", lastYear, "user-1");
    expect(state.isReadOnly).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `getPlannerState is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  // ─── Reads ──────────────────────────────────────────────────────────────────
  async getPlannerState(householdId: string, year: number, userId: string) {
    const [settings, budgetRow, persons, allocations, dismissal] = await Promise.all([
      this.getOrCreateSettings(householdId),
      prisma.plannerYearBudget.findUnique({
        where: { householdId_year: { householdId, year } },
      }),
      prisma.giftPerson.findMany({
        where: { householdId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.giftAllocation.findMany({ where: { householdId, year } }),
      prisma.giftRolloverDismissal.findUnique({
        where: { householdId_userId_year: { householdId, userId, year } },
      }),
    ]);

    const annualBudget = budgetRow?.giftBudget ?? 0;
    const plannedTotal = allocations.reduce((s, a) => s + (a.planned ?? 0), 0);
    const spentTotal = allocations.reduce((s, a) => s + (a.spent ?? 0), 0);

    const allocationsByPerson = new Map<string, typeof allocations>();
    for (const a of allocations) {
      const arr = allocationsByPerson.get(a.giftPersonId) ?? [];
      arr.push(a);
      allocationsByPerson.set(a.giftPersonId, arr);
    }

    const people = persons.map((p) => {
      const items = allocationsByPerson.get(p.id) ?? [];
      const plannedCount = items.filter((i) => i.status === "planned").length;
      const boughtCount = items.filter((i) => i.status === "bought").length;
      const plannedRowTotal = items.reduce((s, i) => s + (i.planned ?? 0), 0);
      const spentRowTotal = items.reduce((s, i) => s + (i.spent ?? 0), 0);
      const hasOverspend = items.some(
        (i) => i.spent !== null && i.spent !== undefined && i.spent > (i.planned ?? 0)
      );
      return {
        id: p.id,
        name: p.name,
        notes: p.notes,
        sortOrder: p.sortOrder,
        isHouseholdMember: p.memberId !== null,
        plannedCount,
        boughtCount,
        plannedTotal: plannedRowTotal,
        spentTotal: spentRowTotal,
        hasOverspend,
      };
    });

    return {
      mode: settings.mode,
      year,
      isReadOnly: year < new Date().getFullYear(),
      budget: {
        annualBudget,
        planned: plannedTotal,
        spent: spentTotal,
        plannedOverBudgetBy: Math.max(0, plannedTotal - annualBudget),
        spentOverBudgetBy: Math.max(0, spentTotal - annualBudget),
      },
      people,
      rolloverPending: dismissal === null && (await this._isRolloverPending(householdId, year)),
    };
  },

  async _isRolloverPending(householdId: string, year: number): Promise<boolean> {
    if (year !== new Date().getFullYear()) return false;
    const current = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year } },
    });
    if (!current) return false;
    const prior = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year: year - 1 } },
    });
    return prior !== null;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): planner state read with budget aggregates"
```

---

### Task 13: Reads — `getPersonDetail` and `listEventsForConfig`

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.getPersonDetail", () => {
  it("returns event-joined allocations for a person in a year", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findUnique.mockResolvedValue({
      id: "p1",
      householdId: "hh-1",
      name: "Mum",
      notes: null,
      sortOrder: 0,
      memberId: null,
    } as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([
      {
        id: "e1",
        name: "Christmas",
        dateType: "shared",
        dateMonth: 12,
        dateDay: 25,
        isLocked: true,
      },
      {
        id: "e2",
        name: "Birthday",
        dateType: "personal",
        dateMonth: null,
        dateDay: null,
        isLocked: true,
      },
    ] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      {
        id: "a1",
        giftPersonId: "p1",
        giftEventId: "e1",
        year,
        planned: 50,
        spent: 60,
        status: "bought",
        notes: null,
        dateMonth: null,
        dateDay: null,
      },
    ] as any);

    const detail = await giftsService.getPersonDetail("hh-1", "p1", year);
    expect(detail.allocations).toHaveLength(2); // joined: existing + virtual blank for e2
    const existing = detail.allocations.find((a) => a.giftEventId === "e1")!;
    expect(existing.eventName).toBe("Christmas");
    expect(existing.resolvedMonth).toBe(12);
    const virtual = detail.allocations.find((a) => a.giftEventId === "e2")!;
    expect(virtual.id).toBe(null);
    expect(virtual.planned).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `getPersonDetail is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  async getPersonDetail(householdId: string, personId: string, year: number) {
    const person = await prisma.giftPerson.findUnique({ where: { id: personId } });
    assertOwned(person, householdId, "Gift person");
    const [events, allocations] = await Promise.all([
      prisma.giftEvent.findMany({
        where: { householdId },
        orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }],
      }),
      prisma.giftAllocation.findMany({
        where: { householdId, giftPersonId: personId, year },
      }),
    ]);

    const allocByEventId = new Map(allocations.map((a) => [a.giftEventId, a]));
    const rows = events.map((e) => {
      const a = allocByEventId.get(e.id);
      const dateMonth = a?.dateMonth ?? null;
      const dateDay = a?.dateDay ?? null;
      const resolvedMonth =
        e.dateType === "shared" ? (dateMonth ?? e.dateMonth ?? null) : dateMonth;
      const resolvedDay = e.dateType === "shared" ? (dateDay ?? e.dateDay ?? null) : dateDay;
      return {
        id: a?.id ?? null,
        giftPersonId: personId,
        giftEventId: e.id,
        eventName: e.name,
        eventDateType: e.dateType,
        eventIsLocked: e.isLocked,
        year,
        planned: a?.planned ?? 0,
        spent: a?.spent ?? null,
        status: a?.status ?? "planned",
        notes: a?.notes ?? null,
        dateMonth,
        dateDay,
        resolvedMonth,
        resolvedDay,
      };
    });

    return {
      person: {
        id: person!.id,
        name: person!.name,
        notes: person!.notes,
        sortOrder: person!.sortOrder,
        isHouseholdMember: person!.memberId !== null,
        plannedCount: rows.filter((r) => r.status === "planned" && r.id !== null).length,
        boughtCount: rows.filter((r) => r.status === "bought").length,
        plannedTotal: rows.reduce((s, r) => s + r.planned, 0),
        spentTotal: rows.reduce((s, r) => s + (r.spent ?? 0), 0),
        hasOverspend: rows.some((r) => r.spent !== null && r.spent > r.planned),
      },
      allocations: rows,
    };
  },

  async listEventsForConfig(householdId: string) {
    return prisma.giftEvent.findMany({
      where: { householdId },
      orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  },

  async listPeopleForConfig(
    householdId: string,
    filter: "all" | "household" | "non-household" = "all"
  ) {
    const where: any = { householdId };
    if (filter === "household") where.memberId = { not: null };
    if (filter === "non-household") where.memberId = null;
    return prisma.giftPerson.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },

  async listYearsWithData(householdId: string) {
    const rows = await prisma.plannerYearBudget.findMany({
      where: { householdId },
      orderBy: { year: "desc" },
      select: { year: true },
    });
    return rows.map((r) => r.year);
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): person detail and config list reads"
```

---

### Task 14: Upcoming view aggregator

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.getUpcoming", () => {
  it("collapses shared-date events into one row per event-month-day", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      {
        giftPersonId: "p1",
        giftEventId: "e1",
        planned: 50,
        spent: null,
        dateMonth: null,
        dateDay: null,
        giftPerson: { id: "p1", name: "Mum" },
        giftEvent: {
          id: "e1",
          name: "Christmas",
          dateType: "shared",
          dateMonth: 12,
          dateDay: 25,
          isLocked: true,
        },
      },
      {
        giftPersonId: "p2",
        giftEventId: "e1",
        planned: 30,
        spent: 25,
        dateMonth: null,
        dateDay: null,
        giftPerson: { id: "p2", name: "Dad" },
        giftEvent: {
          id: "e1",
          name: "Christmas",
          dateType: "shared",
          dateMonth: 12,
          dateDay: 25,
          isLocked: true,
        },
      },
      {
        giftPersonId: "p1",
        giftEventId: "e2",
        planned: 40,
        spent: null,
        dateMonth: 4,
        dateDay: 12,
        giftPerson: { id: "p1", name: "Mum" },
        giftEvent: {
          id: "e2",
          name: "Birthday",
          dateType: "personal",
          dateMonth: null,
          dateDay: null,
          isLocked: true,
        },
      },
      {
        giftPersonId: "p3",
        giftEventId: "e3",
        planned: 20,
        spent: null,
        dateMonth: null,
        dateDay: null,
        giftPerson: { id: "p3", name: "Friend" },
        giftEvent: {
          id: "e3",
          name: "Wedding",
          dateType: "personal",
          dateMonth: null,
          dateDay: null,
          isLocked: false,
        },
      },
    ] as any);

    const view = await giftsService.getUpcoming("hh-1", year);

    const december = view.groups.find((g) => g.month === 12);
    expect(december).toBeDefined();
    const xmas = december!.rows.find((r) => r.eventId === "e1")!;
    expect(xmas.recipients).toHaveLength(2);
    expect(xmas.plannedTotal).toBe(80);

    const april = view.groups.find((g) => g.month === 4);
    const birthday = april!.rows.find((r) => r.eventId === "e2")!;
    expect(birthday.recipients).toHaveLength(1);

    const dateless = view.groups.find((g) => g.month === 0);
    expect(dateless).toBeDefined();
    expect(dateless!.rows[0].eventId).toBe("e3");
  });

  it("computes the four callout totals", async () => {
    const year = new Date().getFullYear();
    const thisMonth = new Date().getMonth() + 1;
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      {
        giftPersonId: "p1",
        giftEventId: "e1",
        planned: 100,
        spent: null,
        dateMonth: null,
        dateDay: null,
        giftPerson: { id: "p1", name: "Mum" },
        giftEvent: {
          id: "e1",
          name: "X",
          dateType: "shared",
          dateMonth: thisMonth,
          dateDay: 15,
          isLocked: false,
        },
      },
      {
        giftPersonId: "p1",
        giftEventId: "e2",
        planned: 50,
        spent: null,
        dateMonth: null,
        dateDay: null,
        giftPerson: { id: "p1", name: "Mum" },
        giftEvent: {
          id: "e2",
          name: "Y",
          dateType: "personal",
          dateMonth: null,
          dateDay: null,
          isLocked: false,
        },
      },
    ] as any);

    const view = await giftsService.getUpcoming("hh-1", year);
    expect(view.callouts.thisMonth.total).toBe(100);
    expect(view.callouts.dateless.total).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `getUpcoming is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  async getUpcoming(householdId: string, year: number) {
    const allocations = await prisma.giftAllocation.findMany({
      where: { householdId, year, status: { not: "skipped" } },
      include: { giftPerson: true, giftEvent: true },
    });

    type Row = {
      eventId: string;
      eventName: string;
      eventDateType: "shared" | "personal";
      day: number | null;
      month: number;
      recipients: Array<{ personId: string; personName: string; planned: number; spent: number | null }>;
      plannedTotal: number;
      spentTotal: number | null;
    };
    const groups = new Map<number, Map<string, Row>>();
    const datelessRows: Row[] = [];
    const callouts = {
      thisMonth: { count: 0, total: 0 },
      nextThreeMonths: { count: 0, total: 0 },
      restOfYear: { count: 0, total: 0 },
      dateless: { count: 0, total: 0 },
    };
    const currentMonth = new Date().getMonth() + 1;

    for (const a of allocations) {
      const event = (a as any).giftEvent;
      const person = (a as any).giftPerson;
      const month =
        event.dateType === "shared"
          ? (a.dateMonth ?? event.dateMonth ?? null)
          : (a.dateMonth ?? null);
      const day =
        event.dateType === "shared"
          ? (a.dateDay ?? event.dateDay ?? null)
          : (a.dateDay ?? null);

      if (month === null) {
        callouts.dateless.count += 1;
        callouts.dateless.total += a.planned ?? 0;
        datelessRows.push({
          eventId: event.id,
          eventName: event.name,
          eventDateType: event.dateType,
          day: null,
          month: 0,
          recipients: [
            { personId: person.id, personName: person.name, planned: a.planned, spent: a.spent },
          ],
          plannedTotal: a.planned,
          spentTotal: a.spent,
        });
        continue;
      }

      if (month === currentMonth) {
        callouts.thisMonth.count += 1;
        callouts.thisMonth.total += a.planned ?? 0;
      } else if (month > currentMonth && month <= currentMonth + 3) {
        callouts.nextThreeMonths.count += 1;
        callouts.nextThreeMonths.total += a.planned ?? 0;
      } else if (month > currentMonth + 3) {
        callouts.restOfYear.count += 1;
        callouts.restOfYear.total += a.planned ?? 0;
      }

      const monthMap = groups.get(month) ?? new Map<string, Row>();
      const key =
        event.dateType === "shared" ? `${event.id}-${month}-${day ?? "x"}` : `${event.id}-${person.id}-${day ?? "x"}`;
      const existing = monthMap.get(key);
      if (existing) {
        existing.recipients.push({ personId: person.id, personName: person.name, planned: a.planned, spent: a.spent });
        existing.plannedTotal += a.planned ?? 0;
        existing.spentTotal = (existing.spentTotal ?? 0) + (a.spent ?? 0);
      } else {
        monthMap.set(key, {
          eventId: event.id,
          eventName: event.name,
          eventDateType: event.dateType,
          day,
          month,
          recipients: [
            { personId: person.id, personName: person.name, planned: a.planned, spent: a.spent },
          ],
          plannedTotal: a.planned,
          spentTotal: a.spent,
        });
      }
      groups.set(month, monthMap);
    }

    const groupedArr = Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([month, rowMap]) => ({
        month,
        rows: Array.from(rowMap.values()).sort((a, b) => (a.day ?? 99) - (b.day ?? 99)),
      }));

    if (datelessRows.length > 0) {
      groupedArr.push({ month: 0, rows: datelessRows });
    }

    return { callouts, groups: groupedArr };
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): upcoming view aggregator with shared-event collapse"
```

---

### Task 15: Lazy year rollover + dismissal

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("giftsService.runRolloverIfNeeded", () => {
  it("creates current-year budget by copying prior year and duplicating allocations", async () => {
    const year = new Date().getFullYear();
    prismaMock.plannerYearBudget.findUnique
      .mockResolvedValueOnce(null) // current year missing
      .mockResolvedValueOnce({ giftBudget: 700 } as any); // prior year exists
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      {
        giftPersonId: "p1",
        giftEventId: "e1",
        planned: 25,
        notes: "books",
        dateMonth: 4,
        dateDay: 12,
      },
      {
        giftPersonId: "p1",
        giftEventId: "e2",
        planned: 50,
        notes: null,
        dateMonth: null,
        dateDay: null,
      },
    ] as any);
    prismaMock.plannerYearBudget.create.mockResolvedValue({} as any);
    prismaMock.giftAllocation.createMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      mode: "independent",
      syncedDiscretionaryItemId: null,
    } as any);

    const created = await giftsService.runRolloverIfNeeded("hh-1", year);
    expect(created).toBe(true);
    expect(prismaMock.plannerYearBudget.create).toHaveBeenCalledWith({
      data: { householdId: "hh-1", year, giftBudget: 700 },
    });
    const cmCall = (prismaMock.giftAllocation.createMany.mock.calls[0] as any)[0];
    expect(cmCall.data).toHaveLength(2);
    expect(cmCall.data[0]).toMatchObject({
      giftPersonId: "p1",
      giftEventId: "e1",
      year,
      planned: 25,
      spent: null,
      status: "planned",
      notes: "books",
      dateMonth: 4,
      dateDay: 12,
    });
  });

  it("does nothing if current-year budget already exists", async () => {
    const year = new Date().getFullYear();
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({ giftBudget: 0 } as any);
    const created = await giftsService.runRolloverIfNeeded("hh-1", year);
    expect(created).toBe(false);
    expect(prismaMock.plannerYearBudget.create).not.toHaveBeenCalled();
  });

  it("dismissRolloverNotification persists per-user record", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftRolloverDismissal.upsert.mockResolvedValue({} as any);
    await giftsService.dismissRolloverNotification("hh-1", "user-1", year);
    expect(prismaMock.giftRolloverDismissal.upsert).toHaveBeenCalledWith({
      where: { householdId_userId_year: { householdId: "hh-1", userId: "user-1", year } },
      create: { householdId: "hh-1", userId: "user-1", year },
      update: {},
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `runRolloverIfNeeded is not a function`

- [ ] **Step 3: Append to `gifts.service.ts`**

```typescript
  // ─── Year rollover (lazy) ───────────────────────────────────────────────────
  async runRolloverIfNeeded(householdId: string, year: number): Promise<boolean> {
    if (year !== new Date().getFullYear()) return false;
    const current = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year } },
    });
    if (current) return false;
    const prior = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year: year - 1 } },
    });
    if (!prior) return false;

    const priorAllocations = await prisma.giftAllocation.findMany({
      where: { householdId, year: year - 1 },
    });

    await prisma.plannerYearBudget.create({
      data: { householdId, year, giftBudget: prior.giftBudget },
    });

    if (priorAllocations.length > 0) {
      await prisma.giftAllocation.createMany({
        data: priorAllocations.map((a) => ({
          householdId,
          giftPersonId: a.giftPersonId,
          giftEventId: a.giftEventId,
          year,
          planned: a.planned,
          spent: null,
          status: "planned" as const,
          notes: a.notes,
          dateMonth: a.dateMonth,
          dateDay: a.dateDay,
        })),
      });
    }

    const settings = await this.getOrCreateSettings(householdId);
    if (settings.mode === "synced" && settings.syncedDiscretionaryItemId) {
      await prisma.itemAmountPeriod.upsert({
        where: {
          itemType_itemId_startDate: {
            itemType: "discretionary_item",
            itemId: settings.syncedDiscretionaryItemId,
            startDate: new Date(Date.UTC(year, 0, 1)),
          },
        },
        create: {
          itemType: "discretionary_item",
          itemId: settings.syncedDiscretionaryItemId,
          startDate: new Date(Date.UTC(year, 0, 1)),
          endDate: null,
          amount: prior.giftBudget,
        },
        update: { amount: prior.giftBudget },
      });
    }

    return true;
  },

  async dismissRolloverNotification(householdId: string, userId: string, year: number) {
    await prisma.giftRolloverDismissal.upsert({
      where: { householdId_userId_year: { householdId, userId, year } },
      create: { householdId, userId, year },
      update: {},
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): lazy year rollover with dismissal"
```

---

## Phase C — Cross-tier guards & member hooks

### Task 16: Block manual mutation of planner-locked Gifts subcategory

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts`
- Modify: `apps/backend/src/services/waterfall.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `waterfall.service.test.ts`:

```typescript
describe("waterfallService discretionary guards (planner-owned)", () => {
  it("createDiscretionary rejects items in a planner-locked subcategory", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({
      id: "sub-gifts",
      householdId: "hh-1",
      tier: "discretionary",
      name: "Gifts",
      lockedByPlanner: true,
    } as any);
    await expect(
      waterfallService.createDiscretionary("hh-1", { subcategoryId: "sub-gifts", name: "X" } as any)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("updateDiscretionary rejects edits to planner-owned items", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "d1",
      householdId: "hh-1",
      isPlannerOwned: true,
    } as any);
    await expect(
      waterfallService.updateDiscretionary("hh-1", "d1", { name: "Renamed" } as any)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("deleteDiscretionary rejects planner-owned items", async () => {
    prismaMock.discretionaryItem.findUnique.mockResolvedValue({
      id: "d1",
      householdId: "hh-1",
      isPlannerOwned: true,
    } as any);
    await expect(waterfallService.deleteDiscretionary("hh-1", "d1")).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: FAIL — assertions throw `NotFoundError` or do not throw

- [ ] **Step 3: Edit `apps/backend/src/services/waterfall.service.ts`**

In `validateSubcategoryOwnership` (around line 32–41), change the function to also surface the `lockedByPlanner` flag, and add a new helper that asserts the subcategory is not locked. Also add a guard at the top of `createDiscretionary`, `updateDiscretionary`, and `deleteDiscretionary`:

```typescript
// near the existing helpers
async function validateSubcategoryNotPlannerLocked(householdId: string, subcategoryId: string) {
  const sub = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, householdId, tier: "discretionary" },
  });
  if (!sub) throw new NotFoundError("Subcategory not found");
  if ((sub as any).lockedByPlanner) {
    throw new ValidationError("This subcategory is managed by the Gifts planner");
  }
}

function assertNotPlannerOwned(item: { isPlannerOwned?: boolean } | null) {
  if (item && (item as any).isPlannerOwned) {
    throw new ValidationError("This item is managed by the Gifts planner");
  }
}
```

In `createDiscretionary`, after the existing `validateSubcategoryOwnership(...)` call, add:

```typescript
await validateSubcategoryNotPlannerLocked(householdId, data.subcategoryId);
```

In `updateDiscretionary`, after `assertOwned(existing, ...)`, add:

```typescript
assertNotPlannerOwned(existing as any);
```

In `deleteDiscretionary`, after `assertOwned(existing, ...)`, add:

```typescript
assertNotPlannerOwned(existing as any);
```

Add `ValidationError` to the existing `errors.js` import on line 2 of `waterfall.service.ts`. The current import is `import { NotFoundError } from "../utils/errors.js";` — change it to `import { NotFoundError, ValidationError } from "../utils/errors.js";`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/waterfall.service.ts apps/backend/src/services/waterfall.service.test.ts
git commit -m "feat(gifts): block manual mutation of planner-owned discretionary items"
```

---

### Task 17: Exclude planner-owned items from staleness

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts`
- Modify: `apps/backend/src/services/waterfall.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("waterfallService staleness exclusion", () => {
  it("getDiscretionaryItems excludes planner-owned items from staleness aggregation", async () => {
    // Concrete assertion target depends on existing helper. Use the staleness
    // computation entry-point: items returned in the summary should expose
    // lifecycleState 'planner_owned' (or be excluded entirely from a stale list).
    // Here we verify the findMany filter omits isPlannerOwned in the staleness
    // path by checking the where clause.
    prismaMock.discretionaryItem.findMany.mockResolvedValue([] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);
    await waterfallService.listDiscretionaryStale("hh-1");
    const call = (prismaMock.discretionaryItem.findMany.mock.calls[0] as any)[0];
    expect(call.where).toMatchObject({ householdId: "hh-1", isPlannerOwned: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: FAIL — `listDiscretionaryStale is not a function` (or where clause does not include `isPlannerOwned`)

- [ ] **Step 3: Edit `apps/backend/src/services/waterfall.service.ts`**

If a dedicated stale lister exists, add `isPlannerOwned: false` to its `where` clause. Otherwise add a small new helper used by the staleness path:

```typescript
async listDiscretionaryStale(householdId: string) {
  const items = await prisma.discretionaryItem.findMany({
    where: { householdId, isPlannerOwned: false },
    orderBy: { sortOrder: "asc" },
  });
  return enrichItemsWithPeriods(items, "discretionary_item");
},
```

Then update the existing `getWaterfallSummary` (or wherever staleness aggregates are computed) to filter `discretionaryItems.filter((i) => !(i as any).isPlannerOwned)` before passing into `buildSubcategoryTotals` for staleness — but still include them in the financial totals (the planner-owned item counts toward the Gifts subcategory amount; it just doesn't contribute to staleness).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/waterfall.service.ts apps/backend/src/services/waterfall.service.test.ts
git commit -m "feat(gifts): exclude planner-owned items from staleness signals"
```

---

### Task 18: Member hooks — auto-create GiftPerson on member create

**Files:**

- Modify: `apps/backend/src/services/member.service.ts`
- Modify: `apps/backend/src/services/member.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("memberService.createMember gifts integration", () => {
  it("creates a matching GiftPerson row with memberId link", async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: "owner",
      role: "owner",
      householdId: "hh-1",
    } as any);
    prismaMock.member.create.mockResolvedValue({
      id: "m-new",
      householdId: "hh-1",
      name: "Sis",
    } as any);
    prismaMock.giftPerson.create.mockResolvedValue({} as any);

    await memberService.createMember("hh-1", "owner-user", { name: "Sis" } as any);

    expect(prismaMock.giftPerson.create).toHaveBeenCalledWith({
      data: {
        householdId: "hh-1",
        name: "Sis",
        memberId: "m-new",
      },
    });
  });

  it("does not throw if a GiftPerson with that name already exists (P2002)", async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: "owner",
      role: "owner",
      householdId: "hh-1",
    } as any);
    prismaMock.member.create.mockResolvedValue({
      id: "m-new",
      householdId: "hh-1",
      name: "Sis",
    } as any);
    prismaMock.giftPerson.create.mockRejectedValue({ code: "P2002" });

    await expect(
      memberService.createMember("hh-1", "owner-user", { name: "Sis" } as any)
    ).resolves.toBeDefined();
  });
});

describe("memberService.deleteMember gifts integration", () => {
  it("nullifies GiftPerson.memberId before deleting the member", async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: "owner",
      role: "owner",
      householdId: "hh-1",
    } as any);
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m-1",
      householdId: "hh-1",
      userId: null,
    } as any);
    prismaMock.incomeSource.count.mockResolvedValue(0);
    prismaMock.committedItem.count.mockResolvedValue(0);
    prismaMock.asset.count.mockResolvedValue(0);
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.giftPerson.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.member.delete.mockResolvedValue({} as any);

    await memberService.deleteMember("hh-1", "owner-user", "m-1");

    expect(prismaMock.giftPerson.updateMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", memberId: "m-1" },
      data: { memberId: null },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts member.service`
Expected: FAIL — `prismaMock.giftPerson.create` not called

- [ ] **Step 3: Edit `apps/backend/src/services/member.service.ts`**

In `createMember`, **preserve the existing try/catch that converts P2002 to `ConflictError` for duplicate member names**. Inside that outer try, change the existing `return await prisma.member.create({ ... })` to capture the result first, attach the gift-person hook in a nested try/catch, then return. The full updated function is:

```typescript
async createMember(householdId: string, callerUserId: string, data: CreateMemberInput) {
  await assertCallerIsOwner(householdId, callerUserId);

  try {
    const created = await prisma.member.create({
      data: {
        householdId,
        userId: null,
        name: data.name,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        retirementYear: data.retirementYear ?? null,
        role: "member",
      },
    });

    // Auto-surface as a GiftPerson row (best-effort; swallow duplicate-name only).
    try {
      await prisma.giftPerson.create({
        data: { householdId, name: created.name, memberId: created.id },
      });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }

    return created;
  } catch (err: any) {
    if (err?.code === "P2002") {
      throw new ConflictError("A member with that name already exists in this household");
    }
    throw err;
  }
},
```

This preserves the outer P2002→`ConflictError` translation for duplicate member names. The nested catch only swallows P2002 from the gift-person create — any other error from that hook propagates and is re-raised by the outer catch.

In `deleteMember`, inside the existing `prisma.$transaction(async (tx) => { ... })`, before `await tx.member.delete(...)`, add:

```typescript
await tx.giftPerson.updateMany({
  where: { householdId, memberId: memberId },
  data: { memberId: null },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts member.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/member.service.ts apps/backend/src/services/member.service.test.ts
git commit -m "feat(gifts): auto-link GiftPerson to household member on create/delete"
```

---

## Phase D — Routes & wiring

### Task 19: Create `gifts.routes.ts` and register in server

**Files:**

- Create: `apps/backend/src/routes/gifts.routes.ts`
- Create: `apps/backend/src/routes/gifts.routes.test.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/gifts.routes.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import Fastify from "fastify";

const giftsServiceMock = {
  getPlannerState: mock(() =>
    Promise.resolve({
      mode: "synced",
      year: 2026,
      isReadOnly: false,
      budget: {
        annualBudget: 0,
        planned: 0,
        spent: 0,
        plannedOverBudgetBy: 0,
        spentOverBudgetBy: 0,
      },
      people: [],
      rolloverPending: false,
    })
  ),
  getPersonDetail: mock(() => Promise.resolve({ person: {} as any, allocations: [] })),
  getUpcoming: mock(() =>
    Promise.resolve({
      callouts: {
        thisMonth: { count: 0, total: 0 },
        nextThreeMonths: { count: 0, total: 0 },
        restOfYear: { count: 0, total: 0 },
        dateless: { count: 0, total: 0 },
      },
      groups: [],
    })
  ),
  listPeopleForConfig: mock(() => Promise.resolve([])),
  listEventsForConfig: mock(() => Promise.resolve([])),
  listYearsWithData: mock(() => Promise.resolve([2026])),
  createPerson: mock(() => Promise.resolve({ id: "p1" })),
  updatePerson: mock(() => Promise.resolve({ id: "p1" })),
  deletePerson: mock(() => Promise.resolve()),
  createEvent: mock(() => Promise.resolve({ id: "e1" })),
  updateEvent: mock(() => Promise.resolve({ id: "e1" })),
  deleteEvent: mock(() => Promise.resolve()),
  upsertAllocation: mock(() => Promise.resolve({ id: "a1" })),
  bulkUpsertAllocations: mock(() => Promise.resolve({ count: 0 })),
  setAnnualBudget: mock(() => Promise.resolve({ annualBudget: 1000 })),
  setMode: mock(() => Promise.resolve({ mode: "synced" })),
  dismissRolloverNotification: mock(() => Promise.resolve()),
  runRolloverIfNeeded: mock(() => Promise.resolve(false)),
  seedLockedEventsIfMissing: mock(() => Promise.resolve()),
};

mock.module("../services/gifts.service.js", () => ({ giftsService: giftsServiceMock }));
mock.module("../middleware/auth.middleware.js", () => ({
  authMiddleware: async (req: any) => {
    req.householdId = "hh-1";
    req.userId = "user-1";
  },
}));
mock.module("../lib/actor-ctx.js", () => ({
  actorCtx: () => ({ householdId: "hh-1", actorId: "user-1", actorName: "User" }),
}));

const { giftsRoutes } = await import("./gifts.routes.js");

async function buildApp() {
  const app = Fastify();
  await app.register(giftsRoutes, { prefix: "/api/gifts" });
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(giftsServiceMock)) (fn as any).mockClear?.();
});

describe("gifts.routes", () => {
  it("GET /state delegates to getPlannerState with current year by default", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/gifts/state" });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.getPlannerState).toHaveBeenCalledWith(
      "hh-1",
      new Date().getFullYear(),
      "user-1"
    );
  });

  it("PUT /budget/:year forwards body", async () => {
    const app = await buildApp();
    const year = new Date().getFullYear();
    const res = await app.inject({
      method: "PUT",
      url: `/api/gifts/budget/${year}`,
      payload: { annualBudget: 1500 },
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.setAnnualBudget).toHaveBeenCalledWith("hh-1", year, {
      annualBudget: 1500,
    });
  });

  it("PUT /allocations/:personId/:eventId/:year upserts allocation", async () => {
    const app = await buildApp();
    const year = new Date().getFullYear();
    const res = await app.inject({
      method: "PUT",
      url: `/api/gifts/allocations/p1/e1/${year}`,
      payload: { planned: 50 },
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.upsertAllocation).toHaveBeenCalledWith("hh-1", "p1", "e1", year, {
      planned: 50,
    });
  });

  it("POST /allocations/bulk forwards cells", async () => {
    const app = await buildApp();
    const year = new Date().getFullYear();
    const res = await app.inject({
      method: "POST",
      url: "/api/gifts/allocations/bulk",
      payload: { cells: [{ personId: "p1", eventId: "e1", year, planned: 10 }] },
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.bulkUpsertAllocations).toHaveBeenCalled();
  });

  it("PUT /mode forwards mode", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/gifts/mode",
      payload: { mode: "independent" },
    });
    expect(res.statusCode).toBe(200);
    expect(giftsServiceMock.setMode).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.routes`
Expected: FAIL — `Cannot find module './gifts.routes.js'`

- [ ] **Step 3: Create `apps/backend/src/routes/gifts.routes.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { giftsService } from "../services/gifts.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import {
  createGiftPersonSchema,
  updateGiftPersonSchema,
  createGiftEventSchema,
  updateGiftEventSchema,
  upsertGiftAllocationSchema,
  bulkUpsertAllocationsSchema,
  setGiftBudgetSchema,
  setGiftPlannerModeSchema,
} from "@finplan/shared";

export async function giftsRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  // ─── Reads ────────────────────────────────────────────────────────────────
  fastify.get("/state", pre, async (req, reply) => {
    const { year } = req.query as { year?: string };
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    await giftsService.seedLockedEventsIfMissing(req.householdId!);
    await giftsService.runRolloverIfNeeded(req.householdId!, y);
    const state = await giftsService.getPlannerState(req.householdId!, y, (req as any).userId);
    return reply.send(state);
  });

  fastify.get("/people/:id", pre, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { year } = req.query as { year?: string };
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    const detail = await giftsService.getPersonDetail(req.householdId!, id, y);
    return reply.send(detail);
  });

  fastify.get("/upcoming", pre, async (req, reply) => {
    const { year } = req.query as { year?: string };
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    const view = await giftsService.getUpcoming(req.householdId!, y);
    return reply.send(view);
  });

  fastify.get("/years", pre, async (req, reply) => {
    const years = await giftsService.listYearsWithData(req.householdId!);
    return reply.send(years);
  });

  fastify.get("/config/people", pre, async (req, reply) => {
    const { filter } = req.query as { filter?: "all" | "household" | "non-household" };
    const list = await giftsService.listPeopleForConfig(req.householdId!, filter ?? "all");
    return reply.send(list);
  });

  fastify.get("/config/events", pre, async (req, reply) => {
    const list = await giftsService.listEventsForConfig(req.householdId!);
    return reply.send(list);
  });

  // ─── People mutations ─────────────────────────────────────────────────────
  fastify.post("/people", pre, async (req, reply) => {
    const data = createGiftPersonSchema.parse(req.body);
    const person = await giftsService.createPerson(req.householdId!, data);
    return reply.status(201).send(person);
  });

  fastify.patch("/people/:id", pre, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updateGiftPersonSchema.parse(req.body);
    const person = await giftsService.updatePerson(req.householdId!, id, data);
    return reply.send(person);
  });

  fastify.delete("/people/:id", pre, async (req, reply) => {
    const { id } = req.params as { id: string };
    await giftsService.deletePerson(req.householdId!, id);
    return reply.status(204).send();
  });

  // ─── Event mutations ──────────────────────────────────────────────────────
  fastify.post("/events", pre, async (req, reply) => {
    const data = createGiftEventSchema.parse(req.body);
    const event = await giftsService.createEvent(req.householdId!, data);
    return reply.status(201).send(event);
  });

  fastify.patch("/events/:id", pre, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updateGiftEventSchema.parse(req.body);
    const event = await giftsService.updateEvent(req.householdId!, id, data);
    return reply.send(event);
  });

  fastify.delete("/events/:id", pre, async (req, reply) => {
    const { id } = req.params as { id: string };
    await giftsService.deleteEvent(req.householdId!, id);
    return reply.status(204).send();
  });

  // ─── Allocation mutations ─────────────────────────────────────────────────
  fastify.put("/allocations/:personId/:eventId/:year", pre, async (req, reply) => {
    const { personId, eventId, year } = req.params as {
      personId: string;
      eventId: string;
      year: string;
    };
    const data = upsertGiftAllocationSchema.parse(req.body);
    const result = await giftsService.upsertAllocation(
      req.householdId!,
      personId,
      eventId,
      parseInt(year, 10),
      data
    );
    return reply.send(result);
  });

  fastify.post("/allocations/bulk", pre, async (req, reply) => {
    const data = bulkUpsertAllocationsSchema.parse(req.body);
    const result = await giftsService.bulkUpsertAllocations(req.householdId!, data);
    return reply.send(result);
  });

  // ─── Budget + mode ────────────────────────────────────────────────────────
  fastify.put("/budget/:year", pre, async (req, reply) => {
    const { year } = req.params as { year: string };
    const data = setGiftBudgetSchema.parse(req.body);
    const result = await giftsService.setAnnualBudget(req.householdId!, parseInt(year, 10), data);
    return reply.send(result);
  });

  fastify.put("/mode", pre, async (req, reply) => {
    const data = setGiftPlannerModeSchema.parse(req.body);
    const result = await giftsService.setMode(req.householdId!, data, actorCtx(req));
    return reply.send(result);
  });

  // ─── Rollover banner ──────────────────────────────────────────────────────
  fastify.delete("/rollover-banner/:year", pre, async (req, reply) => {
    const { year } = req.params as { year: string };
    await giftsService.dismissRolloverNotification(
      req.householdId!,
      (req as any).userId,
      parseInt(year, 10)
    );
    return reply.status(204).send();
  });
}
```

- [ ] **Step 4: Register in `apps/backend/src/server.ts`**

Add the import alongside the others:

```typescript
import { giftsRoutes } from "./routes/gifts.routes";
```

And register after the existing planner registration:

```typescript
server.register(giftsRoutes, { prefix: "/api/gifts" });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.routes`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/gifts.routes.ts apps/backend/src/routes/gifts.routes.test.ts apps/backend/src/server.ts
git commit -m "feat(gifts): wire gifts routes under /api/gifts"
```

---

## Phase E — Export/Import sync

### Task 20: Bump export schema and update gift export/import shape

**Files:**

- Modify: `packages/shared/src/schemas/export-import.schemas.ts`
- Modify: `packages/shared/src/schemas/export-import.schemas.test.ts`
- Modify: `apps/backend/src/services/export.service.ts`
- Modify: `apps/backend/src/services/export.service.test.ts`
- Modify: `apps/backend/src/services/import.service.ts`
- Modify: `apps/backend/src/services/import.service.test.ts`
- Modify: `apps/backend/src/services/export-import.roundtrip.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas/export-import.schemas.test.ts`:

```typescript
describe("householdExportSchema gifts v2", () => {
  it("rejects the legacy gift shape", () => {
    expect(() =>
      householdExportSchema.parse({
        // ... a previously valid envelope with old `giftPersons[].events[].eventType`
        // (omitted for brevity in test runner; pull from existing fixture and mutate)
      } as any)
    ).toThrow();
  });

  it("accepts the new matrix shape: people, events, allocations, settings", () => {
    const sample = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      household: { name: "Test" },
      settings: {},
      members: [],
      subcategories: [],
      incomeSources: [],
      committedItems: [],
      discretionaryItems: [],
      itemAmountPeriods: [],
      waterfallHistory: [],
      assets: [],
      accounts: [],
      purchaseItems: [],
      plannerYearBudgets: [],
      gifts: {
        settings: { mode: "synced" as const, syncedDiscretionaryItemId: null },
        people: [{ name: "Mum", notes: null, sortOrder: 0, isHouseholdMember: false }],
        events: [
          {
            name: "Christmas",
            dateType: "shared" as const,
            dateMonth: 12,
            dateDay: 25,
            isLocked: true,
            sortOrder: 0,
          },
        ],
        allocations: [
          {
            personName: "Mum",
            eventName: "Christmas",
            year: 2026,
            planned: 50,
            spent: null,
            status: "planned" as const,
            notes: null,
            dateMonth: null,
            dateDay: null,
          },
        ],
      },
    };
    expect(() => householdExportSchema.parse(sample)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test export-import.schemas`
Expected: FAIL — `gifts` property missing on schema or rejects new shape

- [ ] **Step 3: Update `packages/shared/src/schemas/export-import.schemas.ts`**

Bump `CURRENT_SCHEMA_VERSION` from `1` to `2` (or whatever the current value is — increment by 1).

Replace `exportGiftEventSchema`, `exportGiftPersonSchema`, and the `giftPersons` field on `householdExportSchema` with:

```typescript
const exportGiftPersonSchemaV2 = z.object({
  name: z.string(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  isHouseholdMember: z.boolean(),
});

const exportGiftEventSchemaV2 = z.object({
  name: z.string(),
  dateType: z.enum(["shared", "personal"]),
  dateMonth: z.number().int().nullable().optional(),
  dateDay: z.number().int().nullable().optional(),
  isLocked: z.boolean(),
  sortOrder: z.number().int(),
});

const exportGiftAllocationSchemaV2 = z.object({
  personName: z.string(),
  eventName: z.string(),
  year: z.number().int(),
  planned: z.number(),
  spent: z.number().nullable().optional(),
  status: z.enum(["planned", "bought", "skipped"]),
  notes: z.string().nullable().optional(),
  dateMonth: z.number().int().nullable().optional(),
  dateDay: z.number().int().nullable().optional(),
});

const exportGiftPlannerSettingsSchemaV2 = z.object({
  mode: z.enum(["synced", "independent"]),
  syncedDiscretionaryItemId: z.string().nullable(),
});

const exportGiftsSectionSchema = z.object({
  settings: exportGiftPlannerSettingsSchemaV2,
  people: z.array(exportGiftPersonSchemaV2),
  events: z.array(exportGiftEventSchemaV2),
  allocations: z.array(exportGiftAllocationSchemaV2),
});
```

In the `householdExportSchema`, remove the `giftPersons` field and add `gifts: exportGiftsSectionSchema`.

- [ ] **Step 4: Update `apps/backend/src/services/export.service.ts`**

In the existing `Promise.all` block, replace the legacy `tx.giftPerson.findMany({ ... include: { events: { include: { yearRecords: true } } } })` with:

```typescript
          tx.giftPlannerSettings.findUnique({ where: { householdId } }),
          tx.giftPerson.findMany({ where: { householdId } }),
          tx.giftEvent.findMany({ where: { householdId } }),
          tx.giftAllocation.findMany({ where: { householdId } }),
```

(replace the old single query and update the destructuring to `[..., giftSettings, giftPersons, giftEvents, giftAllocations]`)

Replace the `giftPersons: ...` mapping in the envelope with:

```typescript
          gifts: {
            settings: {
              mode: (giftSettings?.mode ?? "synced") as "synced" | "independent",
              syncedDiscretionaryItemId: giftSettings?.syncedDiscretionaryItemId ?? null,
            },
            people: giftPersons.map((p) => ({
              name: p.name,
              notes: p.notes,
              sortOrder: p.sortOrder,
              isHouseholdMember: p.memberId !== null,
            })),
            events: giftEvents.map((e) => ({
              name: e.name,
              dateType: e.dateType as "shared" | "personal",
              dateMonth: e.dateMonth,
              dateDay: e.dateDay,
              isLocked: e.isLocked,
              sortOrder: e.sortOrder,
            })),
            allocations: giftAllocations.map((a) => {
              const person = giftPersons.find((p) => p.id === a.giftPersonId)!;
              const event = giftEvents.find((e) => e.id === a.giftEventId)!;
              return {
                personName: person.name,
                eventName: event.name,
                year: a.year,
                planned: a.planned,
                spent: a.spent,
                status: a.status as "planned" | "bought" | "skipped",
                notes: a.notes,
                dateMonth: a.dateMonth,
                dateDay: a.dateDay,
              };
            }),
          },
```

- [ ] **Step 5: Update `apps/backend/src/services/import.service.ts`**

Find the existing `giftPersons` import block. Replace with:

```typescript
// Gifts (v2 matrix)
if (data.gifts) {
  await tx.giftPlannerSettings.upsert({
    where: { householdId: targetHouseholdId },
    create: {
      householdId: targetHouseholdId,
      mode: data.gifts.settings.mode,
      syncedDiscretionaryItemId: data.gifts.settings.syncedDiscretionaryItemId,
    },
    update: {
      mode: data.gifts.settings.mode,
      syncedDiscretionaryItemId: data.gifts.settings.syncedDiscretionaryItemId,
    },
  });
  const personMap = new Map<string, string>();
  for (const p of data.gifts.people) {
    const created = await tx.giftPerson.create({
      data: {
        householdId: targetHouseholdId,
        name: p.name,
        notes: p.notes ?? null,
        sortOrder: p.sortOrder,
      },
    });
    personMap.set(p.name, created.id);
  }
  const eventMap = new Map<string, string>();
  for (const e of data.gifts.events) {
    const created = await tx.giftEvent.create({
      data: {
        householdId: targetHouseholdId,
        name: e.name,
        dateType: e.dateType,
        dateMonth: e.dateMonth ?? null,
        dateDay: e.dateDay ?? null,
        isLocked: e.isLocked,
        sortOrder: e.sortOrder,
      },
    });
    eventMap.set(e.name, created.id);
  }
  for (const a of data.gifts.allocations) {
    const personId = personMap.get(a.personName);
    const eventId = eventMap.get(a.eventName);
    if (!personId || !eventId) continue;
    await tx.giftAllocation.create({
      data: {
        householdId: targetHouseholdId,
        giftPersonId: personId,
        giftEventId: eventId,
        year: a.year,
        planned: a.planned,
        spent: a.spent ?? null,
        status: a.status,
        notes: a.notes ?? null,
        dateMonth: a.dateMonth ?? null,
        dateDay: a.dateDay ?? null,
      },
    });
  }
}
```

Remove the old `giftPersons` block (the one referencing `eventType`, `customName`, `recurrence`, `yearRecords`).

Update each existing test file to use the new shape; mocks should call the new `giftAllocation`, `giftPlannerSettings` mocks rather than `giftYearRecord`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/shared && bun test export-import.schemas`
Run: `cd apps/backend && bun scripts/run-tests.ts export`
Run: `cd apps/backend && bun scripts/run-tests.ts import`
Run: `cd apps/backend && bun scripts/run-tests.ts roundtrip`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/export-import.schemas.ts packages/shared/src/schemas/export-import.schemas.test.ts apps/backend/src/services/export.service.ts apps/backend/src/services/export.service.test.ts apps/backend/src/services/import.service.ts apps/backend/src/services/import.service.test.ts apps/backend/src/services/export-import.roundtrip.test.ts
git commit -m "feat(gifts): bump export schema to v2 with matrix gift section"
```

---

## Phase F — Frontend service & hooks

### Task 21: Frontend `gifts.service` API client

**Files:**

- Create: `apps/frontend/src/services/gifts.service.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/services/gifts.service.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";

const apiClientMock = {
  get: mock(() => Promise.resolve({} as any)),
  post: mock(() => Promise.resolve({} as any)),
  put: mock(() => Promise.resolve({} as any)),
  patch: mock(() => Promise.resolve({} as any)),
  delete: mock(() => Promise.resolve({} as any)),
};
mock.module("@/lib/api", () => ({ apiClient: apiClientMock }));

const { giftsApi } = await import("./gifts.service");

beforeEach(() => {
  for (const fn of Object.values(apiClientMock)) (fn as any).mockClear?.();
});

describe("giftsApi", () => {
  it("getState passes year query", () => {
    giftsApi.getState(2026);
    expect(apiClientMock.get).toHaveBeenCalledWith("/api/gifts/state?year=2026");
  });

  it("upsertAllocation hits the right URL", () => {
    giftsApi.upsertAllocation("p1", "e1", 2026, { planned: 50 });
    expect(apiClientMock.put).toHaveBeenCalledWith("/api/gifts/allocations/p1/e1/2026", {
      planned: 50,
    });
  });

  it("setMode posts to /mode", () => {
    giftsApi.setMode({ mode: "independent" });
    expect(apiClientMock.put).toHaveBeenCalledWith("/api/gifts/mode", { mode: "independent" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test gifts.service`
Expected: FAIL — `Cannot find module ./gifts.service`

- [ ] **Step 3: Create `apps/frontend/src/services/gifts.service.ts`**

```typescript
import { apiClient } from "@/lib/api";
import type {
  CreateGiftPersonInput,
  UpdateGiftPersonInput,
  CreateGiftEventInput,
  UpdateGiftEventInput,
  UpsertGiftAllocationInput,
  BulkUpsertAllocationsInput,
  SetGiftBudgetInput,
  SetGiftPlannerModeInput,
  GiftPlannerStateResponse,
  GiftPersonDetailResponse,
  GiftUpcomingResponse,
} from "@finplan/shared";

export const giftsApi = {
  getState: (year: number) =>
    apiClient.get<GiftPlannerStateResponse>(`/api/gifts/state?year=${year}`),
  getPerson: (id: string, year: number) =>
    apiClient.get<GiftPersonDetailResponse>(`/api/gifts/people/${id}?year=${year}`),
  getUpcoming: (year: number) =>
    apiClient.get<GiftUpcomingResponse>(`/api/gifts/upcoming?year=${year}`),
  listYears: () => apiClient.get<number[]>(`/api/gifts/years`),
  listConfigPeople: (filter: "all" | "household" | "non-household") =>
    apiClient.get<any[]>(`/api/gifts/config/people?filter=${filter}`),
  listConfigEvents: () => apiClient.get<any[]>(`/api/gifts/config/events`),

  createPerson: (data: CreateGiftPersonInput) => apiClient.post<any>(`/api/gifts/people`, data),
  updatePerson: (id: string, data: UpdateGiftPersonInput) =>
    apiClient.patch<any>(`/api/gifts/people/${id}`, data),
  deletePerson: (id: string) => apiClient.delete<void>(`/api/gifts/people/${id}`),

  createEvent: (data: CreateGiftEventInput) => apiClient.post<any>(`/api/gifts/events`, data),
  updateEvent: (id: string, data: UpdateGiftEventInput) =>
    apiClient.patch<any>(`/api/gifts/events/${id}`, data),
  deleteEvent: (id: string) => apiClient.delete<void>(`/api/gifts/events/${id}`),

  upsertAllocation: (
    personId: string,
    eventId: string,
    year: number,
    data: UpsertGiftAllocationInput
  ) => apiClient.put<any>(`/api/gifts/allocations/${personId}/${eventId}/${year}`, data),
  bulkUpsert: (data: BulkUpsertAllocationsInput) =>
    apiClient.post<{ count: number }>(`/api/gifts/allocations/bulk`, data),

  setBudget: (year: number, data: SetGiftBudgetInput) =>
    apiClient.put<any>(`/api/gifts/budget/${year}`, data),
  setMode: (data: SetGiftPlannerModeInput) => apiClient.put<any>(`/api/gifts/mode`, data),

  dismissRollover: (year: number) => apiClient.delete<void>(`/api/gifts/rollover-banner/${year}`),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/gifts.service.ts apps/frontend/src/services/gifts.service.test.ts
git commit -m "feat(gifts): frontend api client for gifts planner"
```

---

### Task 22: `useGifts` TanStack Query hooks

**Files:**

- Create: `apps/frontend/src/hooks/useGifts.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/hooks/useGifts.test.tsx
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const giftsApiMock = {
  getState: mock(() => Promise.resolve({ mode: "synced", year: 2026, people: [] } as any)),
  setBudget: mock(() => Promise.resolve({ annualBudget: 1000 })),
  upsertAllocation: mock(() => Promise.resolve({})),
};
mock.module("@/services/gifts.service", () => ({ giftsApi: giftsApiMock }));

const { useGiftsState, GIFTS_KEYS } = await import("./useGifts");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  for (const fn of Object.values(giftsApiMock)) (fn as any).mockClear?.();
});

describe("useGiftsState", () => {
  it("queries getState with the year", async () => {
    const { result } = renderHook(() => useGiftsState(2026), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(giftsApiMock.getState).toHaveBeenCalledWith(2026);
  });
});

describe("GIFTS_KEYS", () => {
  it("namespace is 'gifts'", () => {
    expect(GIFTS_KEYS.state(2026)[0]).toBe("gifts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useGifts`
Expected: FAIL — `Cannot find module ./useGifts`

- [ ] **Step 3: Create `apps/frontend/src/hooks/useGifts.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { giftsApi } from "@/services/gifts.service";
import type {
  UpsertGiftAllocationInput,
  BulkUpsertAllocationsInput,
  CreateGiftPersonInput,
  UpdateGiftPersonInput,
  CreateGiftEventInput,
  UpdateGiftEventInput,
  SetGiftBudgetInput,
  SetGiftPlannerModeInput,
} from "@finplan/shared";

export const GIFTS_KEYS = {
  state: (year: number) => ["gifts", "state", year] as const,
  person: (id: string, year: number) => ["gifts", "person", id, year] as const,
  upcoming: (year: number) => ["gifts", "upcoming", year] as const,
  years: () => ["gifts", "years"] as const,
  configPeople: (filter: string) => ["gifts", "config", "people", filter] as const,
  configEvents: () => ["gifts", "config", "events"] as const,
};

export function useGiftsState(year: number) {
  return useQuery({
    queryKey: GIFTS_KEYS.state(year),
    queryFn: () => giftsApi.getState(year),
  });
}

export function useGiftPerson(id: string | null, year: number) {
  return useQuery({
    queryKey: GIFTS_KEYS.person(id ?? "", year),
    queryFn: () => giftsApi.getPerson(id!, year),
    enabled: !!id,
  });
}

export function useGiftsUpcoming(year: number) {
  return useQuery({
    queryKey: GIFTS_KEYS.upcoming(year),
    queryFn: () => giftsApi.getUpcoming(year),
  });
}

export function useGiftsYears() {
  return useQuery({ queryKey: GIFTS_KEYS.years(), queryFn: () => giftsApi.listYears() });
}

export function useConfigPeople(filter: "all" | "household" | "non-household") {
  return useQuery({
    queryKey: GIFTS_KEYS.configPeople(filter),
    queryFn: () => giftsApi.listConfigPeople(filter),
  });
}

export function useConfigEvents() {
  return useQuery({
    queryKey: GIFTS_KEYS.configEvents(),
    queryFn: () => giftsApi.listConfigEvents(),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["gifts"] });
}

export function useCreateGiftPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGiftPersonInput) => giftsApi.createPerson(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateGiftPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGiftPersonInput }) =>
      giftsApi.updatePerson(id, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteGiftPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => giftsApi.deletePerson(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreateGiftEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGiftEventInput) => giftsApi.createEvent(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateGiftEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGiftEventInput }) =>
      giftsApi.updateEvent(id, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteGiftEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => giftsApi.deleteEvent(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpsertAllocation() {
  const qc = useQueryClient();
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
      data: UpsertGiftAllocationInput;
    }) => giftsApi.upsertAllocation(personId, eventId, year, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useBulkUpsertAllocations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUpsertAllocationsInput) => giftsApi.bulkUpsert(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetGiftBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, data }: { year: number; data: SetGiftBudgetInput }) =>
      giftsApi.setBudget(year, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetGiftMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SetGiftPlannerModeInput) => giftsApi.setMode(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDismissRollover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => giftsApi.dismissRollover(year),
    onSuccess: () => invalidateAll(qc),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useGifts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useGifts.ts apps/frontend/src/hooks/useGifts.test.tsx
git commit -m "feat(gifts): tanstack query hooks for gifts planner"
```

---

### Task 23: Remove legacy gift code from frontend `planner.service` and `usePlanner`

**Files:**

- Modify: `apps/frontend/src/services/planner.service.ts`
- Modify: `apps/frontend/src/hooks/usePlanner.ts`
- Modify: `apps/frontend/src/components/planner/PlannerLeftPanel.tsx`
- Delete: `apps/frontend/src/components/planner/GiftPersonDetailPanel.tsx`
- Delete: `apps/frontend/src/components/planner/GiftPersonDetailPanel.test.tsx`
- Delete: `apps/frontend/src/components/planner/GiftPersonListPanel.tsx`
- Delete: `apps/frontend/src/components/planner/GiftUpcomingPanel.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/services/planner.service.test.ts — append
describe("plannerService gift removal", () => {
  it("no longer exposes gift methods", async () => {
    const { plannerService } = await import("./planner.service");
    expect((plannerService as any).listGiftPersons).toBeUndefined();
    expect((plannerService as any).getUpcomingGifts).toBeUndefined();
    expect((plannerService as any).upsertGiftYearRecord).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test planner.service`
Expected: FAIL — `listGiftPersons` is defined

- [ ] **Step 3: Edit `apps/frontend/src/services/planner.service.ts`**

Delete every `// Gift persons`, `// Gift events`, `// Gift year records`, and `// Upcoming` block (and the corresponding method on the exported `plannerService` object). Keep only the purchase methods.

Edit `apps/frontend/src/hooks/usePlanner.ts`: delete `useGiftPersons`, `useGiftPerson`, `useUpcomingGifts`, `useCreateGiftPerson`, `useUpdateGiftPerson`, `useDeleteGiftPerson`, `useCreateGiftEvent`, `useUpdateGiftEvent`, `useDeleteGiftEvent`, `useUpsertGiftYearRecord`, and the `giftPersons`, `giftPerson`, `upcoming` keys from `PLANNER_KEYS`.

Delete the four legacy stub component files listed under **Files** above.

Edit `apps/frontend/src/components/planner/PlannerLeftPanel.tsx` — remove any GIFTS section or import of the deleted components. If the file becomes a Purchases-only panel, that's the desired end state.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test planner.service`
Expected: PASS. Also run `bun run build` from repo root to confirm no dangling imports.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/planner.service.ts apps/frontend/src/hooks/usePlanner.ts apps/frontend/src/components/planner/PlannerLeftPanel.tsx
git rm apps/frontend/src/components/planner/GiftPersonDetailPanel.tsx apps/frontend/src/components/planner/GiftPersonDetailPanel.test.tsx apps/frontend/src/components/planner/GiftPersonListPanel.tsx apps/frontend/src/components/planner/GiftUpcomingPanel.tsx
git commit -m "refactor(gifts): remove legacy gift code from frontend planner module"
```

---

## Phase G — Frontend page & components

> Each component task uses TDD: write a `*.test.tsx` that asserts the rendered DOM and key interactions, then implement the component.

### Task 24: `OverBudgetSignal` and `GiftsBudgetSummary`

**Files:**

- Create: `apps/frontend/src/components/gifts/OverBudgetSignal.tsx`
- Create: `apps/frontend/src/components/gifts/GiftsBudgetSummary.tsx`
- Create: `apps/frontend/src/components/gifts/GiftsBudgetSummary.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/gifts/GiftsBudgetSummary.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { GiftsBudgetSummary } from "./GiftsBudgetSummary";

describe("GiftsBudgetSummary", () => {
  it("renders annual budget, planned, spent figures", () => {
    render(
      <GiftsBudgetSummary
        budget={{
          annualBudget: 1000,
          planned: 750,
          spent: 200,
          plannedOverBudgetBy: 0,
          spentOverBudgetBy: 0,
        }}
        readOnly={false}
      />
    );
    expect(screen.getByTestId("gifts-budget-annual")).toHaveTextContent("£1,000");
    expect(screen.getByTestId("gifts-budget-planned")).toHaveTextContent("£750");
    expect(screen.getByTestId("gifts-budget-spent")).toHaveTextContent("£200");
  });

  it("shows planned-over-budget signal when over", () => {
    render(
      <GiftsBudgetSummary
        budget={{
          annualBudget: 1000,
          planned: 1200,
          spent: 0,
          plannedOverBudgetBy: 200,
          spentOverBudgetBy: 0,
        }}
        readOnly={false}
      />
    );
    expect(screen.getByText(/planned more than budget by £200/i)).toBeInTheDocument();
  });

  it("shows spent-over-budget signal when over", () => {
    render(
      <GiftsBudgetSummary
        budget={{
          annualBudget: 1000,
          planned: 500,
          spent: 1100,
          plannedOverBudgetBy: 0,
          spentOverBudgetBy: 100,
        }}
        readOnly={false}
      />
    );
    expect(screen.getByText(/spent more than budget by £100/i)).toBeInTheDocument();
  });

  it("hides signals when under budget", () => {
    render(
      <GiftsBudgetSummary
        budget={{
          annualBudget: 1000,
          planned: 500,
          spent: 200,
          plannedOverBudgetBy: 0,
          spentOverBudgetBy: 0,
        }}
        readOnly={false}
      />
    );
    expect(screen.queryByText(/over budget/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test GiftsBudgetSummary`
Expected: FAIL — module not found

- [ ] **Step 3: Implement both components**

`apps/frontend/src/components/gifts/OverBudgetSignal.tsx`:

```tsx
type Props = { kind: "planned" | "spent"; amountOver: number };

export function OverBudgetSignal({ kind, amountOver }: Props) {
  if (amountOver <= 0) return null;
  const label = kind === "planned" ? "planned more than budget by" : "spent more than budget by";
  return (
    <div className="flex items-center gap-2 text-xs text-attention">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-attention" />
      <span>
        {label} <span className="font-mono tabular-nums">£{amountOver.toLocaleString()}</span>
      </span>
    </div>
  );
}
```

`apps/frontend/src/components/gifts/GiftsBudgetSummary.tsx`:

```tsx
import { OverBudgetSignal } from "./OverBudgetSignal";
import type { GiftBudgetSummary } from "@finplan/shared";

type Props = { budget: GiftBudgetSummary; readOnly: boolean };

export function GiftsBudgetSummary({ budget }: Props) {
  return (
    <div className="space-y-3 px-6 py-4">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-foreground/40">Annual budget</div>
        <div
          data-testid="gifts-budget-annual"
          className="font-mono text-2xl tabular-nums text-foreground"
        >
          £{budget.annualBudget.toLocaleString()}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-foreground/40">Planned</div>
          <div
            data-testid="gifts-budget-planned"
            className="font-mono text-base tabular-nums text-foreground/65"
          >
            £{budget.planned.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-foreground/40">Spent</div>
          <div
            data-testid="gifts-budget-spent"
            className="font-mono text-base tabular-nums text-foreground/65"
          >
            £{budget.spent.toLocaleString()}
          </div>
        </div>
      </div>
      <OverBudgetSignal kind="planned" amountOver={budget.plannedOverBudgetBy} />
      <OverBudgetSignal kind="spent" amountOver={budget.spentOverBudgetBy} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test GiftsBudgetSummary`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/OverBudgetSignal.tsx apps/frontend/src/components/gifts/GiftsBudgetSummary.tsx apps/frontend/src/components/gifts/GiftsBudgetSummary.test.tsx
git commit -m "feat(gifts): budget summary block with over-budget signals"
```

---

### Task 25: `GiftsLeftAside` (year selector + budget summary + mode tabs)

**Files:**

- Create: `apps/frontend/src/components/gifts/GiftsLeftAside.tsx`
- Create: `apps/frontend/src/components/gifts/GiftsLeftAside.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/gifts/GiftsLeftAside.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { GiftsLeftAside } from "./GiftsLeftAside";

const sampleBudget = {
  annualBudget: 1000,
  planned: 500,
  spent: 100,
  plannedOverBudgetBy: 0,
  spentOverBudgetBy: 0,
};

describe("GiftsLeftAside", () => {
  it("renders title, year selector, and three mode tabs", () => {
    render(
      <GiftsLeftAside
        year={2026}
        years={[2024, 2025, 2026]}
        onYearChange={() => {}}
        mode="gifts"
        onModeChange={() => {}}
        budget={sampleBudget}
        readOnly={false}
      />
    );
    expect(screen.getByText("Gifts")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /year/i })).toHaveValue("2026");
    expect(screen.getByRole("button", { name: /^gifts$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upcoming/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /config/i })).toBeInTheDocument();
  });

  it("invokes onModeChange when a tab is clicked", () => {
    const onModeChange = mock(() => {});
    render(
      <GiftsLeftAside
        year={2026}
        years={[2026]}
        onYearChange={() => {}}
        mode="gifts"
        onModeChange={onModeChange}
        budget={sampleBudget}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /upcoming/i }));
    expect(onModeChange).toHaveBeenCalledWith("upcoming");
  });

  it("invokes onYearChange when year selector changes", () => {
    const onYearChange = mock(() => {});
    render(
      <GiftsLeftAside
        year={2026}
        years={[2024, 2025, 2026]}
        onYearChange={onYearChange}
        mode="gifts"
        onModeChange={() => {}}
        budget={sampleBudget}
        readOnly={false}
      />
    );
    fireEvent.change(screen.getByRole("combobox", { name: /year/i }), {
      target: { value: "2025" },
    });
    expect(onYearChange).toHaveBeenCalledWith(2025);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test GiftsLeftAside`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `GiftsLeftAside.tsx`**

```tsx
import { PageHeader } from "@/components/common/PageHeader";
import { GiftsBudgetSummary } from "./GiftsBudgetSummary";
import type { GiftBudgetSummary } from "@finplan/shared";

export type GiftsMode = "gifts" | "upcoming" | "config";

type Props = {
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
  mode: GiftsMode;
  onModeChange: (mode: GiftsMode) => void;
  budget: GiftBudgetSummary;
  readOnly: boolean;
};

const TABS: { id: GiftsMode; label: string }[] = [
  { id: "gifts", label: "Gifts" },
  { id: "upcoming", label: "Upcoming" },
  { id: "config", label: "Config" },
];

export function GiftsLeftAside({
  year,
  years,
  onYearChange,
  mode,
  onModeChange,
  budget,
  readOnly,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Gifts" />
      <div className="flex items-center gap-2 px-6 pb-2">
        <label
          className="text-[11px] uppercase tracking-wide text-foreground/40"
          htmlFor="gifts-year"
        >
          Year
        </label>
        <select
          id="gifts-year"
          aria-label="Year"
          className="rounded bg-foreground/5 px-2 py-1 text-sm text-foreground"
          value={String(year)}
          onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
        >
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <GiftsBudgetSummary budget={budget} readOnly={readOnly} />
      <nav className="mt-2 flex flex-col">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-active={mode === tab.id}
            onClick={() => onModeChange(tab.id)}
            className="px-6 py-2 text-left text-sm text-foreground/65 transition-colors hover:text-foreground data-[active=true]:text-foreground data-[active=true]:bg-foreground/5"
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test GiftsLeftAside`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/GiftsLeftAside.tsx apps/frontend/src/components/gifts/GiftsLeftAside.test.tsx
git commit -m "feat(gifts): left aside with year selector and mode tabs"
```

---

### Task 26: `GiftPersonList` (State 2 of Gifts mode)

**Files:**

- Create: `apps/frontend/src/components/gifts/GiftPersonList.tsx`
- Create: `apps/frontend/src/components/gifts/GiftPersonList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { GiftPersonList } from "./GiftPersonList";

const sample = [
  {
    id: "p1",
    name: "Mum",
    notes: null,
    sortOrder: 0,
    isHouseholdMember: true,
    plannedCount: 2,
    boughtCount: 1,
    plannedTotal: 150,
    spentTotal: 60,
    hasOverspend: false,
  },
  {
    id: "p2",
    name: "Dad",
    notes: null,
    sortOrder: 1,
    isHouseholdMember: false,
    plannedCount: 0,
    boughtCount: 3,
    plannedTotal: 300,
    spentTotal: 320,
    hasOverspend: true,
  },
];

describe("GiftPersonList", () => {
  it("renders one row per person with name and totals", () => {
    render(<GiftPersonList people={sample as any} onSelect={() => {}} />);
    expect(screen.getByText("Mum")).toBeInTheDocument();
    expect(screen.getByText("Dad")).toBeInTheDocument();
    expect(screen.getByTestId("person-row-p1")).toHaveTextContent("£150");
  });

  it("shows household badge for linked members", () => {
    render(<GiftPersonList people={sample as any} onSelect={() => {}} />);
    const mum = screen.getByTestId("person-row-p1");
    expect(mum).toHaveTextContent(/household/i);
  });

  it("renders amber dot when row has overspend", () => {
    render(<GiftPersonList people={sample as any} onSelect={() => {}} />);
    expect(screen.getByTestId("overspend-dot-p2")).toBeInTheDocument();
    expect(screen.queryByTestId("overspend-dot-p1")).toBeNull();
  });

  it("invokes onSelect with the person id when row is clicked", () => {
    const onSelect = mock(() => {});
    render(<GiftPersonList people={sample as any} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("person-row-p1"));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("renders empty state when no people", () => {
    render(<GiftPersonList people={[]} onSelect={() => {}} />);
    expect(screen.getByText(/no people yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test GiftPersonList`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `GiftPersonList.tsx`**

```tsx
import type { GiftPersonRow } from "@finplan/shared";

type Props = {
  people: GiftPersonRow[];
  onSelect: (id: string) => void;
};

export function GiftPersonList({ people, onSelect }: Props) {
  if (people.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-foreground/40">
        No people yet — head to Config → Quick Add to start.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-foreground/5">
      {people.map((p) => (
        <li
          key={p.id}
          data-testid={`person-row-${p.id}`}
          onClick={() => onSelect(p.id)}
          className="flex cursor-pointer items-center gap-4 px-6 py-3 transition-colors hover:bg-foreground/5"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">{p.name}</span>
              {p.isHouseholdMember && (
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/50">
                  Household
                </span>
              )}
              {p.hasOverspend && (
                <span
                  data-testid={`overspend-dot-${p.id}`}
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-attention"
                />
              )}
            </div>
            <div className="mt-1 flex gap-3 text-[11px]">
              <span className="text-foreground/40">{p.plannedCount} planned</span>
              <span className="text-foreground/65">{p.boughtCount} bought</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm tabular-nums text-foreground">
              £{p.plannedTotal.toLocaleString()}
            </div>
            <div className="font-mono text-[11px] tabular-nums text-foreground/40">
              £{p.spentTotal.toLocaleString()} spent
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test GiftPersonList`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/GiftPersonList.tsx apps/frontend/src/components/gifts/GiftPersonList.test.tsx
git commit -m "feat(gifts): person list (state 2) with overspend dot and household badge"
```

---

### Task 27: `GiftPersonDetail` (State 3 of Gifts mode)

**Files:**

- Create: `apps/frontend/src/components/gifts/GiftPersonDetail.tsx`
- Create: `apps/frontend/src/components/gifts/GiftPersonDetail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GiftPersonDetail } from "./GiftPersonDetail";

const upsertMock = mock(() => Promise.resolve({}));
mock.module("@/hooks/useGifts", () => ({
  useGiftPerson: () => ({
    data: {
      person: {
        id: "p1",
        name: "Mum",
        notes: null,
        sortOrder: 0,
        isHouseholdMember: false,
        plannedCount: 1,
        boughtCount: 0,
        plannedTotal: 50,
        spentTotal: 0,
        hasOverspend: false,
      },
      allocations: [
        {
          id: "a1",
          giftPersonId: "p1",
          giftEventId: "e1",
          eventName: "Christmas",
          eventDateType: "shared",
          eventIsLocked: true,
          year: 2026,
          planned: 50,
          spent: null,
          status: "planned",
          notes: null,
          dateMonth: null,
          dateDay: null,
          resolvedMonth: 12,
          resolvedDay: 25,
        },
        {
          id: null,
          giftPersonId: "p1",
          giftEventId: "e2",
          eventName: "Birthday",
          eventDateType: "personal",
          eventIsLocked: true,
          year: 2026,
          planned: 0,
          spent: null,
          status: "planned",
          notes: null,
          dateMonth: null,
          dateDay: null,
          resolvedMonth: null,
          resolvedDay: null,
        },
      ],
    },
    isLoading: false,
  }),
  useUpsertAllocation: () => ({ mutate: upsertMock, isPending: false }),
}));

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => upsertMock.mockClear());

describe("GiftPersonDetail", () => {
  it("renders breadcrumb and event cards", () => {
    render(<GiftPersonDetail personId="p1" year={2026} onBack={() => {}} readOnly={false} />, {
      wrapper,
    });
    expect(screen.getByText(/← People \/ Mum/i)).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
    expect(screen.getByText("Birthday")).toBeInTheDocument();
  });

  it("shows 'needs date' for personal-date event missing date", () => {
    render(<GiftPersonDetail personId="p1" year={2026} onBack={() => {}} readOnly={false} />, {
      wrapper,
    });
    expect(screen.getByText(/needs date/i)).toBeInTheDocument();
  });

  it("calls onBack when breadcrumb clicked", () => {
    const onBack = mock(() => {});
    render(<GiftPersonDetail personId="p1" year={2026} onBack={onBack} readOnly={false} />, {
      wrapper,
    });
    fireEvent.click(screen.getByTestId("gifts-breadcrumb-back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("blurring spent input triggers upsertAllocation with bought transition", () => {
    render(<GiftPersonDetail personId="p1" year={2026} onBack={() => {}} readOnly={false} />, {
      wrapper,
    });
    const spentInput = screen.getByTestId("spent-input-a1") as HTMLInputElement;
    fireEvent.change(spentInput, { target: { value: "45" } });
    fireEvent.blur(spentInput);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: "p1",
        eventId: "e1",
        year: 2026,
        data: { spent: 45 },
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test GiftPersonDetail`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `GiftPersonDetail.tsx`**

```tsx
import { useState } from "react";
import { useGiftPerson, useUpsertAllocation } from "@/hooks/useGifts";
import type { GiftAllocationRow } from "@finplan/shared";

type Props = { personId: string; year: number; onBack: () => void; readOnly: boolean };

export function GiftPersonDetail({ personId, year, onBack, readOnly }: Props) {
  const { data, isLoading } = useGiftPerson(personId, year);
  const upsert = useUpsertAllocation();
  if (isLoading || !data) return <div className="p-6 text-sm text-foreground/40">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        data-testid="gifts-breadcrumb-back"
        onClick={onBack}
        className="px-6 py-3 text-left text-xs text-foreground/50 hover:text-foreground"
      >
        ← People / {data.person.name}
      </button>
      <div className="flex-1 space-y-2 overflow-y-auto px-6 pb-6">
        {data.allocations.map((a) => (
          <AllocationCard
            key={a.giftEventId}
            allocation={a}
            readOnly={readOnly}
            onSpent={(value) =>
              upsert.mutate({
                personId,
                eventId: a.giftEventId,
                year,
                data: { spent: value },
              })
            }
            onPlanned={(value) =>
              upsert.mutate({
                personId,
                eventId: a.giftEventId,
                year,
                data: { planned: value },
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function AllocationCard({
  allocation,
  readOnly,
  onSpent,
  onPlanned,
}: {
  allocation: GiftAllocationRow;
  readOnly: boolean;
  onSpent: (value: number | null) => void;
  onPlanned: (value: number) => void;
}) {
  const [spent, setSpent] = useState<string>(
    allocation.spent !== null ? String(allocation.spent) : ""
  );
  const [planned, setPlanned] = useState<string>(String(allocation.planned));
  const needsDate = allocation.eventDateType === "personal" && allocation.resolvedMonth === null;

  return (
    <div className="rounded border border-foreground/5 bg-foreground/[0.02] px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{allocation.eventName}</span>
          {needsDate && <span className="text-[11px] text-foreground/40">needs date</span>}
        </div>
        <span className="text-[11px] uppercase tracking-wide text-foreground/40">
          {allocation.status}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-4">
        <label className="flex items-center gap-1 text-[11px] text-foreground/40">
          Planned
          <input
            type="number"
            min={0}
            disabled={readOnly}
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            onBlur={() => onPlanned(parseFloat(planned) || 0)}
            data-testid={`planned-input-${allocation.id ?? allocation.giftEventId}`}
            className="w-20 rounded bg-foreground/5 px-2 py-1 font-mono text-sm tabular-nums text-foreground"
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-foreground/40">
          Spent
          <input
            type="number"
            min={0}
            disabled={readOnly}
            value={spent}
            onChange={(e) => setSpent(e.target.value)}
            onBlur={() => onSpent(spent === "" ? null : parseFloat(spent))}
            data-testid={`spent-input-${allocation.id ?? allocation.giftEventId}`}
            className="w-20 rounded bg-foreground/5 px-2 py-1 font-mono text-sm tabular-nums text-foreground"
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test GiftPersonDetail`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/GiftPersonDetail.tsx apps/frontend/src/components/gifts/GiftPersonDetail.test.tsx
git commit -m "feat(gifts): person detail with inline allocation editing"
```

---

### Task 28: `GiftsModePanel` (drill controller)

**Files:**

- Create: `apps/frontend/src/components/gifts/GiftsModePanel.tsx`
- Create: `apps/frontend/src/components/gifts/GiftsModePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { GiftsModePanel } from "./GiftsModePanel";

mock.module("./GiftPersonDetail", () => ({
  GiftPersonDetail: ({ personId }: any) => <div data-testid="detail">detail-{personId}</div>,
}));
mock.module("./GiftPersonList", () => ({
  GiftPersonList: ({ people, onSelect }: any) => (
    <ul>
      {people.map((p: any) => (
        <li key={p.id}>
          <button data-testid={`row-${p.id}`} onClick={() => onSelect(p.id)}>
            {p.name}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

describe("GiftsModePanel", () => {
  const people = [{ id: "p1", name: "Mum" }] as any;

  it("renders list initially (state 2)", () => {
    render(<GiftsModePanel people={people} year={2026} readOnly={false} />);
    expect(screen.getByTestId("row-p1")).toBeInTheDocument();
    expect(screen.queryByTestId("detail")).toBeNull();
  });

  it("drills into detail on row click (state 3)", () => {
    render(<GiftsModePanel people={people} year={2026} readOnly={false} />);
    fireEvent.click(screen.getByTestId("row-p1"));
    expect(screen.getByTestId("detail")).toHaveTextContent("detail-p1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test GiftsModePanel`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `GiftsModePanel.tsx`**

```tsx
import { useState } from "react";
import { GiftPersonList } from "./GiftPersonList";
import { GiftPersonDetail } from "./GiftPersonDetail";
import type { GiftPersonRow } from "@finplan/shared";

type Props = { people: GiftPersonRow[]; year: number; readOnly: boolean };

export function GiftsModePanel({ people, year, readOnly }: Props) {
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  if (activePersonId) {
    return (
      <GiftPersonDetail
        personId={activePersonId}
        year={year}
        onBack={() => setActivePersonId(null)}
        readOnly={readOnly}
      />
    );
  }
  return <GiftPersonList people={people} onSelect={setActivePersonId} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test GiftsModePanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/GiftsModePanel.tsx apps/frontend/src/components/gifts/GiftsModePanel.test.tsx
git commit -m "feat(gifts): gifts mode drill controller"
```

---

### Task 29: `UpcomingModePanel`

**Files:**

- Create: `apps/frontend/src/components/gifts/UpcomingModePanel.tsx`
- Create: `apps/frontend/src/components/gifts/UpcomingModePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UpcomingModePanel } from "./UpcomingModePanel";

mock.module("@/hooks/useGifts", () => ({
  useGiftsUpcoming: () => ({
    isLoading: false,
    data: {
      callouts: {
        thisMonth: { count: 1, total: 100 },
        nextThreeMonths: { count: 2, total: 250 },
        restOfYear: { count: 0, total: 0 },
        dateless: { count: 1, total: 50 },
      },
      groups: [
        {
          month: 4,
          rows: [
            {
              eventId: "e1",
              eventName: "Mum's Birthday",
              eventDateType: "personal",
              day: 12,
              recipients: [{ personId: "p1", personName: "Mum", planned: 50, spent: null }],
              plannedTotal: 50,
              spentTotal: null,
            },
          ],
        },
        {
          month: 12,
          rows: [
            {
              eventId: "e2",
              eventName: "Christmas",
              eventDateType: "shared",
              day: 25,
              recipients: [
                { personId: "p1", personName: "Mum", planned: 50, spent: null },
                { personId: "p2", personName: "Dad", planned: 50, spent: null },
              ],
              plannedTotal: 100,
              spentTotal: null,
            },
          ],
        },
        { month: 0, rows: [] },
      ],
    },
  }),
}));

describe("UpcomingModePanel", () => {
  it("renders the four callout cards", () => {
    render(<UpcomingModePanel year={2026} />);
    expect(screen.getByTestId("callout-thisMonth")).toHaveTextContent("£100");
    expect(screen.getByTestId("callout-nextThreeMonths")).toHaveTextContent("£250");
    expect(screen.getByTestId("callout-restOfYear")).toHaveTextContent("£0");
    expect(screen.getByTestId("callout-dateless")).toHaveTextContent("£50");
  });

  it("renders shared event with inline recipients", () => {
    render(<UpcomingModePanel year={2026} />);
    expect(screen.getByText(/Christmas/)).toBeInTheDocument();
    expect(screen.getByText(/Mum/)).toBeInTheDocument();
    expect(screen.getByText(/Dad/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test UpcomingModePanel`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `UpcomingModePanel.tsx`**

```tsx
import { useGiftsUpcoming } from "@/hooks/useGifts";
import type { GiftUpcomingResponse } from "@finplan/shared";

const MONTH_NAMES = [
  "Dateless",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Props = { year: number };

export function UpcomingModePanel({ year }: Props) {
  const { data, isLoading } = useGiftsUpcoming(year);
  if (isLoading || !data) return <div className="p-6 text-sm text-foreground/40">Loading…</div>;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <CalloutGrid callouts={data.callouts} />
      <div className="mt-6 space-y-6">
        {data.groups.map((g) => (
          <section key={g.month}>
            <h3 className="mb-2 text-[11px] uppercase tracking-wide text-foreground/40">
              {MONTH_NAMES[g.month]}
            </h3>
            <ul className="space-y-1">
              {g.rows.length === 0 && (
                <li className="text-xs text-foreground/30">Nothing scheduled.</li>
              )}
              {g.rows.map((row) => (
                <li
                  key={`${row.eventId}-${row.day ?? "x"}-${row.recipients[0]?.personId ?? ""}`}
                  className="flex items-center justify-between rounded bg-foreground/[0.02] px-3 py-2"
                >
                  <div>
                    <div className="text-sm text-foreground">
                      {row.eventName}
                      {row.day ? <span className="ml-1 text-foreground/40">{row.day}</span> : null}
                    </div>
                    <div className="text-[11px] text-foreground/50">
                      {row.recipients.map((r) => r.personName).join(", ")}
                    </div>
                  </div>
                  <div className="font-mono text-sm tabular-nums text-foreground/65">
                    £{row.plannedTotal.toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function CalloutGrid({ callouts }: { callouts: GiftUpcomingResponse["callouts"] }) {
  const cards: { id: keyof GiftUpcomingResponse["callouts"]; label: string }[] = [
    { id: "thisMonth", label: "This month" },
    { id: "nextThreeMonths", label: "Next 3 months" },
    { id: "restOfYear", label: "Rest of year" },
    { id: "dateless", label: "Dateless" },
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.id}
          data-testid={`callout-${c.id}`}
          className="rounded border border-foreground/5 bg-foreground/[0.02] p-3"
        >
          <div className="text-[10px] uppercase tracking-wide text-foreground/40">{c.label}</div>
          <div className="font-mono text-base tabular-nums text-foreground">
            £{callouts[c.id].total.toLocaleString()}
          </div>
          <div className="text-[10px] text-foreground/40">
            {callouts[c.id].count} {callouts[c.id].count === 1 ? "gift" : "gifts"}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test UpcomingModePanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/UpcomingModePanel.tsx apps/frontend/src/components/gifts/UpcomingModePanel.test.tsx
git commit -m "feat(gifts): upcoming mode panel with month-grouped timeline and callouts"
```

---

### Task 30: `ConfigPeoplePanel`

**Files:**

- Create: `apps/frontend/src/components/gifts/ConfigPeoplePanel.tsx`
- Create: `apps/frontend/src/components/gifts/ConfigPeoplePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfigPeoplePanel } from "./ConfigPeoplePanel";

const createMock = mock(() => Promise.resolve({}));
const updateMock = mock(() => Promise.resolve({}));
const deleteMock = mock(() => Promise.resolve());

mock.module("@/hooks/useGifts", () => ({
  useConfigPeople: (filter: string) => ({
    isLoading: false,
    data: [
      { id: "p1", name: "Mum", memberId: "m1" },
      { id: "p2", name: "Dad", memberId: null },
    ].filter((p) =>
      filter === "household"
        ? p.memberId !== null
        : filter === "non-household"
          ? p.memberId === null
          : true
    ),
  }),
  useCreateGiftPerson: () => ({ mutate: createMock, isPending: false }),
  useUpdateGiftPerson: () => ({ mutate: updateMock, isPending: false }),
  useDeleteGiftPerson: () => ({ mutate: deleteMock, isPending: false }),
}));

describe("ConfigPeoplePanel", () => {
  it("renders all people by default", () => {
    render(<ConfigPeoplePanel readOnly={false} />);
    expect(screen.getByText("Mum")).toBeInTheDocument();
    expect(screen.getByText("Dad")).toBeInTheDocument();
  });

  it("filters to household-linked when filter set to household", () => {
    render(<ConfigPeoplePanel readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: /household/i }));
    expect(screen.getByText("Mum")).toBeInTheDocument();
    expect(screen.queryByText("Dad")).toBeNull();
  });

  it("invokes createGiftPerson when add row submitted", () => {
    render(<ConfigPeoplePanel readOnly={false} />);
    const input = screen.getByPlaceholderText(/add a person/i);
    fireEvent.change(input, { target: { value: "Sis" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createMock).toHaveBeenCalledWith({ name: "Sis" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ConfigPeoplePanel`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `ConfigPeoplePanel.tsx`**

```tsx
import { useState } from "react";
import {
  useConfigPeople,
  useCreateGiftPerson,
  useUpdateGiftPerson,
  useDeleteGiftPerson,
} from "@/hooks/useGifts";

type Filter = "all" | "household" | "non-household";

type Props = { readOnly: boolean };

export function ConfigPeoplePanel({ readOnly }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [name, setName] = useState("");
  const { data, isLoading } = useConfigPeople(filter);
  const create = useCreateGiftPerson();
  const remove = useDeleteGiftPerson();

  const submit = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim() }, { onSuccess: () => setName("") });
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-3 flex gap-2">
        {(["all", "household", "non-household"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            data-active={filter === f}
            className="rounded px-2 py-1 text-xs text-foreground/50 data-[active=true]:bg-foreground/10 data-[active=true]:text-foreground"
          >
            {f === "all" ? "All" : f === "household" ? "Household" : "Non-household"}
          </button>
        ))}
      </div>
      {!readOnly && (
        <div className="mb-3 flex gap-2">
          <input
            placeholder="Add a person…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="flex-1 rounded bg-foreground/5 px-2 py-1 text-sm text-foreground"
          />
        </div>
      )}
      {isLoading ? (
        <div className="text-sm text-foreground/40">Loading…</div>
      ) : (
        <ul className="divide-y divide-foreground/5">
          {(data ?? []).map((p: any) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-foreground">{p.name}</span>
              {p.memberId !== null && (
                <span className="text-[10px] uppercase tracking-wide text-foreground/40">
                  Household
                </span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove.mutate(p.id)}
                  className="text-[11px] text-foreground/40 hover:text-foreground"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ConfigPeoplePanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/ConfigPeoplePanel.tsx apps/frontend/src/components/gifts/ConfigPeoplePanel.test.tsx
git commit -m "feat(gifts): config people panel with filter and inline add"
```

---

### Task 31: `ConfigEventsPanel` (locked + custom segregation, date-type radio)

**Files:**

- Create: `apps/frontend/src/components/gifts/ConfigEventsPanel.tsx`
- Create: `apps/frontend/src/components/gifts/ConfigEventsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfigEventsPanel } from "./ConfigEventsPanel";

const createMock = mock(() => Promise.resolve({}));
const deleteMock = mock(() => Promise.resolve());

mock.module("@/hooks/useGifts", () => ({
  useConfigEvents: () => ({
    isLoading: false,
    data: [
      {
        id: "e1",
        name: "Christmas",
        dateType: "shared",
        isLocked: true,
        dateMonth: 12,
        dateDay: 25,
      },
      {
        id: "e2",
        name: "Wedding",
        dateType: "personal",
        isLocked: false,
        dateMonth: null,
        dateDay: null,
      },
    ],
  }),
  useCreateGiftEvent: () => ({ mutate: createMock, isPending: false }),
  useDeleteGiftEvent: () => ({ mutate: deleteMock, isPending: false }),
}));

describe("ConfigEventsPanel", () => {
  it("groups locked and custom events", () => {
    render(<ConfigEventsPanel readOnly={false} />);
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
    expect(screen.getByText(/custom/i)).toBeInTheDocument();
  });

  it("locked event is not deletable", () => {
    render(<ConfigEventsPanel readOnly={false} />);
    const xmasRow = screen.getByTestId("event-row-e1");
    expect(xmasRow.querySelector("button")).toBeNull();
  });

  it("create form requires date for shared-date events", () => {
    render(<ConfigEventsPanel readOnly={false} />);
    fireEvent.change(screen.getByPlaceholderText(/event name/i), {
      target: { value: "Halloween" },
    });
    fireEvent.click(screen.getByLabelText(/same date every year/i));
    fireEvent.change(screen.getByPlaceholderText(/month/i), { target: { value: "10" } });
    fireEvent.change(screen.getByPlaceholderText(/day/i), { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Halloween", dateType: "shared", dateMonth: 10, dateDay: 31 })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ConfigEventsPanel`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `ConfigEventsPanel.tsx`**

```tsx
import { useState } from "react";
import { useConfigEvents, useCreateGiftEvent, useDeleteGiftEvent } from "@/hooks/useGifts";
import type { GiftDateType } from "@finplan/shared";

type Props = { readOnly: boolean };

export function ConfigEventsPanel({ readOnly }: Props) {
  const { data, isLoading } = useConfigEvents();
  const create = useCreateGiftEvent();
  const remove = useDeleteGiftEvent();
  const [name, setName] = useState("");
  const [dateType, setDateType] = useState<GiftDateType>("personal");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    const payload: any = { name: name.trim(), dateType };
    if (dateType === "shared") {
      payload.dateMonth = parseInt(month, 10);
      payload.dateDay = parseInt(day, 10);
    }
    create.mutate(payload, {
      onSuccess: () => {
        setName("");
        setMonth("");
        setDay("");
      },
    });
  };

  if (isLoading || !data) return <div className="p-6 text-sm text-foreground/40">Loading…</div>;
  const locked = data.filter((e: any) => e.isLocked);
  const custom = data.filter((e: any) => !e.isLocked);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-wide text-foreground/40">Locked</h3>
        <ul className="divide-y divide-foreground/5">
          {locked.map((e: any) => (
            <li
              key={e.id}
              data-testid={`event-row-${e.id}`}
              className="flex items-center justify-between py-2"
            >
              <span className="text-sm text-foreground">
                <span aria-hidden className="mr-2 text-foreground/30">
                  🔒
                </span>
                {e.name}
              </span>
              <span className="text-[11px] text-foreground/40">
                {e.dateType === "shared" ? `${e.dateMonth}/${e.dateDay}` : "personal"}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-6">
        <h3 className="mb-2 text-[11px] uppercase tracking-wide text-foreground/40">Custom</h3>
        <ul className="divide-y divide-foreground/5">
          {custom.map((e: any) => (
            <li
              key={e.id}
              data-testid={`event-row-${e.id}`}
              className="flex items-center justify-between py-2"
            >
              <span className="text-sm text-foreground">{e.name}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove.mutate(e.id)}
                  className="text-[11px] text-foreground/40 hover:text-foreground"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div className="mt-3 space-y-2 rounded border border-foreground/5 p-3">
            <input
              placeholder="Event name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded bg-foreground/5 px-2 py-1 text-sm text-foreground"
            />
            <fieldset className="flex flex-col gap-1 text-[11px] text-foreground/65">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={dateType === "shared"}
                  onChange={() => setDateType("shared")}
                />
                Same date every year (e.g. Christmas)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={dateType === "personal"}
                  onChange={() => setDateType("personal")}
                />
                Different per person (e.g. Birthday)
              </label>
            </fieldset>
            {dateType === "shared" && (
              <div className="flex gap-2">
                <input
                  placeholder="Month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-20 rounded bg-foreground/5 px-2 py-1 text-sm text-foreground"
                />
                <input
                  placeholder="Day"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="w-20 rounded bg-foreground/5 px-2 py-1 text-sm text-foreground"
                />
              </div>
            )}
            <button
              type="button"
              onClick={submit}
              className="rounded bg-foreground/10 px-3 py-1 text-xs text-foreground hover:bg-foreground/20"
            >
              Add event
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ConfigEventsPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/ConfigEventsPanel.tsx apps/frontend/src/components/gifts/ConfigEventsPanel.test.tsx
git commit -m "feat(gifts): config events panel with locked/custom split and date-type radio"
```

---

### Task 32: `ModeSwitchConfirmDialog` and `ConfigPlannerModePanel`

**Files:**

- Create: `apps/frontend/src/components/gifts/ModeSwitchConfirmDialog.tsx`
- Create: `apps/frontend/src/components/gifts/ConfigPlannerModePanel.tsx`
- Create: `apps/frontend/src/components/gifts/ConfigPlannerModePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfigPlannerModePanel } from "./ConfigPlannerModePanel";

const setModeMock = mock(() => Promise.resolve({}));

mock.module("@/hooks/useGifts", () => ({
  useSetGiftMode: () => ({ mutate: setModeMock, isPending: false }),
}));

describe("ConfigPlannerModePanel", () => {
  it("displays current mode (synced)", () => {
    render(<ConfigPlannerModePanel currentMode="synced" readOnly={false} />);
    expect(screen.getByLabelText(/synced/i)).toBeChecked();
  });

  it("opens confirm dialog before switching to independent", () => {
    render(<ConfigPlannerModePanel currentMode="synced" readOnly={false} />);
    fireEvent.click(screen.getByLabelText(/independent/i));
    expect(screen.getByText(/will be deleted/i)).toBeInTheDocument();
    expect(setModeMock).not.toHaveBeenCalled();
  });

  it("calls setMode after confirmation", () => {
    render(<ConfigPlannerModePanel currentMode="synced" readOnly={false} />);
    fireEvent.click(screen.getByLabelText(/independent/i));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(setModeMock).toHaveBeenCalledWith({ mode: "independent" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ConfigPlannerModePanel`
Expected: FAIL — module not found

- [ ] **Step 3: Implement both components**

`ModeSwitchConfirmDialog.tsx`:

```tsx
import type { GiftPlannerMode } from "@finplan/shared";

type Props = {
  fromMode: GiftPlannerMode;
  toMode: GiftPlannerMode;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ModeSwitchConfirmDialog({ fromMode, toMode, onConfirm, onCancel }: Props) {
  const isDestructive = fromMode === "synced" && toMode === "independent";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-full max-w-md rounded border border-foreground/10 bg-background p-6">
        <h3 className="mb-3 text-base text-foreground">
          Switch to {toMode === "synced" ? "Synced" : "Independent"} mode?
        </h3>
        {isDestructive ? (
          <div className="space-y-2 text-sm text-foreground/65">
            <p>The following will be deleted:</p>
            <ul className="list-disc pl-5 text-xs text-foreground/50">
              <li>The "Gifts" Discretionary item managed by the planner</li>
              <li>All of its yearly amount-period history</li>
              <li>The lock on the Gifts subcategory (you can add items manually after)</li>
            </ul>
            <p className="text-xs text-foreground/40">
              People, events, allocations, and per-year budgets are preserved.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-foreground/65">
            <p>The following will be created:</p>
            <ul className="list-disc pl-5 text-xs text-foreground/50">
              <li>A planner-owned "Gifts" Discretionary item</li>
              <li>A yearly amount period for the current year using your annual budget</li>
              <li>The Gifts subcategory becomes locked to that single item</li>
            </ul>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1 text-xs text-foreground/65 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-foreground/10 px-3 py-1 text-xs text-foreground hover:bg-foreground/20"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
```

`ConfigPlannerModePanel.tsx`:

```tsx
import { useState } from "react";
import { useSetGiftMode } from "@/hooks/useGifts";
import { ModeSwitchConfirmDialog } from "./ModeSwitchConfirmDialog";
import type { GiftPlannerMode } from "@finplan/shared";

type Props = { currentMode: GiftPlannerMode; readOnly: boolean };

export function ConfigPlannerModePanel({ currentMode, readOnly }: Props) {
  const [pending, setPending] = useState<GiftPlannerMode | null>(null);
  const setMode = useSetGiftMode();

  const choose = (mode: GiftPlannerMode) => {
    if (mode === currentMode) return;
    setPending(mode);
  };

  return (
    <div className="flex h-full flex-col p-6">
      <fieldset className="flex flex-col gap-2 text-sm text-foreground">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="planner-mode"
            checked={currentMode === "synced"}
            disabled={readOnly}
            onChange={() => choose("synced")}
          />
          Synced — annual budget flows into the waterfall
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="planner-mode"
            checked={currentMode === "independent"}
            disabled={readOnly}
            onChange={() => choose("independent")}
          />
          Independent — planner runs standalone, no waterfall link
        </label>
      </fieldset>
      {pending && (
        <ModeSwitchConfirmDialog
          fromMode={currentMode}
          toMode={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setMode.mutate({ mode: pending });
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ConfigPlannerModePanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/ModeSwitchConfirmDialog.tsx apps/frontend/src/components/gifts/ConfigPlannerModePanel.tsx apps/frontend/src/components/gifts/ConfigPlannerModePanel.test.tsx
git commit -m "feat(gifts): mode switch panel with destructive confirmation dialog"
```

---

### Task 33: `ConfigModePanel` (drill controller)

**Files:**

- Create: `apps/frontend/src/components/gifts/ConfigModePanel.tsx`
- Create: `apps/frontend/src/components/gifts/ConfigModePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfigModePanel } from "./ConfigModePanel";

mock.module("./ConfigPeoplePanel", () => ({
  ConfigPeoplePanel: () => <div data-testid="people-panel" />,
}));
mock.module("./ConfigEventsPanel", () => ({
  ConfigEventsPanel: () => <div data-testid="events-panel" />,
}));
mock.module("./ConfigPlannerModePanel", () => ({
  ConfigPlannerModePanel: () => <div data-testid="mode-panel" />,
}));
mock.module("./QuickAddPanel", () => ({
  QuickAddPanel: () => <div data-testid="quickadd-panel" />,
}));

describe("ConfigModePanel", () => {
  it("renders three drill rows in state 2", () => {
    render(<ConfigModePanel currentMode="synced" readOnly={false} year={2026} />);
    expect(screen.getByText(/people/i)).toBeInTheDocument();
    expect(screen.getByText(/events/i)).toBeInTheDocument();
    expect(screen.getByText(/^mode$/i)).toBeInTheDocument();
    expect(screen.getByText(/quick add/i)).toBeInTheDocument();
  });

  it("drills into people panel", () => {
    render(<ConfigModePanel currentMode="synced" readOnly={false} year={2026} />);
    fireEvent.click(screen.getByText(/people/i));
    expect(screen.getByTestId("people-panel")).toBeInTheDocument();
  });

  it("drills into mode panel", () => {
    render(<ConfigModePanel currentMode="synced" readOnly={false} year={2026} />);
    fireEvent.click(screen.getByText(/^mode$/i));
    expect(screen.getByTestId("mode-panel")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ConfigModePanel`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `ConfigModePanel.tsx`**

```tsx
import { useState } from "react";
import { ConfigPeoplePanel } from "./ConfigPeoplePanel";
import { ConfigEventsPanel } from "./ConfigEventsPanel";
import { ConfigPlannerModePanel } from "./ConfigPlannerModePanel";
import { QuickAddPanel } from "./QuickAddPanel";
import type { GiftPlannerMode } from "@finplan/shared";

type Drill = "list" | "people" | "events" | "mode" | "quickadd";
type Props = { currentMode: GiftPlannerMode; readOnly: boolean; year: number };

export function ConfigModePanel({ currentMode, readOnly, year }: Props) {
  const [drill, setDrill] = useState<Drill>("list");

  if (drill === "list") {
    return (
      <ul className="divide-y divide-foreground/5">
        {[
          { id: "people" as Drill, label: "People" },
          { id: "events" as Drill, label: "Events" },
          { id: "mode" as Drill, label: "Mode" },
          { id: "quickadd" as Drill, label: "Quick add" },
        ].map((row) => (
          <li
            key={row.id}
            onClick={() => setDrill(row.id)}
            className="cursor-pointer px-6 py-3 text-sm text-foreground hover:bg-foreground/5"
          >
            {row.label}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => setDrill("list")}
        className="px-6 py-3 text-left text-xs text-foreground/50 hover:text-foreground"
      >
        ← Config / {labelFor(drill)}
      </button>
      {drill === "people" && <ConfigPeoplePanel readOnly={readOnly} />}
      {drill === "events" && <ConfigEventsPanel readOnly={readOnly} />}
      {drill === "mode" && <ConfigPlannerModePanel currentMode={currentMode} readOnly={readOnly} />}
      {drill === "quickadd" && <QuickAddPanel year={year} readOnly={readOnly} />}
    </div>
  );
}

function labelFor(drill: Drill): string {
  switch (drill) {
    case "people":
      return "People";
    case "events":
      return "Events";
    case "mode":
      return "Mode";
    case "quickadd":
      return "Quick add";
    default:
      return "";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ConfigModePanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/ConfigModePanel.tsx apps/frontend/src/components/gifts/ConfigModePanel.test.tsx
git commit -m "feat(gifts): config drill controller (people, events, mode, quick-add)"
```

---

### Task 34: `QuickAddPanel` (matrix editor)

**Files:**

- Create: `apps/frontend/src/components/gifts/QuickAddPanel.tsx`
- Create: `apps/frontend/src/components/gifts/QuickAddPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickAddPanel } from "./QuickAddPanel";

const bulkMock = mock(() => Promise.resolve({ count: 0 }));

mock.module("@/hooks/useGifts", () => ({
  useConfigPeople: () => ({
    isLoading: false,
    data: [
      { id: "p1", name: "Mum" },
      { id: "p2", name: "Dad" },
    ],
  }),
  useConfigEvents: () => ({
    isLoading: false,
    data: [{ id: "e1", name: "Christmas", isLocked: true }],
  }),
  useBulkUpsertAllocations: () => ({ mutate: bulkMock, isPending: false }),
}));

describe("QuickAddPanel", () => {
  it("renders a matrix with one column per person and one row per event", () => {
    render(<QuickAddPanel year={2026} readOnly={false} />);
    expect(screen.getByText("Mum")).toBeInTheDocument();
    expect(screen.getByText("Dad")).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
  });

  it("save submits cells with non-zero planned values", () => {
    render(<QuickAddPanel year={2026} readOnly={false} />);
    const cell = screen.getByTestId("cell-e1-p1") as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(bulkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cells: expect.arrayContaining([
          expect.objectContaining({ personId: "p1", eventId: "e1", year: 2026, planned: 50 }),
        ]),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test QuickAddPanel`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `QuickAddPanel.tsx`**

```tsx
import { useState } from "react";
import { useBulkUpsertAllocations, useConfigEvents, useConfigPeople } from "@/hooks/useGifts";

type Props = { year: number; readOnly: boolean };

export function QuickAddPanel({ year, readOnly }: Props) {
  const people = useConfigPeople("all");
  const events = useConfigEvents();
  const bulk = useBulkUpsertAllocations();
  const [cells, setCells] = useState<Record<string, string>>({});

  if (people.isLoading || events.isLoading || !people.data || !events.data) {
    return <div className="p-6 text-sm text-foreground/40">Loading…</div>;
  }

  const set = (eventId: string, personId: string, value: string) =>
    setCells((prev) => ({ ...prev, [`${eventId}-${personId}`]: value }));

  const save = () => {
    const payload = Object.entries(cells)
      .map(([key, value]) => {
        const [eventId, personId] = key.split("-");
        const planned = parseFloat(value);
        if (Number.isNaN(planned) || planned <= 0) return null;
        return { eventId: eventId!, personId: personId!, year, planned };
      })
      .filter(
        (c): c is { eventId: string; personId: string; year: number; planned: number } => c !== null
      );
    bulk.mutate({ cells: payload });
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-3 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th></th>
              {(people.data as any[]).map((p) => (
                <th key={p.id} className="px-2 py-1 text-left text-[11px] text-foreground/50">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(events.data as any[]).map((e) => (
              <tr key={e.id}>
                <td className="px-2 py-1 text-[11px] text-foreground/50">{e.name}</td>
                {(people.data as any[]).map((p) => (
                  <td key={p.id}>
                    <input
                      type="number"
                      min={0}
                      data-testid={`cell-${e.id}-${p.id}`}
                      disabled={readOnly}
                      value={cells[`${e.id}-${p.id}`] ?? ""}
                      onChange={(ev) => set(e.id, p.id, ev.target.value)}
                      className="w-16 rounded bg-foreground/5 px-1 py-0.5 text-right font-mono tabular-nums text-foreground"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setCells({})}
          className="rounded px-3 py-1 text-xs text-foreground/65 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={readOnly || bulk.isPending}
          className="rounded bg-foreground/10 px-3 py-1 text-xs text-foreground hover:bg-foreground/20"
        >
          Save
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test QuickAddPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/QuickAddPanel.tsx apps/frontend/src/components/gifts/QuickAddPanel.test.tsx
git commit -m "feat(gifts): quick add matrix editor with bulk save"
```

---

### Task 35: `YearRolloverBanner`

**Files:**

- Create: `apps/frontend/src/components/gifts/YearRolloverBanner.tsx`
- Create: `apps/frontend/src/components/gifts/YearRolloverBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { YearRolloverBanner } from "./YearRolloverBanner";

const dismissMock = mock(() => Promise.resolve());
mock.module("@/hooks/useGifts", () => ({
  useDismissRollover: () => ({ mutate: dismissMock, isPending: false }),
}));

beforeEach(() => dismissMock.mockClear());

describe("YearRolloverBanner", () => {
  it("renders when pending", () => {
    render(<YearRolloverBanner year={2026} pending={true} />);
    expect(screen.getByText(/gift plan for 2026/i)).toBeInTheDocument();
  });

  it("renders nothing when not pending", () => {
    const { container } = render(<YearRolloverBanner year={2026} pending={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("dismiss invokes mutation with year", () => {
    render(<YearRolloverBanner year={2026} pending={true} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(dismissMock).toHaveBeenCalledWith(2026);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test YearRolloverBanner`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `YearRolloverBanner.tsx`**

```tsx
import { useDismissRollover } from "@/hooks/useGifts";

type Props = { year: number; pending: boolean };

export function YearRolloverBanner({ year, pending }: Props) {
  const dismiss = useDismissRollover();
  if (!pending) return null;
  return (
    <div className="mx-6 mt-4 flex items-center justify-between rounded border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-xs text-foreground/65">
      <span>
        Gift plan for {year} has been created — you may want to review and update the planned
        amounts.
      </span>
      <button
        type="button"
        onClick={() => dismiss.mutate(year)}
        className="ml-3 rounded px-2 py-0.5 text-foreground/50 hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test YearRolloverBanner`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/gifts/YearRolloverBanner.tsx apps/frontend/src/components/gifts/YearRolloverBanner.test.tsx
git commit -m "feat(gifts): year rollover banner with dismissal"
```

---

### Task 36: Rewrite `GiftsPage` to compose all panels

**Files:**

- Modify: `apps/frontend/src/pages/GiftsPage.tsx`
- Modify: `apps/frontend/src/pages/GiftsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace `apps/frontend/src/pages/GiftsPage.test.tsx` with:

```tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GiftsPage from "./GiftsPage";

mock.module("@/hooks/useGifts", () => ({
  useGiftsState: () => ({
    isLoading: false,
    data: {
      mode: "synced",
      year: 2026,
      isReadOnly: false,
      budget: {
        annualBudget: 1000,
        planned: 0,
        spent: 0,
        plannedOverBudgetBy: 0,
        spentOverBudgetBy: 0,
      },
      people: [
        {
          id: "p1",
          name: "Mum",
          isHouseholdMember: false,
          plannedCount: 0,
          boughtCount: 0,
          plannedTotal: 0,
          spentTotal: 0,
          hasOverspend: false,
          sortOrder: 0,
          notes: null,
        },
      ],
      rolloverPending: false,
    },
  }),
  useGiftsYears: () => ({ data: [2026], isLoading: false }),
}));
mock.module("@/components/gifts/GiftsModePanel", () => ({
  GiftsModePanel: () => <div data-testid="gifts-mode" />,
}));
mock.module("@/components/gifts/UpcomingModePanel", () => ({
  UpcomingModePanel: () => <div data-testid="upcoming-mode" />,
}));
mock.module("@/components/gifts/ConfigModePanel", () => ({
  ConfigModePanel: () => <div data-testid="config-mode" />,
}));
mock.module("@/components/gifts/YearRolloverBanner", () => ({
  YearRolloverBanner: () => null,
}));

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("GiftsPage", () => {
  it("renders the gifts mode panel by default", () => {
    render(<GiftsPage />, { wrapper });
    expect(screen.getByTestId("gifts-mode")).toBeInTheDocument();
  });

  it("switches to upcoming when the tab is clicked", () => {
    render(<GiftsPage />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /upcoming/i }));
    expect(screen.getByTestId("upcoming-mode")).toBeInTheDocument();
  });

  it("switches to config when the tab is clicked", () => {
    render(<GiftsPage />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /config/i }));
    expect(screen.getByTestId("config-mode")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test GiftsPage`
Expected: FAIL — current `GiftsPage` is a "Coming soon" stub

- [ ] **Step 3: Rewrite `apps/frontend/src/pages/GiftsPage.tsx`**

```tsx
import { useState } from "react";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { GiftsLeftAside, type GiftsMode } from "@/components/gifts/GiftsLeftAside";
import { GiftsModePanel } from "@/components/gifts/GiftsModePanel";
import { UpcomingModePanel } from "@/components/gifts/UpcomingModePanel";
import { ConfigModePanel } from "@/components/gifts/ConfigModePanel";
import { YearRolloverBanner } from "@/components/gifts/YearRolloverBanner";
import { useGiftsState, useGiftsYears } from "@/hooks/useGifts";

export default function GiftsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [mode, setMode] = useState<GiftsMode>("gifts");

  const stateQuery = useGiftsState(year);
  const yearsQuery = useGiftsYears();

  if (stateQuery.isLoading || !stateQuery.data) {
    return (
      <div
        data-testid="gifts-page"
        className="flex h-screen items-center justify-center text-sm text-foreground/40"
      >
        Loading…
      </div>
    );
  }

  const state = stateQuery.data;
  const years = yearsQuery.data ?? [year];

  return (
    <div data-testid="gifts-page" className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 20% 20%, rgba(139,92,246,0.08) 0%, transparent 70%)",
        }}
      />
      <YearRolloverBanner year={year} pending={state.rolloverPending} />
      <TwoPanelLayout
        left={
          <GiftsLeftAside
            year={year}
            years={years}
            onYearChange={setYear}
            mode={mode}
            onModeChange={setMode}
            budget={state.budget}
            readOnly={state.isReadOnly}
          />
        }
        right={
          <div className="flex h-full flex-col">
            {mode === "gifts" && (
              <GiftsModePanel people={state.people} year={year} readOnly={state.isReadOnly} />
            )}
            {mode === "upcoming" && <UpcomingModePanel year={year} />}
            {mode === "config" && (
              <ConfigModePanel currentMode={state.mode} readOnly={state.isReadOnly} year={year} />
            )}
          </div>
        }
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test GiftsPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/GiftsPage.tsx apps/frontend/src/pages/GiftsPage.test.tsx
git commit -m "feat(gifts): rewrite GiftsPage to compose all planner modes"
```

---

## Phase H — End-to-end verification

### Task 37: Run lint, type-check, full test suite, and manual smoke

**Files:**

- N/A (verification only)

- [ ] **Step 1: Run lint and type-check across the monorepo**

```bash
cd /c/Users/Gabriel/Documents/Dev/fin_plan_gifts && bun run lint
cd /c/Users/Gabriel/Documents/Dev/fin_plan_gifts && bun run type-check
```

Expected: zero warnings, zero errors. Fix any unused imports or stray `any` usage that the strict TypeScript flags catch.

- [ ] **Step 2: Run the full backend test suite**

```bash
cd apps/backend && bun scripts/run-tests.ts
```

Expected: all tests pass. Pay attention to `gifts.service`, `gifts.routes`, `member.service`, `waterfall.service`, `export.service`, `import.service`, `export-import.roundtrip`, `planner.service`.

- [ ] **Step 3: Run the full frontend test suite**

```bash
cd apps/frontend && bun test
```

Expected: all tests pass.

- [ ] **Step 4: Manual smoke (Docker dev environment)**

```bash
cd /c/Users/Gabriel/Documents/Dev/fin_plan_gifts && bun run start
```

Then in a browser:

1. Sign in to the dev household at `http://localhost:3000`.
2. Navigate to `/gifts`. Confirm the page renders the left aside (title, year, budget summary, three tabs).
3. Open `Config → People`. Confirm household members appear with the badge. Add a non-household person.
4. Open `Config → Events`. Confirm the seven locked events appear at the top. Add a custom event with a shared date and a custom event with a personal date.
5. Open `Config → Quick add`. Fill several cells. Click Save.
6. Return to `Gifts` mode. Confirm rows show planned/bought counts and totals.
7. Click a person to drill into State 3. Edit a planned value and a spent value; confirm the spent transition flips status to `bought`.
8. Open `Upcoming`. Confirm the four callout cards and a month-grouped timeline.
9. Open `Config → Mode`. Switch to Independent. Confirm the destructive dialog. Confirm. Switch back to Synced. Confirm.
10. In another tab, navigate to the Discretionary section of Overview. Confirm the Gifts subcategory contains exactly the planner-owned item and that attempting to add another item there fails.

- [ ] **Step 5: Build the full monorepo**

```bash
cd /c/Users/Gabriel/Documents/Dev/fin_plan_gifts && bun run build
```

Expected: clean build, no warnings.

- [ ] **Step 6: Final commit (if any cleanup was needed)**

```bash
git add -p
git commit -m "chore(gifts): post-verification cleanup"
```

---

## Testing

> Key scenarios that must pass end-to-end, beyond the per-task tests above.

### Backend Tests

- [ ] Service: locked events seeded only once per household (`createMany skipDuplicates`)
- [ ] Service: status transitions — `spent: 0` → `bought`, `spent: null` → `planned`, explicit `skipped` honoured
- [ ] Service: Quick Add bulk upsert rejects past-year cells and cross-household person/event ids
- [ ] Service: synced→independent deletes planner-owned `DiscretionaryItem` and all `ItemAmountPeriod` rows for that item
- [ ] Service: independent→synced creates a new `DiscretionaryItem`, sets `isPlannerOwned`, locks the subcategory, writes a fresh `ItemAmountPeriod`
- [ ] Service: lazy rollover only triggers on first read after 1 January when no current-year `PlannerYearBudget` row exists and a prior-year row does
- [ ] Service: rollover duplicates allocations with `planned`/`notes`/`date` carried forward and `spent: null`, `status: planned`
- [ ] Service: in synced mode rollover also creates a new `ItemAmountPeriod` for the planner-owned item
- [ ] Service: `getPlannerState` aggregates per-person totals correctly, flags `hasOverspend` when any allocation `spent > planned`
- [ ] Service: `getUpcoming` collapses shared-date allocations into one row, keeps personal-date per recipient, sends date-less to month 0
- [ ] Endpoint: every gift route enforces JWT (`authMiddleware` in `preHandler`)
- [ ] Endpoint: every mutation rejects `year < currentYear` via service-layer guards
- [ ] Endpoint: Quick Add bulk endpoint rejects payloads with > 500 cells (Zod schema layer)
- [ ] Endpoint: `waterfall.service.createDiscretionary` rejects items in a planner-locked subcategory
- [ ] Endpoint: `waterfall.service.updateDiscretionary` and `deleteDiscretionary` reject planner-owned items
- [ ] Edge case: deleting a `Member` nullifies `GiftPerson.memberId` but preserves the `GiftPerson` row
- [ ] Edge case: creating a `Member` with a name that already exists as a `GiftPerson` does not throw (P2002 swallowed)

### Frontend Tests

- [ ] Component: `GiftsBudgetSummary` shows the two amber signals only when over budget
- [ ] Component: `GiftPersonList` renders empty state, household badge, overspend dot
- [ ] Component: `GiftPersonDetail` shows "needs date" only for personal-date events with no resolved date
- [ ] Component: `GiftPersonDetail` blur on spent input invokes upsert with `bought` status transition
- [ ] Component: `UpcomingModePanel` collapses shared events with inline recipients
- [ ] Component: `ConfigPlannerModePanel` opens confirmation dialog before switching modes
- [ ] Component: `QuickAddPanel` only sends cells with non-zero `planned` to the bulk endpoint
- [ ] Component: `YearRolloverBanner` renders nothing when `pending=false`
- [ ] Page: `GiftsPage` swaps right-panel content when mode tabs are clicked
- [ ] Hook: `useGiftsState` invalidates the entire `gifts` query namespace on any mutation success

### Key Scenarios

- [ ] Happy path: a fresh household visits `/gifts`, sees the seeded events, adds a person via Config, adds a Christmas allocation of £50, sees it reflected in the budget summary
- [ ] Error case: editing a planned value to `-1` is rejected at the field level
- [ ] Edge case: the year selector switches to a prior year and every editable surface becomes read-only
- [ ] Edge case: in Synced mode, opening the Discretionary tab and attempting to add another item to the Gifts subcategory fails with the planner-locked error
- [ ] Edge case: switching from Synced to Independent and back creates a fresh `ItemAmountPeriod` for the new item with the same annual budget

## Verification

> Commands to run after all tasks are complete. All must pass before marking done.

- [ ] `bun run build` passes clean from the repo root
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — zero errors
- [ ] `cd apps/backend && bun scripts/run-tests.ts gifts` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts member` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts waterfall` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts export` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts import` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts roundtrip` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts planner` passes (purchases-only after demolition)
- [ ] `cd apps/frontend && bun test` passes
- [ ] Manual smoke: complete the Phase H Step 4 walkthrough end-to-end without errors

## Post-conditions

> What this feature enables for subsequent phases or dependent work.

- [ ] `/gifts` is a fully functional planner; the legacy "Coming soon" stub is gone
- [ ] The Gifts subcategory in Discretionary either contains the single planner-owned item (Synced) or is freely manageable by the user (Independent)
- [ ] Household members automatically appear as gift recipients on creation and survive removal as orphaned `GiftPerson` rows
- [ ] Year rollover happens silently on the first visit of the new year and the user is informed by an in-page banner
- [ ] Export/Import schema v2 round-trips the new gift matrix shape
- [ ] No legacy `GiftPerson`/`GiftEvent`/`GiftYearRecord` references remain anywhere in the codebase
- [ ] Future work: auto-calculation of moveable feasts (Easter, Mothering Sunday, UK Father's Day) and shared gifts can layer on top of the matrix model without further schema changes
