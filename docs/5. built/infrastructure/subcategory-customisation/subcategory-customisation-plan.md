---
feature: subcategory-customisation
category: infrastructure
spec: docs/4. planning/subcategory-customisation/subcategory-customisation-spec.md
creation_date: 2026-04-05
status: implemented
implemented_date: 2026-07-05
---

# Subcategory Customisation — Implementation Plan

> **For Claude:** Use `/execute-plan subcategory-customisation` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Allow users to rename, add, remove, and reorder subcategories per waterfall tier, with item reassignment on removal and a full reset-to-defaults flow.
**Spec:** `docs/4. planning/subcategory-customisation/subcategory-customisation-spec.md`
**Architecture:** Three new backend endpoints on the existing waterfall routes — batch save (full-state replace per tier), item counts per tier, and reset-to-defaults. All mutations run in Prisma transactions. Frontend adds a new SubcategoriesSection to the Settings page with tier tabs, inline editing, drag reordering via `@dnd-kit`, and modal dialogs for reassignment and reset.
**Tech Stack:** Fastify · Prisma · Zod · React 18 · TanStack Query · Tailwind · @dnd-kit
**Infrastructure Impact:**

- Touches `packages/shared/`: yes
- Requires DB migration: no

## Pre-conditions

- [x] Subcategory model exists in Prisma schema with `id`, `householdId`, `tier`, `name`, `sortOrder`, `isLocked`, `isDefault`, unique constraint on `[householdId, tier, name]`
- [x] `subcategoryService.seedDefaults()` and `listByTier()` exist
- [x] `GET /api/waterfall/subcategories/:tier` route exists
- [x] Settings page exists with section-based layout pattern
- [x] `ConfirmDialog`, `Tabs`, `Select`, `Input`, `Button` UI components exist

## Tasks

---

### Task 1: Shared Zod schemas for subcategory mutations

**Files:**

- Modify: `packages/shared/src/schemas/waterfall.schemas.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/schemas/waterfall.schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Append to packages/shared/src/schemas/waterfall.schemas.test.ts

describe("batchSaveSubcategoriesSchema", () => {
  it("accepts valid batch save payload", () => {
    const { batchSaveSubcategoriesSchema } = require("./waterfall.schemas");
    const result = batchSaveSubcategoriesSchema.safeParse({
      subcategories: [
        { id: "sub-1", name: "Housing", sortOrder: 0 },
        { name: "New Category", sortOrder: 1 },
      ],
      reassignments: [{ fromSubcategoryId: "sub-old", toSubcategoryId: "sub-1" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const { batchSaveSubcategoriesSchema } = require("./waterfall.schemas");
    const result = batchSaveSubcategoriesSchema.safeParse({
      subcategories: [{ name: "", sortOrder: 0 }],
      reassignments: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects name over 24 characters", () => {
    const { batchSaveSubcategoriesSchema } = require("./waterfall.schemas");
    const result = batchSaveSubcategoriesSchema.safeParse({
      subcategories: [{ name: "A".repeat(25), sortOrder: 0 }],
      reassignments: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("resetSubcategoriesSchema", () => {
  it("accepts valid reset payload", () => {
    const { resetSubcategoriesSchema } = require("./waterfall.schemas");
    const result = resetSubcategoriesSchema.safeParse({
      reassignments: [{ fromSubcategoryId: "sub-custom", toSubcategoryId: "sub-other" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty reassignments", () => {
    const { resetSubcategoriesSchema } = require("./waterfall.schemas");
    const result = resetSubcategoriesSchema.safeParse({
      reassignments: [],
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test waterfall.schemas.test.ts`
Expected: FAIL — "batchSaveSubcategoriesSchema is not defined" or similar

- [ ] **Step 3: Write minimal implementation**

Add to `packages/shared/src/schemas/waterfall.schemas.ts` (before the closing exports):

```typescript
// ─── Subcategory mutation schemas ────────────────────────────────────────────

const subcategoryReassignmentSchema = z.object({
  fromSubcategoryId: z.string().min(1),
  toSubcategoryId: z.string().min(1),
});

const subcategoryEntrySchema = z.object({
  id: z.string().min(1).optional(), // omitted for new subcategories
  name: z.string().min(1).max(24).trim(),
  sortOrder: z.number().int().min(0),
});

export const batchSaveSubcategoriesSchema = z.object({
  subcategories: z.array(subcategoryEntrySchema).min(1).max(7),
  reassignments: z.array(subcategoryReassignmentSchema),
});

export type BatchSaveSubcategoriesInput = z.infer<typeof batchSaveSubcategoriesSchema>;
export type SubcategoryEntry = z.infer<typeof subcategoryEntrySchema>;
export type SubcategoryReassignment = z.infer<typeof subcategoryReassignmentSchema>;

export const resetSubcategoriesSchema = z.object({
  reassignments: z.array(subcategoryReassignmentSchema),
});

export type ResetSubcategoriesInput = z.infer<typeof resetSubcategoriesSchema>;
```

Add exports to `packages/shared/src/schemas/index.ts` inside the waterfall export block:

```typescript
  batchSaveSubcategoriesSchema,
  resetSubcategoriesSchema,
  type BatchSaveSubcategoriesInput,
  type SubcategoryEntry,
  type SubcategoryReassignment,
  type ResetSubcategoriesInput,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test waterfall.schemas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/waterfall.schemas.ts packages/shared/src/schemas/waterfall.schemas.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add Zod schemas for subcategory batch save and reset"
```

---

### Task 2: Backend service — getItemCounts

**Files:**

- Modify: `apps/backend/src/services/subcategory.service.ts`
- Modify: `apps/backend/src/services/subcategory.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Append to apps/backend/src/services/subcategory.service.test.ts

describe("subcategoryService.getItemCounts", () => {
  it("returns item counts per subcategory for income tier", async () => {
    prismaMock.incomeSource.groupBy.mockResolvedValue([
      { subcategoryId: "sub-salary", _count: { id: 3 } },
      { subcategoryId: "sub-other", _count: { id: 1 } },
    ] as any);

    const result = await subcategoryService.getItemCounts("hh-1", "income");

    expect(prismaMock.incomeSource.groupBy).toHaveBeenCalledWith({
      by: ["subcategoryId"],
      where: { householdId: "hh-1" },
      _count: { id: true },
    });
    expect(result).toEqual({
      "sub-salary": 3,
      "sub-other": 1,
    });
  });

  it("returns item counts for committed tier", async () => {
    prismaMock.committedItem.groupBy.mockResolvedValue([
      { subcategoryId: "sub-housing", _count: { id: 2 } },
    ] as any);

    const result = await subcategoryService.getItemCounts("hh-1", "committed");

    expect(prismaMock.committedItem.groupBy).toHaveBeenCalled();
    expect(result).toEqual({ "sub-housing": 2 });
  });

  it("returns item counts for discretionary tier", async () => {
    prismaMock.discretionaryItem.groupBy.mockResolvedValue([
      { subcategoryId: "sub-food", _count: { id: 5 } },
    ] as any);

    const result = await subcategoryService.getItemCounts("hh-1", "discretionary");

    expect(prismaMock.discretionaryItem.groupBy).toHaveBeenCalled();
    expect(result).toEqual({ "sub-food": 5 });
  });

  it("returns empty object when no items exist", async () => {
    prismaMock.incomeSource.groupBy.mockResolvedValue([] as any);

    const result = await subcategoryService.getItemCounts("hh-1", "income");
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts subcategory.service`
Expected: FAIL — "subcategoryService.getItemCounts is not a function"

- [ ] **Step 3: Write minimal implementation**

Add to `apps/backend/src/services/subcategory.service.ts` inside the `subcategoryService` object:

```typescript
  async getItemCounts(householdId: string, tier: WaterfallTier): Promise<Record<string, number>> {
    const model =
      tier === "income"
        ? prisma.incomeSource
        : tier === "committed"
          ? prisma.committedItem
          : prisma.discretionaryItem;

    const groups = await (model as any).groupBy({
      by: ["subcategoryId"],
      where: { householdId },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const g of groups) {
      counts[g.subcategoryId] = g._count.id;
    }
    return counts;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts subcategory.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/subcategory.service.ts apps/backend/src/services/subcategory.service.test.ts
git commit -m "feat(backend): add getItemCounts to subcategory service"
```

