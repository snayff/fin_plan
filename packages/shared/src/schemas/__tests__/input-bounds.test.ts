import { describe, it, expect } from "bun:test";
import {
  createIncomeSourceSchema,
  createCommittedItemSchema,
  createDiscretionaryItemSchema,
  createPeriodSchema,
  updatePeriodSchema,
  createSubcategorySchema,
  batchSaveSubcategoriesSchema,
} from "../waterfall.schemas";
import { createSnapshotSchema } from "../snapshot.schemas";
import { recordAccountBalanceSchema, recordAssetBalanceSchema } from "../assets.schemas";
import {
  upsertGiftAllocationSchema,
  setGiftBudgetSchema,
  bulkUpsertCellSchema,
} from "../gifts.schemas";
import { updateSettingsSchema } from "../settings.schemas";
import { createPurchaseSchema, upsertYearBudgetSchema } from "../planner.schemas";
import {
  createHouseholdSchema,
  acceptInviteSchema,
  createMemberSchema,
} from "../household.schemas";
import { createGiftPersonSchema } from "../gifts.schemas";
import { MONEY_MAX, NAME_MAX, NOTES_MAX } from "../common.schemas";

const NON_FINITE = [Infinity, -Infinity, NaN, 1e308];

describe("money amount bounds", () => {
  it("rejects non-finite and astronomically large amounts on income create", () => {
    for (const amount of NON_FINITE) {
      const r = createIncomeSourceSchema.safeParse({
        name: "Salary",
        amount,
        frequency: "monthly",
        dueDate: "2026-01-01",
      });
      expect(r.success).toBe(false);
    }
  });

  it("accepts a normal amount and rejects just over the cap", () => {
    const base = { name: "Salary", frequency: "monthly", dueDate: "2026-01-01" };
    expect(createIncomeSourceSchema.safeParse({ ...base, amount: 2500 }).success).toBe(true);
    expect(createIncomeSourceSchema.safeParse({ ...base, amount: MONEY_MAX }).success).toBe(true);
    expect(createIncomeSourceSchema.safeParse({ ...base, amount: MONEY_MAX * 2 }).success).toBe(
      false
    );
  });

  it("rejects Infinity on committed and discretionary item create", () => {
    const committed = createCommittedItemSchema.safeParse({
      name: "Rent",
      amount: Infinity,
      subcategoryId: "sub1",
      dueDate: "2026-01-01",
    });
    expect(committed.success).toBe(false);

    const discretionary = createDiscretionaryItemSchema.safeParse({
      name: "Fun",
      amount: 1e308,
      subcategoryId: "sub1",
    });
    expect(discretionary.success).toBe(false);
  });

  it("rejects non-finite period amounts", () => {
    const create = createPeriodSchema.safeParse({
      itemType: "income_source",
      itemId: "item1",
      startDate: "2026-01-01",
      amount: Infinity,
    });
    expect(create.success).toBe(false);

    const update = updatePeriodSchema.safeParse({ amount: 1e308 });
    expect(update.success).toBe(false);
  });

  it("rejects non-finite balance values", () => {
    for (const value of NON_FINITE) {
      expect(recordAccountBalanceSchema.safeParse({ value, date: "2026-01-01" }).success).toBe(
        false
      );
      expect(recordAssetBalanceSchema.safeParse({ value, date: "2026-01-01" }).success).toBe(false);
    }
  });

  it("rejects non-finite gift planner amounts", () => {
    expect(upsertGiftAllocationSchema.safeParse({ planned: Infinity }).success).toBe(false);
    expect(upsertGiftAllocationSchema.safeParse({ spent: 1e308 }).success).toBe(false);
    expect(setGiftBudgetSchema.safeParse({ annualBudget: Infinity }).success).toBe(false);
    expect(
      bulkUpsertCellSchema.safeParse({
        personId: "p1",
        eventId: "e1",
        year: 2026,
        planned: 1e308,
      }).success
    ).toBe(false);
  });

  it("rejects non-finite settings and budget values", () => {
    expect(updateSettingsSchema.safeParse({ isaAnnualLimit: Infinity }).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ surplusBenchmarkPct: Infinity }).success).toBe(false);
    expect(upsertYearBudgetSchema.safeParse({ purchaseBudget: 1e308 }).success).toBe(false);
    expect(createPurchaseSchema.safeParse({ name: "TV", estimatedCost: Infinity }).success).toBe(
      false
    );
  });

  it("keeps percentage fields within 0-100", () => {
    expect(updateSettingsSchema.safeParse({ savingsRatePct: 101 }).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ savingsRatePct: 4.5 }).success).toBe(true);
  });
});

