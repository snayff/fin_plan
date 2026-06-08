---
feature: dev-feedback-loop
category: infrastructure
spec: docs/4. planning/dev-feedback-loop/dev-feedback-loop-spec.md
creation_date: 2026-05-17
status: backlog
implemented_date:
---

# Dev Feedback Loop — Implementation Plan

> **For Claude:** Use `/execute-plan dev-feedback-loop` to implement this plan task-by-task.

**Goal:** Tighten the local-and-CI quality feedback loop with pre-commit/pre-push hooks, a backend test-runner watch mode, and CI coverage floor + ratchet enforcement.

**Spec:** `docs/4. planning/dev-feedback-loop/dev-feedback-loop-spec.md`

**Architecture:** Three loosely-coupled subsystems, built in spec order. (1) Husky at repo root + lint-staged for staged-only ESLint at commit and `bun run type-check` at push. (2) Refactor `apps/backend/scripts/run-tests.ts` to extract pure helpers (test-file discovery, source→test mapping) for unit testing, then add a `--watch` mode that re-spawns per-file `bun test` subprocesses on change (preserving isolation). (3) New `scripts/check-coverage.ts` script that parses Bun's `coverage-summary.json`, enforces a fixed floor and a ≤1pp ratchet against `coverage-baseline.json`, wired into CI after a baselining commit.

**Tech Stack:** Bun · TypeScript · ESLint · husky · lint-staged · chokidar · GitHub Actions

**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [ ] Working tree clean on `stage` (or feature branch off `stage`).
- [ ] `bun install` succeeds; existing test runner passes (`cd apps/backend && bun scripts/run-tests.ts`).
- [ ] CI green on `stage` (baseline coverage step will use the current stage results as the reference floor).

---

## Tasks

> Each task is one action (2–5 minutes), follows red-green-commit, and contains complete code.

---

### Subsystem 1 — Pre-commit & pre-push hooks

### Task 1: Install husky and lint-staged at repo root

**Files:**

- Modify: `package.json` (root)
- Create: `.husky/_/.gitignore` (auto-created by husky)

- [ ] **Step 1: Install dev dependencies**

```bash
bun add -D -W husky lint-staged
```

- [ ] **Step 2: Initialise husky**

```bash
bunx husky init
```

This creates `.husky/pre-commit` (with a default `bun test` line — will be overwritten in Task 2) and adds a `prepare: "husky"` script to `package.json`.

- [ ] **Step 3: Verify install**

```bash
ls -la .husky
cat package.json | grep -E "husky|lint-staged|prepare"
```

Expected: `.husky/` exists with `pre-commit`; `package.json` contains `"prepare": "husky"` and both deps in `devDependencies`.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock .husky/
git commit -m "chore(tooling): install husky and lint-staged at repo root"
```

---

### Task 2: Configure lint-staged for staged-only ESLint

**Files:**

- Modify: `package.json` (root) — add `lint-staged` config block

- [ ] **Step 1: Write a failing manual check**

Create a temporary file `/tmp/lint-staged-test.ts` containing `const unused = 1;` and stage it:

```bash
echo "const unused = 1" > apps/backend/src/__lint_probe__.ts
git add apps/backend/src/__lint_probe__.ts
bunx lint-staged
```

Expected: command exits non-zero with ESLint error on the unused variable, because `lint-staged` config exists. Initially this will instead print "No staged files match any configured task" — confirming the config is missing.

- [ ] **Step 2: Add `lint-staged` config to root `package.json`**

Add this block to root `package.json` (alongside existing fields):

```json
"lint-staged": {
  "*.{ts,tsx,js,mjs,cjs}": [
    "eslint --fix --max-warnings=0"
  ]
}
```

- [ ] **Step 3: Re-run and verify it now fails on the probe**

```bash
bunx lint-staged
```

Expected: ESLint reports the unused-var error and exits non-zero.

- [ ] **Step 4: Clean up probe**

```bash
git reset HEAD apps/backend/src/__lint_probe__.ts
rm apps/backend/src/__lint_probe__.ts
```

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore(tooling): configure lint-staged to run eslint --fix on staged TS/JS files"
```

