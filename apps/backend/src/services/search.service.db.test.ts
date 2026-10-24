import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prisma } from "../config/database.js";
import { createTestHousehold } from "../test/helpers/test-db.js";
import { searchService } from "./search.service.js";

// Runs against the real database: ranking must happen in SQL, so only a real
// query can prove the best matches survive when a kind has many matches.
describe("searchService.search (database)", () => {
  let householdId: string;
  let otherHouseholdId: string;
  let subcategoryId: string;

  beforeAll(async () => {
    householdId = (await createTestHousehold()).id;
    otherHouseholdId = (await createTestHousehold()).id;

    // 24 contains-only matches inserted first, then the prefix and exact
    // matches last — an unordered over-fetch of 20 would drop the latter.
    await prisma.giftPerson.createMany({
      data: Array.from({ length: 24 }, (_, i) => ({
        householdId,
        name: `Side pay ${String(i).padStart(2, "0")}`,
      })),
    });
    await prisma.giftPerson.create({ data: { householdId, name: "Payroll bonus" } });
    await prisma.giftPerson.create({ data: { householdId, name: "Pay" } });
    await prisma.giftPerson.create({ data: { householdId: otherHouseholdId, name: "Pay" } });

    const sub = await prisma.subcategory.create({
      data: { householdId, tier: "discretionary", name: "Holidays", sortOrder: 0 },
    });
    subcategoryId = sub.id;
    await prisma.discretionaryItem.create({
      data: { householdId, subcategoryId, name: "Scoped trip" },
    });
    await prisma.account.create({ data: { householdId, name: "Scoped ISA", type: "Savings" } });
  });

  afterAll(async () => {
    await prisma.discretionaryItem.deleteMany({ where: { householdId } });
    await prisma.subcategory.deleteMany({ where: { householdId } });
    await prisma.account.deleteMany({ where: { householdId } });
    await prisma.giftPerson.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await prisma.household.delete({ where: { id: householdId } });
    await prisma.household.delete({ where: { id: otherHouseholdId } });
  });

  it("returns exact, then prefix, then contains matches even when a kind has >20 matches", async () => {
    const res = await searchService.search(householdId, "pay");
    const names = res.results.filter((r) => r.kind === "gift_person").map((r) => r.name);

    expect(names).toEqual(["Pay", "Payroll bonus", "Side pay 00", "Side pay 01", "Side pay 02"]);
  });

  it("only returns rows from the caller's household", async () => {
    const res = await searchService.search(otherHouseholdId, "pay");
    expect(res.results.map((r) => r.name)).toEqual(["Pay"]);
  });

  it("returns the subcategory for tier items and the type for accounts", async () => {
    const res = await searchService.search(householdId, "scoped");
    expect(res.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "discretionary_item", name: "Scoped trip", subcategoryId }),
        expect.objectContaining({ kind: "account", name: "Scoped ISA", type: "Savings" }),
      ])
    );
  });

  it("treats LIKE wildcards in the query literally", async () => {
    const res = await searchService.search(householdId, "%");
    expect(res.results).toEqual([]);
  });
});
