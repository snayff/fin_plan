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
