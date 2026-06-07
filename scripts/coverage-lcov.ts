/**
 * True whole-codebase coverage from merged lcov.
 *
 * The per-file isolated test runners (apps/backend, apps/frontend) spawn one
 * `bun test` subprocess per test file, each emitting its own lcov report. A
 * naive "mean of each file's coverage %" systematically understates real
 * coverage (it weights a tiny file the same as a huge one, folds in test
 * infrastructure files, and — fatally — can never trend to 90% because every
 * new test file dilutes the average).
 *
 * Instead we MERGE every lcov record by source file and compute coverage over
 * the actual line/function counts of the whole codebase:
 *
 *   lines     = covered lines / total lines     (a line is covered if ANY run hit it)
 *   functions = hit functions  / total functions
 *
 * Line coverage is exact: bun emits per-line `DA:<line>,<hits>` records, so we
 * union hit counts across every run that loaded the file. Bun's lcov does not
 * emit per-function `FN`/`FNDA` detail (only aggregate `FNF`/`FNH` per file),
 * so for a file exercised by multiple test files we take the best single run's
 * hit count — a slight underestimate, never an overestimate.
 */

import { Glob } from "bun";
import { readFileSync } from "node:fs";

export interface FileCoverage {
  /** line number -> max hits observed across all merged runs */
  lineHits: Map<number, number>;
  /** functions found in the file (stable across runs) */
  fnFound: number;
  /** best (max) functions-hit count observed across runs */
  fnHit: number;
}

export interface CoverageSummary {
  functions: number;
  lines: number;
  /** raw counts, useful for reporting and tests */
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Parse lcov text into the accumulator, merging with any records already
 * present for the same source file. Call repeatedly to merge many reports.
 */
export function parseLcovInto(acc: Map<string, FileCoverage>, content: string): void {
  let current: FileCoverage | null = null;

  for (const raw of content.split("\n")) {
    const line = raw.trim();

    if (line.startsWith("SF:")) {
      const name = line.slice(3);
      current = acc.get(name) ?? { lineHits: new Map(), fnFound: 0, fnHit: 0 };
      acc.set(name, current);
    } else if (!current) {
      continue;
    } else if (line.startsWith("DA:")) {
      const [lineNo, hits] = line.slice(3).split(",").map(Number);
      if (Number.isNaN(lineNo) || Number.isNaN(hits)) continue;
      const prev = current.lineHits.get(lineNo) ?? 0;
      current.lineHits.set(lineNo, Math.max(prev, hits));
    } else if (line.startsWith("FNF:")) {
      current.fnFound = Math.max(current.fnFound, Number(line.slice(4)) || 0);
    } else if (line.startsWith("FNH:")) {
      current.fnHit = Math.max(current.fnHit, Number(line.slice(4)) || 0);
    } else if (line === "end_of_record") {
      current = null;
    }
  }
}

/** Compute aggregate coverage over every merged source file. */
export function summarize(acc: Map<string, FileCoverage>): CoverageSummary {
  let linesFound = 0;
  let linesHit = 0;
  let functionsFound = 0;
  let functionsHit = 0;

  for (const file of acc.values()) {
    for (const hits of file.lineHits.values()) {
      linesFound++;
      if (hits > 0) linesHit++;
    }
    functionsFound += file.fnFound;
    functionsHit += file.fnHit;
  }

  return {
    linesFound,
    linesHit,
    functionsFound,
    functionsHit,
    lines: linesFound === 0 ? 100 : round1((linesHit / linesFound) * 100),
    functions: functionsFound === 0 ? 100 : round1((functionsHit / functionsFound) * 100),
  };
}

/** Merge every lcov file matching `globPattern` into one accumulator. */
export function mergeGlob(globPattern: string): Map<string, FileCoverage> {
  const acc = new Map<string, FileCoverage>();
  const glob = new Glob(globPattern);
  for (const path of glob.scanSync(".")) {
    parseLcovInto(acc, readFileSync(path, "utf8"));
  }
  return acc;
}

/** Merge every lcov file matching `globPattern` and summarise it. */
export function coverageFromGlob(globPattern: string): CoverageSummary {
  return summarize(mergeGlob(globPattern));
}

export interface FileGap {
  file: string;
  linesFound: number;
  linesHit: number;
  linesUncovered: number;
  lines: number;
  functions: number;
}

/** Per-file coverage, sorted by most uncovered lines first (biggest wins). */
export function fileGaps(acc: Map<string, FileCoverage>): FileGap[] {
  const gaps: FileGap[] = [];
  for (const [file, cov] of acc) {
    let lf = 0;
    let lh = 0;
    for (const hits of cov.lineHits.values()) {
      lf++;
      if (hits > 0) lh++;
    }
    gaps.push({
      file,
      linesFound: lf,
      linesHit: lh,
      linesUncovered: lf - lh,
      lines: lf === 0 ? 100 : round1((lh / lf) * 100),
      functions: cov.fnFound === 0 ? 100 : round1((cov.fnHit / cov.fnFound) * 100),
    });
  }
  return gaps.sort((a, b) => b.linesUncovered - a.linesUncovered);
}
