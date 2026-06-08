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
