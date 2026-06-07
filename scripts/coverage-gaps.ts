/**
 * Coverage gap-finder.
 *
 * Lists source files with the most uncovered lines so you can target the
 * highest-leverage tests first. Run the suites with --coverage beforehand so
 * each package's lcov exists under <package>/coverage/.
 *
 *   bun scripts/coverage-gaps.ts                  # all packages, top 25
 *   bun scripts/coverage-gaps.ts apps/backend     # one package
 *   bun scripts/coverage-gaps.ts apps/frontend 40 # one package, top 40
 */

import { PACKAGE_LCOV_GLOBS } from "./check-coverage";
import { fileGaps, mergeGlob } from "./coverage-lcov";

const args = process.argv.slice(2);
const pkgArg = args.find((a) => !/^\d+$/.test(a));
const limit = Number(args.find((a) => /^\d+$/.test(a)) ?? 25);

const packages = pkgArg ? { [pkgArg]: PACKAGE_LCOV_GLOBS[pkgArg] } : PACKAGE_LCOV_GLOBS;

for (const [pkg, glob] of Object.entries(packages)) {
  if (!glob) {
    console.error(
      `unknown package "${pkg}" — known: ${Object.keys(PACKAGE_LCOV_GLOBS).join(", ")}`
    );
    process.exit(1);
  }
  const gaps = fileGaps(mergeGlob(glob)).filter((g) => g.linesUncovered > 0);
  console.log(`\n${pkg} — top ${Math.min(limit, gaps.length)} files by uncovered lines:`);
  if (gaps.length === 0) {
    console.log("  (no uncovered lines 🎉)");
    continue;
  }
  for (const g of gaps.slice(0, limit)) {
    const loc = `${g.linesHit}/${g.linesFound} lines`.padEnd(16);
    console.log(
      `  ${String(g.linesUncovered).padStart(4)} uncovered  ${loc} ${g.lines.toFixed(1).padStart(5)}%  ${g.file}`
    );
  }
}