---

### Task 3: Wire lint-staged into the pre-commit hook

**Files:**

- Modify: `.husky/pre-commit`

- [ ] **Step 1: Replace `.husky/pre-commit` contents**

```bash
bunx lint-staged
```

(File should contain only that line; no shebang needed for modern husky v9.)

- [ ] **Step 2: Verify hook fires by attempting a bad commit**

```bash
echo "const unused = 1" > apps/backend/src/__lint_probe__.ts
git add apps/backend/src/__lint_probe__.ts
git commit -m "probe: should fail"
```

Expected: commit aborted; ESLint output shown.

Clean up:

```bash
git reset HEAD apps/backend/src/__lint_probe__.ts
rm apps/backend/src/__lint_probe__.ts
```

- [ ] **Step 3: Commit**

```bash
git add .husky/pre-commit
git commit -m "chore(tooling): pre-commit hook runs lint-staged"
```

---

### Task 4: Add pre-push hook for full type-check

**Files:**

- Create: `.husky/pre-push`

- [ ] **Step 1: Create `.husky/pre-push` with**

```bash
bun run type-check
```

Make executable (Unix):

```bash
chmod +x .husky/pre-push
```

- [ ] **Step 2: Verify it runs on push (dry-run)**

```bash
# Introduce a temporary type error
echo "const x: number = 'string';" >> apps/backend/src/server.ts
git add apps/backend/src/server.ts
git commit -m "probe: type error" --no-verify
git push --dry-run origin HEAD 2>&1 | head -20
```

Expected: pre-push hook runs `bun run type-check`, fails with the injected type error, push aborted.

Clean up:

```bash
git reset --hard HEAD~1
```

- [ ] **Step 3: Commit hook**

```bash
git add .husky/pre-push
git commit -m "chore(tooling): pre-push hook runs full workspace type-check"
```

---

### Subsystem 2 — Backend test-runner watch mode

### Task 5: Extract pure helpers from `run-tests.ts`

> Goal: make file-discovery and source→test mapping unit-testable before adding watch mode.

**Files:**

- Create: `apps/backend/scripts/test-runner-helpers.ts`
- Create: `apps/backend/scripts/test-runner-helpers.test.ts`
- Modify: `apps/backend/scripts/run-tests.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/scripts/test-runner-helpers.test.ts
import { describe, test, expect } from "bun:test";
import { mapSourceToTestFiles, filterTestFiles } from "./test-runner-helpers";

describe("filterTestFiles", () => {
  const all = ["auth/login.test.ts", "income/source.test.ts", "auth/refresh.test.ts"];

  test("returns all files when no filter", () => {
    expect(filterTestFiles(all, undefined)).toEqual(all);
  });

  test("filters by substring match", () => {
    expect(filterTestFiles(all, "auth")).toEqual(["auth/login.test.ts", "auth/refresh.test.ts"]);
  });

  test("returns empty when no match", () => {
    expect(filterTestFiles(all, "nope")).toEqual([]);
  });
});

describe("mapSourceToTestFiles", () => {
  const all = [
    "auth/auth.service.test.ts",
    "auth/refresh.test.ts",
    "income/source.service.test.ts",
  ];

  test("maps a service file to its sibling .test.ts by filename heuristic", () => {
    expect(mapSourceToTestFiles("src/auth/auth.service.ts", all)).toEqual([
      "auth/auth.service.test.ts",
    ]);
  });

  test("returns the test file itself when given a test file", () => {
    expect(mapSourceToTestFiles("src/auth/refresh.test.ts", all)).toEqual(["auth/refresh.test.ts"]);
  });

  test("falls back to all matching the filter when no filename match", () => {
    expect(mapSourceToTestFiles("src/auth/unrelated-helper.ts", all, "auth")).toEqual([
      "auth/auth.service.test.ts",
      "auth/refresh.test.ts",
    ]);
  });

  test("returns empty when no match and no filter", () => {
    expect(mapSourceToTestFiles("src/unrelated/foo.ts", all)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun test scripts/test-runner-helpers.test.ts`
