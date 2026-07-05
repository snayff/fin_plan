---
feature: data_export_import
category: infrastructure
spec: docs/4. planning/data_export_import/data_export_import-spec.md
creation_date: 2026-04-06
status: implemented
implemented_date: 2026-07-05
---

# Data Export & Import — Implementation Plan

> **For Claude:** Use `/execute-plan data_export_import` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Decouple members from user accounts, add household creation UI, and implement JSON-based household data export/import.
**Spec:** `docs/4. planning/data_export_import/data_export_import-spec.md`
**Architecture:** Replace the composite-PK `HouseholdMember` join table with a standalone `Member` entity (own ID, optional userId link). Build member CRUD service with reassignment-on-delete. Rework `HouseholdSwitcher` into an always-interactive dropdown with "Create new household". Add export service that assembles all household data into a versioned JSON file, and import service that validates via Zod and supports overwrite/create-new modes — both transactional. New "Data" section in Settings page for the UI.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: yes

## Pre-conditions

- [ ] All existing tests pass (`cd apps/backend && bun scripts/run-tests.ts`)
- [ ] `bun run lint` and `bun run type-check` pass clean

## Tasks

---

### Phase 1: Member Model Migration

> Replace `HouseholdMember` (composite PK `householdId_userId`) with `Member` (own ID, optional userId). This is the foundation — everything else depends on it.

---

### Task 1: Add Member model to Prisma schema

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`

This is additive only — we add the new `Member` model alongside the existing `HouseholdMember`. Both coexist temporarily so the codebase still compiles.

- [ ] **Step 1: Add Member model to schema**

Add after the `HouseholdMember` model in `apps/backend/prisma/schema.prisma`:

```prisma
model Member {
  id             String        @id @default(cuid())
  householdId    String        @map("household_id")
  userId         String?       @map("user_id")
  name           String
  role           HouseholdRole @default(member)
  dateOfBirth    DateTime?     @map("date_of_birth")
  retirementYear Int?          @map("retirement_year")
  joinedAt       DateTime      @default(now()) @map("joined_at")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")
  household      Household     @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user           User?         @relation("MemberUser", fields: [userId], references: [id], onDelete: SetNull)

  @@unique([householdId, userId])
  @@index([householdId])
  @@index([userId])
  @@map("members")
}
```

Update the `User` model to add the reverse relation:

```prisma
// Add to User model fields:
memberProfiles   Member[]          @relation("MemberUser")
```

Update the `Household` model to add the reverse relation:

```prisma
// Add to Household model fields:
memberProfiles   Member[]
```

- [ ] **Step 2: Run migration**

```bash
bun run db:migrate
# Migration name: add_member_model
```

- [ ] **Step 3: Verify schema is valid**

```bash
cd apps/backend && npx prisma validate
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/
git commit -m "feat(schema): add standalone Member model alongside HouseholdMember"
```

---

### Task 2: Data migration — copy HouseholdMember rows to Member

**Files:**

- Create: `apps/backend/prisma/migrate-to-members.ts`

Write a one-time migration script that copies all existing `HouseholdMember` rows into the new `Member` table, pulling the user's name from the `User` table.

- [ ] **Step 1: Write migration script**

```typescript
// apps/backend/prisma/migrate-to-members.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existingMembers = await prisma.householdMember.findMany({
    include: { user: { select: { id: true, name: true } } },
  });

  console.log(`Found ${existingMembers.length} HouseholdMember rows to migrate`);

  for (const hm of existingMembers) {
    const existing = await prisma.member.findFirst({
      where: { householdId: hm.householdId, userId: hm.userId },
    });
    if (existing) {
      console.log(`  Skipping ${hm.userId} in ${hm.householdId} — already migrated`);
      continue;
    }

    await prisma.member.create({
      data: {
        householdId: hm.householdId,
        userId: hm.userId,
        name: hm.user.name,
        role: hm.role,
        dateOfBirth: hm.dateOfBirth,
        retirementYear: hm.retirementYear,
        joinedAt: hm.joinedAt,
      },
    });
    console.log(`  Migrated ${hm.user.name} (${hm.userId}) in ${hm.householdId}`);
  }

  // Update ownerId on waterfall items: currently stores userId, needs memberId
  const members = await prisma.member.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true, householdId: true },
  });

  const memberByHouseholdUser = new Map<string, string>();
  for (const m of members) {
    memberByHouseholdUser.set(`${m.householdId}:${m.userId}`, m.id);
  }

  // Migrate IncomeSource.ownerId
  const incomeSources = await prisma.incomeSource.findMany({
    where: { ownerId: { not: null } },
    select: { id: true, householdId: true, ownerId: true },
  });
  for (const item of incomeSources) {
    const memberId = memberByHouseholdUser.get(`${item.householdId}:${item.ownerId}`);
    if (memberId) {
      await prisma.incomeSource.update({ where: { id: item.id }, data: { ownerId: memberId } });
    }
  }

  // Migrate CommittedItem.ownerId
  const committedItems = await prisma.committedItem.findMany({
    where: { ownerId: { not: null } },
    select: { id: true, householdId: true, ownerId: true },
  });
  for (const item of committedItems) {
    const memberId = memberByHouseholdUser.get(`${item.householdId}:${item.ownerId}`);
    if (memberId) {
      await prisma.committedItem.update({ where: { id: item.id }, data: { ownerId: memberId } });
    }
  }

  // Migrate Asset.memberUserId
  const assets = await prisma.asset.findMany({
    where: { memberUserId: { not: null } },
    select: { id: true, householdId: true, memberUserId: true },
  });
  for (const item of assets) {
    const memberId = memberByHouseholdUser.get(`${item.householdId}:${item.memberUserId}`);
    if (memberId) {
      await prisma.asset.update({ where: { id: item.id }, data: { memberUserId: memberId } });
    }
  }

  // Migrate Account.memberUserId
  const accounts = await prisma.account.findMany({
    where: { memberUserId: { not: null } },
    select: { id: true, householdId: true, memberUserId: true },
  });
  for (const item of accounts) {
    const memberId = memberByHouseholdUser.get(`${item.householdId}:${item.memberUserId}`);
    if (memberId) {
      await prisma.account.update({ where: { id: item.id }, data: { memberUserId: memberId } });
    }
  }

  console.log("Migration complete");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend && bun prisma/migrate-to-members.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/prisma/migrate-to-members.ts
