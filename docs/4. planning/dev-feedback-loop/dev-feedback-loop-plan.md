---
feature: dev-feedback-loop
category: infrastructure
spec: docs/4. planning/dev-feedback-loop/dev-feedback-loop-spec.md
creation_date: 2026-05-04
status: backlog
implemented_date:
---

# Dev Feedback Loop — Implementation Plan

> **For Claude:** Use `/execute-plan dev-feedback-loop` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit where the artefact is testable code; configuration tasks have explicit manual-verification steps.

**Goal:** Wire pre-commit/pre-push hooks, add watch mode to both `run-tests.ts` runners, and gate CI on a fixed-floor + ratchet coverage check.

**Spec:** `docs/4. planning/dev-feedback-loop/dev-feedback-loop-spec.md`

**Architecture:** Three independent subsystems, each shippable separately. Hooks layer (husky + lint-staged) is config-only. Watch mode adds pure helpers + a watcher loop to the existing per-app `run-tests.ts` (each runner spawns isolated subprocesses; watch mode preserves that). Coverage check writes per-subprocess LCOV, merges to one file per app, and a new root-level `scripts/check-coverage.ts` evaluates that file against `coverage-baseline.json` and a fixed floor.

**Tech Stack:** husky · lint-staged · Bun · Node fs.watch · LCOV (no new parser dep) · GitHub Actions

**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [ ] Working tree clean on a fresh feature branch off `stage`
- [ ] `bun install` succeeds from the repo root
- [ ] `bun run lint`, `bun run type-check`, `bun run build` all currently pass on this branch (baseline must be green before adding gates)
- [ ] The three subsystems are independent. If a more incremental rollout is preferred, group tasks as: **PR 1** = Tasks 1–3 (hooks), **PR 2** = Tasks 4–7 (watch mode), **PR 3** = Tasks 8–14 (coverage). The plan still works end-to-end if executed in one go.

## Open Decisions (assumed during plan-write)

> Documenting choices made so /execute-plan does not re-litigate them.

- **Coverage check covers backend + frontend.** Both runners write LCOV; the root check script reads both.
- **No new dependency for file watching.** Bun's `fs.watch` is sufficient for our recursive directory watching needs.
- **No new LCOV parser dependency.** The format is small (LF/SF/DA/BRDA records); we write a ~40-line parser in-repo.
- **Watch-mode source→test mapping is a static filename heuristic.** `foo.service.ts` → `foo.service.test.ts(x)`; on miss, fall back to "re-run all matching the active filter."
- **Initial fixed-floor coverage values** are set by Task 11 (baseline run) at `baseline − 5 percentage points`, per metric per app. The numbers are not in this plan because they require running coverage first.
- **Hooks live at the repo root.** Husky `.husky/` and `.lintstagedrc.json` at repo root.

## Tasks

> Each task is one logical change with the minimum code to make it work. Run lint and type-check after each task per CLAUDE.md.

---

### Task 1: Install husky + lint-staged, init husky

**Files:**

- Modify: `package.json`
- Create: `.husky/_/` (initialised by `husky init`)

- [ ] **Step 1: Add devDeps and prepare script**

```bash
bun add -d -D husky lint-staged
```

Then add to root `package.json` `scripts` block (alphabetical insertion):

```json
"prepare": "husky"
```

- [ ] **Step 2: Initialise husky**

```bash
bun run prepare
```

Expected: `.husky/_/` directory created with husky's runtime files. No hooks yet.

- [ ] **Step 3: Verify install**

```bash
ls -la .husky/_
cat package.json | grep -A1 '"prepare"'
```

Expected: `.husky/_` exists; `prepare` script present in `package.json`.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock .husky/_
git commit -m "chore(tooling): add husky + lint-staged dependencies"
```

---

### Task 2: Add lint-staged config and pre-commit hook

**Files:**

- Create: `.lintstagedrc.json`
- Create: `.husky/pre-commit`

- [ ] **Step 1: Write `.lintstagedrc.json`**

```json
{
  "apps/backend/**/*.{ts,mjs,cjs,js}": ["eslint --fix --max-warnings=0"],
  "apps/frontend/**/*.{ts,tsx,mjs,cjs,js}": ["eslint --fix --max-warnings=0"],
  "packages/shared/**/*.{ts,mjs,cjs,js}": ["eslint --fix --max-warnings=0"],
  "*.{ts,mjs,cjs,js}": ["eslint --fix --max-warnings=0"]
}
```

- [ ] **Step 2: Write `.husky/pre-commit`**

```sh
bun x lint-staged
```

- [ ] **Step 3: Make pre-commit executable (Unix; no-op on Windows but the file must exist)**

```bash
chmod +x .husky/pre-commit
```

- [ ] **Step 4: Manual verification — block on lint error**

```bash
# Introduce a deliberate unused import in a backend file
echo "import { join } from 'node:path';" >> apps/backend/src/server.ts
git add apps/backend/src/server.ts
git commit -m "test: should be blocked"
```

Expected: commit **fails** with an ESLint error referencing the unused import.

Then revert:

```bash
git restore --staged apps/backend/src/server.ts
git checkout -- apps/backend/src/server.ts
```

- [ ] **Step 5: Manual verification — passes when clean**

```bash
echo "// touched" >> apps/backend/src/server.ts
git add apps/backend/src/server.ts
git commit -m "test: should pass"
```

Expected: commit **succeeds**. Then revert:

```bash
git reset --hard HEAD~1
```

- [ ] **Step 6: Commit the hook itself**

```bash
git add .lintstagedrc.json .husky/pre-commit
git commit -m "chore(tooling): add pre-commit hook running lint-staged"
```

---

### Task 3: Add pre-push hook (type-check)

**Files:**

- Create: `.husky/pre-push`

- [ ] **Step 1: Write `.husky/pre-push`**

```sh
bun run type-check
```

- [ ] **Step 2: Make executable**

```bash
chmod +x .husky/pre-push
```

- [ ] **Step 3: Manual verification — block on type error**

```bash
# Introduce a deliberate type error
echo "const x: number = 'string';" >> apps/backend/src/server.ts
git add apps/backend/src/server.ts
git commit -m "test: type error" --no-verify
git push origin HEAD --dry-run 2>&1 | tee /tmp/push.log
```

Expected: `git push` fails with a TypeScript error.

Revert:

```bash
git reset --hard HEAD~1
```

- [ ] **Step 4: Commit**

```bash
git add .husky/pre-push
git commit -m "chore(tooling): add pre-push hook running type-check"
```

---

### Task 4: Extract pure helpers from `apps/backend/scripts/run-tests.ts`

> TDD task — write the test for new helpers, then extract the implementation.

**Files:**

- Create: `apps/backend/scripts/run-tests-helpers.ts`
- Create: `apps/backend/scripts/__tests__/run-tests-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/scripts/__tests__/run-tests-helpers.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { mapSourceToTest, matchTestsForChange, parseRunnerArgs } from "../run-tests-helpers";