---

### Task 3: Backend service — batchSave

**Files:**

- Modify: `apps/backend/src/services/subcategory.service.ts`
- Modify: `apps/backend/src/services/subcategory.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Append to apps/backend/src/services/subcategory.service.test.ts

describe("subcategoryService.batchSave", () => {
  it("creates new subcategories and updates existing ones in a transaction", async () => {
    // Existing subcategories in db
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-2",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);
    prismaMock.subcategory.update.mockResolvedValue({} as any);
    prismaMock.subcategory.create.mockResolvedValue({} as any);

    await subcategoryService.batchSave("hh-1", "income", {
      subcategories: [
        { id: "sub-1", name: "Employment", sortOrder: 0 },
        { name: "Freelance", sortOrder: 1 },
        { id: "sub-2", name: "Other", sortOrder: 2 },
      ],
      reassignments: [],
    });

    // Should update sub-1 (renamed to Employment)
    expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { name: "Employment", sortOrder: 0 },
    });
    // Should update sub-2 (sortOrder changed)
    expect(prismaMock.subcategory.update).toHaveBeenCalledWith({
      where: { id: "sub-2" },
      data: { name: "Other", sortOrder: 2 },
    });
    // Should create the new one
    expect(prismaMock.subcategory.create).toHaveBeenCalledWith({
      data: {
        householdId: "hh-1",
        tier: "income",
        name: "Freelance",
        sortOrder: 1,
        isLocked: false,
        isDefault: false,
      },
    });
  });

  it("deletes removed subcategories and reassigns items", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-2",
        householdId: "hh-1",
        tier: "income",
        name: "Dividends",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-3",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 2,
        isLocked: false,
        isDefault: true,
      },
    ] as any);
    prismaMock.incomeSource.updateMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.subcategory.delete.mockResolvedValue({} as any);
    prismaMock.subcategory.update.mockResolvedValue({} as any);

    await subcategoryService.batchSave("hh-1", "income", {
      subcategories: [
        { id: "sub-1", name: "Salary", sortOrder: 0 },
        { id: "sub-3", name: "Other", sortOrder: 1 },
      ],
      reassignments: [{ fromSubcategoryId: "sub-2", toSubcategoryId: "sub-1" }],
    });

    // Should reassign items from sub-2 to sub-1
    expect(prismaMock.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { subcategoryId: "sub-2", householdId: "hh-1" },
      data: { subcategoryId: "sub-1" },
    });
    // Should delete sub-2
    expect(prismaMock.subcategory.delete).toHaveBeenCalledWith({
      where: { id: "sub-2" },
    });
  });

  it("rejects if Other is missing from desired state", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [{ id: "sub-1", name: "Salary", sortOrder: 0 }],
        reassignments: [],
      })
    ).rejects.toThrow("Other");
  });

  it("rejects if locked subcategory is renamed", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-gifts",
        householdId: "hh-1",
        tier: "discretionary",
        name: "Gifts",
        sortOrder: 0,
        isLocked: true,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "discretionary",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "discretionary", {
        subcategories: [
          { id: "sub-gifts", name: "Presents", sortOrder: 0 },
          { id: "sub-other", name: "Other", sortOrder: 1 },
        ],
        reassignments: [],
      })
    ).rejects.toThrow("locked");
  });

  it("rejects if locked subcategory is removed", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-gifts",
        householdId: "hh-1",
        tier: "discretionary",
        name: "Gifts",
        sortOrder: 0,
        isLocked: true,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "discretionary",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "discretionary", {
        subcategories: [{ id: "sub-other", name: "Other", sortOrder: 0 }],
        reassignments: [{ fromSubcategoryId: "sub-gifts", toSubcategoryId: "sub-other" }],
      })
    ).rejects.toThrow("locked");
  });

  it("rejects duplicate names (case-insensitive)", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [
          { id: "sub-1", name: "salary", sortOrder: 0 },
          { name: "Salary", sortOrder: 1 },
          { id: "sub-other", name: "Other", sortOrder: 2 },
        ],
        reassignments: [],
      })
    ).rejects.toThrow("unique");
  });

  it("rejects more than 7 subcategories", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: Array.from({ length: 8 }, (_, i) => ({
          name: i === 7 ? "Other" : `Cat ${i}`,
          sortOrder: i,
        })),
        reassignments: [],
      })
    ).rejects.toThrow("7");
  });

  it("rejects if a new subcategory is named 'Other' (case-insensitive)", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [
          { name: "other", sortOrder: 0 },
          { id: "sub-other", name: "Other", sortOrder: 1 },
        ],
        reassignments: [],
      })
    ).rejects.toThrow("reserved");
  });

  it("rejects if Other is not last in sortOrder", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [
          { id: "sub-other", name: "Other", sortOrder: 0 },
          { id: "sub-1", name: "Salary", sortOrder: 1 },
        ],
        reassignments: [],
      })
    ).rejects.toThrow("last");
  });

  it("rejects reassignment from subcategory not owned by household", async () => {
    prismaMock.subcategory.findMany.mockResolvedValue([
      {
        id: "sub-1",
        householdId: "hh-1",
        tier: "income",
        name: "Salary",
        sortOrder: 0,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
    ] as any);

    await expect(
      subcategoryService.batchSave("hh-1", "income", {
        subcategories: [
          { id: "sub-1", name: "Salary", sortOrder: 0 },
          { id: "sub-other", name: "Other", sortOrder: 1 },
        ],
        reassignments: [{ fromSubcategoryId: "sub-foreign", toSubcategoryId: "sub-1" }],
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts subcategory.service`
Expected: FAIL — "subcategoryService.batchSave is not a function"

- [ ] **Step 3: Write minimal implementation**

Add to the imports at the top of `apps/backend/src/services/subcategory.service.ts`:

```typescript
import type { WaterfallTier, BatchSaveSubcategoriesInput } from "@finplan/shared";
```

(Replace the existing `import type { WaterfallTier } from "@finplan/shared";`)

Add to the `subcategoryService` object:

