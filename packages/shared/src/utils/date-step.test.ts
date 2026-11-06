import { describe, it, expect } from "bun:test";
import { daysInUTCMonth, clampedUTCDate, addMonthsClamped } from "./date-step";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("daysInUTCMonth", () => {
  it("returns 31 for January", () => {
    expect(daysInUTCMonth(2025, 0)).toBe(31);
  });

  it("returns 28 for February in a non-leap year", () => {
    expect(daysInUTCMonth(2025, 1)).toBe(28);
    expect(daysInUTCMonth(2026, 1)).toBe(28);
  });

  it("returns 29 for February in a leap year", () => {
    expect(daysInUTCMonth(2024, 1)).toBe(29);
  });

  it("returns 30 for April", () => {
    expect(daysInUTCMonth(2025, 3)).toBe(30);
  });
});

describe("clampedUTCDate", () => {
  it("keeps the day when it exists in the month", () => {
    expect(iso(clampedUTCDate(2025, 0, 31))).toBe("2025-01-31");
    expect(iso(clampedUTCDate(2025, 3, 15))).toBe("2025-04-15");
  });

  it("clamps day 31 to Feb 28 in a non-leap year", () => {
    expect(iso(clampedUTCDate(2025, 1, 31))).toBe("2025-02-28");
    expect(iso(clampedUTCDate(2026, 1, 30))).toBe("2026-02-28");
    expect(iso(clampedUTCDate(2025, 1, 29))).toBe("2025-02-28");
  });

  it("clamps day 30/31 to Feb 29 in a leap year, keeps 29", () => {
    expect(iso(clampedUTCDate(2024, 1, 31))).toBe("2024-02-29");
    expect(iso(clampedUTCDate(2024, 1, 30))).toBe("2024-02-29");
    expect(iso(clampedUTCDate(2024, 1, 29))).toBe("2024-02-29");
  });

  it("clamps day 31 to 30 in 30-day months", () => {
    expect(iso(clampedUTCDate(2025, 3, 31))).toBe("2025-04-30");
    expect(iso(clampedUTCDate(2025, 8, 31))).toBe("2025-09-30");
  });

  it("normalises month overflow into the next year", () => {
    expect(iso(clampedUTCDate(2025, 12, 15))).toBe("2026-01-15");
    expect(iso(clampedUTCDate(2025, 13, 31))).toBe("2026-02-28");
  });

  it("never rolls into the following month", () => {
    // The whole point: Feb 31 must not become early March.
    expect(clampedUTCDate(2025, 1, 31).getUTCMonth()).toBe(1);
  });
});

describe("addMonthsClamped", () => {
  it("steps a day-31 schedule through every month including February", () => {
    // Start Jan 31 2025, step monthly for a full year -> one per calendar month.
    const start = new Date(Date.UTC(2025, 0, 31));
    const results: string[] = [];
    for (let i = 0; i < 12; i++) {
      results.push(iso(addMonthsClamped(start, i)));
    }
    expect(results).toEqual([
      "2025-01-31",
      "2025-02-28", // clamped, NOT skipped
      "2025-03-31",
      "2025-04-30",
      "2025-05-31",
      "2025-06-30",
      "2025-07-31",
      "2025-08-31",
      "2025-09-30",
      "2025-10-31",
      "2025-11-30",
      "2025-12-31",
    ]);
    expect(results).toHaveLength(12);
  });

  it("does not drift: each step anchors on the original day", () => {
    const start = new Date(Date.UTC(2025, 0, 31));
    // After February (clamped to 28), March must return to 31, not stay on 28.
    expect(iso(addMonthsClamped(start, 1))).toBe("2025-02-28");
    expect(iso(addMonthsClamped(start, 2))).toBe("2025-03-31");
  });

  it("handles day 29 across a leap-year February", () => {
    const start = new Date(Date.UTC(2024, 0, 29));
    expect(iso(addMonthsClamped(start, 1))).toBe("2024-02-29"); // leap: exact
    const startNonLeap = new Date(Date.UTC(2025, 0, 29));
    expect(iso(addMonthsClamped(startNonLeap, 1))).toBe("2025-02-28"); // clamped
  });

  it("handles day 30 across February in both leap and non-leap years", () => {
    expect(iso(addMonthsClamped(new Date(Date.UTC(2024, 0, 30)), 1))).toBe("2024-02-29");
    expect(iso(addMonthsClamped(new Date(Date.UTC(2025, 0, 30)), 1))).toBe("2025-02-28");
  });

  it("supports an explicit anchor day distinct from the cursor day", () => {
    // Cursor sitting on a clamped Feb 28, but anchored on 31 -> March returns 31.
    const feb = new Date(Date.UTC(2025, 1, 28));
    expect(iso(addMonthsClamped(feb, 1, 31))).toBe("2025-03-31");
  });

  it("steps multiple months and across year boundaries", () => {
    const dec = new Date(Date.UTC(2025, 11, 31));
    expect(iso(addMonthsClamped(dec, 1))).toBe("2026-01-31");
    expect(iso(addMonthsClamped(dec, 2))).toBe("2026-02-28");
    expect(iso(addMonthsClamped(dec, 3))).toBe("2026-03-31"); // quarterly cousin
  });

  it("leaves non-overflowing dates unchanged in behaviour", () => {
    const mid = new Date(Date.UTC(2025, 0, 15));
    expect(iso(addMonthsClamped(mid, 1))).toBe("2025-02-15");
    expect(iso(addMonthsClamped(mid, 13))).toBe("2026-02-15");
  });
});
