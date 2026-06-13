import { describe, test, expect } from "bun:test";
import { checkResetAllowed } from "./reset-e2e-guard";

const allowedEnv = {
  NODE_ENV: "test",
  DB_RESET_ALLOWED: "true",
  DATABASE_URL: "postgresql://finplan:pw@localhost:5432/finplan_test",
};

describe("checkResetAllowed", () => {
  test("allows a local test database with the explicit flag", () => {
    expect(checkResetAllowed(allowedEnv)).toEqual({ ok: true });
  });

  test("allows the docker-compose service hostname and dev database", () => {
    expect(
      checkResetAllowed({
        ...allowedEnv,
        DATABASE_URL: "postgresql://finplan:pw@postgres:5432/finplan_dev",
      })
    ).toEqual({ ok: true });
  });

  test("allows suffixed test databases (e.g. finplan_test_d)", () => {
    expect(
      checkResetAllowed({
        ...allowedEnv,
        DATABASE_URL: "postgresql://finplan:pw@127.0.0.1:5432/finplan_test_d",
      })
    ).toEqual({ ok: true });
  });

  test("allows a query string after the database name", () => {
    expect(
      checkResetAllowed({
        ...allowedEnv,
        DATABASE_URL: "postgresql://finplan:pw@localhost:5432/finplan_dev?schema=public",
      })
    ).toEqual({ ok: true });
  });

  test("refuses when NODE_ENV is production", () => {
    const result = checkResetAllowed({ ...allowedEnv, NODE_ENV: "production" });
    expect(result.ok).toBe(false);
  });

  test("refuses without the explicit DB_RESET_ALLOWED flag", () => {
    const result = checkResetAllowed({ ...allowedEnv, DB_RESET_ALLOWED: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("DB_RESET_ALLOWED");
  });

  test("refuses DB_RESET_ALLOWED values other than the literal 'true'", () => {
    expect(checkResetAllowed({ ...allowedEnv, DB_RESET_ALLOWED: "1" }).ok).toBe(false);
    expect(checkResetAllowed({ ...allowedEnv, DB_RESET_ALLOWED: "yes" }).ok).toBe(false);
  });

  test("refuses a remote host even when the database name looks test-like", () => {
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "postgresql://finplan:pw@db.example.com:5432/finplan_test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("host");
  });

  test("refuses a production-named database even on localhost", () => {
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "postgresql://finplan:pw@localhost:5432/finplan",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("database");
  });

  test("refuses an unluckily named production database containing 'dev'", () => {
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "postgresql://finplan:pw@prod-db.internal:5432/finplan_devon_customers",
    });
    expect(result.ok).toBe(false);
  });

  test("refuses a substring match that fooled the old check (db name)", () => {
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "postgresql://finplan:pw@localhost:5432/finplan_devon",
    });
    expect(result.ok).toBe(false);
  });

  test("refuses an unparseable DATABASE_URL", () => {
    const result = checkResetAllowed({ ...allowedEnv, DATABASE_URL: "not a url" });
    expect(result.ok).toBe(false);
  });

  test("refuses a missing DATABASE_URL", () => {
    const result = checkResetAllowed({ ...allowedEnv, DATABASE_URL: undefined });
    expect(result.ok).toBe(false);
  });

  test("refuses a non-postgres protocol", () => {
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "mysql://finplan:pw@localhost:3306/finplan_test",
    });
    expect(result.ok).toBe(false);
  });

  // The postgres/postgresql schemes are non-special in the WHATWG URL spec, so
  // host parsing differs from http(s). These lock in that the parsed host — not
  // a substring — is what is checked, across the tricky non-special-scheme forms.

  test("accepts both postgres: and postgresql: schemes", () => {
    expect(
      checkResetAllowed({
        ...allowedEnv,
        DATABASE_URL: "postgres://finplan:pw@localhost:5432/finplan_test",
      })
    ).toEqual({ ok: true });
  });

  test("refuses a look-alike host that prefixes an allowed name", () => {
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "postgresql://finplan:pw@localhost.evil.com:5432/finplan_test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("host");
  });

  test("refuses a percent-encoded host that decodes to an allowed name", () => {
    // local%68ost would be "localhost" only if percent-decoded; the opaque-host
    // parser does not decode it, so the literal host must not match.
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "postgresql://finplan:pw@local%68ost:5432/finplan_test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("host");
  });

  test("the real connection host wins when userinfo embeds another host", () => {
    // WHATWG treats the final '@' as the userinfo boundary: the host here is
    // genuinely localhost, so allowing it is correct — not a bypass.
    expect(
      checkResetAllowed({
        ...allowedEnv,
        DATABASE_URL: "postgresql://user@evil.com@localhost:5432/finplan_test",
      })
    ).toEqual({ ok: true });
  });

  test("refuses when userinfo hides the real (remote) host", () => {
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "postgresql://localhost:pw@evil.com:5432/finplan_test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("host");
  });

  test("accepts a fully-expanded IPv6 loopback (normalised to [::1])", () => {
    expect(
      checkResetAllowed({
        ...allowedEnv,
        DATABASE_URL: "postgresql://finplan:pw@[0:0:0:0:0:0:0:1]:5432/finplan_test",
      })
    ).toEqual({ ok: true });
  });

  test("refuses obfuscated loopback IP literals (decimal / short form)", () => {
    // These resolve to 127.0.0.1 at the OS level but are intentionally rejected:
    // the allow-list is the canonical dotted-quad only. Fails safe.
    for (const host of ["2130706433", "127.1", "0x7f000001"]) {
      const result = checkResetAllowed({
        ...allowedEnv,
        DATABASE_URL: `postgresql://finplan:pw@${host}:5432/finplan_test`,
      });
      expect(result.ok).toBe(false);
    }
  });

  test("refuses an uppercase database name (allow-list is lower-case only)", () => {
    const result = checkResetAllowed({
      ...allowedEnv,
      DATABASE_URL: "postgresql://finplan:pw@localhost:5432/FINPLAN_TEST",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("database");
  });

  test("accepts an uppercase host (host comparison is case-insensitive)", () => {
    expect(
      checkResetAllowed({
        ...allowedEnv,
        DATABASE_URL: "postgresql://finplan:pw@LOCALHOST:5432/finplan_test",
      })
    ).toEqual({ ok: true });
  });
});
