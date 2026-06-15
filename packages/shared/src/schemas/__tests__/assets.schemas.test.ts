import { describe, it, expect } from "bun:test";
import {
  createAssetSchema,
  createAccountSchema,
  updateAccountSchema,
  isaAllowanceSummarySchema,
} from "../assets.schemas.js";

describe("Account ISA validation", () => {
  it("accepts isISA=true with Savings type and memberId", () => {
    const r = createAccountSchema.safeParse({
      name: "Cash ISA",
      type: "Savings",
      memberId: "m1",
      isISA: true,
      isaYearContribution: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects isISA=true without memberId", () => {
    const r = createAccountSchema.safeParse({
      name: "Cash ISA",
      type: "Savings",
      memberId: null,
      isISA: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects isISA=true with non-Savings type", () => {
    const r = createAccountSchema.safeParse({
      name: "Cash ISA",
      type: "Current",
      memberId: "m1",
      isISA: true,
    });
    expect(r.success).toBe(false);
  });

  it("accepts isISA=false on any type", () => {
    const r = createAccountSchema.safeParse({
      name: "Current",
      type: "Current",
      isISA: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects negative isaYearContribution", () => {
    const r = createAccountSchema.safeParse({
      name: "Cash ISA",
      type: "Savings",
      memberId: "m1",
      isISA: true,
      isaYearContribution: -1,
    });
    expect(r.success).toBe(false);
  });

  it("update schema enforces same isa-requires-member rule", () => {
    const r = updateAccountSchema.safeParse({ isISA: true, memberId: null });
    expect(r.success).toBe(false);
  });
});

describe("Account Pension validation", () => {
  it("accepts Pension type with a memberId", () => {
    const r = createAccountSchema.safeParse({
      name: "Vanguard SIPP",
      type: "Pension",
      memberId: "m1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects Pension type with memberId null", () => {
    const r = createAccountSchema.safeParse({
      name: "Vanguard SIPP",
      type: "Pension",
      memberId: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects Pension type with memberId omitted", () => {
    const r = createAccountSchema.safeParse({
      name: "Vanguard SIPP",
      type: "Pension",
    });
    expect(r.success).toBe(false);
  });

  it("accepts non-Pension types without a member", () => {
    expect(createAccountSchema.safeParse({ name: "Barclays", type: "Current" }).success).toBe(true);
    expect(
      createAccountSchema.safeParse({ name: "Marcus", type: "Savings", memberId: null }).success
    ).toBe(true);
  });
});

describe("createAccountSchema — monthlyContributionLimit", () => {
  it("accepts a non-negative number", () => {
    const r = createAccountSchema.safeParse({
      name: "Marcus",
      type: "Savings",
      monthlyContributionLimit: 200,
    });
    expect(r.success).toBe(true);
  });
  it("accepts null (clears the limit)", () => {
    const r = createAccountSchema.safeParse({
      name: "Marcus",
      type: "Savings",
      monthlyContributionLimit: null,
    });
    expect(r.success).toBe(true);
  });
  it("rejects negative numbers", () => {
    const r = createAccountSchema.safeParse({
      name: "Marcus",
      type: "Savings",
      monthlyContributionLimit: -5,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateAccountSchema — monthlyContributionLimit", () => {
  it("accepts setting and clearing the limit", () => {
    expect(updateAccountSchema.safeParse({ monthlyContributionLimit: 300 }).success).toBe(true);
    expect(updateAccountSchema.safeParse({ monthlyContributionLimit: null }).success).toBe(true);
  });
});

describe("createAssetSchema / createAccountSchema — initialValueDate", () => {
  it("asset: accepts an optional initialValueDate in YYYY-MM-DD form", () => {
    const r = createAssetSchema.safeParse({
      name: "Family Home",
      type: "Property",
      initialValue: 250000,
      initialValueDate: "2026-01-15",
    });
    expect(r.success).toBe(true);
  });

  it("asset: accepts omission of initialValueDate (no behaviour change)", () => {
    const r = createAssetSchema.safeParse({
      name: "Family Home",
      type: "Property",
      initialValue: 250000,
    });
    expect(r.success).toBe(true);
  });

  it("asset: rejects a non-ISO initialValueDate", () => {
    const r = createAssetSchema.safeParse({
      name: "Family Home",
      type: "Property",
      initialValue: 250000,
      initialValueDate: "15/01/2026",
    });
    expect(r.success).toBe(false);
  });

  it("account: accepts an optional initialValueDate in YYYY-MM-DD form", () => {
    const r = createAccountSchema.safeParse({
      name: "HSBC Current",
      type: "Current",
      initialValue: 1500,
      initialValueDate: "2026-01-15",
    });
    expect(r.success).toBe(true);
  });

  it("account: rejects a non-ISO initialValueDate", () => {
    const r = createAccountSchema.safeParse({
      name: "HSBC Current",
      type: "Current",
      initialValue: 1500,
      initialValueDate: "not-a-date",
    });
    expect(r.success).toBe(false);
  });
});

describe("IsaAllowanceSummary schema", () => {
  it("accepts a valid summary with members", () => {
    const r = isaAllowanceSummarySchema.safeParse({
      taxYearStart: "2026-04-06",
      taxYearEnd: "2027-04-05",
      daysRemaining: 200,
      annualLimit: 20000,
      byMember: [
        {
          memberId: "m1",
          name: "Alice",
          used: 12400,
          forecast: 5600,
          forecastedYearTotal: 18000,
          monthlyPlanned: 500,
          estimatedFlag: false,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty byMember array", () => {
    const r = isaAllowanceSummarySchema.safeParse({
      taxYearStart: "2026-04-06",
      taxYearEnd: "2027-04-05",
      daysRemaining: 200,
      annualLimit: 20000,
      byMember: [],
    });
    expect(r.success).toBe(true);
  });
});
