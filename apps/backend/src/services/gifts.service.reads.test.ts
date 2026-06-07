import { describe, it, expect, beforeEach, mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { giftsService } = await import("./gifts.service.js");

const YEAR = new Date().getFullYear();

beforeEach(() => resetPrismaMocks());

// ─── listEventsForConfig / listYearsWithData ────────────────────────────────────

describe("giftsService.listEventsForConfig", () => {
  it("returns events ordered by locked, sortOrder, name", async () => {
    prismaMock.giftEvent.findMany.mockResolvedValue([{ id: "e1", name: "Birthday" }] as any);
    const result = await giftsService.listEventsForConfig("hh-1");
    expect(result).toEqual([{ id: "e1", name: "Birthday" }] as any);
    expect(prismaMock.giftEvent.findMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1" },
      orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  });
});

describe("giftsService.listYearsWithData", () => {
  it("maps planner-year-budget rows to a descending list of years", async () => {
    prismaMock.plannerYearBudget.findMany.mockResolvedValue([
      { year: 2026 },
      { year: 2025 },
    ] as any);
    const result = await giftsService.listYearsWithData("hh-1");
    expect(result).toEqual([2026, 2025]);
  });
});

// ─── listPeopleForConfig ────────────────────────────────────────────────────────

describe("giftsService.listPeopleForConfig", () => {
  it("merges household members without a GiftPerson and counts allocation statuses", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([
      {
        id: "gp1",
        name: "Mum",
        notes: null,
        sortOrder: 0,
        memberId: null,
        allocations: [{ status: "planned" }, { status: "bought" }, { status: "planned" }],
      },
    ] as any);
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m1", name: "Alex" },
      { id: "m2", name: "Sam" },
    ] as any);

    const result = await giftsService.listPeopleForConfig("hh-1", "all", YEAR);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: "gp1", plannedCount: 2, boughtCount: 1 });
    // Members with no GiftPerson are surfaced as virtual `member:` rows.
    expect(result.map((p) => p.id)).toEqual(["gp1", "member:m1", "member:m2"]);
  });

  it("filters to household members and excludes already-linked members", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([
      { id: "gp2", name: "Alex", notes: null, sortOrder: 0, memberId: "m1", allocations: [] },
    ] as any);
    prismaMock.member.findMany.mockResolvedValue([{ id: "m1", name: "Alex" }] as any);

    const result = await giftsService.listPeopleForConfig("hh-1", "household", YEAR);

    expect(prismaMock.giftPerson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "hh-1", memberId: { not: null } } })
    );
    expect(result.map((p) => p.id)).toEqual(["gp2"]);
  });

  it("skips the member query entirely for the non-household filter", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([]);
    const result = await giftsService.listPeopleForConfig("hh-1", "non-household", YEAR);
    expect(result).toEqual([]);
    expect(prismaMock.member.findMany).not.toHaveBeenCalled();
  });
});

// ─── getQuickAddMatrix ──────────────────────────────────────────────────────────

describe("giftsService.getQuickAddMatrix", () => {
  it("returns people (incl. virtual members), events, allocations and budget totals", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([
      { id: "gp1", name: "Mum", memberId: null },
    ] as any);
    prismaMock.member.findMany.mockResolvedValue([{ id: "m1", name: "Alex" }] as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([{ id: "e1", name: "Birthday" }] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      { giftPersonId: "gp1", giftEventId: "e1", planned: 50 },
      { giftPersonId: "gp1", giftEventId: "e1", planned: null },
    ] as any);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue({ giftBudget: 500 } as any);

    const result = await giftsService.getQuickAddMatrix("hh-1", YEAR);

    expect(result.people.map((p) => p.id)).toEqual(["gp1", "member:m1"]);
    expect(result.events).toEqual([{ id: "e1", name: "Birthday" }] as any);
    expect(result.allocations).toEqual([
      { personId: "gp1", eventId: "e1", planned: 50 },
      { personId: "gp1", eventId: "e1", planned: 0 },
    ]);
    expect(result.budget).toEqual({ annual: 500, currentPlanned: 50 });
  });

  it("defaults the budget to 0 when no planner-year-budget row exists", async () => {
    prismaMock.giftPerson.findMany.mockResolvedValue([]);
    prismaMock.member.findMany.mockResolvedValue([]);
    prismaMock.giftEvent.findMany.mockResolvedValue([]);
    prismaMock.giftAllocation.findMany.mockResolvedValue([]);
    prismaMock.plannerYearBudget.findUnique.mockResolvedValue(null as any);

    const result = await giftsService.getQuickAddMatrix("hh-1", YEAR);
    expect(result.budget).toEqual({ annual: 0, currentPlanned: 0 });
  });
});

// ─── getPersonDetail — virtual member branch ────────────────────────────────────

