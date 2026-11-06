---
feature: audit-log
category: infrastructure
spec: docs/4. planning/audit-log/audit-log-spec.md
creation_date: 2026-03-29
status: implemented
implemented_date: 2026-07-05
---

# Audit Log — Implementation Plan

> **For Claude:** Use `/execute-plan audit-log` to implement this plan task-by-task.

**Goal:** Add an immutable, household-scoped audit log with a new `admin` role, a transactional `audited()` wrapper, a paginated query endpoint, and an Audit Log section in Settings.
**Spec:** `docs/4. planning/audit-log/audit-log-spec.md`
**Architecture:** A generic `audited<T>()` helper wraps every household mutation in a single Prisma transaction — fetch before state, run mutation, compute field-level diff, write `AuditLog` entry atomically. A new `audit-log.service.ts` handles cursor-based pagination queries scoped to the caller's household. The frontend adds an `AuditLogSection` to Settings (owner/admin only) with filter dropdowns and a 5-column table.
**Tech Stack:** Fastify · Prisma · Zod · React 18 · TanStack Query · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: yes

## Pre-conditions

- [ ] `apps/backend/prisma/schema.prisma` exists with `HouseholdRole`, `AuditLog`, `HouseholdInvite`, and `HouseholdMember` models
- [ ] `apps/backend/src/services/audit.service.ts` exists with fire-and-forget `log()` method
- [ ] `apps/backend/src/middleware/auth.middleware.ts` exists and attaches `request.user`
- [ ] `apps/backend/src/services/household.service.ts` exists with `assertOwner`, `inviteMember`
- [ ] `packages/shared/src/schemas/household.schemas.ts` exists with `createHouseholdInviteSchema`

## Tasks

### Task 1: Schema migration

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Run: `bun run db:migrate`

- [ ] **Step 1: Edit schema.prisma**

Add `admin` to `HouseholdRole` enum, extend `AuditLog` with new fields, add `intendedRole` to `HouseholdInvite`:

```prisma
enum HouseholdRole {
  owner
  admin
  member
}

model AuditLog {
  id          String    @id @default(cuid())
  // existing auth-event fields — unchanged
  userId      String?
  metadata    Json?
  ipAddress   String?
  userAgent   String?
  // household mutation fields
  householdId String?
  actorId     String?
  actorName   String?
  action      String?
  resource    String?
  resourceId  String?
  changes     Json?
  createdAt   DateTime  @default(now())

  household   Household? @relation(fields: [householdId], references: [id], onDelete: SetNull)

  @@index([householdId])
  @@index([actorId])
  @@index([householdId, createdAt])
}

model HouseholdInvite {
  id             String        @id @default(cuid())
  householdId    String
  invitedEmail   String
  invitedBy      String
  token          String        @unique
  intendedRole   HouseholdRole? // null = treated as member on acceptance
  expiresAt      DateTime
  createdAt      DateTime      @default(now())

  household      Household     @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([householdId])
}
```

- [ ] **Step 2: Run migration**

```bash
bun run db:migrate
```

Enter migration name: `add_admin_role_and_audit_log_fields`

Expected: Migration applied cleanly. `admin` visible in `HouseholdRole` enum. `AuditLog` has new columns. `HouseholdInvite` has `intendedRole`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/
git commit -m "chore(db): add admin role, extend AuditLog, add intendedRole to HouseholdInvite"
```

---

### Task 2: Shared Zod schemas

**Files:**

- Create: `packages/shared/src/schemas/audit.schemas.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/schemas/household.schemas.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/audit.schemas.test.ts
import { describe, it, expect } from "bun:test";
import {
  HouseholdRoleEnum,
  ResourceSlugEnum,
  AuditChangeSchema,
  AuditEntrySchema,
  AuditLogQuerySchema,
  UpdateMemberRoleSchema,
} from "./audit.schemas";

describe("HouseholdRoleEnum", () => {
  it("accepts owner, admin, member", () => {
    expect(HouseholdRoleEnum.parse("owner")).toBe("owner");
    expect(HouseholdRoleEnum.parse("admin")).toBe("admin");
    expect(HouseholdRoleEnum.parse("member")).toBe("member");
  });
  it("rejects unknown values", () => {
    expect(() => HouseholdRoleEnum.parse("superuser")).toThrow();
  });
});

describe("AuditChangeSchema", () => {
  it("accepts update entry", () => {
    const result = AuditChangeSchema.parse({
      field: "amount",
      before: 100,
      after: 200,
    });
    expect(result.field).toBe("amount");
  });
  it("accepts create entry (no before)", () => {
    const result = AuditChangeSchema.parse({ field: "name", after: "Salary" });
    expect(result.before).toBeUndefined();
  });
});

describe("AuditLogQuerySchema", () => {
  it("applies defaults", () => {
    const result = AuditLogQuerySchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeUndefined();
  });
  it("accepts all filters", () => {
    const result = AuditLogQuerySchema.parse({
      actorId: "user_1",
      resource: "income-source",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-01",
      cursor: "abc123",
      limit: 20,
    });
    expect(result.resource).toBe("income-source");
  });
});

