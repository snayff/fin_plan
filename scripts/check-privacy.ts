import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Privacy gate for CI (and pre-commit).
 *
 * The repo is PUBLIC. This scanner fails the build when real personal data
 * leaks into tracked files - the failure mode that put the maintainer's name,
 * gmail address, and production domain into committed docs, HTML mockups, and
 * test fixtures.
 *
 * Two layers:
 *
 *  1. Personal-email detection (no secrets needed). Any address on a known
 *     consumer email provider (gmail, outlook, icloud, proton, ...) is flagged
 *     - that is the class of leak that actually happens. Synthetic test domains
 *     (test.com, example.com, the app's own noreply) are left alone. The
 *     provider list and per-address exceptions live in privacy-allowlist.json.
 *
 *  2. Optional private denylist for values that can't be detected generically
 *     (a real personal name, a production domain). Patterns are loaded from the
 *     env var PRIVACY_DENYLIST (newline- or comma-separated) and/or the
 *     gitignored file scripts/privacy-denylist.local.txt - so the literal
 *     strings never enter the repo. See privacy-denylist.local.example.txt.
 *
 * Usage:
 *   bun scripts/check-privacy.ts            # scan all tracked files (CI)
 *   bun scripts/check-privacy.ts <files...> # scan only these (pre-commit)
 *
 * Policy + placeholder convention: docs/3. architecture/issue-workflow.md.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const NUL = String.fromCharCode(0);

// File extensions never worth scanning (binary / generated / lockfiles).
const SKIP_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "svg",
  "avif",
  "bmp",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "pdf",
  "zip",
  "gz",
  "tar",
  "mp4",
  "mov",
  "webm",
  "mp3",
  "wav",
  "lock",
  "map",
  "snap",
]);

export interface PrivacyConfig {
  /** Consumer email providers - an address on any of these is flagged. */
  blockedEmailDomains: string[];
  /** Specific whole addresses allowed even on a blocked provider. */
  allowedEmails: string[];
  /** Glob patterns of files to skip entirely. */
  ignoreGlobs: string[];
}

export interface Finding {
  file: string;
  line: number;
  match: string;
  rule: "email" | "denylist";
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .split("**")
    .join("__DSTAR__")
    .split("*")
    .join("[^/]*")
    .split("__DSTAR__")
    .join(".*");
  return new RegExp(`^${pattern}$`);
}

export function isIgnored(file: string, ignoreGlobs: string[]): boolean {
  return ignoreGlobs.some((g) => globToRegex(g).test(file));
}

/** True when an email is a real personal address (blocked provider, not excepted). */
export function isPersonalEmail(email: string, config: PrivacyConfig): boolean {
  const lower = email.toLowerCase();
  if (config.allowedEmails.map((e) => e.toLowerCase()).includes(lower)) return false;
  const domain = lower.slice(lower.lastIndexOf("@") + 1);
  return config.blockedEmailDomains.some(
    (d) => domain === d.toLowerCase() || domain.endsWith("." + d.toLowerCase())
  );
}

/** Scan one file's text for findings. */
export function scanContent(
  file: string,
  content: string,
  config: PrivacyConfig,
  denylist: string[]
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((text, i) => {
    for (const m of text.matchAll(EMAIL_RE)) {
      if (isPersonalEmail(m[0], config)) {
        findings.push({ file, line: i + 1, match: m[0], rule: "email" });
      }
    }
    const lowerText = text.toLowerCase();
    for (const term of denylist) {
      if (term && lowerText.includes(term.toLowerCase())) {
        findings.push({ file, line: i + 1, match: term, rule: "denylist" });
      }
    }
  });
  return findings;
}

function loadDenylist(): string[] {
  const terms: string[] = [];
  const fromEnv = process.env.PRIVACY_DENYLIST;
  if (fromEnv) terms.push(...fromEnv.split(/[\n,]/));
  const filePath = join(import.meta.dir, "privacy-denylist.local.txt");
  if (existsSync(filePath)) {
    terms.push(...readFileSync(filePath, "utf8").split(/\r?\n/));
  }
  return terms.map((t) => t.trim()).filter((t) => t && !t.startsWith("#"));
}

function listTrackedFiles(args: string[]): string[] {
  if (args.length > 0) return args;
  const proc = Bun.spawnSync(["git", "ls-files"], { stdout: "pipe", stderr: "pipe" });
  if (!proc.success) {
    console.error("check-privacy: `git ls-files` failed:");
    console.error(proc.stderr.toString());
    process.exit(1);
  }
  return proc.stdout.toString().split("\n").filter(Boolean);
}

function scannable(file: string): boolean {
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return !SKIP_EXT.has(ext);
}

async function main(): Promise<void> {
  const configPath = join(import.meta.dir, "privacy-allowlist.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as PrivacyConfig;
  const denylist = loadDenylist();

  // Paths may be absolute (lint-staged) or repo-relative (git ls-files).
  const cwd = process.cwd();
  const raw = listTrackedFiles(process.argv.slice(2));
  const files = raw
    .map((f) => (f.startsWith(cwd) ? f.slice(cwd.length + 1).replace(/\\/g, "/") : f))
    .filter(scannable)
    .filter((f) => !isIgnored(f, config.ignoreGlobs));

  const findings: Finding[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable / deleted
    }
    if (content.includes(NUL)) continue; // binary file
    findings.push(...scanContent(file, content, config, denylist));
  }

  if (denylist.length === 0) {
    console.log(
      "check-privacy: note - no private denylist configured (real name / domain not checked). " +
        "See scripts/privacy-denylist.local.example.txt."
    );
  }

  if (findings.length > 0) {
    console.error(`\ncheck-privacy: FAIL - ${findings.length} possible personal-data leak(s):\n`);
    for (const f of findings) {
      const what =
        f.rule === "email" ? `personal email "${f.match}"` : `denylisted term "${f.match}"`;
      console.error(`  ${f.file}:${f.line}  ${what}`);
    }
    console.error(
      "\nUse placeholders instead (Jane Smith / jane@example.com / test@test.com). " +
        "If an address is a legitimate published one, add it to allowedEmails in " +
        "scripts/privacy-allowlist.json. Policy: docs/3. architecture/issue-workflow.md."
    );
    process.exit(1);
  }

  console.log(`check-privacy: OK - scanned ${files.length} files, no personal data found`);
}

if (import.meta.main) {
  await main();
}
