import { describe, it, expect } from "bun:test";
import {
  userResponseSchema,
  authLoginResponseSchema,
  householdWithCountResponseSchema,
  successResponseSchema,
  errorResponseSchema,
  messageResponseSchema,
  assetItemResponseSchema,
  accountItemResponseSchema,
  assetsSummaryResponseSchema,
  purchaseItemResponseSchema,
  yearBudgetResponseSchema,
  householdSettingsResponseSchema,
  snapshotListItemResponseSchema,
  snapshotDetailResponseSchema,
  giftPersonResponseSchema,
  giftEventResponseSchema,
  giftConfigPersonResponseSchema,
  giftAllocationResponseSchema,
  waterfallHistoryResponseSchema,
} from "./responses";

const ISO = "2026-01-01T00:00:00.000Z";

const validUser = {
  id: "u1",
  email: "ann@example.com",
  name: "Ann",
  activeHouseholdId: null,
  createdAt: ISO,
  updatedAt: ISO,
};

describe("userResponseSchema", () => {
  it("parses a valid user (preferences optional)", () => {
    expect(userResponseSchema.parse(validUser)).toEqual(validUser);
  });

  it("requires ISO 8601 datetimes with offset", () => {
    expect(() => userResponseSchema.parse({ ...validUser, createdAt: "2026-01-01" })).toThrow();
  });

  // The security promise: .strict() rejects unexpected fields so a leaked
  // sensitive column (passwordHash, twoFactorSecret) never validates as a
  // response shape.
  it("rejects a leaked passwordHash field (strict allowlist)", () => {
    expect(() => userResponseSchema.parse({ ...validUser, passwordHash: "$2b$10$leak" })).toThrow();
  });

  it("rejects a leaked twoFactorSecret field (strict allowlist)", () => {
    expect(() => userResponseSchema.parse({ ...validUser, twoFactorSecret: "JBSWY3DP" })).toThrow();
  });
});

describe("authLoginResponseSchema", () => {
  const valid = { user: validUser, accessToken: "a", refreshToken: "r" };

  it("parses a valid login response", () => {
    expect(authLoginResponseSchema.parse(valid)).toEqual(valid);
  });

  it("rejects an unexpected top-level field", () => {
    expect(() => authLoginResponseSchema.parse({ ...valid, sessionId: "s" })).toThrow();
  });

  it("rejects a sensitive field leaked on the nested user (nested strict)", () => {
    expect(() =>
      authLoginResponseSchema.parse({
        ...valid,
        user: { ...validUser, twoFactorBackupCodes: ["x"] },
      })
    ).toThrow();
  });
});

describe("nested + generic response schemas are strict", () => {
  it("householdWithCountResponseSchema rejects extras on the _count object", () => {
    const base = {
      id: "h1",
      name: "Home",
      createdAt: ISO,
      updatedAt: ISO,
      _count: { members: 2 },
    };
    expect(householdWithCountResponseSchema.parse(base)).toEqual(base);
    expect(() =>
      householdWithCountResponseSchema.parse({ ...base, _count: { members: 2, invites: 1 } })
    ).toThrow();
  });

  it("successResponseSchema only accepts { success: true }", () => {
    expect(successResponseSchema.parse({ success: true })).toEqual({ success: true });
    expect(() => successResponseSchema.parse({ success: false })).toThrow();
    expect(() => successResponseSchema.parse({ success: true, extra: 1 })).toThrow();
  });

  it("messageResponseSchema rejects extra fields", () => {
    expect(messageResponseSchema.parse({ message: "ok" })).toEqual({ message: "ok" });
    expect(() => messageResponseSchema.parse({ message: "ok", code: 1 })).toThrow();
  });

  it("errorResponseSchema enforces the strict error envelope", () => {
    const err = { error: { code: "NOT_FOUND", message: "missing", statusCode: 404 } };
    expect(errorResponseSchema.parse(err)).toEqual(err);
    expect(() =>
      errorResponseSchema.parse({ error: { code: "X", message: "m", stack: "trace" } })
    ).toThrow();
  });
});

// ─── Newly-added domain response contracts ──────────────────────────────────

