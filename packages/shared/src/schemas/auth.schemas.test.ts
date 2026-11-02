import { describe, it, expect } from "bun:test";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  NEW_PASSWORD_MIN,
} from "./auth.schemas";

describe("changePasswordSchema", () => {
  it("accepts a valid current + new password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "a-strong-new-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a new password shorter than the minimum", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a new password over 128 chars", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "a".repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty current password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "a-strong-new-password",
    });
    expect(result.success).toBe(false);
  });

  it("enforces the shared minimum length constant", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "a".repeat(NEW_PASSWORD_MIN - 1),
    });
    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "user@test.com" }).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = forgotPasswordSchema.safeParse({ email: "  user@test.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@test.com");
  });

  it("rejects a malformed email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("rejects an over-long email", () => {
    expect(forgotPasswordSchema.safeParse({ email: `${"a".repeat(250)}@test.com` }).success).toBe(
      false
    );
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a valid token + new password", () => {
    const result = resetPasswordSchema.safeParse({
      token: "some-signed-token",
      newPassword: "a-strong-new-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty token", () => {
    const result = resetPasswordSchema.safeParse({
      token: "",
      newPassword: "a-strong-new-password",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a new password shorter than the minimum", () => {
    const result = resetPasswordSchema.safeParse({
      token: "some-signed-token",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
  });
});