describe("giftsService.getPersonDetail — virtual member ids", () => {
  it("synthesises an empty detail view for a member with no GiftPerson record", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m1",
      householdId: "hh-1",
      name: "Alex",
    } as any);
    prismaMock.giftPerson.findFirst.mockResolvedValue(null);
    prismaMock.giftEvent.findMany.mockResolvedValue([
      { id: "e1", name: "Birthday", dateType: "personal", isLocked: false },
      {
        id: "e2",
        name: "Christmas",
        dateType: "shared",
        isLocked: true,
        dateMonth: 12,
        dateDay: 25,
      },
    ] as any);

    const result = await giftsService.getPersonDetail("hh-1", "member:m1", YEAR);

    expect(result.person).toMatchObject({
      id: "member:m1",
      name: "Alex",
      isHouseholdMember: true,
      plannedTotal: 0,
    });
    expect(result.allocations).toHaveLength(2);
    // Shared events resolve their month/day; personal ones stay null.
    expect(result.allocations[1]).toMatchObject({ resolvedMonth: 12, resolvedDay: 25 });
    expect(result.allocations[0]).toMatchObject({ resolvedMonth: null, resolvedDay: null });
  });

  it("resolves a virtual member id to its linked GiftPerson when one exists", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m1",
      householdId: "hh-1",
      name: "Alex",
    } as any);
    prismaMock.giftPerson.findFirst.mockResolvedValue({ id: "gp1" } as any);
    prismaMock.giftPerson.findUnique.mockResolvedValue({
      id: "gp1",
      householdId: "hh-1",
      name: "Alex",
      notes: null,
      sortOrder: 0,
      memberId: "m1",
    } as any);
    prismaMock.giftEvent.findMany.mockResolvedValue([
      { id: "e1", name: "Birthday", dateType: "personal", isLocked: false },
    ] as any);
    prismaMock.giftAllocation.findMany.mockResolvedValue([
      { id: "al1", giftEventId: "e1", planned: 40, spent: 60, status: "bought", notes: "wrapped" },
    ] as any);

    const result = await giftsService.getPersonDetail("hh-1", "member:m1", YEAR);

    expect(result.person.id).toBe("gp1");
    expect(result.person.isHouseholdMember).toBe(true);
    expect(result.person.boughtCount).toBe(1);
    expect(result.person.hasOverspend).toBe(true); // spent 60 > planned 40
    expect(result.allocations[0]).toMatchObject({ id: "al1", planned: 40, spent: 60 });
  });

  it("throws NotFoundError for a virtual id whose member is in another household", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", householdId: "other" } as any);
    await expect(giftsService.getPersonDetail("hh-1", "member:m1", YEAR)).rejects.toThrow(
      "Gift person not found"
    );
  });
});

// ─── runRolloverIfNeeded — guards + synced branch ───────────────────────────────

describe("giftsService.runRolloverIfNeeded additional branches", () => {
  it("does nothing for a non-current year", async () => {
    const result = await giftsService.runRolloverIfNeeded("hh-1", YEAR - 1);
    expect(result).toBe(false);
    expect(prismaMock.plannerYearBudget.findUnique).not.toHaveBeenCalled();
  });

  it("does nothing when there is no prior-year budget to roll over", async () => {
    prismaMock.plannerYearBudget.findUnique
      .mockResolvedValueOnce(null) // current year missing
      .mockResolvedValueOnce(null); // prior year missing
    const result = await giftsService.runRolloverIfNeeded("hh-1", YEAR);
    expect(result).toBe(false);
    expect(prismaMock.plannerYearBudget.create).not.toHaveBeenCalled();
  });

  it("rolls the synced budget forward into a new ItemAmountPeriod", async () => {
    prismaMock.plannerYearBudget.findUnique
      .mockResolvedValueOnce(null) // current year missing → proceed
      .mockResolvedValueOnce({ giftBudget: 750 } as any); // prior year present
    prismaMock.giftAllocation.findMany.mockResolvedValue([]);
    prismaMock.plannerYearBudget.create.mockResolvedValue({} as any);
    prismaMock.giftPlannerSettings.findUnique.mockResolvedValue({
      id: "s1",
      householdId: "hh-1",
      mode: "synced",
      syncedDiscretionaryItemId: "di-synced",
    } as any);
    prismaMock.itemAmountPeriod.upsert.mockResolvedValue({} as any);

    const result = await giftsService.runRolloverIfNeeded("hh-1", YEAR);

    expect(result).toBe(true);
    expect(prismaMock.plannerYearBudget.create).toHaveBeenCalledWith({
      data: { householdId: "hh-1", year: YEAR, giftBudget: 750 },
    });
    expect(prismaMock.itemAmountPeriod.upsert).toHaveBeenCalled();
  });
});