git commit -m "feat(migration): copy HouseholdMember data to Member model"
```

---

### Task 3: Update test infrastructure

**Files:**

- Modify: `apps/backend/src/test/mocks/prisma.ts`
- Modify: `apps/backend/src/test/fixtures/index.ts`

- [ ] **Step 1: Add Member mock to prismaMock**

In `apps/backend/src/test/mocks/prisma.ts`, add `member: buildModelMock()` to the prismaMock object.

- [ ] **Step 2: Update fixtures**

In `apps/backend/src/test/fixtures/index.ts`, add `buildMember` function and keep `buildHouseholdMember` as a compat alias:

```typescript
export function buildMember(overrides: Record<string, any> = {}) {
  const id = nextId();
  return {
    id,
    householdId: "household-1",
    userId: "user-1",
    name: "Test User",
    role: "owner" as const,
    dateOfBirth: null,
    retirementYear: null,
    joinedAt: new Date("2025-01-01T00:00:00Z"),
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/test/mocks/prisma.ts apps/backend/src/test/fixtures/index.ts
git commit -m "refactor(test): add Member mock and fixture for migration"
```

---

### Task 4: Migrate auth middleware to Member model

**Files:**

- Modify: `apps/backend/src/middleware/auth.middleware.ts`
- Modify: `apps/backend/src/middleware/auth.middleware.test.ts`

- [ ] **Step 1: Update auth middleware**

In `apps/backend/src/middleware/auth.middleware.ts`, replace:

```typescript
const membership = await prisma.householdMember.findUnique({
  where: {
    householdId_userId: {
      householdId: user.activeHouseholdId,
      userId: resolvedUserId,
    },
  },
  select: { role: true },
});
```

With:

```typescript
const membership = await prisma.member.findFirst({
  where: {
    householdId: user.activeHouseholdId,
    userId: resolvedUserId,
  },
  select: { role: true },
});
```

And replace the fallback query:

```typescript
const fallback = await prisma.householdMember.findFirst({
  where: { userId: resolvedUserId },
  orderBy: { joinedAt: "asc" },
  select: { householdId: true },
});
```

With:

```typescript
const fallback = await prisma.member.findFirst({
  where: { userId: resolvedUserId },
  orderBy: { joinedAt: "asc" },
  select: { householdId: true },
});
```

- [ ] **Step 2: Update auth middleware tests**

Replace all `prismaMock.householdMember.findUnique` with `prismaMock.member.findFirst` and `prismaMock.householdMember.findFirst` with `prismaMock.member.findFirst` in the test file. Update mock return values to include `id` and `name` fields from `buildMember`.

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts auth.middleware
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/middleware/auth.middleware.ts apps/backend/src/middleware/auth.middleware.test.ts
git commit -m "refactor(auth): migrate middleware from HouseholdMember to Member"
```

---

### Task 5: Migrate household.service — assertOwner, assertMember, createHousehold

**Files:**

- Modify: `apps/backend/src/services/household.service.ts`
- Modify: `apps/backend/src/services/household.service.test.ts`

- [ ] **Step 1: Update helpers and createHousehold**

In `household.service.ts`:

Replace `assertOwner`:

```typescript
async function assertOwner(householdId: string, userId: string) {
  const m = await prisma.member.findFirst({
    where: { householdId, userId },
  });
  if (!m || m.role !== "owner") {
    throw new AuthorizationError("Only household owners can perform this action");
  }
  return m;
}
```

Replace `assertMember`:

```typescript
async function assertMember(householdId: string, userId: string) {
  const m = await prisma.member.findFirst({
    where: { householdId, userId },
  });
  if (!m) throw new AuthorizationError("Not a member of this household");
  return m;
}
```

Update `createHousehold`:

```typescript
async createHousehold(userId: string, name: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const household = await prisma.household.create({
    data: { name },
  });
  await prisma.member.create({
    data: {
      householdId: household.id,
      userId,
      name: user?.name ?? "Owner",
      role: "owner",
    },
  });
  await prisma.householdSettings.create({ data: { householdId: household.id } });
  await subcategoryService.seedDefaults(household.id);
  return household;
},
```

Update `getUserHouseholds`:

```typescript
async getUserHouseholds(userId: string) {
  return prisma.member.findMany({
    where: { userId },
    include: {
      household: {
        include: {
          _count: { select: { memberProfiles: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
},
```

- [ ] **Step 2: Update tests**

Replace all `prismaMock.householdMember` calls with `prismaMock.member` equivalents in the corresponding test sections. Use `buildMember()` instead of `buildHouseholdMember()`. Update `household.create` mock expectations to not include nested `members: { create: ... }`.

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts household.service
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/household.service.ts apps/backend/src/services/household.service.test.ts
git commit -m "refactor(household): migrate core helpers and createHousehold to Member"
```

---

### Task 6: Migrate household.service — getHouseholdDetails, removeMember, leaveHousehold

**Files:**

- Modify: `apps/backend/src/services/household.service.ts`
- Modify: `apps/backend/src/services/household.service.test.ts`

- [ ] **Step 1: Update getHouseholdDetails**

```typescript
async getHouseholdDetails(householdId: string, requestingUserId: string) {
  await assertMember(householdId, requestingUserId);

  return prisma.household.findUnique({
    where: { id: householdId },
    include: {
      memberProfiles: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      invites: {
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
},
```

- [ ] **Step 2: Update removeMember**

Replace all `prisma.householdMember.delete/findUnique/findFirst` with `prisma.member` equivalents. The key change: `removeMember` now takes a `memberId` (the Member record's ID) instead of `targetUserId`. Find the member by ID, verify it's in the right household, check it has a userId, then delete and handle the user's activeHouseholdId fallback.

```typescript
async removeMember(
  householdId: string,
  ownerUserId: string,
  memberId: string,
  ctx?: ActorCtx
) {
  await assertOwner(householdId, ownerUserId);
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target || target.householdId !== householdId) {
    throw new NotFoundError("Member not found");
  }
  if (target.userId === ownerUserId) {
    throw new ValidationError("Owner cannot remove themselves from the household");
  }

  if (ctx) {
    await audited({
      db: prisma,
      ctx,
      action: "REMOVE_MEMBER",
      resource: "member",
      resourceId: memberId,
      beforeFetch: async (tx) =>
        tx.member.findUnique({ where: { id: memberId } }) as Promise<Record<string, unknown> | null>,
      mutation: async (tx) => tx.member.delete({ where: { id: memberId } }),
    });
  } else {
    await prisma.member.delete({ where: { id: memberId } });
  }

  // Clear stale activeHouseholdId if the removed member had a linked user
  if (target.userId) {
    const user = await prisma.user.findUnique({
      where: { id: target.userId },
      select: { activeHouseholdId: true },
    });
    if (user?.activeHouseholdId === householdId) {
      const otherMembership = await prisma.member.findFirst({
        where: { userId: target.userId },
        orderBy: { joinedAt: "asc" },
      });
      await prisma.user.update({
        where: { id: target.userId },
        data: { activeHouseholdId: otherMembership?.householdId ?? null },
      });
    }
  }
},
```

- [ ] **Step 3: Update leaveHousehold**

```typescript
async leaveHousehold(householdId: string, userId: string) {
  const member = await prisma.member.findFirst({
    where: { householdId, userId },
  });
  if (!member) throw new NotFoundError("You are not a member of this household");

  if (member.role === "owner") {
    const ownerCount = await prisma.member.count({
      where: { householdId, role: "owner" },
    });
    if (ownerCount <= 1) {
      throw new ValidationError("You are the sole owner of this household and cannot leave");
    }
  }

  await prisma.member.delete({ where: { id: member.id } });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeHouseholdId: true },
  });
  if (user?.activeHouseholdId === householdId) {
    const otherMembership = await prisma.member.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { activeHouseholdId: otherMembership?.householdId ?? null },
    });
  }
},
```

- [ ] **Step 4: Update tests for all three methods**

Update test mocks from `prismaMock.householdMember.*` to `prismaMock.member.*`. Use `buildMember()` for return values. Adjust `removeMember` test calls to pass `memberId` instead of `targetUserId`.

- [ ] **Step 5: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts household.service
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/household.service.ts apps/backend/src/services/household.service.test.ts
git commit -m "refactor(household): migrate details/remove/leave to Member model"
```

---

### Task 7: Migrate household.service — inviteMember, acceptInvite, joinViaInvite, updateMemberRole

**Files:**

- Modify: `apps/backend/src/services/household.service.ts`
- Modify: `apps/backend/src/services/household.service.test.ts`

- [ ] **Step 1: Update inviteMember**

Replace `prisma.householdMember.findFirst` membership check with `prisma.member.findFirst`.

- [ ] **Step 2: Update acceptInvite**

Inside the transaction, replace:

- `tx.householdMember.create({ data: { householdId, userId, role } })` → `tx.member.create({ data: { householdId, userId, name: newUser.name, role } })`
- Personal household creation: `members: { create: { userId, role: "owner" } }` → create member separately after household creation

- [ ] **Step 3: Update joinViaInvite**

Replace `prisma.householdMember.create` and `prisma.householdMember.findUnique` with `prisma.member` equivalents.

- [ ] **Step 4: Update updateMemberRole**

Replace `db.householdMember.findUnique({ where: { householdId_userId } })` with `db.member.findFirst({ where: { householdId, userId } })` for both caller and target lookups. Update the `mutation` to use `tx.member.update({ where: { id: target.id }, data: { role: newRole } })`.

- [ ] **Step 5: Update all corresponding tests**

- [ ] **Step 6: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts household.service
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/services/household.service.ts apps/backend/src/services/household.service.test.ts
git commit -m "refactor(household): migrate invite/accept/join/role to Member model"
```

---

### Task 8: Migrate household routes

**Files:**

- Modify: `apps/backend/src/routes/households.ts`
- Modify: `apps/backend/src/routes/households.test.ts`

- [ ] **Step 1: Update routes**

Update the member profile route to find the member via `prisma.member.findFirst({ where: { householdId, userId } })` instead of the composite key lookup. Update the `removeMember` route to pass `memberId` (from params) instead of `targetUserId`. Update the role update route similarly.

- [ ] **Step 2: Update route tests**

Replace all `prismaMock.householdMember` references with `prismaMock.member`. Adjust test request params to use `memberId`.

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts households
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/households.ts apps/backend/src/routes/households.test.ts
git commit -m "refactor(routes): migrate household routes to Member model"
```

---

### Task 9: Migrate remaining backend services (waterfall, assets, forecast)

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts` + test
- Modify: `apps/backend/src/services/assets.service.ts` + test
- Modify: `apps/backend/src/services/forecast.service.ts` + test

- [ ] **Step 1: Grep and update all remaining `householdMember` references**

Search all service files for `householdMember` and `HouseholdMember`:

```bash
cd apps/backend && grep -rn "householdMember\|HouseholdMember" src/services/ --include="*.ts"
```

For each occurrence, replace with the `member` equivalent. Key changes:

- `prisma.householdMember.findUnique({ where: { householdId_userId } })` → `prisma.member.findFirst({ where: { householdId, userId } })`
- `prisma.householdMember.findMany` → `prisma.member.findMany`

- [ ] **Step 2: Update corresponding test files**

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts waterfall.service && bun scripts/run-tests.ts assets && bun scripts/run-tests.ts forecast
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/waterfall.service.ts apps/backend/src/services/waterfall.service.test.ts apps/backend/src/services/assets.service.ts apps/backend/src/services/assets.service.test.ts apps/backend/src/services/forecast.service.ts apps/backend/src/services/forecast.service.test.ts
git commit -m "refactor(services): migrate waterfall/assets/forecast to Member model"
```

