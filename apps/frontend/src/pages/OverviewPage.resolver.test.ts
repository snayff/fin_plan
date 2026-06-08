import { describe, expect, test } from "bun:test";
import type { WaterfallSummary } from "@finplan/shared";
import { resolveOverviewView } from "./OverviewPage";

function makeSummary(): WaterfallSummary {
  return {
    income: {
      total: 1000,
      byType: [
        {
          type: "salary",
          total: 1000,
          sources: [
            {
              id: "src-1",
              name: "Acme Salary",
              amount: 1000,
              lastReviewedAt: new Date("2026-01-01").toISOString(),
            },
          ],
        },
      ],
    },
    committed: {
      total: 200,
      bills: [
        {
          id: "bill-1",
          name: "Rent",
          amount: 200,
          lastReviewedAt: new Date("2026-01-15").toISOString(),
        },
      ],
    },
    discretionary: { total: 0, categories: [] },
    surplus: 800,
  } as unknown as WaterfallSummary;
}

describe("resolveOverviewView", () => {
  test("null param resolves to none", () => {
    expect(resolveOverviewView(null, makeSummary())).toEqual({ type: "none" });
  });

  test("committed-bills param resolves to committed_bills view", () => {
    expect(resolveOverviewView("committed-bills", makeSummary())).toEqual({
      type: "committed_bills",
    });
  });

  test("type:<valid> resolves to income_type view with label", () => {
    expect(resolveOverviewView("type:salary", makeSummary())).toEqual({
      type: "income_type",
      incomeType: "salary",
      label: "Salary",
    });
  });

  test("type:<unknown> resolves to none", () => {
    expect(resolveOverviewView("type:bogus", makeSummary())).toEqual({ type: "none" });
  });

  test("item:<id> resolves against income sources", () => {
    const result = resolveOverviewView("item:src-1", makeSummary());
    expect(result.type).toBe("item");
    if (result.type === "item") {
      expect(result.item.id).toBe("src-1");
      expect(result.item.name).toBe("Acme Salary");
      expect(result.item.type).toBe("income");
    }
  });

  test("item:<id> resolves against committed bills", () => {
    const result = resolveOverviewView("item:bill-1", makeSummary());
    expect(result.type).toBe("item");
    if (result.type === "item") {
      expect(result.item.id).toBe("bill-1");
      expect(result.item.name).toBe("Rent");
      expect(result.item.type).toBe("committed");
    }
  });

  test("item:<unknown id> resolves to none", () => {
    expect(resolveOverviewView("item:does-not-exist", makeSummary())).toEqual({ type: "none" });
  });

  test("item:<id> without summary resolves to none", () => {
    expect(resolveOverviewView("item:src-1", undefined)).toEqual({ type: "none" });
  });

  test("malformed param resolves to none", () => {
    expect(resolveOverviewView("garbage", makeSummary())).toEqual({ type: "none" });
  });
});
