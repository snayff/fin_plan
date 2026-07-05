---
feature: richer-audit-logging
category: infrastructure
spec: docs/4. planning/richer-audit-logging/richer-audit-logging-spec.md
creation_date: 2026-04-18
status: implemented
implemented_date: 2026-07-05
---

# Richer Audit Logging — Implementation Plan

> **For Claude:** Use `/execute-plan richer-audit-logging` to implement this plan task-by-task.

**Goal:** Close the auth-event visibility gap, wrap the ~10 unaudited household mutations, tighten the audit taxonomy and diff quality, and introduce 180-day retention — all without a schema change.
**Spec:** `docs/4. planning/richer-audit-logging/richer-audit-logging-spec.md`
**Architecture:** Two UI surfaces over the existing `AuditLog` table. A new `/api/security-activity` endpoint returns the caller's own auth events (`householdId IS NULL`, `userId = caller`, excluding `TOKEN_REFRESH`). The existing `/api/audit-log` endpoint is unchanged. A shared `AuditAction` const and extended `ResourceSlugEnum` centralise the taxonomy. `computeDiff` gains a `FLAT_JSON_ALLOWLIST` for one-level descent. A new `retentionService` + module-load `setInterval(...).unref()` purges rows older than 180 days (mirrors `tokenBlacklist`). Every currently-unaudited mutation is wrapped via `audited()`; bulk and cascade operations emit a single summary row with `metadata.counts` or `metadata.cascaded`. `actorCtx` becomes a required parameter on every service function that mutates household data.
**Tech Stack:** Fastify · Prisma · tRPC (via direct Fastify routes) · Zod · React 18 · TanStack Query · Zustand · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: no

## Pre-conditions

- [ ] Existing audit infrastructure present: `audit.service.ts` (`audited`, `computeDiff`, `SYSTEM_FIELDS`), `audit-log.service.ts` (`queryAuditLog`), `actor-ctx.ts`, `packages/shared/src/schemas/audit.schemas.ts`
- [ ] Existing household audit-log UI present: `AuditLogSection`, `AuditLogTable`, `AuditLogFilters`, `ActionBadge`, `ChangesCell`
- [ ] Existing `ProfileSettingsPage` and `HouseholdSettingsPage` already mount their respective right-panel sections

## Tasks

> Ordered: shared schemas → diff/taxonomy infra → coverage expansion → required ctx sweep → retention → security activity backend → security activity frontend → retention footer.

---

### Task 1: Shared — `AuditAction` const + extend `ResourceSlugEnum`

**Files:**

- Modify: `packages/shared/src/schemas/audit.schemas.ts`
- Test: `packages/shared/src/schemas/audit.schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/src/schemas/audit.schemas.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { AuditAction, ResourceSlugEnum, AuditActionEnum } from "./audit.schemas";

describe("AuditAction", () => {
  it("exposes auth + household + summary actions as SCREAMING_SNAKE_CASE", () => {
    expect(AuditAction.LOGIN_SUCCESS).toBe("LOGIN_SUCCESS");
    expect(AuditAction.CREATE_INCOME_SOURCE).toBe("CREATE_INCOME_SOURCE");
    expect(AuditAction.DELETE_HOUSEHOLD).toBe("DELETE_HOUSEHOLD");
    expect(AuditAction.IMPORT_DATA).toBe("IMPORT_DATA");
    expect(AuditAction.UPDATE_PROFILE).toBe("UPDATE_PROFILE");
    expect(AuditAction.TOKEN_REFRESH).toBe("TOKEN_REFRESH");
  });

  it("every value matches its key (no drift between key and literal)", () => {
    for (const [k, v] of Object.entries(AuditAction)) {
      expect(v).toBe(k);
    }
  });

  it("AuditActionEnum accepts every AuditAction value", () => {
    for (const v of Object.values(AuditAction)) {
      expect(AuditActionEnum.safeParse(v).success).toBe(true);
    }
  });
});

describe("ResourceSlugEnum", () => {
  it("includes the new slugs required by richer-audit-logging", () => {
    const required = [
      "snapshot",
      "user",
      "gift-person",
      "gift-event",
      "gift-allocation",
      "member-profile",
      "year-budget",
      "household",
    ];
    for (const s of required) {
      expect(ResourceSlugEnum.safeParse(s).success).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/schemas/audit.schemas.test.ts`
Expected: FAIL — `AuditAction is not defined` / slugs fail parse.

- [ ] **Step 3: Write minimal implementation**

Replace `packages/shared/src/schemas/audit.schemas.ts`:

```typescript
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
  // richer-audit-logging additions
  "snapshot",
  "user",
  "gift-person",
  "gift-event",
  "gift-allocation",
  "member-profile",
  "year-budget",
  "household",
]);
export type ResourceSlug = z.infer<typeof ResourceSlugEnum>;

/**
 * Single source of truth for every audit action name written by backend code.
 * Values mirror keys so a drift test can enforce `v === k` for every entry.
 */
export const AuditAction = {
  // Auth events
  REGISTER: "REGISTER",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  TOKEN_REFRESH: "TOKEN_REFRESH",
  SESSION_REVOKED: "SESSION_REVOKED",
  ALL_SESSIONS_REVOKED: "ALL_SESSIONS_REVOKED",
  UPDATE_PROFILE: "UPDATE_PROFILE",

  // Household
  CREATE_HOUSEHOLD: "CREATE_HOUSEHOLD",
  UPDATE_HOUSEHOLD: "UPDATE_HOUSEHOLD",
  DELETE_HOUSEHOLD: "DELETE_HOUSEHOLD",
  LEAVE_HOUSEHOLD: "LEAVE_HOUSEHOLD",
  INVITE_MEMBER: "INVITE_MEMBER",
  ACCEPT_INVITE: "ACCEPT_INVITE",
  CANCEL_INVITE: "CANCEL_INVITE",
  REMOVE_MEMBER: "REMOVE_MEMBER",
  UPDATE_MEMBER_ROLE: "UPDATE_MEMBER_ROLE",
  CREATE_MEMBER_PROFILE: "CREATE_MEMBER_PROFILE",
  UPDATE_MEMBER_PROFILE: "UPDATE_MEMBER_PROFILE",
  DELETE_MEMBER_PROFILE: "DELETE_MEMBER_PROFILE",
  UPDATE_HOUSEHOLD_SETTINGS: "UPDATE_HOUSEHOLD_SETTINGS",

  // Waterfall (already emitted by existing code)
  CREATE_INCOME_SOURCE: "CREATE_INCOME_SOURCE",
  UPDATE_INCOME_SOURCE: "UPDATE_INCOME_SOURCE",
  DELETE_INCOME_SOURCE: "DELETE_INCOME_SOURCE",
  CREATE_COMMITTED_ITEM: "CREATE_COMMITTED_ITEM",
  UPDATE_COMMITTED_ITEM: "UPDATE_COMMITTED_ITEM",
  DELETE_COMMITTED_ITEM: "DELETE_COMMITTED_ITEM",
  CREATE_DISCRETIONARY_ITEM: "CREATE_DISCRETIONARY_ITEM",
  UPDATE_DISCRETIONARY_ITEM: "UPDATE_DISCRETIONARY_ITEM",
  DELETE_DISCRETIONARY_ITEM: "DELETE_DISCRETIONARY_ITEM",

  // Wealth
  CREATE_WEALTH_ACCOUNT: "CREATE_WEALTH_ACCOUNT",
  UPDATE_WEALTH_ACCOUNT: "UPDATE_WEALTH_ACCOUNT",
  DELETE_WEALTH_ACCOUNT: "DELETE_WEALTH_ACCOUNT",
  CREATE_LIABILITY: "CREATE_LIABILITY",
  UPDATE_LIABILITY: "UPDATE_LIABILITY",
  DELETE_LIABILITY: "DELETE_LIABILITY",

  // Snapshots
  CREATE_SNAPSHOT: "CREATE_SNAPSHOT",
  UPDATE_SNAPSHOT: "UPDATE_SNAPSHOT",
  DELETE_SNAPSHOT: "DELETE_SNAPSHOT",

  // Gifts
  CREATE_GIFT_PERSON: "CREATE_GIFT_PERSON",
  UPDATE_GIFT_PERSON: "UPDATE_GIFT_PERSON",
  DELETE_GIFT_PERSON: "DELETE_GIFT_PERSON",
  CREATE_GIFT_EVENT: "CREATE_GIFT_EVENT",
  UPDATE_GIFT_EVENT: "UPDATE_GIFT_EVENT",
  DELETE_GIFT_EVENT: "DELETE_GIFT_EVENT",
  UPSERT_GIFT_ALLOCATIONS: "UPSERT_GIFT_ALLOCATIONS",

  // Planner
  CREATE_PLANNER_GOAL: "CREATE_PLANNER_GOAL",
  UPDATE_PLANNER_GOAL: "UPDATE_PLANNER_GOAL",
  DELETE_PLANNER_GOAL: "DELETE_PLANNER_GOAL",
  UPSERT_YEAR_BUDGET: "UPSERT_YEAR_BUDGET",

  // Review / setup sessions (already emitted)
  UPDATE_REVIEW_SESSION: "UPDATE_REVIEW_SESSION",
  UPDATE_SETUP_SESSION: "UPDATE_SETUP_SESSION",

  // Import / export
  EXPORT_DATA: "EXPORT_DATA",
  IMPORT_DATA: "IMPORT_DATA",
} as const;

export type AuditActionKey = keyof typeof AuditAction;
export const AuditActionEnum = z.enum(
  Object.values(AuditAction) as [AuditActionKey, ...AuditActionKey[]]
);

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
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const AuditLogResponseSchema = z.object({
  entries: z.array(AuditEntrySchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

/** Security activity — per-user, auth-scoped view. */
export const SecurityActivityQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type SecurityActivityQuery = z.infer<typeof SecurityActivityQuerySchema>;

export const SecurityActivityEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  createdAt: z.string().datetime(),
  metadata: z.unknown().nullable(),
});
export type SecurityActivityEntry = z.infer<typeof SecurityActivityEntrySchema>;

export const SecurityActivityResponseSchema = z.object({
  entries: z.array(SecurityActivityEntrySchema),
  nextCursor: z.string().nullable(),
});
export type SecurityActivityResponse = z.infer<typeof SecurityActivityResponseSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/shared/src/schemas/audit.schemas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/audit.schemas.ts packages/shared/src/schemas/audit.schemas.test.ts
git commit -m "feat(shared): add AuditAction const, extend ResourceSlugEnum, add SecurityActivity schemas"
```

