import { describe, it, expect } from "bun:test";
import {
  PurchasePriorityEnum,
  PurchaseStatusEnum,
  createPurchaseSchema,
  updatePurchaseSchema,
  upsertYearBudgetSchema,
} from "./planner.schemas";

describe("planner enums", () => {
  it("PurchasePriorityEnum allows the four priorities and rejects others", () => {
    for (const p of ["lowest", "low", "medium", "high"]) {
      expect(PurchasePriorityEnum.parse(p)).toBe(p);
    }
    expect(() => PurchasePriorityEnum.parse("urgent")).toThrow();
  });

  it("PurchaseStatusEnum allows the three statuses and rejects others", () => {
    for (const s of ["not_started", "in_progress", "done"]) {
      expect(PurchaseStatusEnum.parse(s)).toBe(s);
    }
    expect(() => PurchaseStatusEnum.parse("cancelled")).toThrow();
  });
});

describe("createPurchaseSchema", () => {
  it("accepts a minimal valid purchase (name + positive cost)", () => {
    expect(createPurchaseSchema.parse({ name: "Laptop", estimatedCost: 1200 })).toEqual({
      name: "Laptop",
      estimatedCost: 1200,
    });
  });

  it("accepts a fully-populated purchase", () => {
    const input = {
      name: "Holiday",
      estimatedCost: 3000,
      priority: "high" as const,
      scheduledThisYear: true,
      fundingSources: ["Savings", "Bonus"],
      fundingAccountId: "acc_123",
      status: "in_progress" as const,
      reason: "Family trip",
      comment: "Booking in spring",
    };
    expect(createPurchaseSchema.parse(input)).toMatchObject(input);
  });

  it("requires a non-empty name", () => {
    expect(() => createPurchaseSchema.parse({ name: "", estimatedCost: 10 })).toThrow();
    expect(() => createPurchaseSchema.parse({ estimatedCost: 10 })).toThrow();
  });

  it("requires estimatedCost to be strictly positive and finite", () => {
    expect(() => createPurchaseSchema.parse({ name: "X", estimatedCost: 0 })).toThrow();
    expect(() => createPurchaseSchema.parse({ name: "X", estimatedCost: -5 })).toThrow();
    expect(() =>
      createPurchaseSchema.parse({ name: "X", estimatedCost: Number.POSITIVE_INFINITY })
    ).toThrow();
  });

  it("caps fundingSources at 50 entries and 100 chars each", () => {
    expect(() =>
      createPurchaseSchema.parse({
        name: "X",
        estimatedCost: 1,
        fundingSources: Array.from({ length: 51 }, (_, i) => `s${i}`),
      })
    ).toThrow();
    expect(() =>
      createPurchaseSchema.parse({
        name: "X",
        estimatedCost: 1,
        fundingSources: ["a".repeat(101)],
      })
    ).toThrow();
  });
});

describe("updatePurchaseSchema", () => {
  it("accepts an empty patch (every field optional)", () => {
    expect(updatePurchaseSchema.parse({})).toEqual({});
  });

  it("allows nullable fundingAccountId / reason / comment to clear values", () => {
    expect(
      updatePurchaseSchema.parse({ fundingAccountId: null, reason: null, comment: null })
    ).toEqual({ fundingAccountId: null, reason: null, comment: null });
  });

  it("still rejects a non-positive estimatedCost when provided", () => {
    expect(() => updatePurchaseSchema.parse({ estimatedCost: 0 })).toThrow();
  });
});

describe("upsertYearBudgetSchema", () => {
  it("accepts non-negative budgets, including zero", () => {
    expect(upsertYearBudgetSchema.parse({ purchaseBudget: 0, giftBudget: 500 })).toEqual({
      purchaseBudget: 0,
      giftBudget: 500,
    });
    expect(upsertYearBudgetSchema.parse({})).toEqual({});
  });

  it("rejects negative budgets", () => {
    expect(() => upsertYearBudgetSchema.parse({ purchaseBudget: -1 })).toThrow();
    expect(() => upsertYearBudgetSchema.parse({ giftBudget: -0.01 })).toThrow();
  });
});