---

### Task 10: Migrate remaining backend routes + invite

**Files:**

- Modify: `apps/backend/src/routes/settings.routes.ts` + test
- Modify: `apps/backend/src/routes/invite.ts` + test
- Modify: `apps/backend/src/routes/audit-log.routes.ts` + test (if applicable)
- Modify: `apps/backend/src/db/seed.ts` (if it references `householdMember`)
- Modify: Any other backend files with `householdMember` references (grep to find)

- [ ] **Step 1: Sweep and update all remaining route files**

```bash
cd apps/backend && grep -rn "householdMember\|HouseholdMember" src/routes/ --include="*.ts"
```

- [ ] **Step 2: Update tests**

- [ ] **Step 3: Run all backend tests**

```bash
cd apps/backend && bun scripts/run-tests.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/
git commit -m "refactor(routes): migrate all remaining routes to Member model"
```

---

### Task 11: Remove old HouseholdMember model

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Modify: `apps/backend/src/test/mocks/prisma.ts`

- [ ] **Step 1: Remove HouseholdMember from schema**

Delete the `HouseholdMember` model from schema.prisma. Remove the `householdMemberships HouseholdMember[]` relation from the `User` model. Remove `members HouseholdMember[]` from the `Household` model (keep `memberProfiles Member[]`).

- [ ] **Step 2: Run migration**

```bash
bun run db:migrate
# Migration name: remove_household_member_model
```

- [ ] **Step 3: Remove from prisma mock**

Remove `householdMember: buildModelMock()` from `prismaMock` in `apps/backend/src/test/mocks/prisma.ts`.

- [ ] **Step 4: Run all tests**

```bash
cd apps/backend && bun scripts/run-tests.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/ apps/backend/src/test/mocks/prisma.ts
git commit -m "refactor(schema): remove deprecated HouseholdMember model"
```

---

### Task 12: Migrate frontend types and services

**Files:**

- Modify: `apps/frontend/src/services/household.service.ts`

- [ ] **Step 1: Update types**

Replace:

```typescript
export interface HouseholdMember {
  userId: string;
  householdId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}
```

With:

```typescript
export interface Member {
  id: string;
  householdId: string;
  userId: string | null;
  name: string;
  role: "owner" | "admin" | "member";
  dateOfBirth: string | null;
  retirementYear: number | null;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
}
```

Update `HouseholdDetails`:

```typescript
export interface HouseholdDetails extends Household {
  memberProfiles: Member[];
  invites: HouseholdInvite[];
}
```

Update `Membership`:

```typescript
export interface Membership {
  id: string;
  householdId: string;
  userId: string | null;
  name: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  household: Household & {
    _count: { memberProfiles: number };
  };
}
```

Update `removeMember` to take `memberId`:

```typescript
async removeMember(householdId: string, memberId: string): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(
    `/api/households/${householdId}/members/${memberId}`
  );
},
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/services/household.service.ts
git commit -m "refactor(frontend): update household service types for Member model"
```

---

### Task 13: Migrate frontend hooks and components

**Files:**

- Modify: `apps/frontend/src/hooks/useSettings.ts`
- Modify: `apps/frontend/src/components/settings/HouseholdSection.tsx`
- Modify: `apps/frontend/src/components/layout/HouseholdSwitcher.tsx`
- Modify: `apps/frontend/src/components/settings/AuditLogFilters.tsx` (update `HouseholdMember` → `Member` type import)
- Modify: `apps/frontend/src/pages/SettingsPage.test.tsx` (update mock return shape for `useHouseholdMembers`)

- [ ] **Step 1: Update useSettings.ts**

Update `useHouseholdMembers`:

```typescript
export function useHouseholdMembers() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId ?? "";
  const { data } = useHouseholdDetails(householdId);
  const members = data?.household?.memberProfiles ?? [];
  return {
    data: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      firstName: m.name.split(" ")[0] ?? m.name,
      name: m.name,
      role: m.role,
    })),
  };
}
```

Update `useRemoveMember` to pass `memberId`:

```typescript
export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, memberId }: { householdId: string; memberId: string }) =>
      householdService.removeMember(householdId, memberId),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
  });
}
```

- [ ] **Step 2: Update HouseholdSection.tsx**

Update member list rendering to use `member.id` as key, `member.name` for display, and `member.user?.email` (nullable now). Update `removeMember.mutate` to pass `{ householdId, memberId: member.id }`. Update `updateMemberRole` calls to reference members by `member.id`.

Change the `members` variable from `household?.members` to `household?.memberProfiles`.

- [ ] **Step 3: Update HouseholdSwitcher.tsx**

Update `_count.members` to `_count.memberProfiles` in type references.

- [ ] **Step 4: Run type-check and lint**

```bash
bun run type-check && bun run lint
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useSettings.ts apps/frontend/src/components/settings/HouseholdSection.tsx apps/frontend/src/components/layout/HouseholdSwitcher.tsx
git commit -m "refactor(frontend): migrate hooks and components to Member model"
```

---

### Task 14: Full migration verification

**Files:** None (read-only verification)

- [ ] **Step 1: Run all backend tests**

```bash
cd apps/backend && bun scripts/run-tests.ts
```

Expected: ALL PASS

- [ ] **Step 2: Run full quality checks**

```bash
bun run lint && bun run type-check && bun run build
```

Expected: ALL PASS

- [ ] **Step 3: Verify no remaining householdMember references**

```bash
cd apps/backend && grep -rn "householdMember\|HouseholdMember" src/ --include="*.ts" | grep -v node_modules | grep -v ".test." || echo "CLEAN"
cd apps/frontend && grep -rn "householdMember\|HouseholdMember" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules || echo "CLEAN"
```

Expected: CLEAN (or only backward-compat type aliases if any remain)

- [ ] **Step 4: Commit (if any stragglers found)**

---

### Phase 2: Member CRUD + Household Creation

---

### Task 15: Add member Zod schemas to shared package

**Files:**

- Modify: `packages/shared/src/schemas/household.schemas.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/src/schemas/household.schemas.test.ts` (if not exists — check first)

- [ ] **Step 1: Write failing test**

```typescript
// Add to packages/shared/src/schemas/household.schemas.test.ts
import { describe, it, expect } from "bun:test";
import { createMemberSchema, updateMemberSchema } from "./household.schemas";

describe("createMemberSchema", () => {
  it("accepts valid member with name only", () => {
    const result = createMemberSchema.safeParse({ name: "Alice" });
    expect(result.success).toBe(true);
  });

  it("accepts member with all optional fields", () => {
    const result = createMemberSchema.safeParse({
      name: "Alice",
      dateOfBirth: "1990-05-15T00:00:00.000Z",
      retirementYear: 2055,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createMemberSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("updateMemberSchema", () => {
  it("accepts partial update", () => {
    const result = updateMemberSchema.safeParse({ name: "Bob" });
    expect(result.success).toBe(true);
  });

  it("accepts null dateOfBirth to clear it", () => {
    const result = updateMemberSchema.safeParse({ dateOfBirth: null });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/shared && bun test src/schemas/household.schemas.test.ts
```

Expected: FAIL — cannot find `createMemberSchema`

- [ ] **Step 3: Write schemas**

Add to `packages/shared/src/schemas/household.schemas.ts`:

```typescript
export const createMemberSchema = z.object({
  name: z.string().min(1, "Member name is required").trim(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  retirementYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export const updateMemberSchema = z.object({
  name: z.string().min(1, "Member name is required").trim().optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  retirementYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export const deleteMemberSchema = z.object({
  reassignToMemberId: z.string().optional(),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type DeleteMemberInput = z.infer<typeof deleteMemberSchema>;
```

Export from `packages/shared/src/schemas/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/shared && bun test src/schemas/household.schemas.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/household.schemas.ts packages/shared/src/schemas/household.schemas.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add member CRUD Zod schemas"
```

---

### Task 16: Member service — create + list + update

**Files:**

