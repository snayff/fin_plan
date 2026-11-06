import { describe, it, expect } from "bun:test";
import { toMonthlyAmount } from "@finplan/shared";
import { extractDrillItems } from "./doughnutData";
import type { WaterfallSummary } from "@finplan/shared";

const baseSummary: WaterfallSummary = {
  income: {
    total: 5000,
    byType: [],
    bySubcategory: [],
    monthly: [],
    nonMonthly: [],
    oneOff: [],
  },
  committed: {
    monthlyTotal: 2000,
    monthlyAvg12: 2000,
    bySubcategory: [
      {
        id: "s1",
        name: "Housing",
        sortOrder: 0,
        monthlyTotal: 1500,
        oldestReviewedAt: null,
        itemCount: 2,
      },
    ],
    bills: [
      {
        id: "b1",
        householdId: "h1",
        name: "Mortgage",
        amount: 1200,
        memberId: null,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "s1",
        spendType: "monthly",
      },
    ],
    nonMonthlyBills: [
      {
        id: "y1",
        householdId: "h1",
        name: "Home Insurance",
        amount: 3600,
        dueMonth: 3,
        sortOrder: 0,
        lastReviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategoryId: "s1",
        spendType: "yearly",
      },
    ],
  },
  discretionary: {
    total: 1500,
    bySubcategory: [],
    categories: [],
    savings: { total: 0, allocations: [] },
  },
  surplus: { amount: 1500, percentOfIncome: 30 },
};

describe("extractDrillItems", () => {
  it("combines committed bills and yearly bills (÷12) for committed tier", () => {
    const items = extractDrillItems("committed", baseSummary);
    expect(items).toHaveLength(2);

    const mortgage = items.find((i) => i.name === "Mortgage");
    expect(mortgage?.amount).toBe(1200);

    const insurance = items.find((i) => i.name === "Home Insurance");
    expect(insurance?.amount).toBe(300); // 3600 / 12
  });

  it("converts a weekly committed bill to its monthly equivalent", () => {
    const summary = {
      ...baseSummary,
      committed: {
        ...baseSummary.committed,
        bills: [
          {
            id: "bw",
            householdId: "h1",
            name: "Cleaner",
            amount: 50,
            memberId: null,
            sortOrder: 0,
            lastReviewedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            subcategoryId: "s1",
            spendType: "weekly" as const,
          },
        ],
        nonMonthlyBills: [],
      },
    };
    const items = extractDrillItems("committed", summary);
    const cleaner = items.find((i) => i.name === "Cleaner");
    expect(cleaner?.amount).toBe(toMonthlyAmount(50, "weekly"));
    // Single segment sums to the tier total of all segments.
    const segmentTotal = items.reduce((sum, i) => sum + i.amount, 0);
    expect(segmentTotal).toBe(toMonthlyAmount(50, "weekly"));
  });

  it("combines discretionary categories and savings for discretionary tier", () => {
    const summary = {
      ...baseSummary,
      discretionary: {
        total: 1500,
        bySubcategory: [
          {
            id: "d1",
            name: "Fun",
            sortOrder: 0,
            monthlyTotal: 1000,
            oldestReviewedAt: null,
            itemCount: 1,
          },
        ],
        categories: [
          {
            id: "c1",
            householdId: "h1",
            name: "Dining Out",
            monthlyBudget: 500,
            sortOrder: 0,
            lastReviewedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            subcategoryId: "d1",
          },
        ],
        savings: {
          total: 500,
          allocations: [
            {
              id: "sa1",
              householdId: "h1",
              name: "Emergency Fund",
              monthlyAmount: 500,
              sortOrder: 0,
              lastReviewedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
              subcategoryId: "d1",
            },
          ],
        },
      },
    };

    const items = extractDrillItems("discretionary", summary);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.name === "Dining Out")?.amount).toBe(500);
    expect(items.find((i) => i.name === "Emergency Fund")?.amount).toBe(500);
  });

  it("returns empty array when committed has no bills or yearly bills", () => {
    const summary = {
      ...baseSummary,
      committed: {
        ...baseSummary.committed,
        bills: [],
        nonMonthlyBills: [],
      },
    };
    const items = extractDrillItems("committed", summary);
    expect(items).toHaveLength(0);
  });

  it("returns empty array when discretionary has no categories or savings", () => {
    const items = extractDrillItems("discretionary", baseSummary);
    expect(items).toHaveLength(0);
  });

  it("falls back to empty string when subcategoryId is undefined", () => {
    const summary = {
      ...baseSummary,
      committed: {
        ...baseSummary.committed,
        bills: [
          {
            id: "b2",
            householdId: "h1",
            name: "No SubCat Bill",
            amount: 100,
            memberId: null,
            sortOrder: 0,
            lastReviewedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        nonMonthlyBills: [],
      },
    };
    const items = extractDrillItems("committed", summary);
    expect(items[0]?.subcategoryId).toBe("");
  });
});