Expected: FAIL — module `./test-runner-helpers` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/scripts/test-runner-helpers.ts
import { basename } from "node:path";

/**
 * Filter discovered test files by an optional substring pattern.
 */
export function filterTestFiles(files: string[], pattern: string | undefined): string[] {
  if (!pattern) return files;
  return files.filter((f) => f.includes(pattern));
}

/**
 * Map a changed source file to the test files that should re-run.
 *
 * Heuristic (in order):
 *   1. If the changed file is itself a test file (`*.test.ts`), return it.
 *   2. If a sibling test exists with the same base name (`foo.service.ts` → `foo.service.test.ts`), return it.
 *   3. Otherwise, fall back to all test files matching the active filter (or [] when no filter).
 */
export function mapSourceToTestFiles(
  changedPath: string,
  allTestFiles: string[],
  filterPattern?: string
): string[] {
  const name = basename(changedPath);

  if (name.endsWith(".test.ts")) {
    const match = allTestFiles.find((f) => basename(f) === name);
    return match ? [match] : [];
  }

  const expectedTestName = name.replace(/\.ts$/, ".test.ts");
  const sibling = allTestFiles.find((f) => basename(f) === expectedTestName);
  if (sibling) return [sibling];

  return filterPattern ? filterTestFiles(allTestFiles, filterPattern) : [];
}
```

- [ ] **Step 4: Refactor `run-tests.ts` to consume the helpers (no behaviour change)**

```typescript
// apps/backend/scripts/run-tests.ts
/**
 * Isolated test runner for bun test.
 *
 * Bun's mock.module() patches the global module cache, so mocks defined in one
 * test file leak into every other file within the same process. This script
 * spawns a separate `bun test` process per file to guarantee isolation.
 *
 * Supports `--watch` to re-run affected test files on save (see Task 6).
 */

import { Glob } from "bun";
import { filterTestFiles } from "./test-runner-helpers";

const preload = "./src/test/setup.ts";
const testDir = "src";

const glob = new Glob("**/*.test.ts");
const testFiles = Array.from(glob.scanSync(testDir)).sort();

const coverage = process.argv.includes("--coverage");
const watch = process.argv.includes("--watch");

const filterPattern = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const filesToRun = filterTestFiles(testFiles, filterPattern);

