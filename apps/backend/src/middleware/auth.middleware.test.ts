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
      buildUser({
        id: "user-1",
        email: "test@test.com",
        activeHouseholdId: "household-1",
        memberProfiles: [buildMember({ householdId: "household-1", role: "owner" })],
      } as any)
    );

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

  it("runs only two DB queries on the happy path (blacklist + single user fetch)", async () => {
    (verifyAccessToken as any).mockReturnValue({
      userId: "user-1",
      email: "test@test.com",
      jti: "jti-1",
    });
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({
        id: "user-1",
        email: "test@test.com",
        activeHouseholdId: "household-1",
        memberProfiles: [buildMember({ householdId: "household-1", role: "owner" })],
      } as any)
    );

    const request = buildMockRequest("Bearer valid-token");
    await authMiddleware(request, mockReply);

    // The membership check is now satisfied from the included memberProfiles —
    // no separate member.findFirst / findMany round-trip.
    expect(isTokenBlacklisted).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.member.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.member.findMany).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("includes the user's member profiles in the single user fetch", async () => {
    (verifyAccessToken as any).mockReturnValue({ userId: "user-1", email: "test@test.com" });
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({
        id: "user-1",
        email: "test@test.com",
        activeHouseholdId: "household-1",
        memberProfiles: [buildMember({ householdId: "household-1", role: "owner" })],
      } as any)
    );

    const request = buildMockRequest("Bearer valid-token");
    await authMiddleware(request, mockReply);

    const call = prismaMock.user.findUnique.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "user-1" });
    expect(call.include ?? call.select).toBeDefined();
    // Membership data must be part of this single query, not a follow-up.
    const shape = JSON.stringify(call);
    expect(shape).toContain("memberProfiles");
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
      memberProfiles: [buildMember({ householdId: "hh_1", role: "member" })],
    } as any);

    const request = buildMockRequest("Bearer valid_token");
    await authMiddleware(request, mockReply);

    expect(request.user.name).toBe("Alice");
    expect(request.user.role).toBe("member");
  });

  it("throws AuthenticationError when user is no longer a member of active household", async () => {
    const payload = { userId: "user-1", email: "test@test.com" };
    (verifyAccessToken as any).mockReturnValue(payload);
    // User has no membership for the active household and no other memberships,
    // so the stale activeHouseholdId is cleared to null.
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({
        id: "user-1",
        email: "test@test.com",
        activeHouseholdId: "household-1",
        memberProfiles: [],
      } as any)
    );
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

  it("reassigns activeHouseholdId to the earliest-joined household when removed from active", async () => {
    (verifyAccessToken as any).mockReturnValue({ userId: "user-1", email: "test@test.com" });
    // Removed from household-1, but still a member of household-2 (and household-3).
    // Fallback picks the earliest joinedAt among remaining memberships.
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({
        id: "user-1",
        email: "test@test.com",
        activeHouseholdId: "household-1",
        memberProfiles: [
          buildMember({
            householdId: "household-3",
            role: "member",
            joinedAt: new Date("2025-06-01T00:00:00Z"),
          }),
          buildMember({
            householdId: "household-2",
            role: "member",
            joinedAt: new Date("2025-02-01T00:00:00Z"),
          }),
        ],
      } as any)
    );
    prismaMock.user.update.mockResolvedValue({});

    const request = buildMockRequest("Bearer valid-token");
    await expect(authMiddleware(request, mockReply)).rejects.toThrow(
      "No longer a member of this household"
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { activeHouseholdId: "household-2" },
    });
    // Fallback is computed in-memory from the single fetch — no extra query.
    expect(prismaMock.member.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.member.findMany).not.toHaveBeenCalled();
  });
});
