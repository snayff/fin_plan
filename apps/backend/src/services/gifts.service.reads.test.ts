import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { giftsService } = await import("./gifts.service.js");

beforeEach(() => resetPrismaMocks());

describe("giftsService.listEventsForConfig", () => {
  it("returns events ordered locked-first then sortOrder then name", async () => {
    prismaMock.giftEvent.findMany.mockResolvedValue([
      { id: "e1", name: "Christmas", isLocked: true },
    ] as any);
    const rows = await giftsService.listEventsForConfig("hh-1");
    expect(rows).toHaveLength(1);
    expect(prismaMock.giftEvent.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
      orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  });
});

describe("giftsService.listPeopleForConfig", () => {
  it("default filter merges household members without a GiftPerson record", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Mum",
        notes: null,
        sortOrder: 0,
        memberId: null,
        allocations: [{ status: "planned" }, { status: "bought" }],
      },
    ] as any);
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m1", name: "Alice" },
      { id: "m2", name: "Bob" },
    ] as any);

    const rows = await giftsService.listPeopleForConfig("hh-1");

    // p1 mapped + two unlinked members synthesised
    expect(rows).toHaveLength(3);
    const mum = rows.find((r) => r.id === "p1")!;
    expect(mum.plannedCount).toBe(1);
    expect(mum.boughtCount).toBe(1);
    const alice = rows.find((r) => r.id === "member:m1")!;
    expect(alice).toMatchObject({ name: "Alice", memberId: "m1", sortOrder: 999 });
    // findMany passed the year filter into the allocations include
    const call = (prismaMock.giftPerson.findMany.mock.calls[0] as any)[0];
    expect(call.include.allocations.where.year).toBe(year);
  });

  it("household filter queries memberId not null and still merges members", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([] as any);
    prismaMock.member.findMany.mockResolvedValue([{ id: "m1", name: "Alice" }] as any);

    const rows = await giftsService.listPeopleForConfig("hh-1", "household");

    const call = (prismaMock.giftPerson.findMany.mock.calls[0] as any)[0];
    expect(call.where.memberId).toEqual({ not: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("member:m1");
  });

  it("non-household filter skips member merge entirely", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([
      { id: "p1", name: "Friend", notes: null, sortOrder: 0, memberId: null, allocations: [] },
    ] as any);

    const rows = await giftsService.listPeopleForConfig("hh-1", "non-household");

    const call = (prismaMock.giftPerson.findMany.mock.calls[0] as any)[0];
    expect(call.where.memberId).toBe(null);
    // member.findMany must not be consulted for non-household
    expect(prismaMock.member.findMany).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });

  it("does not duplicate a member that already has a linked GiftPerson", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([
      { id: "p1", name: "Alice", notes: null, sortOrder: 0, memberId: "m1", allocations: [] },
    ] as any);
    prismaMock.member.findMany.mockResolvedValue([{ id: "m1", name: "Alice" }] as any);

    const rows = await giftsService.listPeopleForConfig("hh-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("p1");
  });
});

describe("giftsService.getQuickAddMatrix", () => {
  it("merges unlinked members and aggregates current planned total", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findMany.mockResolvedValue([
      { id: "p1", name: "Mum", memberId: null },
    ] as any);
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m1", name: "Alice" },
      { id: "m2", name: "Bob" },
    ] as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([{ id: "e1", name: "Christmas" }] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      { giftPersonId: "p1", giftEventId: "e1", planned: 40 },
      { giftPersonId: "p1", giftEventId: "e1", planned: 10 },
    ] as any);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({ giftBudget: 500 } as any);

    const matrix = await giftsService.getQuickAddMatrix("hh-1", year);

    expect(matrix.people.map((p) => p.id)).toEqual(["p1", "member:m1", "member:m2"]);
    expect(matrix.events).toHaveLength(1);
    expect(matrix.allocations).toEqual([
      { personId: "p1", eventId: "e1", planned: 40 },
      { personId: "p1", eventId: "e1", planned: 10 },
    ]);
    expect(matrix.budget).toEqual({ annual: 500, currentPlanned: 50 });
  });

  it("defaults annual budget to 0 when no budget row exists", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findMany.mockResolvedValue([] as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([] as any);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue(null);

    const matrix = await giftsService.getQuickAddMatrix("hh-1", year);
    expect(matrix.budget).toEqual({ annual: 0, currentPlanned: 0 });
  });
});

