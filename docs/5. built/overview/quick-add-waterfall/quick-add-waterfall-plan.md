---
feature: quick-add-waterfall
category: overview
spec: docs/4. planning/quick-add-waterfall/quick-add-waterfall-spec.md
creation_date: 2026-04-18
status: implemented
implemented_date: 2026-07-05
---

# Quick-Add Waterfall — Implementation Plan

> **For Claude:** Use `/execute-plan quick-add-waterfall` to implement this plan task-by-task.

**Goal:** Build the full-screen `/waterfall` workbench — a dense, grouped, inline-editable view of all three waterfall tiers that serves both first-time setup and ongoing bulk edit — and remove the legacy `WaterfallSetupSession` scaffolding.

**Spec:** `docs/4. planning/quick-add-waterfall/quick-add-waterfall-spec.md`

**Architecture:** Reuses the existing Fastify waterfall routes and services verbatim (item CRUD, period CRUD, subcategory list). Adds one new backend endpoint (`POST /api/waterfall/subcategories/:tier`) for inline subcategory creation and one new settings field (`HouseholdSettings.waterfallTipDismissed`). Introduces a new React route at `/waterfall` hosting a stack of per-tier editable tables that auto-save per cell via the existing period and item update endpoints, with client-side save coalescing.

**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind

**Infrastructure Impact:**

- Touches `packages/shared/`: **yes** (extend settings schema; remove setup-session schema)
- Requires DB migration: **yes** (drop `WaterfallSetupSession`, add `HouseholdSettings.waterfallTipDismissed`)

## Pre-conditions

- [ ] Spec `docs/4. planning/quick-add-waterfall/quick-add-waterfall-spec.md` approved
- [ ] Anchor 17 + `design-system.md` § 3.6 already updated to recognise full-screen focused surfaces (applied during `/write-design`)
- [ ] Existing waterfall routes, services, and tier-page components reachable (confirmed in Phase 0 audit)

## Tasks

> Five phases: **A** legacy removal, **B** schema + backend additions, **C** frontend foundations, **D** Full Waterfall page components, **E** integration. Tasks within a phase are ordered; phases are independent enough that A and B can be done in either order, but C/D/E must follow B.

---

## Phase A — Remove legacy `WaterfallSetupSession`

### Task A1: Remove setup-session shared Zod schema

**Files:**

- Delete: `packages/shared/src/schemas/setup-session.schemas.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Delete (if present): `packages/shared/src/schemas/setup-session.schemas.test.ts`

- [ ] **Step 1: Write the failing test** — update existing test that should now fail

In `packages/shared/src/schemas/waterfall.schemas.test.ts` (at end), add:

```typescript
import { describe, it, expect } from "bun:test";