describe("UpdateMemberRoleSchema", () => {
  it("accepts valid update", () => {
    const result = UpdateMemberRoleSchema.parse({
      targetUserId: "u1",
      role: "admin",
    });
    expect(result.role).toBe("admin");
  });
  it("rejects owner role assignment", () => {
    expect(() =>
      UpdateMemberRoleSchema.parse({ targetUserId: "u1", role: "owner" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.schemas`
Expected: FAIL — "Cannot find module './audit.schemas'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/schemas/audit.schemas.ts
import { z } from "zod";

export const HouseholdRoleEnum = z.enum(["owner", "admin", "member"]);
export type HouseholdRole = z.infer<typeof HouseholdRoleEnum>;

export const ResourceSlugEnum = z.enum([
  "income-source",
  "committed-item",
  "discretionary-item",
  "wealth-account",
  "liability",
  "household-settings",
  "household-member",
  "household-invite",
  "planner-goal",
  "review-session",
  "setup-session",
  "surplus-config",
  "isa-config",
  "staleness-config",
]);
export type ResourceSlug = z.infer<typeof ResourceSlugEnum>;

export const AuditChangeSchema = z.object({
  field: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type AuditChange = z.infer<typeof AuditChangeSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  actorName: z.string().nullable(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable(),
  changes: z.array(AuditChangeSchema).nullable(),
  createdAt: z.string().datetime(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const AuditLogQuerySchema = z.object({
  actorId: z.string().optional(),
  resource: ResourceSlugEnum.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const AuditLogResponseSchema = z.object({
  entries: z.array(AuditEntrySchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

// role: only member or admin can be assigned — owner is immutable
export const UpdateMemberRoleSchema = z.object({
  targetUserId: z.string(),
  role: z.enum(["member", "admin"]),
});
export type UpdateMemberRole = z.infer<typeof UpdateMemberRoleSchema>;
```

Add to `packages/shared/src/schemas/household.schemas.ts` — extend invite schema to accept optional role:

```typescript
// Add to existing createHouseholdInviteSchema (extend it):
export const createHouseholdInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).optional().default("member"),
});
```

Add to `packages/shared/src/schemas/index.ts`:

```typescript
export * from "./audit.schemas";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/audit.schemas.ts packages/shared/src/schemas/index.ts packages/shared/src/schemas/household.schemas.ts
git commit -m "feat(shared): add audit schemas — HouseholdRole, ResourceSlug, AuditEntry, AuditLogQuery, UpdateMemberRole"
```

---

### Task 3: Extend auth middleware to expose `name`

**Files:**

- Modify: `apps/backend/src/middleware/auth.middleware.ts`
- Modify: `apps/backend/src/types/fastify.d.ts` (or wherever `request.user` is typed)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/middleware/auth.middleware.test.ts (add to existing suite)
it("attaches name to request.user from DB", async () => {
  prismaMock.user.findUnique.mockResolvedValue({
    id: "user_1",
    email: "a@b.com",
    name: "Alice",
    activeHouseholdId: "hh_1",
  } as any);

  const req = buildMockRequest({
    headers: { authorization: "Bearer valid_token" },
  });
  await authMiddleware(req, mockReply);

  expect(req.user.name).toBe("Alice");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts auth.middleware`
Expected: FAIL — "req.user.name is undefined"

- [ ] **Step 3: Write minimal implementation**

In `auth.middleware.ts`, update the DB query to include `name` and attach it to `request.user`:

```typescript
const user = await prisma.user.findUnique({
  where: { id: payload.userId },
  select: { id: true, email: true, name: true, activeHouseholdId: true },
});

// ...

request.user = {
  userId: user.id,
  email: user.email,
  name: user.name ?? "",
  activeHouseholdId: user.activeHouseholdId,
};
```

In the Fastify type augmentation file, add `name: string` to the `user` interface:

```typescript
declare module "fastify" {
  interface FastifyRequest {
    user: {
      userId: string;
      email: string;
      name: string;
      activeHouseholdId: string | null;
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts auth.middleware`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/middleware/auth.middleware.ts apps/backend/src/types/
git commit -m "feat(auth): expose user name in request.user for audit actor capture"
```

---

### Task 4: `audited()` wrapper and `computeDiff`

**Files:**

- Modify: `apps/backend/src/services/audit.service.ts`
- Test: `apps/backend/src/services/audit.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/audit.service.test.ts
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock } from "../test/mocks/prisma";
import { computeDiff, audited } from "./audit.service";

const ctx = {
  householdId: "hh_1",
  actorId: "user_1",
  actorName: "Alice",
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

describe("computeDiff", () => {
  it("detects updated fields", () => {
    const diff = computeDiff(
      { amount: 100, name: "Salary" },
      { amount: 200, name: "Salary" },
    );
    expect(diff).toEqual([{ field: "amount", before: 100, after: 200 }]);
  });

  it("detects created fields (no before state)", () => {
    const diff = computeDiff(null, { amount: 100, name: "Salary" });
    expect(diff).toEqual([
      { field: "amount", after: 100 },
      { field: "name", after: "Salary" },
    ]);
  });

  it("detects deleted fields (no after state)", () => {
    const diff = computeDiff({ amount: 100 }, null);
    expect(diff).toEqual([{ field: "amount", before: 100 }]);
  });

  it("ignores unchanged fields", () => {
    const diff = computeDiff({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(diff).toEqual([{ field: "b", before: 2, after: 3 }]);
  });
});

describe("audited()", () => {
  beforeEach(() => {
    prismaMock.auditLog.create.mockResolvedValue({} as any);
  });

  it("returns the mutation result", async () => {
    const result = await audited({
      db: prismaMock as any,
      ctx,
      action: "CREATE_INCOME_SOURCE",
      resource: "income-source",
      resourceId: "inc_1",
      beforeFetch: async () => null,
      mutation: async () => ({ id: "inc_1", amount: 100 }),
    });
    expect(result).toEqual({ id: "inc_1", amount: 100 });
  });

  it("writes an AuditLog entry with correct fields", async () => {
    await audited({
      db: prismaMock as any,
      ctx,
      action: "CREATE_INCOME_SOURCE",
      resource: "income-source",
      resourceId: "inc_1",
      beforeFetch: async () => null,
      mutation: async (_tx) => ({ id: "inc_1", amount: 100, name: "Salary" }),
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: "hh_1",
        actorId: "user_1",
        actorName: "Alice",
        action: "CREATE_INCOME_SOURCE",
        resource: "income-source",
        resourceId: "inc_1",
      }),
    });
  });

  it("rolls back if audit write fails", async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error("DB error"));

    await expect(
      audited({
        db: prismaMock as any,
        ctx,
        action: "UPDATE_INCOME_SOURCE",
        resource: "income-source",
        resourceId: "inc_1",
        beforeFetch: async () => ({ amount: 100 }),
        mutation: async () => ({ id: "inc_1", amount: 200 }),
      }),
    ).rejects.toThrow("DB error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.service`
Expected: FAIL — "computeDiff is not exported" / "audited is not exported"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/services/audit.service.ts
import { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";

// ── existing fire-and-forget log (DO NOT CHANGE) ──────────────────────────────

export type AuditLogEntry = {
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export const auditService = {
  log(entry: AuditLogEntry): void {
    prisma.auditLog.create({ data: entry }).catch((err) => {
      console.error("Audit log write failed:", err);
    });
  },
};

// ── new transactional wrapper ─────────────────────────────────────────────────

export type ActorCtx = {
  householdId: string;
  actorId: string;
  actorName: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditChange = {
  field: string;
  before?: unknown;
  after?: unknown;
};

export function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditChange[] {
  if (!before && !after) return [];

  if (!before) {
    // CREATE — all after fields
    return Object.entries(after!).map(([field, value]) => ({
      field,
      after: value,
    }));
  }

  if (!after) {
    // DELETE — all before fields
    return Object.entries(before).map(([field, value]) => ({
      field,
      before: value,
    }));
  }

  // UPDATE — changed fields only
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditChange[] = [];

  for (const field of allKeys) {
    const b = before[field];
    const a = after[field];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ field, before: b, after: a });
    }
  }

  return changes;
}

export type AuditedParams<T> = {
  db: PrismaClient;
  ctx: ActorCtx;
  action: string;
  resource: string;
  resourceId: string;
  beforeFetch: (tx: PrismaClient) => Promise<Record<string, unknown> | null>;
  mutation: (tx: PrismaClient) => Promise<T>;
};

export async function audited<T>({
  db,
  ctx,
  action,
  resource,
  resourceId,
  beforeFetch,
  mutation,
}: AuditedParams<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    const beforeState = await beforeFetch(tx as unknown as PrismaClient);
    const result = await mutation(tx as unknown as PrismaClient);

    // Build after state from result if it's a plain object, else fetch is not needed
    // (result IS the after state for most Prisma mutations)
    const afterState =
      result !== null && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : null;

    const changes = computeDiff(beforeState, afterState);

    await (tx as any).auditLog.create({
      data: {
        householdId: ctx.householdId,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        action,
        resource,
        resourceId,
        changes,
      },
    });

    return result;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/audit.service.ts apps/backend/src/services/audit.service.test.ts
git commit -m "feat(audit): add computeDiff and audited() transactional wrapper"
```

---

### Task 5: Audit log query service

**Files:**

- Create: `apps/backend/src/services/audit-log.service.ts`
- Test: `apps/backend/src/services/audit-log.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/audit-log.service.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { prismaMock } from "../test/mocks/prisma";
import { queryAuditLog } from "./audit-log.service";

const mockEntry = {
  id: "al_1",
  actorName: "Alice",
  action: "CREATE_INCOME_SOURCE",
  resource: "income-source",
  resourceId: "inc_1",
  changes: [{ field: "amount", after: 100 }],
  createdAt: new Date("2026-03-01T10:00:00Z"),
};

describe("queryAuditLog", () => {
  beforeEach(() => {
    prismaMock.auditLog.findMany.mockResolvedValue([mockEntry] as any);
  });

  it("returns entries and null nextCursor when under limit", async () => {
    const result = await queryAuditLog(prismaMock as any, {
      householdId: "hh_1",
      limit: 50,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("returns nextCursor when limit+1 entries exist", async () => {
    const entries = Array.from({ length: 51 }, (_, i) => ({
      ...mockEntry,
      id: `al_${i}`,
      createdAt: new Date(`2026-03-0${Math.floor(i / 10) + 1}T10:00:00Z`),
    }));
    prismaMock.auditLog.findMany.mockResolvedValue(entries as any);

    const result = await queryAuditLog(prismaMock as any, {
      householdId: "hh_1",
      limit: 50,
    });
    expect(result.entries).toHaveLength(50);
    expect(result.nextCursor).not.toBeNull();
  });

  it("filters by actorId", async () => {
    await queryAuditLog(prismaMock as any, {
      householdId: "hh_1",
      actorId: "user_1",
      limit: 50,
    });
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actorId: "user_1" }),
      }),
    );
  });

  it("scopes to householdId always", async () => {
    await queryAuditLog(prismaMock as any, {
      householdId: "hh_1",
      limit: 50,
    });
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ householdId: "hh_1" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts audit-log.service`
Expected: FAIL — "Cannot find module './audit-log.service'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/services/audit-log.service.ts
import type { PrismaClient } from "@prisma/client";
import type {
  AuditLogQuery,
  AuditEntry,
  AuditLogResponse,
} from "@fin-plan/shared";

type QueryParams = AuditLogQuery & { householdId: string };

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
  ).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
}

export async function queryAuditLog(
  db: PrismaClient,
  params: QueryParams,
): Promise<AuditLogResponse> {
  const { householdId, actorId, resource, dateFrom, dateTo, cursor, limit } =
    params;

  const where: Record<string, unknown> = { householdId };
  if (actorId) where.actorId = actorId;
  if (resource) where.resource = resource;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  let cursorCondition: Record<string, unknown> | undefined;
  if (cursor) {
    const { createdAt, id } = decodeCursor(cursor);
    cursorCondition = {
      OR: [
        { createdAt: { lt: new Date(createdAt) } },
        { createdAt: new Date(createdAt), id: { lt: id } },
      ],
    };
    Object.assign(where, cursorCondition);
  }

  // Fetch limit+1 to detect if there's a next page
  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      actorName: true,
      action: true,
      resource: true,
      resourceId: true,
      changes: true,
      createdAt: true,
    },
  });

  const hasNext = rows.length > limit;
  const entries = rows.slice(0, limit);
  const lastEntry = entries[entries.length - 1];

  const nextCursor =
    hasNext && lastEntry
      ? encodeCursor(lastEntry.createdAt, lastEntry.id)
      : null;

  return {
    entries: entries.map((e) => ({
      id: e.id,
      actorName: e.actorName ?? null,
      action: e.action ?? "",
      resource: e.resource ?? "",
      resourceId: e.resourceId ?? null,
      changes: Array.isArray(e.changes)
        ? (e.changes as AuditEntry["changes"])
        : null,
      createdAt: e.createdAt.toISOString(),
    })),
    nextCursor,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts audit-log.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/audit-log.service.ts apps/backend/src/services/audit-log.service.test.ts
git commit -m "feat(audit): add queryAuditLog service with cursor pagination and filters"
```

---

### Task 6: Audit log query route

**Files:**

- Create: `apps/backend/src/routes/audit-log.routes.ts`
- Modify: `apps/backend/src/server.ts`
- Test: `apps/backend/src/routes/audit-log.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/audit-log.routes.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { buildApp } from "../server";
import { prismaMock } from "../test/mocks/prisma";
import { signToken } from "../lib/jwt";

function makeToken(role: string, householdId = "hh_1") {
  return signToken({
    userId: "user_1",
    email: "a@b.com",
    activeHouseholdId: householdId,
  });
}

function makeOwnerMember(role = "owner") {
  return { userId: "user_1", householdId: "hh_1", role, joinedAt: new Date() };
}

describe("GET /audit-log", () => {
  beforeEach(() => {
    prismaMock.householdMember.findUnique.mockResolvedValue(
      makeOwnerMember() as any,
    );
    prismaMock.auditLog.findMany.mockResolvedValue([]);
  });

  it("returns 200 for owner", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/audit-log",
      headers: { authorization: `Bearer ${makeToken("owner")}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("entries");
    expect(body).toHaveProperty("nextCursor");
  });

  it("returns 200 for admin", async () => {
    prismaMock.householdMember.findUnique.mockResolvedValue(
      makeOwnerMember("admin") as any,
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/audit-log",
      headers: { authorization: `Bearer ${makeToken("admin")}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 for member", async () => {
    prismaMock.householdMember.findUnique.mockResolvedValue(
      makeOwnerMember("member") as any,
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/audit-log",
      headers: { authorization: `Bearer ${makeToken("member")}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 without token", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/audit-log" });
    expect(res.statusCode).toBe(401);
  });

  it("never returns ipAddress or userAgent in response", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "al_1",
        actorName: "Alice",
        action: "CREATE_INCOME_SOURCE",
        resource: "income-source",
        resourceId: "inc_1",
        changes: [],
        createdAt: new Date(),
        ipAddress: "1.2.3.4",
        userAgent: "Mozilla",
      },
    ] as any);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/audit-log",
      headers: { authorization: `Bearer ${makeToken("owner")}` },
    });
    const body = JSON.parse(res.body);
    expect(body.entries[0]).not.toHaveProperty("ipAddress");
    expect(body.entries[0]).not.toHaveProperty("userAgent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts audit-log.routes`
Expected: FAIL — "Cannot find module './audit-log.routes'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/routes/audit-log.routes.ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { queryAuditLog } from "../services/audit-log.service";
import { AuditLogQuerySchema } from "@fin-plan/shared";

export async function auditLogRoutes(app: FastifyInstance) {
  app.get(
    "/audit-log",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId, activeHouseholdId } = request.user;

      if (!activeHouseholdId) {
        return reply.status(400).send({ error: "No active household" });
      }

      // Verify caller is owner or admin
      const membership = await prisma.householdMember.findUnique({
        where: {
          householdId_userId: { householdId: activeHouseholdId, userId },
        },
      });

      if (
        !membership ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const query = AuditLogQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ error: query.error.flatten() });
      }

      const result = await queryAuditLog(prisma, {
        householdId: activeHouseholdId,
        ...query.data,
      });

      return reply.send(result);
    },
  );
}
```

Register in `apps/backend/src/server.ts` — add alongside existing route registrations:

```typescript
import { auditLogRoutes } from "./routes/audit-log.routes";
// ...
app.register(auditLogRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts audit-log.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/audit-log.routes.ts apps/backend/src/routes/audit-log.routes.test.ts apps/backend/src/server.ts
git commit -m "feat(audit): add GET /audit-log endpoint — owner/admin only, household-scoped"
```

---

### Task 7: Admin role management — service + routes

**Files:**

- Modify: `apps/backend/src/services/household.service.ts`
- Modify: `apps/backend/src/routes/households.ts`
- Modify: `apps/backend/src/routes/invite.ts`
- Test: `apps/backend/src/services/household.service.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/household.service.test.ts (add to existing suite)
import { assertOwnerOrAdmin, updateMemberRole } from "./household.service";

describe("assertOwnerOrAdmin", () => {
  it("passes for owner", () => {
    expect(() => assertOwnerOrAdmin("owner")).not.toThrow();
  });
  it("passes for admin", () => {
    expect(() => assertOwnerOrAdmin("admin")).not.toThrow();
  });
  it("throws 403 for member", () => {
    expect(() => assertOwnerOrAdmin("member")).toThrow("Forbidden");
  });
});

describe("updateMemberRole", () => {
  it("allows owner to promote member to admin", async () => {
    prismaMock.householdMember.findUnique
      .mockResolvedValueOnce({
        userId: "user_1",
        householdId: "hh_1",
        role: "owner",
      } as any)
      .mockResolvedValueOnce({
        userId: "user_2",
        householdId: "hh_1",
        role: "member",
      } as any);
    prismaMock.householdMember.update.mockResolvedValue({
      role: "admin",
    } as any);

    await updateMemberRole(prismaMock as any, {
      householdId: "hh_1",
      callerId: "user_1",
      targetUserId: "user_2",
      newRole: "admin",
    });

    expect(prismaMock.householdMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "admin" } }),
    );
  });

  it("allows admin to promote member to admin", async () => {
    prismaMock.householdMember.findUnique
      .mockResolvedValueOnce({
        userId: "user_1",
        householdId: "hh_1",
        role: "admin",
      } as any)
      .mockResolvedValueOnce({
        userId: "user_2",
        householdId: "hh_1",
        role: "member",
      } as any);
    prismaMock.householdMember.update.mockResolvedValue({
      role: "admin",
    } as any);

    await updateMemberRole(prismaMock as any, {
      householdId: "hh_1",
      callerId: "user_1",
      targetUserId: "user_2",
      newRole: "admin",
    });

    expect(prismaMock.householdMember.update).toHaveBeenCalled();
  });

  it("throws 403 when admin tries to demote another admin", async () => {
    prismaMock.householdMember.findUnique
      .mockResolvedValueOnce({
        userId: "user_1",
        householdId: "hh_1",
        role: "admin",
      } as any)
      .mockResolvedValueOnce({
        userId: "user_2",
        householdId: "hh_1",
        role: "admin",
      } as any);

    await expect(
      updateMemberRole(prismaMock as any, {
        householdId: "hh_1",
        callerId: "user_1",
        targetUserId: "user_2",
        newRole: "member",
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("throws 403 when trying to change owner role", async () => {
    prismaMock.householdMember.findUnique
      .mockResolvedValueOnce({
        userId: "user_1",
        householdId: "hh_1",
        role: "owner",
      } as any)
      .mockResolvedValueOnce({
        userId: "user_2",
        householdId: "hh_1",
        role: "owner",
      } as any);

    await expect(
      updateMemberRole(prismaMock as any, {
        householdId: "hh_1",
        callerId: "user_1",
        targetUserId: "user_2",
        newRole: "member",
      }),
    ).rejects.toThrow("Forbidden");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts household.service`
Expected: FAIL — "assertOwnerOrAdmin is not exported" / "updateMemberRole is not exported"

- [ ] **Step 3: Write minimal implementation**

Add to `apps/backend/src/services/household.service.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import { createHttpError } from "../lib/errors"; // or however HTTP errors are thrown in this codebase

export function assertOwnerOrAdmin(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw createHttpError(403, "Forbidden");
  }
}

type UpdateMemberRoleParams = {
  householdId: string;
  callerId: string;
  targetUserId: string;
  newRole: "member" | "admin";
};

export async function updateMemberRole(
  db: PrismaClient,
  { householdId, callerId, targetUserId, newRole }: UpdateMemberRoleParams,
) {
  const [caller, target] = await Promise.all([
    db.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: callerId } },
    }),
    db.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: targetUserId } },
    }),
  ]);

  if (!caller || !target) throw createHttpError(404, "Member not found");

  // Cannot change owner role
  if (target.role === "owner") throw createHttpError(403, "Forbidden");

  // Admin cannot demote another admin
  if (caller.role === "admin" && target.role === "admin") {
    throw createHttpError(403, "Forbidden");
  }

  // Admin cannot demote (only owner can demote)
  if (caller.role === "admin" && newRole === "member") {
    throw createHttpError(403, "Forbidden");
  }

  // Must be owner or admin to call at all
  assertOwnerOrAdmin(caller.role);

  return db.householdMember.update({
    where: { householdId_userId: { householdId, userId: targetUserId } },
    data: { role: newRole },
  });
}
```

Add PATCH route to `apps/backend/src/routes/households.ts`:

```typescript
// PATCH /households/:householdId/members/:userId/role
app.patch(
  "/households/:householdId/members/:userId/role",
  { preHandler: [app.authenticate] },
  async (request, reply) => {
    const { householdId, userId: targetUserId } = request.params as {
      householdId: string;
      userId: string;
    };
    const { userId: callerId, activeHouseholdId } = request.user;

    // Must be acting within active household
    if (activeHouseholdId !== householdId) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = UpdateMemberRoleSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: body.error.flatten() });

    const updated = await updateMemberRole(prisma, {
      householdId,
      callerId,
      targetUserId,
      newRole: body.data.role,
    });

    return reply.send(updated);
  },
);
```

Update invite schema usage in `apps/backend/src/routes/households.ts` — pass `role` through to `inviteMember`, and store on `HouseholdInvite.intendedRole`.

Update `apps/backend/src/routes/invite.ts` — in `acceptInvite` and `joinViaInvite`, use `invite.intendedRole ?? 'member'` when creating `HouseholdMember`:

```typescript
// Before:
await prisma.householdMember.create({
  data: { householdId: invite.householdId, userId: user.id, role: "member" },
});

// After:
await prisma.householdMember.create({
  data: {
    householdId: invite.householdId,
    userId: user.id,
    role: invite.intendedRole ?? "member",
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts household.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/household.service.ts apps/backend/src/routes/households.ts apps/backend/src/routes/invite.ts
git commit -m "feat(households): add assertOwnerOrAdmin, updateMemberRole, admin invite role support"
```

---

### Task 8: Wrap waterfall income mutations with `audited()`

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts`
- Test: `apps/backend/src/services/waterfall.service.test.ts` (extend)

This task demonstrates the full pattern. Tasks 9–11 apply the same pattern to remaining services.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/waterfall.service.test.ts (add to existing)
import { prismaMock } from "../test/mocks/prisma";

const actorCtx = {
  householdId: "hh_1",
  actorId: "user_1",
  actorName: "Alice",
};

describe("createIncome with audited()", () => {
  it("writes an AuditLog entry on income creation", async () => {
    prismaMock.incomeSource.create.mockResolvedValue({
      id: "inc_1",
      amount: 1000,
    } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await createIncome(
      { householdId: "hh_1", name: "Salary", amount: 1000 },
      actorCtx,
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE_INCOME_SOURCE",
          resource: "income-source",
          actorId: "user_1",
        }),
      }),
    );
  });

  it("does not write AuditLog when actorCtx is absent (backward compat)", async () => {
    prismaMock.incomeSource.create.mockResolvedValue({
      id: "inc_1",
      amount: 1000,
    } as any);

    await createIncome({ householdId: "hh_1", name: "Salary", amount: 1000 });

    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: FAIL — "createIncome does not accept actorCtx" (signature mismatch)

- [ ] **Step 3: Write minimal implementation**

Add `actorCtx` helper at top of `waterfall.service.ts` (and a small helper to build it from a Fastify request — place this in `apps/backend/src/lib/actor-ctx.ts`):

```typescript
// apps/backend/src/lib/actor-ctx.ts
import type { FastifyRequest } from "fastify";
import type { ActorCtx } from "../services/audit.service";

export function actorCtx(req: FastifyRequest): ActorCtx {
  return {
    householdId: req.user.activeHouseholdId!,
    actorId: req.user.userId,
    actorName: req.user.name,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}
```

Update income mutation signatures to accept optional `actorCtx?` and wrap with `audited()`:

```typescript
// apps/backend/src/services/waterfall.service.ts (income section)
import { prisma } from "../lib/prisma";
import { audited, type ActorCtx } from "./audit.service";

export async function createIncome(
  data: {
    householdId: string;
    name: string;
    amount: number;
    [key: string]: unknown;
  },
  ctx?: ActorCtx,
) {
  if (!ctx) {
    // backward-compat: no audit
    return prisma.incomeSource.create({ data });
  }

  return audited({
    db: prisma,
    ctx,
    action: "CREATE_INCOME_SOURCE",
    resource: "income-source",
    resourceId: "", // filled after creation — use result.id
    beforeFetch: async () => null,
    mutation: async (tx) => {
      const result = await tx.incomeSource.create({ data });
      return result;
    },
  });
}

export async function updateIncome(
  id: string,
  data: Record<string, unknown>,
  ctx?: ActorCtx,
) {
  if (!ctx) {
    return prisma.incomeSource.update({ where: { id }, data });
  }

  return audited({
    db: prisma,
    ctx,
    action: "UPDATE_INCOME_SOURCE",
    resource: "income-source",
    resourceId: id,
    beforeFetch: async (tx) => {
      const before = await tx.incomeSource.findUnique({ where: { id } });
      return before as Record<string, unknown> | null;
    },
    mutation: async (tx) => tx.incomeSource.update({ where: { id }, data }),
  });
}

export async function deleteIncome(id: string, ctx?: ActorCtx) {
  if (!ctx) {
    return prisma.incomeSource.delete({ where: { id } });
  }

  return audited({
    db: prisma,
    ctx,
    action: "DELETE_INCOME_SOURCE",
    resource: "income-source",
    resourceId: id,
    beforeFetch: async (tx) => {
      const before = await tx.incomeSource.findUnique({ where: { id } });
      return before as Record<string, unknown> | null;
    },
    mutation: async (tx) => tx.incomeSource.delete({ where: { id } }),
  });
}

export async function endIncome(id: string, endsAt: Date, ctx?: ActorCtx) {
  if (!ctx) {
    return prisma.incomeSource.update({ where: { id }, data: { endsAt } });
  }

  return audited({
    db: prisma,
    ctx,
    action: "UPDATE_INCOME_SOURCE",
    resource: "income-source",
    resourceId: id,
    beforeFetch: async (tx) => {
      const before = await tx.incomeSource.findUnique({ where: { id } });
      return before as Record<string, unknown> | null;
    },
    mutation: async (tx) =>
      tx.incomeSource.update({ where: { id }, data: { endsAt } }),
  });
}

export async function reactivateIncome(id: string, ctx?: ActorCtx) {
  if (!ctx) {
    return prisma.incomeSource.update({
      where: { id },
      data: { endsAt: null },
    });
  }

  return audited({
    db: prisma,
    ctx,
    action: "UPDATE_INCOME_SOURCE",
    resource: "income-source",
    resourceId: id,
    beforeFetch: async (tx) => {
      const before = await tx.incomeSource.findUnique({ where: { id } });
      return before as Record<string, unknown> | null;
    },
    mutation: async (tx) =>
      tx.incomeSource.update({ where: { id }, data: { endsAt: null } }),
  });
}
```

Update income routes in `waterfall.routes.ts` to pass `actorCtx(req)`:

```typescript
import { actorCtx } from "../lib/actor-ctx";

// In POST /income handler:
await createIncome(data, actorCtx(req));

// In PATCH /income/:id handler:
await updateIncome(id, data, actorCtx(req));

// In DELETE /income/:id handler:
await deleteIncome(id, actorCtx(req));
```

**Note on `recordHistory`:** The waterfall service calls `recordHistory()` inside mutations (this uses the global `prisma` instance). Move the `waterfallHistory.create()` call inside the `mutation` callback so it participates in the same Prisma `$transaction`. Do not change the `recordHistory` function itself — just call it with the `tx` client:

```typescript
mutation: async (tx) => {
  const result = await tx.incomeSource.update({ where: { id }, data });
  await tx.waterfallHistory.create({ data: buildHistoryEntry(result) });
  return result;
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/actor-ctx.ts apps/backend/src/services/waterfall.service.ts apps/backend/src/routes/waterfall.routes.ts
git commit -m "feat(audit): wrap waterfall income mutations with audited()"
```

---

### Task 9: Wrap remaining waterfall mutations (committed, discretionary, surplus)

**Files:**

- Modify: `apps/backend/src/services/waterfall.service.ts` (committed + discretionary + surplus sections)
- Modify: corresponding route files to pass `actorCtx(req)`

Follow the exact pattern from Task 8. Action name / resource slug reference:

| Service method        | action                      | resource             |
| --------------------- | --------------------------- | -------------------- |
| `createCommittedItem` | `CREATE_COMMITTED_ITEM`     | `committed-item`     |
| `updateCommittedItem` | `UPDATE_COMMITTED_ITEM`     | `committed-item`     |
| `deleteCommittedItem` | `DELETE_COMMITTED_ITEM`     | `committed-item`     |
| `createDiscretionary` | `CREATE_DISCRETIONARY_ITEM` | `discretionary-item` |
| `updateDiscretionary` | `UPDATE_DISCRETIONARY_ITEM` | `discretionary-item` |
| `deleteDiscretionary` | `DELETE_DISCRETIONARY_ITEM` | `discretionary-item` |
| `updateSurplusConfig` | `UPDATE_SURPLUS_CONFIG`     | `surplus-config`     |

- [ ] **Step 1: Write the failing test** (representative — one per section)

```typescript
describe("createCommittedItem with audited()", () => {
  it("writes AuditLog entry", async () => {
    prismaMock.committedItem.create.mockResolvedValue({ id: "ci_1" } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await createCommittedItem(
      { householdId: "hh_1", name: "Rent", amount: 1000 },
      actorCtx,
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CREATE_COMMITTED_ITEM" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: FAIL

- [ ] **Step 3: Implement** — apply `audited()` wrapper to all committed, discretionary, and surplus mutations using the same pattern as Task 8.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/waterfall.service.ts apps/backend/src/routes/
git commit -m "feat(audit): wrap committed, discretionary, and surplus mutations with audited()"
```

---

### Task 10: Wrap wealth, planner, and session mutations

**Files:**

- Modify: `apps/backend/src/services/wealth.service.ts`
- Modify: `apps/backend/src/services/planner.service.ts`
- Modify: `apps/backend/src/services/setup-session.service.ts`
- Modify: `apps/backend/src/services/review-session.service.ts`
- Modify: corresponding route files

Action name / resource slug reference:

| Service method        | action                  | resource         |
| --------------------- | ----------------------- | ---------------- |
| `createWealthAccount` | `CREATE_WEALTH_ACCOUNT` | `wealth-account` |
| `updateWealthAccount` | `UPDATE_WEALTH_ACCOUNT` | `wealth-account` |
| `deleteWealthAccount` | `DELETE_WEALTH_ACCOUNT` | `wealth-account` |
| `createLiability`     | `CREATE_LIABILITY`      | `liability`      |
| `updateLiability`     | `UPDATE_LIABILITY`      | `liability`      |
| `deleteLiability`     | `DELETE_LIABILITY`      | `liability`      |
| `createPlannerGoal`   | `CREATE_PLANNER_GOAL`   | `planner-goal`   |
| `updatePlannerGoal`   | `UPDATE_PLANNER_GOAL`   | `planner-goal`   |
| `deletePlannerGoal`   | `DELETE_PLANNER_GOAL`   | `planner-goal`   |
| `createSetupSession`  | `CREATE_SETUP_SESSION`  | `setup-session`  |
| `updateSetupSession`  | `UPDATE_SETUP_SESSION`  | `setup-session`  |
| `createReviewSession` | `CREATE_REVIEW_SESSION` | `review-session` |
| `updateReviewSession` | `UPDATE_REVIEW_SESSION` | `review-session` |

- [ ] **Step 1–5:** Follow the same TDD pattern as Task 8. Write one representative test per service, implement `audited()` wrapping for all mutations, pass `actorCtx(req)` from route handlers.

- [ ] **Commit**

```bash
git add apps/backend/src/services/wealth.service.ts apps/backend/src/services/planner.service.ts apps/backend/src/services/setup-session.service.ts apps/backend/src/services/review-session.service.ts apps/backend/src/routes/
git commit -m "feat(audit): wrap wealth, planner, and session mutations with audited()"
```

---

### Task 11: Wrap household and settings mutations

**Files:**

- Modify: `apps/backend/src/services/household.service.ts`
- Modify: `apps/backend/src/services/settings.service.ts` (or equivalent)
- Modify: corresponding route files

Action name / resource slug reference:

| Service method            | action                      | resource             |
| ------------------------- | --------------------------- | -------------------- |
| `inviteMember`            | `INVITE_MEMBER`             | `household-invite`   |
| `removeMember`            | `REMOVE_MEMBER`             | `household-member`   |
| `updateMemberRole`        | `UPDATE_MEMBER_ROLE`        | `household-member`   |
| `updateHouseholdSettings` | `UPDATE_HOUSEHOLD_SETTINGS` | `household-settings` |
| `updateIsaConfig`         | `UPDATE_ISA_CONFIG`         | `isa-config`         |
| `updateStalenessConfig`   | `UPDATE_STALENESS_CONFIG`   | `staleness-config`   |

- [ ] **Step 1–5:** Follow the same TDD pattern as Task 8.

- [ ] **Commit**

```bash
git add apps/backend/src/services/household.service.ts apps/backend/src/services/settings.service.ts apps/backend/src/routes/
git commit -m "feat(audit): wrap household and settings mutations with audited()"
```

---

### Task 12: Frontend audit log service and hooks

**Files:**

- Create: `apps/frontend/src/services/auditLog.service.ts`
- Modify: `apps/frontend/src/hooks/useSettings.ts`
- Modify: `apps/frontend/src/services/household.service.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/hooks/useAuditLog.test.tsx
import { renderHook, waitFor } from "@testing-library/react";
import { server } from "../test/server";
import { http, HttpResponse } from "msw";
import { useAuditLog } from "../hooks/useSettings";
import { createWrapper } from "../test/utils";

describe("useAuditLog", () => {
  it("fetches audit log entries", async () => {
    server.use(
      http.get("/audit-log", () =>
        HttpResponse.json({
          entries: [
            {
              id: "al_1",
              actorName: "Alice",
              action: "CREATE_INCOME_SOURCE",
              resource: "income-source",
              resourceId: "inc_1",
              changes: [],
              createdAt: "2026-03-01T10:00:00Z",
            },
          ],
          nextCursor: null,
        }),
      ),
    );

    const { result } = renderHook(() => useAuditLog({}), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].entries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — "useAuditLog is not exported"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/services/auditLog.service.ts
import type { AuditLogQuery, AuditLogResponse } from "@fin-plan/shared";
import { apiClient } from "./api";

export async function fetchAuditLog(
  params: AuditLogQuery & { cursor?: string },
): Promise<AuditLogResponse> {
  const query = new URLSearchParams();
  if (params.actorId) query.set("actorId", params.actorId);
  if (params.resource) query.set("resource", params.resource);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));

  const res = await apiClient.get(`/audit-log?${query.toString()}`);
  return res.data;
}

export async function updateMemberRole(
  targetUserId: string,
  role: "member" | "admin",
  householdId: string,
) {
  const res = await apiClient.patch(
    `/households/${householdId}/members/${targetUserId}/role`,
    { role },
  );
  return res.data;
}
```

Add to `apps/frontend/src/hooks/useSettings.ts`:

```typescript
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchAuditLog, updateMemberRole } from "../services/auditLog.service";
import type { AuditLogQuery } from "@fin-plan/shared";

export const AUDIT_KEYS = {
  log: (filters: AuditLogQuery) => ["audit-log", filters] as const,
};

export function useAuditLog(filters: Omit<AuditLogQuery, "cursor" | "limit">) {
  return useInfiniteQuery({
    queryKey: AUDIT_KEYS.log(filters),
    queryFn: ({ pageParam }) =>
      fetchAuditLog({
        ...filters,
        cursor: pageParam as string | undefined,
        limit: 50,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
  });
}

export function useUpdateMemberRole(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetUserId,
      role,
    }: {
      targetUserId: string;
      role: "member" | "admin";
    }) => updateMemberRole(targetUserId, role, householdId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["household-members"] });
    },
  });
}
```

Update `apps/frontend/src/services/household.service.ts` — add `'admin'` to `HouseholdMember.role` type:

```typescript
export type HouseholdMember = {
  userId: string;
  householdId: string;
  role: "owner" | "admin" | "member";
  // ...existing fields
};
```

Update `inviteMember` to accept optional `role` parameter:

```typescript
export async function inviteMember(
  householdId: string,
  email: string,
  role: "member" | "admin" = "member",
) {
  const res = await apiClient.post(`/households/${householdId}/invites`, {
    email,
    role,
  });
  return res.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/auditLog.service.ts apps/frontend/src/hooks/useSettings.ts apps/frontend/src/services/household.service.ts
git commit -m "feat(frontend): add auditLog service, useAuditLog, useUpdateMemberRole hooks"
```

---

### Task 13: Audit log frontend components

**Files:**

- Create: `apps/frontend/src/components/settings/AuditLogSection.tsx`
- Create: `apps/frontend/src/components/settings/ActionBadge.tsx`
- Create: `apps/frontend/src/components/settings/ChangesCell.tsx`
- Create: `apps/frontend/src/components/settings/AuditLogFilters.tsx`
- Create: `apps/frontend/src/components/settings/AuditLogTable.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/settings/ActionBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { ActionBadge } from './ActionBadge';

describe('ActionBadge', () => {
  it('renders create badge with Plus icon', () => {
    render(<ActionBadge action="CREATE_INCOME_SOURCE" />);
    expect(screen.getByText(/created/i)).toBeInTheDocument();
  });

  it('renders update badge with Pencil icon', () => {
    render(<ActionBadge action="UPDATE_INCOME_SOURCE" />);
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });

  it('renders delete badge with Trash2 icon', () => {
    render(<ActionBadge action="DELETE_INCOME_SOURCE" />);
    expect(screen.getByText(/deleted/i)).toBeInTheDocument();
  });

  it('renders invite badge with UserPlus icon', () => {
    render(<ActionBadge action="INVITE_MEMBER" />);
    expect(screen.getByText(/invited/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — "Cannot find module './ActionBadge'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/components/settings/ActionBadge.tsx
import { Plus, Pencil, Trash2, UserPlus } from 'lucide-react';

type Props = { action: string };

function getVerb(action: string): { label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> } {
  if (action.startsWith('CREATE_')) return { label: 'created', Icon: Plus };
  if (action.startsWith('UPDATE_')) return { label: 'updated', Icon: Pencil };
  if (action.startsWith('DELETE_')) return { label: 'deleted', Icon: Trash2 };
  if (action.startsWith('INVITE_')) return { label: 'invited', Icon: UserPlus };
  return { label: action.toLowerCase(), Icon: Pencil };
}

export function ActionBadge({ action }: Props) {
  const { label, Icon } = getVerb(action);
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px]"
      style={{ background: 'rgba(238,242,255,0.06)' }}
    >
      <Icon size={11} strokeWidth={2.5} className="text-[#8b5cf6]" />
      <span className="text-[#8b5cf6]">{label}</span>
    </span>
  );
}
```

```typescript
// apps/frontend/src/components/settings/ChangesCell.tsx
import type { AuditChange } from '@fin-plan/shared';

type Props = { changes: AuditChange[] | null; action: string };

export function ChangesCell({ changes, action }: Props) {
  if (!changes || changes.length === 0) return <span className="text-muted text-xs">—</span>;

  const isCreate = action.startsWith('CREATE_');
  const isDelete = action.startsWith('DELETE_');

  return (
    <div className="space-y-1">
      {changes.map((c, i) => (
        <div key={i} className="flex items-baseline gap-1 font-numeric text-xs">
          <span className="text-tertiary">{c.field}</span>
          {isCreate && (
            <span className="text-primary">{String(c.after ?? '')}</span>
          )}
          {isDelete && (
            <span className="text-muted line-through">{String(c.before ?? '')}</span>
          )}
          {!isCreate && !isDelete && (
            <>
              <span className="text-muted">{String(c.before ?? '')}</span>
              <span className="text-tertiary">→</span>
              <span className="text-primary">{String(c.after ?? '')}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

```typescript
// apps/frontend/src/components/settings/AuditLogFilters.tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResourceSlugEnum } from '@fin-plan/shared';
import type { HouseholdMember } from '@/services/household.service';

type Filters = {
  actorId?: string;
  resource?: string;
  dateRange?: string;
};

type Props = {
  filters: Filters;
  members: HouseholdMember[];
  onChange: (filters: Filters) => void;
};

const DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export function AuditLogFilters({ filters, members, onChange }: Props) {
  return (
    <div className="flex gap-3 mb-4">
      <Select
        value={filters.actorId ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, actorId: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-40 bg-surface-elevated">
          <SelectValue placeholder="All members" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All members</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.displayName ?? m.userId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.resource ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, resource: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-44 bg-surface-elevated">
          <SelectValue placeholder="All resources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All resources</SelectItem>
          {ResourceSlugEnum.options.map((slug) => (
            <SelectItem key={slug} value={slug}>
              {slug}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.dateRange ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, dateRange: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-40 bg-surface-elevated">
          <SelectValue placeholder="All time" />
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

```typescript
// apps/frontend/src/components/settings/AuditLogTable.tsx
import type { AuditEntry } from '@fin-plan/shared';
import { ActionBadge } from './ActionBadge';
import { ChangesCell } from './ChangesCell';
import { formatDistanceToNow } from 'date-fns';

type Props = { entries: AuditEntry[] };

export function AuditLogTable({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded bg-surface-elevated animate-pulse opacity-50" />
        ))}
        <p className="text-muted text-sm text-center pt-2">No changes recorded yet</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted text-xs border-b border-border">
          <th className="pb-2 pr-4 font-medium">When</th>
          <th className="pb-2 pr-4 font-medium">Who</th>
          <th className="pb-2 pr-4 font-medium">Action</th>
          <th className="pb-2 pr-4 font-medium">Resource</th>
          <th className="pb-2 font-medium">Changes</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id} className="border-b border-border/50">
            <td className="py-2 pr-4">
              <span
                className="font-numeric text-xs text-secondary"
                title={entry.createdAt}
              >
                {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
              </span>
            </td>
            <td className="py-2 pr-4 text-secondary text-xs">{entry.actorName ?? '—'}</td>
            <td className="py-2 pr-4">
              <ActionBadge action={entry.action} />
            </td>
            <td className="py-2 pr-4">
              <div className="flex flex-col">
                <span className="text-secondary text-xs">{entry.resourceId ?? '—'}</span>
                <span className="text-muted text-[11px]">{entry.resource}</span>
              </div>
            </td>
            <td className="py-2">
              <ChangesCell changes={entry.changes} action={entry.action} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

```typescript
// apps/frontend/src/components/settings/AuditLogSection.tsx
import { useState } from 'react';
import { useAuditLog } from '@/hooks/useSettings';
import { useHouseholdMembers } from '@/hooks/useHousehold';
import { AuditLogFilters } from './AuditLogFilters';
import { AuditLogTable } from './AuditLogTable';
import { SectionHeader } from '@/components/common/SectionHeader';
import { subDays } from 'date-fns';

type Filters = { actorId?: string; resource?: string; dateRange?: string };

function filtersToQuery(filters: Filters) {
  const dateFrom = filters.dateRange
    ? subDays(new Date(), Number(filters.dateRange)).toISOString()
    : undefined;
  return {
    actorId: filters.actorId,
    resource: filters.resource as any,
    dateFrom,
  };
}

export function AuditLogSection() {
  const [filters, setFilters] = useState<Filters>({});
  const { data: membersData } = useHouseholdMembers();
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuditLog(filtersToQuery(filters));

  const allEntries = data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div>
      <SectionHeader title="Audit log" />

      <AuditLogFilters
        filters={filters}
        members={membersData?.members ?? []}
        onChange={setFilters}
      />

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 rounded bg-surface-elevated animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-muted text-sm">Unable to load audit log</p>
      )}

      {!isLoading && !isError && <AuditLogTable entries={allEntries} />}

      {hasNextPage && !isLoading && (
        <button
          type="button"
          className="mt-4 text-sm text-[#8b5cf6] hover:underline disabled:opacity-50"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load older entries'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/ActionBadge.tsx apps/frontend/src/components/settings/ChangesCell.tsx apps/frontend/src/components/settings/AuditLogFilters.tsx apps/frontend/src/components/settings/AuditLogTable.tsx apps/frontend/src/components/settings/AuditLogSection.tsx
git commit -m "feat(frontend): add AuditLogSection, ActionBadge, ChangesCell, AuditLogFilters, AuditLogTable components"
```

---

### Task 14: SettingsPage and HouseholdSection integration

**Files:**

- Modify: `apps/frontend/src/pages/SettingsPage.tsx`
- Modify: `apps/frontend/src/components/settings/HouseholdSection.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/pages/SettingsPage.test.tsx (extend existing)
import { render, screen } from '@testing-library/react';
import SettingsPage from './SettingsPage';
import { createWrapper } from '../test/utils';

describe('SettingsPage — Audit Log nav', () => {
  it('shows Audit log nav item for owner', async () => {
    // Mock useSettings to return owner role
    render(<SettingsPage />, { wrapper: createWrapper({ role: 'owner' }) });
    expect(await screen.findByText('Audit log')).toBeInTheDocument();
  });

  it('shows Audit log nav item for admin', async () => {
    render(<SettingsPage />, { wrapper: createWrapper({ role: 'admin' }) });
    expect(await screen.findByText('Audit log')).toBeInTheDocument();
  });

  it('hides Audit log nav item for member', async () => {
    render(<SettingsPage />, { wrapper: createWrapper({ role: 'member' }) });
    // Should not render the nav item
    expect(screen.queryByText('Audit log')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — "Audit log" nav item not found

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/pages/SettingsPage.tsx`:

```typescript
import { AuditLogSection } from "@/components/settings/AuditLogSection";
import { useHouseholdRole } from "@/hooks/useHousehold"; // or however role is accessed

// Update SECTIONS to be dynamic based on role:
// Add audit-log only for owner/admin
const useSettingsSections = () => {
  const role = useHouseholdRole();
  const base = [
    { id: "profile", label: "Profile" },
    { id: "staleness", label: "Staleness thresholds" },
    { id: "surplus", label: "Surplus benchmark" },
    { id: "isa", label: "ISA settings" },
    { id: "household", label: "Household" },
    { id: "trust-accounts", label: "Trust accounts" },
  ] as const;

  if (role === "owner" || role === "admin") {
    return [...base, { id: "audit-log", label: "Audit log" }] as const;
  }
  return base;
};
```

Then in the JSX, render conditionally:

```tsx
{
  (role === "owner" || role === "admin") && (
    <div ref={setRef("audit-log")} data-section-id="audit-log">
      <AuditLogSection />
    </div>
  );
}
```

In `apps/frontend/src/components/settings/HouseholdSection.tsx`, add role badge and promote/demote action to each member row:

```tsx
// In the member list map:
<div key={member.userId} className="flex items-center justify-between py-2">
  <div className="flex flex-col">
    <span className="text-secondary text-sm">{member.displayName}</span>
    <span className="text-muted text-xs capitalize">{member.role}</span>
  </div>
  {canActOnMember(callerRole, member.role) && (
    <RoleSelector
      currentRole={member.role as "member" | "admin"}
      onChange={(newRole) =>
        updateRole({ targetUserId: member.userId, role: newRole })
      }
    />
  )}
</div>
```

Add `RoleSelector` component inline or as a small separate file:

```typescript
// apps/frontend/src/components/settings/RoleSelector.tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Props = {
  currentRole: 'member' | 'admin';
  onChange: (role: 'member' | 'admin') => void;
};

export function RoleSelector({ currentRole, onChange }: Props) {
  return (
    <Select value={currentRole} onValueChange={(v) => onChange(v as 'member' | 'admin')}>
      <SelectTrigger className="w-28 h-7 text-xs bg-surface-elevated">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="member">Member</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

Also update invite form in `HouseholdSection.tsx` to include role selector — add `role` state (defaulting to `'member'`), render `RoleSelector`, and pass `role` to `inviteMember`.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/SettingsPage.tsx apps/frontend/src/components/settings/HouseholdSection.tsx apps/frontend/src/components/settings/RoleSelector.tsx
git commit -m "feat(settings): integrate AuditLogSection and admin role management into Settings UI"
```

---

## Testing

### Backend Tests

- [ ] Service: `computeDiff` — create / update / delete / no-change cases
- [ ] Service: `audited()` — returns mutation result; writes `AuditLog`; rolls back on audit failure; backward-compat when `ctx` absent
- [ ] Service: `queryAuditLog` — returns entries; nextCursor present/absent; filters (actorId, resource, date); always scoped to householdId
- [ ] Service: `updateMemberRole` — owner promote/demote; admin promote; admin demote-admin → 403; owner-target → 403
- [ ] Endpoint: `GET /audit-log` — owner 200; admin 200; member 403; no-token 401; ipAddress/userAgent absent from response
- [ ] Endpoint: `PATCH /households/:id/members/:userId/role` — valid update 200; cross-household 403
- [ ] Edge case: `audited()` transaction rolled back when `auditLog.create` throws

### Frontend Tests

- [ ] Component: `ActionBadge` — correct label and icon for CREATE/UPDATE/DELETE/INVITE
- [ ] Component: `ChangesCell` — create (no before), update (before→after), delete (strikethrough)
- [ ] Component: `AuditLogTable` — renders rows; shows empty state when entries = []
- [ ] Hook: `useAuditLog` — fetches entries; cursor pagination via `fetchNextPage`
- [ ] Page: `SettingsPage` — Audit log nav item visible for owner/admin; hidden for member

### Key Scenarios

- [ ] Happy path: owner mutates income source → `AuditLog` row written; owner opens Settings → Audit Log shows entry with correct actor, action, resource, changes
- [ ] Error case: DB error in `auditLog.create` → entire transaction rolled back, income source not created
- [ ] Edge case: former member's name persists in old audit entries after they leave the household
- [ ] Edge case: admin invites new user as admin → user joins with `admin` role
- [ ] Edge case: admin attempts to demote other admin → 403; owner can demote admin

## Verification

- [ ] `bun run db:migrate` applies cleanly; `admin` in `HouseholdRole` enum; `AuditLog` has new columns
- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — zero errors
- [ ] `cd apps/backend && bun scripts/run-tests.ts audit` — all pass
- [ ] `cd apps/backend && bun scripts/run-tests.ts household` — all pass
- [ ] `cd apps/backend && bun scripts/run-tests.ts waterfall` — all pass
- [ ] Manual: Mutate an income source → open Settings as owner → Audit Log shows entry; apply member/resource/date filters; scroll past 50 entries → "Load older entries" appears
- [ ] Manual: Invite member as admin → they join with admin role; admin promotes member → role updates; admin tries to demote other admin → blocked
- [ ] Manual: Open Settings as member → Audit Log section absent

## Post-conditions

- [ ] Every household mutation is wrapped in `audited()` — full immutable trail from day one
- [ ] `admin` role is available for invite and promotion flows
- [ ] Audit Log section accessible in Settings to owner and admin roles
- [ ] `ResourceSlugEnum` and `HouseholdRoleEnum` in `packages/shared` available to frontend for type-safe filtering and role display
