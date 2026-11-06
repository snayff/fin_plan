import Fastify from "fastify";
import cookie from "@fastify/cookie";
import csrf from "@fastify/csrf-protection";

/**
 * Build a lightweight Fastify instance for route integration tests.
 * Registers the cookie plugin (needed for auth) and CSRF protection (the
 * auth refresh/logout routes reference fastify.csrfProtection at registration
 * time), skipping rate-limiting and helmet so tests run fast and
 * deterministically.
 */
export async function buildTestApp() {
  const app = Fastify({ logger: false });

  await app.register(cookie, {
    secret:
      process.env.COOKIE_SECRET ||
      "test-cookie-secret-that-is-at-least-32-characters-long-for-testing",
  });

  await app.register(csrf, { sessionPlugin: "@fastify/cookie" });

  return app;
}