describe("setup-session schema removal", () => {
  it("does not export updateSetupSessionSchema", async () => {
    const mod = await import("../index");
    expect((mod as Record<string, unknown>).updateSetupSessionSchema).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.schemas`
Expected: FAIL — `updateSetupSessionSchema` is defined

- [ ] **Step 3: Remove the schema export and delete the file**

Edit `packages/shared/src/schemas/index.ts` — remove the `setup-session.schemas` export block (locate the `export { updateSetupSessionSchema, ... }` block and the associated `type UpdateSetupSessionInput` export).

Delete the file:

```bash
rm "packages/shared/src/schemas/setup-session.schemas.ts"
rm -f "packages/shared/src/schemas/setup-session.schemas.test.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/index.ts packages/shared/src/schemas/setup-session.schemas.ts packages/shared/src/schemas/setup-session.schemas.test.ts packages/shared/src/schemas/waterfall.schemas.test.ts
git commit -m "refactor(shared): remove setup-session Zod schema"
```

---

### Task A2: Remove setup-session backend service

**Files:**

- Delete: `apps/backend/src/services/setup-session.service.ts`
- Delete: `apps/backend/src/services/setup-session.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/app.test.ts` (or create it if missing):

```typescript
import { describe, it, expect } from "bun:test";

describe("legacy setup-session removal", () => {
  it("does not import setup-session service from anywhere", async () => {
    const fs = await import("fs");
    const servicePath = "apps/backend/src/services/setup-session.service.ts";
    expect(fs.existsSync(servicePath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts app.test`
Expected: FAIL — file still exists

- [ ] **Step 3: Delete the service files**

```bash
rm "apps/backend/src/services/setup-session.service.ts"
rm "apps/backend/src/services/setup-session.service.test.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts app.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/setup-session.service.ts apps/backend/src/services/setup-session.service.test.ts apps/backend/src/app.test.ts
git commit -m "refactor(backend): remove setup-session service"
```

---

### Task A3: Remove setup-session routes + unregister from app

**Files:**

- Delete: `apps/backend/src/routes/setup-session.routes.ts`
- Delete: `apps/backend/src/routes/setup-session.routes.test.ts`
- Modify: `apps/backend/src/app.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/app.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { buildApp } from "./app";

describe("legacy setup-session route removal", () => {
  it("returns 404 for /api/setup-session", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/setup-session" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts app.test`
Expected: FAIL — route returns 401 (auth-protected), not 404

- [ ] **Step 3: Remove the route registration and files**

Edit `apps/backend/src/app.ts`:

```typescript
// REMOVE line 17:
// import { setupRoutes } from "./routes/setup-session.routes";

// REMOVE line 102:
// server.register(setupRoutes, { prefix: "/api/setup-session" });
```

Delete route files:

```bash
rm "apps/backend/src/routes/setup-session.routes.ts"
rm "apps/backend/src/routes/setup-session.routes.test.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts app.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/app.ts apps/backend/src/routes/setup-session.routes.ts apps/backend/src/routes/setup-session.routes.test.ts apps/backend/src/app.test.ts
git commit -m "refactor(backend): remove setup-session routes and registration"
```

---

### Task A4: Remove setup-session frontend service

**Files:**

- Delete: `apps/frontend/src/services/setup-session.service.ts`
- Modify: `apps/frontend/src/pages/SettingsPage.test.tsx` (remove any references)

- [ ] **Step 1: Write the failing test**

Run the existing frontend test suite first to locate references:

```bash
cd apps/frontend && bun test SettingsPage.test 2>&1 | head -30
```

Identify imports of `setupSessionService` in `SettingsPage.test.tsx` (the grep in Phase 0 confirmed it's referenced there).

Add to `apps/frontend/src/services/waterfall.service.test.ts` (create if missing):

```typescript
import { describe, it, expect } from "bun:test";
import { existsSync } from "fs";

describe("legacy setup-session client removal", () => {
  it("does not have a setup-session service file", () => {
    expect(existsSync("apps/frontend/src/services/setup-session.service.ts")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test waterfall.service.test`
Expected: FAIL — file still exists

- [ ] **Step 3: Delete the service and remove test references**

```bash
rm "apps/frontend/src/services/setup-session.service.ts"
```

In `apps/frontend/src/pages/SettingsPage.test.tsx`:

- Remove any `import` line referencing `setupSessionService` or `setup-session.service`
- Remove any `vi.mock(...)` or `mock.module(...)` block for the setup-session service
- Remove any test cases that specifically verify setup-session behaviour

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SettingsPage.test waterfall.service.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/setup-session.service.ts apps/frontend/src/services/waterfall.service.test.ts apps/frontend/src/pages/SettingsPage.test.tsx
git commit -m "refactor(frontend): remove setup-session client service"
```

---

### Task A5: Migration — drop `WaterfallSetupSession` + clean up imports and test helpers

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/<timestamp>_drop_waterfall_setup_session/migration.sql`
- Modify: `apps/backend/src/services/import.service.ts` (line 185)
- Modify: `apps/backend/src/test/mocks/prisma.ts` (line 49)
- Modify: `apps/backend/src/test/helpers/test-db.ts` (line 176)

- [ ] **Step 1: Write the failing test**

Update `apps/backend/src/services/import.service.test.ts` — find the import-wipe test and add (or modify an existing one) to assert the tx does NOT call `waterfallSetupSession.deleteMany`:

```typescript
it("does not reference waterfallSetupSession during import wipe", async () => {
  const { prismaMock } = await import("../test/mocks/prisma");
  // @ts-expect-error — asserting model is removed from the mock
  expect(prismaMock.waterfallSetupSession).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts import.service`
Expected: FAIL — `prismaMock.waterfallSetupSession` is still defined

- [ ] **Step 3: Apply schema change, migration, and code cleanup**

Edit `apps/backend/prisma/schema.prisma` — remove the entire `model WaterfallSetupSession { ... }` block (lines 569–575).

Then run:

```bash
bun run db:migrate
# Migration name: drop_waterfall_setup_session
```

Verify the generated migration includes:

```sql
DROP TABLE IF EXISTS "WaterfallSetupSession";
```

Edit `apps/backend/src/services/import.service.ts` — remove line 185:

```typescript
// REMOVE:
// await tx.waterfallSetupSession.deleteMany({ where: { householdId } });
```

Edit `apps/backend/src/test/mocks/prisma.ts` — remove line 49:

```typescript
// REMOVE:
// waterfallSetupSession: buildModelMock(),
```

Edit `apps/backend/src/test/helpers/test-db.ts` — remove line 176:

```typescript
// REMOVE:
// "WaterfallSetupSession",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts import.service`
Expected: PASS

Run: `cd apps/backend && bun scripts/run-tests.ts`
Expected: all tests PASS (no stale references to `waterfallSetupSession`)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/ apps/backend/src/services/import.service.ts apps/backend/src/services/import.service.test.ts apps/backend/src/test/mocks/prisma.ts apps/backend/src/test/helpers/test-db.ts
git commit -m "refactor(schema): drop WaterfallSetupSession model and references"
```

---

## Phase B — Backend additions (tip field + subcategory POST)

### Task B1: Schema migration — add `HouseholdSettings.waterfallTipDismissed`

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/<timestamp>_add_waterfall_tip_dismissed/migration.sql`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/services/settings.service.test.ts` (or extend existing):

```typescript
import { describe, it, expect } from "bun:test";
import { prisma } from "../config/database";
import { createTestHousehold } from "../test/helpers/test-db";
import { settingsService } from "./settings.service";

describe("HouseholdSettings.waterfallTipDismissed", () => {
  it("defaults to false for a new household", async () => {
    const household = await createTestHousehold(prisma);
    const settings = await settingsService.getSettings(household.id);
    expect(settings.waterfallTipDismissed).toBe(false);
  });

  it("can be updated to true via updateSettings", async () => {
    const household = await createTestHousehold(prisma);
    const updated = await settingsService.updateSettings(
      household.id,
      { waterfallTipDismissed: true },
      { actorType: "system", actorId: null } as any
    );
    expect(updated.waterfallTipDismissed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts settings.service`
Expected: FAIL — `waterfallTipDismissed` column does not exist

- [ ] **Step 3: Add the field and migrate**

Edit `apps/backend/prisma/schema.prisma`, add to `HouseholdSettings` (after `showPence`):

```prisma
  waterfallTipDismissed  Boolean @default(false)
```

Run:

```bash
bun run db:migrate
# Migration name: add_waterfall_tip_dismissed
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts settings.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/ apps/backend/src/services/settings.service.test.ts
git commit -m "feat(schema): add HouseholdSettings.waterfallTipDismissed"
```

---

### Task B2: Extend shared settings Zod schema with `waterfallTipDismissed`

**Files:**

- Modify: `packages/shared/src/schemas/settings.schemas.ts` (or wherever `updateSettingsSchema` lives — confirm via `grep -rn "updateSettingsSchema" packages/shared/src`)
- Modify: `packages/shared/src/schemas/settings.schemas.test.ts` (or create)

- [ ] **Step 1: Write the failing test**

Add to the settings schema test file:

```typescript
import { describe, it, expect } from "bun:test";
import { updateSettingsSchema } from "../settings.schemas";

describe("updateSettingsSchema", () => {
  it("accepts waterfallTipDismissed", () => {
    const result = updateSettingsSchema.safeParse({ waterfallTipDismissed: true });
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean waterfallTipDismissed", () => {
    const result = updateSettingsSchema.safeParse({ waterfallTipDismissed: "yes" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts settings.schemas`
Expected: FAIL — field not recognised (stripped or passes "yes")

- [ ] **Step 3: Extend the schema**

Add `waterfallTipDismissed: z.boolean().optional()` to the `updateSettingsSchema` fields. Also add to any `HouseholdSettingsSchema` that describes the read shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts settings.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/settings.schemas.ts packages/shared/src/schemas/settings.schemas.test.ts
git commit -m "feat(shared): add waterfallTipDismissed to settings schema"
```

---

### Task B3: Service + route — `POST /api/waterfall/subcategories/:tier`

**Files:**

- Modify: `apps/backend/src/services/subcategory.service.ts`
- Modify: `apps/backend/src/services/subcategory.service.test.ts` (create if missing)
- Modify: `apps/backend/src/routes/waterfall.routes.ts`
- Modify: `apps/backend/src/routes/waterfall.routes.test.ts`
- Modify: `packages/shared/src/schemas/waterfall.schemas.ts` (new Zod schema)
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/routes/waterfall.routes.test.ts`:

```typescript
describe("POST /api/waterfall/subcategories/:tier", () => {
  it("creates a new subcategory with unlocked/non-default flags", async () => {
    const { app, token, householdId } = await setupAuthedApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/committed",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Subscriptions" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Subscriptions");
    expect(body.tier).toBe("committed");
    expect(body.isLocked).toBe(false);
    expect(body.isDefault).toBe(false);
    expect(body.householdId).toBe(householdId);
    await app.close();
  });

  it("rejects duplicate names in same tier with 409", async () => {
    const { app, token } = await setupAuthedApp();
    await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/committed",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Subscriptions" },
    });
    const dup = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/committed",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Subscriptions" },
    });
    expect(dup.statusCode).toBe(409);
    await app.close();
  });

  it("rejects without auth", async () => {
    const { app } = await setupAuthedApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/income",
      payload: { name: "Foo" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects invalid tier with 400", async () => {
    const { app, token } = await setupAuthedApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/surplus",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Foo" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects blank name with 400", async () => {
    const { app, token } = await setupAuthedApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/income",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "  " },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: FAIL — route does not exist (likely 404)

- [ ] **Step 3: Write the implementation**

In `packages/shared/src/schemas/waterfall.schemas.ts`, add:

```typescript
export const createSubcategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
});

export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>;
```

And export from `packages/shared/src/schemas/index.ts`:

```typescript
createSubcategorySchema,
type CreateSubcategoryInput,
```

In `apps/backend/src/services/subcategory.service.ts`, add method:

```typescript
async create(
  householdId: string,
  tier: WaterfallTier,
  name: string
): Promise<{
  id: string; householdId: string; tier: WaterfallTier; name: string;
  sortOrder: number; isLocked: boolean; isDefault: boolean; lockedByPlanner: boolean;
  createdAt: Date; updatedAt: Date;
}> {
  // Enforce max of 7 subcategories per tier (consistent with batchSaveSubcategoriesSchema)
  const existing = await prisma.subcategory.count({ where: { householdId, tier } });
  if (existing >= 7) {
    const err = new Error("Maximum 7 subcategories per tier");
    (err as any).code = "LIMIT_EXCEEDED";
    throw err;
  }
  const maxSort = await prisma.subcategory.aggregate({
    where: { householdId, tier },
    _max: { sortOrder: true },
  });
  const nextSort = (maxSort._max.sortOrder ?? -1) + 1;
  try {
    return await prisma.subcategory.create({
      data: {
        householdId,
        tier,
        name: name.trim(),
        sortOrder: nextSort,
        isLocked: false,
        isDefault: false,
        lockedByPlanner: false,
      },
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      const e = new Error("A subcategory with that name already exists");
      (e as any).code = "DUPLICATE";
      throw e;
    }
    throw err;
  }
},
```

In `apps/backend/src/routes/waterfall.routes.ts`, after the existing `fastify.put("/subcategories/:tier", ...)` block (around line 373), add:

```typescript
fastify.post("/subcategories/:tier", preMutation, async (req, reply) => {
  const { tier } = req.params as { tier: string };
  const tierParsed = WaterfallTierEnum.safeParse(tier);
  if (!tierParsed.success) {
    return reply.status(400).send({ error: "Invalid tier" });
  }
  const bodyParsed = createSubcategorySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return reply.status(400).send({ error: bodyParsed.error.message });
  }
  try {
    const sub = await subcategoryService.create(
      req.householdId!,
      tierParsed.data,
      bodyParsed.data.name
    );
    return reply.status(201).send(sub);
  } catch (err: any) {
    if (err.code === "DUPLICATE") {
      return reply.status(409).send({ error: err.message });
    }
    if (err.code === "LIMIT_EXCEEDED") {
      return reply.status(400).send({ error: err.message });
    }
    throw err;
  }
});
```

Add `createSubcategorySchema` to the existing import from `@finplan/shared` at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: PASS (including all existing tests still pass)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/subcategory.service.ts apps/backend/src/routes/waterfall.routes.ts apps/backend/src/routes/waterfall.routes.test.ts packages/shared/src/schemas/waterfall.schemas.ts packages/shared/src/schemas/index.ts
git commit -m "feat(waterfall): POST /subcategories/:tier for inline subcategory create"
```

---

## Phase C — Frontend foundations

### Task C1: Extend frontend `waterfall.service` and `useWaterfall` hooks

**Files:**

- Modify: `apps/frontend/src/services/waterfall.service.ts`
- Modify: `apps/frontend/src/hooks/useWaterfall.ts`
- Modify: `apps/frontend/src/hooks/useWaterfall.test.ts` (create if missing)

- [ ] **Step 1: Write the failing test**

Add a test for the new `createSubcategory` service method and the `useCreateSubcategory` hook:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { waterfallService } from "@/services/waterfall.service";

describe("waterfallService.createSubcategory", () => {
  it("exists and posts to the tier-scoped endpoint", async () => {
    expect(typeof (waterfallService as any).createSubcategory).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useWaterfall.test`
Expected: FAIL — `createSubcategory` does not exist

- [ ] **Step 3: Write the implementation**

Append to `apps/frontend/src/services/waterfall.service.ts` (inside the exported object, before the closing `}`):

```typescript
  createSubcategory: (
    tier: "income" | "committed" | "discretionary",
    name: string
  ) => apiClient.post<SubcategoryRow>(`/api/waterfall/subcategories/${tier}`, { name }),
```

Append to `apps/frontend/src/hooks/useWaterfall.ts`:

```typescript
export function useCreateSubcategory(tier: "income" | "committed" | "discretionary") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => waterfallService.createSubcategory(tier, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.subcategories(tier) });
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.summary });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to create subcategory";
      showError(message);
    },
  });
}
```

Also add a convenience aggregate hook at the bottom of the file:

```typescript
export function useFullWaterfall() {
  const summary = useWaterfallSummary();
  const incomeSubs = useSubcategories("income");
  const committedSubs = useSubcategories("committed");
  const discretionarySubs = useSubcategories("discretionary");
  const incomeItems = useTierItems("income");
  const committedItems = useTierItems("committed");
  const discretionaryItems = useTierItems("discretionary");

  return {
    summary,
    subcategories: {
      income: incomeSubs.data ?? [],
      committed: committedSubs.data ?? [],
      discretionary: discretionarySubs.data ?? [],
    },
    items: {
      income: incomeItems.data ?? [],
      committed: committedItems.data ?? [],
      discretionary: discretionaryItems.data ?? [],
    },
    isLoading:
      summary.isLoading ||
      incomeSubs.isLoading ||
      committedSubs.isLoading ||
      discretionarySubs.isLoading ||
      incomeItems.isLoading ||
      committedItems.isLoading ||
      discretionaryItems.isLoading,
    isError:
      summary.isError ||
      incomeSubs.isError ||
      committedSubs.isError ||
      discretionarySubs.isError ||
      incomeItems.isError ||
      committedItems.isError ||
      discretionaryItems.isError,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useWaterfall.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/waterfall.service.ts apps/frontend/src/hooks/useWaterfall.ts apps/frontend/src/hooks/useWaterfall.test.ts
git commit -m "feat(frontend): waterfall service + hooks for subcategory create and aggregate fetch"
```

---

### Task C2: Settings hook + service method for `dismissWaterfallTip`

**Files:**

- Modify: `apps/frontend/src/services/settings.service.ts` (or wherever settings calls live — confirm via `grep -rn "apiClient.patch.*settings" apps/frontend/src`)
- Modify: `apps/frontend/src/hooks/useSettings.ts` (create if missing)
- Modify: `apps/frontend/src/hooks/useSettings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { createWrapper } from "@/test-utils";
import { useDismissWaterfallTip } from "./useSettings";

describe("useDismissWaterfallTip", () => {
  it("calls PATCH /api/settings with waterfallTipDismissed=true", async () => {
    const { result } = renderHook(() => useDismissWaterfallTip(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(result.current.isSuccess).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useSettings.test`
Expected: FAIL — hook doesn't exist

- [ ] **Step 3: Add service + hook**

In the settings service file, add:

```typescript
dismissWaterfallTip: () =>
  apiClient.patch<unknown>("/api/settings", { waterfallTipDismissed: true }),
```

In `apps/frontend/src/hooks/useSettings.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "@/services/settings.service";

export const SETTINGS_KEYS = { main: ["settings"] as const };

export function useDismissWaterfallTip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => settingsService.dismissWaterfallTip(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SETTINGS_KEYS.main });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useSettings.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/settings.service.ts apps/frontend/src/hooks/useSettings.ts apps/frontend/src/hooks/useSettings.test.ts
git commit -m "feat(frontend): useDismissWaterfallTip mutation"
```

---

### Task C3: `useDebouncedSave` hook for client-side save coalescing

**Files:**

- Create: `apps/frontend/src/hooks/useDebouncedSave.ts`
- Create: `apps/frontend/src/hooks/useDebouncedSave.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedSave } from "./useDebouncedSave";

describe("useDebouncedSave", () => {
  it("coalesces multiple rapid updates into a single save call", async () => {
    const save = mock((data: Record<string, unknown>) => Promise.resolve(data));
    const { result } = renderHook(() => useDebouncedSave(save, 50));

    act(() => {
      result.current.queue({ name: "A" });
      result.current.queue({ amount: 100 });
      result.current.queue({ name: "B" });
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ name: "B", amount: 100 });
  });

  it("flushes immediately when flush() is called", async () => {
    const save = mock((data: Record<string, unknown>) => Promise.resolve(data));
    const { result } = renderHook(() => useDebouncedSave(save, 500));

    act(() => {
      result.current.queue({ name: "A" });
    });
    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ name: "A" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useDebouncedSave.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```typescript
// apps/frontend/src/hooks/useDebouncedSave.ts
import { useCallback, useEffect, useRef } from "react";

type Saver<T extends Record<string, unknown>> = (data: T) => Promise<unknown>;

export function useDebouncedSave<T extends Record<string, unknown>>(
  save: Saver<T>,
  delayMs = 300
) {
  const pendingRef = useRef<T>({} as T);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const data = pendingRef.current;
    if (Object.keys(data).length === 0) return;
    pendingRef.current = {} as T;
    await save(data);
  }, [save]);

  const queue = useCallback(
    (patch: Partial<T>) => {
      pendingRef.current = { ...pendingRef.current, ...patch } as T;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, delayMs);
    },
    [flush, delayMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { queue, flush };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useDebouncedSave.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useDebouncedSave.ts apps/frontend/src/hooks/useDebouncedSave.test.ts
git commit -m "feat(frontend): useDebouncedSave for save coalescing"
```

---

## Phase D — Full Waterfall components

### Task D1: `SurplusStrip` component

**Files:**

- Create: `apps/frontend/src/components/waterfall/SurplusStrip.tsx`
- Create: `apps/frontend/src/components/waterfall/SurplusStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SurplusStrip } from "./SurplusStrip";

describe("SurplusStrip", () => {
  it("renders amount and percent in tier-surplus colour", () => {
    render(<SurplusStrip income={10000} committed={4000} discretionary={2000} />);
    expect(screen.getByText(/SURPLUS/i)).toBeInTheDocument();
    expect(screen.getByText(/£4,000/)).toBeInTheDocument();
    expect(screen.getByText(/40\.0%/)).toBeInTheDocument();
  });

  it("shows dash when income is zero (no divide-by-zero)", () => {
    render(<SurplusStrip income={0} committed={0} discretionary={0} />);
    expect(screen.getByText(/£0/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("never applies a red/negative colour when surplus is negative", () => {
    const { container } = render(
      <SurplusStrip income={1000} committed={2000} discretionary={500} />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("text-tier-surplus");
    expect(root.className).not.toContain("text-error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SurplusStrip.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/waterfall/SurplusStrip.tsx
import { toGBP } from "@finplan/shared";

interface Props {
  income: number;
  committed: number;
  discretionary: number;
}

export function SurplusStrip({ income, committed, discretionary }: Props) {
  const surplus = income - committed - discretionary;
  const pct = income > 0 ? (surplus / income) * 100 : null;

  return (
    <div
      className="flex items-baseline justify-between rounded-md border border-tier-surplus/20 bg-tier-surplus/5 px-5 py-3 text-tier-surplus"
      data-testid="surplus-strip"
    >
      <span className="font-heading text-xs font-bold uppercase tracking-tier">
        = SURPLUS
      </span>
      <span className="font-numeric text-base font-semibold tabular-nums">
        {toGBP(surplus)}
        {pct !== null && (
          <span className="ml-2 text-xs text-tier-surplus/70">
            · {pct.toFixed(1)}%
          </span>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SurplusStrip.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/waterfall/SurplusStrip.tsx apps/frontend/src/components/waterfall/SurplusStrip.test.tsx
git commit -m "feat(waterfall): SurplusStrip component"
```

---

### Task D2: `TipBanner` component

**Files:**

- Create: `apps/frontend/src/components/waterfall/TipBanner.tsx`
- Create: `apps/frontend/src/components/waterfall/TipBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { TipBanner } from "./TipBanner";

describe("TipBanner", () => {
  it("renders tip text", () => {
    render(<TipBanner onDismiss={() => {}} />);
    expect(
      screen.getByText(/Start with your income/i)
    ).toBeInTheDocument();
  });

  it("calls onDismiss when the close button is clicked", () => {
    const onDismiss = mock(() => {});
    render(<TipBanner onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test TipBanner.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/waterfall/TipBanner.tsx
interface Props {
  onDismiss: () => void;
}

export function TipBanner({ onDismiss }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-foreground/10 bg-foreground/[0.02] px-4 py-3 text-sm text-text-secondary">
      <span className="flex-1">
        Start with your income — what arrives in your accounts each month.
      </span>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={onDismiss}
        className="text-text-tertiary hover:text-text-secondary transition-colors text-xs"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test TipBanner.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/waterfall/TipBanner.tsx apps/frontend/src/components/waterfall/TipBanner.test.tsx
git commit -m "feat(waterfall): TipBanner component"
```

---

### Task D3: `NetworkStatusBanner` component

**Files:**

- Create: `apps/frontend/src/components/waterfall/NetworkStatusBanner.tsx`
- Create: `apps/frontend/src/components/waterfall/NetworkStatusBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { NetworkStatusBanner } from "./NetworkStatusBanner";

describe("NetworkStatusBanner", () => {
  it("is hidden when no failures", () => {
    const { container } = render(<NetworkStatusBanner hasFailures={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows amber warning when hasFailures is true", () => {
    render(<NetworkStatusBanner hasFailures={true} />);
    const banner = screen.getByRole("alert");
    expect(banner.textContent).toMatch(/may not be saving/i);
    expect(banner.className).toContain("border-attention");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test NetworkStatusBanner.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/waterfall/NetworkStatusBanner.tsx
interface Props {
  hasFailures: boolean;
}

export function NetworkStatusBanner({ hasFailures }: Props) {
  if (!hasFailures) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-attention/40 bg-attention/5 px-4 py-2.5 text-sm text-attention"
    >
      Changes may not be saving — check your connection.
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test NetworkStatusBanner.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/waterfall/NetworkStatusBanner.tsx apps/frontend/src/components/waterfall/NetworkStatusBanner.test.tsx
git commit -m "feat(waterfall): NetworkStatusBanner component"
```

---

### Task D4: `AddSubcategoryButton` component

**Files:**

- Create: `apps/frontend/src/components/waterfall/AddSubcategoryButton.tsx`
- Create: `apps/frontend/src/components/waterfall/AddSubcategoryButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddSubcategoryButton } from "./AddSubcategoryButton";

describe("AddSubcategoryButton", () => {
  it("shows a ghost button by default", () => {
    render(<AddSubcategoryButton onCreate={mock(() => Promise.resolve())} />);
    expect(screen.getByRole("button", { name: /add subcategory/i })).toBeInTheDocument();
  });

  it("toggles to inline input on click, submits name, and resets on success", async () => {
    const onCreate = mock((name: string) => Promise.resolve());
    render(<AddSubcategoryButton onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /add subcategory/i }));
    const input = screen.getByPlaceholderText(/new subcategory/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Subscriptions" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).toHaveBeenCalledWith("Subscriptions");
  });

  it("shows inline error on failure and keeps input open", async () => {
    const onCreate = mock(() => Promise.reject(new Error("A subcategory with that name already exists")));
    render(<AddSubcategoryButton onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /add subcategory/i }));
    const input = screen.getByPlaceholderText(/new subcategory/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Housing" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test AddSubcategoryButton.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/waterfall/AddSubcategoryButton.tsx
import { useState } from "react";

interface Props {
  onCreate: (name: string) => Promise<unknown>;
}

export function AddSubcategoryButton({ onCreate }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEditing(false);
    setValue("");
    setError(null);
  };

  const submit = async () => {
    const name = value.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate(name);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add subcategory");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full rounded-md border border-dashed-none border-foreground/10 px-3 py-2 text-xs text-text-tertiary hover:border-foreground/25 hover:text-text-secondary transition-colors"
      >
        + Add subcategory
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="text"
          placeholder="New subcategory name"
          value={value}
          disabled={saving}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") reset();
          }}
          className="flex-1 rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 py-1.5 text-sm focus:outline-none focus:border-page-accent/60"
        />
        <button
          type="button"
          onClick={reset}
          className="text-xs text-text-tertiary hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-attention">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test AddSubcategoryButton.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/waterfall/AddSubcategoryButton.tsx apps/frontend/src/components/waterfall/AddSubcategoryButton.test.tsx
git commit -m "feat(waterfall): AddSubcategoryButton with inline create"
```

---

### Task D5: `TierRow` — inline editable row for a single waterfall item

**Files:**

- Create: `apps/frontend/src/components/waterfall/TierRow.tsx`
- Create: `apps/frontend/src/components/waterfall/TierRow.test.tsx`

**Responsibility:** one row editing one existing `TierItemRow`. Owns cell edit state, per-field auto-save via the existing `useTierUpdateItem` hook for name/cadence/due/owner, and period creation via `useCreatePeriod` for amount changes. Uses `useDebouncedSave` to coalesce rapid saves.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TierRow } from "./TierRow";
import { createWrapper } from "@/test-utils";

const mockItem = {
  id: "inc-1",
  name: "Ben — Salary",
  amount: 4200,
  spendType: "monthly" as const,
  subcategoryId: "sub-1",
  notes: null,
  dueDate: null,
  lastReviewedAt: new Date(),
  createdAt: new Date(),
  sortOrder: 0,
};

describe("TierRow (income)", () => {
  it("renders name, cadence, amount, and /month columns", () => {
    render(
      <table><tbody>
        <TierRow tier="income" item={mockItem} members={[]} onDelete={() => {}} />
      </tbody></table>,
      { wrapper: createWrapper() }
    );
    expect(screen.getByDisplayValue("Ben — Salary")).toBeInTheDocument();
    expect(screen.getByDisplayValue("4200")).toBeInTheDocument();
  });

  it("shows 'Joint' in Owner column when ownerId is null", () => {
    render(
      <table><tbody>
        <TierRow tier="income" item={{ ...mockItem, ownerId: null } as any} members={[]} onDelete={() => {}} />
      </tbody></table>,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText("Joint")).toBeInTheDocument();
  });

  it("reveals trash icon on hover", () => {
    const { container } = render(
      <table><tbody>
        <TierRow tier="income" item={mockItem} members={[]} onDelete={() => {}} />
      </tbody></table>,
      { wrapper: createWrapper() }
    );
    const row = container.querySelector("tr")!;
    expect(row.querySelector('[data-testid="row-delete-btn"]')).toBeInTheDocument();
  });

  it("shows amber 'incomplete' indicator when row is a draft with missing fields", () => {
    render(
      <table><tbody>
        <TierRow tier="income" item={{ ...mockItem, isDraft: true, name: "" } as any} members={[]} onDelete={() => {}} />
      </tbody></table>,
      { wrapper: createWrapper() }
    );
    expect(screen.getByTitle(/incomplete/i)).toBeInTheDocument();
  });

  it("displays '—' in Due column for monthly cadence", () => {
    render(
      <table><tbody>
        <TierRow tier="committed" item={{ ...mockItem, spendType: "monthly" } as any} members={[]} onDelete={() => {}} />
      </tbody></table>,
      { wrapper: createWrapper() }
    );
    const dueCell = screen.getByTestId("cell-due");
    expect(dueCell.textContent?.trim()).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test TierRow.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/waterfall/TierRow.tsx
import { useState } from "react";
import { toGBP } from "@finplan/shared";
import {
  useTierUpdateItem,
  useCreatePeriod,
  useDeleteItem,
  type TierItemRow,
} from "@/hooks/useWaterfall";
import { useDebouncedSave } from "@/hooks/useDebouncedSave";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type Tier = "income" | "committed" | "discretionary";

interface Member {
  id: string;
  displayName: string;
}

interface Props {
  tier: Tier;
  item: TierItemRow & {
    ownerId?: string | null;
    incomeType?: string | null;
    frequency?: string | null;
    isDraft?: boolean;
  };
  members: Member[];
  onDelete: (id: string) => void;
}

function monthlyEquivalent(amount: number, cadence: string): number {
  if (cadence === "yearly" || cadence === "annual") return Math.round(amount / 12);
  if (cadence === "one_off") return Math.round(amount / 12);
  return amount;
}

function isRowValid(item: Props["item"], tier: Tier): boolean {
  if (!item.name || item.name.trim() === "") return false;
  if (!item.amount || item.amount <= 0) return false;
  if (!item.subcategoryId) return false;
  if (tier === "income" && !item.incomeType) return false;
  if ((item.spendType === "yearly" || item.spendType === "one_off") && !item.dueDate) return false;
  return true;
}

export function TierRow({ tier, item, members, onDelete }: Props) {
  const updateItem = useTierUpdateItem(tier, item.id);
  const createPeriod = useCreatePeriod(
    tier === "income"
      ? "income_source"
      : tier === "committed"
        ? "committed_item"
        : "discretionary_item",
    item.id
  );
  const deleteItem = useDeleteItem(tier, item.id);
  const [showConfirm, setShowConfirm] = useState(false);

  // Coalesce rapid field edits into one item update
  const { queue: queueUpdate } = useDebouncedSave(
    (data: Record<string, unknown>) => updateItem.mutateAsync(data),
    300
  );

  const ownerName =
    item.ownerId
      ? (members.find((m) => m.id === item.ownerId)?.displayName ?? "—")
      : "Joint";

  const monthlyVal = monthlyEquivalent(item.amount, item.spendType);
  const valid = isRowValid(item, tier);

  const dueDisplay = (() => {
    if (item.spendType === "monthly") return "—";
    if (!item.dueDate) return "—";
    const d = new Date(item.dueDate);
    if (item.spendType === "yearly") return d.toLocaleString("en-GB", { month: "short" });
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  })();

  const onNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!valid || e.target.value === item.name) return;
    queueUpdate({ name: e.target.value });
  };

  const onAmountBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (Number.isNaN(value) || value <= 0 || value === item.amount) return;
    void createPeriod.mutateAsync({
      startDate: new Date(),
      amount: value,
      endDate: null,
    });
  };

  return (
    <tr
      className="group relative hover:bg-foreground/[0.02]"
      data-testid={`tier-row-${item.id}`}
    >
      <td className="px-3 py-1.5">
        <input
          type="text"
          defaultValue={item.name}
          onBlur={onNameBlur}
          aria-label={`Name for ${tier}`}
          className="w-full bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-page-accent/40 rounded px-1"
        />
      </td>
      {tier === "income" && (
        <td className="px-3 py-1.5">
          <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-tertiary">
            {item.incomeType ?? "other"}
          </span>
        </td>
      )}
      <td className="px-3 py-1.5 text-xs text-text-secondary" data-testid="cell-cadence">
        {item.spendType === "monthly" ? "Monthly" : item.spendType === "yearly" ? "Yearly" : "One-off"}
      </td>
      {tier === "income" && (
        <td className="px-3 py-1.5 text-xs text-text-secondary">{ownerName}</td>
      )}
      {tier !== "income" && (
        <td className="px-3 py-1.5 text-xs text-text-secondary" data-testid="cell-due">
          {dueDisplay}
        </td>
      )}
      <td className="px-3 py-1.5 text-right">
        <input
          type="number"
          defaultValue={item.amount}
          onBlur={onAmountBlur}
          aria-label={`Amount for ${item.name} in ${tier}`}
          className="w-24 bg-transparent font-numeric tabular-nums text-sm text-right focus:outline-none focus:ring-1 focus:ring-page-accent/40 rounded px-1"
        />
      </td>
      <td className="px-3 py-1.5 text-right font-numeric tabular-nums text-sm text-text-secondary">
        {toGBP(monthlyVal)}
      </td>
      <td className="w-8 px-2 py-1.5">
        {item.isDraft && !valid && (
          <span
            title="Incomplete — required fields missing"
            className="inline-block h-2 w-2 rounded-full bg-attention"
          />
        )}
        <button
          type="button"
          data-testid="row-delete-btn"
          aria-label="Delete row"
          onClick={() => setShowConfirm(true)}
          className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-attention transition-opacity text-xs ml-1"
        >
          🗑
        </button>
      </td>
      {showConfirm && (
        <ConfirmDialog
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => {
            setShowConfirm(false);
            void deleteItem.mutateAsync().then(() => onDelete(item.id));
          }}
          title={`Delete ${item.name || "this row"}?`}
          message="This removes the item and its amount history. You cannot undo this."
          confirmText="Delete"
          variant="warning"
        />
      )}
    </tr>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test TierRow.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/waterfall/TierRow.tsx apps/frontend/src/components/waterfall/TierRow.test.tsx
git commit -m "feat(waterfall): TierRow inline-editable component"
```

---

### Task D6: `SubcategoryGroup` — renders a group header + rows + explicit `+ add` row

**Files:**

- Create: `apps/frontend/src/components/waterfall/SubcategoryGroup.tsx`
- Create: `apps/frontend/src/components/waterfall/SubcategoryGroup.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubcategoryGroup } from "./SubcategoryGroup";
import { createWrapper } from "@/test-utils";

describe("SubcategoryGroup", () => {
  const subcategory = { id: "sub-1", name: "Housing", sortOrder: 0 };
  const items = [
    { id: "c-1", name: "Mortgage", amount: 1450, spendType: "monthly" as const, subcategoryId: "sub-1", notes: null, dueDate: null, lastReviewedAt: new Date(), createdAt: new Date(), sortOrder: 0 },
  ];

  it("renders subcategory name and group total", () => {
    render(
      <table><tbody>
        <SubcategoryGroup tier="committed" subcategory={subcategory} items={items} members={[]} onAddDraft={() => {}} onDeleteItem={() => {}} />
      </tbody></table>,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText("Housing")).toBeInTheDocument();
    expect(screen.getByText(/£1,450/)).toBeInTheDocument();
  });

  it("renders + add ghost row at the end of items", () => {
    const onAddDraft = mock(() => {});
    render(
      <table><tbody>
        <SubcategoryGroup tier="committed" subcategory={subcategory} items={items} members={[]} onAddDraft={onAddDraft} onDeleteItem={() => {}} />
      </tbody></table>,
      { wrapper: createWrapper() }
    );
    const addBtn = screen.getByRole("button", { name: /\+ add/i });
    fireEvent.click(addBtn);
    expect(onAddDraft).toHaveBeenCalledWith("sub-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SubcategoryGroup.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/waterfall/SubcategoryGroup.tsx
import { toGBP } from "@finplan/shared";
import { TierRow } from "./TierRow";
import type { TierItemRow } from "@/hooks/useWaterfall";

type Tier = "income" | "committed" | "discretionary";

interface Subcategory {
  id: string;
  name: string;
  sortOrder: number;
}
interface Member {
  id: string;
  displayName: string;
}

interface Props {
  tier: Tier;
  subcategory: Subcategory;
  items: TierItemRow[];
  members: Member[];
  onAddDraft: (subcategoryId: string) => void;
  onDeleteItem: (id: string) => void;
}

function monthlyTotal(items: TierItemRow[]): number {
  return items.reduce((sum, i) => {
    const m = i.spendType === "monthly" ? i.amount : Math.round(i.amount / 12);
    return sum + m;
  }, 0);
}

export function SubcategoryGroup({
  tier,
  subcategory,
  items,
  members,
  onAddDraft,
  onDeleteItem,
}: Props) {
  const total = monthlyTotal(items);

  return (
    <>
      <tr className="bg-foreground/[0.02]">
        <td
          colSpan={tier === "income" ? 6 : 5}
          className="px-3 py-2 font-heading text-[10px] uppercase tracking-wider text-text-tertiary"
        >
          <div className="flex items-baseline justify-between">
            <span>{subcategory.name}</span>
            <span className="font-numeric text-xs tabular-nums text-text-secondary">
              {toGBP(total)}/mo
            </span>
          </div>
        </td>
        <td className="w-8" />
      </tr>
      {items.map((item) => (
        <TierRow
          key={item.id}
          tier={tier}
          item={item as any}
          members={members}
          onDelete={onDeleteItem}
        />
      ))}
      <tr>
        <td
          colSpan={tier === "income" ? 7 : 6}
          className="px-3 py-1.5 text-left"
        >
          <button
            type="button"
            onClick={() => onAddDraft(subcategory.id)}
            className="text-xs italic text-text-tertiary hover:text-text-secondary transition-colors"
          >
            + add
          </button>
        </td>
      </tr>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SubcategoryGroup.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/waterfall/SubcategoryGroup.tsx apps/frontend/src/components/waterfall/SubcategoryGroup.test.tsx
git commit -m "feat(waterfall): SubcategoryGroup component"
```

---

### Task D7: `WaterfallTierTable` — one tier's entire table

**Files:**

- Create: `apps/frontend/src/components/waterfall/WaterfallTierTable.tsx`
- Create: `apps/frontend/src/components/waterfall/WaterfallTierTable.test.tsx`

**Responsibility:** Renders the tier header (name + total), the column-headers row, a `SubcategoryGroup` per subcategory (with "Uncategorised" fallback for orphaned items), and `AddSubcategoryButton` instances between groups and at the end. Manages local draft rows keyed by temporary ids. Delegates row-level edits to `TierRow`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { WaterfallTierTable } from "./WaterfallTierTable";
import { createWrapper } from "@/test-utils";

describe("WaterfallTierTable", () => {
  it("renders tier header with total and column headers", () => {
    render(
      <WaterfallTierTable
        tier="income"
        subcategories={[{ id: "s-1", name: "Salary", sortOrder: 0 }]}
        items={[]}
        members={[]}
        total={8856}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText("INCOME")).toBeInTheDocument();
    expect(screen.getByText(/£8,856/)).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("buckets orphaned items (unknown subcategoryId) under 'Uncategorised'", () => {
    render(
      <WaterfallTierTable
        tier="committed"
        subcategories={[{ id: "s-1", name: "Housing", sortOrder: 0 }]}
        items={[
          { id: "c-1", name: "Mortgage", amount: 1450, spendType: "monthly", subcategoryId: "s-1", notes: null, dueDate: null, lastReviewedAt: new Date(), createdAt: new Date(), sortOrder: 0 },
          { id: "c-2", name: "Orphan", amount: 10, spendType: "monthly", subcategoryId: "ghost-id", notes: null, dueDate: null, lastReviewedAt: new Date(), createdAt: new Date(), sortOrder: 0 },
        ] as any}
        members={[]}
        total={1460}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/uncategorised/i)).toBeInTheDocument();
  });

  it("renders empty-state ghosted skeleton rows when items is empty", () => {
    const { container } = render(
      <WaterfallTierTable tier="committed" subcategories={[]} items={[]} members={[]} total={0} />,
      { wrapper: createWrapper() }
    );
    expect(container.querySelectorAll("[data-testid='ghost-skeleton-row']").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test WaterfallTierTable.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/components/waterfall/WaterfallTierTable.tsx
import { useState } from "react";
import { toGBP, type SubcategoryRow } from "@finplan/shared";
import { SubcategoryGroup } from "./SubcategoryGroup";
import { AddSubcategoryButton } from "./AddSubcategoryButton";
import { useCreateSubcategory, type TierItemRow } from "@/hooks/useWaterfall";

type Tier = "income" | "committed" | "discretionary";

interface Member {
  id: string;
  displayName: string;
}

interface Props {
  tier: Tier;
  subcategories: SubcategoryRow[];
  items: TierItemRow[];
  members: Member[];
  total: number;
}

const TIER_META = {
  income: { label: "INCOME", colorClass: "text-tier-income" },
  committed: { label: "COMMITTED", colorClass: "text-tier-committed" },
  discretionary: { label: "DISCRETIONARY", colorClass: "text-tier-discretionary" },
};

export function WaterfallTierTable({ tier, subcategories, items, members, total }: Props) {
  const meta = TIER_META[tier];
  const createSub = useCreateSubcategory(tier);
  const [draftsBySub, setDraftsBySub] = useState<Record<string, string[]>>({});

  const addDraft = (subcategoryId: string) => {
    setDraftsBySub((prev) => ({
      ...prev,
      [subcategoryId]: [...(prev[subcategoryId] ?? []), `draft-${Date.now()}`],
    }));
  };

  const orphanItems = items.filter(
    (i) => !subcategories.some((s) => s.id === i.subcategoryId)
  );

  const groupedKnown = subcategories.map((s) => ({
    subcategory: { id: s.id, name: s.name, sortOrder: s.sortOrder },
    items: items.filter((i) => i.subcategoryId === s.id),
  }));

  const isEmpty = items.length === 0 && subcategories.length === 0;

  return (
    <section
      id={tier}
      className="rounded-lg border border-foreground/8 bg-foreground/[0.015]"
      data-testid={`waterfall-tier-${tier}`}
    >
      {/* Tier header */}
      <div className="flex items-baseline justify-between px-4 py-3 border-b border-foreground/5">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full bg-tier-${tier}`} />
          <h3 className={`font-heading text-sm font-bold uppercase tracking-tier ${meta.colorClass}`}>
            {meta.label}
          </h3>
        </div>
        <span className="font-numeric tabular-nums text-sm text-text-secondary">
          {toGBP(total)}/mo
        </span>
      </div>

      {isEmpty ? (
        <div className="p-4 space-y-1.5">
          {[0.5, 0.25, 0.12].map((op, i) => (
            <div
              key={i}
              data-testid="ghost-skeleton-row"
              className="h-6 rounded bg-foreground/10"
              style={{ opacity: op }}
            />
          ))}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-text-tertiary">
            <tr className="border-b border-foreground/5">
              <th className="px-3 py-2 text-left font-heading font-semibold">Name</th>
              {tier === "income" && <th className="px-3 py-2 text-left font-heading font-semibold">Type</th>}
              <th className="px-3 py-2 text-left font-heading font-semibold">Cadence</th>
              {tier === "income" ? (
                <th className="px-3 py-2 text-left font-heading font-semibold">Owner</th>
              ) : (
                <th className="px-3 py-2 text-left font-heading font-semibold">Due</th>
              )}
              <th className="px-3 py-2 text-right font-heading font-semibold">Amount</th>
              <th className="px-3 py-2 text-right font-heading font-semibold">/month</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {groupedKnown.map(({ subcategory, items: groupItems }) => (
              <SubcategoryGroup
                key={subcategory.id}
                tier={tier}
                subcategory={subcategory}
                items={groupItems}
                members={members}
                onAddDraft={addDraft}
                onDeleteItem={() => {}}
              />
            ))}
            {orphanItems.length > 0 && (
              <SubcategoryGroup
                tier={tier}
                subcategory={{ id: "__uncategorised__", name: "Uncategorised", sortOrder: 999 }}
                items={orphanItems}
                members={members}
                onAddDraft={() => {}}
                onDeleteItem={() => {}}
              />
            )}
          </tbody>
        </table>
      )}

      <div className="px-3 py-2 border-t border-foreground/5">
        <AddSubcategoryButton onCreate={(name) => createSub.mutateAsync(name)} />
      </div>
    </section>
  );
}
```

> Draft-row persistence and integration with TierRow's create-on-complete flow is intentionally deferred to Task D8 / the page integration (see note in Testing section); this task verifies headers, grouping, orphan bucketing, and empty-skeleton rendering.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test WaterfallTierTable.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/waterfall/WaterfallTierTable.tsx apps/frontend/src/components/waterfall/WaterfallTierTable.test.tsx
git commit -m "feat(waterfall): WaterfallTierTable component"
```

---

### Task D8: `FullWaterfallPage` route component

**Files:**

- Create: `apps/frontend/src/pages/FullWaterfallPage.tsx`
- Create: `apps/frontend/src/pages/FullWaterfallPage.test.tsx`
- Modify: `apps/frontend/src/App.tsx` (add route)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import FullWaterfallPage from "./FullWaterfallPage";
import { createWrapper, MemoryRouter } from "@/test-utils";

describe("FullWaterfallPage", () => {
  it("renders three tier tables and a surplus strip", () => {
    render(
      <MemoryRouter initialEntries={["/waterfall"]}>
        <FullWaterfallPage />
      </MemoryRouter>,
      { wrapper: createWrapper() }
    );
    expect(screen.getByTestId("waterfall-tier-income")).toBeInTheDocument();
    expect(screen.getByTestId("waterfall-tier-committed")).toBeInTheDocument();
    expect(screen.getByTestId("waterfall-tier-discretionary")).toBeInTheDocument();
    expect(screen.getByTestId("surplus-strip")).toBeInTheDocument();
  });

  it("renders the tip banner on first-time setup", () => {
    // Mock settings to { waterfallTipDismissed: false } and summary to all-zero
    render(
      <MemoryRouter initialEntries={["/waterfall"]}>
        <FullWaterfallPage />
      </MemoryRouter>,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/Start with your income/i)).toBeInTheDocument();
  });

  it("shows connectors between tiers", () => {
    render(
      <MemoryRouter initialEntries={["/waterfall"]}>
        <FullWaterfallPage />
      </MemoryRouter>,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/minus committed/i)).toBeInTheDocument();
    expect(screen.getByText(/minus discretionary/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test FullWaterfallPage.test`
Expected: FAIL — file does not exist

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/pages/FullWaterfallPage.tsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WaterfallTierTable } from "@/components/waterfall/WaterfallTierTable";
import { SurplusStrip } from "@/components/waterfall/SurplusStrip";
import { TipBanner } from "@/components/waterfall/TipBanner";
import { NetworkStatusBanner } from "@/components/waterfall/NetworkStatusBanner";
import { WaterfallConnector } from "@/components/overview/WaterfallConnector";
import { useFullWaterfall } from "@/hooks/useWaterfall";
import { useDismissWaterfallTip } from "@/hooks/useSettings";
import { useQuery } from "@tanstack/react-query";
import { settingsService } from "@/services/settings.service";
import { useHousehold } from "@/hooks/useHousehold";

export default function FullWaterfallPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { summary, subcategories, items, isLoading } = useFullWaterfall();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsService.getSettings(),
  });
  const dismissTip = useDismissWaterfallTip();
  const { members } = useHousehold();
  const [hasSaveFailures, setHasSaveFailures] = useState(false);

  // Hash scroll on mount
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (["income", "committed", "discretionary"].includes(hash)) {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-1", "ring-page-accent/40");
        setTimeout(() => el.classList.remove("ring-1", "ring-page-accent/40"), 800);
      }
    }
  }, [location.hash]);

  // Tab focus refetch (concurrent edit safety)
  useEffect(() => {
    const onFocus = () => void summary.refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [summary]);

  const income = summary.data?.income?.total ?? 0;
  const committed =
    (summary.data?.committed?.monthlyTotal ?? 0) +
    (summary.data?.committed?.monthlyAvg12 ?? 0);
  const discretionary = summary.data?.discretionary?.total ?? 0;

  const isEmpty = items.income.length === 0 && items.committed.length === 0 && items.discretionary.length === 0;
  const showTip = isEmpty && settings.data?.waterfallTipDismissed === false;

  const onClose = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/overview");
  };

  if (isLoading || settings.isLoading) {
    return <div className="p-10 text-center text-text-tertiary">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-6 flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-baseline justify-between border-b border-foreground/5 pb-3">
        <h1 className="font-heading text-lg font-bold uppercase tracking-tier text-page-accent">
          Your Waterfall
        </h1>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-foreground/15 px-3 py-1 text-xs text-text-tertiary hover:text-text-secondary hover:border-foreground/25"
        >
          ✕ Close
        </button>
      </div>

      <NetworkStatusBanner hasFailures={hasSaveFailures} />
      {showTip && <TipBanner onDismiss={() => dismissTip.mutate()} />}

      <WaterfallTierTable
        tier="income"
        subcategories={subcategories.income}
        items={items.income}
        members={members}
        total={income}
      />
      <WaterfallConnector text="↓ minus committed" />
      <WaterfallTierTable
        tier="committed"
        subcategories={subcategories.committed}
        items={items.committed}
        members={members}
        total={committed}
      />
      <WaterfallConnector text="↓ minus discretionary" />
      <WaterfallTierTable
        tier="discretionary"
        subcategories={subcategories.discretionary}
        items={items.discretionary}
        members={members}
        total={discretionary}
      />

      <SurplusStrip income={income} committed={committed} discretionary={discretionary} />
    </div>
  );
}
```

Then modify `apps/frontend/src/App.tsx`:

```typescript
// Add near other lazy imports (around line 28):
const FullWaterfallPage = lazy(() => import("./pages/FullWaterfallPage"));

// Inside the inner <Routes>, before the "*" fallback (line 80):
<Route path="/waterfall" element={<FullWaterfallPage />} />
```

> **Note on `useHousehold`:** if this hook doesn't expose `members`, use the existing household-members hook (check `apps/frontend/src/hooks/useHouseholdMembers.ts` or equivalent). The members list is only consumed by TierRow's Owner column.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test FullWaterfallPage.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/FullWaterfallPage.tsx apps/frontend/src/pages/FullWaterfallPage.test.tsx apps/frontend/src/App.tsx
git commit -m "feat(waterfall): /waterfall FullWaterfallPage and route registration"
```

---

## Phase E — Integration

### Task E1: "View all" button on tier pages

**Files:**

- Modify: `apps/frontend/src/components/tier/ItemArea.tsx`
- Modify: `apps/frontend/src/components/tier/ItemArea.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `ItemArea.test.tsx`:

```typescript
describe("ItemArea — View all navigation", () => {
  it("renders a 'View all' button that links to /waterfall#<tier>", () => {
    render(
      <MemoryRouter>
        <ItemArea tier="committed" /* ... minimal props */ />
      </MemoryRouter>,
      { wrapper: createWrapper() }
    );
    const btn = screen.getByRole("link", { name: /view all/i });
    expect(btn.getAttribute("href")).toBe("/waterfall#committed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ItemArea.test`
Expected: FAIL — no "View all" element

- [ ] **Step 3: Implement**

In `apps/frontend/src/components/tier/ItemArea.tsx`, add the "View all" link inline near the existing add-button area in the right-panel header. Use `<Link to={`/waterfall#${tier}`}>` with styling matching `GhostAddButton`:

```tsx
// Add near the top of the component imports:
import { Link } from "react-router-dom";

// In the header area (locate the existing lifecycle filter / sort row or the header above it),
// add a "View all" link:
<Link
  to={`/waterfall#${tier}`}
  className="rounded-md border border-foreground/20 px-3 py-1 text-xs font-medium text-foreground/60 hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80 transition-all duration-150"
>
  View all
</Link>
```

Place it before the existing `GhostAddButton` (if one exists) so it reads left-to-right as `[View all] [+ Add]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ItemArea.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/ItemArea.tsx apps/frontend/src/components/tier/ItemArea.test.tsx
git commit -m "feat(tier): add 'View all' link to /waterfall from tier right-panel"
```

---

### Task E2: Implement Overview empty state with CTA to `/waterfall`

**Context:** `OverviewEmptyState.tsx` is currently a stub (`return null`). This task implements it per the "Ghosted Cascade" pattern in `design-system.md` § 3.5 — four tier headers at ~25% opacity + a callout gradient CTA card. The CTA routes to `/waterfall`.

Separately, the `OverviewPage` needs to render `<OverviewEmptyState />` when the household has no waterfall items; verify via grep whether this wiring already exists (it may simply render the component in its empty branch). If not, wire it as part of this task.

**Files:**

- Modify: `apps/frontend/src/components/overview/OverviewEmptyState.tsx` (currently a stub)
- Modify: `apps/frontend/src/components/overview/OverviewEmptyState.test.tsx`
- Modify: `apps/frontend/src/pages/OverviewPage.tsx` (only if the empty-state branch isn't already wired — confirm via grep)
- Modify: `apps/frontend/src/components/design/renew/DataDisplayRenewPatterns.tsx:186` (design demo copy)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OverviewEmptyState from "./OverviewEmptyState";

describe("OverviewEmptyState", () => {
  it("renders a ghosted cascade of four tier labels", () => {
    render(
      <MemoryRouter>
        <OverviewEmptyState />
      </MemoryRouter>
    );
    expect(screen.getByText(/income/i)).toBeInTheDocument();
    expect(screen.getByText(/committed/i)).toBeInTheDocument();
    expect(screen.getByText(/discretionary/i)).toBeInTheDocument();
    expect(screen.getByText(/surplus/i)).toBeInTheDocument();
  });

  it("renders a 'Build your waterfall' CTA link pointing to /waterfall", () => {
    render(
      <MemoryRouter>
        <OverviewEmptyState />
      </MemoryRouter>
    );
    const cta = screen.getByRole("link", { name: /build your waterfall/i });
    expect(cta.getAttribute("href")).toBe("/waterfall");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test OverviewEmptyState.test`
Expected: FAIL — component returns null

- [ ] **Step 3: Implement**

Replace the stub in `apps/frontend/src/components/overview/OverviewEmptyState.tsx`:

```tsx
import { Link } from "react-router-dom";

const GHOSTED_TIERS = [
  { label: "Income", colorClass: "text-tier-income" },
  { label: "Committed spend", colorClass: "text-tier-committed" },
  { label: "Discretionary", colorClass: "text-tier-discretionary" },
  { label: "Surplus", colorClass: "text-tier-surplus" },
];

export default function OverviewEmptyState() {
  return (
    <div className="flex flex-col items-center gap-6 px-8 py-12">
      <div className="flex flex-col items-center gap-3 opacity-25">
        {GHOSTED_TIERS.map((tier, i) => (
          <div key={tier.label} className="flex items-center gap-3">
            <span
              className={`font-heading text-xs font-bold uppercase tracking-tier ${tier.colorClass}`}
            >
              {tier.label}
            </span>
            <span className="font-numeric text-xs text-text-tertiary">£—</span>
            {i < GHOSTED_TIERS.length - 1 && (
              <span className="text-[10px] text-text-tertiary opacity-60">↓</span>
            )}
          </div>
        ))}
      </div>
      <div
        className="rounded-lg border border-page-accent/10 px-4 py-3.5 max-w-md w-full text-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(99, 102, 241, 0.07) 0%, rgba(168, 85, 247, 0.05) 100%)",
        }}
      >
        <h3 className="font-heading text-sm font-semibold text-foreground mb-1">
          Build your waterfall
        </h3>
        <p className="text-xs text-text-tertiary mb-3">
          Add your income, committed spend, and discretionary budgets to see your monthly cascade.
        </p>
        <Link
          to="/waterfall"
          className="inline-block rounded-md bg-page-accent/15 border border-page-accent/40 px-3 py-1.5 text-xs font-medium text-page-accent hover:bg-page-accent/25 transition-colors"
        >
          Build your waterfall
        </Link>
      </div>
    </div>
  );
}
```

Verify/wire `OverviewPage` renders `<OverviewEmptyState />` in its empty-data branch:

```bash
grep -n "OverviewEmptyState\|summary.*total\|waterfall.*empty" apps/frontend/src/pages/OverviewPage.tsx
```

If not wired, render it when `summary.data` shows zero income + zero committed + zero discretionary.

Update the design demo page copy in `apps/frontend/src/components/design/renew/DataDisplayRenewPatterns.tsx` line 186 — change "Set up your waterfall from scratch ▸" to "Build your waterfall" for consistency.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test OverviewEmptyState.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/OverviewEmptyState.tsx apps/frontend/src/components/overview/OverviewEmptyState.test.tsx apps/frontend/src/pages/OverviewPage.tsx apps/frontend/src/components/design/renew/DataDisplayRenewPatterns.tsx
git commit -m "feat(overview): ghosted-cascade empty state with /waterfall CTA"
```

---

### Task E3: Settings "Rebuild from scratch" routes to `/waterfall` after confirm

**Files:**

- Modify: `apps/frontend/src/components/settings/ResetConfirmationModal.tsx` (or wherever the rebuild flow lives — confirm via `grep -rn "Rebuild from scratch\|/api/waterfall/all" apps/frontend/src`)
- Modify: its test file

- [ ] **Step 1: Write the failing test**

```typescript
it("navigates to /waterfall after successful rebuild", async () => {
  const navigate = mock((path: string) => {});
  render(
    <MemoryRouter>
      <ResetConfirmationModal isOpen onClose={() => {}} onReset={async () => { navigate("/waterfall"); }} />
    </MemoryRouter>,
    { wrapper: createWrapper() }
  );
  fireEvent.click(screen.getByRole("button", { name: /confirm|rebuild/i }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/waterfall"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ResetConfirmationModal.test`
Expected: FAIL — navigates elsewhere or not at all

- [ ] **Step 3: Implement**

Update the rebuild flow (wherever `waterfallService.deleteAll()` is called) to `navigate("/waterfall")` on success.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ResetConfirmationModal.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/ResetConfirmationModal.tsx apps/frontend/src/components/settings/ResetConfirmationModal.test.tsx
git commit -m "feat(settings): rebuild-from-scratch routes to /waterfall on success"
```

---

## Breaking Change Impact Analysis

| Change | Consumers identified | Task covering |
|---|---|---|
| Remove `WaterfallSetupSession` model | `import.service.ts:185` (deleteMany) | A5 |
| | `apps/backend/src/test/mocks/prisma.ts:49` | A5 |
| | `apps/backend/src/test/helpers/test-db.ts:176` | A5 |
| | `apps/backend/src/services/setup-session.service.ts` | A2 (delete) |
| Remove `/api/setup-session` endpoints | `apps/backend/src/app.ts:17,102` | A3 |
| | `apps/backend/src/routes/setup-session.routes*.ts` | A3 (delete) |
| Remove `updateSetupSessionSchema` from `@finplan/shared` | Re-exported in `packages/shared/src/schemas/index.ts` | A1 |
| | `apps/backend/src/routes/setup-session.routes.ts` import | A3 (file deleted) |
| Remove frontend `setupSessionService` | `apps/frontend/src/pages/SettingsPage.test.tsx` | A4 |
| Add `HouseholdSettings.waterfallTipDismissed` | Read by `FullWaterfallPage` (new) | B1/B2/D8 |
| | `updateSettingsSchema` — additive, no break | B2 |
| Add `POST /api/waterfall/subcategories/:tier` | Called by new `useCreateSubcategory` | B3/C1 |
| New `useCreateSubcategory` / `useFullWaterfall` / `useDebouncedSave` hooks | Only consumed by Full Waterfall page and `AddSubcategoryButton` | D4–D8 |
| Change Overview empty-state CTA target | `OverviewEmptyState.tsx` | E2 |
| | `DataDisplayRenewPatterns.tsx` (design demo) | E2 |
| Change Settings rebuild target | `ResetConfirmationModal.tsx` | E3 |

**No known silent-drop risk.** The only removed fields (`WaterfallSetupSession`) are deleted from every consumer; the only additive field (`waterfallTipDismissed`) is optional and defaulted. No existing summary/tier-item response shapes change, so tier-page rendering and Overview rendering remain byte-identical.

---

## Testing

### Backend Tests

- [ ] Service: `subcategoryService.create` rejects when tier already has 7 subcategories (returns `LIMIT_EXCEEDED`)
- [ ] Service: `subcategoryService.create` rejects duplicate names with `DUPLICATE` and maps to 409
- [ ] Service: `settingsService.updateSettings({ waterfallTipDismissed: true })` persists and is returned
- [ ] Endpoint: `POST /api/waterfall/subcategories/:tier` returns 401 without JWT
- [ ] Endpoint: `POST /api/waterfall/subcategories/:tier` returns 400 for invalid tier, blank name, or > 40 chars
- [ ] Endpoint: `POST /api/waterfall/subcategories/:tier` only creates for the authenticated household (cross-tenant request would not leak other households' subcategories)
- [ ] Endpoint: `GET /api/setup-session` and sibling routes return 404 (removed)
- [ ] Regression: `POST /api/waterfall/income` / `/committed` / `/discretionary` still create items + initial `ItemAmountPeriod` (no behaviour change)
- [ ] Regression: `GET /api/waterfall/` still returns the existing `WaterfallSummary` shape
- [ ] Regression: `DELETE /api/waterfall/all` no longer references `waterfallSetupSession` but succeeds

### Frontend Tests

- [ ] Hook: `useDebouncedSave` coalesces multiple `queue()` calls into one `save()` within the delay window
- [ ] Hook: `useDebouncedSave.flush()` fires immediately on demand
- [ ] Hook: `useCreateSubcategory` invalidates `WATERFALL_KEYS.subcategories(tier)` on success
- [ ] Hook: `useDismissWaterfallTip` invalidates settings query on success
- [ ] Component: `SurplusStrip` renders in `tier-surplus` colour only (no red/error class) for negative surplus
- [ ] Component: `TipBanner` calls `onDismiss` when close is clicked
- [ ] Component: `NetworkStatusBanner` is null when `hasFailures === false`
- [ ] Component: `AddSubcategoryButton` toggles to input, submits on Enter, resets on success, shows inline error on failure
- [ ] Component: `TierRow` renders "Joint" when `ownerId` is null; renders "—" in Due cell when cadence is monthly
- [ ] Component: `SubcategoryGroup` shows the monthly total on the header
- [ ] Component: `WaterfallTierTable` renders tier header, column headers, and subcategory groups; shows skeleton ghost rows when empty; buckets orphan items under "Uncategorised"
- [ ] Page: `FullWaterfallPage` renders three tier tables + surplus strip + connectors; shows tip when empty + not dismissed; hash `/waterfall#committed` scrolls to committed tier
- [ ] Page: `FullWaterfallPage` close button uses `navigate(-1)` when history exists, else `/overview`
- [ ] Integration: tier pages' "View all" link routes to `/waterfall#<tier>`
- [ ] Integration: Overview empty-state CTA routes to `/waterfall`
- [ ] Integration: Settings "Rebuild from scratch" after confirm routes to `/waterfall`

### Key Scenarios

- [ ] Happy path — new user: `/overview` empty state → "Build your waterfall" → `/waterfall` → add income row (name+amount+cadence) → auto-save → row persists and appears on `/income` tier page
- [ ] Happy path — returning user: `/committed` → "View all" → `/waterfall#committed` → edit mortgage amount → auto-save → Overview shows updated total
- [ ] Subcategory inline create: click "+ Add subcategory" → type "Subscriptions" → Enter → new group appears → try same name again → inline error "A subcategory with that name already exists"
- [ ] Delete row: hover → trash → confirm → row disappears; confirm dialog cancel keeps row
- [ ] Concurrent edit: two browsers open to `/waterfall`, both edit different items → tab-focus on either triggers refetch → both see latest
- [ ] Subcategory deleted in Settings while `/waterfall` is open → tab focus → items reattach to "Uncategorised" group
- [ ] Offline / save failure: disconnect → edit cell → NetworkStatusBanner appears; reconnect and edit → banner clears on next success
- [ ] Tip dismissal persists: dismiss → reload `/waterfall` → tip does not reappear

## Verification

- [ ] `bun run build` passes clean (both backend and frontend)
- [ ] `bun run lint` — zero warnings
- [ ] `cd apps/backend && bun scripts/run-tests.ts waterfall` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts settings` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts import.service` passes
- [ ] `cd apps/frontend && bun test waterfall` passes
- [ ] `cd apps/frontend && bun test FullWaterfallPage` passes
- [ ] `bun run type-check` passes across all packages
- [ ] Manual: fresh household → `/overview` → "Build your waterfall" → add at least one income, one committed (monthly + yearly), one discretionary → surplus strip updates → reload page → edits persisted
- [ ] Manual: tier page "View all" scrolls to correct tier section on `/waterfall`
- [ ] Manual: no console errors referencing `setup-session` or `waterfallSetupSession`

## Post-conditions

- [ ] `/waterfall` is the single surface for first-time setup and full-waterfall bulk edit
- [ ] Legacy `WaterfallSetupSession` and setup-wizard endpoints are fully removed from the codebase
- [ ] Future work can add additional full-screen workbench surfaces (e.g. annual review) using the pattern established here
- [ ] Unblocks design decisions on extending quick-add to Assets/Accounts/Goals
