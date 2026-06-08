/**
 * Isolated test runner for bun test.
 *
 * Bun's mock.module() patches the global module cache, so mocks defined in one
 * test file leak into every other file within the same process. This script
 * spawns a separate `bun test` process per file to guarantee isolation.
 */

import { Glob } from "bun";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

// Where each isolated test subprocess writes its lcov report under --coverage.
// The repo-root coverage gate (scripts/check-coverage.ts) merges every
// coverage/**/lcov.info into true whole-codebase coverage.
const COVERAGE_DIR = "coverage";

const preload = "./src/test/setup.ts";
const testDir = "src";

const glob = new Glob("**/*.test.{ts,tsx}");
const testFiles = Array.from(glob.scanSync(testDir)).sort();

const coverage = process.argv.includes("--coverage");

// Allow filtering by pattern passed as CLI arg: `bun scripts/run-tests.ts auth`
const filterPattern = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const filesToRun = filterPattern ? testFiles.filter((f) => f.includes(filterPattern)) : testFiles;

if (filesToRun.length === 0) {
  console.log("No test files matched.");
  process.exit(0);
}

console.log(`Running ${filesToRun.length} test file(s) with per-file isolation...\n`);

// Start each coverage run from a clean slate so stale reports from deleted
// test files can't inflate the merged total.
if (coverage) rmSync(COVERAGE_DIR, { recursive: true, force: true });

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const [index, file] of filesToRun.entries()) {
  // Use an absolute path so bun treats it as an exact file, not a glob pattern.
  // Without this, `bun test src/hooks/foo.test.ts` also picks up `foo.test.tsx`
  // in the same process, causing mock.module() leaks between files.
  const filePath = resolve(testDir, file);
  // Each subprocess writes lcov to its own dir so per-file reports never
  // overwrite each other; the gate merges them into true coverage.
  const coverageArgs = coverage
    ? [
        "--coverage",
        "--coverage-reporter=text",
        "--coverage-reporter=lcov",
        `--coverage-dir=${COVERAGE_DIR}/${index}`,
      ]
    : [];
  const proc = Bun.spawn(["bun", "test", ...coverageArgs, "--preload", preload, filePath], {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });

  const exitCode = await proc.exited;

  if (exitCode === 0) {
    passed++;
  } else {
    failed++;
    failures.push(filePath);
  }
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Test files: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log(`\nFailed files:`);
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
}