describe("parseRunnerArgs", () => {
  it("returns coverage=false and no filter on empty argv", () => {
    expect(parseRunnerArgs([])).toEqual({ coverage: false, watch: false, filter: undefined });
  });

  it("detects --coverage and --watch flags", () => {
    expect(parseRunnerArgs(["--coverage", "--watch"])).toEqual({
      coverage: true,
      watch: true,
      filter: undefined,
    });
  });

  it("treats the first non-flag positional as the filter", () => {
    expect(parseRunnerArgs(["auth", "--watch"])).toEqual({
      coverage: false,
      watch: true,
      filter: "auth",
    });
  });
});

describe("mapSourceToTest", () => {
  it("maps a service file to its .test.ts neighbour", () => {
    const allTests = ["src/services/foo.service.test.ts", "src/services/bar.service.test.ts"];
    expect(mapSourceToTest("src/services/foo.service.ts", allTests)).toEqual([
      "src/services/foo.service.test.ts",
    ]);
  });

  it("returns an empty array when no neighbour matches", () => {
    const allTests = ["src/services/bar.service.test.ts"];
    expect(mapSourceToTest("src/utils/orphan.ts", allTests)).toEqual([]);
  });

  it("returns the test file unchanged when passed a test file path", () => {
    const allTests = ["src/services/foo.service.test.ts"];
    expect(mapSourceToTest("src/services/foo.service.test.ts", allTests)).toEqual([
      "src/services/foo.service.test.ts",
    ]);
  });
});

