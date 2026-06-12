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
});
