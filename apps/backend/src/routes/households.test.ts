import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";
import { buildMember } from "../test/fixtures";

let mockCallerMember: { role: string } | null = { role: "owner" };
let mockTargetMember: { id: string } | null = { id: "member-target-1" };
const mockUpdatedMember = buildMember({
  id: "member-target-1",
  householdId: "household-1",
  userId: "user-2",
  role: "member",
  retirementYear: 2055,
});

mock.module("../services/member.service", () => ({
  memberService: {
    listMembers: mock(() => {}),
    createMember: mock(() => {}),
    updateMember: mock(() => {}),
    deleteMember: mock(() => {}),
    getItemCountsForMember: mock(() => {}),
  },
}));

mock.module("../services/household.service", () => ({
  householdService: {
    getUserHouseholds: mock(() => {}),
    createHousehold: mock(() => {}),
    switchHousehold: mock(() => {}),
    getHouseholdDetails: mock(() => {}),
    renameHousehold: mock(() => {}),
    inviteMember: mock(() => {}),
    removeMember: mock(() => {}),
    cancelInvite: mock(() => {}),
    leaveHousehold: mock(() => {}),
    delete: mock(() => {}),
  },
  assertOwnerOrAdmin: mock((role: string) => {
    if (role !== "owner" && role !== "admin") {
      throw Object.assign(new Error("Only household owners or admins can perform this action"), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }
  }),
  updateMemberRole: mock(() => Promise.resolve({})),
}));

mock.module("../config/database", () => ({
  prisma: {
    member: {
      findFirst: mock(async ({ where, select }: any) => {
        // caller lookup uses `select: { role: true }`; target lookup uses `select: { id: true }`
        if (select?.role) return mockCallerMember;
        if (select?.id) return mockTargetMember;
        return mockTargetMember;
      }),
      findUnique: mock(async () => mockUpdatedMember),
      update: mock(async () => mockUpdatedMember),
    },
  },
}));

mock.module("../services/audit.service.js", () => ({
  audited: mock(async ({ mutation }: any) => {
    // Run the mutation with a mock tx
    const mockTx = {
      member: {
        findFirst: mock(async () => mockTargetMember),
        findUnique: mock(async () => mockUpdatedMember),
        update: mock(async () => mockUpdatedMember),
      },
      auditLog: { create: mock(async () => ({})) },
    };
    return mutation(mockTx);
  }),
}));

mock.module("../lib/actor-ctx.js", () => ({
  actorCtx: mock(() => ({
    householdId: "household-1",
    actorId: "user-1",
    actorName: "Test User",
    ipAddress: "127.0.0.1",
    userAgent: "test",
  })),
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
  userOnlyAuth: mock(() => {}),
}));

import { householdService } from "../services/household.service";
import { memberService } from "../services/member.service";
import { authMiddleware, userOnlyAuth } from "../middleware/auth.middleware";
import { householdRoutes } from "./households";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(householdRoutes, { prefix: "/api" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockHousehold = {
  id: "household-1",
  name: "Test Household",
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

const mockMembership = {
  id: "membership-1",
  householdId: "household-1",
  userId: "user-1",
  role: "owner",
  joinedAt: new Date("2025-01-01T00:00:00Z"),
  household: {
    ...mockHousehold,
    _count: { members: 1 },
  },
};

const mockHouseholdDetails = {
  ...mockHousehold,
  members: [
    {
      id: "membership-1",
      householdId: "household-1",
      userId: "user-1",
      role: "owner",
      joinedAt: new Date("2025-01-01T00:00:00Z"),
      user: { id: "user-1", name: "Test User", email: "test@test.com" },
    },
  ],
  invites: [],
};

const authHeaders = { authorization: "Bearer valid-token" };

beforeEach(() => {
  // Reset all service mock call histories
  for (const method of Object.values(householdService) as any[]) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  for (const method of Object.values(memberService) as any[]) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }

  const mockMemberProfile = {
    id: "member-profile-1",
    householdId: "household-1",
    userId: null,
    name: "Profile One",
    role: "member",
    dateOfBirth: null,
    retirementYear: null,
    joinedAt: new Date("2025-01-01T00:00:00Z"),
  };
  (memberService.listMembers as any).mockResolvedValue([mockMemberProfile]);
  (memberService.createMember as any).mockResolvedValue(mockMemberProfile);
  (memberService.updateMember as any).mockResolvedValue({
    ...mockMemberProfile,
    name: "Updated Name",
  });
  (memberService.deleteMember as any).mockResolvedValue(undefined);

  // Re-apply default mock return values
  (householdService.getUserHouseholds as any).mockResolvedValue([mockMembership]);
  (householdService.createHousehold as any).mockResolvedValue(mockHousehold);
  (householdService.switchHousehold as any).mockResolvedValue(undefined);
  (householdService.getHouseholdDetails as any).mockResolvedValue(mockHouseholdDetails);
  (householdService.renameHousehold as any).mockResolvedValue({
    ...mockHousehold,
    name: "Renamed Household",
  });
  (householdService.inviteMember as any).mockResolvedValue({ token: "mock-invite-token" });
  (householdService.removeMember as any).mockResolvedValue(undefined);
  (householdService.cancelInvite as any).mockResolvedValue(undefined);
  (householdService.leaveHousehold as any).mockResolvedValue(undefined);
  (householdService.delete as any).mockResolvedValue(undefined);

  mockCallerMember = { role: "owner" };
  mockTargetMember = { id: "member-target-1" };

  // Re-apply auth middleware mocks
  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com", role: mockCallerMember?.role };
    request.householdId = "household-1";
  });
  (userOnlyAuth as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
  });
});

