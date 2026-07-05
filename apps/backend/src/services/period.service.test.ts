import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { periodService } = await import("./period.service.js");

const HH = "hh-1";
const CTX = { householdId: HH, actorId: "user-1", actorName: "Test" };

beforeEach(() => {
  resetPrismaMocks();
  prismaMock.auditLog.create.mockResolvedValue({} as any);
});

describe("periodService.listPeriods", () => {
  it("returns periods ordered by startDate ascending, scoped to the household", async () => {
    const periods = [
      {
        id: "p1",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2023-01-01"),
        amount: 7,
        createdAt: new Date(),
      },
      {
        id: "p2",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2023-01-01"),
        endDate: null,
        amount: 9,
        createdAt: new Date(),
      },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.listPeriods(HH, "committed_item", "item-1");

    expect(prismaMock.itemAmountPeriod.findMany).toHaveBeenCalledWith({
      where: { householdId: HH, itemType: "committed_item", itemId: "item-1" },
      orderBy: { startDate: "asc" },
    });
    expect(result).toHaveLength(2);
    expect(result[0].amount).toBe(7);
  });
});

describe("periodService.getCurrentAmount", () => {
  it("returns the amount from the current effective period", async () => {
    const now = new Date("2026-04-04");
    const periods = [
      { id: "p1", startDate: new Date("2020-01-01"), endDate: new Date("2025-01-01"), amount: 7 },
      { id: "p2", startDate: new Date("2025-01-01"), endDate: null, amount: 9 },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getCurrentAmount(HH, "committed_item", "item-1", now);

    expect(prismaMock.itemAmountPeriod.findMany).toHaveBeenCalledWith({
      where: { householdId: HH, itemType: "committed_item", itemId: "item-1" },
      orderBy: { startDate: "asc" },
    });
    expect(result).toBe(9);
  });

  it("returns 0 when no periods exist", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);

    const result = await periodService.getCurrentAmount(HH, "committed_item", "item-1", new Date());

    expect(result).toBe(0);
  });
});

