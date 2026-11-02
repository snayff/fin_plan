---
feature: asset-and-account-growth-and-contributions
category: overview
spec: docs/4. planning/asset-and-account-growth-and-contributions/asset-and-account-growth-and-contributions-spec.md
creation_date: 2026-04-19
status: implemented
implemented_date: 2026-07-05
---

# Asset and Account Growth and Contributions — Implementation Plan

> **For Claude:** Use `/execute-plan asset-and-account-growth-and-contributions` to implement this plan task-by-task.

**Goal:** Make monthly account contributions a first-class product of the waterfall (Discretionary → Savings items linked to an Account) and add household-level growth defaults for Property / Vehicle / Other assets, so the Forecast's Growth chart reflects real inputs.

**Spec:** `docs/4. planning/asset-and-account-growth-and-contributions/asset-and-account-growth-and-contributions-spec.md`

**Architecture:** Adds a nullable `DiscretionaryItem.linkedAccountId` FK scoped to Savings/S&S/Pension accounts, drops the free-typed `Account.monthlyContribution`, and derives the account's monthly contribution at read time by summing linked items (normalised with existing `toMonthlyAmount`). Extends `HouseholdSettings` with three asset-class defaults. Seeds/backfills the Discretionary "Savings" subcategory as locked. Extends the Forecast projection response with `monthlyContributionsByScope` to power the Growth chart stat row. Frontend: `DiscretionaryItemForm` gets a `LinkedAccountPicker`, `AssetAccountRow` grows a subtitle + `LinkedContributionsPopover`, `GrowthRatesSection` grows three inputs, `NetWorthChart` grows a contributions stat.

**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind

**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: yes

## Pre-conditions

- [ ] Schema already carries `Account.growthRatePct`, `Asset.growthRatePct`, `Subcategory.isLocked` — verified
- [ ] Waterfall tier services (`waterfall.service.ts`, `subcategory.service.ts`) exist with the current locked-subcategory pattern (Gifts)
- [ ] `@finplan/shared`'s `toMonthlyAmount(amount, spendType)` helper exists and handles `monthly`, `weekly`, `quarterly`, `annual`/`yearly`, `one_off` (→ 0)
- [ ] `forecast.service.ts` already reads `monthlyContribution` and `growthRatePct` per account, and `growthRatePct` per asset — the gap is UI plus derivation

## Tasks

> Ordered: schema → shared schemas → backend services → routes → export/import shim → frontend services/types → frontend components.

---

### Task 1: Schema — add linkedAccountId, drop Account.monthlyContribution, add asset rate defaults, lock Savings subcategory

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Run: `bun run db:migrate`
- Test: `apps/backend/src/services/discretionary-link.schema.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/discretionary-link.schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prisma } from "../config/database.js";
import { createTestHousehold } from "../test/helpers/test-db.js";

describe("schema: DiscretionaryItem.linkedAccountId + HouseholdSettings asset rates", () => {
  let householdId: string;
  let subcategoryId: string;
  let accountId: string;

  beforeAll(async () => {
    const hh = await createTestHousehold();
    householdId = hh.id;
    const sub = await prisma.subcategory.create({
      data: { householdId, tier: "discretionary", name: "Savings", sortOrder: 0, isLocked: true },
    });
    subcategoryId = sub.id;
    const acc = await prisma.account.create({
      data: { householdId, name: "My ISA", type: "Savings" },
    });
    accountId = acc.id;
  });

  afterAll(async () => {
    await prisma.household.delete({ where: { id: householdId } });
  });

  it("allows setting linkedAccountId on a DiscretionaryItem", async () => {
    const item = await prisma.discretionaryItem.create({
      data: { householdId, subcategoryId, name: "ISA top-up", linkedAccountId: accountId },
    });
    expect(item.linkedAccountId).toBe(accountId);
  });

  it("sets linkedAccountId to null when the target Account is deleted (ON DELETE SET NULL)", async () => {
    const acc2 = await prisma.account.create({
      data: { householdId, name: "Temp", type: "Savings" },
    });
    const item = await prisma.discretionaryItem.create({
      data: { householdId, subcategoryId, name: "Temp link", linkedAccountId: acc2.id },
    });
    await prisma.account.delete({ where: { id: acc2.id } });
    const reloaded = await prisma.discretionaryItem.findUnique({ where: { id: item.id } });
    expect(reloaded?.linkedAccountId).toBeNull();
  });

  it("does not carry Account.monthlyContribution any more", async () => {
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    expect((acc as any).monthlyContribution).toBeUndefined();
  });

  it("HouseholdSettings has propertyRatePct / vehicleRatePct / otherAssetRatePct defaults", async () => {
    const settings = await prisma.householdSettings.create({
      data: { householdId: (await createTestHousehold()).id },
    });
    expect(settings.propertyRatePct).toBe(3.5);
    expect(settings.vehicleRatePct).toBe(-15);
    expect(settings.otherAssetRatePct).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts discretionary-link.schema`
Expected: FAIL — "Unknown arg `linkedAccountId`" (Prisma type error) or "Unknown arg `propertyRatePct`"

- [ ] **Step 3: Edit `apps/backend/prisma/schema.prisma` and run migration**

In the `DiscretionaryItem` model, add:

```prisma
  linkedAccountId String?
  linkedAccount   Account? @relation("DiscretionaryAccountLink", fields: [linkedAccountId], references: [id], onDelete: SetNull)

  @@index([linkedAccountId])
```

In the `Account` model:

- Remove the line `monthlyContribution Float            @default(0)`
- Add the back-relation: `linkedItems         DiscretionaryItem[] @relation("DiscretionaryAccountLink")`

In the `HouseholdSettings` model, add:

```prisma
  propertyRatePct    Float    @default(3.5)
  vehicleRatePct     Float    @default(-15)
  otherAssetRatePct  Float    @default(0)
```

Then:

