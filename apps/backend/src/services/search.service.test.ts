import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Prisma } from "@prisma/client";
import { SearchResultKindEnum } from "@finplan/shared";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma.js";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { searchService } = await import("./search.service.js");

// $queryRaw is a tagged template: (strings, ...values). Ranking correctness
// against real data is covered in search.service.db.test.ts; these tests pin
// the query shape, parameters and result mapping.
type RawCall = [TemplateStringsArray, ...unknown[]];

function calls(): RawCall[] {
  return prismaMock.$queryRaw.mock.calls as unknown as RawCall[];
}

// The table identifier is interpolated as a Prisma.raw() fragment; the
// user-supplied values are plain strings/numbers.
function tableOf([, ...values]: RawCall): string {
  const raw = values.find(
    (v): v is Prisma.Sql =>
      typeof v === "object" && v !== null && "sql" in v && /^"\w+"$/.test((v as Prisma.Sql).sql)
  );
  return raw?.sql ?? "";
}

function rowsFor(table: string, rows: Array<Record<string, string>>) {
  prismaMock.$queryRaw.mockImplementation(((...args: RawCall) =>
    Promise.resolve(tableOf(args) === `"${table}"` ? rows : [])) as any);
}

beforeEach(() => {
  resetPrismaMocks();
  prismaMock.$queryRaw.mockResolvedValue([] as any);
});

describe("searchService.search", () => {
  it("queries each searchable kind once, scoped to the household", async () => {
    await searchService.search("hh-1", "mortgage");

    expect(calls()).toHaveLength(SearchResultKindEnum.options.length);
    for (const [, ...values] of calls()) {
      expect(values).toContain("hh-1");
      expect(values).toContain("%mortgage%");
    }
  });

  it("ranks (exact, prefix, contains) before applying the limit of 5", async () => {
    await searchService.search("hh-1", "food");

    const [strings, ...values] = calls()[0]!;
    const sql = strings.join("?");
    expect(sql).toMatch(/ORDER BY\s+CASE[\s\S]*THEN 0[\s\S]*THEN 1[\s\S]*ELSE 2[\s\S]*LIMIT/);
    expect(sql).not.toMatch(/LIMIT[\s\S]*ORDER BY/);
    expect(values).toContain("food%");
    expect(values.at(-1)).toBe(5);
  });

  it("escapes LIKE wildcards in the query", async () => {
    await searchService.search("hh-1", "50%_off\\");

    const [, ...values] = calls()[0]!;
    expect(values).toContain("%50\\%\\_off\\\\%");
    expect(values).toContain("50%_off\\"); // the exact-match comparison uses the raw query
  });

  it("maps rows to results in the order the database returns them", async () => {
    rowsFor("CommittedItem", [
      { id: "c2", name: "Food" },
      { id: "c3", name: "Food Delivery Subscription" },
      { id: "c1", name: "Monthly Food Budget" },
    ]);

    const res = await searchService.search("hh-1", "food");

    expect(res.results.map((r) => r.id)).toEqual(["c2", "c3", "c1"]);
    expect(res.results.every((r) => r.kind === "committed_item")).toBe(true);
  });

  it("carries the subcategory for tier items so the destination can select it", async () => {
    rowsFor("DiscretionaryItem", [{ id: "d1", name: "Gifts", scope: "sub-gifts" }]);
    const res = await searchService.search("hh-1", "gifts");
    expect(res.results).toEqual([
      expect.objectContaining({ kind: "discretionary_item", id: "d1", subcategoryId: "sub-gifts" }),
    ]);
    const [, ...values] = calls().find((c) => tableOf(c) === '"DiscretionaryItem"')!;
    const fragments = values.map((v) => (v as Prisma.Sql)?.sql ?? "").join(" ");
    expect(fragments).toContain('"subcategoryId"::text AS "scope"');
  });

  it("carries the type for assets and accounts so the destination can select it", async () => {
    rowsFor("Account", [{ id: "ac1", name: "ISA", scope: "Savings" }]);
    const res = await searchService.search("hh-1", "isa");
    expect(res.results).toEqual([
      expect.objectContaining({ kind: "account", id: "ac1", type: "Savings" }),
    ]);
  });

  it("omits scoping fields for kinds whose page has no sub-selection", async () => {
    rowsFor("GiftPerson", [{ id: "g1", name: "Mum" }]);
    const res = await searchService.search("hh-1", "mum");
    expect(res.results[0]).not.toHaveProperty("subcategoryId");
    expect(res.results[0]).not.toHaveProperty("type");
  });

  it("returns an empty array when nothing matches", async () => {
    const res = await searchService.search("hh-1", "zzz-no-match");
    expect(res.results).toEqual([]);
  });

  it("returns an empty array for a whitespace-only query without querying", async () => {
    const res = await searchService.search("hh-1", "   ");
    expect(res.results).toEqual([]);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("produces the design-system subtitle and route for each kind", async () => {
    rowsFor("Asset", [{ id: "a1", name: "Flat" }]);
    const res = await searchService.search("hh-1", "flat");
    const asset = res.results.find((r) => r.kind === "asset");
    expect(asset?.subtitle).toBe("Wealth · Asset");
    expect(asset?.route).toBe("/assets");
    expect(asset?.focusId).toBe("a1");
  });
});
