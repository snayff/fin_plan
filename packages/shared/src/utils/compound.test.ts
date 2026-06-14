import { describe, it, expect } from "bun:test";
import { futureValueMonthly } from "./compound";

describe("futureValueMonthly", () => {
  it("matches the canonical Help-calculator example (£0 / £500pm / 6% / 10y)", () => {
    // Monthly-compounding ordinary annuity → £81,939.67
    expect(futureValueMonthly(0, 500, 6, 10)).toBeCloseTo(81939.67, 2);
  });

  it("rate = 0 is a plain linear sum of contributions (no division by zero)", () => {
    expect(futureValueMonthly(10000, 100, 0, 1)).toBe(10000 + 100 * 12);
    expect(futureValueMonthly(0, 250, 0, 3)).toBe(250 * 36);
    expect(futureValueMonthly(5000, 0, 0, 5)).toBe(5000);
  });

  it("pure growth with no contributions compounds monthly", () => {
    // 10000 at 4% nominal, monthly compounding, 1 year
    expect(futureValueMonthly(10000, 0, 4, 1)).toBeCloseTo(10407.42, 2);
  });

  it("starting balance + contributions compound together", () => {
    expect(futureValueMonthly(10000, 100, 4, 1)).toBeCloseTo(11629.66, 2);
  });

  it("supports fractional years", () => {
    // ~3 months of 5% growth on 10000 + 3 contributions of 200
    const v = futureValueMonthly(10000, 200, 5, 0.25);
    expect(v).toBeGreaterThan(10000 + 200 * 3); // some growth on top of linear
    expect(v).toBeLessThan(11000);
  });

  it("handles negative rates (depreciation)", () => {
    expect(futureValueMonthly(20000, 0, -15, 1)).toBeCloseTo(17197.89, 2);
  });

  it("zero years returns the present value", () => {
    expect(futureValueMonthly(12345, 500, 7, 0)).toBe(12345);
  });
});