describe("assetItemResponseSchema", () => {
  const validAsset = {
    id: "a1",
    name: "Flat",
    type: "Property",
    householdId: "h1",
    memberId: null,
    growthRatePct: 3.5,
    lastReviewedAt: ISO,
    disposedAt: null,
    disposalAccountId: null,
    createdAt: ISO,
    updatedAt: ISO,
    currentBalance: 250000,
    currentBalanceDate: "2026-01-01",
    balances: [{ id: "b1", value: 250000, date: "2026-01-01", note: null, createdAt: ISO }],
  };

  it("parses a valid asset item", () => {
    expect(assetItemResponseSchema.parse(validAsset)).toEqual(validAsset);
  });

  it("rejects an invalid asset type", () => {
    expect(() => assetItemResponseSchema.parse({ ...validAsset, type: "Crypto" })).toThrow();
  });

  it("rejects a missing required field", () => {
    const { currentBalance: _omit, ...rest } = validAsset;
    expect(() => assetItemResponseSchema.parse(rest)).toThrow();
  });
});

describe("accountItemResponseSchema", () => {
  const validAccount = {
    id: "ac1",
    name: "ISA",
    type: "Savings",
    householdId: "h1",
    memberId: "m1",
    growthRatePct: 4,
    lastReviewedAt: null,
    disposedAt: null,
    disposalAccountId: null,
    createdAt: ISO,
    updatedAt: ISO,
    currentBalance: 5000,
    currentBalanceDate: null,
    monthlyContribution: 200,
    monthlyContributionLimit: 500,
    isISA: true,
    isaYearContribution: 1200,
    spareMonthly: 300,
    isOverCap: false,
    hasSpareCapacityNudge: false,
    higherRateTarget: null,
    effectiveGrowthRatePct: 4,
    linkedItems: [
      { id: "d1", name: "ISA saving", spendType: "monthly", amount: 200, lumpSumExceedsCap: false },
    ],
    balances: [],
  };

  it("parses a valid account item (extra backend-only fields allowed)", () => {
    // list handlers spread the full Prisma row, e.g. isCashflowLinked — not
    // strict, so unknown extras must not cause a parse failure.
    expect(() =>
      accountItemResponseSchema.parse({ ...validAccount, isCashflowLinked: true })
    ).not.toThrow();
  });

  it("rejects a non-boolean isISA", () => {
    expect(() => accountItemResponseSchema.parse({ ...validAccount, isISA: "yes" })).toThrow();
  });
});

describe("assetsSummaryResponseSchema", () => {
  it("parses a valid summary", () => {
    const summary = {
      assetTotals: { Property: 250000, Vehicle: 8000, Other: 0 },
      accountTotals: { Current: 1000, Savings: 5000, Pension: 0, StocksAndShares: 0, Other: 0 },
      grandTotal: 264000,
    };
    expect(assetsSummaryResponseSchema.parse(summary)).toEqual(summary);
  });

  it("rejects a non-numeric total", () => {
    expect(() =>
      assetsSummaryResponseSchema.parse({
        assetTotals: { Property: "lots" },
        accountTotals: {},
        grandTotal: 1,
      })
    ).toThrow();
  });
});

describe("planner responses", () => {
  const validPurchase = {
    id: "p1",
    householdId: "h1",
    yearAdded: 2026,
    name: "Sofa",
    estimatedCost: 900,
    priority: "medium",
    scheduledThisYear: true,
    fundingSources: ["surplus"],
    fundingAccountId: null,
    status: "not_started",
    reason: null,
    comment: null,
    addedAt: ISO,
    createdAt: ISO,
    updatedAt: ISO,
  };

  it("purchaseItemResponseSchema parses a valid purchase", () => {
    expect(purchaseItemResponseSchema.parse(validPurchase)).toEqual(validPurchase);
  });

  it("purchaseItemResponseSchema rejects an invalid priority", () => {
    expect(() =>
      purchaseItemResponseSchema.parse({ ...validPurchase, priority: "urgent" })
    ).toThrow();
  });

  it("yearBudgetResponseSchema allows the transient default (null id/timestamps)", () => {
    const transient = {
      id: null,
      householdId: "h1",
      year: 2026,
      purchaseBudget: 0,
      giftBudget: 0,
      createdAt: null,
      updatedAt: null,
    };
    expect(yearBudgetResponseSchema.parse(transient)).toEqual(transient);
  });
});

