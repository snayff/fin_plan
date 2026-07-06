---
feature: assets
spec: docs/4. planning/assets/assets-spec.md
creation_date: 2026-03-30
status: implemented
category: overview
---

# Assets Implementation Plan

> **For Claude:** Use `/execute-plan assets` to implement this plan task-by-task.

**Goal:** Replace legacy WealthAccount system with a clean Assets + Accounts feature supporting point-in-time balance history, member assignment, growth rate overrides, and staleness tracking.
**Spec:** `docs/4. planning/assets/assets-spec.md`
**Architecture:** Two new Prisma models (Asset, Account) each with append-only balance history tables (AssetBalance, AccountBalance). A single backend route module (`assets.routes.ts`) covers all asset and account operations. Frontend uses a TwoPanelLayout matching the existing income/committed/discretionary pattern.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind

**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: yes

---

## Pre-conditions

- Legacy wealth code exists and must be removed before migration
- `docs/4. planning/assets/assets-spec.md` is approved
- Docker dev environment is running (`bun run start`)

---

## Tasks

### Task 1: Remove legacy wealth code

**Files:**

- Delete: `apps/backend/src/services/wealth.service.ts`
- Delete: `apps/backend/src/services/wealth.service.test.ts`
- Delete: `apps/backend/src/routes/wealth.routes.ts`
- Delete: `apps/backend/src/routes/wealth.routes.test.ts`
- Delete: `packages/shared/src/schemas/wealth.schemas.ts`
- Delete: `apps/frontend/src/services/wealth.service.ts`
- Delete: `apps/frontend/src/hooks/useWealth.ts`
- Delete: `apps/frontend/src/components/wealth/` (entire directory)
- Delete: `apps/frontend/src/pages/WealthPage.tsx`
- Modify: `apps/backend/src/server.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/layout/Layout.tsx`

- [ ] **Step 1: Write the failing test**

No test for deletion — skip to implementation.

- [ ] **Step 2: Remove legacy backend files**

```bash
rm apps/backend/src/services/wealth.service.ts
rm apps/backend/src/services/wealth.service.test.ts
rm apps/backend/src/routes/wealth.routes.ts
rm apps/backend/src/routes/wealth.routes.test.ts
rm packages/shared/src/schemas/wealth.schemas.ts
```

- [ ] **Step 3: Remove legacy frontend files**

```bash
rm apps/frontend/src/services/wealth.service.ts
rm apps/frontend/src/hooks/useWealth.ts
rm -rf apps/frontend/src/components/wealth/
rm apps/frontend/src/pages/WealthPage.tsx
```

- [ ] **Step 4: Update server.ts — remove wealthRoutes registration**

In `apps/backend/src/server.ts`, remove the import and registration of `wealthRoutes`:

```typescript
// Remove this import:
// import { wealthRoutes } from "./routes/wealth.routes.js";
// Remove this registration:
// fastify.register(wealthRoutes, { prefix: "/api/wealth" });
```

- [ ] **Step 5: Update shared index.ts — remove wealth exports**

In `packages/shared/src/schemas/index.ts`, remove any lines that export from `./wealth.schemas`.

- [ ] **Step 6: Update App.tsx — remove /wealth route**

In `apps/frontend/src/App.tsx`, remove the import and `<Route path="/wealth" ...>` entry.

- [ ] **Step 7: Update Layout.tsx — remove Wealth nav item**

In `apps/frontend/src/components/layout/Layout.tsx`, remove the Wealth navigation entry.

- [ ] **Step 8: Verify compile**

```bash
bun run type-check
```

Expected: PASS (or only errors in files that reference WealthAccount in Prisma — those will be fixed in Task 2)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(assets): remove legacy wealth code"
```

---

### Task 2: Prisma schema migration

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: migration via `bun run db:migrate`

- [ ] **Step 1: Write the failing test**

No test for migration — proceed directly.

- [ ] **Step 2: Update schema.prisma**

Add to `apps/backend/prisma/schema.prisma`:

```prisma
// Remove from DiscretionaryItem:
//   wealthAccountId  String?
// Remove models: WealthAccount, WealthAccountHistory

// Add to HouseholdSettings:
savingsRatePct    Float?
investmentRatePct Float?
pensionRatePct    Float?
inflationRatePct  Float    @default(2.5)

// Update stalenessThresholds default JSON in HouseholdSettings:
// Old: {"income_source":12,"committed_item":6,"discretionary_item":12,"wealth_account":3}
// New: {"income_source":12,"committed_item":6,"discretionary_item":12,"asset_item":12,"account_item":3}
// Change the @default annotation on stalenessThresholds field

// Add to HouseholdMember:
dateOfBirth     DateTime?
retirementYear  Int?

// New models:
model Asset {
  id           String         @id @default(cuid())
  householdId  String
  memberUserId String?
  name         String
  type         AssetType
  lastReviewedAt DateTime?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  household    Household      @relation(fields: [householdId], references: [id], onDelete: Cascade)
  balances     AssetBalance[]

  @@index([householdId])
}

model AssetBalance {
  id        String   @id @default(cuid())
  assetId   String
  value     Float
  date      DateTime @db.Date
  note      String?
  createdAt DateTime @default(now())
  asset     Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)

  @@index([assetId])
}

model Account {
  id             String           @id @default(cuid())
  householdId    String
  memberUserId   String?
  name           String
  type           AccountType
  growthRatePct  Float?
  lastReviewedAt DateTime?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  household      Household        @relation(fields: [householdId], references: [id], onDelete: Cascade)
  balances       AccountBalance[]

  @@index([householdId])
}

model AccountBalance {
  id        String   @id @default(cuid())
  accountId String
  value     Float
  date      DateTime @db.Date
  note      String?
  createdAt DateTime @default(now())
  account   Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId])
}

enum AssetType {
  Property
  Vehicle
  Other
}