- Create: `apps/backend/src/services/member.service.ts`
- Create: `apps/backend/src/services/member.service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/backend/src/services/member.service.test.ts
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { buildMember, buildHousehold } from "../test/fixtures";

mock.module("../config/database", () => ({ prisma: prismaMock }));

import { memberService } from "./member.service";
import { AuthorizationError, NotFoundError, ValidationError } from "../utils/errors";

beforeEach(() => resetPrismaMocks());

describe("memberService.createMember", () => {
  it("creates a member with name and householdId", async () => {
    const member = buildMember({ name: "Alice", userId: null });
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "owner" }));
    prismaMock.member.create.mockResolvedValue(member);

    const result = await memberService.createMember("household-1", "owner-user", { name: "Alice" });

    expect(prismaMock.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Alice", householdId: "household-1", userId: null }),
      })
    );
    expect(result.name).toBe("Alice");
  });

  it("rejects if caller is not owner", async () => {
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "member" }));
    await expect(
      memberService.createMember("household-1", "non-owner", { name: "Alice" })
    ).rejects.toThrow(AuthorizationError);
  });
});

describe("memberService.listMembers", () => {
  it("returns all members for the household", async () => {
    const members = [buildMember({ name: "Alice" }), buildMember({ name: "Bob" })];
    prismaMock.member.findMany.mockResolvedValue(members);

    const result = await memberService.listMembers("household-1");
    expect(result).toHaveLength(2);
  });
});

describe("memberService.updateMember", () => {
  it("updates member name", async () => {
    const member = buildMember({ name: "Alice" });
    const updated = { ...member, name: "Alice Smith" };
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "owner" }));
    prismaMock.member.findUnique.mockResolvedValue(member);
    prismaMock.member.update.mockResolvedValue(updated);

    const result = await memberService.updateMember("household-1", "owner-user", member.id, {
      name: "Alice Smith",
    });
    expect(result.name).toBe("Alice Smith");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && bun scripts/run-tests.ts member.service
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

```typescript
// apps/backend/src/services/member.service.ts
import { prisma } from "../config/database.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../utils/errors.js";
import type { CreateMemberInput, UpdateMemberInput } from "@finplan/shared";

async function assertCallerIsOwner(householdId: string, userId: string) {
  const caller = await prisma.member.findFirst({
    where: { householdId, userId },
  });
  if (!caller || caller.role !== "owner") {
    throw new AuthorizationError("Only household owners can manage members");
  }
  return caller;
}