describe("giftsService.listYearsWithData", () => {
  it("maps budget rows to descending years", async () => {
    prismaMock.plannerYearBudget.findMany.mockResolvedValue([
      { year: 2027 },
      { year: 2026 },
    ] as any);
    const years = await giftsService.listYearsWithData("hh-1");
    expect(years).toEqual([2027, 2026]);
  });
});

describe("giftsService.upsertAllocation — member: prefix resolution", () => {
  beforeEach(() => {
    prismaMock.giftEvent.findUnique.mockResolvedValue({ id: "e1", householdId: "hh-1" } as any);
    prismaMock.giftAllocation.upsert.mockResolvedValue({} as any);
  });

  it("reuses an existing GiftPerson backing the member", async () => {
    const year = new Date().getFullYear();
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m1",
      householdId: "hh-1",
      name: "Alice",
    } as any);
    prismaMock.giftPerson.findFirst.mockResolvedValue({
      id: "gp-existing",
      householdId: "hh-1",
    } as any);
    prismaMock.giftPerson.findUnique.mockResolvedValue({
      id: "gp-existing",
      householdId: "hh-1",
    } as any);

    await giftsService.upsertAllocation("hh-1", "member:m1", "e1", year, { planned: 20 });

    expect(prismaMock.giftPerson.create).not.toHaveBeenCalled();
    const args = (prismaMock.giftAllocation.upsert.mock.calls[0] as any)[0];
    expect(args.where.giftPersonId_giftEventId_year.giftPersonId).toBe("gp-existing");
  });

  it("creates a backing GiftPerson when none exists for the member", async () => {
    const year = new Date().getFullYear();
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m1",
      householdId: "hh-1",
      name: "Alice",
    } as any);
    prismaMock.giftPerson.findFirst.mockResolvedValue(null);
    prismaMock.giftPerson.create.mockResolvedValue({ id: "gp-new", householdId: "hh-1" } as any);
    prismaMock.giftPerson.findUnique.mockResolvedValue({
      id: "gp-new",
      householdId: "hh-1",
    } as any);

    await giftsService.upsertAllocation("hh-1", "member:m1", "e1", year, { planned: 30 });

    expect(prismaMock.giftPerson.create).toHaveBeenCalledWith({
      data: { householdId: "hh-1", memberId: "m1", name: "Alice", sortOrder: 999 },
    });
    const args = (prismaMock.giftAllocation.upsert.mock.calls[0] as any)[0];
    expect(args.where.giftPersonId_giftEventId_year.giftPersonId).toBe("gp-new");
  });

  it("rejects a member from another household", async () => {
    const year = new Date().getFullYear();
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", householdId: "other" } as any);
    await expect(
      giftsService.upsertAllocation("hh-1", "member:m1", "e1", year, { planned: 20 })
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("rejects when the event belongs to another household", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findUnique.mockResolvedValue({ id: "p1", householdId: "hh-1" } as any);
    prismaMock.giftEvent.findUnique.mockResolvedValue({ id: "e1", householdId: "other" } as any);
    await expect(
      giftsService.upsertAllocation("hh-1", "p1", "e1", year, { planned: 20 })
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });
});

describe("giftsService.bulkUpsertAllocations — member: prefix + edge cases", () => {
  const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Alice" };

  beforeEach(() => {
    prismaMock.auditLog.create.mockResolvedValue({} as any);
  });

  it("returns count 0 immediately for an empty cell list", async () => {
    const res = await giftsService.bulkUpsertAllocations("hh-1", { cells: [] }, ctx);
    expect(res).toEqual({ count: 0 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("upserts backing GiftPerson rows for member: cells then allocates", async () => {
    const year = new Date().getFullYear();
    prismaMock.member.findMany.mockResolvedValue([{ id: "m1", name: "Alice" }] as any);
    prismaMock.giftPerson.upsert.mockResolvedValue({ id: "gp-1" } as any);
    prismaMock.giftPerson.findMany.mockResolvedValue([{ id: "gp-1", householdId: "hh-1" }] as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([{ id: "e1", householdId: "hh-1" }] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([] as any);
    prismaMock.giftAllocation.upsert.mockResolvedValue({} as any);

    const res = await giftsService.bulkUpsertAllocations(
      "hh-1",
      { cells: [{ personId: "member:m1", eventId: "e1", year, planned: 25 }] },
      ctx
    );

    expect(prismaMock.giftPerson.upsert).toHaveBeenCalledWith({
      where: { householdId_name: { householdId: "hh-1", name: "Alice" } },
      create: { householdId: "hh-1", name: "Alice", memberId: "m1" },
      update: { memberId: "m1" },
    });
    const allocArgs = (prismaMock.giftAllocation.upsert.mock.calls[0] as any)[0];
    expect(allocArgs.where.giftPersonId_giftEventId_year.giftPersonId).toBe("gp-1");
    expect(res.count).toBe(1);
  });

  it("throws when a referenced member cannot be found", async () => {
    const year = new Date().getFullYear();
    prismaMock.member.findMany.mockResolvedValue([] as any);
    await expect(
      giftsService.bulkUpsertAllocations(
        "hh-1",
        { cells: [{ personId: "member:m1", eventId: "e1", year, planned: 25 }] },
        ctx
      )
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("throws when an event id is missing", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findMany.mockResolvedValue([{ id: "p1", householdId: "hh-1" }] as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([] as any);
    await expect(
      giftsService.bulkUpsertAllocations(
        "hh-1",
        { cells: [{ personId: "p1", eventId: "e1", year, planned: 25 }] },
        ctx
      )
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("rejects events owned by another household", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPerson.findMany.mockResolvedValue([{ id: "p1", householdId: "hh-1" }] as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([{ id: "e1", householdId: "other" }] as any);
    await expect(
      giftsService.bulkUpsertAllocations(
        "hh-1",
        { cells: [{ personId: "p1", eventId: "e1", year, planned: 25 }] },
        ctx
      )
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });
});

describe("giftsService.getPersonDetail — member: prefix branch", () => {
  it("synthesises an empty detail view for an unlinked member", async () => {
    const year = new Date().getFullYear();
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m1",
      householdId: "hh-1",
      name: "Alice",
    } as any);
    prismaMock.giftPerson.findFirst.mockResolvedValue(null);
    prismaMock.giftEvent.findMany.mockResolvedValue([
      {
        id: "e1",
        name: "Christmas",
        dateType: "shared",
        dateMonth: 12,
        dateDay: 25,
        isLocked: true,
      },
      {
        id: "e2",
        name: "Birthday",
        dateType: "personal",
        dateMonth: null,
        dateDay: null,
        isLocked: true,
      },
    ] as any);

    const detail = await giftsService.getPersonDetail("hh-1", "member:m1", year);

    expect(detail.person).toMatchObject({
      id: "member:m1",
      name: "Alice",
      isHouseholdMember: true,
      plannedTotal: 0,
      spentTotal: 0,
    });
    expect(detail.allocations).toHaveLength(2);
    const xmas = detail.allocations.find((a) => a.giftEventId === "e1")!;
    expect(xmas.resolvedMonth).toBe(12);
    const bday = detail.allocations.find((a) => a.giftEventId === "e2")!;
    expect(bday.resolvedMonth).toBe(null);
    // no GiftPerson should be created on a read
    expect(prismaMock.giftPerson.create).not.toHaveBeenCalled();
  });

  it("resolves to the linked GiftPerson when one exists for the member", async () => {
    const year = new Date().getFullYear();
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m1",
      householdId: "hh-1",
      name: "Alice",
    } as any);
    prismaMock.giftPerson.findFirst.mockResolvedValue({ id: "gp-1" } as any);
    prismaMock.giftPerson.findUnique.mockResolvedValue({
      id: "gp-1",
      householdId: "hh-1",
      name: "Alice",
      notes: null,
      sortOrder: 0,
      memberId: "m1",
    } as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([
      {
        id: "e1",
        name: "Christmas",
        dateType: "shared",
        dateMonth: 12,
        dateDay: 25,
        isLocked: true,
      },
    ] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      {
        id: "a1",
        giftPersonId: "gp-1",
        giftEventId: "e1",
        year,
        planned: 50,
        spent: null,
        status: "planned",
        notes: null,
        dateMonth: 12,
        dateDay: 20,
      },
    ] as any);

    const detail = await giftsService.getPersonDetail("hh-1", "member:m1", year);
    expect(detail.person.id).toBe("gp-1");
    const row = detail.allocations[0]!;
    // allocation-level date override wins over event default
    expect(row.resolvedDay).toBe(20);
  });

  it("rejects a member belonging to another household", async () => {
    const year = new Date().getFullYear();
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", householdId: "other" } as any);
    await expect(giftsService.getPersonDetail("hh-1", "member:m1", year)).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });
});

describe("giftsService.getPlannerState — member merge + rollover", () => {
  it("merges unlinked members and reports rolloverPending when prior year exists", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      mode: "independent",
      syncedDiscretionaryItemId: null,
    } as any);
    // budgetRow for getPlannerState, then _isRolloverPending current + prior
    prismaMock.plannerYearBudget.findUnique
      .mockResolvedValueOnce({ giftBudget: 100 } as any) // getPlannerState budgetRow
      .mockResolvedValueOnce({ giftBudget: 100 } as any) // _isRolloverPending current
      .mockResolvedValueOnce({ giftBudget: 80 } as any); // _isRolloverPending prior
    prismaMock.giftPerson.findMany.mockResolvedValue([] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([] as any);
    prismaMock.giftRolloverDismissal.findUnique.mockResolvedValue(null);
    prismaMock.member.findMany.mockResolvedValue([{ id: "m1", name: "Alice" }] as any);

    const state = await giftsService.getPlannerState("hh-1", year, "user-1");
    expect(state.people).toHaveLength(1);
    expect(state.people[0]!.id).toBe("member:m1");
    expect(state.rolloverPending).toBe(true);
  });

  it("does not flag rollover when the notification was dismissed", async () => {
    const year = new Date().getFullYear();
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      mode: "independent",
      syncedDiscretionaryItemId: null,
    } as any);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({ giftBudget: 0 } as any);
    prismaMock.giftPerson.findMany.mockResolvedValue([] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([] as any);
    prismaMock.giftRolloverDismissal.findUnique.mockResolvedValue({ id: "d1" } as any);
    prismaMock.member.findMany.mockResolvedValue([] as any);

    const state = await giftsService.getPlannerState("hh-1", year, "user-1");
    expect(state.rolloverPending).toBe(false);
  });
});

describe("giftsService._isRolloverPending", () => {
  it("returns false for non-current years", async () => {
    const result = await giftsService._isRolloverPending("hh-1", new Date().getFullYear() - 1);
    expect(result).toBe(false);
  });

  it("returns false when there is no current-year budget", async () => {
    prismaMock.plannerYearBudget.findUnique.mockResolvedValueOnce(null);
    const result = await giftsService._isRolloverPending("hh-1", new Date().getFullYear());
    expect(result).toBe(false);
  });

  it("returns true when both current and prior budgets exist", async () => {
    prismaMock.plannerYearBudget.findUnique
      .mockResolvedValueOnce({ giftBudget: 100 } as any)
      .mockResolvedValueOnce({ giftBudget: 80 } as any);
    const result = await giftsService._isRolloverPending("hh-1", new Date().getFullYear());
    expect(result).toBe(true);
  });
});

describe("giftsService.runRolloverIfNeeded — guards", () => {
  it("returns false for a non-current year", async () => {
    const result = await giftsService.runRolloverIfNeeded("hh-1", new Date().getFullYear() - 1);
    expect(result).toBe(false);
  });

  it("returns false when there is no prior-year budget to roll from", async () => {
    const year = new Date().getFullYear();
    prismaMock.plannerYearBudget.findUnique
      .mockResolvedValueOnce(null) // current absent
      .mockResolvedValueOnce(null); // prior absent
    const result = await giftsService.runRolloverIfNeeded("hh-1", year);
    expect(result).toBe(false);
    expect(prismaMock.plannerYearBudget.create).not.toHaveBeenCalled();
  });
});

describe("giftsService._ensureSyncedDiscretionaryItem", () => {
  it("throws when the Gifts subcategory is missing", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue(null);
    await expect(
      giftsService._ensureSyncedDiscretionaryItem("hh-1", {
        id: "s1",
        mode: "synced",
        syncedDiscretionaryItemId: null,
      })
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("returns settings unchanged when not in synced mode", async () => {
    const settings = { id: "s1", mode: "independent", syncedDiscretionaryItemId: null };
    const result = await giftsService._ensureSyncedDiscretionaryItem("hh-1", settings);
    expect(result).toBe(settings);
    expect(prismaMock.subcategory.findFirst).not.toHaveBeenCalled();
  });

  it("returns settings unchanged when already linked to an item", async () => {
    const settings = { id: "s1", mode: "synced", syncedDiscretionaryItemId: "d1" };
    const result = await giftsService._ensureSyncedDiscretionaryItem("hh-1", settings);
    expect(result).toBe(settings);
    expect(prismaMock.subcategory.findFirst).not.toHaveBeenCalled();
  });
});

describe("giftsService.setMode — missing subcategory guard", () => {
  it("throws when switching modes without a Gifts subcategory", async () => {
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      mode: "synced",
      syncedDiscretionaryItemId: "d1",
    } as any);
    prismaMock.subcategory.findFirst.mockResolvedValue(null);
    await expect(giftsService.setMode("hh-1", { mode: "independent" })).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });
});
