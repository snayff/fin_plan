import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../utils/jwt", () => ({
  verifyAccessToken: mock(() => {}),
}));

mock.module("../utils/tokenBlacklist", () => ({
  isTokenBlacklisted: mock(() => false),
}));

mock.module("../config/database", () => ({
  prisma: prismaMock,
}));

import { authMiddleware } from "./auth.middleware";
import { verifyAccessToken } from "../utils/jwt";
import { isTokenBlacklisted } from "../utils/tokenBlacklist";
import { AuthenticationError } from "../utils/errors";
import { buildUser, buildMember } from "../test/fixtures";

beforeEach(() => {
  resetPrismaMocks();
  (verifyAccessToken as any).mockClear();
});

function buildMockRequest(authHeader?: string) {
  return {
    headers: { authorization: authHeader },
  } as any;
}

const mockReply = {} as any;

describe("authMiddleware", () => {
  it("attaches user and householdId to request for valid token", async () => {
    const payload = { userId: "user-1", email: "test@test.com" };
    (verifyAccessToken as any).mockReturnValue(payload);
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({ id: "user-1", email: "test@test.com", activeHouseholdId: "household-1" } as any)
    );
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "owner" }));

    const request = buildMockRequest("Bearer valid-token");
    await authMiddleware(request, mockReply);

    expect(request.user).toEqual({
      userId: "user-1",
      email: "test@test.com",
      name: "Test User",
      role: "owner",
    });
    expect(request.householdId).toBe("household-1");
  });

  it("throws AuthenticationError when no authorization header", async () => {
    const request = buildMockRequest(undefined);
    await expect(authMiddleware(request, mockReply)).rejects.toThrow(AuthenticationError);
  });

  it("throws AuthenticationError for invalid format (no Bearer prefix)", async () => {
    const request = buildMockRequest("Basic some-token");
    await expect(authMiddleware(request, mockReply)).rejects.toThrow(
      "Invalid authorization format"
    );
  });

  it("throws AuthenticationError for missing token after Bearer", async () => {
    const request = buildMockRequest("Bearer ");
    await expect(authMiddleware(request, mockReply)).rejects.toThrow(AuthenticationError);
  });

  it("throws AuthenticationError for a revoked token (persisted denylist hit)", async () => {
    (verifyAccessToken as any).mockReturnValue({
      userId: "user-1",
      email: "test@test.com",
      jti: "revoked-jti",
    });
    (isTokenBlacklisted as any).mockResolvedValueOnce(true);

    const request = buildMockRequest("Bearer revoked-token");
    await expect(authMiddleware(request, mockReply)).rejects.toThrow("Token has been revoked");
  });

  it("throws AuthenticationError when user not found in DB", async () => {
    (verifyAccessToken as any).mockReturnValue({ userId: "ghost", email: "ghost@test.com" });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const request = buildMockRequest("Bearer valid-token");
    await expect(authMiddleware(request, mockReply)).rejects.toThrow("User not found");
  });

  it("throws AuthenticationError for expired token", async () => {
    (verifyAccessToken as any).mockImplementation(() => {
      throw new Error("Token expired");
    });

    const request = buildMockRequest("Bearer expired-token");
    await expect(authMiddleware(request, mockReply)).rejects.toThrow("Invalid or expired token");
  });

  it("throws AuthenticationError for invalid token", async () => {
    (verifyAccessToken as any).mockImplementation(() => {
      throw new Error("Invalid token");
    });

    const request = buildMockRequest("Bearer invalid-token");
    await expect(authMiddleware(request, mockReply)).rejects.toThrow("Invalid or expired token");
  });

  it("attaches name to request.user from DB", async () => {
    const payload = { userId: "user_1", email: "a@b.com" };
    (verifyAccessToken as any).mockReturnValue(payload);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "a@b.com",
      name: "Alice",
      activeHouseholdId: "hh_1",
    } as any);
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "member" }));

    const request = buildMockRequest("Bearer valid_token");
    await authMiddleware(request, mockReply);

    expect(request.user.name).toBe("Alice");
    expect(request.user.role).toBe("member");
  });

  it("throws AuthenticationError when user is no longer a member of active household", async () => {
    const payload = { userId: "user-1", email: "test@test.com" };
    (verifyAccessToken as any).mockReturnValue(payload);
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({ id: "user-1", email: "test@test.com", activeHouseholdId: "household-1" } as any)
    );
    // Membership no longer exists; fallback also returns null
    prismaMock.member.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prismaMock.user.update.mockResolvedValue({});

    const request = buildMockRequest("Bearer valid-token");
    await expect(authMiddleware(request, mockReply)).rejects.toThrow(
      "No longer a member of this household"
    );

    // Verify it cleared the stale activeHouseholdId
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { activeHouseholdId: null },
    });
  });
});