describe("periodService.getEffectiveAmountForMonth", () => {
  it("returns the amount effective in a given month", async () => {
    const periods = [
      { id: "p1", startDate: new Date("2020-01-01"), endDate: new Date("2026-06-01"), amount: 7 },
      { id: "p2", startDate: new Date("2026-06-01"), endDate: null, amount: 9 },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    // August 2026 — should be in period 2
    const result = await periodService.getEffectiveAmountForMonth(
      HH,
      "committed_item",
      "item-1",
      2026,
      8
    );
    expect(result).toBe(9);

    // March 2026 — should be in period 1
    const result2 = await periodService.getEffectiveAmountForMonth(
      HH,
      "committed_item",
      "item-1",
      2026,
      3
    );
    expect(result2).toBe(7);
  });

  it("uses a UTC month boundary so periods starting on the 1st are included", async () => {
    // Period starts exactly at the UTC start of June 2026. A non-UTC reference
    // date (new Date(2026, 5, 1)) in a positive-offset TZ would resolve to
    // 2026-05-31T..Z and fall short of the boundary, excluding this period.
    const periods = [
      {
        id: "p1",
        startDate: new Date(Date.UTC(2026, 5, 1)),
        endDate: null,
        amount: 42,
      },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getEffectiveAmountForMonth(
      HH,
      "committed_item",
      "item-1",
      2026,
      6
    );
    expect(result).toBe(42);
  });
});

describe("periodService.getLifecycleState", () => {
  it("returns active when a period covers today", async () => {
    const now = new Date("2026-04-04");
    const periods = [{ startDate: new Date("2020-01-01"), endDate: null, amount: 10 }];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getLifecycleState(HH, "committed_item", "item-1", now);
    expect(result).toBe("active");
  });

  it("returns future when all periods start after today", async () => {
    const now = new Date("2026-04-04");
    const periods = [{ startDate: new Date("2026-07-01"), endDate: null, amount: 10 }];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getLifecycleState(HH, "committed_item", "item-1", now);
    expect(result).toBe("future");
  });

  it("returns expired when all periods have ended", async () => {
    const now = new Date("2026-04-04");
    const periods = [
      { startDate: new Date("2020-01-01"), endDate: new Date("2025-12-31"), amount: 10 },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);

    const result = await periodService.getLifecycleState(HH, "committed_item", "item-1", now);
    expect(result).toBe("expired");
  });
});

describe("periodService.createPeriod", () => {
  it("creates a period with the householdId and updates the adjacent period's endDate", async () => {
    const existingPeriods = [
      {
        id: "p1",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2020-01-01"),
        endDate: null,
        amount: 7,
      },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(existingPeriods);
    prismaMock.itemAmountPeriod.create.mockResolvedValue({
      id: "p2",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2026-10-01"),
      endDate: null,
      amount: 9,
      createdAt: new Date(),
    });
    prismaMock.itemAmountPeriod.update.mockResolvedValue({});

    const result = await periodService.createPeriod(
      HH,
      {
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2026-10-01"),
        amount: 9,
      },
      CTX
    );

    // Should only consider this household's periods
    expect(prismaMock.itemAmountPeriod.findMany).toHaveBeenCalledWith({
      where: { householdId: HH, itemType: "committed_item", itemId: "item-1" },
      orderBy: { startDate: "asc" },
    });
    // Should update previous period's endDate
    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { endDate: new Date("2026-10-01") },
    });
    // Created row must carry the householdId
    expect(prismaMock.itemAmountPeriod.create).toHaveBeenCalledWith({
      data: {
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2026-10-01"),
        endDate: null,
        amount: 9,
      },
    });
    expect(result.amount).toBe(9);
  });

  // #144: the previous period is only closed when still open or extends past
  // the new start — a period that already closed before the new start must not
  // be resurrected (its endDate left untouched).
  it("does not resurrect a previous period that closed before the new start", async () => {
    const existingPeriods = [
      {
        id: "p1",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2021-01-01"), // closed long before the new start
        amount: 7,
      },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(existingPeriods);
    prismaMock.itemAmountPeriod.create.mockResolvedValue({ id: "p2", amount: 9 } as any);

    await periodService.createPeriod(
      HH,
      {
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2026-10-01"),
        amount: 9,
      },
      CTX
    );

    // The already-closed gap period must not be touched.
    expect(prismaMock.itemAmountPeriod.update).not.toHaveBeenCalled();
    expect(prismaMock.itemAmountPeriod.create).toHaveBeenCalled();
  });

  // #144: explicit endDate validation.
  it("rejects an explicit endDate on or before the start date", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);

    await expect(
      periodService.createPeriod(
        HH,
        {
          itemType: "committed_item",
          itemId: "item-1",
          startDate: new Date("2026-10-01"),
          endDate: new Date("2026-10-01"),
          amount: 9,
        },
        CTX
      )
    ).rejects.toThrow("end date must be after");
    expect(prismaMock.itemAmountPeriod.create).not.toHaveBeenCalled();
  });

  it("rejects an explicit endDate that overruns the following period", async () => {
    const existingPeriods = [
      {
        id: "p-next",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2027-01-01"),
        endDate: null,
        amount: 5,
      },
    ];
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(existingPeriods);

    await expect(
      periodService.createPeriod(
        HH,
        {
          itemType: "committed_item",
          itemId: "item-1",
          startDate: new Date("2026-10-01"),
          endDate: new Date("2027-06-01"), // past the next period's start
          amount: 9,
        },
        CTX
      )
    ).rejects.toThrow("overlaps the following period");
    expect(prismaMock.itemAmountPeriod.create).not.toHaveBeenCalled();
  });

  // #131: a unique-constraint collision surfaces as a 409, never a raw 500.
  it("maps a P2002 unique violation to a ConflictError", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.create.mockRejectedValue({ code: "P2002" });

    await expect(
      periodService.createPeriod(
        HH,
        {
          itemType: "committed_item",
          itemId: "item-1",
          startDate: new Date("2026-10-01"),
          amount: 9,
        },
        CTX
      )
    ).rejects.toThrow("already starts on that date");
  });
});

