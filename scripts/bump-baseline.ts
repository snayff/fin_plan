/**
 * Lock in coverage gains.
 *
 * After adding tests, run this to raise coverage-baseline.json to the freshly
 * measured true coverage so the ratchet can never slip back below it. Run the
 * suites with --coverage first (so lcov exists under each package's coverage/).
 *
 *   bun scripts/bump-baseline.ts            # raise every measured package
 *   bun scripts/bump-baseline.ts apps/backend   # raise one package only
 *
 * Baselines are capped at the 90/90 TARGET: once a metric reaches the goal we
 * pin its floor at 90 rather than letting the required margin creep above it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { collectCurrentCoverage, TARGET, type PackageCoverage } from "./check-coverage";

const BASELINE_PATH = "coverage-baseline.json";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const only = process.argv[2];

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<string, PackageCoverage>;
const current = collectCurrentCoverage();

let changed = false;
for (const [pkg, cur] of Object.entries(current)) {
  if (only && pkg !== only) continue;
  const prev = baseline[pkg] ?? { functions: 0, lines: 0 };
  const next: PackageCoverage = {
    functions: Math.max(prev.functions, Math.min(round1(cur.functions), TARGET.functions)),
    lines: Math.max(prev.lines, Math.min(round1(cur.lines), TARGET.lines)),
  };
  if (next.functions !== prev.functions || next.lines !== prev.lines) {
    changed = true;
    console.log(
      `${pkg}: functions ${prev.functions}% → ${next.functions}%, lines ${prev.lines}% → ${next.lines}%`
    );
  }
  baseline[pkg] = next;
}

if (!changed) {
  console.log("baseline already up to date — nothing to raise.");
} else {
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`\nwrote ${BASELINE_PATH}`);
}
