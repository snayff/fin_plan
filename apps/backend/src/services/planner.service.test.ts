import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { plannerService } = await import("./planner.service.js");

beforeEach(() => {
  resetPrismaMocks();
});

// ─── Purchases ────────────────────────────────────────────────────────────────

describe("plannerService.listPurchases", () => {
  it("queries by householdId and year", async () => {
    prismaMock.purchaseItem.findMany.mockResolvedValue([]);

    await plannerService.listPurchases("hh-1", 2025);

    expect(prismaMock.purchaseItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "hh-1", yearAdded: 2025 } })
    );
  });
});

describe("plannerService.createPurchase", () => {
  it("creates with householdId and current year", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.purchaseItem.create.mockResolvedValue({ id: "p-1" } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await plannerService.createPurchase("hh-1", { name: "Bike", estimatedCost: 500 }, ctx);

    expect(prismaMock.purchaseItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Bike",
        estimatedCost: 500,
        householdId: "hh-1",
        yearAdded: new Date().getFullYear(),
      }),
    });
  });

  it("accepts fundingAccountId when the account belongs to the household", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", householdId: "hh-1" } as any);
    prismaMock.purchaseItem.create.mockResolvedValue({ id: "p-1" } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await plannerService.createPurchase(
      "hh-1",
      { name: "Bike", estimatedCost: 500, fundingAccountId: "acc-1" },
      ctx
    );

    expect(prismaMock.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "acc-1", householdId: "hh-1" } })
    );
    expect(prismaMock.purchaseItem.create).toHaveBeenCalled();
  });

  it("throws NotFoundError when fundingAccountId is not in the household", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      plannerService.createPurchase(
        "hh-1",
        { name: "Bike", estimatedCost: 500, fundingAccountId: "acc-foreign" },
        ctx
      )
    ).rejects.toThrow("Account not found");
    expect(prismaMock.purchaseItem.create).not.toHaveBeenCalled();
  });
});

describe("plannerService.updatePurchase", () => {
  const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };

  it("throws NotFoundError when item not found", async () => {
    prismaMock.purchaseItem.findUnique.mockResolvedValue(null);

    await expect(
      plannerService.updatePurchase("hh-1", "p-1", { name: "New name" }, ctx)
    ).rejects.toThrow("Purchase not found");
  });

  it("throws NotFoundError when item belongs to different household", async () => {
    prismaMock.purchaseItem.findUnique.mockResolvedValue({
      id: "p-1",
      householdId: "hh-other",
    } as any);

    await expect(
      plannerService.updatePurchase("hh-1", "p-1", { name: "New name" }, ctx)
    ).rejects.toThrow("Purchase not found");
  });

  it("throws NotFoundError when fundingAccountId is not in the household", async () => {
    prismaMock.purchaseItem.findUnique.mockResolvedValue({
      id: "p-1",
      householdId: "hh-1",
    } as any);
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      plannerService.updatePurchase("hh-1", "p-1", { fundingAccountId: "acc-foreign" }, ctx)
    ).rejects.toThrow("Account not found");
    expect(prismaMock.purchaseItem.update).not.toHaveBeenCalled();
  });
});

describe("plannerService.deletePurchase", () => {
  it("deletes when ownership verified", async () => {
    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Test" };
    prismaMock.purchaseItem.findUnique.mockResolvedValue({
      id: "p-1",
      householdId: "hh-1",
    } as any);
    prismaMock.purchaseItem.delete.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await plannerService.deletePurchase("hh-1", "p-1", ctx);

    expect(prismaMock.purchaseItem.delete).toHaveBeenCalledWith({ where: { id: "p-1" } });
  });
});

// ─── Year budget ──────────────────────────────────────────────────────────────

describe("plannerService.getYearBudget", () => {
  it("returns existing record when found", async () => {
    const existing = { householdId: "hh-1", year: 2025 };
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue(existing as any);

    const result = await plannerService.getYearBudget("hh-1", 2025);

    expect(result).toBe(existing);
    expect(prismaMock.plannerYearBudget.create).not.toHaveBeenCalled();
  });

  it("returns transient defaults without creating a row when not found (#179)", async () => {
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue(null);

    const result = await plannerService.getYearBudget("hh-1", 2025);

    // GET must be side-effect free: no row created on read.
    expect(prismaMock.plannerYearBudget.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: null,
      householdId: "hh-1",
      year: 2025,
      purchaseBudget: 0,
      giftBudget: 0,
    });
  });
});

// ─── Audit logging ────────────────────────────────────────────────────────────

describe("plannerService.createPurchase with audited()", () => {
  const actor = {
    householdId: "hh_1",
    actorId: "user_1",
    actorName: "Alice",
  };

  it("writes an AuditLog entry on purchase creation", async () => {
    prismaMock.purchaseItem.create.mockResolvedValue({ id: "p_1" } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await plannerService.createPurchase("hh_1", { name: "Bike", estimatedCost: 500 }, actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE_PLANNER_GOAL",
          resource: "planner-goal",
          actorId: "user_1",
        }),
      })
    );
  });

  it("always writes AuditLog (ctx is required)", async () => {
    prismaMock.purchaseItem.create.mockResolvedValue({ id: "p_1" } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await plannerService.createPurchase("hh_1", { name: "Bike", estimatedCost: 500 }, actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });
});

// ─── Year budget audit ────────────────────────────────────────────────────────

describe("plannerService.upsertYearBudget with ctx", () => {
  const actor = {
    householdId: "hh_1",
    actorId: "user_1",
    actorName: "Test User",
  };

  it("emits one UPSERT_YEAR_BUDGET row per year with counts (created)", async () => {
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue(null);
    prismaMock.plannerYearBudget.upsert.mockResolvedValue({
      householdId: "hh_1",
      year: 2026,
    } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await plannerService.upsertYearBudget("hh_1", 2026, { purchaseBudget: 500 }, actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPSERT_YEAR_BUDGET",
          resource: "year-budget",
          resourceId: "2026",
          metadata: { counts: { created: 1, updated: 0 } },
          actorId: "user_1",
        }),
      })
    );
  });

  it("emits one UPSERT_YEAR_BUDGET row per year with counts (updated)", async () => {
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({
      householdId: "hh_1",
      year: 2026,
    } as any);
    prismaMock.plannerYearBudget.upsert.mockResolvedValue({
      householdId: "hh_1",
      year: 2026,
    } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await plannerService.upsertYearBudget("hh_1", 2026, { purchaseBudget: 600 }, actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPSERT_YEAR_BUDGET",
          resource: "year-budget",
          resourceId: "2026",
          metadata: { counts: { created: 0, updated: 1 } },
        }),
      })
    );
  });

  it("always writes AuditLog (ctx is required)", async () => {
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue(null);
    prismaMock.plannerYearBudget.upsert.mockResolvedValue({
      householdId: "hh_1",
      year: 2026,
    } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await plannerService.upsertYearBudget("hh_1", 2026, { purchaseBudget: 500 }, actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });
});

// ─── Gift API removal ─────────────────────────────────────────────────────────

describe("plannerService gift API removal", () => {
  it("no longer exposes gift methods", async () => {
    const { plannerService } = await import("./planner.service.js");
    expect((plannerService as any).listGiftPersons).toBeUndefined();
    expect((plannerService as any).createGiftPerson).toBeUndefined();
    expect((plannerService as any).getUpcomingGifts).toBeUndefined();
    expect((plannerService as any).upsertGiftYearRecord).toBeUndefined();
  });
});