describe("periodService.updatePeriod", () => {
  it("rejects periods that belong to another household", async () => {
    // findFirst is scoped by householdId — a foreign period resolves to null
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(null);

    await expect(periodService.updatePeriod(HH, "p-foreign", { amount: 1 }, CTX)).rejects.toThrow(
      "Period not found"
    );

    expect(prismaMock.itemAmountPeriod.findFirst).toHaveBeenCalledWith({
      where: { id: "p-foreign", householdId: HH },
    });
    expect(prismaMock.itemAmountPeriod.update).not.toHaveBeenCalled();
  });

  it("updates a period owned by the household", async () => {
    const period = {
      id: "p1",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2025-01-01"),
      endDate: null,
      amount: 7,
    };
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(period);
    prismaMock.itemAmountPeriod.update.mockResolvedValue({ ...period, amount: 11 });

    const result = await periodService.updatePeriod(HH, "p1", { amount: 11 }, CTX);

    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p1", householdId: HH },
      data: { amount: 11 },
    });
    expect(result.amount).toBe(11);
  });

  // #144: merged start must remain before the (existing) endDate.
  it("rejects a startDate moved on or after the existing endDate", async () => {
    const period = {
      id: "p1",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-06-01"),
      amount: 7,
    };
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(period);

    await expect(
      periodService.updatePeriod(HH, "p1", { startDate: new Date("2025-07-01") }, CTX)
    ).rejects.toThrow("end date must be after");
    expect(prismaMock.itemAmountPeriod.update).not.toHaveBeenCalled();
  });

  // #144: moving the start across a neighbour must be rejected, not silently
  // produce overlapping periods.
  it("rejects a startDate that overlaps the following period", async () => {
    const target = {
      id: "p2",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2025-01-01"),
      endDate: null,
      amount: 7,
    };
    const allPeriods = [
      target,
      {
        id: "p3",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2026-01-01"),
        endDate: null,
        amount: 9,
      },
    ];
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(target);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(allPeriods);

    await expect(
      // Push p2's start to 2026-06-01, past p3's start → overlap.
      periodService.updatePeriod(HH, "p2", { startDate: new Date("2026-06-01") }, CTX)
    ).rejects.toThrow("overlaps the following period");
    expect(prismaMock.itemAmountPeriod.update).not.toHaveBeenCalled();
  });

  // #131: a startDate collision raised by the DB surfaces as a 409.
  it("maps a P2002 unique violation to a ConflictError", async () => {
    const period = {
      id: "p1",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2025-01-01"),
      endDate: null,
      amount: 7,
    };
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(period);
    prismaMock.itemAmountPeriod.update.mockRejectedValue({ code: "P2002" });

    await expect(periodService.updatePeriod(HH, "p1", { amount: 11 }, CTX)).rejects.toThrow(
      "already starts on that date"
    );
  });
});

describe("periodService.deletePeriod", () => {
  it("deletes the period and extends the previous period", async () => {
    const periods = [
      {
        id: "p1",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2025-01-01"),
        amount: 7,
      },
      {
        id: "p2",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2025-01-01"),
        endDate: null,
        amount: 9,
      },
    ];
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(periods[1]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);
    prismaMock.itemAmountPeriod.delete.mockResolvedValue({});
    prismaMock.itemAmountPeriod.update.mockResolvedValue({});

    await periodService.deletePeriod(HH, "p2", CTX);

    expect(prismaMock.itemAmountPeriod.delete).toHaveBeenCalledWith({
      where: { id: "p2", householdId: HH },
    });
    // Previous period should now be open-ended
    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { endDate: null },
    });
  });

  it("returns deleteItem flag when deleting the last period", async () => {
    const period = {
      id: "p1",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2020-01-01"),
      endDate: null,
      amount: 7,
    };
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(period);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([period]);

    const result = await periodService.deletePeriod(HH, "p1", CTX);

    expect(result).toEqual({ deleteItem: true, itemType: "committed_item", itemId: "item-1" });
  });

  it("rejects periods that belong to another household", async () => {
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(null);

    await expect(periodService.deletePeriod(HH, "p-foreign", CTX)).rejects.toThrow(
      "Period not found"
    );

    expect(prismaMock.itemAmountPeriod.findFirst).toHaveBeenCalledWith({
      where: { id: "p-foreign", householdId: HH },
    });
    expect(prismaMock.itemAmountPeriod.delete).not.toHaveBeenCalled();
  });
});

