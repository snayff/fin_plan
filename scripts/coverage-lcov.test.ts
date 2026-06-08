import { describe, test, expect } from "bun:test";
import { parseLcovInto, summarize, type FileCoverage } from "./coverage-lcov";

function merge(...reports: string[]): Map<string, FileCoverage> {
  const acc = new Map<string, FileCoverage>();
  for (const r of reports) parseLcovInto(acc, r);
  return acc;
}

const fileA = [
  "TN:",
  "SF:src/a.ts",
  "FNF:2",
  "FNH:1",
  "DA:1,5",
  "DA:2,0",
  "DA:3,5",
  "LF:3",
  "LH:2",
  "end_of_record",
].join("\n");

describe("parseLcovInto / summarize", () => {
  test("computes exact line and function coverage for a single file", () => {
    const cov = summarize(merge(fileA));
    expect(cov.linesFound).toBe(3);
    expect(cov.linesHit).toBe(2);
    expect(cov.lines).toBe(66.7);
    expect(cov.functionsFound).toBe(2);
    expect(cov.functionsHit).toBe(1);
    expect(cov.functions).toBe(50);
  });

  test("unions line hits across runs — a line covered in ANY run counts as covered", () => {
    const run1 = ["SF:src/a.ts", "DA:1,1", "DA:2,0", "FNF:1", "FNH:0", "end_of_record"].join("\n");
    const run2 = ["SF:src/a.ts", "DA:1,0", "DA:2,3", "FNF:1", "FNH:1", "end_of_record"].join("\n");
    const cov = summarize(merge(run1, run2));
    // line 1 hit in run1, line 2 hit in run2 → both covered
    expect(cov.linesHit).toBe(2);
    expect(cov.linesFound).toBe(2);
    expect(cov.lines).toBe(100);
    // function hit count takes the best single run (1 of 1)
    expect(cov.functions).toBe(100);
  });

  test("aggregates across multiple distinct files (weighted by real line counts)", () => {
    const big = [
      "SF:src/big.ts",
      ...Array.from({ length: 100 }, (_, i) => `DA:${i + 1},${i < 90 ? 1 : 0}`),
      "FNF:10",
      "FNH:9",
      "end_of_record",
    ].join("\n");
    const tiny = ["SF:src/tiny.ts", "DA:1,0", "FNF:1", "FNH:0", "end_of_record"].join("\n");
    const cov = summarize(merge(big, tiny));
    // 90 of 101 lines covered — the tiny 0%-file barely moves the needle,
    // unlike a per-file mean which would average 89% and 0% into ~45%.
    expect(cov.linesFound).toBe(101);
    expect(cov.linesHit).toBe(90);
    expect(cov.lines).toBe(89.1);
  });

  test("empty coverage reports as 100% (nothing to cover)", () => {
    const cov = summarize(new Map());
    expect(cov.lines).toBe(100);
    expect(cov.functions).toBe(100);
  });
});
