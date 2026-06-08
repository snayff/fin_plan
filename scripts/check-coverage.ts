import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { coverageFromGlob } from "./coverage-lcov";

export type Metric = "functions" | "lines";

/**
 * Each package's isolated test runner emits one lcov report per test file under
 * `<package>/coverage/`. The gate merges them all into true whole-codebase
 * coverage (see scripts/coverage-lcov.ts) rather than averaging per-file
 * percentages — the only metric that can actually trend toward the 90/90 target.
 */
export const PACKAGE_LCOV_GLOBS: Record<string, string> = {
  "apps/backend": "apps/backend/coverage/**/lcov.info",
  "apps/frontend": "apps/frontend/coverage/**/lcov.info",
  "packages/shared": "packages/shared/coverage/**/lcov.info",
};

/** The end goal every package ratchets toward. */
export const TARGET: Floor = { functions: 90, lines: 90 };

export interface PackageCoverage {
  functions: number;
  lines: number;
}

export interface Floor {
  functions: number;
  lines: number;
}

export type Violation =
  | { kind: "floor"; pkg: string; metric: Metric; current: number; floor: number }
  | {
      kind: "ratchet";
      pkg: string;
      metric: Metric;
      current: number;
      baseline: number;
      dropPp: number;
    }
  | { kind: "missing-baseline"; pkg: string };

export interface EvaluateInput {
  current: Record<string, PackageCoverage>;
  baseline: Record<string, PackageCoverage>;
  floor: Floor;
  ratchetTolerancePp: number;
}

export interface EvaluateResult {
  ok: boolean;
  violations: Violation[];
}

const METRICS: Metric[] = ["functions", "lines"];

export function evaluateCoverage(input: EvaluateInput): EvaluateResult {
  const violations: Violation[] = [];

  for (const [pkg, cur] of Object.entries(input.current)) {
    for (const metric of METRICS) {
      if (cur[metric] < input.floor[metric]) {
        violations.push({
          kind: "floor",
          pkg,
          metric,
          current: cur[metric],
          floor: input.floor[metric],
        });
      }
    }

    const base = input.baseline[pkg];
    if (!base) {
      violations.push({ kind: "missing-baseline", pkg });
      continue;
    }

    for (const metric of METRICS) {
      const dropPp = base[metric] - cur[metric];
      if (dropPp > input.ratchetTolerancePp) {
        violations.push({
          kind: "ratchet",
          pkg,
          metric,
          current: cur[metric],
          baseline: base[metric],
          dropPp,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

interface RunOptions {
  baselinePath: string;
  floor: Floor;
  ratchetTolerancePp: number;
  /** package -> lcov glob; defaults to PACKAGE_LCOV_GLOBS. */
  globs?: Record<string, string>;
  /** optional path to dump the computed current coverage (CI artefact). */
  writePath?: string;
}

/**
 * Build the current coverage map by merging each package's lcov reports.
 * A package with no lcov output (e.g. a partial local run of one suite) is
 * omitted rather than reported as 0% so it simply isn't gated this run.
 */
export function collectCurrentCoverage(
  globs: Record<string, string> = PACKAGE_LCOV_GLOBS
): Record<string, PackageCoverage> {
  const current: Record<string, PackageCoverage> = {};
  for (const [pkg, glob] of Object.entries(globs)) {
    const summary = coverageFromGlob(glob);
    if (summary.linesFound === 0) continue;
    current[pkg] = { functions: summary.functions, lines: summary.lines };
  }
  return current;
}

function bar(current: number, target: number): string {
  const reached = current >= target;
  const arrow = reached ? "✓" : `→ ${(target - current).toFixed(1)}pp to ${target}`;
  return `${current.toFixed(1).padStart(5)}%  ${arrow}`;
}

function report(
  current: Record<string, PackageCoverage>,
  baseline: Record<string, PackageCoverage>
): void {
  console.log("\nTrue coverage (merged lcov) vs 90/90 target:");
  for (const [pkg, cur] of Object.entries(current)) {
    const base = baseline[pkg];
    const fnDelta = base ? ` (baseline ${base.functions.toFixed(1)}%)` : "";
    const lnDelta = base ? ` (baseline ${base.lines.toFixed(1)}%)` : "";
    console.log(`  ${pkg}`);
    console.log(`    functions ${bar(cur.functions, TARGET.functions)}${fnDelta}`);
    console.log(`    lines     ${bar(cur.lines, TARGET.lines)}${lnDelta}`);
  }
}

export function runCli(opts: RunOptions): number {
  if (!existsSync(opts.baselinePath)) {
    console.error(`coverage-baseline file not found: ${opts.baselinePath}`);
    return 1;
  }

  const baseline = JSON.parse(readFileSync(opts.baselinePath, "utf8")) as Record<
    string,
    PackageCoverage
  >;
  const current = collectCurrentCoverage(opts.globs);

  if (Object.keys(current).length === 0) {
    console.error(
      "no lcov coverage found for any package — run the test suites with --coverage first"
    );
    return 1;
  }

  if (opts.writePath) {
    writeFileSync(opts.writePath, JSON.stringify(current, null, 2) + "\n");
  }

  report(current, baseline);

  const { ok, violations } = evaluateCoverage({
    current,
    baseline,
    floor: opts.floor,
    ratchetTolerancePp: opts.ratchetTolerancePp,
  });

  if (ok) {
    console.log("\n✅ coverage check passed");
    return 0;
  }

  console.error("\n❌ coverage check failed:");
  for (const v of violations) {
    if (v.kind === "floor") {
      console.error(`  [${v.pkg}] ${v.metric} ${v.current.toFixed(1)}% below floor ${v.floor}%`);
    } else if (v.kind === "ratchet") {
      console.error(
        `  [${v.pkg}] ${v.metric} dropped ${v.dropPp.toFixed(2)}pp (baseline ${v.baseline.toFixed(1)}% → current ${v.current.toFixed(1)}%)`
      );
    } else {
      console.error(
        `  [${v.pkg}] missing from coverage-baseline.json — add an entry or remove the package`
      );
    }
  }
  console.error(
    `\nIf this drop is intentional, update coverage-baseline.json in the same PR and reviewers will see it.\n` +
      `To lock in a gain after adding tests, run: bun scripts/bump-baseline.ts`
  );
  return 1;
}

// Only execute CLI when invoked directly (not when imported by tests).
if (import.meta.main) {
  const exitCode = runCli({
    baselinePath: "coverage-baseline.json",
    // Hard safety net every package must clear. The real upward pressure comes
    // from the per-package ratchet (coverage-baseline.json): coverage may not
    // drop more than ratchetTolerancePp below each package's locked-in baseline.
    floor: { functions: 50, lines: 70 },
    ratchetTolerancePp: 1,
    writePath: "coverage-current.json",
  });
  process.exit(exitCode);
}