async function runFiles(files: string[]): Promise<number> {
  if (files.length === 0) {
    console.log("No test files matched.");
    return 0;
  }

  console.log(`Running ${files.length} test file(s) with per-file isolation...\n`);

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const file of files) {
    const filePath = `${testDir}/${file}`;
    const proc = Bun.spawn(
      ["bun", "test", ...(coverage ? ["--coverage"] : []), "--preload", preload, filePath],
      { stdout: "inherit", stderr: "inherit", env: process.env }
    );

    const exitCode = await proc.exited;
    if (exitCode === 0) passed++;
    else {
      failed++;
      failures.push(filePath);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Test files: ${passed + failed} total, ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`\nFailed files:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failed > 0 ? 1 : 0;
}

if (watch) {
  // Implemented in Task 6.
  await import("./watch-mode").then((m) =>
    m.startWatchMode({ testFiles, filterPattern, runFiles })
  );
} else {
  process.exit(await runFiles(filesToRun));
}
```

- [ ] **Step 5: Run helper test to verify it passes**

Run: `cd apps/backend && bun test scripts/test-runner-helpers.test.ts`
Expected: PASS, all 6 assertions green.

- [ ] **Step 6: Run full suite to verify no regression**

Run: `cd apps/backend && bun scripts/run-tests.ts`
Expected: same pass/fail count as before this task.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/scripts/test-runner-helpers.ts apps/backend/scripts/test-runner-helpers.test.ts apps/backend/scripts/run-tests.ts
git commit -m "refactor(backend/test-runner): extract pure file-discovery and source→test mapping helpers"
```

---

### Task 6: Add watch mode

**Files:**

- Create: `apps/backend/scripts/watch-mode.ts`
- Modify: `apps/backend/package.json` — add `chokidar` to devDependencies

- [ ] **Step 1: Install chokidar**

```bash
cd apps/backend && bun add -D chokidar
```

- [ ] **Step 2: Write the watch-mode entry**

```typescript
// apps/backend/scripts/watch-mode.ts
import chokidar from "chokidar";
import { mapSourceToTestFiles } from "./test-runner-helpers";

interface WatchOptions {
  testFiles: string[];
  filterPattern: string | undefined;
  runFiles: (files: string[]) => Promise<number>;
}

const DEBOUNCE_MS = 150;

export async function startWatchMode({
  testFiles,
  filterPattern,
  runFiles,
}: WatchOptions): Promise<void> {
  console.log(
    `\n👀  watching src/**/*.ts and src/**/*.test.ts${filterPattern ? ` (filter: ${filterPattern})` : ""} — press Ctrl+C to exit\n`
  );

  // Initial run.
  const initial = filterPattern ? testFiles.filter((f) => f.includes(filterPattern)) : testFiles;
  await runFiles(initial);

  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const schedule = (changedPath: string) => {
    pending.add(changedPath);
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      const batch = Array.from(pending);
      pending.clear();

      const affected = new Set<string>();
      for (const p of batch) {
        for (const t of mapSourceToTestFiles(p, testFiles, filterPattern)) {
          affected.add(t);
        }
      }

      if (affected.size === 0) {
        console.log(`\n(no matching tests for: ${batch.join(", ")})\n`);
      } else {
        console.log(`\n— rerun (${Array.from(affected).join(", ")}) —\n`);
        await runFiles(Array.from(affected).sort());
      }
      running = false;
      console.log(`\n👀  watching… (Ctrl+C to exit)\n`);
    }, DEBOUNCE_MS);
  };

  const watcher = chokidar.watch(["src/**/*.ts"], {
    ignored: ["**/node_modules/**", "**/*.d.ts"],
    ignoreInitial: true,
  });

  watcher.on("change", schedule);
  watcher.on("add", schedule);

  // Keep process alive until interrupted.
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      watcher.close().then(() => {
        console.log("\nwatch mode stopped.");
        resolve();
      });
    });
  });
}
```

- [ ] **Step 3: Manual verification**

```bash
cd apps/backend && bun scripts/run-tests.ts auth --watch
```

In another shell, append a comment to any `auth/*.service.ts` file. Expected:

- Watch banner prints on startup.
- On save, the corresponding `auth/*.test.ts` re-runs within ~2 s in a fresh subprocess.
- Saving a test file directly re-runs only that file.
- Saving an unrelated source file (no sibling test, but matches the `auth` filter) re-runs the auth test files.

Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/scripts/watch-mode.ts apps/backend/package.json bun.lock
git commit -m "feat(backend/test-runner): add --watch mode that re-runs affected tests in fresh subprocesses"
```

---

### Subsystem 3 — Coverage floor & ratchet

### Task 7: Capture coverage baseline

**Files:**

- Create: `coverage-baseline.json` (repo root)

- [ ] **Step 1: Generate a fresh coverage report**

```bash
cd apps/backend && bun scripts/run-tests.ts --coverage 2>&1 | tee /tmp/coverage.txt
```

- [ ] **Step 2: Read the summary line per metric** and record per-package values.

Bun's coverage output prints a final table with `% Funcs`, `% Lines`. Statements/branches are not emitted natively by Bun — capture what Bun reports and document the limitation.

- [ ] **Step 3: Create `coverage-baseline.json`** at repo root with the observed values:

```json
{
  "apps/backend": {
    "functions": 0,
    "lines": 0
  }
}
```

Replace `0` with the actual values from Step 1. Round to one decimal place.

- [ ] **Step 4: Commit**

```bash
git add coverage-baseline.json
git commit -m "chore(coverage): capture initial coverage baseline for ratchet enforcement"
```

---

### Task 8: Build coverage-check helper functions (TDD)

**Files:**

- Create: `scripts/check-coverage.ts` (repo root)
- Create: `scripts/check-coverage.test.ts` (repo root)

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/check-coverage.test.ts
import { describe, test, expect } from "bun:test";
import { evaluateCoverage } from "./check-coverage";

const FLOOR = { functions: 70, lines: 75 };

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/check-coverage.test.ts`
Expected: FAIL — `evaluateCoverage` not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/check-coverage.ts
/**
 * Coverage floor + ratchet enforcement.
 *
 * Reads a current coverage summary (functions + lines, the metrics Bun emits natively)
 * and compares it against:
 *   1. A fixed floor (build fails if any metric for any package drops below).
 *   2. A baseline stored in `coverage-baseline.json` (build fails if any metric
 *      drops by more than `ratchetTolerancePp` percentage points for any package).
 */

