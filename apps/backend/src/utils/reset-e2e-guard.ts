// Safety gate for reset-e2e-db.ts. ALL checks must pass before anything is truncated:
//   1. NODE_ENV must not be "production".
//   2. DB_RESET_ALLOWED=true must be set explicitly — destructive commands must never run
//      as a side effect of an inherited environment. docker-compose.dev.yml sets it for
//      the dev/E2E container; run manually elsewhere with
//      `DB_RESET_ALLOWED=true bun run db:reset-e2e`.
//   3. DATABASE_URL is parsed (not substring-matched) and both the host and the database
//      name must match an explicit allow-list of local/test patterns.

export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "postgres", // docker-compose.dev.yml service hostname
  "host.docker.internal",
]);

// Database name must be a finplan dev/test/e2e database, e.g. finplan_dev,
// finplan_test, finplan_test_d, finplan_e2e.
export const ALLOWED_DB_NAME = /^finplan_(dev|test|e2e)(_[a-z0-9]+)?$/;

export type ResetCheck = { ok: true } | { ok: false; reason: string };

export function checkResetAllowed(env: {
  NODE_ENV?: string;
  DB_RESET_ALLOWED?: string;
  DATABASE_URL?: string;
}): ResetCheck {
  if (env.NODE_ENV === "production") {
    return { ok: false, reason: "NODE_ENV=production" };
  }

  if (env.DB_RESET_ALLOWED !== "true") {
    return {
      ok: false,
      reason:
        "DB_RESET_ALLOWED is not set. This command truncates every user-data table; " +
        "set DB_RESET_ALLOWED=true explicitly to confirm the target database is disposable.",
    };
  }

  const dbUrl = env.DATABASE_URL ?? "";
  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a parseable URL" };
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    return { ok: false, reason: `DATABASE_URL has unexpected protocol (${parsed.protocol})` };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return {
      ok: false,
      reason: `DATABASE_URL host "${host}" is not in the local/test host allow-list`,
    };
  }

  const dbName = parsed.pathname.replace(/^\//, "").split("/")[0]?.split("?")[0] ?? "";
  if (!ALLOWED_DB_NAME.test(dbName)) {
    return {
      ok: false,
      reason: `DATABASE_URL database "${dbName}" does not match the dev/test name allow-list`,
    };
  }

  return { ok: true };
}