```typescript
  async batchSave(
    householdId: string,
    tier: WaterfallTier,
    input: BatchSaveSubcategoriesInput
  ) {
    const { subcategories: desired, reassignments } = input;

    // ── Validation ────────────────────────────────────────────────────────────
    if (desired.length > 7) {
      throw new Error("Maximum 7 subcategories per tier");
    }

    // Other must be present
    const otherEntry = desired.find((s) => s.name === "Other");
    if (!otherEntry) {
      throw new Error("'Other' subcategory must be present in every tier");
    }

    // Other must be last by sortOrder
    const maxSort = Math.max(...desired.map((s) => s.sortOrder));
    if (otherEntry.sortOrder !== maxSort) {
      throw new Error("'Other' must be last in sort order");
    }

    // No new subcategory named "Other" (case-insensitive) besides the existing one
    const otherDuplicates = desired.filter(
      (s) => s.name.toLowerCase() === "other" && s !== otherEntry
    );
    if (otherDuplicates.length > 0) {
      throw new Error("The name 'Other' is reserved");
    }

    // Unique names (case-insensitive)
    const lowerNames = desired.map((s) => s.name.toLowerCase());
    if (new Set(lowerNames).size !== lowerNames.length) {
      throw new Error("Subcategory names must be unique within a tier");
    }

    // Fetch current state
    const existing = await prisma.subcategory.findMany({
      where: { householdId, tier },
    });
    const existingById = new Map(existing.map((s) => [s.id, s]));

    // Check locked subcategories are not renamed or removed
    for (const ex of existing) {
      if (!ex.isLocked) continue;
      const match = desired.find((d) => d.id === ex.id);
      if (!match) {
        throw new Error(`Cannot remove locked subcategory "${ex.name}"`);
      }
      if (match.name !== ex.name) {
        throw new Error(`Cannot rename locked subcategory "${ex.name}"`);
      }
    }

    // Validate reassignment IDs belong to this household's tier
    const existingIds = new Set(existing.map((s) => s.id));
    const desiredIds = new Set(desired.filter((d) => d.id).map((d) => d.id!));
    for (const r of reassignments) {
      if (!existingIds.has(r.fromSubcategoryId)) {
        throw new Error(`Reassignment source "${r.fromSubcategoryId}" not found in household`);
      }
      if (!desiredIds.has(r.toSubcategoryId) && !existingIds.has(r.toSubcategoryId)) {
        throw new Error(`Reassignment destination "${r.toSubcategoryId}" not found`);
      }
    }

    // ── Apply in transaction ──────────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      const itemModel =
        tier === "income"
          ? tx.incomeSource
          : tier === "committed"
            ? tx.committedItem
            : tx.discretionaryItem;

      // 1. Reassign items from removed subcategories
      for (const r of reassignments) {
        await (itemModel as any).updateMany({
          where: { subcategoryId: r.fromSubcategoryId, householdId },
          data: { subcategoryId: r.toSubcategoryId },
        });
      }

      // 2. Delete removed subcategories
      const removedIds = existing
        .filter((ex) => !desired.some((d) => d.id === ex.id))
        .map((ex) => ex.id);
      for (const id of removedIds) {
        await tx.subcategory.delete({ where: { id } });
      }

      // 3. Update existing subcategories
      for (const d of desired) {
        if (d.id && existingById.has(d.id)) {
          await tx.subcategory.update({
            where: { id: d.id },
            data: { name: d.name, sortOrder: d.sortOrder },
          });
        }
      }

      // 4. Create new subcategories
      for (const d of desired) {
        if (!d.id) {
          await tx.subcategory.create({
            data: {
              householdId,
              tier,
              name: d.name,
              sortOrder: d.sortOrder,
              isLocked: false,
              isDefault: false,
            },
          });
        }
      }
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts subcategory.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/subcategory.service.ts apps/backend/src/services/subcategory.service.test.ts
git commit -m "feat(backend): add batchSave to subcategory service with validation"
```

---

### Task 4: Backend service — resetToDefaults

**Files:**

- Modify: `apps/backend/src/services/subcategory.service.ts`
- Modify: `apps/backend/src/services/subcategory.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Append to apps/backend/src/services/subcategory.service.test.ts

describe("subcategoryService.resetToDefaults", () => {
  it("deletes non-default subcategories, reassigns items, and restores defaults", async () => {
    // Current state: one custom subcategory, one renamed default
    const existing = [
      {
        id: "sub-custom",
        householdId: "hh-1",
        tier: "income",
        name: "Custom",
        sortOrder: 0,
        isLocked: false,
        isDefault: false,
      },
      {
        id: "sub-salary",
        householdId: "hh-1",
        tier: "income",
        name: "Wages",
        sortOrder: 1,
        isLocked: false,
        isDefault: true,
      },
      {
        id: "sub-other-i",
        householdId: "hh-1",
        tier: "income",
        name: "Other",
        sortOrder: 2,
        isLocked: false,
        isDefault: true,
      },
    ];
    // Return income subs on first call, empty for other tiers
    prismaMock.subcategory.findMany
      .mockResolvedValueOnce(existing as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    prismaMock.incomeSource.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.subcategory.deleteMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 3 } as any);

    await subcategoryService.resetToDefaults("hh-1", {
      reassignments: [{ fromSubcategoryId: "sub-custom", toSubcategoryId: "sub-other-i" }],
    });

    // Should reassign items
    expect(prismaMock.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { subcategoryId: "sub-custom", householdId: "hh-1" },
      data: { subcategoryId: "sub-other-i" },
    });

    // Should delete all existing subcategories for each tier
    expect(prismaMock.subcategory.deleteMany).toHaveBeenCalled();

    // Should re-seed defaults
    expect(prismaMock.subcategory.createMany).toHaveBeenCalled();
  });

  it("validates reassignment source IDs exist in the household", async () => {
    prismaMock.subcategory.findMany
      .mockResolvedValueOnce([
        {
          id: "sub-1",
          householdId: "hh-1",
          tier: "income",
          name: "Salary",
          sortOrder: 0,
          isLocked: false,
          isDefault: true,
        },
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await expect(
      subcategoryService.resetToDefaults("hh-1", {
        reassignments: [{ fromSubcategoryId: "sub-foreign", toSubcategoryId: "sub-1" }],
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts subcategory.service`
Expected: FAIL — "subcategoryService.resetToDefaults is not a function"

- [ ] **Step 3: Write minimal implementation**

Add import at top of `apps/backend/src/services/subcategory.service.ts`:

```typescript
import type {
  WaterfallTier,
  BatchSaveSubcategoriesInput,
  ResetSubcategoriesInput,
} from "@finplan/shared";
```

(Replace the previous import line.)

Add to the `subcategoryService` object:

```typescript
  getDefaults() {
    return DEFAULT_SUBCATEGORIES;
  },

  async resetToDefaults(householdId: string, input: ResetSubcategoriesInput) {
    const { reassignments } = input;
    const tiers = ["income", "committed", "discretionary"] as const;

    // Fetch all existing subcategories across all tiers
    const allExisting: Array<{ id: string; tier: string; householdId: string }> = [];
    for (const tier of tiers) {
      const subs = await prisma.subcategory.findMany({
        where: { householdId, tier },
      });
      allExisting.push(...subs);
    }
    const existingIds = new Set(allExisting.map((s) => s.id));

    // Validate reassignment source IDs
    for (const r of reassignments) {
      if (!existingIds.has(r.fromSubcategoryId)) {
        throw new Error(`Reassignment source "${r.fromSubcategoryId}" not found in household`);
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Reassign items for each reassignment
      for (const r of reassignments) {
        const source = allExisting.find((s) => s.id === r.fromSubcategoryId);
        if (!source) continue;
        const tier = source.tier as WaterfallTier;
        const itemModel =
          tier === "income"
            ? tx.incomeSource
            : tier === "committed"
              ? tx.committedItem
              : tx.discretionaryItem;

        await (itemModel as any).updateMany({
          where: { subcategoryId: r.fromSubcategoryId, householdId },
          data: { subcategoryId: r.toSubcategoryId },
        });
      }

      // 2. Delete all existing subcategories across all tiers
      await tx.subcategory.deleteMany({ where: { householdId } });

      // 3. Re-seed defaults
      const rows: Array<{
        householdId: string;
        tier: "income" | "committed" | "discretionary";
        name: string;
        sortOrder: number;
        isLocked: boolean;
        isDefault: boolean;
      }> = [];
      for (const [tier, subs] of Object.entries(DEFAULT_SUBCATEGORIES)) {
        for (const sub of subs) {
          rows.push({
            householdId,
            tier: tier as "income" | "committed" | "discretionary",
            name: sub.name,
            sortOrder: sub.sortOrder,
            isLocked: "isLocked" in sub ? sub.isLocked : false,
            isDefault: true,
          });
        }
      }
      await tx.subcategory.createMany({ data: rows });
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts subcategory.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/subcategory.service.ts apps/backend/src/services/subcategory.service.test.ts
git commit -m "feat(backend): add resetToDefaults to subcategory service"
```

---

### Task 5: Backend routes — subcategory mutation endpoints

**Files:**

