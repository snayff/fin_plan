import { describe, test, expect } from "bun:test";

// Boots config/env.ts in a fresh subprocess with a crafted environment. The
// module validates process.env at import time, so the only faithful way to
// assert "production refuses this secret" is to actually import it with that
// env and observe whether the process exits non-zero.

const ENV_PATH = new URL("./env.ts", import.meta.url).pathname;
const BACKEND_DIR = new URL("../..", import.meta.url).pathname;

const strong = (label: string): string =>
  `${label}-strong-random-value-at-least-32-characters-long-xyz`;

const PROD_BASELINE: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://finplan:pw@localhost:5432/finplan_prod",
  JWT_SECRET: strong("jwt"),
  JWT_REFRESH_SECRET: strong("jwt-refresh"),
  COOKIE_SECRET: strong("cookie"),
  CSRF_SECRET: strong("csrf"),
};

function boot(overrides: Record<string, string | undefined>): {
  code: number | null;
  stderr: string;
} {
  // Start from a clean env (only PATH/HOME so bun itself can run) — never
  // inherit the test harness's NODE_ENV=test or its baseline secrets.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    ...PROD_BASELINE,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  const proc = Bun.spawnSync(["bun", "-e", `await import(${JSON.stringify(ENV_PATH)})`], {
    env,
    cwd: BACKEND_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, stderr: proc.stderr.toString() };
}

describe("env boot validation (production)", () => {
  test("boots with all-strong production secrets", () => {
    expect(boot({}).code).toBe(0);
  });

  test("refuses a weak COOKIE_SECRET in production", () => {
    const result = boot({ COOKIE_SECRET: "change-me-please-still-32-chars-long-xx" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("COOKIE_SECRET");
  });

  test("refuses a missing COOKIE_SECRET in production", () => {
    const result = boot({ COOKIE_SECRET: undefined });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("COOKIE_SECRET");
  });

  test("refuses a too-short COOKIE_SECRET in production", () => {
    const result = boot({ COOKIE_SECRET: "short" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("COOKIE_SECRET");
  });

  test("refuses a weak CSRF_SECRET in production", () => {
    const result = boot({ CSRF_SECRET: "test-value-still-32-characters-long-xxxx" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("CSRF_SECRET");
  });

  test("refuses a missing CSRF_SECRET in production", () => {
    const result = boot({ CSRF_SECRET: undefined });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("CSRF_SECRET");
  });

  test("refuses a too-short CSRF_SECRET in production", () => {
    const result = boot({ CSRF_SECRET: "short" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("CSRF_SECRET");
  });

  test("still refuses a weak JWT_SECRET in production (regression)", () => {
    const result = boot({ JWT_SECRET: "secret-value-still-32-characters-long-xx" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("JWT_SECRET");
  });
});

describe("env boot validation (non-production)", () => {
  test("permits a missing CSRF_SECRET outside production", () => {
    const result = boot({ NODE_ENV: "development", CSRF_SECRET: undefined });
    expect(result.code).toBe(0);
  });

  test("permits weak-looking secrets outside production", () => {
    // 'test' is a weak token, but the strength gate only applies in production.
    const result = boot({
      NODE_ENV: "development",
      COOKIE_SECRET: "test-cookie-secret-at-least-32-characters-long",
    });
    expect(result.code).toBe(0);
  });
});
