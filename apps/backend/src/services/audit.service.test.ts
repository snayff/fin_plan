import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database", () => ({
  prisma: prismaMock,
}));

import { auditEvent, computeDiff, audited } from "./audit.service";

beforeEach(() => {
  resetPrismaMocks();
});

describe("auditEvent", () => {
  it("writes a single audit row and resolves on success", async () => {
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await auditEvent({
      userId: "user-1",
      action: "LOGIN_SUCCESS",
      resource: "session",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: { userId: "user-1", action: "LOGIN_SUCCESS", resource: "session" },
    });
  });

  it("retries once on a transient Prisma error then succeeds", async () => {
    const transient = Object.assign(new Error("connection refused"), {
      code: "P1001",
    });
    prismaMock.auditLog.create.mockRejectedValueOnce(transient).mockResolvedValueOnce({} as any);

    await auditEvent({ action: "LOGIN_FAILED", resource: "session" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-transient errors", async () => {
    const fatal = Object.assign(new Error("schema drift"), { code: "P2002" });
    prismaMock.auditLog.create.mockRejectedValue(fatal);

    await expect(auditEvent({ action: "LOGIN_FAILED" })).rejects.toBe(fatal);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rethrows and structured-logs the redacted payload after retries exhaust", async () => {
    const transient = Object.assign(new Error("pool timeout"), {
      code: "P2024",
    });
    prismaMock.auditLog.create.mockRejectedValue(transient);
    const errSpy = mock(() => {});
    const original = console.error;
    console.error = errSpy as unknown as typeof console.error;

    try {
      await expect(
        auditEvent({
          userId: "u1",
          action: "LOGIN_FAILED",
          resource: "session",
          metadata: { email: "alice@example.com" },
        })
      ).rejects.toBe(transient);

      expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
      expect(errSpy).toHaveBeenCalled();
      const logged = JSON.stringify(errSpy.mock.calls[0]);
      expect(logged).not.toContain("alice@example.com");
      expect(logged).toContain("LOGIN_FAILED");
    } finally {
      console.error = original;
    }
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