- Modify: `apps/backend/src/routes/waterfall.routes.ts`
- Modify: `apps/backend/src/routes/waterfall.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Append to apps/backend/src/routes/waterfall.routes.test.ts
// (The subcategoryServiceMock at the top of the file also needs updating — see Step 3)

describe("PUT /api/waterfall/subcategories/:tier", () => {
  it("saves subcategories for a valid tier", async () => {
    subcategoryServiceMock.batchSave.mockResolvedValue(undefined as any);
    subcategoryServiceMock.listByTier.mockResolvedValue([
      { id: "sub-1", name: "Salary", sortOrder: 0 },
      { id: "sub-2", name: "Other", sortOrder: 1 },
    ] as any);

    const res = await app.inject({
      method: "PUT",
      url: "/api/waterfall/subcategories/income",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        subcategories: [
          { id: "sub-1", name: "Employment", sortOrder: 0 },
          { id: "sub-2", name: "Other", sortOrder: 1 },
        ],
        reassignments: [],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(subcategoryServiceMock.batchSave).toHaveBeenCalledWith("hh-1", "income", {
      subcategories: [
        { id: "sub-1", name: "Employment", sortOrder: 0 },
        { id: "sub-2", name: "Other", sortOrder: 1 },
      ],
      reassignments: [],
    });
  });

  it("returns 400 for invalid tier", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/waterfall/subcategories/surplus",
      headers: { authorization: "Bearer valid-token" },
      payload: { subcategories: [], reassignments: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/waterfall/subcategories/income",
      headers: { authorization: "Bearer valid-token" },
      payload: { subcategories: "not-an-array" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/waterfall/subcategories/:tier/counts", () => {
  it("returns item counts for a tier", async () => {
    subcategoryServiceMock.getItemCounts.mockResolvedValue({
      "sub-1": 3,
      "sub-2": 1,
    } as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/subcategories/income/counts",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ "sub-1": 3, "sub-2": 1 });
  });

  it("returns 400 for invalid tier", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/waterfall/subcategories/surplus/counts",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/waterfall/subcategories/reset", () => {
  it("resets subcategories to defaults", async () => {
    subcategoryServiceMock.resetToDefaults.mockResolvedValue(undefined as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/waterfall/subcategories/reset",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        reassignments: [{ fromSubcategoryId: "sub-custom", toSubcategoryId: "sub-other" }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(subcategoryServiceMock.resetToDefaults).toHaveBeenCalledWith("hh-1", {
      reassignments: [{ fromSubcategoryId: "sub-custom", toSubcategoryId: "sub-other" }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: FAIL — 404 for PUT route (not registered yet)

- [ ] **Step 3: Write minimal implementation**

First, update the `subcategoryServiceMock` in `apps/backend/src/routes/waterfall.routes.test.ts` to add the new methods:

```typescript
const subcategoryServiceMock = {
  ensureSubcategories: mock(() => Promise.resolve()),
  listByTier: mock(() => Promise.resolve([])),
  seedDefaults: mock(() => Promise.resolve()),
  getDefaultSubcategoryId: mock(() => Promise.resolve("sub-other")),
  getSubcategoryIdByName: mock(() => Promise.resolve(null)),
  batchSave: mock(() => Promise.resolve()),
  getItemCounts: mock(() => Promise.resolve({})),
  resetToDefaults: mock(() => Promise.resolve()),
  getDefaults: mock(() => ({
    income: [
      { name: "Salary", sortOrder: 0 },
      { name: "Dividends", sortOrder: 1 },
      { name: "Other", sortOrder: 2 },
    ],
    committed: [],
    discretionary: [],
  })),
};
```

Then add to `apps/backend/src/routes/waterfall.routes.ts`, add the imports at the top:

```typescript
import {
  // ... existing imports ...
  batchSaveSubcategoriesSchema,
  resetSubcategoriesSchema,
} from "@finplan/shared";
```

Add the new routes before the closing `}` of the `waterfallRoutes` function, after the existing `GET /subcategories/:tier` route:

```typescript
// ─── Subcategory mutations ──────────────────────────────────────────────────

fastify.get("/subcategories/:tier/counts", pre, async (req, reply) => {
  const { tier } = req.params as { tier: string };
  const parsed = WaterfallTierEnum.safeParse(tier);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid tier" });
  }
  const counts = await subcategoryService.getItemCounts(req.householdId!, parsed.data);
  return reply.send(counts);
});

fastify.put("/subcategories/:tier", pre, async (req, reply) => {
  const { tier } = req.params as { tier: string };
  const tierParsed = WaterfallTierEnum.safeParse(tier);
  if (!tierParsed.success) {
    return reply.status(400).send({ error: "Invalid tier" });
  }
  const bodyParsed = batchSaveSubcategoriesSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return reply.status(400).send({ error: bodyParsed.error.message });
  }
  try {
    await subcategoryService.batchSave(req.householdId!, tierParsed.data, bodyParsed.data);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message });
  }
  const updated = await subcategoryService.listByTier(req.householdId!, tierParsed.data);
  return reply.send(updated);
});

fastify.post("/subcategories/reset", pre, async (req, reply) => {
  const bodyParsed = resetSubcategoriesSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return reply.status(400).send({ error: bodyParsed.error.message });
  }
  try {
    await subcategoryService.resetToDefaults(req.householdId!, bodyParsed.data);
  } catch (err: any) {
    return reply.status(400).send({ error: err.message });
  }
  return reply.send({ success: true });
});
```

**Route ordering note:** Fastify's radix tree router distinguishes HTTP methods, so `POST /subcategories/reset` won't conflict with `GET /subcategories/:tier`. However, register the new routes **after** the existing `GET /subcategories/:tier` route for readability — group all subcategory mutations together.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts waterfall.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/waterfall.routes.ts apps/backend/src/routes/waterfall.routes.test.ts
git commit -m "feat(backend): add subcategory batch save, item counts, and reset routes"
```

---

### Task 6: Install @dnd-kit frontend dependency

**Files:**

- Modify: `apps/frontend/package.json`

- [ ] **Step 1: Install dependency**

```bash
cd apps/frontend && bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/package.json bun.lock
git commit -m "chore(frontend): add @dnd-kit for drag-and-drop subcategory reordering"
```

---

### Task 7: Frontend service — subcategory mutation methods

**Files:**

- Modify: `apps/frontend/src/services/waterfall.service.ts`

- [ ] **Step 1: Write minimal implementation**

Add to the `waterfallService` object in `apps/frontend/src/services/waterfall.service.ts`:

```typescript
  // Subcategory mutations
  getSubcategoryCounts: (tier: "income" | "committed" | "discretionary") =>
    apiClient.get<Record<string, number>>(`/api/waterfall/subcategories/${tier}/counts`),

  saveSubcategories: (
    tier: "income" | "committed" | "discretionary",
    data: import("@finplan/shared").BatchSaveSubcategoriesInput
  ) =>
    apiClient.put<SubcategoryRow[]>(`/api/waterfall/subcategories/${tier}`, data),

  resetSubcategories: (data: import("@finplan/shared").ResetSubcategoriesInput) =>
    apiClient.post<{ success: boolean }>("/api/waterfall/subcategories/reset", data),

  getDefaults: () =>
    ({ income: 3, committed: 7, discretionary: 6 }), // capacity reference only — actual defaults are server-side
```

Add the import at the top:

```typescript
import type {
  // ... existing imports ...
  BatchSaveSubcategoriesInput,
  ResetSubcategoriesInput,
} from "@finplan/shared";
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/services/waterfall.service.ts
git commit -m "feat(frontend): add subcategory mutation API methods"
```

---

### Task 8: Frontend hooks — useSubcategoryMutations

**Files:**