export type Metric = "functions" | "lines";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/check-coverage.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-coverage.ts scripts/check-coverage.test.ts
git commit -m "feat(coverage): add evaluateCoverage helper for floor + ratchet checks"
```

---

### Task 9: Add CLI entry to `check-coverage.ts`

**Files:**

- Modify: `scripts/check-coverage.ts`

- [ ] **Step 1: Append a CLI entry below the helpers**

```typescript
// Append to scripts/check-coverage.ts

import { existsSync, readFileSync } from "node:fs";

interface RunOptions {
  baselinePath: string;
  currentPath: string;
  floor: Floor;
  ratchetTolerancePp: number;
}

export function runCli(opts: RunOptions): number {
  if (!existsSync(opts.baselinePath)) {
    console.error(`coverage-baseline file not found: ${opts.baselinePath}`);
    return 1;
  }
  if (!existsSync(opts.currentPath)) {
    console.error(`current coverage file not found: ${opts.currentPath}`);
    return 1;
  }

  const baseline = JSON.parse(readFileSync(opts.baselinePath, "utf8")) as Record<
    string,
    PackageCoverage
  >;
  const current = JSON.parse(readFileSync(opts.currentPath, "utf8")) as Record<
    string,
    PackageCoverage
  >;

  const { ok, violations } = evaluateCoverage({
    current,
    baseline,
    floor: opts.floor,
    ratchetTolerancePp: opts.ratchetTolerancePp,
  });

  if (ok) {
    console.log("✅ coverage check passed");
    return 0;
  }

  console.error("❌ coverage check failed:");
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
    `\nIf this drop is intentional, update coverage-baseline.json in the same PR and reviewers will see it.`
  );
  return 1;
}

// Only execute CLI when invoked directly (not when imported by tests).
if (import.meta.main) {
  const exitCode = runCli({
    baselinePath: "coverage-baseline.json",
    currentPath: process.argv[2] ?? "coverage-current.json",
    floor: { functions: 70, lines: 75 },
    ratchetTolerancePp: 1,
  });
  process.exit(exitCode);
}
```

Note: the `floor` numeric values (`functions: 70`, `lines: 75`) are placeholders — replace with values 5–10pp below the observed baseline from Task 7 before committing.

- [ ] **Step 2: Verify tests still pass**

Run: `bun test scripts/check-coverage.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-coverage.ts
git commit -m "feat(coverage): add CLI entry to coverage check script"
```

---

### Task 10: Generate current coverage JSON during test runs

> Bun's `--coverage` flag prints a table but does not emit a machine-readable JSON. We add a small post-processor that writes `coverage-current.json` after the test run, in the same shape as `coverage-baseline.json`.

**Files:**

- Modify: `apps/backend/scripts/run-tests.ts`

- [ ] **Step 1: Capture coverage table output**

Update the `runFiles` block so that when `--coverage` is set, the script reads Bun's stdout (instead of `inherit`-ing) for each subprocess, then parses the aggregate at the end. To keep parsing simple, we accumulate `% Funcs` and `% Lines` from the final summary line printed by `bun test --coverage`. Add this helper:

```typescript
// Add near the top of apps/backend/scripts/run-tests.ts
import { writeFileSync } from "node:fs";

interface BunCoverageRow {
  functions: number;
  lines: number;
}

