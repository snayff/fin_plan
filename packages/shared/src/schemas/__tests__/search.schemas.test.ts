import { describe, it, expect } from "bun:test";
import {
  SearchQuerySchema,
  SearchResultSchema,
  SearchResponseSchema,
  SearchResultKindEnum,
} from "../search.schemas";

describe("SearchQuerySchema", () => {
  it("trims and accepts a non-empty query", () => {
    const r = SearchQuerySchema.safeParse({ q: "  mortgage  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.q).toBe("mortgage");
  });

  it("rejects an empty query after trim", () => {
    expect(SearchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
  });

  it("rejects a query longer than 100 chars", () => {
    expect(SearchQuerySchema.safeParse({ q: "a".repeat(101) }).success).toBe(false);
  });
});

describe("SearchResultSchema", () => {
  it("accepts a valid data result", () => {
    const r = SearchResultSchema.safeParse({
      kind: "income_source",
      id: "clx1",
      name: "Salary",
      subtitle: "Income · Monthly",
      route: "/income",
      focusId: "clx1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown kind", () => {
    expect(
      SearchResultSchema.safeParse({
        kind: "not_a_kind",
        id: "x",
        name: "x",
        subtitle: "x",
        route: "/",
        focusId: "x",
      }).success
    ).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    expect(
      SearchResultSchema.safeParse({
        kind: "income_source",
        id: "x",
        name: "x",
        subtitle: "x",
        route: "/",
        focusId: "x",
        amount: 999,
      }).success
    ).toBe(false);
  });
});

describe("SearchResponseSchema", () => {
  it("accepts a results array", () => {
    const r = SearchResponseSchema.safeParse({ results: [] });
    expect(r.success).toBe(true);
  });
});

describe("SearchResultKindEnum", () => {
  it("lists exactly 8 entity kinds", () => {
    expect(SearchResultKindEnum.options).toEqual([
      "income_source",
      "committed_item",
      "discretionary_item",
      "asset",
      "account",
      "gift_person",
      "gift_event",
    ]);
  });
});