- Create: `apps/frontend/src/hooks/useSubcategorySettings.ts`
- Create: `apps/frontend/src/hooks/useSubcategorySettings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/hooks/useSubcategorySettings.test.ts
import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockSaveSubcategories = mock(async () => []);
const mockGetSubcategoryCounts = mock(async () => ({}));
const mockResetSubcategories = mock(async () => ({ success: true }));

mock.module("@/services/waterfall.service", () => ({
  waterfallService: {
    getSubcategories: mock(async () => []),
    getSubcategoryCounts: mockGetSubcategoryCounts,
    saveSubcategories: mockSaveSubcategories,
    resetSubcategories: mockResetSubcategories,
  },
}));

const { useSubcategoryCounts, useSaveSubcategories, useResetSubcategories } =
  await import("./useSubcategorySettings");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSubcategoryCounts", () => {
  it("fetches item counts for a tier", async () => {
    mockGetSubcategoryCounts.mockResolvedValue({ "sub-1": 3 });
    const { result } = renderHook(() => useSubcategoryCounts("income"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ "sub-1": 3 });
  });
});

describe("useSaveSubcategories", () => {
  it("calls saveSubcategories and invalidates queries", async () => {
    mockSaveSubcategories.mockResolvedValue([]);
    const { result } = renderHook(() => useSaveSubcategories(), { wrapper });

    await act(async () => {
      result.current.mutate({
        tier: "income",
        data: { subcategories: [{ name: "Other", sortOrder: 0 }], reassignments: [] },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSaveSubcategories).toHaveBeenCalled();
  });
});

describe("useResetSubcategories", () => {
  it("calls resetSubcategories", async () => {
    mockResetSubcategories.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useResetSubcategories(), { wrapper });

    await act(async () => {
      result.current.mutate({ reassignments: [] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockResetSubcategories).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useSubcategorySettings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/hooks/useSubcategorySettings.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { waterfallService } from "@/services/waterfall.service";
import { WATERFALL_KEYS } from "./useWaterfall";
import type {
  BatchSaveSubcategoriesInput,
  ResetSubcategoriesInput,
  WaterfallTier,
} from "@finplan/shared";

export const SUBCATEGORY_SETTINGS_KEYS = {
  counts: (tier: string) => ["subcategory-counts", tier] as const,
};

export function useSubcategoryCounts(tier: WaterfallTier) {
  return useQuery({
    queryKey: SUBCATEGORY_SETTINGS_KEYS.counts(tier),
    queryFn: () => waterfallService.getSubcategoryCounts(tier),
  });
}

export function useSaveSubcategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tier, data }: { tier: WaterfallTier; data: BatchSaveSubcategoriesInput }) =>
      waterfallService.saveSubcategories(tier, data),
    onSuccess: (_data, { tier }) => {
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.subcategories(tier) });
      void qc.invalidateQueries({ queryKey: SUBCATEGORY_SETTINGS_KEYS.counts(tier) });
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.summary });
    },
  });
}

export function useResetSubcategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ResetSubcategoriesInput) => waterfallService.resetSubcategories(data),
    onSuccess: () => {
      // Invalidate all tiers
      for (const tier of ["income", "committed", "discretionary"]) {
        void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.subcategories(tier) });
        void qc.invalidateQueries({ queryKey: SUBCATEGORY_SETTINGS_KEYS.counts(tier) });
      }
      void qc.invalidateQueries({ queryKey: WATERFALL_KEYS.summary });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useSubcategorySettings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useSubcategorySettings.ts apps/frontend/src/hooks/useSubcategorySettings.test.ts
git commit -m "feat(frontend): add hooks for subcategory settings mutations"
```

---

### Task 9: Frontend component — SubcategoryRow

**Files:**

- Create: `apps/frontend/src/components/settings/SubcategoryRow.tsx`
- Create: `apps/frontend/src/components/settings/SubcategoryRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/settings/SubcategoryRow.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";

const { SubcategoryRow } = await import("./SubcategoryRow");

describe("SubcategoryRow", () => {
  const defaultProps = {
    id: "sub-1",
    name: "Housing",
    isLocked: false,
    isOther: false,
    onNameChange: mock(() => {}),
    onRemove: mock(() => {}),
  };

  it("renders an editable text input for non-locked, non-Other rows", () => {
    render(createElement(SubcategoryRow, defaultProps));
    const input = screen.getByDisplayValue("Housing");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).disabled).toBe(false);
  });

  it("renders read-only for Other subcategory", () => {
    render(createElement(SubcategoryRow, { ...defaultProps, isOther: true }));
    const input = screen.getByDisplayValue("Housing");
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it("renders read-only for locked subcategory", () => {
    render(createElement(SubcategoryRow, { ...defaultProps, isLocked: true }));
    const input = screen.getByDisplayValue("Housing");
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it("hides remove button for Other and locked rows", () => {
    const { container: c1 } = render(
      createElement(SubcategoryRow, { ...defaultProps, isOther: true })
    );
    expect(c1.querySelector("[data-testid='remove-sub']")).toBeNull();

    const { container: c2 } = render(
      createElement(SubcategoryRow, { ...defaultProps, isLocked: true })
    );
    expect(c2.querySelector("[data-testid='remove-sub']")).toBeNull();
  });

  it("calls onNameChange when input changes", () => {
    const onNameChange = mock(() => {});
    render(createElement(SubcategoryRow, { ...defaultProps, onNameChange }));
    const input = screen.getByDisplayValue("Housing");
    fireEvent.change(input, { target: { value: "Accommodation" } });
    expect(onNameChange).toHaveBeenCalledWith("Accommodation");
  });

  it("calls onRemove when remove button clicked", () => {
    const onRemove = mock(() => {});
    render(createElement(SubcategoryRow, { ...defaultProps, onRemove }));
    const btn = screen.getByTestId("remove-sub");
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SubcategoryRow.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/components/settings/SubcategoryRow.tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SubcategoryRowProps {
  id: string;
  name: string;
  isLocked: boolean;
  isOther: boolean;
  error?: string;
  onNameChange: (name: string) => void;
  onRemove: () => void;
}

export function SubcategoryRow({
  id,
  name,
  isLocked,
  isOther,
  error,
  onNameChange,
  onRemove,
}: SubcategoryRowProps) {
  const isReadOnly = isLocked || isOther;
  const isDraggable = !isOther;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-1.5"
    >
      {isDraggable ? (
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${name}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-4" /> // spacer
      )}

      <div className="flex-1">
        <Input
          value={name}
          disabled={isReadOnly}
          maxLength={24}
          onChange={(e) => onNameChange(e.target.value)}
          className={`h-8 text-sm ${error ? "border-destructive" : ""} ${isReadOnly ? "opacity-60" : ""}`}
          aria-label={`Subcategory name: ${name}`}
        />
        {error && (
          <p className="text-xs text-destructive mt-0.5">{error}</p>
        )}
      </div>

      {!isReadOnly && (
        <button
          type="button"
          data-testid="remove-sub"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label={`Remove ${name}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SubcategoryRow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SubcategoryRow.tsx apps/frontend/src/components/settings/SubcategoryRow.test.tsx
git commit -m "feat(frontend): add SubcategoryRow component with drag handle and inline edit"
```

---

### Task 10: Frontend component — ReassignmentPrompt

**Files:**

- Create: `apps/frontend/src/components/settings/ReassignmentPrompt.tsx`
- Create: `apps/frontend/src/components/settings/ReassignmentPrompt.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/settings/ReassignmentPrompt.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";

const { ReassignmentPrompt } = await import("./ReassignmentPrompt");

