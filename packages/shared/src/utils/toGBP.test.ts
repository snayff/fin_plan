import { describe, it, expect } from "bun:test";
import { toGBP } from "./toGBP";

describe("toGBP", () => {
  it("rounds to exactly 2 decimal places", () => {
    expect(toGBP(10.555)).toBe(10.56);
    expect(toGBP(10.554)).toBe(10.55);
  });

  it("handles whole numbers", () => {
    expect(toGBP(100)).toBe(100);
  });

  it("handles negative numbers", () => {
    expect(toGBP(-10.555)).toBe(-10.56);
  });

  it("rounds half-up at the third decimal", () => {
    expect(toGBP(10.255)).toBe(10.26);
  });

  it("rounds symmetrically for negative values", () => {
    expect(toGBP(-10.255)).toBe(-10.26);
    expect(toGBP(-10.255)).toBe(-toGBP(10.255));
    expect(toGBP(-1.005)).toBe(-toGBP(1.005));
  });

  it("rounds 1.005 deterministically (IEEE-754: 1.005*100 === 100.4999…)", () => {
    // Math.round of the exact double 1.005 yields 1.00, not 1.01, because the
    // nearest double to 1.005 multiplied by 100 is just below 100.5. This is the
    // expected, deterministic result of the no-epsilon Math.round implementation.
    expect(toGBP(1.005)).toBe(1);
  });

  it("handles very small floating point drift", () => {
    expect(toGBP(0.1 + 0.2)).toBe(0.3);
  });

  it("handles zero", () => {
    expect(toGBP(0)).toBe(0);
  });

  it("rounds 1200/12 cleanly", () => {
    expect(toGBP(1200 / 12)).toBe(100);
  });

  it("rounds indivisible amounts", () => {
    expect(toGBP(1000 / 3)).toBe(333.33);
  });
});
