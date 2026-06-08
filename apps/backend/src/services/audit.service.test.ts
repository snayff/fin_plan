import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database", () => ({
  prisma: prismaMock,
}));

import { auditService, computeDiff, audited } from "./audit.service";

beforeEach(() => {
  resetPrismaMocks();
});

describe("auditService.log", () => {
  it("calls prisma.auditLog.create with the provided entry", async () => {
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    auditService.log({ userId: "user-1", action: "LOGIN" });

    // fire-and-forget: we flush the microtask queue before asserting
    await Promise.resolve();

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: { userId: "user-1", action: "LOGIN" },
    });
  });

  it("does not throw when prisma.auditLog.create rejects", () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error("DB write failed"));

    // Should not throw — fire-and-forget
    expect(() => auditService.log({ action: "SIGNUP" })).not.toThrow();
  });

  it("passes optional fields (resource, resourceId, metadata) to prisma", async () => {
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    auditService.log({
      userId: "user-2",
      action: "DELETE",
      resource: "transaction",
      resourceId: "tx-1",
      metadata: { reason: "user request" },
    });

    await Promise.resolve();

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resource: "transaction",
        resourceId: "tx-1",
        metadata: { reason: "user request" },
      }),
    });
  });
});

const ctx = {
  householdId: "hh_1",
  actorId: "user_1",
  actorName: "Alice",
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

describe("computeDiff", () => {
  it("detects updated fields", () => {
    const diff = computeDiff({ amount: 100, name: "Salary" }, { amount: 200, name: "Salary" });
    expect(diff).toEqual([{ field: "amount", before: 100, after: 200 }]);
  });

  it("detects created fields (no before state)", () => {
    const diff = computeDiff(null, { amount: 100, name: "Salary" });
    expect(diff).toEqual([
      { field: "amount", after: 100 },
      { field: "name", after: "Salary" },
    ]);
  });

  it("skips null/undefined/empty-string fields on create", () => {
    const diff = computeDiff(null, {
      name: "Tandem",
      notes: null,
      dueDate: undefined,
      description: "",
      spendType: "monthly",
    });
    expect(diff).toEqual([
      { field: "name", after: "Tandem" },
      { field: "spendType", after: "monthly" },
    ]);
  });

  it("keeps null fields on delete (informative for a deletion record)", () => {
    const diff = computeDiff({ name: "Old", notes: null }, null);
    expect(diff).toEqual([
      { field: "name", before: "Old" },
      { field: "notes", before: null },
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

  it("excludes universal system fields on create", () => {
    const diff = computeDiff(null, {
      id: "abc",
      householdId: "hh",
      createdAt: new Date(),
      updatedAt: new Date(),
      sortOrder: 0,
      lastReviewedAt: new Date(),
      subcategoryId: "sub",
      name: "Salary",
    });
    expect(diff).toEqual([{ field: "name", after: "Salary" }]);
  });

  it("excludes universal system fields on update", () => {
    const diff = computeDiff(
      { id: "abc", updatedAt: new Date("2026-01-01"), spendType: "monthly" },
      { id: "abc", updatedAt: new Date("2026-04-01"), spendType: "yearly" }
    );
    expect(diff).toEqual([{ field: "spendType", before: "monthly", after: "yearly" }]);
  });

  it("captures weekly ↔ quarterly spendType transition in diff", () => {
    const diff = computeDiff(
      { id: "ci-1", spendType: "weekly" },
      { id: "ci-1", spendType: "quarterly" }
    );
    expect(diff).toEqual([{ field: "spendType", before: "weekly", after: "quarterly" }]);
  });

  it("excludes universal system fields on delete", () => {
    const diff = computeDiff({ id: "abc", householdId: "hh", name: "Old" }, null);
    expect(diff).toEqual([{ field: "name", before: "Old" }]);
  });

  it("excludes per-resource denylisted fields when resource matches", () => {
    const diff = computeDiff(
      { name: "Rent", isPlannerOwned: false },
      { name: "Rent", isPlannerOwned: true },
      "committed-item"
    );
    expect(diff).toEqual([]);
  });

  it("includes per-resource denylisted fields for unrelated resources", () => {
    const diff = computeDiff(
      { name: "Rent", isPlannerOwned: false },
      { name: "Rent", isPlannerOwned: true },
      "some-other-resource"
    );
    expect(diff).toEqual([{ field: "isPlannerOwned", before: false, after: true }]);
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
      })
    ).rejects.toThrow("DB error");
  });
});

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
    expect(changes).toEqual([{ field: "stalenessThresholds.income", before: 30, after: 45 }]);
  });

  it("emits an opaque change for non-allowlisted JSON fields", () => {
    const before = { metadata: { a: 1 } };
    const after = { metadata: { a: 2 } };
    const changes = computeDiff(before, after, "household-settings");
    expect(changes).toEqual([{ field: "metadata", before: { a: 1 }, after: { a: 2 } }]);
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

describe("audited() — lazy resourceId", () => {
  beforeEach(() => {
    prismaMock.auditLog.create.mockResolvedValue({} as any);
  });

  it("resolves resourceId from a function when the mutation result is an object", async () => {
    await audited({
      db: prismaMock as any,
      ctx,
      action: "CREATE_SNAPSHOT",
      resource: "snapshot",
      resourceId: (after: { id: string }) => after.id,
      beforeFetch: async () => null,
      mutation: async () => ({ id: "snap-123", name: "Q1" }),
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resourceId: "snap-123" }),
      })
    );
  });
});