describe("ReassignmentPrompt", () => {
  const defaultProps = {
    isOpen: true,
    subcategoryName: "Utilities",
    itemCount: 3,
    destinations: [
      { id: "sub-1", name: "Housing" },
      { id: "sub-other", name: "Other" },
    ],
    onConfirm: mock(() => {}),
    onCancel: mock(() => {}),
  };

  it("shows the item count and subcategory name", () => {
    render(createElement(ReassignmentPrompt, defaultProps));
    expect(screen.getByText(/3 items/i)).toBeDefined();
    expect(screen.getByText(/Utilities/)).toBeDefined();
  });

  it("disables confirm button until a destination is selected", () => {
    render(createElement(ReassignmentPrompt, defaultProps));
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = mock(() => {});
    render(createElement(ReassignmentPrompt, { ...defaultProps, onCancel }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ReassignmentPrompt.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/components/settings/ReassignmentPrompt.tsx
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

interface ReassignmentPromptProps {
  isOpen: boolean;
  subcategoryName: string;
  itemCount: number;
  destinations: Array<{ id: string; name: string }>;
  onConfirm: (destinationId: string) => void;
  onCancel: () => void;
}

export function ReassignmentPrompt({
  isOpen,
  subcategoryName,
  itemCount,
  destinations,
  onConfirm,
  onCancel,
}: ReassignmentPromptProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reassign items</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{subcategoryName}</strong> has {itemCount} item{itemCount !== 1 ? "s" : ""}.
            Choose where to move them before removing this subcategory.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Select destination..." />
            </SelectTrigger>
            <SelectContent>
              {destinations.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!selectedId}
            onClick={() => {
              onConfirm(selectedId);
              setSelectedId("");
            }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ReassignmentPrompt.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/ReassignmentPrompt.tsx apps/frontend/src/components/settings/ReassignmentPrompt.test.tsx
git commit -m "feat(frontend): add ReassignmentPrompt dialog for subcategory removal"
```

---

### Task 11: Frontend component — ResetConfirmationModal

**Files:**

- Create: `apps/frontend/src/components/settings/ResetConfirmationModal.tsx`
- Create: `apps/frontend/src/components/settings/ResetConfirmationModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/settings/ResetConfirmationModal.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";

const { ResetConfirmationModal } = await import("./ResetConfirmationModal");

describe("ResetConfirmationModal", () => {
  const defaultProps = {
    isOpen: true,
    nonDefaultSubs: [
      { id: "sub-custom", tier: "income" as const, name: "Custom Income", itemCount: 2 },
      { id: "sub-empty", tier: "committed" as const, name: "Empty Custom", itemCount: 0 },
    ],
    defaultDestinations: {
      income: [{ id: "sub-other-i", name: "Other" }],
      committed: [{ id: "sub-other-c", name: "Other" }],
      discretionary: [{ id: "sub-other-d", name: "Other" }],
    },
    onConfirm: mock(() => {}),
    onCancel: mock(() => {}),
    isLoading: false,
  };

  it("shows subcategories with items requiring reassignment", () => {
    render(createElement(ResetConfirmationModal, defaultProps));
    expect(screen.getByText(/Custom Income/)).toBeDefined();
    expect(screen.getByText(/2 items/i)).toBeDefined();
  });

  it("shows subcategories with zero items as 'will be removed'", () => {
    render(createElement(ResetConfirmationModal, defaultProps));
    expect(screen.getByText(/will be removed/i)).toBeDefined();
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = mock(() => {});
    render(createElement(ResetConfirmationModal, { ...defaultProps, onCancel }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test ResetConfirmationModal.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/components/settings/ResetConfirmationModal.tsx
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
import type { WaterfallTier } from "@finplan/shared";

interface NonDefaultSub {
  id: string;
  tier: WaterfallTier;
  name: string;
  itemCount: number;
}

interface ResetConfirmationModalProps {
  isOpen: boolean;
  nonDefaultSubs: NonDefaultSub[];
  defaultDestinations: Record<WaterfallTier, Array<{ id: string; name: string }>>;
  onConfirm: (reassignments: Array<{ fromSubcategoryId: string; toSubcategoryId: string }>) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function ResetConfirmationModal({
  isOpen,
  nonDefaultSubs,
  defaultDestinations,
  onConfirm,
  onCancel,
  isLoading,
}: ResetConfirmationModalProps) {
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const subsWithItems = nonDefaultSubs.filter((s) => s.itemCount > 0);
  const subsWithoutItems = nonDefaultSubs.filter((s) => s.itemCount === 0);

  const allAssigned = subsWithItems.every((s) => assignments[s.id]);

  function handleConfirm() {
    const reassignments = subsWithItems
      .filter((s) => assignments[s.id])
      .map((s) => ({
        fromSubcategoryId: s.id,
        toSubcategoryId: assignments[s.id]!,
      }));
    onConfirm(reassignments);
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Reset subcategories to defaults</AlertDialogTitle>
          <AlertDialogDescription>
            This will restore all three tiers to their original subcategories.
            {nonDefaultSubs.length === 0 && " No custom subcategories found — defaults are already in place."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {subsWithItems.length > 0 && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              The following subcategories have items that need to be reassigned:
            </p>
            {subsWithItems.map((sub) => (
              <div key={sub.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{sub.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {sub.itemCount} item{sub.itemCount !== 1 ? "s" : ""} — {sub.tier}
                  </p>
                </div>
                <Select
                  value={assignments[sub.id] ?? ""}
                  onValueChange={(v) =>
                    setAssignments((prev) => ({ ...prev, [sub.id]: v }))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Move to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {defaultDestinations[sub.tier]?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {subsWithoutItems.length > 0 && (
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              The following will be removed (no items assigned):
            </p>
            <ul className="list-disc list-inside text-sm mt-1">
              {subsWithoutItems.map((sub) => (
                <li key={sub.id}>
                  {sub.name} <span className="text-muted-foreground">({sub.tier})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!allAssigned || isLoading}
            className="bg-attention hover:bg-attention/90 text-foreground"
          >
            {isLoading ? "Resetting..." : "Reset to defaults"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test ResetConfirmationModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/ResetConfirmationModal.tsx apps/frontend/src/components/settings/ResetConfirmationModal.test.tsx
git commit -m "feat(frontend): add ResetConfirmationModal for subcategory reset flow"
```

---

### Task 12: Frontend component — SubcategoriesSection

**Files:**

- Create: `apps/frontend/src/components/settings/SubcategoriesSection.tsx`
- Create: `apps/frontend/src/components/settings/SubcategoriesSection.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/settings/SubcategoriesSection.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockSubcategories = [
  {
    id: "sub-salary",
    householdId: "hh-1",
    tier: "income",
    name: "Salary",
    sortOrder: 0,
    isLocked: false,
    isDefault: true,
  },
  {
    id: "sub-div",
    householdId: "hh-1",
    tier: "income",
    name: "Dividends",
    sortOrder: 1,
    isLocked: false,
    isDefault: true,
  },
  {
    id: "sub-other",
    householdId: "hh-1",
    tier: "income",
    name: "Other",
    sortOrder: 2,
    isLocked: false,
    isDefault: true,
  },
];

mock.module("@/services/waterfall.service", () => ({
  waterfallService: {
    getSubcategories: mock(async () => mockSubcategories),
    getSubcategoryCounts: mock(async () => ({ "sub-salary": 2, "sub-div": 1 })),
    saveSubcategories: mock(async () => mockSubcategories),
    resetSubcategories: mock(async () => ({ success: true })),
  },
}));

// Mock useAuthStore
mock.module("@/stores/authStore", () => ({
  useAuthStore: mock((selector: any) =>
    selector({ user: { id: "u1", activeHouseholdId: "hh-1" } })
  ),
}));

const { SubcategoriesSection } = await import("./SubcategoriesSection");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("SubcategoriesSection", () => {
  it("renders three tier tabs", async () => {
    render(createElement(SubcategoriesSection), { wrapper });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /income/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /committed/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /discretionary/i })).toBeDefined();
    });
  });

  it("shows subcategory rows for the active tab", async () => {
    render(createElement(SubcategoriesSection), { wrapper });
    await waitFor(() => {
      expect(screen.getByDisplayValue("Salary")).toBeDefined();
      expect(screen.getByDisplayValue("Dividends")).toBeDefined();
      expect(screen.getByDisplayValue("Other")).toBeDefined();
    });
  });

  it("shows capacity indicator", async () => {
    render(createElement(SubcategoriesSection), { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/3 of 7/)).toBeDefined();
    });
  });

  it("disables Save button when no changes", async () => {
    render(createElement(SubcategoriesSection), { wrapper });
    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /save/i });
      expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SubcategoriesSection.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/components/settings/SubcategoriesSection.tsx
import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { useSubcategories } from "@/hooks/useWaterfall";
import {
  useSubcategoryCounts,
  useSaveSubcategories,
  useResetSubcategories,
} from "@/hooks/useSubcategorySettings";
import { SubcategoryRow } from "./SubcategoryRow";
import { ReassignmentPrompt } from "./ReassignmentPrompt";
import { ResetConfirmationModal } from "./ResetConfirmationModal";
import { Section } from "./Section";
import { TIER_CONFIGS, type TierKey } from "@/components/tier/tierConfig";
import type { SubcategoryRow as SubcategoryRowType, WaterfallTier } from "@finplan/shared";

const TIERS: TierKey[] = ["income", "committed", "discretionary"];
const MAX_PER_TIER = 7;

// Default subcategory names per tier — must match backend DEFAULT_SUBCATEGORIES
const DEFAULT_NAMES: Record<TierKey, string[]> = {
  income: ["Salary", "Dividends", "Other"],
  committed: ["Housing", "Utilities", "Services", "Charity", "Childcare", "Vehicles", "Other"],
  discretionary: ["Food", "Fun", "Clothes", "Gifts", "Savings", "Other"],
};

interface DraftSub {
  id?: string;
  name: string;
  sortOrder: number;
  isLocked: boolean;
  isOther: boolean;
  isDefault: boolean;
  tempId: string; // stable key for dnd
}

function toDraft(row: SubcategoryRowType): DraftSub {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isLocked: row.isLocked,
    isOther: row.name === "Other",
    isDefault: row.isDefault,
    tempId: row.id,
  };
}

let tempCounter = 0;

export function SubcategoriesSection() {
  const [activeTier, setActiveTier] = useState<TierKey>("income");
  const [drafts, setDrafts] = useState<Record<TierKey, DraftSub[] | null>>({
    income: null,
    committed: null,
    discretionary: null,
  });
  const [reassignments, setReassignments] = useState<
    Record<TierKey, Array<{ fromSubcategoryId: string; toSubcategoryId: string }>>
  >({ income: [], committed: [], discretionary: [] });
  const [pendingRemoval, setPendingRemoval] = useState<{
    sub: DraftSub;
    tier: TierKey;
  } | null>(null);
  const [showReset, setShowReset] = useState(false);

  // Queries
  const incomeQuery = useSubcategories("income");
  const committedQuery = useSubcategories("committed");
  const discretionaryQuery = useSubcategories("discretionary");
  const queries: Record<TierKey, typeof incomeQuery> = {
    income: incomeQuery,
    committed: committedQuery,
    discretionary: discretionaryQuery,
  };

  const countsQuery = useSubcategoryCounts(activeTier);
  const saveMutation = useSaveSubcategories();
  const resetMutation = useResetSubcategories();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Current draft for active tier (or server state)
  const serverSubs = queries[activeTier].data ?? [];
  const currentDraft = drafts[activeTier] ?? serverSubs.map(toDraft);
  const itemCounts = countsQuery.data ?? {};

  // Separate "Other" from sortable list
  const sortableItems = currentDraft.filter((s) => !s.isOther);
  const otherItem = currentDraft.find((s) => s.isOther);

  // Has unsaved changes?
  const hasChanges = useMemo(() => {
    for (const tier of TIERS) {
      if (drafts[tier] !== null) return true;
      if (reassignments[tier].length > 0) return true;
    }
    return false;
  }, [drafts, reassignments]);

  // Validation errors
  const errors = useMemo(() => {
    const errs: Record<string, string> = {};
    const names = currentDraft.map((s) => s.name.toLowerCase().trim());
    currentDraft.forEach((s, i) => {
      const trimmed = s.name.trim();
      if (!trimmed) {
        errs[s.tempId] = "Name cannot be empty";
      } else if (!s.isOther && trimmed.toLowerCase() === "other") {
        errs[s.tempId] = "'Other' is reserved";
      } else if (names.indexOf(trimmed.toLowerCase()) !== i) {
        errs[s.tempId] = "Duplicate name";
      }
    });
    return errs;
  }, [currentDraft]);

  const hasErrors = Object.keys(errors).length > 0;

  function updateDraft(tier: TierKey, updater: (prev: DraftSub[]) => DraftSub[]) {
    setDrafts((prev) => {
      const current = prev[tier] ?? (queries[tier].data ?? []).map(toDraft);
      return { ...prev, [tier]: updater(current) };
    });
  }

  function handleNameChange(tempId: string, name: string) {
    updateDraft(activeTier, (prev) =>
      prev.map((s) => (s.tempId === tempId ? { ...s, name } : s))
    );
  }

  function handleRemove(sub: DraftSub) {
    if (!sub.id) {
      // New unsaved subcategory — just remove from draft
      updateDraft(activeTier, (prev) => prev.filter((s) => s.tempId !== sub.tempId));
      return;
    }
    const count = itemCounts[sub.id] ?? 0;
    if (count > 0) {
      setPendingRemoval({ sub, tier: activeTier });
    } else {
      updateDraft(activeTier, (prev) => prev.filter((s) => s.tempId !== sub.tempId));
    }
  }

  function handleReassignmentConfirm(destinationId: string) {
    if (!pendingRemoval) return;
    const { sub, tier } = pendingRemoval;
    setReassignments((prev) => ({
      ...prev,
      [tier]: [
        ...prev[tier],
        { fromSubcategoryId: sub.id!, toSubcategoryId: destinationId },
      ],
    }));
    updateDraft(tier, (prev) => prev.filter((s) => s.tempId !== sub.tempId));
    setPendingRemoval(null);
  }

  function handleAdd() {
    if (currentDraft.length >= MAX_PER_TIER) return;
    tempCounter++;
    const newSub: DraftSub = {
      name: "",
      sortOrder: currentDraft.length - 1, // before Other
      isLocked: false,
      isOther: false,
      isDefault: false,
      tempId: `new-${tempCounter}`,
    };
    updateDraft(activeTier, (prev) => {
      // Insert before Other
      const withoutOther = prev.filter((s) => !s.isOther);
      const other = prev.find((s) => s.isOther);
      return [...withoutOther, newSub, ...(other ? [other] : [])];
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    updateDraft(activeTier, (prev) => {
      const withoutOther = prev.filter((s) => !s.isOther);
      const other = prev.find((s) => s.isOther);
      const oldIndex = withoutOther.findIndex((s) => s.tempId === active.id);
      const newIndex = withoutOther.findIndex((s) => s.tempId === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = [...withoutOther];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved!);

      // Rebuild with updated sortOrders
      return [
        ...reordered.map((s, i) => ({ ...s, sortOrder: i })),
        ...(other ? [{ ...other, sortOrder: reordered.length }] : []),
      ];
    });
  }

  function handleDiscard() {
    setDrafts({ income: null, committed: null, discretionary: null });
    setReassignments({ income: [], committed: [], discretionary: [] });
  }

  async function handleSave() {
    // Save each tier that has changes
    for (const tier of TIERS) {
      const draft = drafts[tier];
      if (!draft && reassignments[tier].length === 0) continue;

      const subs = (draft ?? (queries[tier].data ?? []).map(toDraft)).map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        name: s.name.trim(),
        sortOrder: s.sortOrder,
      }));

      try {
        await saveMutation.mutateAsync({
          tier,
          data: { subcategories: subs, reassignments: reassignments[tier] },
        });
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to save subcategories");
        return;
      }
    }
    toast.success("Subcategories updated");
    handleDiscard();
  }

  const handleResetConfirm = useCallback(
    async (resetReassignments: Array<{ fromSubcategoryId: string; toSubcategoryId: string }>) => {
      try {
        await resetMutation.mutateAsync({ reassignments: resetReassignments });
        toast.success("Subcategories reset to defaults");
        setShowReset(false);
        handleDiscard();
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to reset subcategories");
      }
    },
    [resetMutation]
  );

  // Build data for reset modal
  const allSubsForReset = useMemo(() => {
    const result: Array<{
      id: string;
      tier: WaterfallTier;
      name: string;
      itemCount: number;
    }> = [];
    for (const tier of TIERS) {
      const subs = queries[tier].data ?? [];
      const defaults = DEFAULT_NAMES[tier];
      for (const sub of subs) {
        if (!defaults.includes(sub.name)) {
          result.push({
            id: sub.id,
            tier,
            name: sub.name,
            itemCount: 0, // Will be enriched when modal opens
          });
        }
      }
    }
    return result;
  }, [queries.income.data, queries.committed.data, queries.discretionary.data]);

  // Build default destinations for reset — "Other" in each tier
  const defaultDestinations = useMemo(() => {
    const result: Record<TierKey, Array<{ id: string; name: string }>> = {
      income: [],
      committed: [],
      discretionary: [],
    };
    for (const tier of TIERS) {
      const subs = queries[tier].data ?? [];
      const defaults = DEFAULT_NAMES[tier];
      // Include existing subs that match default names as destinations
      for (const sub of subs) {
        if (defaults.includes(sub.name)) {
          result[tier].push({ id: sub.id, name: sub.name });
        }
      }
      // If no Other found, we'll still show available defaults
      if (result[tier].length === 0) {
        // Fallback — shouldn't happen since Other is always present
        result[tier].push({ id: "", name: "Other" });
      }
    }
    return result;
  }, [queries.income.data, queries.committed.data, queries.discretionary.data]);

  // Reassignment prompt destinations
  const reassignmentDestinations = useMemo(() => {
    return currentDraft
      .filter(
        (s) =>
          s.tempId !== pendingRemoval?.sub.tempId &&
          // Exclude subs also marked for removal in current reassignments
          !reassignments[activeTier].some((r) => r.fromSubcategoryId === s.id)
      )
      .map((s) => ({ id: s.id ?? s.tempId, name: s.name }));
  }, [currentDraft, pendingRemoval, reassignments, activeTier]);

  const isLoading = queries[activeTier].isLoading || countsQuery.isLoading;

  return (
    <Section id="subcategories" title="Subcategories">
      <p className="text-sm text-muted-foreground">
        Customise the subcategories for each waterfall tier. Changes are saved together.
      </p>

      <Tabs value={activeTier} onValueChange={(v) => setActiveTier(v as TierKey)}>
        <TabsList>
          {TIERS.map((tier) => (
            <TabsTrigger key={tier} value={tier} className={TIER_CONFIGS[tier].textClass}>
              {TIER_CONFIGS[tier].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TIERS.map((tier) => (
          <TabsContent key={tier} value={tier}>
            {isLoading ? (
              <SkeletonLoader variant="right-panel" />
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {currentDraft.length} of {MAX_PER_TIER} used
                </p>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortableItems.map((s) => s.tempId)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sortableItems.map((sub) => (
                      <SubcategoryRow
                        key={sub.tempId}
                        id={sub.tempId}
                        name={sub.name}
                        isLocked={sub.isLocked}
                        isOther={false}
                        error={errors[sub.tempId]}
                        onNameChange={(name) => handleNameChange(sub.tempId, name)}
                        onRemove={() => handleRemove(sub)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {otherItem && (
                  <SubcategoryRow
                    id={otherItem.tempId}
                    name={otherItem.name}
                    isLocked={false}
                    isOther={true}
                    onNameChange={() => {}}
                    onRemove={() => {}}
                  />
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={currentDraft.length >= MAX_PER_TIER}
                  onClick={handleAdd}
                >
                  Add subcategory
                </Button>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Save / Discard buttons */}
      <div className="flex gap-2 mt-4">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges || hasErrors || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDiscard}
          disabled={!hasChanges}
        >
          Discard changes
        </Button>
      </div>

      {/* Reset to defaults */}
      <div className="mt-6 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowReset(true)}
          className="text-muted-foreground"
        >
          Reset to defaults
        </Button>
        <p className="text-xs text-muted-foreground mt-1">
          Restores all tiers to the original subcategory set. Items will be reassigned.
        </p>
      </div>

      {/* Reassignment prompt */}
      {pendingRemoval && (
        <ReassignmentPrompt
          isOpen={true}
          subcategoryName={pendingRemoval.sub.name}
          itemCount={itemCounts[pendingRemoval.sub.id!] ?? 0}
          destinations={reassignmentDestinations}
          onConfirm={handleReassignmentConfirm}
          onCancel={() => setPendingRemoval(null)}
        />
      )}

      {/* Reset confirmation modal */}
      <ResetConfirmationModal
        isOpen={showReset}
        nonDefaultSubs={allSubsForReset}
        defaultDestinations={defaultDestinations}
        onConfirm={handleResetConfirm}
        onCancel={() => setShowReset(false)}
        isLoading={resetMutation.isPending}
      />
    </Section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SubcategoriesSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SubcategoriesSection.tsx apps/frontend/src/components/settings/SubcategoriesSection.test.tsx
git commit -m "feat(frontend): add SubcategoriesSection with tier tabs, dnd reorder, and save flow"
```

---

### Task 13: Integrate SubcategoriesSection into SettingsPage

**Files:**

- Modify: `apps/frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write the failing test**

No separate test — this is a wiring task verified by existing SettingsPage tests and the final integration test.

- [ ] **Step 2: Write implementation**

Add the import at the top of `apps/frontend/src/pages/SettingsPage.tsx`:

```typescript
import { SubcategoriesSection } from "@/components/settings/SubcategoriesSection";
```

Add `"subcategories"` to the `SECTIONS` array (after `"display"` and before `"staleness"`):

```typescript
{ id: "subcategories", label: "Subcategories" },
```

Add the section in the JSX content area (after `DisplaySection` and before `StalenessSection`):

```tsx
<div ref={setRef("subcategories")} data-section-id="subcategories">
  <SubcategoriesSection />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/SettingsPage.tsx
git commit -m "feat(frontend): wire SubcategoriesSection into Settings page"
```

---

### Task 14: Update mock objects in test files

**Files:**

- Modify: `apps/backend/src/routes/waterfall.routes.test.ts` (already done in Task 5 — verify)
- Modify: `apps/backend/src/test/mocks/prisma.ts` (add `groupBy` to mock builder if missing)

- [ ] **Step 1: Check prisma mock has groupBy**

The `buildModelMock()` function in `apps/backend/src/test/mocks/prisma.ts` already includes `groupBy`. No change needed.

- [ ] **Step 2: Verify all backend tests pass**

Run: `cd apps/backend && bun scripts/run-tests.ts`
Expected: PASS (all suites)

- [ ] **Step 3: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(backend): ensure all mock objects include new subcategory service methods"
```

---

## Testing

### Backend Tests

- [ ] Service: `getItemCounts` returns correct counts grouped by subcategoryId for each tier
- [ ] Service: `batchSave` creates, updates, and deletes subcategories in a single transaction
- [ ] Service: `batchSave` rejects if "Other" is missing, renamed, not last, or if names duplicate
- [ ] Service: `batchSave` rejects modification of locked subcategories
- [ ] Service: `batchSave` reassigns items before deleting removed subcategories
- [ ] Service: `resetToDefaults` reassigns items, deletes all, and re-seeds defaults
- [ ] Endpoint: `PUT /subcategories/:tier` validates tier and payload
- [ ] Endpoint: `GET /subcategories/:tier/counts` returns item counts
- [ ] Endpoint: `POST /subcategories/reset` validates reassignment payload

### Frontend Tests

- [ ] Component: `SubcategoryRow` renders editable/read-only based on isLocked/isOther
- [ ] Component: `ReassignmentPrompt` disables confirm until destination selected
- [ ] Component: `ResetConfirmationModal` shows items needing reassignment vs "will be removed"
- [ ] Component: `SubcategoriesSection` renders three tabs, capacity indicator, and save/discard
- [ ] Hook: `useSaveSubcategories` invalidates subcategory and waterfall summary queries

### Key Scenarios

- [ ] Happy path: rename a subcategory, reorder, add a new one, save — all reflected on refresh
- [ ] Removal with items: remove a subcategory with items, reassign, save — items move correctly
- [ ] Reset flow: customise subcategories, reset to defaults with reassignment — all tiers restored
- [ ] Validation: attempt duplicate names, empty names, >7 subcategories — inline errors prevent save
- [ ] Locked: "Gifts" in discretionary cannot be renamed or removed

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — no errors
- [ ] `cd apps/backend && bun scripts/run-tests.ts subcategory` passes
- [ ] `cd apps/backend && bun scripts/run-tests.ts waterfall.routes` passes
- [ ] `cd apps/frontend && bun test SubcategoryRow` passes
- [ ] `cd apps/frontend && bun test ReassignmentPrompt` passes
- [ ] `cd apps/frontend && bun test ResetConfirmationModal` passes
- [ ] `cd apps/frontend && bun test SubcategoriesSection` passes
- [ ] Manual: navigate to Settings → Subcategories, rename a subcategory, add one, reorder, save; remove one with items and reassign; reset to defaults

## Post-conditions

- [ ] Users can fully customise subcategories per waterfall tier
- [ ] Tier pages (Income, Committed, Discretionary) automatically reflect renamed/reordered subcategories via existing `useSubcategories` hook
- [ ] Enables future work: subcategory-based filtering, per-subcategory budgets