describe("string length bounds", () => {
  const longName = "x".repeat(NAME_MAX + 1);
  const longNotes = "x".repeat(NOTES_MAX + 1);
  const megabyte = "x".repeat(1_000_000);

  it("rejects oversized names", () => {
    expect(
      createIncomeSourceSchema.safeParse({
        name: longName,
        amount: 1,
        frequency: "monthly",
        dueDate: "2026-01-01",
      }).success
    ).toBe(false);
    expect(createHouseholdSchema.safeParse({ name: megabyte }).success).toBe(false);
    expect(createMemberSchema.safeParse({ name: longName }).success).toBe(false);
    expect(createGiftPersonSchema.safeParse({ name: longName }).success).toBe(false);
  });

  it("rejects oversized notes", () => {
    expect(
      createCommittedItemSchema.safeParse({
        name: "Rent",
        amount: 1,
        subcategoryId: "sub1",
        dueDate: "2026-01-01",
        notes: longNotes,
      }).success
    ).toBe(false);
    expect(createGiftPersonSchema.safeParse({ name: "Mum", notes: megabyte }).success).toBe(false);
  });

  it("rejects oversized emails and passwords", () => {
    const longEmail = `${"x".repeat(300)}@example.com`;
    expect(
      acceptInviteSchema.safeParse({
        name: "New User",
        email: longEmail,
        password: "a-valid-password",
      }).success
    ).toBe(false);
    expect(
      acceptInviteSchema.safeParse({
        name: "New User",
        email: "user@example.com",
        password: "p".repeat(200),
      }).success
    ).toBe(false);
  });

  it("still accepts sensible values", () => {
    expect(
      acceptInviteSchema.safeParse({
        name: "New User",
        email: "user@example.com",
        password: "a-valid-password",
      }).success
    ).toBe(true);
    expect(createHouseholdSchema.safeParse({ name: "Smith Household" }).success).toBe(true);
  });
});

// ─── #137: name field ordering/trim ───────────────────────────────────────────
describe("name schemas reject whitespace-only input", () => {
  it("rejects whitespace-only snapshot names (trim runs before min(1))", () => {
    expect(createSnapshotSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createSnapshotSchema.safeParse({ name: "Q1 snapshot" }).success).toBe(true);
  });

  it("rejects whitespace-only income source names", () => {
    const base = { amount: 1, frequency: "monthly", dueDate: "2026-01-01" };
    expect(createIncomeSourceSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});

// ─── #119: subcategory name standardised on 24 chars (both paths) ──────────────
describe("subcategory name limit (24)", () => {
  const len24 = "x".repeat(24);
  const len25 = "x".repeat(25);

  it("rejects 25-char names on the quick-add path", () => {
    expect(createSubcategorySchema.safeParse({ name: len25 }).success).toBe(false);
    expect(createSubcategorySchema.safeParse({ name: len24 }).success).toBe(true);
  });

  it("rejects 25-char names on the batch-save path", () => {
    const make = (name: string) => ({
      subcategories: [{ name, sortOrder: 0 }],
      reassignments: [],
    });
    expect(batchSaveSubcategoriesSchema.safeParse(make(len25)).success).toBe(false);
    expect(batchSaveSubcategoriesSchema.safeParse(make(len24)).success).toBe(true);
  });
});

// ─── #138: bounded dates + end-after-start refinement ─────────────────────────
describe("bounded dates", () => {
  it("rejects out-of-range years (e.g. 99999)", () => {
    const base = { amount: 1, frequency: "monthly" };
    expect(
      createIncomeSourceSchema.safeParse({ ...base, name: "Salary", dueDate: "99999-01-01" })
        .success
    ).toBe(false);
    expect(
      createIncomeSourceSchema.safeParse({ ...base, name: "Salary", dueDate: "2026-01-01" }).success
    ).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    expect(
      createPeriodSchema.safeParse({
        itemType: "income_source",
        itemId: "item1",
        startDate: "2026-06-01",
        endDate: "2026-01-01",
        amount: 100,
      }).success
    ).toBe(false);
    expect(
      createPeriodSchema.safeParse({
        itemType: "income_source",
        itemId: "item1",
        startDate: "2026-01-01",
        endDate: "2026-06-01",
        amount: 100,
      }).success
    ).toBe(true);
  });

  it("allows open-ended ranges (no endDate)", () => {
    expect(
      createCommittedItemSchema.safeParse({
        name: "Rent",
        amount: 1,
        subcategoryId: "sub1",
        dueDate: "2026-01-01",
        startDate: "2026-01-01",
      }).success
    ).toBe(true);
  });
});