describe("GET /api/households", () => {
  it("returns 200 with list of households", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/households",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.households).toBeDefined();
    expect(body.households).toHaveLength(1);
    expect(body.households[0].householdId).toBe("household-1");
  });

  it("calls service with userId from auth", async () => {
    (householdService.getUserHouseholds as any).mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/api/households",
      headers: authHeaders,
    });

    expect(householdService.getUserHouseholds).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/households",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("POST /api/households", () => {
  it("returns 201 with created household", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households",
      headers: authHeaders,
      payload: { name: "Test Household" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.household).toBeDefined();
    expect(body.household.id).toBe("household-1");
  });

  it("calls service with userId and household name", async () => {
    await app.inject({
      method: "POST",
      url: "/api/households",
      headers: authHeaders,
      payload: { name: "My New Household" },
    });

    expect(householdService.createHousehold).toHaveBeenCalledWith("user-1", "My New Household");
  });

  it("returns 400 when name is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households",
      headers: authHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name is empty string", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households",
      headers: authHeaders,
      payload: { name: "" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households",
      payload: { name: "Test Household" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("GET /api/households/:id", () => {
  it("returns 200 with household details", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/households/household-1",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.household).toBeDefined();
    expect(body.household.id).toBe("household-1");
    expect(body.household.members).toBeDefined();
  });

  it("calls service with householdId and userId", async () => {
    await app.inject({
      method: "GET",
      url: "/api/households/household-abc",
      headers: authHeaders,
    });

    expect(householdService.getHouseholdDetails).toHaveBeenCalledWith("household-abc", "user-1");
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/households/household-1",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("PATCH /api/households/:id", () => {
  it("returns 200 with renamed household", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/households/household-1",
      headers: authHeaders,
      payload: { name: "Renamed Household" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.household).toBeDefined();
    expect(body.household.name).toBe("Renamed Household");
  });

  it("calls service with householdId, userId, and new name", async () => {
    (householdService.renameHousehold as any).mockResolvedValue(mockHousehold);

    await app.inject({
      method: "PATCH",
      url: "/api/households/household-1",
      headers: authHeaders,
      payload: { name: "Updated Name" },
    });

    expect(householdService.renameHousehold).toHaveBeenCalledWith(
      "household-1",
      "user-1",
      "Updated Name",
      expect.objectContaining({ actorId: "user-1" })
    );
  });

  it("returns 400 when name is missing", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/households/household-1",
      headers: authHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/households/household-1",
      payload: { name: "Updated Name" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("POST /api/households/:id/switch", () => {
  it("returns 200 with success", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/switch",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it("calls service with userId and householdId", async () => {
    await app.inject({
      method: "POST",
      url: "/api/households/household-xyz/switch",
      headers: authHeaders,
    });

    expect(householdService.switchHousehold).toHaveBeenCalledWith("user-1", "household-xyz");
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/switch",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("POST /api/households/:id/invite", () => {
  it("returns 201 with a token when email and name are provided", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/invite",
      headers: authHeaders,
      payload: { email: "invitee@example.com", name: "Invited Person" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(typeof body.token).toBe("string");
  });

  it("returns 400 when email is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/invite",
      headers: authHeaders,
      payload: { name: "Invited Person" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/invite",
      headers: authHeaders,
      payload: { email: "invitee@example.com" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("calls service with householdId, userId, email, and name", async () => {
    await app.inject({
      method: "POST",
      url: "/api/households/household-1/invite",
      headers: authHeaders,
      payload: { email: "invitee@example.com", name: "Invited Person" },
    });

    expect(householdService.inviteMember).toHaveBeenCalledWith(
      "household-1",
      "user-1",
      "invitee@example.com",
      "Invited Person",
      "member",
      expect.any(Object)
    );
  });

  it("returns invitedEmail when invite is email-bound", async () => {
    (householdService.inviteMember as any).mockResolvedValue({
      token: "mock-invite-token",
      email: "invitee@example.com",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/invite",
      headers: authHeaders,
      payload: { email: "invitee@example.com", name: "Invited Person" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.invitedEmail).toBe("invitee@example.com");
  });

  it("returns 400 for invalid email payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/invite",
      headers: authHeaders,
      payload: { email: "bad-email", name: "Invited Person" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/invite",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("DELETE /api/households/:id/members/:memberId", () => {
  it("returns 200 with success", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/members/member-user-2",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it("calls service with householdId, userId, and memberId", async () => {
    await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/members/user-to-remove",
      headers: authHeaders,
    });

    expect(householdService.removeMember).toHaveBeenCalledWith(
      "household-1",
      "user-1",
      "user-to-remove",
      expect.any(Object)
    );
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/members/member-user-2",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("DELETE /api/households/:id/invites/:inviteId", () => {
  it("returns 200 with success", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/invites/invite-1",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it("calls service with householdId, userId, and inviteId", async () => {
    await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/invites/invite-abc",
      headers: authHeaders,
    });

    expect(householdService.cancelInvite).toHaveBeenCalledWith(
      "household-1",
      "user-1",
      "invite-abc",
      expect.objectContaining({ actorId: "user-1" })
    );
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/invites/invite-1",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("DELETE /api/households/:id/leave", () => {
  it("returns 200 with success", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/leave",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it("calls service with householdId and userId", async () => {
    await app.inject({
      method: "DELETE",
      url: "/api/households/household-xyz/leave",
      headers: authHeaders,
    });

    expect(householdService.leaveHousehold).toHaveBeenCalledWith(
      "household-xyz",
      "user-1",
      expect.objectContaining({ actorId: "user-1" })
    );
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/leave",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("DELETE /api/households/:id (delete household)", () => {
  it("returns 204 on owner success", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(204);
    expect(householdService.delete).toHaveBeenCalledWith(
      "household-1",
      expect.objectContaining({ actorId: "user-1", householdId: "household-1" })
    );
  });

  it("scopes deletion via the active householdId from middleware (not the URL param)", async () => {
    // Even if a different :id is supplied, the service is called with req.householdId.
    // This locks in the security convention: never trust URL params for data scoping.
    await app.inject({
      method: "DELETE",
      url: "/api/households/some-other-id",
      headers: authHeaders,
    });

    expect(householdService.delete).toHaveBeenCalledWith(
      "household-1",
      expect.objectContaining({ actorId: "user-1" })
    );
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1",
    });

    expect(response.statusCode).toBe(401);
    expect(householdService.delete).not.toHaveBeenCalled();
  });

  it("returns 403 when service throws AuthorizationError", async () => {
    (householdService.delete as any).mockRejectedValueOnce(
      Object.assign(new Error("Only household owners can perform this action"), {
        statusCode: 403,
        code: "FORBIDDEN",
      })
    );

    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("GET /api/households/:id/member-profiles", () => {
  it("returns 200 with list of members", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/households/household-1/member-profiles",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.members).toBeDefined();
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members).toHaveLength(1);
    expect(memberService.listMembers).toHaveBeenCalledWith("household-1");
  });

  it("returns 404 when requesting another household's member profiles", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/households/other-household/member-profiles",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(404);
    expect(memberService.listMembers).not.toHaveBeenCalled();
  });

  it("scopes the service call to the active household, never the URL param", async () => {
    await app.inject({
      method: "GET",
      url: "/api/households/household-1/member-profiles",
      headers: authHeaders,
    });

    expect(memberService.listMembers).toHaveBeenCalledWith("household-1");
    expect(memberService.listMembers).toHaveBeenCalledTimes(1);
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/households/household-1/member-profiles",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("POST /api/households/:id/member-profiles", () => {
  it("returns 201 with the created member", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/member-profiles",
      headers: authHeaders,
      payload: { name: "New Member" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.member).toBeDefined();
    expect(body.member.id).toBe("member-profile-1");
  });

  it("calls service with householdId, callerUserId, and parsed data", async () => {
    await app.inject({
      method: "POST",
      url: "/api/households/household-1/member-profiles",
      headers: authHeaders,
      payload: { name: "New Member", retirementYear: 2055 },
    });

    expect(memberService.createMember).toHaveBeenCalledWith(
      "household-1",
      "user-1",
      expect.objectContaining({ name: "New Member", retirementYear: 2055 }),
      expect.objectContaining({ actorId: "user-1" })
    );
  });

  it("returns 400 when name is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/member-profiles",
      headers: authHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 403 when caller is not the owner", async () => {
    (memberService.createMember as any).mockImplementation(async () => {
      throw Object.assign(new Error("Only household owners can manage members"), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/member-profiles",
      headers: authHeaders,
      payload: { name: "New Member" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns 404 when targeting another household", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/other-household/member-profiles",
      headers: authHeaders,
      payload: { name: "New Member" },
    });

    expect(response.statusCode).toBe(404);
    expect(memberService.createMember).not.toHaveBeenCalled();
  });

  it("returns 404 (not 400) when targeting another household with an invalid body", async () => {
    // The active-household guard must run before body validation so a caller
    // cannot distinguish "household exists" from "household does not exist"
    // via a validation-error differential.
    const response = await app.inject({
      method: "POST",
      url: "/api/households/other-household/member-profiles",
      headers: authHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    expect(memberService.createMember).not.toHaveBeenCalled();
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/households/household-1/member-profiles",
      payload: { name: "New Member" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("PATCH /api/households/:id/member-profiles/:memberId", () => {
  it("returns 200 with the updated member", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/households/household-1/member-profiles/member-profile-1",
      headers: authHeaders,
      payload: { name: "Updated Name" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.member).toBeDefined();
    expect(body.member.name).toBe("Updated Name");
  });

  it("calls service with all parameters", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/households/household-1/member-profiles/member-profile-1",
      headers: authHeaders,
      payload: { name: "Updated Name", retirementYear: 2060 },
    });

    expect(memberService.updateMember).toHaveBeenCalledWith(
      "household-1",
      "user-1",
      "member-profile-1",
      expect.objectContaining({ name: "Updated Name", retirementYear: 2060 }),
      expect.objectContaining({ actorId: "user-1" })
    );
  });

  it("returns 404 when targeting another household", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/households/other-household/member-profiles/member-profile-1",
      headers: authHeaders,
      payload: { name: "Updated Name" },
    });

    expect(response.statusCode).toBe(404);
    expect(memberService.updateMember).not.toHaveBeenCalled();
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/households/household-1/member-profiles/member-profile-1",
      payload: { name: "Updated Name" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("DELETE /api/households/:id/member-profiles/:memberId", () => {
  it("returns 200 with success", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/member-profiles/member-profile-1",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it("calls service without reassignment when body is empty", async () => {
    await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/member-profiles/member-profile-1",
      headers: authHeaders,
    });

    expect(memberService.deleteMember).toHaveBeenCalledWith(
      "household-1",
      "user-1",
      "member-profile-1",
      expect.objectContaining({ actorId: "user-1" }),
      undefined
    );
  });

  it("calls service with reassignment target when provided", async () => {
    await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/member-profiles/member-profile-1",
      headers: authHeaders,
      payload: { reassignToMemberId: "member-profile-2" },
    });

    expect(memberService.deleteMember).toHaveBeenCalledWith(
      "household-1",
      "user-1",
      "member-profile-1",
      expect.objectContaining({ actorId: "user-1" }),
      "member-profile-2"
    );
  });

  it("returns 404 when targeting another household", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/other-household/member-profiles/member-profile-1",
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(404);
    expect(memberService.deleteMember).not.toHaveBeenCalled();
  });

  it("returns 401 without auth", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/households/household-1/member-profiles/member-profile-1",
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("export/import route co-location", () => {
  // The household URL-space is defined in one module: registering householdRoutes
  // alone must expose the export/import household routes (sub-registered), with the
  // emitted paths unchanged.
  it.each([
    ["GET", "/api/households/export"],
    ["POST", "/api/households/import"],
    ["POST", "/api/households/import/restore/:backupId"],
    ["POST", "/api/households/validate-import"],
  ])("registers %s %s under the household module", (method, url) => {
    expect(app.hasRoute({ method: method as any, url })).toBe(true);
  });
});
