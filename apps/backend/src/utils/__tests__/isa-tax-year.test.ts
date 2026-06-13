import { describe, it, expect } from "bun:test";
import { getIsaTaxYearWindow } from "../isa-tax-year.js";

describe("getIsaTaxYearWindow", () => {
  it("returns this year's 5 April when today is before that", () => {
    const w = getIsaTaxYearWindow(new Date("2026-02-15"));
    expect(w.start.toISOString().slice(0, 10)).toBe("2025-04-06");
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-04-05");
  });

  it("returns next year's 5 April when today is past 5 April", () => {
    const w = getIsaTaxYearWindow(new Date("2026-04-10"));
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-04-06");
    expect(w.end.toISOString().slice(0, 10)).toBe("2027-04-05");
  });

  it("treats 5 April itself as still inside this tax year", () => {
    const w = getIsaTaxYearWindow(new Date("2026-04-05"));
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-04-05");
  });

  it("treats 5 April at a non-midnight time as still inside this tax year (#114)", () => {
    // Regression: any time after 00:00 on 5 April used to roll into the new
    // tax year. The whole of 5 April must resolve to the tax year ending 5 April.
    const w = getIsaTaxYearWindow(new Date("2026-04-05T12:00:00Z"));
    expect(w.start.toISOString().slice(0, 10)).toBe("2025-04-06");
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-04-05");
    // 5 April is the last day of the window — zero whole days remain.
    expect(w.daysRemaining).toBe(0);
  });

  it("rolls to the new tax year on 6 April with a full year remaining (#114)", () => {
    const w = getIsaTaxYearWindow(new Date("2026-04-06T12:00:00Z"));
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-04-06");
    expect(w.end.toISOString().slice(0, 10)).toBe("2027-04-05");
    // 6 Apr 2026 → 5 Apr 2027 is 364 whole days.
    expect(w.daysRemaining).toBe(364);
  });

  it("computes daysRemaining as whole days from today to end", () => {
    const w = getIsaTaxYearWindow(new Date("2026-04-01"));
    expect(w.daysRemaining).toBe(4);
  });
});
