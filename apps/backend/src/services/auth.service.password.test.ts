import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { buildUser } from "../test/fixtures";

mock.module("../config/database", () => ({
  prisma: prismaMock,
}));

mock.module("../utils/password", () => ({
  hashPassword: mock(() => Promise.resolve("$2b$12$newHashedValue")),
  verifyPassword: mock(() => Promise.resolve(true)),
  MAX_PASSWORD_LENGTH: 128,
  TIMING_EQUALIZATION_HASH: "$2b$12$mockedTimingEqualizationHash",
}));

const generatePasswordResetToken = mock(() => "signed-reset-token");
const verifyPasswordResetToken = mock(() => ({ userId: "user-1" }) as { userId: string } | null);
const peekPasswordResetTokenUserId = mock(() => "user-1" as string | null);
mock.module("../utils/password-reset-token", () => ({
  generatePasswordResetToken,
  verifyPasswordResetToken,
  peekPasswordResetTokenUserId,
  PASSWORD_RESET_TOKEN_TTL_MS: 3_600_000,
}));

import { authService } from "./auth.service";
import { hashPassword, verifyPassword } from "../utils/password";
import { AuthenticationError, ValidationError } from "../utils/errors";

beforeEach(() => {
  resetPrismaMocks();
  (hashPassword as any).mockClear();
  (verifyPassword as any).mockClear();
  (hashPassword as any).mockResolvedValue("$2b$12$newHashedValue");
  (verifyPassword as any).mockResolvedValue(true);
  generatePasswordResetToken.mockClear();
  verifyPasswordResetToken.mockClear();
  peekPasswordResetTokenUserId.mockClear();
  verifyPasswordResetToken.mockReturnValue({ userId: "user-1" });
  peekPasswordResetTokenUserId.mockReturnValue("user-1");
  prismaMock.user.update.mockResolvedValue(buildUser({ id: "user-1" }) as any);
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 } as any);
});

describe("authService.changePassword", () => {
  it("verifies current password, sets new hash, and revokes all sessions", async () => {
    const user = buildUser({ id: "user-1", passwordHash: "$2b$12$oldHash" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);

    await authService.changePassword("user-1", "current-pass", "brand-new-password");

    expect(verifyPassword).toHaveBeenCalledWith("current-pass", "$2b$12$oldHash");
    expect(hashPassword).toHaveBeenCalledWith("brand-new-password");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ passwordHash: "$2b$12$newHashedValue" }),
      })
    );
    // All refresh tokens revoked (logout other sessions)
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1" }),
        data: { isRevoked: true },
      })
    );
  });

  it("throws AuthenticationError when the current password is wrong", async () => {
    const user = buildUser({ id: "user-1", passwordHash: "$2b$12$oldHash" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);
    (verifyPassword as any).mockResolvedValue(false);

    await expect(
      authService.changePassword("user-1", "wrong-pass", "brand-new-password")
    ).rejects.toBeInstanceOf(AuthenticationError);

    expect(hashPassword).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("throws when the user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      authService.changePassword("ghost", "current-pass", "brand-new-password")
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe("authService.createPasswordResetToken", () => {
  it("returns a signed token bound to the user when the account exists", async () => {
    const user = buildUser({ id: "user-1", email: "user@test.com", passwordHash: "$2b$12$h" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);

    const result = await authService.createPasswordResetToken("USER@test.com");

    expect(result).toEqual({ token: "signed-reset-token", email: "user@test.com" });
    expect(generatePasswordResetToken).toHaveBeenCalledWith("user-1", "$2b$12$h");
  });

  it("returns null (no enumeration) when the account does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await authService.createPasswordResetToken("nobody@test.com");

    expect(result).toBeNull();
    expect(generatePasswordResetToken).not.toHaveBeenCalled();
  });
});

describe("authService.resetPassword", () => {
  it("validates the token, sets the new password, and revokes sessions", async () => {
    const user = buildUser({ id: "user-1", passwordHash: "$2b$12$oldHash" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);

    const userId = await authService.resetPassword("valid-token", "brand-new-password");

    expect(userId).toBe("user-1");
    expect(verifyPasswordResetToken).toHaveBeenCalled();
    expect(hashPassword).toHaveBeenCalledWith("brand-new-password");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ passwordHash: "$2b$12$newHashedValue" }),
      })
    );
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1" }),
        data: { isRevoked: true },
      })
    );
  });

  it("throws ValidationError for an invalid/expired token (no password mutation)", async () => {
    const user = buildUser({ id: "user-1", passwordHash: "$2b$12$oldHash" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);
    // Signature check against the live hash fails (expired/tampered/superseded).
    verifyPasswordResetToken.mockReturnValue(null);

    await expect(
      authService.resetPassword("bad-token", "brand-new-password")
    ).rejects.toBeInstanceOf(ValidationError);

    expect(hashPassword).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the token is structurally undecodable", async () => {
    // No userId can even be peeked from the token.
    peekPasswordResetTokenUserId.mockReturnValue(null);

    await expect(authService.resetPassword("garbage", "brand-new-password")).rejects.toBeInstanceOf(
      ValidationError
    );

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the token references a missing user", async () => {
    // Token decodes to a userId, but the user row is gone.
    peekPasswordResetTokenUserId.mockReturnValue("user-1");
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      authService.resetPassword("valid-token", "brand-new-password")
    ).rejects.toBeInstanceOf(ValidationError);

    expect(hashPassword).not.toHaveBeenCalled();
  });
});
