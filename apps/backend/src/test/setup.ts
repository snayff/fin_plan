// Set environment variables BEFORE any module imports.
// This is critical because config/env.ts validates env at import time.
process.env.NODE_ENV = "test";
process.env.PORT = "3001";
// TEST_DATABASE_URL allows pointing the suite at an alternate test database
// (e.g. parallel local runs). The explicit name guard prevents accidentally
// running destructive test setup against a dev database via plain DATABASE_URL.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://finplan:finplan_dev_password@localhost:5432/finplan_test";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long-for-testing";
process.env.JWT_REFRESH_SECRET =
  "test-jwt-refresh-secret-that-is-at-least-32-characters-long-for-testing";
process.env.JWT_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.COOKIE_SECRET = "test-cookie-secret-that-is-at-least-32-characters-long-for-testing";
process.env.CORS_ORIGIN = "http://localhost:3000";