---

### Task 2: Backend — taxonomy drift tests

**Files:**

- Create: `apps/backend/src/services/audit-taxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/audit-taxonomy.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AuditAction, ResourceSlugEnum } from "@finplan/shared";

const ROOT = join(import.meta.dir, "..");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) yield full;
  }
}

const backendSources = [...walk(ROOT)];

describe("audit taxonomy — action names", () => {
  it("every `action: \"…\"` or `action: AuditAction.XXX` is a known AuditAction value", () => {
    const known = new Set(Object.values(AuditAction) as string[]);
    const stringLiteral = /action:\s*["'`]([A-Z_]+)["'`]/g;
    const bad: { file: string; action: string }[] = [];
    for (const file of backendSources) {
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = stringLiteral.exec(src))) {
        if (!known.has(m[1]!)) bad.push({ file, action: m[1]! });
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("audit taxonomy — resource slugs", () => {
  it("every `resource: \"slug\"` literal is a member of ResourceSlugEnum", () => {
    const known = new Set(ResourceSlugEnum.options as string[]);
    const stringLiteral = /resource:\s*["'`]([a-z-]+)["'`]/g;
    const bad: { file: string; slug: string }[] = [];
    for (const file of backendSources) {
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = stringLiteral.exec(src))) {
        if (!known.has(m[1]!)) bad.push({ file, slug: m[1]! });
      }
    }
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts audit-taxonomy`
Expected: FAIL — drift exists (e.g. `LOGIN_FAILED` already listed in AuditAction; but any unmapped slug like `snapshot` or `user` currently used anywhere would fail). If it happens to pass with the full AuditAction added in Task 1 before any new wraps land, force a failure by temporarily referencing an unknown action; then remove.

- [ ] **Step 3: No implementation change in this task.** The test becomes green once Task 1 lands (it already did) and stays green by constraining subsequent tasks.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts audit-taxonomy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/audit-taxonomy.test.ts
git commit -m "test(audit): guard against action-name and resource-slug drift"
```

---

### Task 3: `computeDiff` — one-level descent for allowlisted flat JSON blobs

**Files:**

- Modify: `apps/backend/src/services/audit.service.ts`
- Modify: `apps/backend/src/services/audit.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/services/audit.service.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { computeDiff } from "./audit.service";

describe("computeDiff — FLAT_JSON_ALLOWLIST descent", () => {
  it("descends one level into household-settings.stalenessThresholds", () => {
    const before = {
      stalenessThresholds: { income: 30, committed: 60, discretionary: 90 },
      otherField: "unchanged",
    };
    const after = {
      stalenessThresholds: { income: 45, committed: 60, discretionary: 90 },
      otherField: "unchanged",
    };
    const changes = computeDiff(before, after, "household-settings");
    expect(changes).toEqual([
      { field: "stalenessThresholds.income", before: 30, after: 45 },
    ]);
  });

  it("emits an opaque change for non-allowlisted JSON fields", () => {
    const before = { metadata: { a: 1 } };
    const after = { metadata: { a: 2 } };
    const changes = computeDiff(before, after, "household-settings");
    expect(changes).toEqual([
      { field: "metadata", before: { a: 1 }, after: { a: 2 } },
    ]);
  });

  it("emits sub-field creates when before has no allowlisted JSON blob", () => {
    const before = { stalenessThresholds: null };
    const after = { stalenessThresholds: { income: 30, committed: 60 } };
    const changes = computeDiff(before, after, "household-settings");
    expect(changes).toContainEqual({ field: "stalenessThresholds.income", after: 30 });
    expect(changes).toContainEqual({ field: "stalenessThresholds.committed", after: 60 });
  });
});

describe("SYSTEM_FIELDS — twoFactorEnabled is hidden", () => {
  it("filters twoFactorEnabled from diff output", () => {
    const before = { name: "A", twoFactorEnabled: false };
    const after = { name: "B", twoFactorEnabled: true };
    const changes = computeDiff(before, after, "user");
    expect(changes.find((c) => c.field === "twoFactorEnabled")).toBeUndefined();
    expect(changes.find((c) => c.field === "name")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.service`
Expected: FAIL — current `computeDiff` returns an opaque `{ field: 'stalenessThresholds', before, after }`, and `twoFactorEnabled` is not in `SYSTEM_FIELDS`.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/services/audit.service.ts`:

```typescript
// Add to SYSTEM_FIELDS set:
const SYSTEM_FIELDS = new Set([
  "id",
  "householdId",
  "createdAt",
  "updatedAt",
  "sortOrder",
  "lastReviewedAt",
  "subcategoryId",
  "yearAdded",
  "tokenHash",
  "passwordHash",
  "twoFactorSecret",
  "twoFactorBackupCodes",
  "twoFactorEnabled", // NEW: future-proofs for 2FA endpoints
  "refreshToken",
  "token",
  "password",
  "email",
]);

// Add above computeDiff:
const FLAT_JSON_ALLOWLIST: Record<string, Set<string>> = {
  "household-settings": new Set(["stalenessThresholds"]),
};

function isFlatJsonField(resource: string | undefined, field: string): boolean {
  if (!resource) return false;
  return FLAT_JSON_ALLOWLIST[resource]?.has(field) ?? false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function descendJson(
  field: string,
  before: unknown,
  after: unknown
): AuditChange[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: AuditChange[] = [];
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    const change: AuditChange = { field: `${field}.${k}` };
    if (bv !== undefined) change.before = bv;
    if (av !== undefined) change.after = av;
    out.push(change);
  }
  return out;
}
```

Then update the UPDATE branch of `computeDiff`:

```typescript
for (const field of allKeys) {
  if (isHiddenField(field, resource)) continue;
  const b = before[field];
  const a = after[field];
  if (JSON.stringify(b) !== JSON.stringify(a)) {
    if (isFlatJsonField(resource, field)) {
      changes.push(...descendJson(field, b, a));
    } else {
      changes.push({ field, before: b, after: a });
    }
  }
}
```

And the CREATE / DELETE branches likewise descend when the field matches `isFlatJsonField`:

```typescript
if (!before) {
  const out: AuditChange[] = [];
  for (const [field, value] of Object.entries(after!)) {
    if (isHiddenField(field, resource)) continue;
    if (isFlatJsonField(resource, field) && isRecord(value)) {
      out.push(...descendJson(field, undefined, value));
    } else {
      out.push({ field, after: value });
    }
  }
  return out;
}
// … same shape for DELETE with `before`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/audit.service.ts apps/backend/src/services/audit.service.test.ts
git commit -m "feat(audit): descend one level into allowlisted flat JSON blobs; hide twoFactorEnabled"
```

---

### Task 4: Wrap snapshot CRUD in `audited()`

**Files:**

- Modify: `apps/backend/src/services/snapshot.service.ts`
- Modify: `apps/backend/src/routes/snapshots.routes.ts`
- Modify: `apps/backend/src/services/snapshot.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `snapshot.service.test.ts`:

```typescript
it("writes an audit entry on snapshot create", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  const snap = await snapshotService.create(householdId, { label: "Q1" }, ctx);
  const row = await prisma.auditLog.findFirst({
    where: { householdId, action: "CREATE_SNAPSHOT", resourceId: snap.id },
  });
  expect(row).not.toBeNull();
  expect(row!.actorId).toBe(ctx.actorId);
});

it("writes an audit entry on snapshot update", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  const snap = await snapshotService.create(householdId, { label: "Q1" }, ctx);
  await snapshotService.update(householdId, snap.id, { label: "Q1 revised" }, ctx);
  const row = await prisma.auditLog.findFirst({
    where: { householdId, action: "UPDATE_SNAPSHOT", resourceId: snap.id },
    orderBy: { createdAt: "desc" },
  });
  expect(row).not.toBeNull();
  expect(row!.changes).toContainEqual({ field: "label", before: "Q1", after: "Q1 revised" });
});

it("writes an audit entry on snapshot delete", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  const snap = await snapshotService.create(householdId, { label: "Q1" }, ctx);
  await snapshotService.delete(householdId, snap.id, ctx);
  const row = await prisma.auditLog.findFirst({
    where: { householdId, action: "DELETE_SNAPSHOT", resourceId: snap.id },
  });
  expect(row).not.toBeNull();
});
```

Use the existing `seedHouseholdWithCtx` helper (grep `seedHouseholdWithCtx` — create a minimal one in `apps/backend/src/test/helpers.ts` if missing, returning `{ householdId, ctx }` where `ctx` is an `ActorCtx` including `actorId`, `actorName`, `householdId`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshot.service`
Expected: FAIL — no `AuditLog` row is created today.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/services/snapshot.service.ts`:

```typescript
import { audited, type ActorCtx } from "./audit.service";
import { AuditAction } from "@finplan/shared";
import { prisma } from "../config/database";

export const snapshotService = {
  async create(householdId: string, data: { label: string; /* … */ }, ctx: ActorCtx) {
    // Move the current prisma.snapshot.create call inside audited().
    return audited({
      db: prisma,
      ctx,
      action: AuditAction.CREATE_SNAPSHOT,
      resource: "snapshot",
      resourceId: "pending", // overwritten after create; see note below
      beforeFetch: async () => null,
      mutation: (tx) => tx.snapshot.create({ data: { householdId, ...data } }),
    }).then(async (created) => {
      // Update audit row with real resourceId once we have it — or
      // alternatively: perform a two-step insert where we set resourceId from result.id.
      await prisma.auditLog.updateMany({
        where: { householdId, action: AuditAction.CREATE_SNAPSHOT, resourceId: "pending" },
        data: { resourceId: created.id },
      });
      return created;
    });
  },

  async update(householdId: string, id: string, data: { label?: string }, ctx: ActorCtx) {
    return audited({
      db: prisma,
      ctx,
      action: AuditAction.UPDATE_SNAPSHOT,
      resource: "snapshot",
      resourceId: id,
      beforeFetch: (tx) => tx.snapshot.findUnique({ where: { id } }),
      mutation: (tx) => tx.snapshot.update({ where: { id }, data }),
    });
  },

  async delete(householdId: string, id: string, ctx: ActorCtx) {
    return audited({
      db: prisma,
      ctx,
      action: AuditAction.DELETE_SNAPSHOT,
      resource: "snapshot",
      resourceId: id,
      beforeFetch: (tx) => tx.snapshot.findUnique({ where: { id } }),
      mutation: (tx) => tx.snapshot.delete({ where: { id } }),
    });
  },

  // …other list methods unchanged
};
```

**Note on create resourceId:** If the existing `audited()` wrapper already supports deferred `resourceId` via a callback or post-mutation patch, use that instead of the updateMany hack. Check the current signature during implementation; if not, extend `audited()` to accept `resourceId: string | ((after: T) => string)` — this is the cleanest way and is used by other services once they follow the pattern.

Edit `apps/backend/src/routes/snapshots.routes.ts` to pass `actorCtx(request)` into every create/update/delete call.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts snapshot.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/snapshot.service.ts apps/backend/src/services/snapshot.service.test.ts apps/backend/src/routes/snapshots.routes.ts
git commit -m "feat(audit): wrap snapshot CRUD in audited()"
```

---

### Task 5: Extend `audited()` to support lazy `resourceId` (if not already supported)

**Files:**

- Modify: `apps/backend/src/services/audit.service.ts`
- Modify: `apps/backend/src/services/audit.service.test.ts`

> Only perform this task if Task 4 revealed that `audited()` lacks lazy `resourceId` support. If it already does, skip and delete this task.

- [ ] **Step 1: Write the failing test**

```typescript
it("supports a function for resourceId computed from the mutation result", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  const created = await audited({
    db: prisma,
    ctx,
    action: "CREATE_TEST",
    resource: "test",
    resourceId: (after: { id: string }) => after.id,
    beforeFetch: async () => null,
    mutation: (tx) => tx.snapshot.create({ data: { householdId, label: "X" } }),
  });
  const row = await prisma.auditLog.findFirst({ where: { resourceId: created.id } });
  expect(row).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.service`
Expected: FAIL — type error or runtime error.

- [ ] **Step 3: Write minimal implementation**

Change `AuditedParams<T>`:

```typescript
export type AuditedParams<T> = {
  db: PrismaClient;
  ctx: ActorCtx;
  action: string;
  resource: string;
  resourceId: string | ((after: T) => string);
  beforeFetch: (tx: PrismaClient) => Promise<Record<string, unknown> | null>;
  mutation: (tx: PrismaClient) => Promise<T>;
};
```

And in the transaction body:

```typescript
const resolvedResourceId =
  typeof resourceId === "function" ? resourceId(result) : resourceId;
await (tx as any).auditLog.create({
  data: { /* … */, resourceId: resolvedResourceId },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts audit.service`
Expected: PASS. Then rewrite Task 4's snapshot create to use the function form and drop the `updateMany` hack.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/audit.service.ts apps/backend/src/services/audit.service.test.ts apps/backend/src/services/snapshot.service.ts
git commit -m "feat(audit): support lazy resourceId resolved from mutation result"
```

---

### Task 6: Wrap gifts people + events CRUD in `audited()`

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/routes/gifts.routes.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("writes audit entries for gift person + event CRUD", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  const person = await giftsService.createPerson(householdId, { name: "Alex" }, ctx);
  const event = await giftsService.createEvent(householdId, { name: "Birthday", dueMonth: 6 }, ctx);
  await giftsService.updatePerson(householdId, person.id, { name: "Alexandra" }, ctx);
  await giftsService.deleteEvent(householdId, event.id, ctx);

  const actions = await prisma.auditLog.findMany({
    where: { householdId },
    select: { action: true },
    orderBy: { createdAt: "asc" },
  });
  expect(actions.map((a) => a.action)).toEqual([
    "CREATE_GIFT_PERSON",
    "CREATE_GIFT_EVENT",
    "UPDATE_GIFT_PERSON",
    "DELETE_GIFT_EVENT",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL — `createPerson` doesn't accept `ctx`; no audit rows exist.

- [ ] **Step 3: Write minimal implementation**

For every gift person / event create / update / delete method in `gifts.service.ts`:

- Add `ctx: ActorCtx` as a required parameter (after the data param).
- Wrap the Prisma call in `audited({...})` using the appropriate `AuditAction.*` and `resource: "gift-person"` or `"gift-event"`.
- Use `resourceId: (after) => after.id` for creates and `resourceId: id` for updates/deletes.

Remove the `TODO(gifts): wrap mutations in audited()` comment at the top of the file.

Update the routes in `gifts.routes.ts` to pass `actorCtx(request)` on every call.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts apps/backend/src/routes/gifts.routes.ts
git commit -m "feat(audit): wrap gift person and gift event CRUD in audited()"
```

---

### Task 7: Gift allocation bulk upsert → single summary row

**Files:**

- Modify: `apps/backend/src/services/gifts.service.ts`
- Modify: `apps/backend/src/services/gifts.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("emits exactly one UPSERT_GIFT_ALLOCATIONS row with counts metadata", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  const [p1, p2] = await Promise.all([
    giftsService.createPerson(householdId, { name: "A" }, ctx),
    giftsService.createPerson(householdId, { name: "B" }, ctx),
  ]);
  const event = await giftsService.createEvent(householdId, { name: "Xmas", dueMonth: 12 }, ctx);
  await giftsService.bulkUpsertAllocations(
    householdId,
    { allocations: [
      { personId: p1.id, eventId: event.id, amount: 20 },
      { personId: p2.id, eventId: event.id, amount: 15 },
    ] },
    ctx
  );

  const rows = await prisma.auditLog.findMany({
    where: { householdId, action: "UPSERT_GIFT_ALLOCATIONS" },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].metadata).toMatchObject({ counts: { created: 2 } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

In `gifts.service.ts`, the bulk upsert should:

```typescript
async bulkUpsertAllocations(householdId: string, input: BulkUpsertAllocationsInput, ctx: ActorCtx) {
  return prisma.$transaction(async (tx) => {
    // Pre-count existing to classify created vs updated
    const existing = await tx.giftAllocation.findMany({
      where: {
        householdId,
        OR: input.allocations.map((a) => ({ personId: a.personId, eventId: a.eventId })),
      },
      select: { personId: true, eventId: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.personId}:${e.eventId}`));

    let created = 0;
    let updated = 0;
    for (const a of input.allocations) {
      const isNew = !existingKeys.has(`${a.personId}:${a.eventId}`);
      if (isNew) created++;
      else updated++;
      await tx.giftAllocation.upsert({
        where: { householdId_personId_eventId: { householdId, personId: a.personId, eventId: a.eventId } },
        create: { householdId, ...a },
        update: { amount: a.amount },
      });
    }

    await tx.auditLog.create({
      data: {
        householdId: ctx.householdId,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        action: AuditAction.UPSERT_GIFT_ALLOCATIONS,
        resource: "gift-allocation",
        resourceId: "bulk",
        metadata: { counts: { created, updated } },
      },
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts gifts.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/gifts.service.ts apps/backend/src/services/gifts.service.test.ts
git commit -m "feat(audit): emit single summary row for bulk gift-allocation upsert"
```

---

### Task 8: Wrap member profile CRUD in `audited()`

**Files:**

- Modify: `apps/backend/src/services/member.service.ts` (or wherever `memberProfile` CRUD lives — check via Grep)
- Modify: `apps/backend/src/routes/households.ts`
- Modify: `apps/backend/src/services/member.service.test.ts`

Follow the exact same pattern as Task 6:

- Add required `ctx: ActorCtx` to `createProfile`, `updateProfile`, `deleteProfile`.
- Wrap each in `audited()` with `AuditAction.CREATE_MEMBER_PROFILE` / `UPDATE_MEMBER_PROFILE` / `DELETE_MEMBER_PROFILE` and `resource: "member-profile"`.
- Update the route handlers in `households.ts` to pass `actorCtx(request)`.
- Add tests asserting the audit rows for each operation.

Commit message:

```bash
git commit -m "feat(audit): wrap member-profile CRUD in audited()"
```

---

### Task 9: Planner year-budget upsert — single summary row

**Files:**

- Modify: `apps/backend/src/services/planner.service.ts`
- Modify: `apps/backend/src/services/planner.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("emits one UPSERT_YEAR_BUDGET row per year with counts", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  await plannerService.upsertYearBudget(householdId, { year: 2026, allocations: [
    { goalId: "g1", amount: 100 },
    { goalId: "g2", amount: 200 },
  ] }, ctx);
  const rows = await prisma.auditLog.findMany({
    where: { householdId, action: "UPSERT_YEAR_BUDGET" },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].resourceId).toBe("2026");
  expect(rows[0].metadata).toMatchObject({ counts: { created: 2, updated: 0 } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts planner.service`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Same structure as Task 7: compute counts from pre-existing rows, do the upserts, write one `AuditLog` row with `action: AuditAction.UPSERT_YEAR_BUDGET`, `resource: "year-budget"`, `resourceId: String(year)`, `metadata: { counts: { created, updated } }` — all within the same transaction.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts planner.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/planner.service.ts apps/backend/src/services/planner.service.test.ts
git commit -m "feat(audit): emit single summary row for planner year-budget upsert"
```

---

### Task 10: Household rename + household-level mutations

**Files:**

- Modify: `apps/backend/src/services/household.service.ts`
- Modify: `apps/backend/src/routes/households.ts`
- Modify: `apps/backend/src/services/household.service.test.ts`

Wrap the following in `audited()` (required `ctx`):

- Household rename → `AuditAction.UPDATE_HOUSEHOLD`, `resource: "household"`, `resourceId: householdId`
- Invite cancellation → `AuditAction.CANCEL_INVITE`, `resource: "household-invite"`, `resourceId: inviteId`
- Leave household → `AuditAction.LEAVE_HOUSEHOLD`, `resource: "household-member"`, `resourceId: membershipId` (the actor's own membership row; the row is deleted so `beforeFetch` returns the membership snapshot)
- Invite acceptance → `AuditAction.ACCEPT_INVITE`, `resource: "household-invite"`, `resourceId: inviteId`

Add one test per action asserting the `action` and `resourceId` of the written row.

Commit:

```bash
git commit -m "feat(audit): wrap household rename, invite cancel/accept, and leave-household in audited()"
```

---

### Task 11: Household deletion — single `DELETE_HOUSEHOLD` summary row with cascaded counts

**Files:**

- Modify: `apps/backend/src/services/household.service.ts`
- Modify: `apps/backend/src/services/household.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("writes exactly one DELETE_HOUSEHOLD row with cascaded counts", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  // Seed a couple of children so cascaded counts are non-zero
  await prisma.member.create({ data: { householdId, userId: "u2", role: "member" } });
  await prisma.wealthAccount.create({ data: { householdId, name: "ISA", currentValue: 1000 } });

  await householdService.delete(householdId, ctx);

  const rows = await prisma.auditLog.findMany({ where: { action: "DELETE_HOUSEHOLD" } });
  expect(rows).toHaveLength(1);
  expect(rows[0].resourceId).toBe(householdId);
  expect(rows[0].metadata).toMatchObject({
    cascaded: expect.objectContaining({ members: expect.any(Number), assets: expect.any(Number) }),
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts household.service`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```typescript
async delete(householdId: string, ctx: ActorCtx) {
  return prisma.$transaction(async (tx) => {
    const [members, assets, liabilities, income, committed, discretionary, snapshots, goals] =
      await Promise.all([
        tx.member.count({ where: { householdId } }),
        tx.wealthAccount.count({ where: { householdId } }),
        tx.liability.count({ where: { householdId } }),
        tx.incomeSource.count({ where: { householdId } }),
        tx.committedItem.count({ where: { householdId } }),
        tx.discretionaryItem.count({ where: { householdId } }),
        tx.snapshot.count({ where: { householdId } }),
        tx.plannerGoal.count({ where: { householdId } }),
      ]);

    await tx.auditLog.create({
      data: {
        householdId: ctx.householdId,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        action: AuditAction.DELETE_HOUSEHOLD,
        resource: "household",
        resourceId: householdId,
        metadata: {
          cascaded: { members, assets, liabilities, income, committed, discretionary, snapshots, goals },
        },
      },
    });

    await tx.household.delete({ where: { id: householdId } }); // cascades via Prisma relations
  });
}
```

Relax the FK constraint choice if needed — this assumes `onDelete: Cascade` relations or an explicit delete-all pre-step; adapt to the actual schema.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts household.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/household.service.ts apps/backend/src/services/household.service.test.ts
git commit -m "feat(audit): emit single DELETE_HOUSEHOLD summary row with cascaded counts"
```

---

### Task 12: Data export + import audit entries

**Files:**

- Modify: `apps/backend/src/services/export.service.ts`
- Modify: `apps/backend/src/services/import.service.ts`
- Modify: `apps/backend/src/services/export.service.test.ts`
- Modify: `apps/backend/src/services/import.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// export.service.test.ts
it("writes EXPORT_DATA audit row", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  await exportService.exportHousehold(householdId, ctx);
  const row = await prisma.auditLog.findFirst({
    where: { householdId, action: "EXPORT_DATA" },
  });
  expect(row).not.toBeNull();
});

// import.service.test.ts
it("writes one IMPORT_DATA summary row with counts", async () => {
  const { householdId, ctx } = await seedHouseholdWithCtx(prisma);
  await importService.importHousehold(householdId, buildFixture(), ctx);
  const rows = await prisma.auditLog.findMany({
    where: { householdId, action: "IMPORT_DATA" },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].metadata).toMatchObject({ counts: expect.any(Object) });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts export.service`
Run: `cd apps/backend && bun scripts/run-tests.ts import.service`
Expected: FAIL for both.

- [ ] **Step 3: Write minimal implementation**

- Export: after the read completes, write one `AuditLog` row with `action: AuditAction.EXPORT_DATA`, `resource: "household"`, `resourceId: householdId`, `metadata: { counts: <per-entity counts from the export bundle> }`. The export is read-only, so it does **not** need a transaction — a fire-and-forget write is acceptable but prefer consistency with the rest of the feature: wrap in a 1-statement transaction.
- Import: inside the existing import transaction (which already wraps all creates), add a single `AuditLog` row at the end with `action: AuditAction.IMPORT_DATA`, `resource: "household"`, `resourceId: householdId`, `metadata: { counts: { incomeSources: N, committedItems: N, … } }`. Never emit per-child audit rows.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/export.service.ts apps/backend/src/services/import.service.ts apps/backend/src/services/export.service.test.ts apps/backend/src/services/import.service.test.ts
git commit -m "feat(audit): add summary audit rows for data export and import"
```

---

### Task 13: Profile name change (`PATCH /api/auth/me`)

**Files:**

- Modify: `apps/backend/src/routes/auth.routes.ts`
- Modify: `apps/backend/src/routes/auth.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("PATCH /api/auth/me writes UPDATE_PROFILE audit row with old/new name metadata", async () => {
  const { token, user } = await registerAndLogin(app, { name: "Old" });
  await app.inject({
    method: "PATCH",
    url: "/api/auth/me",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "New" },
  });
  const row = await prisma.auditLog.findFirst({
    where: { userId: user.id, action: "UPDATE_PROFILE" },
  });
  expect(row).not.toBeNull();
  expect(row!.metadata).toMatchObject({ before: { name: "Old" }, after: { name: "New" } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts auth.routes`
Expected: FAIL — `PATCH /me` currently writes no audit row.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/routes/auth.routes.ts` (the `PATCH /me` handler) to load the current name before the update, perform the update, then write:

```typescript
fastify.patch('/me', { preHandler: authMiddleware }, async (request, reply) => {
  const userId = request.user!.userId;
  const body = updateProfileSchema.parse(request.body);
  const before = await authService.getUser(userId); // returns { name }
  const user = await authService.updateUserName(userId, body.name);

  auditService.log({
    userId,
    action: AuditAction.UPDATE_PROFILE,
    resource: "user",
    resourceId: userId,
    metadata: { before: { name: before.name }, after: { name: user.name } },
    ...requestContext(request),
  });

  return reply.status(200).send({ user });
});
```

This event has no household, so it stays on the existing fire-and-forget `auditService.log` path (matching the rest of the auth events) rather than `audited()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts auth.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/auth.routes.ts apps/backend/src/routes/auth.routes.test.ts
git commit -m "feat(audit): log UPDATE_PROFILE on PATCH /api/auth/me with before/after names"
```

---

### Task 14: Flip `actorCtx` from optional to required across mutating services

**Files:**

- Modify: `apps/backend/src/services/audit.service.ts` (type only — `ActorCtx` already required by `audited()`; nothing to change)
- Modify: every service function whose signature is `ctx?: ActorCtx` → `ctx: ActorCtx`
  - `waterfall.service.ts` (all create/update/delete methods)
  - `settings.service.ts` (`updateSettings`)
  - `review-session.service.ts` (`createOrResetSession`, `updateSession`)
  - `setup-session.service.ts` (`createOrResetSession`, `updateSession`)
  - `planner.service.ts` (`createPurchase`, `updatePurchase`, `deletePurchase`)
  - `household.service.ts` (members, roles, settings — any still-optional ctx)
  - `gifts.service.ts` (after Tasks 6 & 7, every mutation already takes ctx required)

- [ ] **Step 1: Write the failing test (compile-time)**

Write a tiny runtime assertion to pair with the compiler check:

```typescript
// apps/backend/src/services/actor-ctx-required.test.ts
import { describe, it, expect } from "bun:test";
import { waterfallService } from "./waterfall.service";

describe("actorCtx is a required parameter", () => {
  it("calling createIncome without ctx is a compile error", () => {
    // @ts-expect-error — missing ctx argument must be a compile error
    const thunk = () => waterfallService.createIncome("hh", { name: "x", amount: 1, frequency: "monthly" });
    expect(typeof thunk).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun run type-check`
Expected: FAIL — `@ts-expect-error` triggers because today `ctx` is optional (`@ts-expect-error` with no actual error is itself a type error). Once ctx is required, the error is real and the directive is satisfied.

- [ ] **Step 3: Write minimal implementation**

In every service listed above, change `ctx?: ActorCtx` → `ctx: ActorCtx`. Remove any `if (ctx)` / `ctx && ctx.*` guards since ctx is now always present.

Update every call site that omits ctx (routes, tests, other services). `actorCtx(req)` is already the standard way in routes.

For test helpers (e.g. `createTestHousehold`), pass a minimal `ctx` explicitly.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun run type-check`
Run: `cd apps/backend && bun scripts/run-tests.ts`
Expected: type-check clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/ apps/backend/src/routes/
git commit -m "refactor(audit): make actorCtx a required parameter on mutating services"
```

---

### Task 15: Retention service — `purgeOldAuditLogs`

**Files:**

- Create: `apps/backend/src/services/retention.service.ts`
- Create: `apps/backend/src/services/retention.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/retention.service.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { prisma } from "../config/database";
import { purgeOldAuditLogs, RETENTION_DAYS } from "./retention.service";

describe("purgeOldAuditLogs", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  it("deletes rows older than RETENTION_DAYS and returns the count", async () => {
    const ancient = new Date(Date.now() - (RETENTION_DAYS + 1) * 86400_000);
    const recent = new Date(Date.now() - 1 * 86400_000);

    await prisma.auditLog.createMany({
      data: [
        { action: "OLD_1", createdAt: ancient },
        { action: "OLD_2", createdAt: ancient },
        { action: "NEW", createdAt: recent },
      ],
    });

    const deleted = await purgeOldAuditLogs(prisma);
    expect(deleted).toBe(2);
    const remaining = await prisma.auditLog.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.action).toBe("NEW");
  });

  it("does not write an audit row for its own activity", async () => {
    await purgeOldAuditLogs(prisma);
    const rows = await prisma.auditLog.findMany();
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts retention.service`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/services/retention.service.ts
import type { PrismaClient } from "@prisma/client";

export const RETENTION_DAYS = 180;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BOOT_DELAY_MS = 60 * 1000;

export async function purgeOldAuditLogs(db: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * ONE_DAY_MS);
  const { count } = await db.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

let started = false;
export function startRetentionJob(db: PrismaClient): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    purgeOldAuditLogs(db).catch((err) => console.error("purgeOldAuditLogs boot run failed:", err));
  }, BOOT_DELAY_MS).unref();
  setInterval(() => {
    purgeOldAuditLogs(db).catch((err) => console.error("purgeOldAuditLogs interval failed:", err));
  }, CLEANUP_INTERVAL_MS).unref();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts retention.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/retention.service.ts apps/backend/src/services/retention.service.test.ts
git commit -m "feat(audit): add retention.service purgeOldAuditLogs with 180-day window"
```

---

### Task 16: Wire retention job into app boot

**Files:**

- Modify: `apps/backend/src/app.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/app.test.ts (or extend the existing one)
import { describe, it, expect } from "bun:test";
import { buildApp } from "./app";
import * as retention from "./services/retention.service";

describe("buildApp retention wiring", () => {
  it("starts the retention job exactly once", async () => {
    let calls = 0;
    const spy = retention.startRetentionJob;
    (retention as any).startRetentionJob = () => { calls++; };
    try {
      await buildApp({ logger: false });
      await buildApp({ logger: false });
      expect(calls).toBeGreaterThanOrEqual(1);
    } finally {
      (retention as any).startRetentionJob = spy;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts app`
Expected: FAIL — `buildApp` doesn't call `startRetentionJob`.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/backend/src/app.ts`:

```typescript
import { startRetentionJob } from "./services/retention.service";
import { prisma } from "./config/database";

export async function buildApp(opts?: { logger?: boolean | object }): Promise<FastifyInstance> {
  // … existing construction
  startRetentionJob(prisma);
  return server;
}
```

The `started` flag inside `retention.service.ts` ensures idempotency across repeated `buildApp` calls in tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts app`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/app.ts apps/backend/src/app.test.ts
git commit -m "feat(audit): start retention job on app boot"
```

---

### Task 17: Security activity query service

**Files:**

- Create: `apps/backend/src/services/security-activity.service.ts`
- Create: `apps/backend/src/services/security-activity.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/security-activity.service.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { prisma } from "../config/database";
import { querySecurityActivity } from "./security-activity.service";

describe("querySecurityActivity", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  it("returns only the caller's events with householdId null", async () => {
    await prisma.auditLog.createMany({
      data: [
        { userId: "u1", action: "LOGIN_SUCCESS" },
        { userId: "u1", action: "LOGOUT" },
        { userId: "u2", action: "LOGIN_SUCCESS" }, // different user — excluded
        { userId: "u1", householdId: "hh1", action: "CREATE_INCOME_SOURCE" }, // household-scoped — excluded
      ],
    });
    const res = await querySecurityActivity(prisma, { userId: "u1", limit: 50 });
    expect(res.entries).toHaveLength(2);
    expect(res.entries.every((e) => e.action !== "CREATE_INCOME_SOURCE")).toBe(true);
  });

  it("excludes TOKEN_REFRESH events", async () => {
    await prisma.auditLog.createMany({
      data: [
        { userId: "u1", action: "LOGIN_SUCCESS" },
        { userId: "u1", action: "TOKEN_REFRESH" },
        { userId: "u1", action: "TOKEN_REFRESH" },
      ],
    });
    const res = await querySecurityActivity(prisma, { userId: "u1", limit: 50 });
    expect(res.entries.map((e) => e.action)).toEqual(["LOGIN_SUCCESS"]);
  });

  it("never returns ipAddress or userAgent", async () => {
    await prisma.auditLog.create({
      data: { userId: "u1", action: "LOGIN_SUCCESS", ipAddress: "1.2.3.4", userAgent: "x" },
    });
    const res = await querySecurityActivity(prisma, { userId: "u1", limit: 50 });
    expect((res.entries[0] as any).ipAddress).toBeUndefined();
    expect((res.entries[0] as any).userAgent).toBeUndefined();
  });

  it("paginates newest-first with a cursor", async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.auditLog.create({ data: { userId: "u1", action: `EVT_${i}` } });
    }
    const page1 = await querySecurityActivity(prisma, { userId: "u1", limit: 2 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await querySecurityActivity(prisma, {
      userId: "u1",
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.entries).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts security-activity.service`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/services/security-activity.service.ts
import type { PrismaClient } from "@prisma/client";
import type { SecurityActivityQuery, SecurityActivityResponse } from "@finplan/shared";
import { AuditAction } from "@finplan/shared";

type QueryParams = SecurityActivityQuery & { userId: string };

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") return null;
    return parsed as { createdAt: string; id: string };
  } catch {
    return null;
  }
}

export async function querySecurityActivity(
  db: PrismaClient,
  params: QueryParams
): Promise<SecurityActivityResponse> {
  const { userId, cursor, limit } = params;

  const where: Record<string, unknown> = {
    userId,
    householdId: null,
    action: { not: AuditAction.TOKEN_REFRESH },
  };

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) throw Object.assign(new Error("Invalid cursor"), { statusCode: 400 });
    Object.assign(where, {
      OR: [
        { createdAt: { lt: new Date(decoded.createdAt) } },
        { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
      ],
    });
  }

  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      action: true,
      createdAt: true,
      metadata: true,
    },
  });

  const hasNext = rows.length > limit;
  const entries = rows.slice(0, limit).map((e) => ({
    id: e.id,
    action: e.action ?? "",
    createdAt: e.createdAt.toISOString(),
    metadata: e.metadata ?? null,
  }));
  const last = entries[entries.length - 1];
  const lastRow = rows[entries.length - 1];
  const nextCursor = hasNext && last && lastRow ? encodeCursor(lastRow.createdAt, lastRow.id) : null;

  return { entries, nextCursor };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts security-activity.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/security-activity.service.ts apps/backend/src/services/security-activity.service.test.ts
git commit -m "feat(audit): add querySecurityActivity service"
```

---

### Task 18: Security activity route (`GET /api/security-activity`)

**Files:**

- Create: `apps/backend/src/routes/security-activity.routes.ts`
- Create: `apps/backend/src/routes/security-activity.routes.test.ts`
- Modify: `apps/backend/src/app.ts` (register)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/security-activity.routes.test.ts
import { describe, it, expect } from "bun:test";
import { buildApp } from "../app";
import { prisma } from "../config/database";
import { registerAndLogin } from "../test/auth-helpers";

describe("GET /api/security-activity", () => {
  it("returns 401 without auth", async () => {
    const app = await buildApp({ logger: false });
    const res = await app.inject({ method: "GET", url: "/api/security-activity" });
    expect(res.statusCode).toBe(401);
  });

  it("returns only the caller's own events, newest-first", async () => {
    const app = await buildApp({ logger: false });
    const { token, user } = await registerAndLogin(app);
    // A second user exists and has events — we must not see them
    const other = await registerAndLogin(app, { email: "o@x.com" });
    await prisma.auditLog.createMany({
      data: [
        { userId: user.id, action: "LOGIN_SUCCESS", createdAt: new Date(Date.now() - 1000) },
        { userId: other.user.id, action: "LOGIN_SUCCESS" },
      ],
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/security-activity",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { entries: Array<{ action: string }> };
    expect(body.entries.every((e) => e.action !== undefined)).toBe(true);
    // Should include the caller's LOGIN_SUCCESS from registration + the seeded row
    expect(body.entries.some((e) => e.action === "LOGIN_SUCCESS")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts security-activity.routes`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/routes/security-activity.routes.ts
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware";
import { prisma } from "../config/database";
import { querySecurityActivity } from "../services/security-activity.service";
import { SecurityActivityQuerySchema } from "@finplan/shared";

export async function securityActivityRoutes(app: FastifyInstance) {
  app.get(
    "/security-activity",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const query = SecurityActivityQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ error: query.error.flatten() });
      }
      const result = await querySecurityActivity(prisma, { userId, ...query.data });
      return reply.send(result);
    }
  );
}
```

Register in `app.ts`:

```typescript
import { securityActivityRoutes } from "./routes/security-activity.routes";
// …
server.register(securityActivityRoutes, { prefix: "/api" });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts security-activity.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/security-activity.routes.ts apps/backend/src/routes/security-activity.routes.test.ts apps/backend/src/app.ts
git commit -m "feat(audit): add GET /api/security-activity endpoint"
```

---

### Task 19: Frontend — security-activity service + hook

**Files:**

- Create: `apps/frontend/src/services/securityActivity.service.ts`
- Modify: `apps/frontend/src/hooks/useSettings.ts`
- Create: `apps/frontend/src/hooks/useSecurityActivity.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/hooks/useSecurityActivity.test.tsx
import { describe, it, expect } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { useSecurityActivity } from "./useSettings";
import { createQueryWrapper } from "@/test/utils";
import { server } from "@/test/msw";
import { rest } from "msw";

describe("useSecurityActivity", () => {
  it("fetches from /api/security-activity and paginates", async () => {
    server.use(
      rest.get("/api/security-activity", (req, res, ctx) => {
        return res(ctx.json({
          entries: [
            { id: "1", action: "LOGIN_SUCCESS", createdAt: new Date().toISOString(), metadata: null },
          ],
          nextCursor: null,
        }));
      })
    );
    const { result } = renderHook(() => useSecurityActivity(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.pages[0].entries[0].action).toBe("LOGIN_SUCCESS");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useSecurityActivity`
Expected: FAIL — hook doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/services/securityActivity.service.ts
import { apiClient } from "@/lib/api";
import type { SecurityActivityResponse } from "@finplan/shared";

export async function fetchSecurityActivity(params: {
  cursor?: string;
  limit?: number;
}): Promise<SecurityActivityResponse> {
  const q = new URLSearchParams();
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiClient.get<SecurityActivityResponse>(`/api/security-activity${qs ? `?${qs}` : ""}`);
}
```

Add to `useSettings.ts`:

```typescript
import { fetchSecurityActivity } from "@/services/securityActivity.service";

export function useSecurityActivity() {
  return useInfiniteQuery({
    queryKey: ["security-activity"],
    queryFn: ({ pageParam }) =>
      fetchSecurityActivity({ cursor: pageParam as string | undefined, limit: 50 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useSecurityActivity`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/securityActivity.service.ts apps/frontend/src/hooks/useSettings.ts apps/frontend/src/hooks/useSecurityActivity.test.tsx
git commit -m "feat(audit): add useSecurityActivity hook + fetchSecurityActivity service"
```

---

### Task 20: Frontend — `SecurityActivitySection` component

**Files:**

- Create: `apps/frontend/src/components/settings/SecurityActivitySection.tsx`
- Create: `apps/frontend/src/components/settings/SecurityActivityTable.tsx`
- Create: `apps/frontend/src/components/settings/SecurityActivitySection.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { SecurityActivitySection } from "./SecurityActivitySection";
import { createQueryWrapper } from "@/test/utils";
import { server } from "@/test/msw";
import { rest } from "msw";

it("renders events with the correct detail copy", async () => {
  server.use(
    rest.get("/api/security-activity", (_, res, ctx) =>
      res(ctx.json({
        entries: [
          { id: "1", action: "LOGIN_SUCCESS", createdAt: new Date().toISOString(), metadata: null },
          { id: "2", action: "LOGIN_FAILED", createdAt: new Date().toISOString(), metadata: { email: "should-not-leak@x.com" } },
          { id: "3", action: "UPDATE_PROFILE", createdAt: new Date().toISOString(), metadata: { before: { name: "Old" }, after: { name: "New" } } },
        ],
        nextCursor: null,
      }))
    )
  );
  render(<SecurityActivitySection />, { wrapper: createQueryWrapper() });
  expect(await screen.findByText("Signed in")).toBeInTheDocument();
  expect(screen.getByText("Sign-in attempt failed")).toBeInTheDocument();
  expect(screen.queryByText(/should-not-leak/)).not.toBeInTheDocument();
  expect(screen.getByText("Name changed from Old to New")).toBeInTheDocument();
  expect(screen.getByText(/Entries older than 180 days/)).toBeInTheDocument();
});

it("shows loading then empty state when no entries", async () => {
  server.use(
    rest.get("/api/security-activity", (_, res, ctx) =>
      res(ctx.json({ entries: [], nextCursor: null }))
    )
  );
  render(<SecurityActivitySection />, { wrapper: createQueryWrapper() });
  expect(await screen.findByText("No recent activity")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SecurityActivitySection`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/settings/SecurityActivitySection.tsx
import { useSecurityActivity } from "@/hooks/useSettings";
import { SettingsSection } from "./SettingsSection";
import { SecurityActivityTable } from "./SecurityActivityTable";
import { Button } from "@/components/ui/button";

export function SecurityActivitySection() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSecurityActivity();
  const entries = data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <SettingsSection
      id="security-activity"
      title="Security activity"
      description="Sign-ins, sign-outs, and session activity on your account."
    >
      {isError ? (
        <p className="text-sm text-muted-foreground">Unable to load activity</p>
      ) : (
        <SecurityActivityTable entries={entries} loading={isLoading} />
      )}
      {hasNextPage && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-page-accent hover:text-page-accent/80"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load older entries"}
          </Button>
        </div>
      )}
      <p className="pt-3 text-xs text-muted-foreground">
        Entries older than 180 days are automatically removed.
      </p>
    </SettingsSection>
  );
}
```

```tsx
// apps/frontend/src/components/settings/SecurityActivityTable.tsx
import { formatDistanceToNow } from "date-fns";
import type { SecurityActivityEntry } from "@finplan/shared";

const ACTION_COPY: Record<string, string> = {
  REGISTER: "Account created",
  LOGIN_SUCCESS: "Signed in",
  LOGIN_FAILED: "Sign-in attempt failed",
  LOGOUT: "Signed out",
  SESSION_REVOKED: "Session revoked",
  ALL_SESSIONS_REVOKED: "All sessions revoked",
};

function detailFor(entry: SecurityActivityEntry): string {
  if (entry.action === "UPDATE_PROFILE") {
    const m = entry.metadata as { before?: { name?: string }; after?: { name?: string } } | null;
    const before = m?.before?.name ?? "";
    const after = m?.after?.name ?? "";
    return `Name changed from ${before} to ${after}`;
  }
  // LOGIN_FAILED deliberately ignores metadata — no email is ever shown
  return ACTION_COPY[entry.action] ?? entry.action;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/40">
      {[1, 2, 3].map((i) => (
        <td key={i} className="px-3 py-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted/30" />
        </td>
      ))}
    </tr>
  );
}

export function SecurityActivityTable({
  entries,
  loading,
}: {
  entries: SecurityActivityEntry[];
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">When</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Action</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Details</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">
                No recent activity
              </td>
            </tr>
          ) : (
            entries.map((e) => (
              <tr key={e.id} className="border-b border-border/40 hover:bg-muted/5">
                <td className="px-3 py-2 font-numeric text-xs text-muted-foreground whitespace-nowrap">
                  <span title={e.createdAt}>
                    {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{e.action}</td>
                <td className="px-3 py-2 text-xs">{detailFor(e)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SecurityActivitySection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SecurityActivitySection.tsx apps/frontend/src/components/settings/SecurityActivityTable.tsx apps/frontend/src/components/settings/SecurityActivitySection.test.tsx
git commit -m "feat(audit): add SecurityActivitySection and SecurityActivityTable"
```

---

### Task 21: Mount Security activity in `/settings/profile`

**Files:**

- Modify: `apps/frontend/src/pages/ProfileSettingsPage.tsx`
- Modify: `apps/frontend/src/pages/ProfileSettingsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("renders a Security activity section and left-nav entry", async () => {
  render(<ProfileSettingsPage />, { wrapper: createQueryWrapper() });
  expect(await screen.findByText("Security activity")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ProfileSettingsPage`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/pages/ProfileSettingsPage.tsx
import { SecurityActivitySection } from "@/components/settings/SecurityActivitySection";
// …
const ITEMS: SettingsNavItem[] = [
  { id: "account", label: "Account" },
  { id: "display", label: "Display" },
  { id: "security-activity", label: "Security activity" },
];
// …
<SettingsRightPanel /* … */>
  <ProfileSection />
  <DisplaySection />
  <SecurityActivitySection />
</SettingsRightPanel>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ProfileSettingsPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/ProfileSettingsPage.tsx apps/frontend/src/pages/ProfileSettingsPage.test.tsx
git commit -m "feat(audit): mount Security activity section in Profile settings"
```

---

### Task 22: Retention footer note on household audit log

**Files:**

- Modify: `apps/frontend/src/components/settings/AuditLogSection.tsx`
- Modify: `apps/frontend/src/components/settings/AuditLogSection.test.tsx` (create if missing)

- [ ] **Step 1: Write the failing test**

```tsx
it("renders the 180-day retention notice", async () => {
  render(<AuditLogSection />, { wrapper: createQueryWrapper() });
  expect(await screen.findByText(/Entries older than 180 days/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test AuditLogSection`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to the bottom of the returned `<SettingsSection>` in `AuditLogSection.tsx`:

```tsx
<p className="pt-3 text-xs text-muted-foreground">
  Entries older than 180 days are automatically removed.
</p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test AuditLogSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/AuditLogSection.tsx apps/frontend/src/components/settings/AuditLogSection.test.tsx
git commit -m "feat(audit): add 180-day retention notice to household audit log"
```

---

## Testing

### Backend Tests

- [ ] Service: `computeDiff` descends `stalenessThresholds` into per-key changes; non-allowlisted JSON stays opaque
- [ ] Service: every newly-wrapped mutation writes exactly one audit row (or one summary row for bulk/cascade)
- [ ] Service: `DELETE_HOUSEHOLD` row includes `metadata.cascaded` with per-entity counts
- [ ] Service: `querySecurityActivity` filters by `userId`, `householdId IS NULL`, excludes `TOKEN_REFRESH`, paginates newest-first, and never returns `ipAddress` / `userAgent`
- [ ] Service: `purgeOldAuditLogs` deletes rows older than 180 days and doesn't emit its own audit row
- [ ] Endpoint: `GET /api/security-activity` → 401 without JWT; 200 with caller-scoped entries only
- [ ] Endpoint: `GET /api/audit-log` unchanged — owner/admin only, household-scoped, no `ipAddress`/`userAgent` in response
- [ ] Taxonomy: drift tests (`audit-taxonomy.test.ts`) fail when a new literal action or slug is introduced outside the shared const

### Frontend Tests

- [ ] Component: `SecurityActivityTable` renders detail copy from the fixed action → copy map
- [ ] Component: `SecurityActivityTable` never renders email for `LOGIN_FAILED` even if metadata contains one
- [ ] Component: `AuditLogSection` and `SecurityActivitySection` both show the 180-day footer note
- [ ] Page: `/settings/profile` mounts `SecurityActivitySection` in its nav + right panel
- [ ] Hook: `useSecurityActivity` paginates via `nextCursor`

### Key Scenarios

- [ ] Happy path: user registers, logs in, edits profile name, logs out; then opens `/settings/profile` → sees "Account created", "Signed in", "Name changed from X to Y", "Signed out" in order
- [ ] Household mutation sweep: owner creates snapshot, renames household, bulk-imports data, cancels invite, deletes household → the household audit log shows exactly one entry per operation (not one per child for bulk / cascade)
- [ ] Privacy: `LOGIN_FAILED` entry displays "Sign-in attempt failed" and the DOM contains no email
- [ ] Retention: rows with `createdAt` older than 180 days disappear after the purge job runs (force via a manual `purgeOldAuditLogs(prisma)` call in a dev shell)

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — clean, and the `@ts-expect-error` directives for required `ctx` are each matched by a real error
- [ ] `cd apps/backend && bun scripts/run-tests.ts` — all pass (especially `audit-taxonomy`, `retention.service`, `security-activity.*`, every touched service's test file)
- [ ] `cd apps/frontend && bun test` — all pass (`SecurityActivitySection`, `useSecurityActivity`, `AuditLogSection`, `ProfileSettingsPage`)
- [ ] Manual: log in, visit `/settings/profile` → Security activity shows recent events; visit `/settings/household` → Audit log still works, both show the 180-day notice
- [ ] Manual: perform a household rename, snapshot create/delete, invite cancel, and a data import; all appear in the household audit log with the expected shape

## Post-conditions

- [ ] Users have visibility into their own auth activity for the first time
- [ ] Every household mutation produces exactly one audit entry; bulk / cascade operations no longer flood the log
- [ ] `actorCtx` is compiler-enforced on every mutating service — forgetting it is now a build error
- [ ] `AuditAction` and the extended `ResourceSlugEnum` are the single source of truth; drift tests guard against regression
- [ ] Retention is automatic, in-process, and self-disclosing in both UI surfaces