```bash
bun run db:migrate
# Migration name: add_contribution_link_and_asset_rate_defaults
```

The migration must additionally include a data backfill that locks the existing "Savings" Discretionary subcategory for every household. Add to the generated SQL file:

```sql
UPDATE "Subcategory"
SET "isLocked" = true
WHERE "tier" = 'discretionary' AND "name" = 'Savings';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts discretionary-link.schema`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/ apps/backend/src/services/discretionary-link.schema.test.ts
git commit -m "feat(schema): link discretionary items to accounts, drop account.monthlyContribution, add asset rate defaults"
```

---

### Task 2: Shared schemas — DiscretionaryItem linkedAccountId, HouseholdSettings rates, Forecast monthlyContributionsByScope

**Files:**

- Modify: `packages/shared/src/schemas/waterfall.schemas.ts`
- Modify: `packages/shared/src/schemas/settings.schemas.ts`
- Modify: `packages/shared/src/schemas/forecast.schemas.ts`
- Modify: `packages/shared/src/schemas/export-import.schemas.ts` (drop monthlyContribution)
- Test: `packages/shared/src/schemas/contribution-link.schemas.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/contribution-link.schemas.test.ts
import { describe, it, expect } from "bun:test";
import { createDiscretionaryItemSchema, updateDiscretionaryItemSchema } from "./waterfall.schemas";
import { updateSettingsSchema } from "./settings.schemas";
import { ForecastProjectionSchema } from "./forecast.schemas";

describe("createDiscretionaryItemSchema — linkedAccountId", () => {
  it("accepts a string linkedAccountId", () => {
    const r = createDiscretionaryItemSchema.safeParse({
      name: "ISA top-up",
      amount: 200,
      subcategoryId: "sub1",
      linkedAccountId: "acc1",
    });
    expect(r.success).toBe(true);
  });
  it("accepts null", () => {
    const r = createDiscretionaryItemSchema.safeParse({
      name: "n",
      amount: 1,
      subcategoryId: "sub1",
      linkedAccountId: null,
    });
    expect(r.success).toBe(true);
  });
});

describe("updateDiscretionaryItemSchema", () => {
  it("accepts linkedAccountId", () => {
    const r = updateDiscretionaryItemSchema.safeParse({ linkedAccountId: "acc1" });
    expect(r.success).toBe(true);
  });
});

describe("updateSettingsSchema — asset rate defaults", () => {
  it("accepts propertyRatePct / vehicleRatePct / otherAssetRatePct", () => {
    const r = updateSettingsSchema.safeParse({
      propertyRatePct: 3.5,
      vehicleRatePct: -15,
      otherAssetRatePct: 0,
    });
    expect(r.success).toBe(true);
  });
  it("rejects vehicleRatePct below −100", () => {
    const r = updateSettingsSchema.safeParse({ vehicleRatePct: -150 });
    expect(r.success).toBe(false);
  });
  it("rejects propertyRatePct above 100", () => {
    const r = updateSettingsSchema.safeParse({ propertyRatePct: 101 });
    expect(r.success).toBe(false);
  });
});