enum AccountType {
  Savings
  Pension
  StocksAndShares
  Other
}
```

- [ ] **Step 3: Run migration**

```bash
bun run db:migrate
```

When prompted, name the migration: `add_assets_accounts_remove_wealth`

- [ ] **Step 4: Backfill stalenessThresholds**

After migration, create a seed/migration script or add to the migration SQL to backfill existing rows:

```sql
UPDATE "HouseholdSettings"
SET "stalenessThresholds" = jsonb_set(
  jsonb_set(
    "stalenessThresholds" - 'wealth_account',
    '{asset_item}', '12'
  ),
  '{account_item}', '3'
)
WHERE "stalenessThresholds" IS NOT NULL;
```

Add this to the migration file in `apps/backend/prisma/migrations/*/migration.sql` before running, or run it manually in `bun run db:studio`.

- [ ] **Step 5: Verify**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat(assets): add Asset/Account models, remove WealthAccount, extend HouseholdSettings/HouseholdMember"
```

---

### Task 3: Update Prisma mock

**Files:**

- Modify: `apps/backend/src/test/mocks/prisma.ts`

- [ ] **Step 1: Write the failing test**

No direct test — mock correctness is validated by subsequent service tests.

- [ ] **Step 2: Update prisma mock**

In `apps/backend/src/test/mocks/prisma.ts`, replace `wealthAccount` and `wealthAccountHistory` mock delegates with `asset`, `assetBalance`, `account`, `accountBalance`:

```typescript
// Remove:
// wealthAccount: { ... }
// wealthAccountHistory: { ... }

// Add:
asset: {
  findMany: mock(() => Promise.resolve([])),
  findUnique: mock(() => Promise.resolve(null)),
  findFirst: mock(() => Promise.resolve(null)),
  create: mock(() => Promise.resolve({})),
  update: mock(() => Promise.resolve({})),
  delete: mock(() => Promise.resolve({})),
  count: mock(() => Promise.resolve(0)),
},
assetBalance: {
  findMany: mock(() => Promise.resolve([])),
  findFirst: mock(() => Promise.resolve(null)),
  create: mock(() => Promise.resolve({})),
  count: mock(() => Promise.resolve(0)),
},
account: {
  findMany: mock(() => Promise.resolve([])),
  findUnique: mock(() => Promise.resolve(null)),
  findFirst: mock(() => Promise.resolve(null)),
  create: mock(() => Promise.resolve({})),
  update: mock(() => Promise.resolve({})),
  delete: mock(() => Promise.resolve({})),
  count: mock(() => Promise.resolve(0)),
},
accountBalance: {
  findMany: mock(() => Promise.resolve([])),
  findFirst: mock(() => Promise.resolve(null)),
  create: mock(() => Promise.resolve({})),
  count: mock(() => Promise.resolve(0)),
},
```

Also update `resetPrismaMocks()` to reset the new delegates and remove the old ones.

- [ ] **Step 3: Verify**

```bash
cd apps/backend && bun scripts/run-tests.ts
```

Expected: PASS (no mock reference errors)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/test/mocks/prisma.ts
git commit -m "test(assets): update Prisma mock — add asset/account delegates, remove wealth"
```

---

### Task 4: Shared Zod schemas

**Files:**

- Create: `packages/shared/src/schemas/assets.schemas.ts`
- Modify: `packages/shared/src/schemas/settings.schemas.ts`
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Write the failing test**

No dedicated test for schemas — validated implicitly by backend route tests.

- [ ] **Step 2: Create assets.schemas.ts**

```typescript
// packages/shared/src/schemas/assets.schemas.ts
import { z } from "zod";

export const assetTypeSchema = z.enum(["Property", "Vehicle", "Other"]);
export const accountTypeSchema = z.enum(["Savings", "Pension", "StocksAndShares", "Other"]);

// Asset CRUD
export const createAssetSchema = z.object({
  name: z.string().min(1).max(100),
  type: assetTypeSchema,
  memberUserId: z.string().nullable().optional(),
});

export const updateAssetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  memberUserId: z.string().nullable().optional(),
});

export const recordAssetBalanceSchema = z.object({
  value: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  note: z.string().max(500).nullable().optional(),
});

// Account CRUD
export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: accountTypeSchema,
  memberUserId: z.string().nullable().optional(),
  growthRatePct: z.number().min(0).max(100).nullable().optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  memberUserId: z.string().nullable().optional(),
  growthRatePct: z.number().min(0).max(100).nullable().optional(),
});

export const recordAccountBalanceSchema = z.object({
  value: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  note: z.string().max(500).nullable().optional(),
});

// Member profile (retirement fields)
export const updateMemberProfileSchema = z.object({
  dateOfBirth: z.string().datetime().nullable().optional(),
  retirementYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export type AssetType = z.infer<typeof assetTypeSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type RecordAssetBalanceInput = z.infer<typeof recordAssetBalanceSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type RecordAccountBalanceInput = z.infer<typeof recordAccountBalanceSchema>;
export type UpdateMemberProfileInput = z.infer<typeof updateMemberProfileSchema>;
```

- [ ] **Step 3: Update settings.schemas.ts — add growth rate fields**

In `packages/shared/src/schemas/settings.schemas.ts`, add growth rate fields to `updateSettingsSchema` and update `stalenessThresholdsSchema`:

```typescript
// Update stalenessThresholdsSchema — replace wealth_account with asset_item and account_item:
export const stalenessThresholdsSchema = z
  .object({
    income_source: z.number().int().positive().optional(),
    committed_item: z.number().int().positive().optional(),
    discretionary_item: z.number().int().positive().optional(),
    asset_item: z.number().int().positive().optional(),
    account_item: z.number().int().positive().optional(),
  })
  .optional();

// Add to updateSettingsSchema:
savingsRatePct: z.number().min(0).max(100).nullable().optional(),
investmentRatePct: z.number().min(0).max(100).nullable().optional(),
pensionRatePct: z.number().min(0).max(100).nullable().optional(),
inflationRatePct: z.number().min(0).max(100).optional(),
```

- [ ] **Step 4: Update index.ts — add assets exports**

In `packages/shared/src/schemas/index.ts`, add:

```typescript
export * from "./assets.schemas.js";
```

- [ ] **Step 5: Verify**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/
git commit -m "feat(assets): add shared Zod schemas for assets, accounts, member profile, settings growth rates"
```

---

### Task 5: Backend assets service + tests

**Files:**

- Create: `apps/backend/src/services/assets.service.ts`
- Create: `apps/backend/src/services/assets.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/assets.service.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma.js";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));
mock.module("./audit.service.js", () => ({
  audited: mock(({ mutation }: { mutation: (tx: typeof prismaMock) => unknown }) =>
    mutation(prismaMock)
  ),
}));

const { assetsService } = await import("./assets.service.js");

const HOUSEHOLD_ID = "hh-1";
const USER_ID = "user-1";
const MEMBER_USER_ID = "member-1";
const ASSET_ID = "asset-1";
const ACCOUNT_ID = "account-1";

const mockCtx = {
  householdId: HOUSEHOLD_ID,
  actorId: USER_ID,
  actorName: "Test User",
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

beforeEach(() => resetPrismaMocks());

// ── Assets ──────────────────────────────────────────────────────────────────

describe("assetsService.getSummary", () => {
  it("returns totals per type for both groups", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      {
        type: "Property",
        balances: [{ value: 100000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
      {
        type: "Vehicle",
        balances: [{ value: 9000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
    ] as any);
    prismaMock.account.findMany.mockResolvedValue([
      {
        type: "Savings",
        balances: [{ value: 5000, date: new Date("2026-01-01"), createdAt: new Date() }],
      },
    ] as any);

    const result = await assetsService.getSummary(HOUSEHOLD_ID);

    expect(result.assetTotals.Property).toBe(100000);
    expect(result.assetTotals.Vehicle).toBe(9000);
    expect(result.assetTotals.Other).toBe(0);
    expect(result.accountTotals.Savings).toBe(5000);
    expect(result.accountTotals.Pension).toBe(0);
    expect(result.grandTotal).toBe(114000);
  });
});

describe("assetsService.listAssetsByType", () => {
  it("returns assets with latest balance for given type", async () => {
    const mockAssets = [
      {
        id: ASSET_ID,
        name: "My House",
        type: "Property",
        householdId: HOUSEHOLD_ID,
        memberUserId: null,
        lastReviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        balances: [
          {
            id: "b1",
            value: 185000,
            date: new Date("2026-03-01"),
            createdAt: new Date(),
            assetId: ASSET_ID,
            note: null,
          },
          {
            id: "b2",
            value: 180000,
            date: new Date("2026-01-01"),
            createdAt: new Date(),
            assetId: ASSET_ID,
            note: null,
          },
        ],
      },
    ];
    prismaMock.asset.findMany.mockResolvedValue(mockAssets as any);

    const result = await assetsService.listAssetsByType(HOUSEHOLD_ID, "Property");

    expect(result).toHaveLength(1);
    expect(result[0]!.currentBalance).toBe(185000);
    expect(result[0]!.currentBalanceDate).toEqual(new Date("2026-03-01"));
  });
});

describe("assetsService.createAsset", () => {
  it("creates asset with valid memberUserId", async () => {
    prismaMock.householdMember.findUnique.mockResolvedValue({
      userId: MEMBER_USER_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.asset.create.mockResolvedValue({
      id: ASSET_ID,
      name: "Test House",
      type: "Property",
      householdId: HOUSEHOLD_ID,
      memberUserId: MEMBER_USER_ID,
      lastReviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await assetsService.createAsset(
      HOUSEHOLD_ID,
      { name: "Test House", type: "Property", memberUserId: MEMBER_USER_ID },
      mockCtx
    );

    expect(result.name).toBe("Test House");
    expect(prismaMock.householdMember.findUnique).toHaveBeenCalledWith({
      where: { householdId_userId: { householdId: HOUSEHOLD_ID, userId: MEMBER_USER_ID } },
    });
  });

  it("throws AuthorizationError when memberUserId is from another household", async () => {
    prismaMock.householdMember.findUnique.mockResolvedValue(null);

    await expect(
      assetsService.createAsset(
        HOUSEHOLD_ID,
        { name: "Test House", type: "Property", memberUserId: "foreign-user" },
        mockCtx
      )
    ).rejects.toThrow("Member not found in household");
  });
});

describe("assetsService.recordAssetBalance", () => {
  it("appends balance entry and updates lastReviewedAt", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.assetBalance.create.mockResolvedValue({
      id: "bal-1",
      assetId: ASSET_ID,
      value: 190000,
      date: new Date("2026-03-30"),
      note: null,
      createdAt: new Date(),
    } as any);
    prismaMock.asset.update.mockResolvedValue({} as any);

    const result = await assetsService.recordAssetBalance(
      HOUSEHOLD_ID,
      ASSET_ID,
      { value: 190000, date: "2026-03-30", note: null },
      mockCtx
    );

    expect(result.value).toBe(190000);
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: expect.objectContaining({ lastReviewedAt: expect.any(Date) }),
    });
  });

  it("throws NotFoundError when asset belongs to another household", async () => {
    prismaMock.asset.findUnique.mockResolvedValue(null);

    await expect(
      assetsService.recordAssetBalance(
        HOUSEHOLD_ID,
        "other-asset",
        { value: 100, date: "2026-03-30" },
        mockCtx
      )
    ).rejects.toThrow();
  });
});

// ── Accounts ─────────────────────────────────────────────────────────────────

describe("assetsService.listAccountsByType", () => {
  it("returns accounts with latest balance for given type", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: ACCOUNT_ID,
        name: "SIPP",
        type: "Pension",
        householdId: HOUSEHOLD_ID,
        memberUserId: USER_ID,
        growthRatePct: null,
        lastReviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        balances: [
          {
            id: "b1",
            value: 42100,
            date: new Date("2026-03-12"),
            createdAt: new Date(),
            accountId: ACCOUNT_ID,
            note: null,
          },
        ],
      },
    ] as any);

    const result = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Pension");

    expect(result[0]!.currentBalance).toBe(42100);
    expect(result[0]!.balances).toHaveLength(1);
  });
});

describe("assetsService.deleteAccount", () => {
  it("deletes account owned by household", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
    } as any);
    prismaMock.account.delete.mockResolvedValue({} as any);

    await assetsService.deleteAccount(HOUSEHOLD_ID, ACCOUNT_ID, mockCtx);

    expect(prismaMock.account.delete).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && bun scripts/run-tests.ts assets.service
```

Expected: FAIL — "Cannot find module './assets.service.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/services/assets.service.ts
import { prisma } from "../config/database.js";
import { audited } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import type {
  AssetType,
  AccountType,
  CreateAssetInput,
  UpdateAssetInput,
  RecordAssetBalanceInput,
  CreateAccountInput,
  UpdateAccountInput,
  RecordAccountBalanceInput,
} from "@finplan/shared";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLatestBalance<T extends { date: Date; createdAt: Date }>(balances: T[]): T | null {
  if (balances.length === 0) return null;
  return balances.reduce((best, curr) => {
    if (curr.date > best.date) return curr;
    if (curr.date < best.date) return best;
    return curr.createdAt > best.createdAt ? curr : best;
  });
}

async function assertAssetOwned(householdId: string, assetId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, householdId: true },
  });
  if (!asset || asset.householdId !== householdId) {
    throw new NotFoundError("Asset not found");
  }
  return asset;
}

async function assertAccountOwned(householdId: string, accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, householdId: true },
  });
  if (!account || account.householdId !== householdId) {
    throw new NotFoundError("Account not found");
  }
  return account;
}

async function assertMemberOwned(householdId: string, memberUserId: string) {
  const member = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: memberUserId } },
  });
  if (!member) {
    throw new ValidationError("Member not found in household");
  }
}

const ASSET_TYPES: AssetType[] = ["Property", "Vehicle", "Other"];
const ACCOUNT_TYPES: AccountType[] = ["Savings", "Pension", "StocksAndShares", "Other"];

// ── Summary ───────────────────────────────────────────────────────────────────

export const assetsService = {
  async getSummary(householdId: string) {
    const [assets, accounts] = await Promise.all([
      prisma.asset.findMany({
        where: { householdId },
        include: { balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } },
      }),
      prisma.account.findMany({
        where: { householdId },
        include: { balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } },
      }),
    ]);

    const assetTotals = Object.fromEntries(
      ASSET_TYPES.map((t) => [
        t,
        assets
          .filter((a) => a.type === t)
          .reduce((sum, a) => sum + (getLatestBalance(a.balances)?.value ?? 0), 0),
      ])
    ) as Record<AssetType, number>;

    const accountTotals = Object.fromEntries(
      ACCOUNT_TYPES.map((t) => [
        t,
        accounts
          .filter((a) => a.type === t)
          .reduce((sum, a) => sum + (getLatestBalance(a.balances)?.value ?? 0), 0),
      ])
    ) as Record<AccountType, number>;

    const grandTotal =
      Object.values(assetTotals).reduce((s, v) => s + v, 0) +
      Object.values(accountTotals).reduce((s, v) => s + v, 0);

    return { assetTotals, accountTotals, grandTotal };
  },

  // ── Assets ──────────────────────────────────────────────────────────────────

  async listAssetsByType(householdId: string, type: AssetType) {
    const assets = await prisma.asset.findMany({
      where: { householdId, type },
      include: {
        balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      },
      orderBy: { createdAt: "asc" },
    });

    return assets.map((a) => {
      const latest = getLatestBalance(a.balances);
      return {
        ...a,
        currentBalance: latest?.value ?? 0,
        currentBalanceDate: latest?.date ?? null,
      };
    });
  },

  async createAsset(householdId: string, data: CreateAssetInput, ctx: ActorCtx) {
    if (data.memberUserId) {
      await assertMemberOwned(householdId, data.memberUserId);
    }
    return audited({
      db: prisma,
      ctx,
      action: "CREATE_ASSET",
      resource: "asset",
      resourceId: "",
      beforeFetch: async () => null,
      mutation: async (tx) =>
        tx.asset.create({
          data: { householdId, ...data },
        }),
    });
  },

  async updateAsset(householdId: string, assetId: string, data: UpdateAssetInput, ctx: ActorCtx) {
    await assertAssetOwned(householdId, assetId);
    if (data.memberUserId) {
      await assertMemberOwned(householdId, data.memberUserId);
    }
    return audited({
      db: prisma,
      ctx,
      action: "UPDATE_ASSET",
      resource: "asset",
      resourceId: assetId,
      beforeFetch: async (tx) =>
        tx.asset.findUnique({ where: { id: assetId } }) as Promise<Record<string, unknown> | null>,
      mutation: async (tx) => tx.asset.update({ where: { id: assetId }, data }),
    });
  },

  async deleteAsset(householdId: string, assetId: string, ctx: ActorCtx) {
    await assertAssetOwned(householdId, assetId);
    return audited({
      db: prisma,
      ctx,
      action: "DELETE_ASSET",
      resource: "asset",
      resourceId: assetId,
      beforeFetch: async (tx) =>
        tx.asset.findUnique({ where: { id: assetId } }) as Promise<Record<string, unknown> | null>,
      mutation: async (tx) => tx.asset.delete({ where: { id: assetId } }),
    });
  },

  async recordAssetBalance(
    householdId: string,
    assetId: string,
    data: RecordAssetBalanceInput,
    ctx: ActorCtx
  ) {
    await assertAssetOwned(householdId, assetId);
    return audited({
      db: prisma,
      ctx,
      action: "RECORD_ASSET_BALANCE",
      resource: "asset-balance",
      resourceId: assetId,
      beforeFetch: async (_tx) => null,
      mutation: async (tx) => {
        const balance = await tx.assetBalance.create({
          data: {
            assetId,
            value: data.value,
            date: new Date(data.date),
            note: data.note ?? null,
          },
        });
        await tx.asset.update({
          where: { id: assetId },
          data: { lastReviewedAt: new Date() },
        });
        return balance;
      },
    });
  },

  async confirmAsset(householdId: string, assetId: string, ctx: ActorCtx) {
    await assertAssetOwned(householdId, assetId);
    return audited({
      db: prisma,
      ctx,
      action: "CONFIRM_ASSET",
      resource: "asset",
      resourceId: assetId,
      beforeFetch: async (_tx) => null,
      mutation: async (tx) =>
        tx.asset.update({
          where: { id: assetId },
          data: { lastReviewedAt: new Date() },
        }),
    });
  },

  // ── Accounts ─────────────────────────────────────────────────────────────────

  async listAccountsByType(householdId: string, type: AccountType) {
    const accounts = await prisma.account.findMany({
      where: { householdId, type },
      include: {
        balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      },
      orderBy: { createdAt: "asc" },
    });

    return accounts.map((a) => {
      const latest = getLatestBalance(a.balances);
      return {
        ...a,
        currentBalance: latest?.value ?? 0,
        currentBalanceDate: latest?.date ?? null,
      };
    });
  },

  async createAccount(householdId: string, data: CreateAccountInput, ctx: ActorCtx) {
    if (data.memberUserId) {
      await assertMemberOwned(householdId, data.memberUserId);
    }
    return audited({
      db: prisma,
      ctx,
      action: "CREATE_ACCOUNT",
      resource: "account",
      resourceId: "",
      beforeFetch: async (_tx) => null,
      mutation: async (tx) => tx.account.create({ data: { householdId, ...data } }),
    });
  },

  async updateAccount(
    householdId: string,
    accountId: string,
    data: UpdateAccountInput,
    ctx: ActorCtx
  ) {
    await assertAccountOwned(householdId, accountId);
    if (data.memberUserId) {
      await assertMemberOwned(householdId, data.memberUserId);
    }
    return audited({
      db: prisma,
      ctx,
      action: "UPDATE_ACCOUNT",
      resource: "account",
      resourceId: accountId,
      beforeFetch: async (tx) =>
        tx.account.findUnique({ where: { id: accountId } }) as Promise<Record<
          string,
          unknown
        > | null>,
      mutation: async (tx) => tx.account.update({ where: { id: accountId }, data }),
    });
  },

  async deleteAccount(householdId: string, accountId: string, ctx: ActorCtx) {
    await assertAccountOwned(householdId, accountId);
    return audited({
      db: prisma,
      ctx,
      action: "DELETE_ACCOUNT",
      resource: "account",
      resourceId: accountId,
      beforeFetch: async (tx) =>
        tx.account.findUnique({ where: { id: accountId } }) as Promise<Record<
          string,
          unknown
        > | null>,
      mutation: async (tx) => tx.account.delete({ where: { id: accountId } }),
    });
  },

  async recordAccountBalance(
    householdId: string,
    accountId: string,
    data: RecordAccountBalanceInput,
    ctx: ActorCtx
  ) {
    await assertAccountOwned(householdId, accountId);
    return audited({
      db: prisma,
      ctx,
      action: "RECORD_ACCOUNT_BALANCE",
      resource: "account-balance",
      resourceId: accountId,
      beforeFetch: async (_tx) => null,
      mutation: async (tx) => {
        const balance = await tx.accountBalance.create({
          data: {
            accountId,
            value: data.value,
            date: new Date(data.date),
            note: data.note ?? null,
          },
        });
        await tx.account.update({
          where: { id: accountId },
          data: { lastReviewedAt: new Date() },
        });
        return balance;
      },
    });
  },

  async confirmAccount(householdId: string, accountId: string, ctx: ActorCtx) {
    await assertAccountOwned(householdId, accountId);
    return audited({
      db: prisma,
      ctx,
      action: "CONFIRM_ACCOUNT",
      resource: "account",
      resourceId: accountId,
      beforeFetch: async (_tx) => null,
      mutation: async (tx) =>
        tx.account.update({
          where: { id: accountId },
          data: { lastReviewedAt: new Date() },
        }),
    });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && bun scripts/run-tests.ts assets.service
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/assets.service.ts apps/backend/src/services/assets.service.test.ts
git commit -m "feat(assets): add assets service with full CRUD, balance recording, and household isolation"
```

---

### Task 6: Backend assets routes + server registration

**Files:**

- Create: `apps/backend/src/routes/assets.routes.ts`
- Create: `apps/backend/src/routes/assets.routes.test.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/assets.routes.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import Fastify from "fastify";
import { buildTestApp } from "../test/helpers/fastify.js";

const mockAssetsService = {
  getSummary: mock(() => Promise.resolve({ assetTotals: {}, accountTotals: {}, grandTotal: 0 })),
  listAssetsByType: mock(() => Promise.resolve([])),
  createAsset: mock(() => Promise.resolve({ id: "a-1", name: "Test", type: "Property" })),
  updateAsset: mock(() => Promise.resolve({ id: "a-1", name: "Updated" })),
  deleteAsset: mock(() => Promise.resolve({ id: "a-1" })),
  recordAssetBalance: mock(() => Promise.resolve({ id: "b-1", value: 100 })),
  confirmAsset: mock(() => Promise.resolve({ id: "a-1" })),
  listAccountsByType: mock(() => Promise.resolve([])),
  createAccount: mock(() => Promise.resolve({ id: "ac-1", name: "SIPP", type: "Pension" })),
  updateAccount: mock(() => Promise.resolve({ id: "ac-1", name: "Updated" })),
  deleteAccount: mock(() => Promise.resolve({ id: "ac-1" })),
  recordAccountBalance: mock(() => Promise.resolve({ id: "b-1", value: 500 })),
  confirmAccount: mock(() => Promise.resolve({ id: "ac-1" })),
};

mock.module("../services/assets.service.js", () => ({ assetsService: mockAssetsService }));
mock.module("../middleware/auth.middleware.js", () => ({
  authMiddleware: mock(async (req: any) => {
    req.user = { userId: "user-1", email: "test@test.com", name: "Test User" };
    req.householdId = "hh-1";
  }),
}));
mock.module("../lib/actor-ctx.js", () => ({
  actorCtx: mock(() => ({
    householdId: "hh-1",
    actorId: "user-1",
    actorName: "Test",
    ipAddress: "127.0.0.1",
    userAgent: "test",
  })),
}));

const { assetsRoutes } = await import("./assets.routes.js");

beforeEach(() => {
  Object.values(mockAssetsService).forEach((m) => (m as ReturnType<typeof mock>).mockClear());
});

describe("GET /api/assets/summary", () => {
  it("returns 200 with summary", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/assets/summary" });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.getSummary).toHaveBeenCalledWith("hh-1");
  });
});

describe("GET /api/assets/assets/:type", () => {
  it("returns 200 with items for type", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/assets/assets/Property" });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.listAssetsByType).toHaveBeenCalledWith("hh-1", "Property");
  });
});

describe("POST /api/assets/assets", () => {
  it("creates asset and returns 201", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/assets/assets",
      payload: { name: "Test", type: "Property" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAssetsService.createAsset).toHaveBeenCalled();
  });
});

describe("POST /api/assets/assets/:assetId/balance", () => {
  it("records balance and returns 201", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/assets/assets/a-1/balance",
      payload: { value: 190000, date: "2026-03-30" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAssetsService.recordAssetBalance).toHaveBeenCalledWith(
      "hh-1",
      "a-1",
      expect.objectContaining({ value: 190000 }),
      expect.any(Object)
    );
  });
});

describe("GET /api/assets/accounts/:type", () => {
  it("returns 200 with accounts for type", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/assets/accounts/Pension" });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.listAccountsByType).toHaveBeenCalledWith("hh-1", "Pension");
  });
});

describe("DELETE /api/assets/assets/:assetId", () => {
  it("deletes asset and returns 200", async () => {
    const app = await buildTestApp();
    app.register(assetsRoutes, { prefix: "/api/assets" });
    await app.ready();

    const res = await app.inject({ method: "DELETE", url: "/api/assets/assets/a-1" });
    expect(res.statusCode).toBe(200);
    expect(mockAssetsService.deleteAsset).toHaveBeenCalledWith("hh-1", "a-1", expect.any(Object));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && bun scripts/run-tests.ts assets.routes
```

Expected: FAIL — "Cannot find module './assets.routes.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/routes/assets.routes.ts
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { assetsService } from "../services/assets.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import {
  createAssetSchema,
  updateAssetSchema,
  recordAssetBalanceSchema,
  createAccountSchema,
  updateAccountSchema,
  recordAccountBalanceSchema,
  assetTypeSchema,
  accountTypeSchema,
} from "@finplan/shared";

export async function assetsRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  // Summary
  fastify.get("/summary", pre, async (req, reply) => {
    const summary = await assetsService.getSummary(req.householdId!);
    return reply.send(summary);
  });

  // ── Assets ────────────────────────────────────────────────────────────────

  fastify.get("/assets/:type", pre, async (req, reply) => {
    const { type } = req.params as { type: string };
    const parsed = assetTypeSchema.parse(type);
    const items = await assetsService.listAssetsByType(req.householdId!, parsed);
    return reply.send(items);
  });

  fastify.post("/assets", pre, async (req, reply) => {
    const data = createAssetSchema.parse(req.body);
    const asset = await assetsService.createAsset(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(asset);
  });

  fastify.patch("/assets/:assetId", pre, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const data = updateAssetSchema.parse(req.body);
    const asset = await assetsService.updateAsset(req.householdId!, assetId, data, actorCtx(req));
    return reply.send(asset);
  });

  fastify.delete("/assets/:assetId", pre, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const result = await assetsService.deleteAsset(req.householdId!, assetId, actorCtx(req));
    return reply.send(result);
  });

  fastify.post("/assets/:assetId/balance", pre, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const data = recordAssetBalanceSchema.parse(req.body);
    const balance = await assetsService.recordAssetBalance(
      req.householdId!,
      assetId,
      data,
      actorCtx(req)
    );
    return reply.status(201).send(balance);
  });

  fastify.post("/assets/:assetId/confirm", pre, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const result = await assetsService.confirmAsset(req.householdId!, assetId, actorCtx(req));
    return reply.send(result);
  });

  // ── Accounts ──────────────────────────────────────────────────────────────

  fastify.get("/accounts/:type", pre, async (req, reply) => {
    const { type } = req.params as { type: string };
    const parsed = accountTypeSchema.parse(type);
    const items = await assetsService.listAccountsByType(req.householdId!, parsed);
    return reply.send(items);
  });

  fastify.post("/accounts", pre, async (req, reply) => {
    const data = createAccountSchema.parse(req.body);
    const account = await assetsService.createAccount(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(account);
  });

  fastify.patch("/accounts/:accountId", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const data = updateAccountSchema.parse(req.body);
    const account = await assetsService.updateAccount(
      req.householdId!,
      accountId,
      data,
      actorCtx(req)
    );
    return reply.send(account);
  });

  fastify.delete("/accounts/:accountId", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const result = await assetsService.deleteAccount(req.householdId!, accountId, actorCtx(req));
    return reply.send(result);
  });

  fastify.post("/accounts/:accountId/balance", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const data = recordAccountBalanceSchema.parse(req.body);
    const balance = await assetsService.recordAccountBalance(
      req.householdId!,
      accountId,
      data,
      actorCtx(req)
    );
    return reply.status(201).send(balance);
  });

  fastify.post("/accounts/:accountId/confirm", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const result = await assetsService.confirmAccount(req.householdId!, accountId, actorCtx(req));
    return reply.send(result);
  });
}
```

In `apps/backend/src/server.ts`, add:

```typescript
import { assetsRoutes } from "./routes/assets.routes.js";
// ...
fastify.register(assetsRoutes, { prefix: "/api/assets" });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && bun scripts/run-tests.ts assets.routes
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/assets.routes.ts apps/backend/src/routes/assets.routes.test.ts apps/backend/src/server.ts
git commit -m "feat(assets): add assets routes and register at /api/assets"
```

---

### Task 7: Settings growth rates + member profile endpoint

**Files:**

- Modify: `apps/backend/src/routes/settings.routes.ts`
- Modify: `apps/backend/src/routes/households.ts`
- Create: `apps/backend/src/routes/households.routes.test.ts` (member profile section only)

- [ ] **Step 1: Write the failing test**

```typescript
// Test: settings PATCH rejects member role for growth rate fields
// Add to a new test section in apps/backend/src/routes/settings.routes.test.ts
// (or create if not exists)

// Test: member profile PATCH
// In apps/backend/src/routes/households.routes.test.ts (add to existing or create):

describe("PATCH /api/households/:householdId/members/:userId/profile", () => {
  it("allows member to update own profile fields", async () => {
    // mocked service returns updated member
    // request with userId matching req.userId → 200
  });

  it("rejects member updating another member's profile", async () => {
    // request with userId != req.userId and role = MEMBER → 403
  });

  it("allows owner to update any member's profile", async () => {
    // request with role = OWNER, different userId → 200
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && bun scripts/run-tests.ts settings.routes
```

Expected: FAIL for growth rate role gate (role check not yet implemented)

- [ ] **Step 3: Update settings.routes.ts — role gate for growth rate fields**

In `apps/backend/src/routes/settings.routes.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { settingsService } from "../services/settings.service.js";
import { updateSettingsSchema } from "@finplan/shared";
import { actorCtx } from "../lib/actor-ctx.js";
import { prisma } from "../config/database.js";
import { assertOwnerOrAdmin } from "../services/household.service.js";

export async function settingsRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  fastify.get("/", pre, async (req, reply) => {
    const settings = await settingsService.getSettings(req.householdId!);
    return reply.send(settings);
  });

  fastify.patch("/", pre, async (req, reply) => {
    const data = updateSettingsSchema.parse(req.body);
    const growthRateFields = [
      "savingsRatePct",
      "investmentRatePct",
      "pensionRatePct",
      "inflationRatePct",
    ] as const;
    const hasGrowthRateChange = growthRateFields.some((f) => f in (req.body as object));
    if (hasGrowthRateChange) {
      const callerId = req.user!.userId;
      const member = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: req.householdId!, userId: callerId } },
        select: { role: true },
      });
      assertOwnerOrAdmin(member?.role ?? "member");
    }
    const settings = await settingsService.updateSettings(req.householdId!, data, actorCtx(req));
    return reply.send(settings);
  });
}
```

- [ ] **Step 4: Add member profile endpoint to households.ts**

In `apps/backend/src/routes/households.ts`, add:

```typescript
import { updateMemberProfileSchema } from "@finplan/shared";
import { prisma } from "../config/database.js";
import { assertOwnerOrAdmin } from "../services/household.service.js";
import { audited } from "../services/audit.service.js";
import { actorCtx } from "../lib/actor-ctx.js";

// Add inside the exported function, alongside existing household routes:
fastify.patch("/:householdId/members/:userId/profile", pre, async (req, reply) => {
  const { householdId, userId } = req.params as { householdId: string; userId: string };
  if (householdId !== req.householdId) {
    throw new AuthorizationError("Forbidden");
  }
  const callerId = req.user!.userId;
  const isSelf = userId === callerId;
  if (!isSelf) {
    const callerMember = await prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: callerId } },
      select: { role: true },
    });
    assertOwnerOrAdmin(callerMember?.role ?? "member");
  }
  const data = updateMemberProfileSchema.parse(req.body);
  const updated = await audited({
    db: prisma,
    ctx: actorCtx(req),
    action: "UPDATE_MEMBER_PROFILE",
    resource: "household-member",
    resourceId: userId,
    beforeFetch: async (tx) =>
      tx.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId } },
      }) as Promise<Record<string, unknown> | null>,
    mutation: async (tx) =>
      tx.householdMember.update({
        where: { householdId_userId: { householdId, userId } },
        data: {
          ...(data.dateOfBirth !== undefined
            ? { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }
            : {}),
          ...(data.retirementYear !== undefined ? { retirementYear: data.retirementYear } : {}),
        },
      }),
  });
  return reply.send(updated);
});
```

- [ ] **Step 5: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts settings.routes
cd apps/backend && bun scripts/run-tests.ts households
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/settings.routes.ts apps/backend/src/routes/households.ts
git commit -m "feat(assets): add growth rate role gate in settings, add member profile PATCH endpoint"
```

---

### Task 8: Frontend assets service + hooks

**Files:**

- Create: `apps/frontend/src/services/assets.service.ts`
- Create: `apps/frontend/src/hooks/useAssets.ts`

- [ ] **Step 1: Write the failing test**

No dedicated unit tests for frontend service/hooks — validated by integration when components render. Skip to implementation.

- [ ] **Step 2: Create assets.service.ts**

```typescript
// apps/frontend/src/services/assets.service.ts
import { apiClient } from "../lib/api.js";
import type {
  AssetType,
  AccountType,
  CreateAssetInput,
  UpdateAssetInput,
  RecordAssetBalanceInput,
  CreateAccountInput,
  UpdateAccountInput,
  RecordAccountBalanceInput,
} from "@finplan/shared";

export interface AssetItem {
  id: string;
  name: string;
  type: AssetType;
  householdId: string;
  memberUserId: string | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentBalance: number;
  currentBalanceDate: string | null;
  balances: Array<{
    id: string;
    value: number;
    date: string;
    note: string | null;
    createdAt: string;
  }>;
}

export interface AccountItem {
  id: string;
  name: string;
  type: AccountType;
  householdId: string;
  memberUserId: string | null;
  growthRatePct: number | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentBalance: number;
  currentBalanceDate: string | null;
  balances: Array<{
    id: string;
    value: number;
    date: string;
    note: string | null;
    createdAt: string;
  }>;
}

export interface AssetsSummary {
  assetTotals: Record<AssetType, number>;
  accountTotals: Record<AccountType, number>;
  grandTotal: number;
}

export const assetsApiService = {
  getSummary: () => apiClient.get<AssetsSummary>("/api/assets/summary"),

  listAssetsByType: (type: AssetType) => apiClient.get<AssetItem[]>(`/api/assets/assets/${type}`),

  createAsset: (data: CreateAssetInput) => apiClient.post<AssetItem>("/api/assets/assets", data),

  updateAsset: (assetId: string, data: UpdateAssetInput) =>
    apiClient.patch<AssetItem>(`/api/assets/assets/${assetId}`, data),

  deleteAsset: (assetId: string) => apiClient.delete(`/api/assets/assets/${assetId}`),

  recordAssetBalance: (assetId: string, data: RecordAssetBalanceInput) =>
    apiClient.post(`/api/assets/assets/${assetId}/balance`, data),

  confirmAsset: (assetId: string) => apiClient.post(`/api/assets/assets/${assetId}/confirm`, {}),

  listAccountsByType: (type: AccountType) =>
    apiClient.get<AccountItem[]>(`/api/assets/accounts/${type}`),

  createAccount: (data: CreateAccountInput) =>
    apiClient.post<AccountItem>("/api/assets/accounts", data),

  updateAccount: (accountId: string, data: UpdateAccountInput) =>
    apiClient.patch<AccountItem>(`/api/assets/accounts/${accountId}`, data),

  deleteAccount: (accountId: string) => apiClient.delete(`/api/assets/accounts/${accountId}`),

  recordAccountBalance: (accountId: string, data: RecordAccountBalanceInput) =>
    apiClient.post(`/api/assets/accounts/${accountId}/balance`, data),

  confirmAccount: (accountId: string) =>
    apiClient.post(`/api/assets/accounts/${accountId}/confirm`, {}),
};
```

- [ ] **Step 3: Create useAssets.ts**

```typescript
// apps/frontend/src/hooks/useAssets.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { assetsApiService } from "../services/assets.service.js";
import type { AssetType, AccountType } from "@finplan/shared";

export const ASSETS_QUERY_KEYS = {
  summary: ["assets", "summary"] as const,
  assetsByType: (type: AssetType) => ["assets", "assets", type] as const,
  accountsByType: (type: AccountType) => ["assets", "accounts", type] as const,
};

export function useAssetsSummary() {
  return useQuery({
    queryKey: ASSETS_QUERY_KEYS.summary,
    queryFn: assetsApiService.getSummary,
  });
}

export function useAssetsByType(type: AssetType) {
  return useQuery({
    queryKey: ASSETS_QUERY_KEYS.assetsByType(type),
    queryFn: () => assetsApiService.listAssetsByType(type),
  });
}

export function useAccountsByType(type: AccountType) {
  return useQuery({
    queryKey: ASSETS_QUERY_KEYS.accountsByType(type),
    queryFn: () => assetsApiService.listAccountsByType(type),
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assetsApiService.createAsset,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      data,
    }: {
      assetId: string;
      data: Parameters<typeof assetsApiService.updateAsset>[1];
    }) => assetsApiService.updateAsset(assetId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assetsApiService.deleteAsset,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useRecordAssetBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      data,
    }: {
      assetId: string;
      data: Parameters<typeof assetsApiService.recordAssetBalance>[1];
    }) => assetsApiService.recordAssetBalance(assetId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assetsApiService.createAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      data,
    }: {
      accountId: string;
      data: Parameters<typeof assetsApiService.updateAccount>[1];
    }) => assetsApiService.updateAccount(accountId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assetsApiService.deleteAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useRecordAccountBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      data,
    }: {
      accountId: string;
      data: Parameters<typeof assetsApiService.recordAccountBalance>[1];
    }) => assetsApiService.recordAccountBalance(accountId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}
```

- [ ] **Step 4: Verify compile**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/assets.service.ts apps/frontend/src/hooks/useAssets.ts
git commit -m "feat(assets): add frontend assets service and TanStack Query hooks"
```

---

### Task 9: AssetsPage + AssetsLeftPanel

**Files:**

- Create: `apps/frontend/src/pages/AssetsPage.tsx`
- Create: `apps/frontend/src/components/assets/AssetsLeftPanel.tsx`

- [ ] **Step 1: Write the failing test**

No unit tests for pages — validated visually. Skip to implementation.

- [ ] **Step 2: Create AssetsLeftPanel.tsx**

```tsx
// apps/frontend/src/components/assets/AssetsLeftPanel.tsx
import type { AssetType, AccountType } from "@finplan/shared";
import type { AssetsSummary } from "../../services/assets.service.js";

const ASSET_TYPES: AssetType[] = ["Property", "Vehicle", "Other"];
const ACCOUNT_TYPES: AccountType[] = ["Savings", "Pension", "StocksAndShares", "Other"];

const TYPE_LABELS: Record<AssetType | AccountType, string> = {
  Property: "Property",
  Vehicle: "Vehicle",
  Other: "Other",
  Savings: "Savings",
  Pension: "Pension",
  StocksAndShares: "Stocks & Shares",
};

function formatGBP(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface Props {
  summary: AssetsSummary | undefined;
  selected: AssetType | AccountType;
  onSelect: (type: AssetType | AccountType) => void;
  staleCountByType?: Partial<Record<AssetType | AccountType, number>>;
}

export function AssetsLeftPanel({ summary, selected, onSelect, staleCountByType = {} }: Props) {
  const grandTotal = summary?.grandTotal ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 flex justify-between items-baseline">
        <div className="text-[#8b5cf6] text-[22px] font-bold tracking-[0.04em] uppercase font-[Outfit]">
          Assets
        </div>
        <div className="text-[#8b5cf6] text-base font-semibold font-mono">
          {formatGBP(grandTotal)}
        </div>
      </div>

      {/* List */}
      <div className="flex-1">
        {/* Assets group */}
        <div className="px-5 py-1.5 text-[rgba(238,242,255,0.25)] text-[10px] tracking-[0.1em] uppercase">
          Assets
        </div>
        {ASSET_TYPES.map((type) => {
          const isSelected = selected === type;
          const total = summary?.assetTotals[type] ?? 0;
          const staleCount = staleCountByType[type] ?? 0;
          return (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className={`w-full flex justify-between items-center px-5 py-2.5 text-left bg-transparent border-none cursor-pointer ${
                isSelected ? "border-l-2 border-[#8b5cf6] pl-[18px]" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm ${isSelected ? "text-[rgba(238,242,255,0.92)] font-semibold" : "text-[rgba(238,242,255,0.65)]"}`}
                >
                  {TYPE_LABELS[type]}
                </span>
                {staleCount > 0 && (
                  <span className="text-[10px] text-amber-400">● {staleCount} stale</span>
                )}
              </div>
              <span
                className={`text-[13px] font-mono ${isSelected ? "text-[#8b5cf6]" : "text-[rgba(238,242,255,0.5)]"}`}
              >
                {formatGBP(total)}
              </span>
            </button>
          );
        })}

        {/* Accounts group */}
        <div className="px-5 pt-3.5 pb-1.5 text-[rgba(238,242,255,0.25)] text-[10px] tracking-[0.1em] uppercase">
          Accounts
        </div>
        {ACCOUNT_TYPES.map((type) => {
          const isSelected = selected === type;
          const total = summary?.accountTotals[type] ?? 0;
          const staleCount = staleCountByType[type] ?? 0;
          return (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className={`w-full flex justify-between items-center px-5 py-2.5 text-left bg-transparent border-none cursor-pointer ${
                isSelected ? "border-l-2 border-[#8b5cf6] pl-[18px]" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm ${isSelected ? "text-[rgba(238,242,255,0.92)] font-semibold" : "text-[rgba(238,242,255,0.65)]"}`}
                >
                  {TYPE_LABELS[type]}
                </span>
                {staleCount > 0 && (
                  <span className="text-[10px] text-amber-400">● {staleCount} stale</span>
                )}
              </div>
              <span
                className={`text-[13px] font-mono ${isSelected ? "text-[#8b5cf6]" : "text-[rgba(238,242,255,0.5)]"}`}
              >
                {formatGBP(total)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-[#1a1f35] px-5 py-3.5 flex justify-between items-center">
        <span className="text-sm text-[rgba(238,242,255,0.65)]">Total</span>
        <span className="text-sm font-mono text-[rgba(238,242,255,0.92)]">
          {formatGBP(grandTotal)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create AssetsPage.tsx**

```tsx
// apps/frontend/src/pages/AssetsPage.tsx
import { useState } from "react";
import { TwoPanelLayout } from "../components/layout/TwoPanelLayout.js";
import { AssetsLeftPanel } from "../components/assets/AssetsLeftPanel.js";
import { AssetItemArea } from "../components/assets/AssetItemArea.js";
import { AccountItemArea } from "../components/assets/AccountItemArea.js";
import { useAssetsSummary } from "../hooks/useAssets.js";
import type { AssetType, AccountType } from "@finplan/shared";

type SelectedType = AssetType | AccountType;
const ASSET_TYPES: AssetType[] = ["Property", "Vehicle", "Other"];

export function AssetsPage() {
  const [selected, setSelected] = useState<SelectedType>("Property");
  const { data: summary } = useAssetsSummary();

  const isAssetType = ASSET_TYPES.includes(selected as AssetType);

  return (
    <TwoPanelLayout
      left={<AssetsLeftPanel summary={summary} selected={selected} onSelect={setSelected} />}
      right={
        isAssetType ? (
          <AssetItemArea type={selected as AssetType} />
        ) : (
          <AccountItemArea type={selected as AccountType} />
        )
      }
    />
  );
}
```

- [ ] **Step 4: Verify compile**

```bash
bun run type-check
```

Expected: PASS (AssetItemArea and AccountItemArea will be stubs until Task 10)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/AssetsPage.tsx apps/frontend/src/components/assets/AssetsLeftPanel.tsx
git commit -m "feat(assets): add AssetsPage and AssetsLeftPanel with two-group subcategory list"
```

---

### Task 10: AssetItemArea + AccountItemArea + AssetAccountRow

**Files:**

- Create: `apps/frontend/src/components/assets/AssetItemArea.tsx`
- Create: `apps/frontend/src/components/assets/AccountItemArea.tsx`
- Create: `apps/frontend/src/components/assets/AssetAccountRow.tsx`

- [ ] **Step 1: Write the failing test**

No unit tests — validated visually. Skip to implementation.

- [ ] **Step 2: Create AssetAccountRow.tsx**

```tsx
// apps/frontend/src/components/assets/AssetAccountRow.tsx
import { useState } from "react";
import { StalenessIndicator } from "../common/StalenessIndicator.js";
import type { AssetItem, AccountItem } from "../../services/assets.service.js";
import { useHouseholdMembers } from "../../hooks/useHousehold.js";

type Item = AssetItem | AccountItem;

interface Props {
  item: Item;
  stalenessThresholdMonths: number;
  onRecordBalance: (item: Item) => void;
  onEdit: (item: Item) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function formatGBP(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Never recorded";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AssetAccountRow({
  item,
  stalenessThresholdMonths,
  onRecordBalance,
  onEdit,
  isExpanded,
  onToggle,
}: Props) {
  const { data: members } = useHouseholdMembers();
  const memberName = item.memberUserId
    ? (members?.find((m) => m.userId === item.memberUserId)?.firstName ?? item.memberUserId)
    : "Household";

  const typeLabel = "type" in item ? item.type : "";

  return (
    <div
      className={`border-b border-[rgba(26,31,53,0.8)] ${isExpanded ? "bg-[rgba(139,92,246,0.04)] border-l-2 border-[#8b5cf6] -mx-6 px-6" : ""}`}
    >
      {/* Collapsed header — always shown */}
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center py-3.5 bg-transparent border-none cursor-pointer text-left"
      >
        <div>
          <div className="text-sm text-[rgba(238,242,255,0.92)]">{item.name}</div>
          <div className="text-[11px] text-[rgba(238,242,255,0.4)] mt-0.5">
            {typeLabel} · {memberName}
            {item.lastReviewedAt && (
              <span className="ml-2">
                <StalenessIndicator
                  lastReviewedAt={item.lastReviewedAt}
                  thresholdMonths={stalenessThresholdMonths}
                />
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono text-[rgba(238,242,255,0.92)]">
            {formatGBP(item.currentBalance)}
          </div>
          <div className="text-[11px] text-[rgba(238,242,255,0.4)] mt-0.5">
            {formatDate(item.currentBalanceDate)}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="flex flex-col gap-2.5 pb-3.5">
          {/* Balance history */}
          <div>
            <div className="text-[10px] tracking-[0.08em] uppercase text-[rgba(238,242,255,0.25)] mb-1">
              Balance History
            </div>
            {item.balances.length === 0 ? (
              <div className="text-[12px] italic text-[rgba(238,242,255,0.4)]">
                No balances recorded yet
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {item.balances.map((b) => (
                  <div key={b.id} className="flex justify-between text-[12px]">
                    <span className="text-[rgba(238,242,255,0.65)]">{formatDate(b.date)}</span>
                    <span className="font-mono text-[rgba(238,242,255,0.92)]">
                      {formatGBP(b.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => onRecordBalance(item)}
              className="bg-[rgba(139,92,246,0.1)] border border-[rgba(139,92,246,0.25)] rounded-md px-3.5 py-1.5 text-[#a78bfa] text-[12px] cursor-pointer hover:bg-[rgba(139,92,246,0.2)] transition-colors"
            >
              Record Balance
            </button>
            <button
              onClick={() => onEdit(item)}
              className="bg-[rgba(139,92,246,0.1)] border border-[rgba(139,92,246,0.25)] rounded-md px-3.5 py-1.5 text-[#a78bfa] text-[12px] cursor-pointer hover:bg-[rgba(139,92,246,0.2)] transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create AssetItemArea.tsx**

```tsx
// apps/frontend/src/components/assets/AssetItemArea.tsx
import { useState } from "react";
import type { AssetType } from "@finplan/shared";
import { useAssetsByType, useDeleteAsset } from "../../hooks/useAssets.js";
import { AssetAccountRow } from "./AssetAccountRow.js";
import { AddEditAssetModal } from "./AddEditAssetModal.js";
import { RecordBalanceForm } from "./RecordBalanceForm.js";
import type { AssetItem } from "../../services/assets.service.js";

const TYPE_LABELS: Record<AssetType, string> = {
  Property: "Property",
  Vehicle: "Vehicle",
  Other: "Other",
};

function formatGBP(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface Props {
  type: AssetType;
}

export function AssetItemArea({ type }: Props) {
  const { data: items, isLoading, isError, refetch } = useAssetsByType(type);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<AssetItem | null>(null);
  const [recordItem, setRecordItem] = useState<AssetItem | null>(null);

  const typeTotal = (items ?? []).reduce((sum, i) => sum + i.currentBalance, 0);
  const label = TYPE_LABELS[type];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-14 bg-[rgba(238,242,255,0.04)] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-[rgba(238,242,255,0.5)] text-sm">
        Failed to load {label} items.{" "}
        <button onClick={() => refetch()} className="text-[#a78bfa] underline cursor-pointer">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-bold text-[rgba(238,242,255,0.92)]">{label}</span>
          <span className="text-[12px] text-[rgba(238,242,255,0.4)]">
            {items?.length ?? 0} {(items?.length ?? 0) === 1 ? "item" : "items"}
          </span>
          <span className="text-[13px] font-mono text-[#8b5cf6]">{formatGBP(typeTotal)}</span>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="bg-transparent border border-[rgba(238,242,255,0.2)] rounded-md px-3.5 py-1.5 text-[rgba(238,242,255,0.75)] text-[12px] cursor-pointer hover:border-[rgba(238,242,255,0.4)] transition-colors"
        >
          + Add
        </button>
      </div>

      <div className="border-t border-[#1a1f35]" />

      {/* Items */}
      <div className="px-6 flex-1 overflow-y-auto">
        {items?.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-[rgba(238,242,255,0.4)] text-sm mb-3">No {label} items yet</div>
            <button
              onClick={() => setAddOpen(true)}
              className="bg-[rgba(139,92,246,0.1)] border border-[rgba(139,92,246,0.25)] rounded-md px-4 py-2 text-[#a78bfa] text-sm cursor-pointer"
            >
              + Add {label}
            </button>
          </div>
        ) : (
          items?.map((item) => (
            <AssetAccountRow
              key={item.id}
              item={item}
              stalenessThresholdMonths={12}
              isExpanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onRecordBalance={(i) => setRecordItem(i as AssetItem)}
              onEdit={(i) => setEditItem(i as AssetItem)}
            />
          ))
        )}
      </div>

      {addOpen && <AddEditAssetModal type={type} onClose={() => setAddOpen(false)} />}
      {editItem && (
        <AddEditAssetModal type={type} item={editItem} onClose={() => setEditItem(null)} />
      )}
      {recordItem && (
        <RecordBalanceForm
          itemId={recordItem.id}
          itemKind="asset"
          onClose={() => setRecordItem(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create AccountItemArea.tsx**

```tsx
// apps/frontend/src/components/assets/AccountItemArea.tsx
import { useState } from "react";
import type { AccountType } from "@finplan/shared";
import { useAccountsByType } from "../../hooks/useAssets.js";
import { AssetAccountRow } from "./AssetAccountRow.js";
import { AddEditAccountModal } from "./AddEditAccountModal.js";
import { RecordBalanceForm } from "./RecordBalanceForm.js";
import type { AccountItem } from "../../services/assets.service.js";

const TYPE_LABELS: Record<AccountType, string> = {
  Savings: "Savings",
  Pension: "Pension",
  StocksAndShares: "Stocks & Shares",
  Other: "Other",
};

function formatGBP(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface Props {
  type: AccountType;
}

export function AccountItemArea({ type }: Props) {
  const { data: items, isLoading, isError, refetch } = useAccountsByType(type);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<AccountItem | null>(null);
  const [recordItem, setRecordItem] = useState<AccountItem | null>(null);

  const typeTotal = (items ?? []).reduce((sum, i) => sum + i.currentBalance, 0);
  const label = TYPE_LABELS[type];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-14 bg-[rgba(238,242,255,0.04)] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-[rgba(238,242,255,0.5)] text-sm">
        Failed to load {label} accounts.{" "}
        <button onClick={() => refetch()} className="text-[#a78bfa] underline cursor-pointer">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-bold text-[rgba(238,242,255,0.92)]">{label}</span>
          <span className="text-[12px] text-[rgba(238,242,255,0.4)]">
            {items?.length ?? 0} {(items?.length ?? 0) === 1 ? "item" : "items"}
          </span>
          <span className="text-[13px] font-mono text-[#8b5cf6]">{formatGBP(typeTotal)}</span>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="bg-transparent border border-[rgba(238,242,255,0.2)] rounded-md px-3.5 py-1.5 text-[rgba(238,242,255,0.75)] text-[12px] cursor-pointer hover:border-[rgba(238,242,255,0.4)] transition-colors"
        >
          + Add
        </button>
      </div>

      <div className="border-t border-[#1a1f35]" />

      {/* Items */}
      <div className="px-6 flex-1 overflow-y-auto">
        {items?.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-[rgba(238,242,255,0.4)] text-sm mb-3">No {label} accounts yet</div>
            <button
              onClick={() => setAddOpen(true)}
              className="bg-[rgba(139,92,246,0.1)] border border-[rgba(139,92,246,0.25)] rounded-md px-4 py-2 text-[#a78bfa] text-sm cursor-pointer"
            >
              + Add {label}
            </button>
          </div>
        ) : (
          items?.map((item) => (
            <AssetAccountRow
              key={item.id}
              item={item}
              stalenessThresholdMonths={3}
              isExpanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onRecordBalance={(i) => setRecordItem(i as AccountItem)}
              onEdit={(i) => setEditItem(i as AccountItem)}
            />
          ))
        )}
      </div>

      {addOpen && <AddEditAccountModal type={type} onClose={() => setAddOpen(false)} />}
      {editItem && (
        <AddEditAccountModal type={type} item={editItem} onClose={() => setEditItem(null)} />
      )}
      {recordItem && (
        <RecordBalanceForm
          itemId={recordItem.id}
          itemKind="account"
          onClose={() => setRecordItem(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify compile**

```bash
bun run type-check
```

Expected: PASS (modals stubs until Task 11)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/assets/
git commit -m "feat(assets): add AssetItemArea, AccountItemArea, AssetAccountRow accordion components"
```

---

### Task 11: RecordBalanceForm + AddEditAssetModal + AddEditAccountModal

**Files:**

- Create: `apps/frontend/src/components/assets/RecordBalanceForm.tsx`
- Create: `apps/frontend/src/components/assets/AddEditAssetModal.tsx`
- Create: `apps/frontend/src/components/assets/AddEditAccountModal.tsx`

- [ ] **Step 1: Write the failing test**

No unit tests — validated visually. Skip to implementation.

- [ ] **Step 2: Create RecordBalanceForm.tsx**

```tsx
// apps/frontend/src/components/assets/RecordBalanceForm.tsx
import { useState } from "react";
import { useRecordAssetBalance, useRecordAccountBalance } from "../../hooks/useAssets.js";

interface Props {
  itemId: string;
  itemKind: "asset" | "account";
  onClose: () => void;
}

function todayISO() {
  return new Date().toISOString().split("T")[0]!;
}

export function RecordBalanceForm({ itemId, itemKind, onClose }: Props) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recordAsset = useRecordAssetBalance();
  const recordAccount = useRecordAccountBalance();

  const isPending = recordAsset.isPending || recordAccount.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setError("Value must be a positive number");
      return;
    }
    if (date > todayISO()) {
      setError("Date cannot be in the future");
      return;
    }
    try {
      if (itemKind === "asset") {
        await recordAsset.mutateAsync({
          assetId: itemId,
          data: { value: numValue, date, note: note || null },
        });
      } else {
        await recordAccount.mutateAsync({
          accountId: itemId,
          data: { value: numValue, date, note: note || null },
        });
      }
      onClose();
    } catch {
      setError("Failed to record balance. Please try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0d1024] border border-[#1a1f35] rounded-xl p-6 w-full max-w-sm flex flex-col gap-4"
      >
        <h2 className="text-base font-semibold text-[rgba(238,242,255,0.92)]">Record Balance</h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
            Value (£)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0.00"
            className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] placeholder:text-[rgba(238,242,255,0.2)] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
            Date
          </label>
          <input
            type="date"
            required
            max={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. end of year valuation"
            className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] placeholder:text-[rgba(238,242,255,0.2)] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-[rgba(238,242,255,0.5)] hover:text-[rgba(238,242,255,0.8)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 rounded-md px-4 py-1.5 text-sm text-white font-medium transition-colors"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create AddEditAssetModal.tsx**

```tsx
// apps/frontend/src/components/assets/AddEditAssetModal.tsx
import { useState } from "react";
import type { AssetType } from "@finplan/shared";
import { useCreateAsset, useUpdateAsset, useDeleteAsset } from "../../hooks/useAssets.js";
import { useHouseholdMembers } from "../../hooks/useHousehold.js";
import type { AssetItem } from "../../services/assets.service.js";

interface Props {
  type: AssetType;
  item?: AssetItem;
  onClose: () => void;
}

export function AddEditAssetModal({ type, item, onClose }: Props) {
  const [name, setName] = useState(item?.name ?? "");
  const [memberUserId, setMemberUserId] = useState<string | null>(item?.memberUserId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: members } = useHouseholdMembers();
  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();

  const isPending = createAsset.isPending || updateAsset.isPending || deleteAsset.isPending;
  const isEdit = !!item;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    try {
      if (isEdit) {
        await updateAsset.mutateAsync({
          assetId: item.id,
          data: { name: name.trim(), memberUserId },
        });
      } else {
        await createAsset.mutateAsync({
          name: name.trim(),
          type,
          memberUserId: memberUserId ?? undefined,
        });
      }
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    }
  }

  async function handleDelete() {
    if (!item) return;
    try {
      await deleteAsset.mutateAsync(item.id);
      onClose();
    } catch {
      setError("Failed to delete. Please try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0d1024] border border-[#1a1f35] rounded-xl p-6 w-full max-w-sm flex flex-col gap-4"
      >
        <h2 className="text-base font-semibold text-[rgba(238,242,255,0.92)]">
          {isEdit ? "Edit" : "Add"} {type}
        </h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
            Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. Family Home`}
            className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] placeholder:text-[rgba(238,242,255,0.2)] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
            Assigned to
          </label>
          <select
            value={memberUserId ?? ""}
            onChange={(e) => setMemberUserId(e.target.value || null)}
            className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] focus:outline-none focus:border-[#8b5cf6]"
          >
            <option value="">Household</option>
            {members?.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.firstName}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex justify-between items-center mt-1">
          {isEdit && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Delete
            </button>
          )}
          {isEdit && confirmDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-red-400 font-semibold hover:text-red-300 transition-colors"
            >
              Confirm delete
            </button>
          )}
          {!isEdit && <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-[rgba(238,242,255,0.5)] hover:text-[rgba(238,242,255,0.8)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 rounded-md px-4 py-1.5 text-sm text-white font-medium transition-colors"
            >
              {isPending ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create AddEditAccountModal.tsx**

```tsx
// apps/frontend/src/components/assets/AddEditAccountModal.tsx
import { useState } from "react";
import type { AccountType } from "@finplan/shared";
import { useCreateAccount, useUpdateAccount, useDeleteAccount } from "../../hooks/useAssets.js";
import { useHouseholdMembers } from "../../hooks/useHousehold.js";
import { useSettings } from "../../hooks/useSettings.js";
import type { AccountItem } from "../../services/assets.service.js";

const GROWTH_RATE_SETTING_KEY: Partial<
  Record<AccountType, "savingsRatePct" | "investmentRatePct" | "pensionRatePct">
> = {
  Savings: "savingsRatePct",
  StocksAndShares: "investmentRatePct",
  Pension: "pensionRatePct",
};

interface Props {
  type: AccountType;
  item?: AccountItem;
  onClose: () => void;
}

export function AddEditAccountModal({ type, item, onClose }: Props) {
  const [name, setName] = useState(item?.name ?? "");
  const [memberUserId, setMemberUserId] = useState<string | null>(item?.memberUserId ?? null);
  const [growthRatePct, setGrowthRatePct] = useState(item?.growthRatePct?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: members } = useHouseholdMembers();
  const { data: settings } = useSettings();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  const isPending = createAccount.isPending || updateAccount.isPending || deleteAccount.isPending;
  const isEdit = !!item;

  const settingKey = GROWTH_RATE_SETTING_KEY[type];
  const defaultRate = settingKey && settings ? (settings as any)[settingKey] : null;
  const rateLabel = defaultRate != null ? `Default: ${defaultRate}%` : "No household default set";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const parsedRate = growthRatePct !== "" ? parseFloat(growthRatePct) : null;
    if (parsedRate !== null && (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100)) {
      setError("Growth rate must be between 0 and 100");
      return;
    }
    try {
      if (isEdit) {
        await updateAccount.mutateAsync({
          accountId: item.id,
          data: { name: name.trim(), memberUserId, growthRatePct: parsedRate },
        });
      } else {
        await createAccount.mutateAsync({
          name: name.trim(),
          type,
          memberUserId: memberUserId ?? undefined,
          growthRatePct: parsedRate ?? undefined,
        });
      }
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    }
  }

  async function handleDelete() {
    if (!item) return;
    try {
      await deleteAccount.mutateAsync(item.id);
      onClose();
    } catch {
      setError("Failed to delete. Please try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0d1024] border border-[#1a1f35] rounded-xl p-6 w-full max-w-sm flex flex-col gap-4"
      >
        <h2 className="text-base font-semibold text-[rgba(238,242,255,0.92)]">
          {isEdit ? "Edit" : "Add"} {type === "StocksAndShares" ? "Stocks & Shares" : type}
        </h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
            Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vanguard SIPP"
            className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] placeholder:text-[rgba(238,242,255,0.2)] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
            Assigned to
          </label>
          <select
            value={memberUserId ?? ""}
            onChange={(e) => setMemberUserId(e.target.value || null)}
            className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] focus:outline-none focus:border-[#8b5cf6]"
          >
            <option value="">Household</option>
            {members?.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.firstName}
              </option>
            ))}
          </select>
        </div>

        {settingKey && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
              Growth rate override (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={growthRatePct}
              onChange={(e) => setGrowthRatePct(e.target.value)}
              placeholder={rateLabel}
              className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] placeholder:text-[rgba(238,242,255,0.3)] focus:outline-none focus:border-[#8b5cf6]"
            />
            <p className="text-[11px] text-[rgba(238,242,255,0.3)]">
              Leave blank to use household default ({rateLabel})
            </p>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex justify-between items-center mt-1">
          {isEdit && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Delete
            </button>
          )}
          {isEdit && confirmDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-red-400 font-semibold hover:text-red-300 transition-colors"
            >
              Confirm delete
            </button>
          )}
          {!isEdit && <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-[rgba(238,242,255,0.5)] hover:text-[rgba(238,242,255,0.8)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 rounded-md px-4 py-1.5 text-sm text-white font-medium transition-colors"
            >
              {isPending ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Verify compile**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/assets/RecordBalanceForm.tsx apps/frontend/src/components/assets/AddEditAssetModal.tsx apps/frontend/src/components/assets/AddEditAccountModal.tsx
git commit -m "feat(assets): add RecordBalanceForm, AddEditAssetModal, AddEditAccountModal"
```

---

### Task 12: Nav + routing + Settings GrowthRatesSection

**Files:**

- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/layout/Layout.tsx`
- Create: `apps/frontend/src/components/settings/GrowthRatesSection.tsx`
- Modify: `apps/frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write the failing test**

No unit tests — validated visually. Skip to implementation.

- [ ] **Step 2: Update App.tsx — add /assets route**

In `apps/frontend/src/App.tsx`, add:

```tsx
import { AssetsPage } from "./pages/AssetsPage.js";
// In the Routes block:
<Route path="/assets" element={<AssetsPage />} />;
```

- [ ] **Step 3: Update Layout.tsx — add Assets nav item**

In `apps/frontend/src/components/layout/Layout.tsx`, add Assets navigation link. Insert it after Income and before or after the other pages, following the same nav item pattern used for other pages (typically `NavLink` with appropriate icon).

- [ ] **Step 4: Create GrowthRatesSection.tsx**

```tsx
// apps/frontend/src/components/settings/GrowthRatesSection.tsx
import { useState } from "react";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings.js";

export function GrowthRatesSection() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [savings, setSavings] = useState<string>("");
  const [investment, setInvestment] = useState<string>("");
  const [pension, setPension] = useState<string>("");
  const [inflation, setInflation] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from settings on load
  useState(() => {
    if (settings) {
      setSavings((settings as any).savingsRatePct?.toString() ?? "");
      setInvestment((settings as any).investmentRatePct?.toString() ?? "");
      setPension((settings as any).pensionRatePct?.toString() ?? "");
      setInflation((settings as any).inflationRatePct?.toString() ?? "2.5");
    }
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const toNum = (s: string) => (s !== "" ? parseFloat(s) : null);
    const inflationNum = inflation !== "" ? parseFloat(inflation) : 2.5;
    if (
      [savings, investment, pension].some(
        (s) => s !== "" && (isNaN(parseFloat(s)) || parseFloat(s) < 0 || parseFloat(s) > 100)
      )
    ) {
      setError("Rates must be between 0 and 100");
      return;
    }
    try {
      await updateSettings.mutateAsync({
        savingsRatePct: toNum(savings),
        investmentRatePct: toNum(investment),
        pensionRatePct: toNum(pension),
        inflationRatePct: inflationNum,
      } as any);
      setSaved(true);
    } catch {
      setError("Failed to save growth rates.");
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-[rgba(238,242,255,0.65)] uppercase tracking-wider">
        Growth Rates
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Default savings rate (%)", value: savings, onChange: setSavings },
          { label: "Default investment rate (%)", value: investment, onChange: setInvestment },
          { label: "Default pension rate (%)", value: pension, onChange: setPension },
          {
            label: "Inflation rate (%)",
            value: inflation,
            onChange: setInflation,
            placeholder: "2.5",
          },
        ].map(({ label, value, onChange, placeholder }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-[rgba(238,242,255,0.4)]">
              {label}
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder ?? "Not set"}
              className="bg-[rgba(238,242,255,0.04)] border border-[#1a1f35] rounded-md px-3 py-2 text-sm text-[rgba(238,242,255,0.92)] placeholder:text-[rgba(238,242,255,0.2)] focus:outline-none focus:border-[#8b5cf6]"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {saved && <p className="text-green-400 text-xs">Saved.</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={updateSettings.isPending}
          className="bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 rounded-md px-4 py-1.5 text-sm text-white font-medium transition-colors"
        >
          {updateSettings.isPending ? "Saving…" : "Save Growth Rates"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Add GrowthRatesSection to SettingsPage**

In `apps/frontend/src/pages/SettingsPage.tsx` (read first), import and render `<GrowthRatesSection />` inside the owner/admin-gated section, alongside existing settings sections.

- [ ] **Step 6: Verify full compile and tests**

```bash
bun run type-check
bun run lint
cd apps/backend && bun scripts/run-tests.ts
```

Expected: All PASS, zero lint warnings

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/App.tsx apps/frontend/src/components/layout/Layout.tsx apps/frontend/src/components/settings/GrowthRatesSection.tsx apps/frontend/src/pages/SettingsPage.tsx
git commit -m "feat(assets): add /assets route, nav item, and GrowthRatesSection in Settings"
```

---

## Testing

Run all backend tests after Tasks 5–7 are complete:

```bash
cd apps/backend && bun scripts/run-tests.ts
```

Run full suite before marking complete:

```bash
bun run lint
bun run type-check
cd apps/backend && bun scripts/run-tests.ts
```

## Verification

End-to-end checklist:

- [ ] Navigate to /assets — Assets page loads with two-panel layout
- [ ] Left panel shows 7 subcategories in two groups (Assets / Accounts), all showing £0 initially
- [ ] Selecting a subcategory highlights it with left violet border and violet total
- [ ] Adding a Property asset via "+ Add" creates it and shows it in the list
- [ ] Expanding an item shows "No balances recorded yet"
- [ ] Recording a balance shows it in the history and updates the current balance + date
- [ ] Stale items show amber dot + age label; stale count appears in left panel
- [ ] Account types show growth rate override field in Edit modal with household default as placeholder
- [ ] Settings page (owner/admin) shows Growth Rates section with four fields
- [ ] Non-owner/admin cannot save growth rate changes (403 from API)
- [ ] Legacy /wealth route returns 404
- [ ] Audit log shows all mutating operations

## Post-conditions

- [ ] Move spec to `docs/5. built/overview/assets/` and update `implemented_date`
- [ ] Move design doc to `docs/5. built/overview/assets/`
- [ ] Update `docs/4. planning/_implementation-plan.md` to mark Assets as complete
