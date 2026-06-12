import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Dependency-audit gate for CI.
 *
 * Runs `bun audit --json` and fails when any advisory at or above the failure
 * threshold (high/critical) is present and not explicitly accepted in
 * `scripts/audit-allowlist.json`. Lower-severity advisories are reported but
 * do not fail the build.
 *
 * To accept an advisory, add an entry to the allow-list with the GHSA id, a
 * reason, and the date it was added — see
 * `docs/3. architecture/dependency-management.md` for the policy.
 */

export type Severity = "low" | "moderate" | "high" | "critical";

const FAIL_SEVERITIES: ReadonlySet<Severity> = new Set(["high", "critical"]);

export interface Advisory {
  id: number;
  url?: string;
  title?: string;
  severity: Severity;
}

/** `bun audit --json` output: package name → advisories affecting it. */
export type AuditReport = Record<string, Advisory[]>;

export interface AllowlistEntry {
  id: string; // GHSA id, e.g. "GHSA-xxxx-xxxx-xxxx"
  reason: string;
  added?: string;
}

export interface Finding {
  pkg: string;
  id: string;
  severity: Severity;
  title: string;
}

export interface EvaluateResult {
  ok: boolean;
  blocking: Finding[];
  allowed: Finding[];
  unusedAllowlistIds: string[];
  counts: Partial<Record<Severity, number>>;
}

/** Extract the stable GHSA id from an advisory (falls back to the numeric id). */
export function advisoryKey(adv: Advisory): string {
  const match = adv.url?.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
  return match ? match[0].toUpperCase() : String(adv.id);
}

export function evaluateAudit(report: AuditReport, allowlist: AllowlistEntry[]): EvaluateResult {
  const allowedIds = new Set(allowlist.map((e) => e.id.toUpperCase()));
  const seenAllowedIds = new Set<string>();
  const blocking: Finding[] = [];
  const allowed: Finding[] = [];
  const counts: Partial<Record<Severity, number>> = {};

  for (const [pkg, advisories] of Object.entries(report)) {
    for (const adv of advisories) {
      counts[adv.severity] = (counts[adv.severity] ?? 0) + 1;
      if (!FAIL_SEVERITIES.has(adv.severity)) continue;

      const finding: Finding = {
        pkg,
        id: advisoryKey(adv),
        severity: adv.severity,
        title: adv.title ?? "",
      };
      if (allowedIds.has(finding.id.toUpperCase())) {
        seenAllowedIds.add(finding.id.toUpperCase());
        allowed.push(finding);
      } else {
        blocking.push(finding);
      }
    }
  }

  const unusedAllowlistIds = [...allowedIds].filter((id) => !seenAllowedIds.has(id));
  return { ok: blocking.length === 0, blocking, allowed, unusedAllowlistIds, counts };
}

/** Parse `bun audit --json` stdout (tolerates a banner line before the JSON). */
export function parseAuditOutput(stdout: string): AuditReport {
  const start = stdout.indexOf("{");
  if (start === -1) return {};
  return JSON.parse(stdout.slice(start)) as AuditReport;
}

async function main(): Promise<void> {
  const allowlistPath = join(import.meta.dir, "audit-allowlist.json");
  const allowlist = (
    JSON.parse(readFileSync(allowlistPath, "utf8")) as { advisories: AllowlistEntry[] }
  ).advisories;

  // bun audit exits non-zero whenever any advisory exists, so the exit code is
  // not used — severity gating below decides pass/fail.
  const proc = Bun.spawnSync(["bun", "audit", "--json"], { stdout: "pipe", stderr: "pipe" });
  const stdout = proc.stdout.toString();
  let report: AuditReport;
  try {
    report = parseAuditOutput(stdout);
  } catch {
    console.error("check-audit: could not parse `bun audit --json` output:");
    console.error(stdout || proc.stderr.toString());
    process.exit(1);
  }

  const result = evaluateAudit(report, allowlist);

  const countSummary =
    Object.entries(result.counts)
      .map(([sev, n]) => `${n} ${sev}`)
      .join(", ") || "none";
  console.log(`check-audit: advisories found: ${countSummary}`);

  for (const f of result.allowed) {
    console.log(`  allowed   ${f.severity.padEnd(8)} ${f.id}  ${f.pkg} — ${f.title}`);
  }
  for (const id of result.unusedAllowlistIds) {
    console.log(`  stale     allow-list entry no longer matched: ${id} (consider removing)`);
  }

  if (!result.ok) {
    console.error("\ncheck-audit: FAIL — high/critical advisories not in the allow-list:");
    for (const f of result.blocking) {
      console.error(`  ${f.severity.padEnd(8)} ${f.id}  ${f.pkg} — ${f.title}`);
    }
    console.error(
      "\nFix by upgrading the affected dependency, or — if accepted after assessment — " +
        "add the GHSA id to scripts/audit-allowlist.json with a reason " +
        "(policy: docs/3. architecture/dependency-management.md)."
    );
    process.exit(1);
  }

  console.log("check-audit: OK — no unaccepted high/critical advisories");
}

if (import.meta.main) {
  await main();
}
