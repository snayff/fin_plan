import { describe, it, expect } from "bun:test";
import { formatItemAmount, getMonthsAgo, isStale } from "./formatAmount";
import type { SpendType } from "./formatAmount";

describe("formatItemAmount", () => {
  it("monthly has no secondary line or label", () => {
    const r = formatItemAmount(350, "monthly");
    expect(r.primary).toContain("£");
    expect(r.secondary).toBeNull();
    expect(r.label).toBeNull();
  });

  it.each(["weekly", "quarterly", "yearly"] as SpendType[])(
    "%s shows a per-month secondary line and no label",
    (spendType) => {
      const r = formatItemAmount(1200, spendType);
      expect(r.primary).toContain("£");
      expect(r.secondary).toContain("/mo");
      expect(r.label).toBeNull();
    }
  );

  it("one_off shows a per-month secondary line and a One-off label", () => {
    const r = formatItemAmount(3200, "one_off");
    expect(r.secondary).toContain("/mo");
    expect(r.label).toBe("One-off");
  });

  it("honours showPence on every branch", () => {
    expect(formatItemAmount(350.5, "monthly", true).primary).toContain(".");
    expect(formatItemAmount(1200.5, "weekly", true).secondary).toContain("/mo");
    expect(formatItemAmount(3200.99, "one_off", true).secondary).toContain("/mo");
  });
});

describe("getMonthsAgo / isStale", () => {
  it("counts whole calendar months elapsed", () => {
    const reviewed = new Date("2026-01-15T00:00:00Z");
    const now = new Date("2026-04-15T00:00:00Z");
    expect(getMonthsAgo(reviewed, now)).toBe(3);
  });

  it("flags items older than the threshold as stale", () => {
    const reviewed = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-06-01T00:00:00Z");
    expect(isStale(reviewed, now, 3)).toBe(true);
    expect(isStale(reviewed, now, 12)).toBe(false);
  });
});