describe("matchTestsForChange", () => {
  const allTests = ["src/services/foo.service.test.ts", "src/routes/auth.routes.test.ts"];

  it("returns the mapped test for a source change", () => {
    expect(matchTestsForChange("src/services/foo.service.ts", allTests, undefined)).toEqual([
      "src/services/foo.service.test.ts",
    ]);
  });

  it("returns filtered tests when no mapping found and filter present", () => {
    expect(matchTestsForChange("src/utils/orphan.ts", allTests, "auth")).toEqual([
      "src/routes/auth.routes.test.ts",
    ]);
  });

  it("returns empty array when no mapping and no filter", () => {
    expect(matchTestsForChange("src/utils/orphan.ts", allTests, undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd apps/backend && bun scripts/run-tests.ts run-tests-helpers
```

Expected: FAIL — `Cannot find module '../run-tests-helpers'`.

- [ ] **Step 3: Write the helper module**

`apps/backend/scripts/run-tests-helpers.ts`:

```typescript
export type RunnerArgs = {
  coverage: boolean;
  watch: boolean;
  filter: string | undefined;
};

export function parseRunnerArgs(argv: string[]): RunnerArgs {
  const coverage = argv.includes("--coverage");
  const watch = argv.includes("--watch");
  const filter = argv.find((arg) => !arg.startsWith("--"));
  return { coverage, watch, filter };
}

/**
 * Given a changed file path, find candidate test files.
 * Uses a static filename heuristic: `foo.service.ts` -> `foo.service.test.ts`.
 * Returns the input itself if it is already a test file.
 */
export function mapSourceToTest(changedPath: string, allTests: string[]): string[] {
  if (/\.test\.tsx?$/.test(changedPath)) {
    return allTests.includes(changedPath) ? [changedPath] : [];
  }
  const candidate = changedPath.replace(/\.tsx?$/, ".test.ts");
  const candidateTsx = changedPath.replace(/\.tsx?$/, ".test.tsx");
  return allTests.filter((t) => t === candidate || t === candidateTsx);
}

/**
 * Final mapping used by the watcher: try source->test first, fall back to
 * filter-matching, fall back to empty (caller may decide to no-op).
 */
export function matchTestsForChange(
  changedPath: string,
  allTests: string[],
  filter: string | undefined
): string[] {
  const mapped = mapSourceToTest(changedPath, allTests);
  if (mapped.length > 0) return mapped;
  if (filter) return allTests.filter((t) => t.includes(filter));
  return [];
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd apps/backend && bun scripts/run-tests.ts run-tests-helpers
```

Expected: PASS, 3 describe blocks, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/scripts/run-tests-helpers.ts apps/backend/scripts/__tests__/run-tests-helpers.test.ts
git commit -m "test(backend): extract pure helpers from test runner"
```

---

### Task 5: Add `--watch` to `apps/backend/scripts/run-tests.ts`

**Files:**

- Modify: `apps/backend/scripts/run-tests.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
/**
 * Isolated test runner for bun test.
 *
 * Bun's mock.module() patches the global module cache, so mocks defined in one
 * test file leak into every other file within the same process. This script
 * spawns a separate `bun test` process per file to guarantee isolation.
 *
 * Supports an optional --watch mode that re-runs the affected test file on
 * change. Each re-run still spawns a fresh subprocess (the isolation guarantee
 * is preserved).
 */

import { Glob } from "bun";
import { watch } from "node:fs";
import { resolve } from "node:path";
import { matchTestsForChange, parseRunnerArgs } from "./run-tests-helpers";

const preload = "./src/test/setup.ts";
const testDir = "src";

function discoverTests(): string[] {
  const glob = new Glob("**/*.test.ts");
  return Array.from(glob.scanSync(testDir))
    .map((f) => `${testDir}/${f}`)
    .sort();
}

async function runOne(file: string, coverage: boolean): Promise<number> {
  const proc = Bun.spawn(
    ["bun", "test", ...(coverage ? ["--coverage"] : []), "--preload", preload, file],
    { stdout: "inherit", stderr: "inherit", env: process.env }
  );
  return await proc.exited;
}

async function runMany(files: string[], coverage: boolean): Promise<boolean> {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const file of files) {
    const code = await runOne(file, coverage);
    if (code === 0) passed++;
    else {
      failed++;
      failures.push(file);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Test files: ${passed + failed} total, ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`\nFailed files:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failed === 0;
}

const args = parseRunnerArgs(process.argv.slice(2));
const allTests = discoverTests();
const filesToRun = args.filter ? allTests.filter((f) => f.includes(args.filter!)) : allTests;

if (filesToRun.length === 0) {
  console.log("No test files matched.");
  process.exit(0);
}

if (!args.watch) {
  console.log(`Running ${filesToRun.length} test file(s) with per-file isolation...\n`);
  const ok = await runMany(filesToRun, args.coverage);
  process.exit(ok ? 0 : 1);
}

// --watch mode
console.log(`[watch] Running ${filesToRun.length} test file(s); then watching for changes...\n`);
await runMany(filesToRun, args.coverage);
console.log(`\n[watch] Watching ${testDir}/ for changes. Press Ctrl+C to exit.`);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Set<string>();

function scheduleRun(file: string) {
  pending.add(file);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const changed = Array.from(pending);
    pending.clear();
    debounceTimer = null;

    const tests = new Set<string>();
    for (const c of changed) {
      for (const t of matchTestsForChange(c, allTests, args.filter)) tests.add(t);
    }
    if (tests.size === 0) {
      console.log(`[watch] No matching test for change(s); skipping.`);
      return;
    }
    console.log(`\n[watch] Re-running ${tests.size} test file(s)...`);
    await runMany(Array.from(tests), args.coverage);
    console.log(`\n[watch] Done. Watching for next change.`);
  }, 200);
}

watch(resolve(testDir), { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (!/\.tsx?$/.test(filename)) return;
  const relPath = `${testDir}/${filename.replace(/\\/g, "/")}`;
  scheduleRun(relPath);
});
```

- [ ] **Step 2: Verify non-watch invocation still works**

```bash
cd apps/backend && bun scripts/run-tests.ts run-tests-helpers
```

Expected: PASS, same as before.

- [ ] **Step 3: Manual smoke test of watch mode**

```bash
cd apps/backend && bun scripts/run-tests.ts run-tests-helpers --watch
```

Wait for "Watching..." line. In another shell:

```bash
touch apps/backend/scripts/__tests__/run-tests-helpers.test.ts
```

Expected: the watcher re-runs the helpers test file within ~2s. Ctrl+C to exit.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/scripts/run-tests.ts
git commit -m "feat(tooling): add --watch mode to backend test runner"
```

---

### Task 6: Mirror helpers + watch mode to the frontend runner

**Files:**

- Create: `apps/frontend/scripts/run-tests-helpers.ts` (mirror of backend with `.tsx?` glob support)
- Create: `apps/frontend/scripts/__tests__/run-tests-helpers.test.ts` (mirror)
- Modify: `apps/frontend/scripts/run-tests.ts`

- [ ] **Step 1: Write the helper test (mirror, change glob expectations to handle tsx)**

`apps/frontend/scripts/__tests__/run-tests-helpers.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { mapSourceToTest, matchTestsForChange, parseRunnerArgs } from "../run-tests-helpers";

describe("parseRunnerArgs", () => {
  it("returns defaults on empty argv", () => {
    expect(parseRunnerArgs([])).toEqual({ coverage: false, watch: false, filter: undefined });
  });
  it("detects --coverage and --watch", () => {
    expect(parseRunnerArgs(["--coverage", "--watch"])).toEqual({
      coverage: true,
      watch: true,
      filter: undefined,
    });
  });
});

describe("mapSourceToTest", () => {
  it("maps a tsx component to its .test.tsx neighbour", () => {
    const allTests = ["src/components/Foo.test.tsx"];
    expect(mapSourceToTest("src/components/Foo.tsx", allTests)).toEqual([
      "src/components/Foo.test.tsx",
    ]);
  });
  it("maps a ts hook to its .test.ts neighbour", () => {
    const allTests = ["src/hooks/useFoo.test.ts"];
    expect(mapSourceToTest("src/hooks/useFoo.ts", allTests)).toEqual(["src/hooks/useFoo.test.ts"]);
  });
});

describe("matchTestsForChange", () => {
  const allTests = ["src/components/Foo.test.tsx", "src/hooks/useAuth.test.ts"];
  it("uses static mapping when source matches", () => {
    expect(matchTestsForChange("src/components/Foo.tsx", allTests, undefined)).toEqual([
      "src/components/Foo.test.tsx",
    ]);
  });
  it("falls back to filter when no mapping", () => {
    expect(matchTestsForChange("src/utils/orphan.ts", allTests, "auth")).toEqual([
      "src/hooks/useAuth.test.ts",
    ]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/frontend && bun scripts/run-tests.ts run-tests-helpers
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper module (identical to backend; the regex already handles tsx)**

`apps/frontend/scripts/run-tests-helpers.ts`:

```typescript
export type RunnerArgs = {
  coverage: boolean;
  watch: boolean;
  filter: string | undefined;
};

export function parseRunnerArgs(argv: string[]): RunnerArgs {
  const coverage = argv.includes("--coverage");
  const watch = argv.includes("--watch");
  const filter = argv.find((arg) => !arg.startsWith("--"));
  return { coverage, watch, filter };
}

export function mapSourceToTest(changedPath: string, allTests: string[]): string[] {
  if (/\.test\.tsx?$/.test(changedPath)) {
    return allTests.includes(changedPath) ? [changedPath] : [];
  }
  const candidate = changedPath.replace(/\.tsx?$/, ".test.ts");
  const candidateTsx = changedPath.replace(/\.tsx?$/, ".test.tsx");
  return allTests.filter((t) => t === candidate || t === candidateTsx);
}

export function matchTestsForChange(
  changedPath: string,
  allTests: string[],
  filter: string | undefined
): string[] {
  const mapped = mapSourceToTest(changedPath, allTests);
  if (mapped.length > 0) return mapped;
  if (filter) return allTests.filter((t) => t.includes(filter));
  return [];
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd apps/frontend && bun scripts/run-tests.ts run-tests-helpers
```

Expected: PASS.

- [ ] **Step 5: Update `apps/frontend/scripts/run-tests.ts`**

Replace contents:

```typescript
/**
 * Isolated test runner for bun test (frontend).
 * Mirrors the backend runner; supports --watch.
 */

import { Glob } from "bun";
import { watch } from "node:fs";
import { resolve } from "node:path";
import { matchTestsForChange, parseRunnerArgs } from "./run-tests-helpers";

const preload = "./src/test/setup.ts";
const testDir = "src";

function discoverTests(): string[] {
  const glob = new Glob("**/*.test.{ts,tsx}");
  return Array.from(glob.scanSync(testDir))
    .map((f) => `${testDir}/${f}`)
    .sort();
}

async function runOne(file: string, coverage: boolean): Promise<number> {
  const filePath = resolve(file);
  const proc = Bun.spawn(
    ["bun", "test", ...(coverage ? ["--coverage"] : []), "--preload", preload, filePath],
    { stdout: "inherit", stderr: "inherit", env: process.env }
  );
  return await proc.exited;
}

async function runMany(files: string[], coverage: boolean): Promise<boolean> {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  for (const file of files) {
    const code = await runOne(file, coverage);
    if (code === 0) passed++;
    else {
      failed++;
      failures.push(file);
    }
  }
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Test files: ${passed + failed} total, ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`\nFailed files:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failed === 0;
}

const args = parseRunnerArgs(process.argv.slice(2));
const allTests = discoverTests();
const filesToRun = args.filter ? allTests.filter((f) => f.includes(args.filter!)) : allTests;

if (filesToRun.length === 0) {
  console.log("No test files matched.");
  process.exit(0);
}

if (!args.watch) {
  console.log(`Running ${filesToRun.length} test file(s) with per-file isolation...\n`);
  const ok = await runMany(filesToRun, args.coverage);
  process.exit(ok ? 0 : 1);
}

console.log(`[watch] Running ${filesToRun.length} test file(s); then watching for changes...\n`);
await runMany(filesToRun, args.coverage);
console.log(`\n[watch] Watching ${testDir}/ for changes. Press Ctrl+C to exit.`);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Set<string>();

function scheduleRun(file: string) {
  pending.add(file);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const changed = Array.from(pending);
    pending.clear();
    debounceTimer = null;
    const tests = new Set<string>();
    for (const c of changed) {
      for (const t of matchTestsForChange(c, allTests, args.filter)) tests.add(t);
    }
    if (tests.size === 0) {
      console.log(`[watch] No matching test for change(s); skipping.`);
      return;
    }
    console.log(`\n[watch] Re-running ${tests.size} test file(s)...`);
    await runMany(Array.from(tests), args.coverage);
    console.log(`\n[watch] Done. Watching for next change.`);
  }, 200);
}

watch(resolve(testDir), { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (!/\.tsx?$/.test(filename)) return;
  const relPath = `${testDir}/${filename.replace(/\\/g, "/")}`;
  scheduleRun(relPath);
});
```

- [ ] **Step 6: Verify non-watch still works**

```bash
cd apps/frontend && bun scripts/run-tests.ts run-tests-helpers
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/scripts/
git commit -m "feat(tooling): add --watch mode to frontend test runner"
```

---

### Task 7: Add `test:watch` scripts to both apps

**Files:**

- Modify: `apps/backend/package.json`
- Modify: `apps/frontend/package.json`

- [ ] **Step 1: Add `test:watch` to backend**

In `apps/backend/package.json` `scripts` block, add:

```json
"test:watch": "bun scripts/run-tests.ts --watch"
```

- [ ] **Step 2: Add `test:watch` to frontend**

Same addition in `apps/frontend/package.json`.

- [ ] **Step 3: Verify**

```bash
cd apps/backend && bun run test:watch run-tests-helpers
```

Expected: enters watch mode after a green run. Ctrl+C to exit. Repeat in `apps/frontend`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/package.json apps/frontend/package.json
git commit -m "chore(tooling): expose test:watch script in both apps"
```

---

### Task 8: Backend runner — write LCOV per subprocess + merge

**Files:**

- Modify: `apps/backend/scripts/run-tests.ts`

> The trick: `bun test --coverage --coverage-reporter=lcov --coverage-dir=DIR` writes `DIR/lcov.info`. Each subprocess overwrites it. Per-subprocess: pass a unique `--coverage-dir`. After the loop, concatenate all `lcov.info` into one file (LCOV is line-based; concatenation is valid).

- [ ] **Step 1: Update `runOne` and add merge step**

Modify only the coverage-relevant parts of `runOne` and add a post-loop merge in `runMany`:

```typescript
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

// ... existing imports

const COVERAGE_PARTS_DIR = "coverage/.parts";

async function runOne(file: string, coverage: boolean, idx: number): Promise<number> {
  const coverageArgs = coverage
    ? [
        "--coverage",
        "--coverage-reporter=lcov",
        `--coverage-dir=${join(COVERAGE_PARTS_DIR, String(idx))}`,
      ]
    : [];
  const proc = Bun.spawn(["bun", "test", ...coverageArgs, "--preload", preload, file], {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  return await proc.exited;
}

async function mergeLcov(): Promise<void> {
  const glob = new Glob(`${COVERAGE_PARTS_DIR}/*/lcov.info`);
  const parts = Array.from(glob.scanSync("."));
  const chunks: string[] = [];
  for (const p of parts) {
    chunks.push(await readFile(p, "utf-8"));
  }
  await mkdir("coverage", { recursive: true });
  await writeFile("coverage/lcov.info", chunks.join("\n"));
}

async function runMany(files: string[], coverage: boolean): Promise<boolean> {
  if (coverage) await rm(COVERAGE_PARTS_DIR, { recursive: true, force: true });
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const code = await runOne(files[i]!, coverage, i);
    if (code === 0) passed++;
    else {
      failed++;
      failures.push(files[i]!);
    }
  }
  if (coverage) await mergeLcov();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Test files: ${passed + failed} total, ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`\nFailed files:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failed === 0;
}
```

- [ ] **Step 2: Verify a coverage run produces a merged file**

```bash
cd apps/backend && bun scripts/run-tests.ts run-tests-helpers --coverage
ls -la coverage/lcov.info
head -20 coverage/lcov.info
```

Expected: `coverage/lcov.info` exists; contains `SF:` (source-file) and `DA:` (data-line) records.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/scripts/run-tests.ts
git commit -m "feat(tooling): backend runner emits merged LCOV under --coverage"
```

---

### Task 9: Mirror LCOV merge to frontend runner

**Files:**

- Modify: `apps/frontend/scripts/run-tests.ts`

- [ ] **Step 1: Apply the identical changes** from Task 8 (Step 1) to the frontend runner. The only difference: keep the frontend's existing `resolve(file)` call site.

- [ ] **Step 2: Verify**

```bash
cd apps/frontend && bun scripts/run-tests.ts run-tests-helpers --coverage
ls -la coverage/lcov.info
```

Expected: file exists with LCOV records.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/scripts/run-tests.ts
git commit -m "feat(tooling): frontend runner emits merged LCOV under --coverage"
```

---

### Task 10: Pure LCOV parser + coverage evaluator with tests

**Files:**

- Create: `scripts/lcov.ts`
- Create: `scripts/coverage-eval.ts`
- Create: `scripts/__tests__/lcov.test.ts`
- Create: `scripts/__tests__/coverage-eval.test.ts`

- [ ] **Step 1: Write the failing tests**

`scripts/__tests__/lcov.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { parseLcov, summarise } from "../lcov";

const SAMPLE = `TN:
SF:src/foo.ts
FN:1,fooFn
FNDA:1,fooFn
FNF:1
FNH:1
DA:1,1
DA:2,1
DA:3,0
LF:3
LH:2
BRDA:2,0,0,1
BRDA:2,0,1,0
BRF:2
BRH:1
end_of_record
SF:src/bar.ts
DA:1,0
DA:2,0
LF:2
LH:0
BRF:0
BRH:0
FNF:0
FNH:0
end_of_record`;

describe("parseLcov", () => {
  it("parses one record per SF block", () => {
    const records = parseLcov(SAMPLE);
    expect(records).toHaveLength(2);
    expect(records[0]?.sourceFile).toBe("src/foo.ts");
    expect(records[1]?.sourceFile).toBe("src/bar.ts");
  });

  it("extracts line + branch + fn totals", () => {
    const [foo] = parseLcov(SAMPLE);
    expect(foo).toMatchObject({
      linesFound: 3,
      linesHit: 2,
      branchesFound: 2,
      branchesHit: 1,
      fnFound: 1,
      fnHit: 1,
    });
  });
});

describe("summarise", () => {
  it("computes aggregate percentages across all records", () => {
    const records = parseLcov(SAMPLE);
    const s = summarise(records);
    // lines: 2+0 hit of 3+2 = 2/5 = 40
    expect(s.lines).toBeCloseTo(40, 1);
    // branches: 1+0 hit of 2+0 = 1/2 = 50
    expect(s.branches).toBeCloseTo(50, 1);
    // functions: 1+0 hit of 1+0 = 1/1 = 100
    expect(s.functions).toBeCloseTo(100, 1);
    // statements (we treat = lines for LCOV): same 40
    expect(s.statements).toBeCloseTo(40, 1);
  });

  it("returns zeros on empty input", () => {
    expect(summarise([])).toEqual({ statements: 0, branches: 0, functions: 0, lines: 0 });
  });
});
```

`scripts/__tests__/coverage-eval.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { evaluateCoverage } from "../coverage-eval";

const baseline = {
  "apps/backend": { statements: 80, branches: 70, functions: 90, lines: 80 },
  "apps/frontend": { statements: 75, branches: 65, functions: 85, lines: 75 },
};

const floor = { statements: 60, branches: 50, functions: 60, lines: 60 };

describe("evaluateCoverage", () => {
  it("passes when current >= baseline AND >= floor", () => {
    const current = {
      "apps/backend": { statements: 81, branches: 71, functions: 91, lines: 81 },
      "apps/frontend": { statements: 76, branches: 66, functions: 86, lines: 76 },
    };
    const result = evaluateCoverage({ current, baseline, floor });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("fails on floor breach", () => {
    const current = {
      "apps/backend": { statements: 55, branches: 70, functions: 90, lines: 80 },
      "apps/frontend": { statements: 75, branches: 65, functions: 85, lines: 75 },
    };
    const result = evaluateCoverage({ current, baseline, floor });
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatchObject({
      kind: "floor",
      pkg: "apps/backend",
      metric: "statements",
    });
  });

  it("fails when ratchet drop exceeds 1pp", () => {
    const current = {
      "apps/backend": { statements: 78, branches: 70, functions: 90, lines: 80 }, // -2 vs baseline
      "apps/frontend": { statements: 75, branches: 65, functions: 85, lines: 75 },
    };
    const result = evaluateCoverage({ current, baseline, floor });
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatchObject({
      kind: "ratchet",
      pkg: "apps/backend",
      metric: "statements",
    });
  });

  it("tolerates a drop within the 1pp budget", () => {
    const current = {
      "apps/backend": { statements: 79.2, branches: 70, functions: 90, lines: 80 }, // -0.8
      "apps/frontend": { statements: 75, branches: 65, functions: 85, lines: 75 },
    };
    const result = evaluateCoverage({ current, baseline, floor });
    expect(result.ok).toBe(true);
  });

  it("reports a missing package as a violation", () => {
    const current = {
      "apps/backend": { statements: 81, branches: 71, functions: 91, lines: 81 },
    } as Record<string, { statements: number; branches: number; functions: number; lines: number }>;
    const result = evaluateCoverage({ current, baseline, floor });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.kind === "missing")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd "$(git rev-parse --show-toplevel)" && bun test scripts/__tests__/lcov.test.ts
```

Expected: FAIL — `Cannot find module '../lcov'`.

- [ ] **Step 3: Write the LCOV parser**

`scripts/lcov.ts`:

```typescript
export type LcovRecord = {
  sourceFile: string;
  linesFound: number;
  linesHit: number;
  branchesFound: number;
  branchesHit: number;
  fnFound: number;
  fnHit: number;
};

export type CoverageSummary = {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
};

export function parseLcov(input: string): LcovRecord[] {
  const records: LcovRecord[] = [];
  let cur: Partial<LcovRecord> | null = null;
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("SF:")) {
      cur = {
        sourceFile: line.slice(3),
        linesFound: 0,
        linesHit: 0,
        branchesFound: 0,
        branchesHit: 0,
        fnFound: 0,
        fnHit: 0,
      };
    } else if (line === "end_of_record" && cur) {
      records.push(cur as LcovRecord);
      cur = null;
    } else if (cur) {
      if (line.startsWith("LF:")) cur.linesFound = Number(line.slice(3));
      else if (line.startsWith("LH:")) cur.linesHit = Number(line.slice(3));
      else if (line.startsWith("BRF:")) cur.branchesFound = Number(line.slice(4));
      else if (line.startsWith("BRH:")) cur.branchesHit = Number(line.slice(4));
      else if (line.startsWith("FNF:")) cur.fnFound = Number(line.slice(4));
      else if (line.startsWith("FNH:")) cur.fnHit = Number(line.slice(4));
    }
  }
  return records;
}

function pct(hit: number, found: number): number {
  if (found === 0) return 0;
  return (hit / found) * 100;
}

export function summarise(records: LcovRecord[]): CoverageSummary {
  if (records.length === 0) {
    return { statements: 0, branches: 0, functions: 0, lines: 0 };
  }
  const lf = records.reduce((s, r) => s + r.linesFound, 0);
  const lh = records.reduce((s, r) => s + r.linesHit, 0);
  const brf = records.reduce((s, r) => s + r.branchesFound, 0);
  const brh = records.reduce((s, r) => s + r.branchesHit, 0);
  const fnf = records.reduce((s, r) => s + r.fnFound, 0);
  const fnh = records.reduce((s, r) => s + r.fnHit, 0);
  return {
    statements: pct(lh, lf), // LCOV does not separate statements; equate to lines
    branches: pct(brh, brf),
    functions: pct(fnh, fnf),
    lines: pct(lh, lf),
  };
}
```

- [ ] **Step 4: Write the evaluator**

`scripts/coverage-eval.ts`:

```typescript
import type { CoverageSummary } from "./lcov";

export type Violation =
  | { kind: "floor"; pkg: string; metric: keyof CoverageSummary; current: number; required: number }
  | {
      kind: "ratchet";
      pkg: string;
      metric: keyof CoverageSummary;
      current: number;
      baseline: number;
    }
  | { kind: "missing"; pkg: string };

export type EvaluateInput = {
  current: Record<string, CoverageSummary>;
  baseline: Record<string, CoverageSummary>;
  floor: CoverageSummary;
};

const RATCHET_BUDGET_PP = 1; // pp = percentage points

const METRICS: Array<keyof CoverageSummary> = ["statements", "branches", "functions", "lines"];

export function evaluateCoverage(input: EvaluateInput): { ok: boolean; violations: Violation[] } {
  const violations: Violation[] = [];

  for (const pkg of Object.keys(input.baseline)) {
    const cur = input.current[pkg];
    if (!cur) {
      violations.push({ kind: "missing", pkg });
      continue;
    }
    const base = input.baseline[pkg]!;
    for (const m of METRICS) {
      if (cur[m] < input.floor[m]) {
        violations.push({
          kind: "floor",
          pkg,
          metric: m,
          current: cur[m],
          required: input.floor[m],
        });
      }
      if (cur[m] + RATCHET_BUDGET_PP < base[m]) {
        violations.push({ kind: "ratchet", pkg, metric: m, current: cur[m], baseline: base[m] });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd "$(git rev-parse --show-toplevel)" && bun test scripts/__tests__/
```

Expected: PASS (both test files, all cases).

- [ ] **Step 6: Commit**

```bash
git add scripts/lcov.ts scripts/coverage-eval.ts scripts/__tests__/
git commit -m "feat(tooling): add LCOV parser + coverage evaluator with tests"
```

---

### Task 11: Baseline run + write `coverage-baseline.json`

**Files:**

- Create: `coverage-baseline.json`

- [ ] **Step 1: Run coverage on both apps**

Use subshells so cwd returns to the repo root after each run:

```bash
(cd apps/backend && bun scripts/run-tests.ts --coverage)
(cd apps/frontend && bun scripts/run-tests.ts --coverage)
```

Expected: both `apps/backend/coverage/lcov.info` and `apps/frontend/coverage/lcov.info` exist; you are back at the repo root.

- [ ] **Step 2: Write a small baseline-generator script and run it**

Create `scripts/write-baseline.ts`:

```typescript
/**
 * Reads LCOV from both apps and writes coverage-baseline.json and
 * coverage-floor.json. Floor is baseline minus 5 percentage points per
 * metric, clamped at 0. Re-run this script when you legitimately want to
 * raise the baseline (and the floor with it).
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseLcov, summarise, type CoverageSummary } from "./lcov";

const APPS = {
  "apps/backend": "apps/backend/coverage/lcov.info",
  "apps/frontend": "apps/frontend/coverage/lcov.info",
} as const;

const FLOOR_HEADROOM_PP = 5;

async function summaryFor(path: string): Promise<CoverageSummary> {
  return summarise(parseLcov(await readFile(path, "utf-8")));
}

function deriveFloor(baseline: Record<string, CoverageSummary>): CoverageSummary {
  const pkgs = Object.values(baseline);
  const min = (m: keyof CoverageSummary): number =>
    pkgs.reduce((acc, s) => Math.min(acc, s[m]), Infinity);
  return {
    statements: Math.max(0, Math.floor(min("statements") - FLOOR_HEADROOM_PP)),
    branches: Math.max(0, Math.floor(min("branches") - FLOOR_HEADROOM_PP)),
    functions: Math.max(0, Math.floor(min("functions") - FLOOR_HEADROOM_PP)),
    lines: Math.max(0, Math.floor(min("lines") - FLOOR_HEADROOM_PP)),
  };
}

const baseline: Record<string, CoverageSummary> = {};
for (const [pkg, path] of Object.entries(APPS)) {
  baseline[pkg] = await summaryFor(path);
}
const floor = deriveFloor(baseline);

await writeFile("coverage-baseline.json", JSON.stringify(baseline, null, 2) + "\n");
await writeFile("coverage-floor.json", JSON.stringify(floor, null, 2) + "\n");

console.log("baseline:", baseline);
console.log("floor:", floor);
```

Run it:

```bash
bun scripts/write-baseline.ts
```

Expected: both `coverage-baseline.json` and `coverage-floor.json` written; printed numbers look plausible (e.g. backend 70–90% across metrics).

- [ ] **Step 3: Ensure coverage artefacts are ignored**

Check root `.gitignore` — if it does not already match `apps/*/coverage/`, append:

```
# Coverage artefacts (LCOV produced by test runners)
apps/backend/coverage/
apps/frontend/coverage/
```

If a top-level `coverage/` rule already covers these (it does on most Node projects), skip this step. `coverage-baseline.json` and `coverage-floor.json` ARE committed.

- [ ] **Step 4: Commit**

```bash
git add scripts/write-baseline.ts coverage-baseline.json coverage-floor.json .gitignore
git commit -m "chore(tooling): capture initial coverage baseline + derived floor"
```

---

### Task 12: Coverage check entry script

**Files:**

- Create: `scripts/check-coverage.ts`
- Modify: `package.json` (root scripts)

- [ ] **Step 1: Write `scripts/check-coverage.ts`**

```typescript
/**
 * CI coverage gate: parses LCOV from each app, compares against
 * coverage-baseline.json and coverage-floor.json, and exits non-zero on
 * floor breach or ratchet violation (>1pp drop from baseline).
 *
 * To raise the floor, re-run `bun scripts/write-baseline.ts` (which also
 * recomputes the floor from the new baseline) and commit the regenerated
 * JSON files. The diff is auditable in PR review.
 */
import { readFile } from "node:fs/promises";
import { parseLcov, summarise } from "./lcov";
import { evaluateCoverage } from "./coverage-eval";
import type { CoverageSummary } from "./lcov";

const APPS: Record<string, string> = {
  "apps/backend": "apps/backend/coverage/lcov.info",
  "apps/frontend": "apps/frontend/coverage/lcov.info",
};

async function loadSummary(path: string): Promise<CoverageSummary> {
  const content = await readFile(path, "utf-8");
  return summarise(parseLcov(content));
}

async function main() {
  const baseline = JSON.parse(await readFile("coverage-baseline.json", "utf-8")) as Record<
    string,
    CoverageSummary
  >;
  const floor = JSON.parse(await readFile("coverage-floor.json", "utf-8")) as CoverageSummary;

  const current: Record<string, CoverageSummary> = {};
  for (const [pkg, path] of Object.entries(APPS)) {
    current[pkg] = await loadSummary(path);
  }

  const result = evaluateCoverage({ current, baseline, floor });

  console.log("\n── Coverage summary ──");
  for (const [pkg, s] of Object.entries(current)) {
    console.log(
      `${pkg}: statements ${s.statements.toFixed(1)}%, branches ${s.branches.toFixed(
        1
      )}%, functions ${s.functions.toFixed(1)}%, lines ${s.lines.toFixed(1)}%`
    );
  }

  if (!result.ok) {
    console.error("\n── Coverage violations ──");
    for (const v of result.violations) {
      if (v.kind === "floor") {
        console.error(
          `FLOOR: ${v.pkg} ${v.metric} = ${v.current.toFixed(1)}% (< floor ${v.required}%)`
        );
      } else if (v.kind === "ratchet") {
        console.error(
          `RATCHET: ${v.pkg} ${v.metric} = ${v.current.toFixed(1)}% (dropped > 1pp from baseline ${v.baseline.toFixed(
            1
          )}%)`
        );
      } else {
        console.error(`MISSING: ${v.pkg} coverage not produced`);
      }
    }
    process.exit(1);
  }

  console.log("\n✅ Coverage gate passed.");
}

await main();
```

- [ ] **Step 2: Add root script**

In root `package.json` `scripts` block, after `"test"`:

```json
"test:coverage": "cd apps/backend && bun scripts/run-tests.ts --coverage && cd ../frontend && bun scripts/run-tests.ts --coverage",
"check-coverage": "bun scripts/check-coverage.ts"
```

- [ ] **Step 3: Smoke test — should pass against the just-recorded baseline**

```bash
bun run check-coverage
```

Expected: "Coverage gate passed."

- [ ] **Step 4: Smoke test — break the ratchet on purpose**

Edit `coverage-baseline.json` to set `apps/backend.statements` to a value 5pp higher than the live coverage. Re-run:

```bash
bun run check-coverage
```

Expected: exit code 1; `RATCHET: apps/backend statements ...` violation printed. Revert the baseline.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-coverage.ts package.json
git commit -m "feat(tooling): add CI coverage gate with floor + ratchet"
```

---

### Task 13: Wire coverage gate into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add steps to the existing `test` job**

After the existing "Run tests" step in `.github/workflows/ci.yml`, add:

```yaml
- name: Run coverage
  run: bun run test:coverage

- name: Check coverage gate
  run: bun run check-coverage

- name: Upload coverage artefacts
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: coverage-lcov
    path: |
      apps/backend/coverage/lcov.info
      apps/frontend/coverage/lcov.info
    retention-days: 14
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gate PRs on coverage floor + ratchet"
```

---

### Task 14: Documentation

**Files:**

- Create: `docs/3. architecture/dev-tooling.md`
- Modify: `.claude/CLAUDE.md` (one-line cross-reference)

- [ ] **Step 1: Write `docs/3. architecture/dev-tooling.md`**

```markdown
# Dev Tooling

Three layered gates protect the codebase: husky hooks at write time, the test runner watch mode at iteration time, and a coverage gate in CI.

## Pre-commit and pre-push hooks

`.husky/pre-commit` runs `lint-staged` (eslint --fix --max-warnings=0) on staged TS/TSX files. Typical run time: <2s.

`.husky/pre-push` runs `bun run type-check` across the whole workspace. Typical run time: 10–30s.

### Bypass policy

Use `git commit --no-verify` or `git push --no-verify` only when:

- You are pushing an in-progress branch for review and the type errors are known;
- A hook is misbehaving and you have a workaround issue tracked.

CI runs lint, type-check, tests, and the coverage gate independently — a hook bypass does not bypass CI.

## Test runner watch mode

Both `apps/backend/scripts/run-tests.ts` and `apps/frontend/scripts/run-tests.ts` accept `--watch`:

\`\`\`bash
cd apps/backend && bun run test:watch [filter]
cd apps/frontend && bun run test:watch [filter]
\`\`\`

The watcher uses a static filename heuristic: when `foo.service.ts` changes, it re-runs `foo.service.test.ts`. If no neighbour test exists and a positional filter is set, it re-runs all tests matching the filter. Each re-run still spawns an isolated subprocess (the per-file mock-isolation guarantee is preserved).

**Platform note:** the watcher uses Node's `fs.watch({ recursive: true })`. On Linux and macOS this is solid. On Windows, very rapid bursts of saves can occasionally miss an event — if a save doesn't trigger a re-run, save again. CI does not run watch mode, so this affects local development only.

## Coverage gate

CI runs `bun run test:coverage` followed by `bun run check-coverage`. The gate fails when:

1. **Floor breach** — any metric (statements / branches / functions / lines) for any app drops below the fixed floor configured in `scripts/check-coverage.ts`.
2. **Ratchet violation** — any metric drops by more than 1 percentage point relative to `coverage-baseline.json`.

### Updating the baseline

When a refactor legitimately moves code (so a metric drops for one package without a real regression), update `coverage-baseline.json` in the same PR:

\`\`\`bash
bun run test:coverage

# Then regenerate the baseline from current coverage:

bun run --eval "..." # (same one-liner as Task 11 in the implementation plan)
\`\`\`

The diff is reviewable; reviewers should agree the move was intentional.

### Raising the floor

To raise the fixed floor, edit `FLOOR` in `scripts/check-coverage.ts`. The change is a single source-controlled diff.
```

- [ ] **Step 2: Add cross-reference to CLAUDE.md**

In `.claude/CLAUDE.md`, under the existing `## Code Quality` or `## Testing` section, add the line:

> Dev tooling reference: `docs/3. architecture/dev-tooling.md` (hooks, watch mode, coverage gate).

- [ ] **Step 3: Commit**

```bash
git add docs/3.\ architecture/dev-tooling.md .claude/CLAUDE.md
git commit -m "docs(tooling): document hooks, watch mode, and coverage gate"
```

---

## Testing

> Per-task TDD tests cover the pure logic. The configuration/integration parts are verified manually within each task. The end-to-end story below should be re-checked before opening the PR.

### Backend Tests

- [ ] `scripts/__tests__/run-tests-helpers.test.ts` — pure helpers (filter parse, source→test mapping)
- [ ] `scripts/__tests__/lcov.test.ts` — LCOV parser + summary aggregation
- [ ] `scripts/__tests__/coverage-eval.test.ts` — floor, ratchet, and missing-package detection

### Frontend Tests

- [ ] `apps/frontend/scripts/__tests__/run-tests-helpers.test.ts` — mirror of the backend helper tests, covering `.tsx` mappings

### Key Scenarios

- [ ] **Happy path — pre-commit blocks a lint error.** Stage a file with an unused import; `git commit` exits non-zero with the ESLint error message.
- [ ] **Happy path — pre-push blocks a type error.** Commit with `--no-verify`, then attempt `git push`; the push fails with the TypeScript error.
- [ ] **Happy path — watch mode re-runs on save.** Start `bun run test:watch foo`; touch a source file; the relevant test re-runs within 2s in a fresh subprocess.
- [ ] **Edge case — change with no matching test, no filter.** Watch mode logs "no matching test" and skips.
- [ ] **Coverage — passing PR.** `bun run test:coverage && bun run check-coverage` exits 0 against the baseline.
- [ ] **Coverage — floor breach.** Manually set the FLOOR above the current measurement; `check-coverage` exits 1.
- [ ] **Coverage — ratchet violation.** Manually inflate `coverage-baseline.json` by >1pp on any metric; `check-coverage` exits 1 with a `RATCHET:` line.

## Verification

> Run from the repo root after every task is complete. All must pass before opening the PR.

- [ ] `bun install` clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — green
- [ ] `bun run build` passes clean
- [ ] `cd apps/backend && bun scripts/run-tests.ts` passes (incl. new helper tests)
- [ ] `cd apps/frontend && bun scripts/run-tests.ts` passes (incl. new helper tests)
- [ ] `bun test scripts/__tests__/` passes (LCOV + evaluator tests)
- [ ] `bun run test:coverage && bun run check-coverage` exits 0
- [ ] `.husky/pre-commit` is executable and blocks on an introduced lint error (manual test, then revert)
- [ ] `.husky/pre-push` is executable and blocks on an introduced type error (manual test, then revert)
- [ ] `bun run test:watch run-tests-helpers` enters watch mode in both apps
- [ ] CI workflow (`gh pr create` or local re-run) shows the `Check coverage gate` step passing

## Post-conditions

- [ ] Pre-commit gate prevents pushing un-linted code by default; bypass requires explicit `--no-verify`.
- [ ] Pre-push gate prevents pushing un-type-checked code by default.
- [ ] Backend and frontend test runners both support `--watch` with isolated re-runs.
- [ ] Coverage cannot silently regress: any drop > 1pp or breach of fixed floor fails CI on PRs targeting `stage`.
- [ ] Foundations for Group 2 (dependency-automation) are stronger: a green PR now genuinely means lint + types + tests + coverage all hold, making Dependabot auto-merge a defensible follow-up after Group 3.
