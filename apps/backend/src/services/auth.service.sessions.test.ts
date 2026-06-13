import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { buildUser } from "../test/fixtures";

// Mock modules BEFORE imports
mock.module("../config/database", () => ({
  prisma: prismaMock,
}));

mock.module("../utils/password", () => ({
  hashPassword: mock(() => Promise.resolve("$2b$10$mockedHashValue")),
  verifyPassword: mock(() => {}),
  MAX_PASSWORD_LENGTH: 128,
  TIMING_EQUALIZATION_HASH: "$2b$12$mockedTimingEqualizationHash",
}));

mock.module("../utils/jwt", () => ({
  generateAccessToken: mock(() => "mock-access-token"),
  generateRefreshToken: mock(() => "mock-refresh-token"),
  hashToken: mock(() => "mock-refresh-token-hash"),
  generateTokenFamily: mock(() => "mock-family-id"),
  verifyRefreshToken: mock(() => {}),
}));

import { authService } from "./auth.service";
import { verifyRefreshToken } from "../utils/jwt";
import { Prisma } from "@prisma/client";

beforeEach(() => {
  resetPrismaMocks();
  (verifyRefreshToken as any).mockClear();
  prismaMock.refreshToken.create.mockResolvedValue({ id: "rt-1" } as any);
  prismaMock.refreshToken.update.mockResolvedValue({ id: "rt-1", isRevoked: true } as any);
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any);
  prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 } as any);
});

describe("authService.findUserByEmail", () => {
  it("lowercases the email and returns the full user record", async () => {
    const user = buildUser({ email: "person@example.com" });
    prismaMock.user.findUnique.mockResolvedValue(user);

    const result = await authService.findUserByEmail("PERSON@EXAMPLE.COM");

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: "person@example.com" },
    });
    expect(result).toBe(user as any);
  });

  it("returns null when no user matches", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await authService.findUserByEmail("nobody@example.com")).toBeNull();
  });
});

describe("authService.updateUserName", () => {
  it("updates the name and strips sensitive fields", async () => {
    prismaMock.user.update.mockResolvedValue(buildUser({ name: "New Name" }));

    const result = await authService.updateUserName("user-1", "New Name");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "New Name" },
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("twoFactorSecret");
  });

  it("throws NotFoundError when the user record is missing (P2025)", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "5",
    });
    prismaMock.user.update.mockRejectedValue(err);

    await expect(authService.updateUserName("ghost", "x")).rejects.toThrow("User not found");
  });

  it("rethrows unexpected prisma errors unchanged", async () => {
    const err = new Error("connection lost");
    prismaMock.user.update.mockRejectedValue(err);

    await expect(authService.updateUserName("user-1", "x")).rejects.toThrow("connection lost");
  });
});

describe("authService.refreshAccessToken — failure branches", () => {
  function setToken(overrides: Record<string, any> = {}) {
    const now = Date.now();
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      familyId: "mock-family-id",
      isRevoked: false,
      rememberMe: false,
      expiresAt: new Date(now + 60_000),
      sessionExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
      ...overrides,
    } as any);
  }

  it("throws when the token is not in the database", async () => {
    (verifyRefreshToken as any).mockReturnValue({ userId: "user-1" });
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);

    await expect(authService.refreshAccessToken("tok")).rejects.toThrow("Invalid refresh token");
  });

  it("revokes the whole family when a revoked token is replayed", async () => {
    (verifyRefreshToken as any).mockReturnValue({ userId: "user-1" });
    setToken({ isRevoked: true });

    await expect(authService.refreshAccessToken("tok")).rejects.toThrow("reuse detected");
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "mock-family-id" },
      data: { isRevoked: true },
    });
  });

  it("rejects an idle-expired token", async () => {
    (verifyRefreshToken as any).mockReturnValue({ userId: "user-1" });
    setToken({ expiresAt: new Date(Date.now() - 1_000) });

    await expect(authService.refreshAccessToken("tok")).rejects.toThrow("Refresh token expired");
  });

  it("throws when the owning user no longer exists", async () => {
    (verifyRefreshToken as any).mockReturnValue({ userId: "user-1" });
    setToken();
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(authService.refreshAccessToken("tok")).rejects.toThrow("User not found");
  });

  it("wraps non-auth errors as a generic invalid-token error", async () => {
    (verifyRefreshToken as any).mockImplementation(() => {
      throw new Error("malformed jwt");
    });

    await expect(authService.refreshAccessToken("tok")).rejects.toThrow(
      "Invalid or expired refresh token"
    );
  });
});

describe("authService session revocation helpers", () => {
  it("revokeAllUserTokens revokes every active token for the user", async () => {
    await authService.revokeAllUserTokens("user-1");
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isRevoked: false },
      data: { isRevoked: true },
    });
  });

  it("revokeTokenFamily scopes revocation to one family and user", async () => {
    await authService.revokeTokenFamily("fam-9", "user-1");
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "fam-9", userId: "user-1" },
      data: { isRevoked: true },
    });
  });

  it("revokeSession returns true when a session row was updated", async () => {
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 } as any);
    expect(await authService.revokeSession("fam-9", "user-1")).toBe(true);
  });

  it("revokeSession returns false when nothing matched", async () => {
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 } as any);
    expect(await authService.revokeSession("fam-9", "user-1")).toBe(false);
  });
});

describe("authService.getUserSessions", () => {
  it("returns the most recent token per family, deduplicated", async () => {
    prismaMock.refreshToken.findMany.mockResolvedValue([
      { id: "t1", familyId: "fam-a" },
      { id: "t2", familyId: "fam-a" },
      { id: "t3", familyId: "fam-b" },
    ] as any);

    const sessions = await authService.getUserSessions("user-1");

    expect(sessions.map((s) => s.id)).toEqual(["t1", "t3"]);
    expect(prismaMock.refreshToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", isRevoked: false }),
        orderBy: { createdAt: "desc" },
      })
    );
  });
});

describe("authService.cleanupExpiredTokens", () => {
  it("deletes idle- or absolutely-expired tokens and returns the count", async () => {
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 5 } as any);

    const removed = await authService.cleanupExpiredTokens();

    expect(removed).toBe(5);
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: expect.any(Date) } },
          { sessionExpiresAt: { lt: expect.any(Date) } },
        ],
      },
    });
  });
});
