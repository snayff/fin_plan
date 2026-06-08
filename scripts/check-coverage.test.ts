import { describe, test, expect } from "bun:test";
import { evaluateCoverage } from "./check-coverage";

const FLOOR = { functions: 63, lines: 74 };

describe("evaluateCoverage", () => {
  test("passes when current meets floor and matches baseline", () => {
    const result = evaluateCoverage({
      current: { "apps/backend": { functions: 80, lines: 82 } },
      baseline: { "apps/backend": { functions: 80, lines: 82 } },
      floor: FLOOR,
      ratchetTolerancePp: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("fails when below fixed floor", () => {
    const result = evaluateCoverage({
      current: { "apps/backend": { functions: 60, lines: 82 } },
      baseline: { "apps/backend": { functions: 80, lines: 82 } },
      floor: FLOOR,
      ratchetTolerancePp: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.kind === "floor" && v.metric === "functions")).toBe(
      true
    );
  });

  test("fails on >1pp ratchet drop", () => {
    const result = evaluateCoverage({
      current: { "apps/backend": { functions: 78.5, lines: 82 } },
      baseline: { "apps/backend": { functions: 80, lines: 82 } },
      floor: FLOOR,
      ratchetTolerancePp: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.kind === "ratchet" && v.metric === "functions")).toBe(
      true
    );
  });

  test("passes on ≤1pp ratchet drop", () => {
    const result = evaluateCoverage({
      current: { "apps/backend": { functions: 79.5, lines: 82 } },
      baseline: { "apps/backend": { functions: 80, lines: 82 } },
      floor: FLOOR,
      ratchetTolerancePp: 1,
    });
    expect(result.ok).toBe(true);
  });

  test("flags missing package in baseline", () => {
    const result = evaluateCoverage({
      current: { "apps/backend": { functions: 80, lines: 82 } },
      baseline: {},
      floor: FLOOR,
      ratchetTolerancePp: 1,
    });
    expect(result.violations.some((v) => v.kind === "missing-baseline")).toBe(true);
  });
});
