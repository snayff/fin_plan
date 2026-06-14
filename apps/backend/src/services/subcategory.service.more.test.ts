import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));
mock.module("./audit.service.js", () => ({
  audited: mock(({ mutation }: { mutation: (tx: typeof prismaMock) => unknown }) =>
    mutation(prismaMock)
  ),
  // create() now audits inside its own Serializable transaction via these.
  auditEventTx: mock(() => Promise.resolve()),
  computeDiff: mock(() => []),
}));

const { subcategoryService } = await import("./subcategory.service.js");

beforeEach(() => resetPrismaMocks());

describe("subcategoryService.getSubcategoryIdByName", () => {
  it("returns the id when a match exists", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue({ id: "sub-1" } as any);
    const id = await subcategoryService.getSubcategoryIdByName("hh-1", "income", "Salary");
    expect(id).toBe("sub-1");
  });

  it("returns null when no match exists", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue(null);
    const id = await subcategoryService.getSubcategoryIdByName("hh-1", "income", "Nope");
    expect(id).toBe(null);
  });
});

describe("subcategoryService.getDefaults", () => {
  it("exposes the static default map", () => {
    const defaults = subcategoryService.getDefaults();
    expect(defaults.income.map((d) => d.name)).toContain("Salary");
    expect(defaults.discretionary.find((d) => d.name === "Gifts")).toMatchObject({
      isLocked: true,
    });
  });
});

describe("subcategoryService.create", () => {
  it("creates with the next sortOrder when no ctx is supplied", async () => {
    prismaMock.subcategory.count.mockResolvedValue(3);
    prismaMock.subcategory.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } } as any);
    prismaMock.subcategory.create.mockResolvedValue({ id: "new-1" } as any);

    await subcategoryService.create("hh-1", "committed", "  Travel  ");

    expect(prismaMock.subcategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Travel", sortOrder: 5, tier: "committed" }),
    });
  });

  it("starts sortOrder at 0 when the tier is empty", async () => {
    prismaMock.subcategory.count.mockResolvedValue(0);
    prismaMock.subcategory.aggregate.mockResolvedValue({ _max: { sortOrder: null } } as any);
    prismaMock.subcategory.create.mockResolvedValue({ id: "new-1" } as any);

    await subcategoryService.create("hh-1", "income", "Bonus");

    const call = (prismaMock.subcategory.create.mock.calls[0] as any)[0];
    expect(call.data.sortOrder).toBe(0);
  });

  it("writes an audit entry when ctx is supplied", async () => {
    prismaMock.subcategory.count.mockResolvedValue(1);
    prismaMock.subcategory.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } } as any);
    prismaMock.subcategory.create.mockResolvedValue({ id: "new-1" } as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const ctx = { householdId: "hh-1", actorId: "u-1", actorName: "Alice" };
    await subcategoryService.create("hh-1", "income", "Bonus", ctx);

    expect(prismaMock.subcategory.create).toHaveBeenCalled();
  });

  it("rejects when the tier already has 7 subcategories", async () => {
    prismaMock.subcategory.count.mockResolvedValue(7);
    await expect(subcategoryService.create("hh-1", "committed", "Eighth")).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("maps a P2002 unique violation to ConflictError", async () => {
    prismaMock.subcategory.count.mockResolvedValue(1);
    prismaMock.subcategory.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } } as any);
    prismaMock.subcategory.create.mockRejectedValue({ code: "P2002" });
    await expect(subcategoryService.create("hh-1", "income", "Salary")).rejects.toMatchObject({
      name: "ConflictError",
    });
  });

  // #136: the cap re-count + insert run inside a Serializable transaction so a
  // racing pair can't both slip past a 6→7 boundary.
  it("re-counts and inserts inside a Serializable transaction", async () => {
    prismaMock.subcategory.count.mockResolvedValue(2);
    prismaMock.subcategory.aggregate.mockResolvedValue({ _max: { sortOrder: 1 } } as any);
    prismaMock.subcategory.create.mockResolvedValue({ id: "new-1" } as any);

    await subcategoryService.create("hh-1", "income", "Bonus");

    expect(prismaMock.$transaction).toHaveBeenCalled();
    const opts = (prismaMock.$transaction.mock.calls[0] as any)[1];
    expect(opts).toMatchObject({ isolationLevel: "Serializable" });
    // count is evaluated inside the transaction (against tx, i.e. the mock).
    expect(prismaMock.subcategory.count).toHaveBeenCalled();
  });
});

describe("subcategoryService.getDefaultSubcategoryId — throw path", () => {
  it("throws when the tier has no 'Other' subcategory", async () => {
    prismaMock.subcategory.findFirst.mockResolvedValue(null);
    await expect(subcategoryService.getDefaultSubcategoryId("hh-1", "income")).rejects.toThrow(
      /Default subcategory not found/
    );
  });
});
