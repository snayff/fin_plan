import { describe, test, expect } from "bun:test";
import { advisoryKey, evaluateAudit, parseAuditOutput, type Advisory } from "./check-audit";

const adv = (overrides: Partial<Advisory>): Advisory => ({
  id: 1,
  url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  title: "Example advisory",
  severity: "high",
  ...overrides,
});

describe("advisoryKey", () => {
  test("extracts the GHSA id from the advisory URL", () => {
    expect(advisoryKey(adv({}))).toBe("GHSA-AAAA-BBBB-CCCC");
  });

  test("falls back to the numeric id when no URL", () => {
    expect(advisoryKey(adv({ url: undefined, id: 12345 }))).toBe("12345");
  });
});

describe("evaluateAudit", () => {
  test("passes on an empty report", () => {
    const result = evaluateAudit({}, []);
    expect(result.ok).toBe(true);
    expect(result.blocking).toEqual([]);
  });

  test("passes when only low/moderate advisories exist", () => {
    const result = evaluateAudit(
      { pkg: [adv({ severity: "moderate" }), adv({ severity: "low" })] },
      []
    );
    expect(result.ok).toBe(true);
    expect(result.counts.moderate).toBe(1);
    expect(result.counts.low).toBe(1);
  });

  test("fails on a high advisory not in the allow-list", () => {
    const result = evaluateAudit({ pkg: [adv({ severity: "high" })] }, []);
    expect(result.ok).toBe(false);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]?.id).toBe("GHSA-AAAA-BBBB-CCCC");
  });

  test("fails on a critical advisory not in the allow-list", () => {
    const result = evaluateAudit({ pkg: [adv({ severity: "critical" })] }, []);
    expect(result.ok).toBe(false);
  });

  test("passes when the high advisory is allow-listed (case-insensitive)", () => {
    const result = evaluateAudit({ pkg: [adv({ severity: "high" })] }, [
      { id: "ghsa-aaaa-bbbb-cccc", reason: "accepted" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.allowed).toHaveLength(1);
    expect(result.unusedAllowlistIds).toEqual([]);
  });

  test("reports stale allow-list entries that match nothing", () => {
    const result = evaluateAudit({}, [{ id: "GHSA-dddd-eeee-ffff", reason: "old" }]);
    expect(result.ok).toBe(true);
    expect(result.unusedAllowlistIds).toEqual(["GHSA-DDDD-EEEE-FFFF"]);
  });

  test("an allow-listed id does not excuse a different advisory", () => {
    const result = evaluateAudit(
      {
        pkg: [
          adv({ severity: "high" }),
          adv({
            severity: "critical",
            url: "https://github.com/advisories/GHSA-zzzz-yyyy-xxxx",
          }),
        ],
      },
      [{ id: "GHSA-aaaa-bbbb-cccc", reason: "accepted" }]
    );
    expect(result.ok).toBe(false);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]?.id).toBe("GHSA-ZZZZ-YYYY-XXXX");
  });
});

describe("parseAuditOutput", () => {
  test("tolerates a banner line before the JSON", () => {
    const out = parseAuditOutput('bun audit v1.x\n{"pkg":[]}');
    expect(out).toEqual({ pkg: [] });
  });

  test("returns an empty report when there is no JSON", () => {
    expect(parseAuditOutput("")).toEqual({});
  });
});
