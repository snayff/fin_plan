import { describe, it, expect, mock, beforeEach } from "bun:test";

// The mailer reads SMTP config from env. We drive its two branches (configured
// vs unconfigured) by mocking the config module per-test group.

describe("mailer (SMTP unset — dev no-op)", () => {
  beforeEach(() => {
    mock.module("../config/env", () => ({
      config: {
        SMTP_HOST: undefined,
        SMTP_PORT: 587,
        SMTP_USER: undefined,
        SMTP_PASS: undefined,
        FROM_EMAIL: "noreply@finplan.app",
        APP_URL: "http://localhost:3000",
      },
    }));
  });

  it("does not throw and logs instead of sending when SMTP is unconfigured", async () => {
    const { sendPasswordResetEmail } = await import("./mailer");
    const logs: unknown[][] = [];
    const logger = {
      info: (...args: unknown[]) => logs.push(args),
      warn: (...args: unknown[]) => logs.push(args),
      error: (...args: unknown[]) => logs.push(args),
    };

    await expect(
      sendPasswordResetEmail("user@test.com", "reset-token-123", logger)
    ).resolves.toBeUndefined();

    expect(logs.length).toBeGreaterThan(0);
  });

  it("builds a reset URL from APP_URL containing the token", async () => {
    const { buildPasswordResetUrl } = await import("./mailer");
    const url = buildPasswordResetUrl("abc.def");
    expect(url).toContain("http://localhost:3000");
    expect(url).toContain("abc.def");
  });

  it("URL-encodes the token in the reset link", async () => {
    const { buildPasswordResetUrl } = await import("./mailer");
    const url = buildPasswordResetUrl("a b/c");
    expect(url).not.toContain("a b/c");
    expect(url).toContain(encodeURIComponent("a b/c"));
  });
});
