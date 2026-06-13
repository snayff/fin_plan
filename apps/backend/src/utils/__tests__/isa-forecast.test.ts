import { describe, it, expect } from "bun:test";
import { forecastContribution, type ForecastInput } from "../isa-forecast.js";

const today = new Date("2026-08-01"); // mid-tax-year, ~248 days to 5 Apr 2027
const end = new Date("2027-04-05");

describe("forecastContribution", () => {
  it("monthly with dueDate counts occurrences in window", () => {
    const result = forecastContribution(
      [{ amount: 500, spendType: "monthly", dueDate: new Date("2026-08-15") }],
      today,
      end
    );
    // Aug 15 through Mar 15 inclusive = 8 occurrences
    expect(result.amount).toBeCloseTo(500 * 8, 5);
    expect(result.estimated).toBe(false);
  });

  it("yearly with dueDate inside window includes full amount", () => {
    const result = forecastContribution(
      [{ amount: 3000, spendType: "yearly", dueDate: new Date("2027-03-30") }],
      today,
      end
    );
    expect(result.amount).toBe(3000);
    expect(result.estimated).toBe(false);
  });

  it("yearly with dueDate outside window contributes 0", () => {
    const result = forecastContribution(
      [{ amount: 3000, spendType: "yearly", dueDate: new Date("2027-05-01") }],
      today,
      end
    );
    expect(result.amount).toBe(0);
    expect(result.estimated).toBe(false);
  });

  it("one_off with dueDate in window includes full amount", () => {
    const result = forecastContribution(
      [{ amount: 1000, spendType: "one_off", dueDate: new Date("2026-12-01") }],
      today,
      end
    );
    expect(result.amount).toBe(1000);
  });

  it("monthly without dueDate pro-rates and flags estimated", () => {
    const result = forecastContribution(
      [{ amount: 200, spendType: "monthly", dueDate: null }],
      today,
      end
    );
    // 8 whole months from Aug to Apr — implementation may use floor or round; assert range.
    expect(result.amount).toBeGreaterThanOrEqual(200 * 7);
    expect(result.amount).toBeLessThanOrEqual(200 * 9);
    expect(result.estimated).toBe(true);
  });

  it("yearly without dueDate contributes 0 and is not estimated", () => {
    const result = forecastContribution(
      [{ amount: 3000, spendType: "yearly", dueDate: null }],
      today,
      end
    );
    expect(result.amount).toBe(0);
    expect(result.estimated).toBe(false);
  });

  it("counts a day-31 monthly schedule once per month across February (non-leap, #109)", () => {
    // Jan 31 2025 through Dec 31 2025 inclusive must be 12 occurrences, NOT 11:
    // February must be clamped to the 28th, never skipped.
    const result = forecastContribution(
      [{ amount: 100, spendType: "monthly", dueDate: new Date(Date.UTC(2025, 0, 31)) }],
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 11, 31))
    );
    expect(result.amount).toBeCloseTo(100 * 12, 5);
  });

  it("counts a day-29 monthly schedule once per month across a leap February (#109)", () => {
    const result = forecastContribution(
      [{ amount: 100, spendType: "monthly", dueDate: new Date(Date.UTC(2024, 0, 29)) }],
      new Date(Date.UTC(2024, 0, 1)),
      new Date(Date.UTC(2024, 11, 31))
    );
    expect(result.amount).toBeCloseTo(100 * 12, 5);
  });

  it("counts a day-30 monthly schedule once per month across February (#109)", () => {
    const result = forecastContribution(
      [{ amount: 100, spendType: "monthly", dueDate: new Date(Date.UTC(2026, 0, 30)) }],
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 11, 31))
    );
    expect(result.amount).toBeCloseTo(100 * 12, 5);
  });

  it("aggregates multiple items", () => {
    const result = forecastContribution(
      [
        { amount: 500, spendType: "monthly", dueDate: new Date("2026-08-15") },
        { amount: 3000, spendType: "yearly", dueDate: new Date("2027-03-30") },
      ],
      today,
      end
    );
    expect(result.amount).toBeCloseTo(500 * 8 + 3000, 5);
  });
});
