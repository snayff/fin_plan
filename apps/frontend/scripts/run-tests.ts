/**
 * Isolated test runner for bun test.
 *
 * Bun's mock.module() patches the global module cache, so mocks defined in one
 * test file leak into every other file within the same process. This script
 * spawns a separate `bun test` process per file to guarantee isolation.
 */

import { Glob } from "bun";
import { resolve } from "node:path";

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

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const file of filesToRun) {
  // Use an absolute path so bun treats it as an exact file, not a glob pattern.
  // Without this, `bun test src/hooks/foo.test.ts` also picks up `foo.test.tsx`
  // in the same process, causing mock.module() leaks between files.
  const filePath = resolve(testDir, file);
  const proc = Bun.spawn(
    ["bun", "test", ...(coverage ? ["--coverage"] : []), "--preload", preload, filePath],
    {
      stdout: "inherit",
      stderr: "inherit",
      env: process.env,
    }
  );

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