export const memberService = {
  async createMember(householdId: string, callerUserId: string, data: CreateMemberInput) {
    await assertCallerIsOwner(householdId, callerUserId);

    return prisma.member.create({
      data: {
        householdId,
        userId: null,
        name: data.name,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        retirementYear: data.retirementYear ?? null,
        role: "member",
      },
    });
  },

  async listMembers(householdId: string) {
    return prisma.member.findMany({
      where: { householdId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
  },

  async updateMember(
    householdId: string,
    callerUserId: string,
    memberId: string,
    data: UpdateMemberInput
  ) {
    await assertCallerIsOwner(householdId, callerUserId);

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.householdId !== householdId) {
      throw new NotFoundError("Member not found");
    }

    return prisma.member.update({
      where: { id: memberId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.dateOfBirth !== undefined
          ? { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }
          : {}),
        ...(data.retirementYear !== undefined ? { retirementYear: data.retirementYear } : {}),
      },
    });
  },

  async deleteMember(
    householdId: string,
    callerUserId: string,
    memberId: string,
    reassignToMemberId?: string
  ) {
    await assertCallerIsOwner(householdId, callerUserId);

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.householdId !== householdId) {
      throw new NotFoundError("Member not found");
    }
    if (member.userId) {
      throw new ValidationError(
        "Cannot delete a member with a linked user account. Use 'Remove member' instead."
      );
    }

    // Check if member has assigned items
    const [incomeCount, committedCount, discretionaryCount, assetCount, accountCount] =
      await Promise.all([
        prisma.incomeSource.count({ where: { householdId, ownerId: memberId } }),
        prisma.committedItem.count({ where: { householdId, ownerId: memberId } }),
        prisma.discretionaryItem.count({ where: { householdId } }), // discretionary doesn't have ownerId — skip
        prisma.asset.count({ where: { householdId, memberUserId: memberId } }),
        prisma.account.count({ where: { householdId, memberUserId: memberId } }),
      ]);

    const totalItems = incomeCount + committedCount + assetCount + accountCount;

    if (totalItems > 0 && !reassignToMemberId) {
      throw new ValidationError(
        `Member has ${totalItems} assigned items. Provide a reassignment target.`
      );
    }

    await prisma.$transaction(async (tx) => {
      if (reassignToMemberId && totalItems > 0) {
        // Verify reassignment target exists
        const target = await tx.member.findUnique({ where: { id: reassignToMemberId } });
        if (!target || target.householdId !== householdId) {
          throw new NotFoundError("Reassignment target member not found");
        }

        await Promise.all([
          tx.incomeSource.updateMany({
            where: { householdId, ownerId: memberId },
            data: { ownerId: reassignToMemberId },
          }),
          tx.committedItem.updateMany({
            where: { householdId, ownerId: memberId },
            data: { ownerId: reassignToMemberId },
          }),
          tx.asset.updateMany({
            where: { householdId, memberUserId: memberId },
            data: { memberUserId: reassignToMemberId },
          }),
          tx.account.updateMany({
            where: { householdId, memberUserId: memberId },
            data: { memberUserId: reassignToMemberId },
          }),
        ]);
      }

      await tx.member.delete({ where: { id: memberId } });
    });
  },

  async getItemCountsForMember(householdId: string, memberId: string) {
    const [income, committed, assets, accounts] = await Promise.all([
      prisma.incomeSource.count({ where: { householdId, ownerId: memberId } }),
      prisma.committedItem.count({ where: { householdId, ownerId: memberId } }),
      prisma.asset.count({ where: { householdId, memberUserId: memberId } }),
      prisma.account.count({ where: { householdId, memberUserId: memberId } }),
    ]);
    return { total: income + committed + assets + accounts, income, committed, assets, accounts };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && bun scripts/run-tests.ts member.service
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/member.service.ts apps/backend/src/services/member.service.test.ts
git commit -m "feat(member): add member CRUD service with reassignment"
```

---

### Task 17: Member CRUD routes

**Files:**

- Modify: `apps/backend/src/routes/households.ts`
- Modify: `apps/backend/src/routes/households.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests for `POST /households/:id/members`, `PATCH /households/:id/members/:memberId`, `DELETE /households/:id/members/:memberId`, and `GET /households/:id/members`.

- [ ] **Step 2: Add routes**

```typescript
// Add to householdRoutes function in households.ts
import { memberService } from "../services/member.service";
import { createMemberSchema, updateMemberSchema, deleteMemberSchema } from "@finplan/shared";

// List members
fastify.get("/households/:id/members", { preHandler: [authMiddleware] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const members = await memberService.listMembers(id);
  return reply.send({ members });
});

// Create member (owner only)
fastify.post(
  "/households/:id/members",
  { preHandler: [authMiddleware] },
  async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const data = createMemberSchema.parse(request.body);
    const member = await memberService.createMember(id, userId, data);
    return reply.status(201).send({ member });
  }
);

// Update member (owner only)
fastify.patch(
  "/households/:id/members/:memberId",
  { preHandler: [authMiddleware] },
  async (request, reply) => {
    const userId = request.user!.userId;
    const { id, memberId } = request.params as { id: string; memberId: string };
    const data = updateMemberSchema.parse(request.body);
    const member = await memberService.updateMember(id, userId, memberId, data);
    return reply.send({ member });
  }
);

// Delete member (owner only, with optional reassignment)
fastify.delete(
  "/households/:id/members/:memberId",
  { preHandler: [authMiddleware] },
  async (request, reply) => {
    const userId = request.user!.userId;
    const { id, memberId } = request.params as { id: string; memberId: string };
    const { reassignToMemberId } = deleteMemberSchema.parse(request.body ?? {});
    await memberService.deleteMember(id, userId, memberId, reassignToMemberId);
    return reply.send({ success: true });
  }
);
```

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts households
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/households.ts apps/backend/src/routes/households.test.ts
git commit -m "feat(routes): add member CRUD endpoints"
```

---

### Task 18: HouseholdSwitcher rework + CreateHouseholdDialog

**Files:**

- Modify: `apps/frontend/src/components/layout/HouseholdSwitcher.tsx`
- Create: `apps/frontend/src/components/layout/CreateHouseholdDialog.tsx`

- [ ] **Step 1: Create CreateHouseholdDialog**

```tsx
// apps/frontend/src/components/layout/CreateHouseholdDialog.tsx
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateHouseholdDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  isPending: boolean;
}

export function CreateHouseholdDialog({
  isOpen,
  onClose,
  onConfirm,
  isPending,
}: CreateHouseholdDialogProps) {
  const [name, setName] = useState("");

  function handleConfirm() {
    if (name.trim()) {
      onConfirm(name.trim());
      setName("");
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create new household</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="household-name">Name</Label>
          <Input
            id="household-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Smith Household"
            autoFocus
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={!name.trim() || isPending}>
            {isPending ? "Creating…" : "Create"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Rework HouseholdSwitcher**

Replace the entire `HouseholdSwitcher.tsx` with an always-interactive dropdown using a popover or custom dropdown. Show all households, active one checked, "Create new household" at bottom.

```tsx
// apps/frontend/src/components/layout/HouseholdSwitcher.tsx
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { householdService } from "@/services/household.service";
import { useAuthStore } from "@/stores/authStore";
import { authService } from "@/services/auth.service";
import { CreateHouseholdDialog } from "./CreateHouseholdDialog";
import { ChevronDown, Check, Plus } from "lucide-react";

export function HouseholdSwitcher() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["households"],
    queryFn: () => householdService.getHouseholds(),
    enabled: !!user,
  });

  const switchMutation = useMutation({
    mutationFn: (id: string) => householdService.switchHousehold(id),
    onSuccess: async () => {
      const { user: updatedUser } = await authService.getCurrentUser(accessToken!);
      setUser(updatedUser, accessToken!);
      qc.invalidateQueries();
      navigate("/overview");
      setIsOpen(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => householdService.createHousehold(name),
    onSuccess: async (_data, _name) => {
      const { user: updatedUser } = await authService.getCurrentUser(accessToken!);
      setUser(updatedUser, accessToken!);
      qc.invalidateQueries();
      navigate("/overview");
      setShowCreate(false);
      toast.success("Household created");
    },
  });

  const households = data?.households ?? [];
  const activeId = user?.activeHouseholdId;
  const activeName =
    households.find((h) => h.household.id === activeId)?.household.name ?? "My household";

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors truncate max-w-[160px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        {activeName}
        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-md border bg-popover shadow-lg z-50">
          {households.map(({ household }) => (
            <button
              key={household.id}
              type="button"
              className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                if (household.id !== activeId) switchMutation.mutate(household.id);
                else setIsOpen(false);
              }}
            >
              <span className="truncate">{household.name}</span>
              {household.id === activeId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
          <div className="border-t" />
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-primary hover:bg-accent transition-colors"
            onClick={() => {
              setIsOpen(false);
              setShowCreate(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Create new household
          </button>
        </div>
      )}

      <CreateHouseholdDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onConfirm={(name) => createMutation.mutate(name)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
bun run type-check && bun run lint
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/layout/HouseholdSwitcher.tsx apps/frontend/src/components/layout/CreateHouseholdDialog.tsx
git commit -m "feat(ui): rework HouseholdSwitcher with create household dialog"
```

---

### Task 19: MemberManagementSection + MemberReassignmentPrompt

**Files:**

- Create: `apps/frontend/src/components/settings/MemberManagementSection.tsx`
- Create: `apps/frontend/src/components/settings/MemberReassignmentPrompt.tsx`
- Modify: `apps/frontend/src/hooks/useSettings.ts`
- Modify: `apps/frontend/src/services/household.service.ts`
- Modify: `apps/frontend/src/components/settings/HouseholdSection.tsx`

- [ ] **Step 1: Add member CRUD methods to household.service.ts**

```typescript
// Add to householdService in apps/frontend/src/services/household.service.ts

async createMember(householdId: string, data: { name: string; dateOfBirth?: string | null; retirementYear?: number | null }): Promise<{ member: Member }> {
  return apiClient.post<{ member: Member }>(`/api/households/${householdId}/members`, data);
},

async updateMember(householdId: string, memberId: string, data: { name?: string; dateOfBirth?: string | null; retirementYear?: number | null }): Promise<{ member: Member }> {
  return apiClient.patch<{ member: Member }>(`/api/households/${householdId}/members/${memberId}`, data);
},

async deleteMember(householdId: string, memberId: string, reassignToMemberId?: string): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(`/api/households/${householdId}/members/${memberId}`, {
    ...(reassignToMemberId ? { reassignToMemberId } : {}),
  });
},

async listMembers(householdId: string): Promise<{ members: Member[] }> {
  return apiClient.get<{ members: Member[] }>(`/api/households/${householdId}/members`);
},
```

- [ ] **Step 2: Add hooks to useSettings.ts**

```typescript
export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      householdId,
      data,
    }: {
      householdId: string;
      data: { name: string; dateOfBirth?: string | null; retirementYear?: number | null };
    }) => householdService.createMember(householdId, data),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      householdId,
      memberId,
      data,
    }: {
      householdId: string;
      memberId: string;
      data: { name?: string; dateOfBirth?: string | null; retirementYear?: number | null };
    }) => householdService.updateMember(householdId, memberId, data),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      householdId,
      memberId,
      reassignToMemberId,
    }: {
      householdId: string;
      memberId: string;
      reassignToMemberId?: string;
    }) => householdService.deleteMember(householdId, memberId, reassignToMemberId),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
  });
}
```

- [ ] **Step 3: Create MemberReassignmentPrompt**

Follow the exact pattern of the existing `ReassignmentPrompt.tsx` but for members instead of subcategories.

```tsx
// apps/frontend/src/components/settings/MemberReassignmentPrompt.tsx
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface MemberReassignmentPromptProps {
  isOpen: boolean;
  memberName: string;
  itemCount: number;
  destinations: Array<{ id: string; name: string }>;
  onConfirm: (destinationId: string) => void;
  onCancel: () => void;
}

export function MemberReassignmentPrompt({
  isOpen,
  memberName,
  itemCount,
  destinations,
  onConfirm,
  onCancel,
}: MemberReassignmentPromptProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reassign items</AlertDialogTitle>
          <AlertDialogDescription>
            {memberName} has {itemCount} assigned item{itemCount !== 1 ? "s" : ""}. Choose a member
            to reassign them to before deleting.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a member" />
          </SelectTrigger>
          <SelectContent>
            {destinations.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(selectedId)} disabled={!selectedId}>
            Reassign & delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Create MemberManagementSection**

Build the member list within the existing HouseholdSection, showing all members with create/edit/delete actions. Owner-only for management actions. Shows uninvited badge for members without userId. Integrates the MemberReassignmentPrompt for deletion.

- [ ] **Step 5: Update HouseholdSection to use MemberManagementSection**

Replace the inline member list in `HouseholdSection.tsx` with `<MemberManagementSection />`. Keep the existing invite/leave/rename logic in HouseholdSection.

- [ ] **Step 6: Verify**

```bash
bun run type-check && bun run lint
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/settings/MemberManagementSection.tsx apps/frontend/src/components/settings/MemberReassignmentPrompt.tsx apps/frontend/src/hooks/useSettings.ts apps/frontend/src/services/household.service.ts apps/frontend/src/components/settings/HouseholdSection.tsx
git commit -m "feat(ui): add member management section with reassignment"
```

---

### Phase 3: Data Export/Import

---

### Task 20: Export/import Zod schemas

**Files:**

- Create: `packages/shared/src/schemas/export-import.schemas.ts`
- Create: `packages/shared/src/schemas/export-import.schemas.test.ts`
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/shared/src/schemas/export-import.schemas.test.ts
import { describe, it, expect } from "bun:test";
import { householdExportSchema } from "./export-import.schemas";

describe("householdExportSchema", () => {
  it("accepts a minimal valid export", () => {
    const result = householdExportSchema.safeParse({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      household: { name: "Test Household" },
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
      giftPersons: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects schemaVersion > 1", () => {
    const result = householdExportSchema.safeParse({
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
      giftPersons: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/shared && bun test src/schemas/export-import.schemas.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write schemas**

```typescript
// packages/shared/src/schemas/export-import.schemas.ts
import { z } from "zod";

const CURRENT_SCHEMA_VERSION = 1;

const exportMemberSchema = z.object({
  name: z.string(),
  role: z.enum(["owner", "admin", "member"]),
  dateOfBirth: z.string().datetime().nullable().optional(),
  retirementYear: z.number().int().nullable().optional(),
});

const exportSubcategorySchema = z.object({
  tier: z.enum(["income", "committed", "discretionary"]),
  name: z.string(),
  sortOrder: z.number().int(),
  isLocked: z.boolean(),
  isDefault: z.boolean(),
  items: z.array(z.string()).optional(), // item names for reference mapping
});

const exportIncomeSourceSchema = z.object({
  subcategoryName: z.string(),
  name: z.string(),
  frequency: z.enum(["monthly", "annual", "one_off"]),
  incomeType: z.enum(["salary", "dividends", "freelance", "rental", "benefits", "other"]),
  expectedMonth: z.number().int().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  lastReviewedAt: z.string().datetime(),
  notes: z.string().nullable().optional(),
  periods: z.array(
    z.object({
      startDate: z.string(),
      endDate: z.string().nullable().optional(),
      amount: z.number(),
    })
  ),
});

const exportCommittedItemSchema = z.object({
  subcategoryName: z.string(),
  name: z.string(),
  spendType: z.enum(["monthly", "yearly", "one_off"]),
  notes: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  dueMonth: z.number().int().nullable().optional(),
  sortOrder: z.number().int(),
  lastReviewedAt: z.string().datetime(),
  periods: z.array(
    z.object({
      startDate: z.string(),
      endDate: z.string().nullable().optional(),
      amount: z.number(),
    })
  ),
});

const exportDiscretionaryItemSchema = z.object({
  subcategoryName: z.string(),
  name: z.string(),
  spendType: z.enum(["monthly", "yearly", "one_off"]),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  lastReviewedAt: z.string().datetime(),
  periods: z.array(
    z.object({
      startDate: z.string(),
      endDate: z.string().nullable().optional(),
      amount: z.number(),
    })
  ),
});

const exportItemAmountPeriodSchema = z.object({
  itemType: z.enum(["income_source", "committed_item", "discretionary_item"]),
  itemName: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  amount: z.number(),
});

const exportWaterfallHistorySchema = z.object({
  itemType: z.enum(["income_source", "committed_item", "discretionary_item"]),
  itemName: z.string(),
  value: z.number(),
  recordedAt: z.string().datetime(),
});

const exportAssetSchema = z.object({
  name: z.string(),
  type: z.enum(["Property", "Vehicle", "Other"]),
  ownerName: z.string().nullable().optional(),
  growthRatePct: z.number().nullable().optional(),
  lastReviewedAt: z.string().datetime().nullable().optional(),
  balances: z.array(
    z.object({
      value: z.number(),
      date: z.string(),
      note: z.string().nullable().optional(),
    })
  ),
});

const exportAccountSchema = z.object({
  name: z.string(),
  type: z.enum(["Savings", "Pension", "StocksAndShares", "Other"]),
  ownerName: z.string().nullable().optional(),
  growthRatePct: z.number().nullable().optional(),
  monthlyContribution: z.number(),
  lastReviewedAt: z.string().datetime().nullable().optional(),
  balances: z.array(
    z.object({
      value: z.number(),
      date: z.string(),
      note: z.string().nullable().optional(),
    })
  ),
});

const exportPurchaseItemSchema = z.object({
  yearAdded: z.number().int(),
  name: z.string(),
  estimatedCost: z.number(),
  priority: z.enum(["lowest", "low", "medium", "high"]),
  scheduledThisYear: z.boolean(),
  fundingSources: z.array(z.string()),
  fundingAccountId: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "done"]),
  reason: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

const exportPlannerYearBudgetSchema = z.object({
  year: z.number().int(),
  purchaseBudget: z.number(),
  giftBudget: z.number(),
});

const exportGiftEventSchema = z.object({
  eventType: z.enum([
    "birthday",
    "christmas",
    "mothers_day",
    "fathers_day",
    "valentines_day",
    "anniversary",
    "custom",
  ]),
  customName: z.string().nullable().optional(),
  dateMonth: z.number().int().nullable().optional(),
  dateDay: z.number().int().nullable().optional(),
  specificDate: z.string().datetime().nullable().optional(),
  recurrence: z.enum(["annual", "one_off"]),
  yearRecords: z.array(
    z.object({
      year: z.number().int(),
      budget: z.number(),
      notes: z.string().nullable().optional(),
    })
  ),
});

const exportGiftPersonSchema = z.object({
  name: z.string(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  events: z.array(exportGiftEventSchema),
});

const exportSettingsSchema = z.object({
  surplusBenchmarkPct: z.number().optional(),
  isaAnnualLimit: z.number().optional(),
  isaYearStartMonth: z.number().int().optional(),
  isaYearStartDay: z.number().int().optional(),
  stalenessThresholds: z.any().optional(),
  savingsRatePct: z.number().nullable().optional(),
  investmentRatePct: z.number().nullable().optional(),
  pensionRatePct: z.number().nullable().optional(),
  inflationRatePct: z.number().optional(),
  showPence: z.boolean().optional(),
});

export const householdExportSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  household: z.object({ name: z.string() }),
  settings: exportSettingsSchema,
  members: z.array(exportMemberSchema),
  subcategories: z.array(exportSubcategorySchema),
  incomeSources: z.array(exportIncomeSourceSchema),
  committedItems: z.array(exportCommittedItemSchema),
  discretionaryItems: z.array(exportDiscretionaryItemSchema),
  itemAmountPeriods: z.array(exportItemAmountPeriodSchema),
  waterfallHistory: z.array(exportWaterfallHistorySchema),
  assets: z.array(exportAssetSchema),
  accounts: z.array(exportAccountSchema),
  purchaseItems: z.array(exportPurchaseItemSchema),
  plannerYearBudgets: z.array(exportPlannerYearBudgetSchema),
  giftPersons: z.array(exportGiftPersonSchema),
});

export const importOptionsSchema = z.object({
  mode: z.enum(["overwrite", "create_new"]),
});

export const CURRENT_EXPORT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export type HouseholdExport = z.infer<typeof householdExportSchema>;
export type ImportOptions = z.infer<typeof importOptionsSchema>;
```

Export from `packages/shared/src/schemas/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/shared && bun test src/schemas/export-import.schemas.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/export-import.schemas.ts packages/shared/src/schemas/export-import.schemas.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add export/import Zod schemas"
```

---

### Task 21: Export service

**Files:**

- Create: `apps/backend/src/services/export.service.ts`
- Create: `apps/backend/src/services/export.service.test.ts`

- [ ] **Step 1: Write failing tests**

Test that `exportHousehold` returns a valid JSON structure with all sections populated. Test that it excludes snapshots, audit logs, and user account data.

- [ ] **Step 2: Write implementation**

The export service queries all household data, maps IDs to names for portability (member IDs → member names, subcategory IDs → subcategory names), and assembles the export JSON. It uses `prisma` directly, no transactions needed (read-only).

Key: items reference members and subcategories by **name** (not ID) in the export, so imports can create new IDs and match by name.

```typescript
// apps/backend/src/services/export.service.ts
import { prisma } from "../config/database.js";
import { AuthorizationError, NotFoundError } from "../utils/errors.js";
import { CURRENT_EXPORT_SCHEMA_VERSION, type HouseholdExport } from "@finplan/shared";

async function assertExportAccess(householdId: string, userId: string) {
  const member = await prisma.member.findFirst({ where: { householdId, userId } });
  if (!member || member.role !== "owner") {
    throw new AuthorizationError("Only household owners can export data");
  }
}

export const exportService = {
  async exportHousehold(householdId: string, userId: string): Promise<HouseholdExport> {
    await assertExportAccess(householdId, userId);

    const household = await prisma.household.findUnique({ where: { id: householdId } });
    if (!household) throw new NotFoundError("Household not found");

    const [
      settings,
      members,
      subcategories,
      incomeSources,
      committedItems,
      discretionaryItems,
      assets,
      accounts,
      purchaseItems,
      plannerYearBudgets,
      giftPersons,
    ] = await Promise.all([
      prisma.householdSettings.findUnique({ where: { householdId } }),
      prisma.member.findMany({ where: { householdId }, orderBy: { joinedAt: "asc" } }),
      prisma.subcategory.findMany({ where: { householdId }, orderBy: { sortOrder: "asc" } }),
      prisma.incomeSource.findMany({
        where: { householdId },
        include: { subcategory: { select: { name: true } } },
      }),
      prisma.committedItem.findMany({
        where: { householdId },
        include: { subcategory: { select: { name: true } } },
      }),
      prisma.discretionaryItem.findMany({
        where: { householdId },
        include: { subcategory: { select: { name: true } } },
      }),
      prisma.asset.findMany({ where: { householdId }, include: { balances: true } }),
      prisma.account.findMany({ where: { householdId }, include: { balances: true } }),
      prisma.purchaseItem.findMany({ where: { householdId } }),
      prisma.plannerYearBudget.findMany({ where: { householdId } }),
      prisma.giftPerson.findMany({
        where: { householdId },
        include: { events: { include: { yearRecords: true } } },
      }),
    ]);

    // Build lookup maps
    const memberNameById = new Map(members.map((m) => [m.id, m.name]));
    const subcategoryNameById = new Map(subcategories.map((s) => [s.id, s.name]));

    // Collect all item IDs for periods and history
    const allItemIds = [
      ...incomeSources.map((i) => i.id),
      ...committedItems.map((i) => i.id),
      ...discretionaryItems.map((i) => i.id),
    ];

    const [periods, history] = await Promise.all([
      prisma.itemAmountPeriod.findMany({
        where: { itemId: { in: allItemIds } },
        orderBy: { startDate: "asc" },
      }),
      prisma.waterfallHistory.findMany({
        where: { itemId: { in: allItemIds } },
        orderBy: { recordedAt: "asc" },
      }),
    ]);

    // Build item name lookup for periods/history
    const itemNameById = new Map<string, string>();
    const itemTypeById = new Map<string, string>();
    for (const i of incomeSources) {
      itemNameById.set(i.id, i.name);
      itemTypeById.set(i.id, "income_source");
    }
    for (const i of committedItems) {
      itemNameById.set(i.id, i.name);
      itemTypeById.set(i.id, "committed_item");
    }
    for (const i of discretionaryItems) {
      itemNameById.set(i.id, i.name);
      itemTypeById.set(i.id, "discretionary_item");
    }

    // Build periods grouped by item
    const periodsByItemId = new Map<string, typeof periods>();
    for (const p of periods) {
      const arr = periodsByItemId.get(p.itemId) ?? [];
      arr.push(p);
      periodsByItemId.set(p.itemId, arr);
    }

    function mapPeriods(itemId: string) {
      return (periodsByItemId.get(itemId) ?? []).map((p) => ({
        startDate: p.startDate.toISOString().split("T")[0]!,
        endDate: p.endDate ? p.endDate.toISOString().split("T")[0]! : null,
        amount: p.amount,
      }));
    }

    return {
      schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      household: { name: household.name },
      settings: settings
        ? {
            surplusBenchmarkPct: settings.surplusBenchmarkPct,
            isaAnnualLimit: settings.isaAnnualLimit,
            isaYearStartMonth: settings.isaYearStartMonth,
            isaYearStartDay: settings.isaYearStartDay,
            stalenessThresholds: settings.stalenessThresholds,
            savingsRatePct: settings.savingsRatePct,
            investmentRatePct: settings.investmentRatePct,
            pensionRatePct: settings.pensionRatePct,
            inflationRatePct: settings.inflationRatePct,
            showPence: settings.showPence,
          }
        : {},
      members: members.map((m) => ({
        name: m.name,
        role: m.role,
        dateOfBirth: m.dateOfBirth?.toISOString() ?? null,
        retirementYear: m.retirementYear,
      })),
      subcategories: subcategories.map((s) => ({
        tier: s.tier as "income" | "committed" | "discretionary",
        name: s.name,
        sortOrder: s.sortOrder,
        isLocked: s.isLocked,
        isDefault: s.isDefault,
      })),
      incomeSources: incomeSources.map((i) => ({
        subcategoryName: i.subcategory.name,
        name: i.name,
        frequency: i.frequency as "monthly" | "annual" | "one_off",
        incomeType: i.incomeType as any,
        expectedMonth: i.expectedMonth,
        ownerName: i.ownerId ? (memberNameById.get(i.ownerId) ?? null) : null,
        sortOrder: i.sortOrder,
        lastReviewedAt: i.lastReviewedAt.toISOString(),
        notes: i.notes,
        periods: mapPeriods(i.id),
      })),
      committedItems: committedItems.map((i) => ({
        subcategoryName: i.subcategory.name,
        name: i.name,
        spendType: i.spendType as "monthly" | "yearly" | "one_off",
        notes: i.notes,
        ownerName: i.ownerId ? (memberNameById.get(i.ownerId) ?? null) : null,
        dueMonth: i.dueMonth,
        sortOrder: i.sortOrder,
        lastReviewedAt: i.lastReviewedAt.toISOString(),
        periods: mapPeriods(i.id),
      })),
      discretionaryItems: discretionaryItems.map((i) => ({
        subcategoryName: i.subcategory.name,
        name: i.name,
        spendType: i.spendType as "monthly" | "yearly" | "one_off",
        notes: i.notes,
        sortOrder: i.sortOrder,
        lastReviewedAt: i.lastReviewedAt.toISOString(),
        periods: mapPeriods(i.id),
      })),
      itemAmountPeriods: periods.map((p) => ({
        itemType: (itemTypeById.get(p.itemId) ?? "income_source") as any,
        itemName: itemNameById.get(p.itemId) ?? "",
        startDate: p.startDate.toISOString().split("T")[0]!,
        endDate: p.endDate ? p.endDate.toISOString().split("T")[0]! : null,
        amount: p.amount,
      })),
      waterfallHistory: history.map((h) => ({
        itemType: h.itemType as any,
        itemName: itemNameById.get(h.itemId) ?? "",
        value: h.value,
        recordedAt: h.recordedAt.toISOString(),
      })),
      assets: assets.map((a) => ({
        name: a.name,
        type: a.type,
        ownerName: a.memberUserId ? (memberNameById.get(a.memberUserId) ?? null) : null,
        growthRatePct: a.growthRatePct,
        lastReviewedAt: a.lastReviewedAt?.toISOString() ?? null,
        balances: a.balances.map((b) => ({
          value: b.value,
          date: b.date.toISOString().split("T")[0]!,
          note: b.note,
        })),
      })),
      accounts: accounts.map((a) => ({
        name: a.name,
        type: a.type,
        ownerName: a.memberUserId ? (memberNameById.get(a.memberUserId) ?? null) : null,
        growthRatePct: a.growthRatePct,
        monthlyContribution: a.monthlyContribution,
        lastReviewedAt: a.lastReviewedAt?.toISOString() ?? null,
        balances: a.balances.map((b) => ({
          value: b.value,
          date: b.date.toISOString().split("T")[0]!,
          note: b.note,
        })),
      })),
      purchaseItems: purchaseItems.map((p) => ({
        yearAdded: p.yearAdded,
        name: p.name,
        estimatedCost: p.estimatedCost,
        priority: p.priority,
        scheduledThisYear: p.scheduledThisYear,
        fundingSources: p.fundingSources,
        fundingAccountId: p.fundingAccountId,
        status: p.status,
        reason: p.reason,
        comment: p.comment,
      })),
      plannerYearBudgets: plannerYearBudgets.map((b) => ({
        year: b.year,
        purchaseBudget: b.purchaseBudget,
        giftBudget: b.giftBudget,
      })),
      giftPersons: giftPersons.map((gp) => ({
        name: gp.name,
        notes: gp.notes,
        sortOrder: gp.sortOrder,
        events: gp.events.map((e) => ({
          eventType: e.eventType,
          customName: e.customName,
          dateMonth: e.dateMonth,
          dateDay: e.dateDay,
          specificDate: e.specificDate?.toISOString() ?? null,
          recurrence: e.recurrence,
          yearRecords: e.yearRecords.map((yr) => ({
            year: yr.year,
            budget: yr.budget,
            notes: yr.notes,
          })),
        })),
      })),
    };
  },
};
```

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts export.service
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/export.service.ts apps/backend/src/services/export.service.test.ts
git commit -m "feat(export): add household data export service"
```

---

### Task 22: Import service

**Files:**

- Create: `apps/backend/src/services/import.service.ts`
- Create: `apps/backend/src/services/import.service.test.ts`

- [ ] **Step 1: Write failing tests**

Test validation rejects invalid data. Test create-new mode creates a fresh household. Test overwrite mode replaces data. Test member name matching preserves owner. Test all-or-nothing transaction rollback.

- [ ] **Step 2: Write implementation**

The import service validates the JSON against the Zod schema, then executes in a transaction. For create-new: creates household + settings + members + all data. For overwrite: deletes existing data (preserving owner's member record), then inserts. Items reference members and subcategories by name — the import creates new IDs and maps names to IDs.

Key implementation details:

- Validate with `householdExportSchema.safeParse(data)` — return specific errors on failure
- Check `schemaVersion` — reject if > CURRENT_EXPORT_SCHEMA_VERSION
- Create members first (to get name→ID mapping)
- Create subcategories next (to get name→ID mapping)
- Create waterfall items with correct subcategoryId and ownerId references
- Create periods and history with correct itemId references (matched by name within type)
- Create assets/accounts with correct memberUserId references
- Create planner and gift data — `purchaseItem.fundingAccountId` is nulled on import (IDs are not portable)
- Expose `validateImportData(data)` method that returns `{ valid: boolean; errors?: string[] }` without writing anything

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts import.service
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/import.service.ts apps/backend/src/services/import.service.test.ts
git commit -m "feat(import): add household data import service with overwrite and create-new"
```

---

### Task 23: Export/import routes

**Files:**

- Create: `apps/backend/src/routes/export-import.routes.ts`
- Create: `apps/backend/src/routes/export-import.routes.test.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Write failing route tests**

Test auth, owner-only access, export returns valid JSON, import validates and executes.

- [ ] **Step 2: Write routes**

```typescript
// apps/backend/src/routes/export-import.routes.ts
import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware";
import { exportService } from "../services/export.service";
import { importService } from "../services/import.service";
import { importOptionsSchema } from "@finplan/shared";

export async function exportImportRoutes(fastify: FastifyInstance) {
  // Export household data (owner only)
  fastify.get(
    "/households/:id/export",
    {
      preHandler: [authMiddleware],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
          keyGenerator: (req) => `export_${req.user!.userId}`,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const data = await exportService.exportHousehold(id, userId);
      return reply.send(data);
    }
  );

  // Import household data (owner only)
  fastify.post(
    "/households/:id/import",
    {
      preHandler: [authMiddleware],
      bodyLimit: 5 * 1024 * 1024, // 5MB
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
          keyGenerator: (req) => `import_${req.user!.userId}`,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { mode } = importOptionsSchema.parse(request.query);
      const data = request.body;

      const result = await importService.importHousehold(id, userId, data as any, mode);
      return reply.send(result);
    }
  );

  // Validate import file (no write)
  fastify.post(
    "/households/validate-import",
    {
      preHandler: [authMiddleware],
      bodyLimit: 5 * 1024 * 1024,
    },
    async (request, reply) => {
      const result = importService.validateImportData(request.body as any);
      return reply.send(result);
    }
  );
}
```

- [ ] **Step 3: Register routes in server.ts**

```typescript
import { exportImportRoutes } from "./routes/export-import.routes";
// ...
server.register(exportImportRoutes, { prefix: "/api" });
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && bun scripts/run-tests.ts export-import.routes
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/export-import.routes.ts apps/backend/src/routes/export-import.routes.test.ts apps/backend/src/server.ts
git commit -m "feat(routes): add export/import endpoints with rate limiting"
```

---

### Task 24: Frontend DataSection + ImportDestinationDialog

**Files:**

- Create: `apps/frontend/src/components/settings/DataSection.tsx`
- Create: `apps/frontend/src/components/settings/ImportDestinationDialog.tsx`
- Create: `apps/frontend/src/hooks/useExportImport.ts`
- Modify: `apps/frontend/src/services/household.service.ts`
- Modify: `apps/frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add export/import API methods to household.service.ts**

```typescript
async exportHousehold(householdId: string): Promise<any> {
  return apiClient.get(`/api/households/${householdId}/export`);
},

async validateImport(data: any): Promise<{ valid: boolean; errors?: string[] }> {
  return apiClient.post("/api/households/validate-import", data);
},

async importHousehold(householdId: string, data: any, mode: "overwrite" | "create_new"): Promise<{ success: boolean; householdId: string }> {
  return apiClient.post(`/api/households/${householdId}/import?mode=${mode}`, data);
},
```

- [ ] **Step 2: Create useExportImport hook**

```typescript
// apps/frontend/src/hooks/useExportImport.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { householdService } from "@/services/household.service";
import { useAuthStore } from "@/stores/authStore";
import { authService } from "@/services/auth.service";

export function useExportHousehold() {
  return useMutation({
    mutationFn: (householdId: string) => householdService.exportHousehold(householdId),
    onSuccess: (data) => {
      const name = data.household?.name ?? "household";
      const date = new Date().toISOString().split("T")[0];
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finplan-export-${name.toLowerCase().replace(/\s+/g, "-")}-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}

export function useImportHousehold() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: ({
      householdId,
      data,
      mode,
    }: {
      householdId: string;
      data: any;
      mode: "overwrite" | "create_new";
    }) => householdService.importHousehold(householdId, data, mode),
    onSuccess: async () => {
      const { user } = await authService.getCurrentUser(accessToken!);
      setUser(user, accessToken!);
      queryClient.invalidateQueries();
    },
  });
}

export function useValidateImport() {
  return useMutation({
    mutationFn: (data: any) => householdService.validateImport(data),
  });
}
```

- [ ] **Step 3: Create ImportDestinationDialog**

Dialog with two options (overwrite / create new), with a secondary confirmation for overwrite. Uses existing `ConfirmDialog` pattern.

- [ ] **Step 4: Create DataSection**

Export button triggers `useExportHousehold`. Import button opens file picker, reads JSON, validates via `useValidateImport`, then shows `ImportDestinationDialog`. Owner-only visibility.

- [ ] **Step 5: Add DataSection to SettingsPage**

Add `{ id: "data", label: "Data", roles: ["owner"] }` to SECTIONS. Render `<DataSection />` with role gating.

- [ ] **Step 6: Verify**

```bash
bun run type-check && bun run lint
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/settings/DataSection.tsx apps/frontend/src/components/settings/ImportDestinationDialog.tsx apps/frontend/src/hooks/useExportImport.ts apps/frontend/src/services/household.service.ts apps/frontend/src/pages/SettingsPage.tsx
git commit -m "feat(ui): add data export/import section to settings"
```

---

## Testing

### Backend Tests

- [ ] Service: `memberService.createMember` creates an uninvited member
- [ ] Service: `memberService.deleteMember` reassigns items before deletion
- [ ] Service: `memberService.deleteMember` rejects deletion of account-linked members
- [ ] Service: `exportService.exportHousehold` returns all data sections
- [ ] Service: `exportService.exportHousehold` excludes snapshots and audit logs
- [ ] Service: `importService.importHousehold` in create-new mode creates a fresh household
- [ ] Service: `importService.importHousehold` in overwrite mode replaces all data
- [ ] Service: `importService.importHousehold` preserves member-to-item assignments
- [ ] Service: `importService.importHousehold` rejects invalid schema version
- [ ] Service: `importService.importHousehold` rolls back on any error
- [ ] Endpoint: export returns 403 for non-owners
- [ ] Endpoint: import returns 403 for non-owners
- [ ] Endpoint: import rejects files > 5MB

### Frontend Tests

- [ ] Component: HouseholdSwitcher renders dropdown for single household
- [ ] Component: HouseholdSwitcher shows "Create new household" option
- [ ] Component: MemberManagementSection shows create button alongside owner
- [ ] Component: DataSection only renders for owners

### Key Scenarios

- [ ] Happy path: owner exports household → imports into new household → all data preserved
- [ ] Happy path: owner creates member → assigns items → deletes with reassignment → items moved
- [ ] Error case: import of invalid JSON shows specific error message
- [ ] Error case: import from newer schema version shows clear rejection message
- [ ] Edge case: export of empty household produces valid JSON with empty arrays
- [ ] Edge case: overwrite import preserves owner's member record

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — no errors
- [ ] `cd apps/backend && bun scripts/run-tests.ts` — all tests pass
- [ ] Manual: create a member, assign income items, export household, import into new household, verify all data matches
- [ ] Manual: verify HouseholdSwitcher dropdown works with 1 and 2+ households
- [ ] Manual: verify DataSection only shows for owners
- [ ] Grep for `householdMember` / `HouseholdMember` — no remaining references

## Post-Review Fixes

The following fixes were applied after an automated code review at the end of execution:

### Critical

1. **Asset/Account `memberUserId` → `memberId` rename** — The original Tasks 1–14 migrated `IncomeSource.ownerId` and `CommittedItem.ownerId` from `User.id` to `Member.id`, but left `Asset.memberUserId` and `Account.memberUserId` referencing `User.id`. Task 2's data migration had already written `Member.id` values into those columns, creating a semantics mismatch. Fixed by renaming the columns to `memberId`, adding a FK to `Member`, and updating all backend services (assets, forecast, member, export, import), shared schemas, and frontend components. The frontend asset/account forms now list ALL members (linked and unlinked) in the assignee dropdown, fixing the lossy import roundtrip. Commit: `3555039`.
2. **Rate limit on validate-import** — `POST /api/households/validate-import` had no rate limit (CPU-DoS vector via unlimited 5MB Zod parses). Added `max: 30/hour` per user. Commit: `e7a1f85`.

### Important

3. **Overwrite import: purge household-scoped history** — The overwrite branch in `import.service.ts` now also deletes `AuditLog`, `Snapshot`, `HouseholdInvite`, `ReviewSession`, and `WaterfallSetupSession` before re-importing data. Commit: `5e3bccf`.
4. **Import test coverage expanded** — Added 3 tests: `create_new` happy path with non-empty payload + owner mapping, overwrite caller-member preservation + history purge assertions, unknown-subcategory rollback. Commit: `fc33217`.
5. **Export test coverage expanded** — Added 1 test: income source ownerId resolves to member name, subcategory name mapping, period inlining. Commit: `3836c21`.
6. **Route test fixture corrected** — Replaced `mockExportEnvelope` with fields matching the real `householdExportSchema` (removed non-existent `categories`, `items`, `liabilities`, `goals`). Commit: `3ae9a2e`.
7. **HouseholdSection UX regression fixed** — Restored role promote/demote and linked-member-removal controls inside `MemberManagementSection`. Linked members now show "Make admin"/"Make member" and a "Remove from household" button (both owner-only, self-disabled, sole-owner-protected). Commit: `ad5d680`.
8. **`stalenessThresholds` schema tightened** — Replaced `z.any().optional()` with a strict 5-field integer object schema matching the Prisma model default. Commit: `0ed6b18`.
9. **Filename sanitisation on export download** — Household name is now lowercased, NFKD-normalised, collapsed to `[a-z0-9-]`, and capped at 60 chars in the download filename. Commit: `e59ba3e`.

### Minor (noted, not fixed)

- Import transaction body is ~370 lines of sequential awaits; for large households, default Prisma txn timeout (5s) may expire. Consider `{ timeout: 30_000 }`.
- Export schema has both inlined `periods` per item AND a flat `itemAmountPeriods` array (fully redundant). Consider dropping the flat array in schema v2.
- Member DOB exported as full ISO timestamp rather than date-only.
- Plan folder should move to `docs/5. built/infrastructure/` after merge.

## Post-conditions

- [ ] Members exist independently of user accounts — enables future member-centric features
- [ ] Users can back up and restore household data via JSON export/import
- [ ] Household creation is general-purpose — available from the switcher at any time
- [ ] Schema versioning infrastructure in place for future export format changes
- [ ] Asset/Account ownership references `Member.id` consistently across schema, services, frontend, export, and import
