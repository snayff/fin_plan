---
feature: savings-contribution-limit
category: discretionary
spec: docs/4. planning/savings-contribution-limit/savings-contribution-limit-spec.md
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# Savings Contribution Limit — Implementation Plan

> **For Claude:** Use `/execute-plan savings-contribution-limit` to implement this plan task-by-task.

**Goal:** Add an optional monthly contribution limit to Savings accounts and surface a single arithmetic NudgeCard for over-cap or higher-rate-target opportunities, reusing the existing linked-discretionary aggregation.
**Spec:** `docs/4. planning/savings-contribution-limit/savings-contribution-limit-spec.md`
**Architecture:** A nullable `monthlyContributionLimit` is added to `Account`. The existing `assetsService.listAccountsByType` is extended to derive `spareMonthly`, `isOverCap`, `hasSpareCapacityNudge`, a `higherRateTarget` object, and per-linked-item `lumpSumExceedsCap`. The frontend `AccountForm` shows the field for `Savings` type only; `AssetAccountRow` adds a capacity meter and a "Total/mo" line; a thin `SavingsContributionNudge` wraps the existing `NudgeCard` with two arithmetic-only copy templates.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: yes

## Pre-conditions

- [ ] `asset-and-account-growth-and-contributions` is implemented (it's the basis for `monthlyContribution` and `linkedItems`). `apps/backend/src/services/assets.service.ts` already contains `listAccountsByType` with `monthlyContribution` and `linkedItems` derivation.
- [ ] `apps/frontend/src/components/common/NudgeCard.tsx` exists and accepts `message`, `actionLabel`, `onAction` props.
- [ ] `apps/frontend/src/utils/format.ts` exports `formatCurrency(value, showPence)`.
- [ ] `definitions.md` exists at `docs/2. design/definitions.md`.

## File structure mapping

| File                                                                     | Responsibility                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/backend/prisma/schema.prisma`                                      | Add `monthlyContributionLimit Float?` to `Account`                                                                                                                                             |
| `packages/shared/src/schemas/assets.schemas.ts`                          | Add `monthlyContributionLimit` to `createAccountSchema` and `updateAccountSchema`                                                                                                              |
| `apps/backend/src/services/assets.service.ts`                            | Reject non-null limit on non-Savings type; null limit on type-change-away; derive `spareMonthly`, `isOverCap`, `hasSpareCapacityNudge`, `higherRateTarget`, `linkedItems[i].lumpSumExceedsCap` |
| `apps/backend/src/services/assets.service.test.ts`                       | Tests for the validator and the derivation logic                                                                                                                                               |
| `apps/backend/src/routes/assets.routes.test.ts`                          | Route-level test for the type-guard rejection                                                                                                                                                  |
| `apps/frontend/src/services/assets.service.ts`                           | Extend `AccountItem`, `LinkedContributionItem`; add `HigherRateTarget` type                                                                                                                    |
| `apps/frontend/src/components/assets/AccountForm.tsx`                    | Render limit input for Savings; pass `monthlyContributionLimit` on save                                                                                                                        |
| `apps/frontend/src/components/assets/SavingsContributionNudge.tsx` (new) | Pick spare/over template, format copy, render `NudgeCard`                                                                                                                                      |
| `apps/frontend/src/components/assets/AssetAccountRow.tsx`                | Capacity meter, "Total/mo" line, lump-sum annotation, extended dot trigger                                                                                                                     |
| `apps/frontend/src/components/assets/AccountItemArea.tsx`                | Render `SavingsContributionNudge` for the expanded Savings account                                                                                                                             |
| `docs/2. design/definitions.md`                                          | Add "Monthly contribution limit" entry                                                                                                                                                         |

## Tasks

### Task 1: Prisma migration — add `monthlyContributionLimit` to Account

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Edit schema**

In `model Account`, immediately after the `growthRatePct` line, add:

```prisma
  monthlyContributionLimit Float?
```

- [ ] **Step 2: Run interactive migration**

Run: `bun run db:migrate`
At the prompt, name the migration `add_monthly_contribution_limit_to_account`.
Expected: migration applied; `prisma generate` regenerates the client; `Account.monthlyContributionLimit?: number | null` becomes available.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations
git commit -m "feat(schema): add monthlyContributionLimit to Account"
```

---

### Task 2: Extend shared Zod schemas

**Files:**

- Modify: `packages/shared/src/schemas/assets.schemas.ts`
- Test: `packages/shared/src/schemas/__tests__/assets.schemas.test.ts` (create if not present; otherwise append)

- [ ] **Step 1: Write the failing test**

Create or append to `packages/shared/src/schemas/__tests__/assets.schemas.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { createAccountSchema, updateAccountSchema } from "../assets.schemas.js";

describe("createAccountSchema — monthlyContributionLimit", () => {
  it("accepts a non-negative number", () => {
    const r = createAccountSchema.safeParse({
      name: "Marcus",
      type: "Savings",
      monthlyContributionLimit: 200,
    });
    expect(r.success).toBe(true);
  });
  it("accepts null (clears the limit)", () => {
    const r = createAccountSchema.safeParse({
      name: "Marcus",
      type: "Savings",
      monthlyContributionLimit: null,
    });
    expect(r.success).toBe(true);
  });
  it("rejects negative numbers", () => {
    const r = createAccountSchema.safeParse({
      name: "Marcus",
      type: "Savings",
      monthlyContributionLimit: -5,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateAccountSchema — monthlyContributionLimit", () => {
  it("accepts setting and clearing the limit", () => {
    expect(updateAccountSchema.safeParse({ monthlyContributionLimit: 300 }).success).toBe(true);
    expect(updateAccountSchema.safeParse({ monthlyContributionLimit: null }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test assets.schemas`
Expected: FAIL — `monthlyContributionLimit` is rejected as an unknown key (Zod strict) or accepted but not validated.

- [ ] **Step 3: Add the field to both schemas**

In `packages/shared/src/schemas/assets.schemas.ts`, add to **both** `createAccountSchema` and `updateAccountSchema`:

```typescript
  monthlyContributionLimit: z.number().min(0).nullable().optional(),
```

Place it immediately after `growthRatePct` in each schema.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test assets.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/assets.schemas.ts packages/shared/src/schemas/__tests__/assets.schemas.test.ts
git commit -m "feat(shared): add monthlyContributionLimit to account schemas"
```

---

### Task 3: Backend service — type-guard validator

**Files:**

- Modify: `apps/backend/src/services/assets.service.ts`
- Test: `apps/backend/src/services/assets.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `assets.service.test.ts` (inside the existing `describe("assetsService.createAccount", ...)` block, or add a new one if absent):

```typescript
describe("assetsService.createAccount — monthlyContributionLimit guard", () => {
  it("rejects a non-null limit on a non-Savings account", async () => {
    await expect(
      assetsService.createAccount(
        HOUSEHOLD_ID,
        { name: "Halifax", type: "Current", monthlyContributionLimit: 200 } as any,
        mockCtx
      )
    ).rejects.toThrow(/Savings/);
  });

  it("accepts a non-null limit on a Savings account", async () => {
    prismaMock.account.create.mockResolvedValue({ id: "a-1" } as any);
    await expect(
      assetsService.createAccount(
        HOUSEHOLD_ID,
        { name: "Marcus", type: "Savings", monthlyContributionLimit: 200 } as any,
        mockCtx
      )
    ).resolves.toBeDefined();
  });
});

describe("assetsService.updateAccount — monthlyContributionLimit guard", () => {
  it("nulls the limit when type changes away from Savings", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
      type: "Savings",
      monthlyContributionLimit: 200,
    } as any);
    prismaMock.account.update.mockResolvedValue({ id: ACCOUNT_ID } as any);
    await assetsService.updateAccount(HOUSEHOLD_ID, ACCOUNT_ID, { type: "Other" } as any, mockCtx);
    const call = prismaMock.account.update.mock.calls.at(-1)?.[0];
    expect(call?.data.monthlyContributionLimit).toBe(null);
  });

  it("rejects setting a non-null limit on a non-Savings account", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
      type: "Current",
    } as any);
    await expect(
      assetsService.updateAccount(
        HOUSEHOLD_ID,
        ACCOUNT_ID,
        { monthlyContributionLimit: 200 } as any,
        mockCtx
      )
    ).rejects.toThrow(/Savings/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.service`
Expected: FAIL — limits are accepted on non-Savings types; type changes don't null the field.

- [ ] **Step 3: Add the guards**

At the top of `assets.service.ts`, near the other helpers, add:

```typescript
function assertLimitOnlyOnSavings(type: AccountType | undefined, limit: unknown) {
  if (limit !== undefined && limit !== null && type !== "Savings") {
    throw new ValidationError("monthlyContributionLimit is only valid on Savings accounts");
  }
}
```

In `createAccount`, immediately after the `assertMemberInHousehold` block:

```typescript
assertLimitOnlyOnSavings(data.type, data.monthlyContributionLimit);
```

In `updateAccount`, replace the existing `mutation` arrow with a version that:

1. Reads the current account inside the transaction so we know its current type.
2. Resolves the effective post-update type.
3. Asserts the limit guard against that effective type.
4. If the effective type is not `Savings` and the existing limit is non-null, includes `monthlyContributionLimit: null` in the patch.

```typescript
  async updateAccount(
    householdId: string,
    accountId: string,
    data: UpdateAccountInput,
    ctx: ActorCtx
  ) {
    await assertAccountOwned(householdId, accountId);
    if (data.memberId) {
      await assertMemberInHousehold(householdId, data.memberId);
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
      mutation: async (tx) => {
        const existing = await tx.account.findUnique({ where: { id: accountId } });
        const effectiveType = (data.type ?? existing?.type) as AccountType | undefined;
        assertLimitOnlyOnSavings(effectiveType, data.monthlyContributionLimit);
        const patch: Record<string, unknown> = { ...data };
        if (effectiveType !== "Savings" && existing?.monthlyContributionLimit != null) {
          patch.monthlyContributionLimit = null;
        }
        return tx.account.update({ where: { id: accountId }, data: patch });
      },
    });
  },
```

> Note: `UpdateAccountInput` does **not** currently include `type` (account type is set on creation only). The `data.type` reference is defensive — if a future update adds it, the guard already covers it. TypeScript will require a cast if `UpdateAccountInput` does not declare `type`; use `(data as { type?: AccountType }).type` if the strict compiler complains.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/assets.service.ts apps/backend/src/services/assets.service.test.ts
git commit -m "feat(accounts): guard monthlyContributionLimit to Savings type"
```

---

### Task 4: Backend service — derive spare/over-cap and `higherRateTarget` in `listAccountsByType`

**Files:**

- Modify: `apps/backend/src/services/assets.service.ts`
- Test: `apps/backend/src/services/assets.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `assets.service.test.ts`:

```typescript
describe("assetsService.listAccountsByType — derived limit fields", () => {
  it("derives spareMonthly, hasSpareCapacityNudge, higherRateTarget, and isOverCap", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a-low",
        name: "Lloyds Club",
        type: "Savings",
        memberId: "m-1",
        growthRatePct: 3.5,
        monthlyContributionLimit: 200,
        balances: [],
        linkedItems: [{ id: "li-1", name: "Saver", spendType: "monthly" }],
      },
      {
        id: "a-high",
        name: "Marcus Easy Access",
        type: "Savings",
        memberId: "m-1",
        growthRatePct: 4.6,
        monthlyContributionLimit: null,
        balances: [],
        linkedItems: [],
      },
      // Other-member account — must NOT be a candidate
      {
        id: "a-other",
        name: "Bob's Saver",
        type: "Savings",
        memberId: "m-2",
        growthRatePct: 6.0,
        monthlyContributionLimit: null,
        balances: [],
        linkedItems: [],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      { itemId: "li-1", amount: 125 },
    ] as any);

    const accounts = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");
    const low = accounts.find((a) => a.id === "a-low")!;
    expect(low.monthlyContribution).toBe(125);
    expect(low.spareMonthly).toBe(75);
    expect(low.isOverCap).toBe(false);
    expect(low.hasSpareCapacityNudge).toBe(true);
    expect(low.higherRateTarget?.id).toBe("a-high"); // m-2 excluded
    expect(low.higherRateTarget?.growthRatePct).toBe(4.6);

    const high = accounts.find((a) => a.id === "a-high")!;
    expect(high.spareMonthly).toBeNull();
    expect(high.hasSpareCapacityNudge).toBe(false);
    expect(high.higherRateTarget).toBeNull();
  });

  it("flags a single linked item whose raw amount exceeds the cap", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a-1",
        name: "Lloyds Club",
        type: "Savings",
        memberId: null,
        growthRatePct: 3.5,
        monthlyContributionLimit: 200,
        balances: [],
        linkedItems: [{ id: "li-yearly", name: "ISA top-up", spendType: "annual" }],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      { itemId: "li-yearly", amount: 1200 },
    ] as any);
    const [acc] = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");
    expect(acc.linkedItems[0]!.lumpSumExceedsCap).toBe(true);
    expect(acc.monthlyContribution).toBeCloseTo(100); // 1200/12
    expect(acc.isOverCap).toBe(false);
  });

  it("computes isOverCap and suppresses spare-capacity nudge when over-cap", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a-1",
        name: "Lloyds Club",
        type: "Savings",
        memberId: null,
        growthRatePct: 3.5,
        monthlyContributionLimit: 200,
        balances: [],
        linkedItems: [{ id: "li-1", name: "Saver", spendType: "monthly" }],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([
      { itemId: "li-1", amount: 250 },
    ] as any);
    const [acc] = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");
    expect(acc.isOverCap).toBe(true);
    expect(acc.hasSpareCapacityNudge).toBe(false);
    expect(acc.spareMonthly).toBe(-50);
  });

  it("excludes candidates whose effective rate cannot be resolved", async () => {
    prismaMock.account.findMany.mockResolvedValue([
      {
        id: "a-low",
        name: "L",
        type: "Savings",
        memberId: null,
        growthRatePct: 3.5,
        monthlyContributionLimit: 200,
        balances: [],
        linkedItems: [],
      },
      {
        id: "a-norate",
        name: "N",
        type: "Savings",
        memberId: null,
        growthRatePct: null,
        monthlyContributionLimit: null,
        balances: [],
        linkedItems: [],
      },
    ] as any);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([] as any);
    prismaMock.householdSettings.findUnique.mockResolvedValue(null as any);
    const [low] = await assetsService.listAccountsByType(HOUSEHOLD_ID, "Savings");
    expect(low.higherRateTarget).toBeNull();
    expect(low.hasSpareCapacityNudge).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.service`
Expected: FAIL — derived fields don't exist on the returned shape.

- [ ] **Step 3: Implement derivation**

Modify `listAccountsByType`. Inside the same function, after computing `monthlyContribution`:

```typescript
  async listAccountsByType(householdId: string, type: AccountType) {
    const accounts = await prisma.account.findMany({
      where: { householdId, type },
      include: {
        balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
        linkedItems: { select: { id: true, name: true, spendType: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const allLinkedItemIds = accounts.flatMap((a) => a.linkedItems.map((i) => i.id));
    const now = new Date();
    const activePeriods =
      allLinkedItemIds.length > 0
        ? await prisma.itemAmountPeriod.findMany({
            where: {
              itemType: "discretionary_item",
              itemId: { in: allLinkedItemIds },
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gt: now } }],
            },
          })
        : [];

    const amountByItemId = new Map<string, number>();
    for (const period of activePeriods) {
      amountByItemId.set(period.itemId, period.amount);
    }

    // For Savings-type queries we also need the household's effective Savings rate
    // to resolve targets whose growthRatePct is null.
    let savingsDefaultRate: number | null = null;
    let savingsPeerPool: typeof accounts | null = null;
    if (type === "Savings") {
      const settings = await prisma.householdSettings.findUnique({ where: { householdId } });
      savingsDefaultRate = settings?.savingsRatePct ?? null;
      // Peer pool = ALL Savings accounts in household (including ones from other types-of-list calls
      // would be empty — we only fetched Savings here, so `accounts` already is the peer pool).
      savingsPeerPool = accounts;
    }

    function effectiveRate(a: { growthRatePct: number | null }): number | null {
      return a.growthRatePct ?? savingsDefaultRate;
    }

    return accounts.map((a) => {
      const latest = getLatestBalance(a.balances);
      const linkedItems = a.linkedItems.map((item) => {
        const amount = amountByItemId.get(item.id) ?? 0;
        const lumpSumExceedsCap =
          a.monthlyContributionLimit != null && amount > a.monthlyContributionLimit;
        return { ...item, amount, lumpSumExceedsCap };
      });
      const monthlyContribution = linkedItems.reduce(
        (sum, item) => sum + toMonthlyAmount(item.amount, item.spendType),
        0
      );

      // Derived limit fields — only meaningful for Savings accounts with a limit set.
      const limit = a.monthlyContributionLimit;
      const spareMonthly = limit != null ? limit - monthlyContribution : null;
      const isOverCap = limit != null && monthlyContribution > limit;
      let higherRateTarget: { id: string; name: string; growthRatePct: number } | null = null;
      let hasSpareCapacityNudge = false;

      if (
        type === "Savings" &&
        limit != null &&
        spareMonthly != null &&
        spareMonthly >= 25 &&
        savingsPeerPool
      ) {
        const myRate = effectiveRate(a);
        if (myRate != null) {
          const candidates = savingsPeerPool
            .filter((c) => c.id !== a.id)
            .filter((c) => c.memberId === a.memberId || c.memberId === null);
          const eligible = candidates
            .map((c) => ({ c, rate: effectiveRate(c) }))
            .filter((x): x is { c: typeof candidates[number]; rate: number } => x.rate != null)
            .filter((x) => x.rate > myRate)
            .filter((x) => {
              if (x.c.monthlyContributionLimit == null) return true;
              const cIds = x.c.linkedItems.map((i) => i.id);
              const cMonthly = cIds.reduce(
                (sum, id) =>
                  sum +
                  toMonthlyAmount(
                    amountByItemId.get(id) ?? 0,
                    x.c.linkedItems.find((i) => i.id === id)!.spendType
                  ),
                0
              );
              return x.c.monthlyContributionLimit - cMonthly > 0;
            })
            .sort((a, b) => b.rate - a.rate || a.c.name.localeCompare(b.c.name));
          const winner = eligible[0];
          if (winner) {
            higherRateTarget = {
              id: winner.c.id,
              name: winner.c.name,
              growthRatePct: winner.rate,
            };
            hasSpareCapacityNudge = true;
          }
        }
      }

      return {
        ...a,
        currentBalance: latest?.value ?? 0,
        currentBalanceDate: latest?.date ?? null,
        linkedItems,
        monthlyContribution,
        spareMonthly,
        isOverCap,
        hasSpareCapacityNudge,
        higherRateTarget,
      };
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/assets.service.ts apps/backend/src/services/assets.service.test.ts
git commit -m "feat(accounts): derive spareMonthly, isOverCap, and higherRateTarget"
```

---

### Task 5: Route-level test for the type-guard rejection

**Files:**

- Test: `apps/backend/src/routes/assets.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Append (or insert near other PATCH `/api/assets/accounts/:id` tests):

```typescript
describe("PATCH /api/assets/accounts/:id — monthlyContributionLimit guard", () => {
  it("returns 400 when setting a non-null limit on a non-Savings account", async () => {
    const { headers, account } = await createAuthedAccount({ type: "Current" });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/assets/accounts/${account.id}`,
      headers,
      payload: { monthlyContributionLimit: 200 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a non-null limit on a Savings account", async () => {
    const { headers, account } = await createAuthedAccount({ type: "Savings" });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/assets/accounts/${account.id}`,
      headers,
      payload: { monthlyContributionLimit: 200 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().monthlyContributionLimit).toBe(200);
  });
});
```

> Use the test file's existing `createAuthedAccount` (or equivalent) helper. If no such helper exists, mirror the setup pattern used by the closest existing PATCH test.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.routes`
Expected: FAIL — without the service guard wired through validation, the request goes through.

- [ ] **Step 3: No new code needed** — the guard from Task 3 already enforces this. The test exists to lock in route-level behaviour.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts assets.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/assets.routes.test.ts
git commit -m "test(accounts): route guard for monthlyContributionLimit on non-Savings"
```

---

### Task 6: Frontend types — extend `AccountItem` and `LinkedContributionItem`

**Files:**

- Modify: `apps/frontend/src/services/assets.service.ts`

- [ ] **Step 1: Edit the type definitions**

In `LinkedContributionItem`, add:

```typescript
lumpSumExceedsCap: boolean;
```

In `AccountItem`, add (after `monthlyContribution`):

```typescript
  monthlyContributionLimit: number | null;
  spareMonthly: number | null;
  isOverCap: boolean;
  hasSpareCapacityNudge: boolean;
  higherRateTarget: { id: string; name: string; growthRatePct: number } | null;
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS — no consumer of these types is broken because every new field is additive.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/services/assets.service.ts
git commit -m "feat(frontend): extend AccountItem with limit derivations"
```

---

### Task 7: `AccountForm` — render the limit field for Savings only

**Files:**

- Modify: `apps/frontend/src/components/assets/AccountForm.tsx`

- [ ] **Step 1: Update the form**

1. Add `initialMonthlyContributionLimit?: number | null` to `Props`.
2. Add to `onSave`'s data shape: `monthlyContributionLimit: number | null`.
3. Add state: `const [limitRaw, setLimitRaw] = useState(initialMonthlyContributionLimit != null ? initialMonthlyContributionLimit.toString() : "");` and a `limitError` slot.
4. In `handleSave`, parse the limit (blank → `null`; numeric → number; reject NaN or `< 0`) and include `monthlyContributionLimit` in the saved payload.
5. Render the field block **only when `type === "Savings"`**, immediately below the growth rate override:

```tsx
{
  type === "Savings" && (
    <div className="col-span-2 flex flex-col gap-1">
      <label className={labelClass}>Monthly contribution limit (optional)</label>
      <input
        type="number"
        step="1"
        min="0"
        value={limitRaw}
        onChange={(e) => {
          setLimitRaw(e.target.value);
          setLimitError(null);
        }}
        placeholder="£0"
        aria-label="Monthly contribution limit"
        className={[inputClass, "font-numeric", limitError ? "border-amber-400/60" : ""].join(" ")}
      />
      {limitError ? (
        <p className="-mt-0.5 text-xs text-amber-400">{limitError}</p>
      ) : (
        <p className="text-[11px] text-text-muted">
          The most this account lets you pay in each month. finplan uses this to flag spare capacity
          and surface higher-rate alternatives.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Pass the field through callers**

In `apps/frontend/src/components/assets/AccountItemArea.tsx` and `AssetAccountRow.tsx` wherever `AccountForm` is rendered, pass `initialMonthlyContributionLimit={(item as AccountItem).monthlyContributionLimit ?? null}` (edit mode). In the create mutation `onSave` callback, forward `monthlyContributionLimit` into `createAccount.mutateAsync({...})`. In the update mutation `onSave` callback, forward it into `updateAccount.mutateAsync({...data})`.

- [ ] **Step 3: Verify build & lint**

Run: `bun run lint && bun run type-check`
Expected: zero warnings, zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/assets/AccountForm.tsx apps/frontend/src/components/assets/AccountItemArea.tsx apps/frontend/src/components/assets/AssetAccountRow.tsx
git commit -m "feat(frontend): show monthly contribution limit field for Savings"
```

---

### Task 8: New component — `SavingsContributionNudge`

**Files:**

- Create: `apps/frontend/src/components/assets/SavingsContributionNudge.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { AccountItem } from "@/services/assets.service";
import { formatCurrency } from "@/utils/format";
import { NudgeCard } from "@/components/common/NudgeCard";

interface Props {
  account: AccountItem;
  showPence: boolean;
}

function fmtRate(pct: number) {
  return `${pct.toFixed(1)}%`;
}

export function SavingsContributionNudge({ account, showPence }: Props) {
  if (account.type !== "Savings" || account.monthlyContributionLimit == null) return null;

  // Over-cap takes precedence; the two states are mutually exclusive by construction.
  if (account.isOverCap) {
    const monthly = account.monthlyContribution;
    const limit = account.monthlyContributionLimit;
    const over = monthly - limit;
    return (
      <NudgeCard
        message={
          `Linked contributions total ${formatCurrency(monthly, showPence)}/mo — ` +
          `${formatCurrency(over, showPence)} over this account's ${formatCurrency(limit, showPence)}/mo limit. ` +
          `The cap is set on the account; review the linked Discretionary items if this is unintended.`
        }
      />
    );
  }

  if (account.hasSpareCapacityNudge && account.higherRateTarget && account.spareMonthly != null) {
    const spare = account.spareMonthly;
    const target = account.higherRateTarget;
    const myRate = account.growthRatePct ?? 0;
    const annualUplift = Math.round((spare * 12 * (target.growthRatePct - myRate)) / 100);
    return (
      <NudgeCard
        message={
          `${formatCurrency(spare, showPence)}/mo spare on this account. ` +
          `${target.name} pays ${fmtRate(target.growthRatePct)} vs ${fmtRate(myRate)} here — ` +
          `redirecting could earn ~£${annualUplift}/yr more.`
        }
      />
    );
  }

  return null;
}
```

- [ ] **Step 2: Verify build & lint**

Run: `bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/assets/SavingsContributionNudge.tsx
git commit -m "feat(frontend): add SavingsContributionNudge component"
```

---

### Task 9: `AssetAccountRow` — capacity meter, total/mo line, lump-sum annotation, dot trigger

**Files:**

- Modify: `apps/frontend/src/components/assets/AssetAccountRow.tsx`

- [ ] **Step 1: Update the row**

1. Compute the dot trigger: replace the existing

   ```tsx
   {
     stale && <span className="h-1.5 w-1.5 rounded-full bg-attention shrink-0" aria-hidden />;
   }
   ```

   with:

   ```tsx
   {
     (() => {
       const a = item as AccountItem;
       const hasLimitNudge = itemKind === "account" && (a.isOverCap || a.hasSpareCapacityNudge);
       const showDot = stale || hasLimitNudge;
       return showDot ? (
         <span className="h-1.5 w-1.5 rounded-full bg-attention shrink-0" aria-hidden />
       ) : null;
     })();
   }
   ```

2. In the "Monthly Contributions" detail block (already present for accounts with linked items), augment each linked-item row to show the lump-sum annotation when set:

   ```tsx
   <div key={li.id} className="flex justify-between text-xs">
     <span className="text-text-tertiary">
       {li.name}
       {li.lumpSumExceedsCap && (
         <span
           className="ml-1.5 text-[10px] text-attention"
           aria-label="Single payment exceeds the monthly cap"
         >
           · over cap (raw)
         </span>
       )}
     </span>
     <span className="font-numeric text-text-secondary">
       {formatCurrency(li.amount, showPence)}
       {li.spendType !== "monthly" && (
         <span className="ml-1 text-[10px] text-text-muted">/{li.spendType}</span>
       )}
     </span>
   </div>
   ```

3. Replace the existing "Total/mo" footer line with a limit-aware version:
   ```tsx
   {
     (() => {
       const a = item as AccountItem;
       if (a.monthlyContributionLimit == null) {
         return (
           <div className="flex justify-between text-xs border-t border-foreground/5 pt-1 mt-0.5">
             <span className="text-text-muted">Total/mo</span>
             <span className="font-numeric font-medium text-page-accent/80">
               {formatCurrency(a.monthlyContribution, showPence)}
             </span>
           </div>
         );
       }
       const used = a.monthlyContribution;
       const limit = a.monthlyContributionLimit;
       const pct = Math.min(100, Math.max(0, (used / limit) * 100));
       return (
         <>
           <div className="flex justify-between text-xs border-t border-foreground/5 pt-1 mt-0.5">
             <span className="text-text-muted">Total/mo</span>
             <span
               className={[
                 "font-numeric font-medium",
                 a.isOverCap ? "text-attention" : "text-page-accent/80",
               ].join(" ")}
             >
               {formatCurrency(used, showPence)} / {formatCurrency(limit, showPence)}
             </span>
           </div>
           <div className="h-1 mt-1 rounded-sm bg-foreground/[0.05] overflow-hidden">
             <div
               className={[
                 "h-full rounded-sm",
                 a.isOverCap ? "bg-attention" : "bg-tier-discretionary",
               ].join(" ")}
               style={{ width: `${pct}%` }}
             />
           </div>
           {a.isOverCap && (
             <p className="text-[11px] text-attention mt-1">
               Over cap by {formatCurrency(used - limit, showPence)}/mo
             </p>
           )}
         </>
       );
     })();
   }
   ```

> Note: `bg-tier-discretionary` token must exist in Tailwind config. If not, replace with the existing utility class used by tier-discretionary purple in `design-tokens.md` (likely `bg-[hsl(var(--tier-discretionary))]`).

- [ ] **Step 2: Verify build & lint**

Run: `bun run lint && bun run type-check`
Expected: PASS — `min-h-0`, `overflow-y-auto`, no hex/rgba in `className` strings.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/assets/AssetAccountRow.tsx
git commit -m "feat(frontend): capacity meter, total/mo, and limit dot on AssetAccountRow"
```

---

### Task 10: `AccountItemArea` — render the nudge for the expanded Savings account

**Files:**

- Modify: `apps/frontend/src/components/assets/AccountItemArea.tsx`

- [ ] **Step 1: Render the nudge**

After the `AssetAccountRow` for the expanded item (and only when the row is expanded and not editing), render `<SavingsContributionNudge account={item} showPence={showPence} />` in the right-panel content area for Savings accounts.

The simplest placement: inside the existing `{items?.map((item) => (...))}` block, render the nudge as a sibling of the row, conditional on `expandedId === item.id && !editingId === item.id && type === "Savings"`. Margin: `mt-2 mx-4`. Use the existing `NudgeCard` motion (already in the component) — `SavingsContributionNudge` returns the bare `NudgeCard` which animates itself.

```tsx
import { SavingsContributionNudge } from "./SavingsContributionNudge.js";

// inside items?.map(...) — after <AssetAccountRow ... />
{
  type === "Savings" && expandedId === item.id && editingId !== item.id && (
    <div className="px-4 pt-2">
      <SavingsContributionNudge account={item} showPence={showPence} />
    </div>
  );
}
```

- [ ] **Step 2: Verify build & lint**

Run: `bun run lint && bun run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/assets/AccountItemArea.tsx
git commit -m "feat(frontend): render SavingsContributionNudge in AccountItemArea"
```

---

### Task 11: `definitions.md` — add "Monthly contribution limit"

**Files:**

- Modify: `docs/2. design/definitions.md`

- [ ] **Step 1: Add entry**

Append a new entry alongside other Wealth-page definitions, matching the existing `**Term**: tooltip` format:

```markdown
## Monthly contribution limit

**Appears in**: Account form (Savings), Account detail panel

**Tooltip**: The most this account lets you pay in each month. finplan uses this to flag spare capacity and surface higher-rate alternatives among your other savings accounts.
```

- [ ] **Step 2: Commit**

```bash
git add "docs/2. design/definitions.md"
git commit -m "docs(definitions): add Monthly contribution limit"
```

---

## Breaking change impact analysis

The plan adds one nullable schema column and four additive derived fields on the read path. No field is removed, renamed, or moved. Consumer trace:

| Change                                                                                                | Consumer                                           | Updated by task |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------- |
| New `Account.monthlyContributionLimit` column                                                         | Backend `assets.service.listAccountsByType` (read) | Task 4          |
|                                                                                                       | Backend `createAccount`/`updateAccount` validators | Task 3          |
|                                                                                                       | Frontend `AccountItem` type                        | Task 6          |
|                                                                                                       | Frontend `AccountForm` (write path)                | Task 7          |
|                                                                                                       | Frontend `AssetAccountRow` (read path)             | Task 9          |
| New derived `spareMonthly`, `isOverCap`, `hasSpareCapacityNudge`, `higherRateTarget` on list response | Frontend `AccountItem` type                        | Task 6          |
|                                                                                                       | Frontend `SavingsContributionNudge`                | Task 8          |
|                                                                                                       | Frontend `AssetAccountRow` (dot trigger, meter)    | Task 9          |
|                                                                                                       | Frontend `AccountItemArea`                         | Task 10         |
| New per-linked-item `lumpSumExceedsCap`                                                               | Frontend `LinkedContributionItem` type             | Task 6          |
|                                                                                                       | Frontend `AssetAccountRow` (annotation)            | Task 9          |

No other consumers of the accounts list response exist — `assetsService.getSummary` reads only `balances`, and `forecast.service` projects from balances + rates and is unaffected by the new field. No tRPC consumers (the backend is plain Fastify routes for accounts). No shared-type exports were removed.

## Testing

### Backend Tests

- [ ] Service: limit guard rejects non-null on non-Savings (Task 3)
- [ ] Service: type-change-away nulls the limit (Task 3)
- [ ] Service: derives `spareMonthly`, `isOverCap`, `hasSpareCapacityNudge`, `higherRateTarget` correctly (Task 4)
- [ ] Service: lump-sum flag set when any single raw amount exceeds the cap (Task 4)
- [ ] Service: candidates with unresolved effective rate are excluded (Task 4)
- [ ] Service: same-member + household-owned candidates only; other-member candidates excluded (Task 4)
- [ ] Endpoint: `PATCH /api/assets/accounts/:id` with limit on Current returns 400 (Task 5)

### Frontend Tests

- [ ] No new component tests required — `SavingsContributionNudge` is a pure presentational wrapper around the already-tested `NudgeCard`. The acceptance criteria are visually verifiable; deeper coverage would gild.

### Key Scenarios

- [ ] Happy path: User edits a Savings account, enters a £200 limit, saves; reopens and sees the value persisted; expands the row and sees the capacity meter at the correct percentage.
- [ ] Spare-capacity nudge: User has Lloyds Club at 3.5% with £125/mo linked and £200 limit, plus Marcus Easy Access at 4.6% with no limit. Expanding Lloyds shows a single `NudgeCard` referencing Marcus and an annual uplift of `~£14/yr`.
- [ ] Over-cap: Lump-sum yearly £3,000 ISA top-up linked to a £200/mo cap. Detail panel shows `lumpSumExceedsCap` annotation on the line; if the normalised total exceeds the cap, the over-cap nudge appears with amber meter.
- [ ] Silence: Account with no limit set shows no meter, no nudge, no row dot — even with linked contributions.
- [ ] Member scoping: Alice's Savings account does not get a nudge pointing at Bob's higher-rate Savings account.

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `cd apps/backend && bun scripts/run-tests.ts assets` passes
- [ ] `bun run type-check` passes
- [ ] Manual: in the running app (`bun run start`), edit a Savings account → enter a limit → confirm the field persists; link a Discretionary item exceeding the cap → confirm the over-cap nudge appears; create a higher-rate peer → confirm the spare-capacity nudge appears with correct arithmetic; collapse the row → confirm the amber dot disambiguates only via expansion.
- [ ] Audit: in `audit-log.routes` test output or the audit log UI, the `UPDATE_ACCOUNT` action records the `monthlyContributionLimit` before/after value alongside other fields.

## Post-conditions

- [ ] Savings accounts can carry a per-account monthly contribution cap.
- [ ] The Wealth → Savings panel surfaces a single arithmetic nudge for spare-capacity or over-cap conditions.
- [ ] No new endpoints, no new visual tokens, no new frontend hooks — the feature lands fully on existing infrastructure.