describe("periodService.setCurrentAmount", () => {
  const now = new Date("2026-06-13");

  it("updates the current effective period in place", async () => {
    const period = {
      id: "p-cur",
      householdId: HH,
      itemType: "income_source",
      itemId: "inc-1",
      startDate: new Date("2020-01-01"),
      endDate: null,
      amount: 1000,
      createdAt: new Date(),
    };
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([period]);
    prismaMock.itemAmountPeriod.update.mockResolvedValue({ ...period, amount: 1500 });

    await periodService.setCurrentAmount(
      prismaMock as any,
      HH,
      "income_source",
      "inc-1",
      1500,
      now
    );

    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p-cur" },
      data: { amount: 1500 },
    });
    expect(prismaMock.itemAmountPeriod.create).not.toHaveBeenCalled();
  });

  it("creates a period starting now when none is effective", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.create.mockResolvedValue({} as any);

    await periodService.setCurrentAmount(prismaMock as any, HH, "committed_item", "ci-1", 250, now);

    expect(prismaMock.itemAmountPeriod.create).toHaveBeenCalledWith({
      data: {
        householdId: HH,
        itemType: "committed_item",
        itemId: "ci-1",
        startDate: now,
        endDate: null,
        amount: 250,
      },
    });
  });

  it("closes the previous period and inherits the next period's start when stitching a new one", async () => {
    const prev = {
      id: "p-prev",
      householdId: HH,
      itemType: "committed_item",
      itemId: "ci-1",
      startDate: new Date("2020-01-01"),
      endDate: new Date("2021-01-01"),
      amount: 100,
      createdAt: new Date(),
    };
    const next = {
      id: "p-next",
      householdId: HH,
      itemType: "committed_item",
      itemId: "ci-1",
      startDate: new Date("2030-01-01"),
      endDate: null,
      amount: 300,
      createdAt: new Date(),
    };
    // Neither covers `now` (2026) → no effective period, must stitch a new one.
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([prev, next]);
    prismaMock.itemAmountPeriod.update.mockResolvedValue({} as any);
    prismaMock.itemAmountPeriod.create.mockResolvedValue({} as any);

    await periodService.setCurrentAmount(prismaMock as any, HH, "committed_item", "ci-1", 200, now);

    expect(prismaMock.itemAmountPeriod.update).toHaveBeenCalledWith({
      where: { id: "p-prev" },
      data: { endDate: now },
    });
    expect(prismaMock.itemAmountPeriod.create).toHaveBeenCalledWith({
      data: {
        householdId: HH,
        itemType: "committed_item",
        itemId: "ci-1",
        startDate: now,
        endDate: next.startDate,
        amount: 200,
      },
    });
  });
});

// ─── SEC-3: period mutations are audited ────────────────────────────────────────

describe("periodService audits every mutation", () => {
  it("createPeriod writes a CREATE_ITEM_PERIOD audit row", async () => {
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([]);
    prismaMock.itemAmountPeriod.create.mockResolvedValue({
      id: "p-new",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2026-10-01"),
      endDate: null,
      amount: 9,
    });

    await periodService.createPeriod(
      HH,
      {
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2026-10-01"),
        amount: 9,
      },
      CTX
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE_ITEM_PERIOD",
          resource: "item-period",
          resourceId: "p-new",
          actorId: "user-1",
        }),
      })
    );
  });

  it("updatePeriod writes an UPDATE_ITEM_PERIOD audit row", async () => {
    const period = {
      id: "p1",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2025-01-01"),
      endDate: null,
      amount: 7,
    };
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(period);
    prismaMock.itemAmountPeriod.update.mockResolvedValue({ ...period, amount: 11 });

    await periodService.updatePeriod(HH, "p1", { amount: 11 }, CTX);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE_ITEM_PERIOD",
          resource: "item-period",
          resourceId: "p1",
          actorId: "user-1",
        }),
      })
    );
  });

  it("deletePeriod writes a DELETE_ITEM_PERIOD audit row when a period is removed", async () => {
    const periods = [
      {
        id: "p1",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2025-01-01"),
        amount: 7,
      },
      {
        id: "p2",
        householdId: HH,
        itemType: "committed_item",
        itemId: "item-1",
        startDate: new Date("2025-01-01"),
        endDate: null,
        amount: 9,
      },
    ];
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(periods[1]);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue(periods);
    prismaMock.itemAmountPeriod.delete.mockResolvedValue({});
    prismaMock.itemAmountPeriod.update.mockResolvedValue({});

    await periodService.deletePeriod(HH, "p2", CTX);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE_ITEM_PERIOD",
          resource: "item-period",
          resourceId: "p2",
          actorId: "user-1",
        }),
      })
    );
  });

  it("deletePeriod does NOT audit when it delegates to item deletion (last period)", async () => {
    // When only one period remains, deletePeriod signals item deletion and the
    // route deletes the item (which is separately audited) — no period-delete
    // audit row is written here.
    const period = {
      id: "p1",
      householdId: HH,
      itemType: "committed_item",
      itemId: "item-1",
      startDate: new Date("2020-01-01"),
      endDate: null,
      amount: 7,
    };
    prismaMock.itemAmountPeriod.findFirst.mockResolvedValue(period);
    prismaMock.itemAmountPeriod.findMany.mockResolvedValue([period]);

    const result = await periodService.deletePeriod(HH, "p1", CTX);

    expect(result).toEqual({ deleteItem: true, itemType: "committed_item", itemId: "item-1" });
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});