describe("ForecastProjectionSchema — monthlyContributionsByScope", () => {
  it("accepts monthlyContributionsByScope", () => {
    const r = ForecastProjectionSchema.safeParse({
      netWorth: [],
      surplus: [],
      retirement: [],
      monthlyContributionsByScope: { netWorth: 500, retirement: 700 },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test contribution-link.schemas`
Expected: FAIL — keys not accepted

- [ ] **Step 3: Edit shared schemas**

In `packages/shared/src/schemas/waterfall.schemas.ts`, add to `createDiscretionaryItemSchema` and `updateDiscretionaryItemSchema`:

```typescript
linkedAccountId: z.string().nullable().optional(),
```

In `packages/shared/src/schemas/settings.schemas.ts`, inside `updateSettingsSchema`:

```typescript
propertyRatePct: z.number().min(0).max(100).optional(),
vehicleRatePct: z.number().min(-100).max(100).optional(),
otherAssetRatePct: z.number().min(-100).max(100).optional(),
```

In `packages/shared/src/schemas/forecast.schemas.ts`, extend the projection schema:

```typescript
export const MonthlyContributionsByScopeSchema = z.object({
  netWorth: z.number(),
  retirement: z.number(),
});
export type MonthlyContributionsByScope = z.infer<typeof MonthlyContributionsByScopeSchema>;

export const ForecastProjectionSchema = z.object({
  netWorth: z.array(NetWorthPointSchema),
  surplus: z.array(SurplusPointSchema),
  retirement: z.array(RetirementMemberProjectionSchema),
  monthlyContributionsByScope: MonthlyContributionsByScopeSchema,
});
```

In `packages/shared/src/schemas/export-import.schemas.ts` line 111 — remove the `monthlyContribution: z.number(),` field from the account export shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test contribution-link.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/
git commit -m "feat(shared): add linkedAccountId, asset rate defaults, forecast contributions scope"
```

---

### Task 3: Seed defaults — lock Savings subcategory for new households

**Files:**

- Modify: `apps/backend/src/services/subcategory.service.ts:8-31`
- Test: `apps/backend/src/services/subcategory.service.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `subcategory.service.test.ts`:

```typescript
it("seeds the Discretionary 'Savings' subcategory as locked", async () => {
  const hh = await createTestHousehold();
  await subcategoryService.seedDefaults(hh.id);
  const savings = await prisma.subcategory.findFirst({
    where: { householdId: hh.id, tier: "discretionary", name: "Savings" },
  });
  expect(savings?.isLocked).toBe(true);
});
```

- [ ] **Step 2: Run test**

Run: `cd apps/backend && bun scripts/run-tests.ts subcategory.service`
Expected: FAIL — `expect(false).toBe(true)`

- [ ] **Step 3: Patch `DEFAULT_SUBCATEGORIES.discretionary` in `subcategory.service.ts`** — change `{ name: "Savings", sortOrder: 4 }` to `{ name: "Savings", sortOrder: 4, isLocked: true }`.

- [ ] **Step 4: Run test**

Run: `cd apps/backend && bun scripts/run-tests.ts subcategory.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/subcategory.service.ts apps/backend/src/services/subcategory.service.test.ts
git commit -m "feat(subcategory): seed discretionary Savings as locked"
```

---

### Task 4: Waterfall service — validate and accept linkedAccountId on create/update; auto-null on subcategory move

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts` — `createDiscretionary`, `updateDiscretionary`, and a new `validateLinkedAccount` helper
- Test: `apps/backend/src/services/waterfall.discretionary-link.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/waterfall.discretionary-link.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { prisma } from "../config/database.js";
import { waterfallService } from "./waterfall.service.js";
import { createTestHousehold } from "../test/helpers/test-db.js";

describe("waterfallService — linkedAccountId", () => {
  let householdId: string;
  let savingsSubId: string;
  let otherSubId: string;
  let savingsAccountId: string;
  let currentAccountId: string;

  beforeEach(async () => {
    const hh = await createTestHousehold();
    householdId = hh.id;
    savingsSubId = (
      await prisma.subcategory.create({
        data: { householdId, tier: "discretionary", name: "Savings", sortOrder: 0, isLocked: true },
      })
    ).id;
    otherSubId = (
      await prisma.subcategory.create({
        data: { householdId, tier: "discretionary", name: "Other", sortOrder: 1 },
      })
    ).id;
    savingsAccountId = (
      await prisma.account.create({
        data: { householdId, name: "ISA", type: "Savings" },
      })
    ).id;
    currentAccountId = (
      await prisma.account.create({
        data: { householdId, name: "Current", type: "Current" },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.household.delete({ where: { id: householdId } });
  });

  it("accepts linkedAccountId when item is in Savings subcategory and account is Savings/S&S/Pension", async () => {
    const item = await waterfallService.createDiscretionary(householdId, {
      name: "ISA top-up",
      amount: 250,
      subcategoryId: savingsSubId,
      spendType: "monthly",
      linkedAccountId: savingsAccountId,
    } as any);
    expect(item.linkedAccountId).toBe(savingsAccountId);
  });

  it("rejects linking when subcategory is not Savings", async () => {
    await expect(
      waterfallService.createDiscretionary(householdId, {
        name: "Not savings",
        amount: 50,
        subcategoryId: otherSubId,
        spendType: "monthly",
        linkedAccountId: savingsAccountId,
      } as any)
    ).rejects.toThrow(/Savings subcategory/);
  });

  it("rejects linking to a Current account", async () => {
    await expect(
      waterfallService.createDiscretionary(householdId, {
        name: "x",
        amount: 10,
        subcategoryId: savingsSubId,
        spendType: "monthly",
        linkedAccountId: currentAccountId,
      } as any)
    ).rejects.toThrow(/Savings, StocksAndShares, or Pension/);
  });

  it("rejects linking to an account in a different household", async () => {
    const otherHh = await createTestHousehold();
    const crossAcc = await prisma.account.create({
      data: { householdId: otherHh.id, name: "Other HH ISA", type: "Savings" },
    });
    await expect(
      waterfallService.createDiscretionary(householdId, {
        name: "x",
        amount: 10,
        subcategoryId: savingsSubId,
        spendType: "monthly",
        linkedAccountId: crossAcc.id,
      } as any)
    ).rejects.toThrow(/not found/i);
  });

  it("rejects linking on a planner-owned item (update)", async () => {
    const plannerItem = await prisma.discretionaryItem.create({
      data: { householdId, subcategoryId: savingsSubId, name: "Gift plan", isPlannerOwned: true },
    });
    await expect(
      waterfallService.updateDiscretionary(householdId, plannerItem.id, {
        linkedAccountId: savingsAccountId,
      } as any)
    ).rejects.toThrow(/planner/i);
  });

  it("auto-nulls linkedAccountId when an item is moved out of Savings", async () => {
    const item = await waterfallService.createDiscretionary(householdId, {
      name: "x",
      amount: 100,
      subcategoryId: savingsSubId,
      spendType: "monthly",
      linkedAccountId: savingsAccountId,
    } as any);
    const updated = await waterfallService.updateDiscretionary(householdId, (item as any).id, {
      subcategoryId: otherSubId,
    } as any);
    expect((updated as any).linkedAccountId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.discretionary-link`
Expected: FAIL — validation not applied

- [ ] **Step 3: Implement validation in `waterfall.service.ts`**

Add a helper near the other helpers (top of file):

```typescript
const LINKABLE_ACCOUNT_TYPES = ["Savings", "StocksAndShares", "Pension"] as const;

async function validateLinkedAccount(
  householdId: string,
  subcategoryId: string,
  linkedAccountId: string,
  opts: { isPlannerOwned?: boolean } = {}
): Promise<void> {
  if (opts.isPlannerOwned) {
    throw new ValidationError("Planner-owned items cannot be linked to an account");
  }
  const subcategory = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, householdId, tier: "discretionary" },
  });
  if (!subcategory || subcategory.name !== "Savings") {
    throw new ValidationError("Only items in the Savings subcategory can be linked to an account");
  }
  const account = await prisma.account.findFirst({
    where: { id: linkedAccountId, householdId },
  });
  if (!account) throw new NotFoundError("Account not found");
  if (!LINKABLE_ACCOUNT_TYPES.includes(account.type as any)) {
    throw new ValidationError(
      "Linked account must be of type Savings, StocksAndShares, or Pension"
    );
  }
}

async function getSavingsSubcategoryId(householdId: string): Promise<string | null> {
  const sub = await prisma.subcategory.findFirst({
    where: { householdId, tier: "discretionary", name: "Savings" },
  });
  return sub?.id ?? null;
}
```

In `createDiscretionary`, before the `audited(...)` / `prisma.discretionaryItem.create` call, if `data.linkedAccountId` is non-null:

```typescript
if (data.linkedAccountId) {
  await validateLinkedAccount(householdId, data.subcategoryId, data.linkedAccountId);
}
```

In `updateDiscretionary`, the existing row is already fetched as `existing`. Determine the effective subcategory for validation, and auto-null on move out of Savings:

```typescript
const savingsSubId = await getSavingsSubcategoryId(householdId);
const targetSubId = data.subcategoryId ?? existing!.subcategoryId;
const leavingSavings =
  data.subcategoryId !== undefined &&
  existing!.subcategoryId === savingsSubId &&
  data.subcategoryId !== savingsSubId;

if (data.linkedAccountId) {
  await validateLinkedAccount(householdId, targetSubId, data.linkedAccountId, {
    isPlannerOwned: existing!.isPlannerOwned,
  });
}

const effectiveData = {
  ...data,
  ...(leavingSavings ? { linkedAccountId: null } : {}),
};
```

And pass `effectiveData` in place of `data` to both the audited and non-audited `tx.discretionaryItem.update` calls.

The `createDiscretionary` whitelist destructure `const { amount, startDate, endDate, ...itemData } = data` must **not** strip `linkedAccountId` — verify it isn't accidentally removed.

- [ ] **Step 4: Run test**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.discretionary-link`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/waterfall.service.ts apps/backend/src/services/waterfall.discretionary-link.test.ts
git commit -m "feat(waterfall): validate linkedAccountId on discretionary create/update"
```

---

### Task 5: listDiscretionary — include linkedAccount summary for UI

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts` — `listDiscretionary` and `listSavings`
- Test: extend `waterfall.discretionary-link.test.ts`

- [ ] **Step 1: Append failing test**

```typescript
it("listDiscretionary returns linkedAccount summary { id, name, type } for linked items", async () => {
  const item = await waterfallService.createDiscretionary(householdId, {
    name: "ISA top-up",
    amount: 250,
    subcategoryId: savingsSubId,
    spendType: "monthly",
    linkedAccountId: savingsAccountId,
  } as any);
  const items = await waterfallService.listDiscretionary(householdId);
  const found = items.find((i: any) => i.id === (item as any).id);
  expect(found?.linkedAccount).toEqual({
    id: savingsAccountId,
    name: "ISA",
    type: "Savings",
  });
});
```

- [ ] **Step 2: Run — expected FAIL** (`linkedAccount` undefined).

- [ ] **Step 3: Update `listDiscretionary` and `listSavings`** — include the `linkedAccount` relation in the `findMany` and map its result:

```typescript
async listDiscretionary(householdId: string) {
  const items = await prisma.discretionaryItem.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
    include: { linkedAccount: { select: { id: true, name: true, type: true } } },
  });
  return enrichItemsWithPeriods(items, "discretionary_item");
},
```

Apply the same `include` block to `listDiscretionaryStale` and `listSavings`.

- [ ] **Step 4: Run — expected PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/waterfall.service.ts apps/backend/src/services/waterfall.discretionary-link.test.ts
git commit -m "feat(waterfall): expose linkedAccount summary on discretionary list"
```

---

### Task 6: Assets service — derive Account.monthlyContribution + linkedItems at read

**Files:**

- Modify: `apps/backend/src/services/assets.service.ts` — `listAccountsByType` (plus a new shared helper for derivation)
- Test: `apps/backend/src/services/assets.service.test.ts` (extend)

- [ ] **Step 1: Append failing test**

```typescript
it("listAccountsByType returns derived monthlyContribution as sum of linked items normalised to monthly", async () => {
  const hh = await createTestHousehold();
  const savingsSub = await prisma.subcategory.create({
    data: {
      householdId: hh.id,
      tier: "discretionary",
      name: "Savings",
      sortOrder: 0,
      isLocked: true,
    },
  });
  const acc = await prisma.account.create({
    data: { householdId: hh.id, name: "ISA", type: "Savings" },
  });

  // £200/mo + £1,200/yr (=£100/mo) + £60/week (=£260/mo) + £150 one-off (=£0) → £560/mo
  const mk = async (
    name: string,
    amount: number,
    spendType: "monthly" | "annual" | "weekly" | "one_off"
  ) => {
    const item = await prisma.discretionaryItem.create({
      data: {
        householdId: hh.id,
        subcategoryId: savingsSub.id,
        name,
        spendType,
        linkedAccountId: acc.id,
      },
    });
    await prisma.itemAmountPeriod.create({
      data: {
        itemType: "discretionary_item",
        itemId: item.id,
        amount,
        startDate: new Date(Date.now() - 86400000),
        endDate: null,
      },
    });
  };
  await mk("m", 200, "monthly");
  await mk("y", 1200, "annual");
  await mk("w", 60, "weekly");
  await mk("o", 150, "one_off");

  const [row] = await assetsService.listAccountsByType(hh.id, "Savings");
  expect(row!.monthlyContribution).toBeCloseTo(200 + 100 + (60 * 52) / 12, 2);
  expect(row!.linkedItems.map((i: any) => i.name).sort()).toEqual(["m", "w", "y"]);
});
```

- [ ] **Step 2: Run — expected FAIL** (field missing).

- [ ] **Step 3: Rewrite `listAccountsByType`**

```typescript
async listAccountsByType(householdId: string, type: AccountType) {
  const accounts = await prisma.account.findMany({
    where: { householdId, type },
    include: {
      balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      linkedItems: {
        where: { isPlannerOwned: false },
        select: { id: true, name: true, spendType: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Load current period amounts for the linked items in one query
  const itemIds = accounts.flatMap((a) => a.linkedItems.map((i) => i.id));
  const now = new Date();
  const periods =
    itemIds.length === 0
      ? []
      : await prisma.itemAmountPeriod.findMany({
          where: {
            itemType: "discretionary_item" as any,
            itemId: { in: itemIds },
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gt: now } }],
          },
        });
  const amountByItem = new Map<string, number>();
  for (const p of periods) amountByItem.set(p.itemId, p.amount);

  return accounts.map((a) => {
    const latest = getLatestBalance(a.balances);
    const linkedItems = a.linkedItems.map((it) => ({
      id: it.id,
      name: it.name,
      spendType: it.spendType,
      normalisedMonthlyAmount: toMonthlyAmount(amountByItem.get(it.id) ?? 0, it.spendType as any),
    }));
    const monthlyContribution = linkedItems.reduce(
      (s, i) => s + i.normalisedMonthlyAmount,
      0
    );
    return {
      ...a,
      currentBalance: latest?.value ?? 0,
      currentBalanceDate: latest?.date ?? null,
      monthlyContribution,
      linkedItems,
    };
  });
},
```

Import at the top of the file:

```typescript
import { toMonthlyAmount } from "@finplan/shared";
```

Note: `DiscretionaryItem` has no `memberId` column — the popover's "member" affordance is dropped (see Task 12). The `isPlannerOwned: false` filter already excludes Gifts-managed items.

- [ ] **Step 4: Run — expected PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/assets.service.ts apps/backend/src/services/assets.service.test.ts
git commit -m "feat(assets): derive monthlyContribution from linked discretionary items"
```

---

### Task 7: Assets service — deleteAccount transactionally nulls linkedAccountId on linked items

**Files:**

- Modify: `apps/backend/src/services/assets.service.ts` — `deleteAccount`
- Test: extend `assets.service.test.ts`

- [ ] **Step 1: Failing test**

```typescript
it("deleteAccount nulls linkedAccountId on every affected discretionary item", async () => {
  const hh = await createTestHousehold();
  const sub = await prisma.subcategory.create({
    data: {
      householdId: hh.id,
      tier: "discretionary",
      name: "Savings",
      sortOrder: 0,
      isLocked: true,
    },
  });
  const acc = await prisma.account.create({
    data: { householdId: hh.id, name: "ISA", type: "Savings" },
  });
  const it = await prisma.discretionaryItem.create({
    data: {
      householdId: hh.id,
      subcategoryId: sub.id,
      name: "ISA top-up",
      linkedAccountId: acc.id,
    },
  });
  await assetsService.deleteAccount(hh.id, acc.id, { userId: "u", ip: null, userAgent: null });
  const reloaded = await prisma.discretionaryItem.findUnique({ where: { id: it.id } });
  expect(reloaded).not.toBeNull();
  expect(reloaded?.linkedAccountId).toBeNull();
});
```

- [ ] **Step 2: Run — expected PASS already** (schema's `onDelete: SetNull` handles this), confirming the schema FK behaviour from Task 1 is wired correctly. If it fails, debug the relation definition.

- [ ] **Step 3 (no-op):** The `onDelete: SetNull` FK already handles this — no service-layer change required. Add a brief code comment in `deleteAccount` pointing at the FK behaviour:

```typescript
// NOTE: DiscretionaryItem.linkedAccountId has ON DELETE SET NULL — linked items
// are preserved and unlinked automatically by the FK constraint.
```

- [ ] **Step 4: Run — expected PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/assets.service.ts apps/backend/src/services/assets.service.test.ts
git commit -m "test(assets): verify deleteAccount unlinks discretionary items"
```

---

### Task 8: Forecast service — derived contributions + monthlyContributionsByScope

**Files:**

- Modify: `apps/backend/src/services/forecast.service.ts` — replace `acc.monthlyContribution` reads with derived values; add `monthlyContributionsByScope` to the return
- Modify: `apps/backend/src/services/forecast.service.test.ts` — update mock fixtures (no `monthlyContribution`, new `linkedItems`)
- Also update: asset-side fallback — `Asset.growthRatePct` null → `settings.<type>RatePct`

- [ ] **Step 1: Failing test (extend `forecast.service.test.ts`)**

```typescript
it("returns monthlyContributionsByScope: netWorth = Savings+S&S contribs, retirement adds Pension", async () => {
  // see existing fixtures; extend mockAccount to carry linkedItems = [{ amount, spendType }]
  // stub: Savings acc contributes £200/mo, S&S contributes £100/mo, Pension £300/mo
  // expected: netWorth = 300, retirement = 600
  const proj = await forecastService.getProjections(HOUSEHOLD_ID, 10);
  expect(proj.monthlyContributionsByScope).toEqual({ netWorth: 300, retirement: 600 });
});

it("projects a null-growth Property asset using HouseholdSettings.propertyRatePct fallback", async () => {
  // seed: 1 Property asset growthRatePct=null, balance=100_000, settings.propertyRatePct=3.5
  const proj = await forecastService.getProjections(HOUSEHOLD_ID, 10);
  // year 10 nominal: 100000 * 1.035^10 ≈ 141060
  expect(proj.netWorth.at(-1)!.nominal).toBeCloseTo(141060, -2);
});
```

- [ ] **Step 2: Run — expected FAIL**.

- [ ] **Step 3: Update `forecast.service.ts`**

At the top, alongside `accountEffectiveRate`, add an asset rate helper:

```typescript
function assetEffectiveRate(
  asset: { growthRatePct: number | null; type: "Property" | "Vehicle" | "Other" },
  settings: { propertyRatePct: number; vehicleRatePct: number; otherAssetRatePct: number }
): number {
  if (asset.growthRatePct != null) return asset.growthRatePct / 100;
  switch (asset.type) {
    case "Property":
      return settings.propertyRatePct / 100;
    case "Vehicle":
      return settings.vehicleRatePct / 100;
    case "Other":
      return settings.otherAssetRatePct / 100;
  }
}
```

Replace the old `assetEffectiveRate(asset)` call site accordingly and pass `settings` through `sumAssetSeries` (add `settings` param).

In `getProjections`:

- Extend the `settings` object constructed at ~line 122 with `propertyRatePct`, `vehicleRatePct`, `otherAssetRatePct` (falling back to `3.5`, `-15`, `0` respectively).
- Replace the `balanceInclude` for accounts with one that additionally includes `linkedItems` and a second pass to load current period amounts (mirror the Task 6 pattern — extract to a shared helper `deriveAccountContributions(householdId): Promise<Map<accountId, number>>` in a new file `apps/backend/src/services/contribution.service.ts` and import it here and in `assets.service.ts` to avoid duplication).
- In `toProjectableAccount`, replace `monthlyContribution: acc.monthlyContribution` with `monthlyContribution: contributionsByAccount.get(acc.id) ?? 0`.
- Before `return`, compute:

```typescript
const byAccount = contributionsByAccount; // Map<string, number>
const sumForTypes = (types: string[]) =>
  accounts
    .filter((a) => types.includes(a.type))
    .reduce((s, a) => s + (byAccount.get(a.id) ?? 0), 0);

const monthlyContributionsByScope = {
  netWorth: sumForTypes(["Savings", "StocksAndShares"]),
  retirement: sumForTypes(["Savings", "StocksAndShares", "Pension"]),
};

return { netWorth, surplus, retirement, monthlyContributionsByScope };
```

- [ ] **Step 4: Run — expected PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/forecast.service.ts apps/backend/src/services/forecast.service.test.ts apps/backend/src/services/contribution.service.ts
git commit -m "feat(forecast): derive contributions from waterfall + asset rate fallback"
```

---

### Task 9: Drop Account.monthlyContribution from export / import / fixtures

**Files:**

- Modify: `apps/backend/src/services/export.service.ts:257` — remove the field from the export row
- Modify: `apps/backend/src/services/import.service.ts:469` — remove from the create-data
- Modify: `apps/backend/src/test/helpers/test-db.ts`, `apps/backend/src/test/fixtures/index.ts` — remove `monthlyContribution`
- Modify: `apps/backend/src/services/export-import.roundtrip.test.ts` — drop any assertions on the removed field; if the test seeds `monthlyContribution`, remove it
- Modify: `packages/shared/src/schemas/export-import.schemas.ts` (already done in Task 2)

- [ ] **Step 1: Enumerate every remaining reference**

Run these two greps and treat every file they list (outside docs/ and the `/migrations/` directory) as an additional Modify target for this task — the list above is a starting point, not exhaustive:

```bash
grep -rn "monthlyContribution" apps/ packages/ | grep -v docs/ | grep -v /migrations/
grep -rn "monthlyContribution" apps/backend/src/test/
```

Then run the roundtrip test to confirm the breakage:

Run: `cd apps/backend && bun scripts/run-tests.ts export-import.roundtrip`
Expected: FAIL (type error after Task 1 schema change)

- [ ] **Step 2: Remove the field from every call site surfaced above** — `export.service.ts`, `import.service.ts`, `export-import.roundtrip.test.ts`, `forecast.service.test.ts`, `assets.service.test.ts`, any test helper / fixture file, and the import/export shared schema (already done in Task 2).

- [ ] **Step 3: Re-run**

Run: `cd apps/backend && bun scripts/run-tests.ts export-import`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/export.service.ts apps/backend/src/services/import.service.ts apps/backend/src/services/export-import.roundtrip.test.ts apps/backend/src/test/
git commit -m "refactor(import-export): remove Account.monthlyContribution"
```

---

### Task 10: Frontend — types and services for linked contributions + monthlyContributionsByScope

**Files:**

- Modify: `apps/frontend/src/services/assets.service.ts` — extend `AccountItem` with `monthlyContribution: number` and `linkedItems: LinkedItemSummary[]`
- Modify: `apps/frontend/src/services/forecast.service.ts` — extend response type with `monthlyContributionsByScope`
- Modify: `apps/frontend/src/services/waterfall.service.ts` — extend discretionary item type with `linkedAccountId` and `linkedAccount: { id; name; type } | null`
- Modify: `apps/frontend/src/hooks/useWaterfall.ts` — on mutations for discretionary, account, and settings, invalidate `["forecast"]` and `["assets"]` in addition to existing keys

- [ ] **Step 1: Failing test** — extend `apps/frontend/src/hooks/useForecast.test.tsx`:

```typescript
it("exposes monthlyContributionsByScope on the forecast response", async () => {
  const { result } = renderHook(() => useForecast(10), { wrapper });
  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(result.current.data!.monthlyContributionsByScope).toEqual({
    netWorth: 300,
    retirement: 600,
  });
});
```

MSW handler for `/api/forecast` must return the new field.

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Add fields to frontend types** (both `AccountItem` and the forecast response type). Add to `apps/frontend/src/services/assets.service.ts` above `AccountItem`:

```typescript
export interface LinkedItemSummary {
  id: string;
  name: string;
  spendType: "monthly" | "weekly" | "quarterly" | "annual" | "yearly" | "one_off";
  normalisedMonthlyAmount: number;
}
```

Add to `AccountItem`:

```typescript
  monthlyContribution: number;
  linkedItems: LinkedItemSummary[];
```

Add to `forecast.service.ts` response type:

```typescript
monthlyContributionsByScope: {
  netWorth: number;
  retirement: number;
}
```

In `useWaterfall.ts`, wherever the discretionary mutations invalidate `["waterfall", ...]`, add `qc.invalidateQueries({ queryKey: ["forecast"] })` and `qc.invalidateQueries({ queryKey: ["assets"] })`. Do the same in the settings update mutation and the assets (account create/update/delete/balance) mutations.

- [ ] **Step 4: Run — PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/ apps/frontend/src/hooks/
git commit -m "feat(frontend-types): linked contributions + forecast scope, broaden invalidations"
```

---

### Task 11: Frontend — `LinkedAccountPicker` + wire into `ItemForm` for Savings discretionary

**Files:**

- Create: `apps/frontend/src/components/tier/LinkedAccountPicker.tsx`
- Create: `apps/frontend/src/components/tier/LinkedAccountPicker.test.tsx`
- Modify: `apps/frontend/src/components/tier/ItemForm.tsx` — add optional prop `linkedAccount` state when tier=discretionary and current subcategory.name === "Savings" and `item.isPlannerOwned` is false; surface in `onSave` payload
- Modify: `apps/frontend/src/components/tier/TierPage.tsx` — pass the relevant props and hook up invalidation

- [ ] **Step 1: Failing component test** (Testing Library + MSW, the project's pattern):

```tsx
// LinkedAccountPicker.test.tsx
it("lists Savings / StocksAndShares / Pension accounts and calls onChange with the selected id", async () => {
  /* ... */
});
it("renders a 'None' option that emits null", async () => {
  /* ... */
});
```

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Implement `LinkedAccountPicker`** — fetches via `useQuery(["assets","accounts","linkable"], ...)` the union of the three account types (parallel calls). Renders a shadcn `<Select>` with one item per account; "None" option (`value=""`) clears the link. On value `""` it calls `onChange(null)`.

In `ItemForm.tsx`, add the field conditional on tier === "discretionary", the active subcategory.name === "Savings", and `item?.isPlannerOwned !== true`. Plumb value through existing form state; include in `onSave` payload as `linkedAccountId`.

Extend the `ItemData` interface in `ItemForm.tsx` with an optional `linkedAccountId?: string | null`.

In `TierPage.tsx` / `useWaterfall.ts`, pass `linkedAccountId` in the create/update mutation payloads and on edit initialise from `item.linkedAccountId`.

- [ ] **Step 4: Run tests + manual check**.

Run: `cd apps/frontend && bun test LinkedAccountPicker`

Run the app locally and verify: adding a Discretionary item under Savings shows the dropdown; changing the subcategory away from Savings hides it; a planner-owned gifts item never shows it.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/LinkedAccountPicker.tsx apps/frontend/src/components/tier/LinkedAccountPicker.test.tsx apps/frontend/src/components/tier/ItemForm.tsx
git commit -m "feat(discretionary-form): link to account dropdown for Savings items"
```

---

### Task 12: Frontend — `LinkedContributionsPopover` + subtitle on `AssetAccountRow`

**Files:**

- Create: `apps/frontend/src/components/assets/LinkedContributionsPopover.tsx`
- Create: `apps/frontend/src/components/assets/LinkedContributionsPopover.test.tsx`
- Modify: `apps/frontend/src/components/assets/AssetAccountRow.tsx` — when `itemKind === "account"` and `item.monthlyContribution > 0`, render a subtitle row below the type/member line showing `<link icon> £<total> /mo from waterfall`; make it a button that opens the popover

- [ ] **Step 1: Failing tests**

```tsx
it("shows '£X /mo from waterfall' subtitle when account has linked contributions", () => {
  /* ... */
});
it("does not show the subtitle when monthlyContribution is zero", () => {
  /* ... */
});
it("opens a popover listing each linked item with 'Edit in waterfall →' link", () => {
  /* ... */
});
```

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Implement**

`LinkedContributionsPopover` renders a shadcn Popover: each row shows `item.name` and formatted `£normalisedMonthlyAmount /mo`. Footer contains a `<Link to={"/overview?selectedItemId=" + item.id}>Edit in waterfall →</Link>` (matches the existing "Increase savings ▸" pattern — check `OverviewPage.tsx` for the exact query param name). Note: `DiscretionaryItem` has no `memberId` column today, so the "member or Household" affordance from the spec is omitted for V1 and can be added once item-level ownership lands.

In `AssetAccountRow.tsx`, inside the collapsed header after the `metadata` block (before the right-side amount/date) — only for `itemKind === "account"`:

```tsx
{
  item.monthlyContribution > 0 && (
    <LinkedContributionsPopoverTrigger
      account={item}
      aria-label={`View waterfall contributions linked to ${item.name}`}
    />
  );
}
```

The trigger renders the subtitle `<icon> £… /mo from waterfall` styled `text-[11px] text-text-tertiary` in the same row as the metadata (use the existing Savings ↔ Waterfall Link Icon).

- [ ] **Step 4: Run — PASS + manual**.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/assets/LinkedContributionsPopover.tsx apps/frontend/src/components/assets/LinkedContributionsPopover.test.tsx apps/frontend/src/components/assets/AssetAccountRow.tsx
git commit -m "feat(assets): show linked contributions subtitle + popover on account rows"
```

---

### Task 13: Frontend — `GrowthRatesSection` gains Property / Vehicle / Other asset defaults

**Files:**

- Modify: `apps/frontend/src/components/settings/GrowthRatesSection.tsx`
- Modify: `apps/frontend/src/hooks/useSettings.ts` — extend `Settings` type

- [ ] **Step 1: Failing test**

```tsx
it("renders Property / Vehicle / Other asset default rate fields and saves", async () => {
  /* ... */
});
it("Vehicle field accepts negative values", async () => {
  /* ... */
});
```

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Extend `GrowthRatesSection.tsx`** — add the three fields to `RateValues`, `LABELS`, and `DEFAULTS` (3.5 / −15 / 0). For `vehicleRatePct` and `otherAssetRatePct`, the `Input`'s `min` must be `-100`. Split the grid so account-class defaults group in one row and asset-class in another, with a divider label ("Account class defaults" / "Asset class defaults").

- [ ] **Step 4: Run — PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/GrowthRatesSection.tsx apps/frontend/src/hooks/useSettings.ts
git commit -m "feat(settings): asset-class default growth rates in Growth rates section"
```

---

### Task 14: Frontend — `NetWorthChart` / `RetirementChart` gain `Monthly contributions: £X` stat row, scoped to active view

**Files:**

- Modify: `apps/frontend/src/components/forecast/NetWorthChart.tsx` — stat row gains a fourth tile, sourced from a new `monthlyContribution` prop
- Modify: `apps/frontend/src/components/forecast/RetirementChart.tsx` — ditto (retirement scope)
- Modify: `apps/frontend/src/components/forecast/GrowthSectionPanel.tsx` — pass the scope values through from the forecast response

- [ ] **Step 1: Failing test** (extend existing chart tests):

```tsx
it("NetWorthChart shows 'Monthly contributions: £500'", () => {
  /* ... */
});
it("RetirementChart shows 'Monthly contributions: £700'", () => {
  /* ... */
});
it("shows £0 when no contributions are linked", () => {
  /* ... */
});
```

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Implement**

Add prop `monthlyContribution: number` to both chart components. In the stat row (after "Real Terms"), render a tile:

```tsx
<div>
  <span className="text-xs text-text-tertiary">Monthly contributions</span>
  <p className="font-numeric text-sm text-text-secondary tabular-nums">
    {formatCurrency(monthlyContribution, showPence)}
  </p>
</div>
```

Render the row even when contribution is zero — the spec requires `£0` rather than hiding.

In `GrowthSectionPanel.tsx`:

```tsx
<NetWorthChart
  data={data?.netWorth ?? []}
  retirementMarkers={retirementMarkers}
  monthlyContribution={data?.monthlyContributionsByScope.netWorth ?? 0}
/>
<RetirementChart
  members={data?.retirement ?? []}
  horizonEndYear={horizonEndYear}
  monthlyContribution={data?.monthlyContributionsByScope.retirement ?? 0}
/>
```

- [ ] **Step 4: Run — PASS + manual verify**.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/forecast/
git commit -m "feat(forecast): show monthly contributions stat on Growth charts"
```

---

## Testing

### Backend Tests

- [ ] Service: `waterfallService.createDiscretionary` accepts `linkedAccountId` only in the Savings subcategory
- [ ] Service: rejects linking to `Current` or `Other` account types
- [ ] Service: rejects linking for `isPlannerOwned: true` items
- [ ] Service: rejects cross-household links (surfaced as `NotFoundError`)
- [ ] Service: `updateDiscretionary` auto-nulls `linkedAccountId` when an item is moved out of Savings
- [ ] Service: `assetsService.listAccountsByType` returns derived `monthlyContribution` summed across linked items and normalised to monthly per frequency
- [ ] Service: `deleteAccount` preserves linked items and nulls their `linkedAccountId` (FK `ON DELETE SET NULL`)
- [ ] Service: `forecastService.getProjections` returns `monthlyContributionsByScope` with the correct scope per account class
- [ ] Service: null-growth Property asset projects with `settings.propertyRatePct`
- [ ] Service: seeded Savings subcategory is `isLocked: true` for new households; migration backfills it for existing households
- [ ] Endpoint: `GET /api/assets/accounts/Savings` includes `monthlyContribution` and `linkedItems`
- [ ] Endpoint: `PATCH /api/settings` accepts the three new asset rate fields
- [ ] Endpoint: `GET /api/forecast?horizonYears=10` returns `monthlyContributionsByScope`
- [ ] Import/Export roundtrip still passes after removing `monthlyContribution`
- [ ] Locked Savings subcategory cannot be renamed or deleted (reuse existing Gifts assertions, now also on Savings)

### Frontend Tests

- [ ] `LinkedAccountPicker` lists only Savings/S&S/Pension accounts
- [ ] `ItemForm` shows the picker only when subcategory is Savings and item is not planner-owned
- [ ] `AssetAccountRow` shows the waterfall subtitle only when `monthlyContribution > 0`
- [ ] `LinkedContributionsPopover` lists each linked item with name, monthly amount, and member
- [ ] `GrowthRatesSection` renders and saves all eight rate fields (5 existing + 3 new)
- [ ] `NetWorthChart` / `RetirementChart` display `Monthly contributions` stat including `£0`
- [ ] TanStack Query invalidation: editing a linked discretionary item refreshes both the Assets page and the Forecast page without a manual refresh

### Key Scenarios

- [ ] Happy path: create a Discretionary "Salary savings" item (monthly, £300) in Savings, link it to an ISA account → ISA row shows `£300 /mo from waterfall`; Growth chart's Net worth stat row shows `Monthly contributions: £300`
- [ ] Frequency normalisation: annual £1,200 + weekly £60 + monthly £200 + one-off £150 in the same account → `£560/mo` (one-off excluded)
- [ ] Subcategory move: editing a linked item out of Savings auto-nulls the link; Assets page reflects the lower contribution
- [ ] Account delete: deleting the ISA preserves the items and the Discretionary tier's total; their link field is now null
- [ ] Settings: bumping `propertyRatePct` 3.5 → 5 re-projects the forecast for null-rate Property assets immediately (cache invalidation)
- [ ] Locked subcategory: Savings cannot be renamed or deleted in `SubcategoryManager`

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts waterfall` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts assets` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts forecast` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts export-import` passes
- [ ] Manual end-to-end: (a) log in, (b) Settings → bump Property default, (c) Assets → add a Property with null growth, verify forecast reflects bump, (d) Discretionary → add item in Savings, link to Savings account, verify Assets page subtitle and Growth chart stat, (e) delete the account, verify items persist with nulled link

## Post-conditions

- [ ] Growth chart reflects real contributions per-household; previous under-projection bug closed
- [ ] One source of truth for `Account.monthlyContribution` (derived) — no risk of drift between stored and actual
- [ ] Locked Savings subcategory guarantees the link model cannot be broken by a subcategory rename/delete
- [ ] Unblocks the future **Liabilities** feature, which will extend the same link model from Accounts to Assets (mortgage overpayment → Property equity)