function parseFinalCoverage(output: string): BunCoverageRow | null {
  // Bun prints a final "All files" row like:
  //   All files | 82.34 | 79.21 | ...
  // followed by lines with `% Funcs` and `% Lines` headers above.
  const allFilesMatch = output
    .split("\n")
    .reverse()
    .find((l) => /^\s*All files\s*\|/.test(l));
  if (!allFilesMatch) return null;
  const parts = allFilesMatch.split("|").map((p) => p.trim());
  // parts: ["All files", "<% Funcs>", "<% Lines>"]
  const functions = Number(parts[1]);
  const lines = Number(parts[2]);
  if (Number.isNaN(functions) || Number.isNaN(lines)) return null;
  return { functions, lines };
}
```

- [ ] **Step 2: At end of `runFiles`, when coverage is on, write the JSON**

After the existing summary print, append:

```typescript
if (coverage) {
  // Re-run aggregated coverage in a single bun test invocation purely to obtain the summary.
  const proc = Bun.spawn(["bun", "test", "--coverage", "--preload", preload, testDir], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  const row = parseFinalCoverage(output);
  if (row) {
    writeFileSync("coverage-current.json", JSON.stringify({ "apps/backend": row }, null, 2));
    console.log(`\nwrote coverage-current.json (functions ${row.functions}%, lines ${row.lines}%)`);
  } else {
    console.warn("⚠ could not parse Bun coverage summary; coverage-current.json not written");
  }
}
```

- [ ] **Step 3: Verify locally**

```bash
cd apps/backend && bun scripts/run-tests.ts --coverage
cat ../../coverage-current.json
```

Expected: file contains `{ "apps/backend": { "functions": <num>, "lines": <num> } }`.

- [ ] **Step 4: Add `coverage-current.json` to `.gitignore`**

```bash
echo "coverage-current.json" >> .gitignore
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/scripts/run-tests.ts .gitignore
git commit -m "feat(backend/test-runner): emit coverage-current.json alongside --coverage runs"
```

---

### Task 11: Wire coverage check into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update the `test` job**

In `.github/workflows/ci.yml`, after the `Run tests` step in the `test` job, append:

```yaml
- name: Run tests with coverage
  run: cd apps/backend && bun scripts/run-tests.ts --coverage
  env:
    DATABASE_URL: postgresql://finplan:finplan_dev_password@localhost:5432/finplan_test

- name: Check coverage floor & ratchet
  run: bun scripts/check-coverage.ts coverage-current.json

- name: Upload coverage artefact
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage-current.json
```

(The existing `Run tests` step remains; this adds the coverage variant + check. If duplicate runtime becomes an issue, fold the two `Run tests` steps into one by replacing the original with the `--coverage` variant.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce coverage floor and ratchet in test job"
```

---

### Documentation

### Task 12: Document dev tooling

**Files:**

- Create: `docs/3. architecture/dev-tooling.md`
- Modify: `.claude/CLAUDE.md` (root project instructions) — add one-line pointer to the new doc

- [ ] **Step 1: Create `docs/3. architecture/dev-tooling.md`**

````markdown
# Dev Tooling — Hooks, Watch Mode, Coverage

> Local-and-CI feedback loop for finplan.

## Pre-commit hook

Runs `lint-staged`, which runs `eslint --fix --max-warnings=0` on staged `*.{ts,tsx,js,mjs,cjs}` files only. Typical run ≤ 5 s for 1–5 files.

**Bypass:** `git commit --no-verify` — sanctioned escape hatch. CI re-runs full lint on PRs, so a bypass cannot reach `stage`/`prod` un-checked.

## Pre-push hook

Runs `bun run type-check` (full workspace, via Turbo). Typical run 10–25 s.

**Bypass:** `git push --no-verify` — same policy as pre-commit. CI re-runs type-check.

## Backend test watch mode

```bash
cd apps/backend
bun scripts/run-tests.ts --watch              # all files
bun scripts/run-tests.ts auth --watch         # files matching "auth"
```
````

- Re-runs affected test file(s) on save, in a fresh `bun test` subprocess (preserves the per-file isolation guarantee).
- Source → test mapping uses a filename heuristic: `foo.service.ts` → `foo.service.test.ts`. When no sibling exists and a filter is active, falls back to all test files matching the filter.

## Coverage floor & ratchet

- **Baseline:** `coverage-baseline.json` at the repo root — per-package functions/lines percentages.
- **Floor:** fixed minimum enforced in `scripts/check-coverage.ts` (currently functions ≥ 70%, lines ≥ 75%).
- **Ratchet:** any drop > 1 pp on any metric for any package fails CI.

**Updating the baseline.** When a refactor legitimately moves code (raising one package, lowering another), update `coverage-baseline.json` in the same PR. Reviewers see the diff explicitly.

**Running locally:**

```bash
cd apps/backend && bun scripts/run-tests.ts --coverage
bun scripts/check-coverage.ts coverage-current.json
```

````

- [ ] **Step 2: Add pointer to `.claude/CLAUDE.md`** under the Code Quality section:

```markdown
- See `docs/3. architecture/dev-tooling.md` for hook bypass policy, watch-mode usage, and coverage baseline updates.
````

- [ ] **Step 3: Commit**

```bash
git add "docs/3. architecture/dev-tooling.md" .claude/CLAUDE.md
git commit -m "docs(architecture): document hooks, watch mode, coverage baseline policy"
```

---

## Testing

### Backend tests

- [ ] `test-runner-helpers.test.ts` — covers `filterTestFiles` and `mapSourceToTestFiles` for all heuristic branches (self, sibling, filter-fallback, miss).
- [ ] `check-coverage.test.ts` — covers floor breach, ratchet breach, ratchet-within-tolerance pass, missing-baseline, and full-pass cases.

### Manual integration tests

- [ ] **Pre-commit blocks bad lint:** stage a file with an unused var; `git commit` fails with ESLint error and non-zero exit.
- [ ] **Pre-commit only lints staged:** stage one of two changed files; only the staged one is linted.
- [ ] **Pre-commit fast:** time the hook on a 1–5 file change; should be ≤ 5 s.
- [ ] **Pre-push blocks bad type:** introduce a type error; `git push` is blocked with the type-check failure.
- [ ] **Watch mode banner:** `bun scripts/run-tests.ts --watch` prints the watching banner.
- [ ] **Watch mode re-runs only affected:** save `foo.service.ts`; only `foo.service.test.ts` re-runs.
- [ ] **Watch mode isolation:** verify each re-run is a new subprocess (PID changes; previous mocks do not leak).
- [ ] **Watch mode + filter:** `bun scripts/run-tests.ts auth --watch` only watches/runs auth-matching files.
- [ ] **Coverage floor fails CI:** temporarily lower a package's coverage below floor; CI step fails with clear message.
- [ ] **Ratchet fails CI:** temporarily edit baseline to claim a higher number; CI fails with > 1pp drop message.

### Key scenarios

- [ ] Happy path: commit lint-clean code → pre-commit passes → push → pre-push passes → CI green.
- [ ] Error case: commit lint-violating code → blocked at pre-commit; bypass with `--no-verify` → blocked at CI.
- [ ] Edge case: refactor moves a heavily-tested module → coverage drops > 1pp in one package; PR updates `coverage-baseline.json` in same commit → ratchet passes.

## Verification

- [ ] `bun run build` passes clean.
- [ ] `bun run lint` — zero warnings.
- [ ] `bun run type-check` — passes.
- [ ] `bun test scripts/check-coverage.test.ts` — all assertions green.
- [ ] `cd apps/backend && bun test scripts/test-runner-helpers.test.ts` — all assertions green.
- [ ] `cd apps/backend && bun scripts/run-tests.ts` — full backend suite still passes.
- [ ] `cd apps/backend && bun scripts/run-tests.ts --watch` — banner appears; file change triggers re-run within 2 s.
- [ ] CI on a draft PR: lint, type-check, test, and coverage-check jobs all run and pass.

## Post-conditions

- [ ] Developers get lint feedback at commit time and type feedback at push time, reducing CI round-trips.
- [ ] Backend TDD has a sub-second-ish iteration loop (save → affected test re-runs).
- [ ] Coverage regressions > 1 pp per package or below the fixed floor block PRs in CI; `coverage-baseline.json` makes legitimate shifts an explicit, reviewable artefact.
- [ ] Unlocks: any subsequent feature can rely on the safety net rather than re-inventing checks per-PR.