describe("householdSettingsResponseSchema", () => {
  const validSettings = {
    id: "s1",
    householdId: "h1",
    surplusBenchmarkPct: 10,
    isaAnnualLimit: 20000,
    isaYearStartMonth: 4,
    isaYearStartDay: 6,
    stalenessThresholds: {
      income_source: 12,
      committed_item: 6,
      discretionary_item: 12,
      asset_item: 12,
      account_item: 3,
    },
    currentRatePct: 0,
    savingsRatePct: 4,
    investmentRatePct: 7,
    pensionRatePct: 6,
    inflationRatePct: 2.5,
    showPence: false,
    waterfallTipDismissed: false,
    propertyRatePct: 3.5,
    vehicleRatePct: -15,
    otherAssetRatePct: 0,
    createdAt: ISO,
    updatedAt: ISO,
  };

  it("parses a valid settings row", () => {
    expect(householdSettingsResponseSchema.parse(validSettings)).toEqual(validSettings);
  });

  it("rejects a malformed stalenessThresholds blob", () => {
    expect(() =>
      householdSettingsResponseSchema.parse({
        ...validSettings,
        stalenessThresholds: { income_source: "soon" },
      })
    ).toThrow();
  });
});

describe("snapshot responses", () => {
  it("snapshotListItemResponseSchema parses a list projection", () => {
    const row = { id: "sn1", name: "Jan 2026", isAuto: true, createdAt: ISO };
    expect(snapshotListItemResponseSchema.parse(row)).toEqual(row);
  });

  it("snapshotDetailResponseSchema parses a detail row with a data blob", () => {
    const detail = {
      id: "sn1",
      householdId: "h1",
      name: "Jan 2026",
      isAuto: false,
      data: { income: { total: 5000 }, assetsTotal: 264000 },
      createdAt: ISO,
    };
    expect(snapshotDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it("snapshotDetailResponseSchema rejects a non-object data blob", () => {
    expect(() =>
      snapshotDetailResponseSchema.parse({
        id: "sn1",
        householdId: "h1",
        name: "x",
        isAuto: false,
        data: "not-an-object",
        createdAt: ISO,
      })
    ).toThrow();
  });
});

describe("gift config responses", () => {
  it("giftPersonResponseSchema parses a valid person", () => {
    const person = {
      id: "gp1",
      householdId: "h1",
      name: "Alex",
      notes: null,
      sortOrder: 0,
      memberId: null,
      createdAt: ISO,
      updatedAt: ISO,
    };
    expect(giftPersonResponseSchema.parse(person)).toEqual(person);
  });

  it("giftEventResponseSchema rejects an invalid dateType", () => {
    expect(() =>
      giftEventResponseSchema.parse({
        id: "ge1",
        householdId: "h1",
        name: "Birthday",
        dateType: "annual",
        dateMonth: null,
        dateDay: null,
        isLocked: true,
        sortOrder: 0,
        createdAt: ISO,
        updatedAt: ISO,
      })
    ).toThrow();
  });

  it("giftConfigPersonResponseSchema parses a merged config person", () => {
    const row = {
      id: "member:m1",
      name: "Sam",
      notes: null,
      sortOrder: 999,
      memberId: "m1",
      plannedCount: 0,
      boughtCount: 0,
    };
    expect(giftConfigPersonResponseSchema.parse(row)).toEqual(row);
  });

  it("giftAllocationResponseSchema rejects an invalid status", () => {
    expect(() =>
      giftAllocationResponseSchema.parse({
        id: "al1",
        householdId: "h1",
        giftPersonId: "gp1",
        giftEventId: "ge1",
        year: 2026,
        planned: 25,
        spent: null,
        status: "pending",
        notes: null,
        dateMonth: null,
        dateDay: null,
        createdAt: ISO,
        updatedAt: ISO,
      })
    ).toThrow();
  });
});

describe("waterfallHistoryResponseSchema", () => {
  it("parses a valid history point", () => {
    const point = {
      id: "wh1",
      householdId: "h1",
      itemType: "income_source",
      itemId: "i1",
      value: 5000,
      recordedAt: ISO,
      createdAt: ISO,
    };
    expect(waterfallHistoryResponseSchema.parse(point)).toEqual(point);
  });

  it("rejects a non-numeric value", () => {
    expect(() =>
      waterfallHistoryResponseSchema.parse({
        id: "wh1",
        householdId: "h1",
        itemType: "income_source",
        itemId: "i1",
        value: "lots",
        recordedAt: ISO,
        createdAt: ISO,
      })
    ).toThrow();
  });
});
