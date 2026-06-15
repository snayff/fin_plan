import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { buildUser, buildHousehold, buildHouseholdInvite, buildMember } from "../test/fixtures";

mock.module("../config/database", () => ({
  prisma: prismaMock,
}));

// JWT utils used by acceptInvite
mock.module("../utils/jwt", () => ({
  generateAccessToken: mock(() => "access-token"),
  generateRefreshToken: mock(() => "refresh-token"),
  hashToken: mock(() => "hashed-token"),
  generateTokenFamily: mock(() => "family-id"),
}));

// Password utils used by acceptInvite
mock.module("../utils/password", () => ({
  hashPassword: mock(() => Promise.resolve("hashed-password")),
  MAX_PASSWORD_LENGTH: 128,
  TIMING_EQUALIZATION_HASH: "$2b$12$mockedTimingEqualizationHash",
}));

import { householdService, assertOwnerOrAdmin, updateMemberRole } from "./household.service";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "../utils/errors";

beforeEach(() => {
  resetPrismaMocks();
});

// ─── createHousehold ────────────────────────────────────────────────────────

describe("householdService.createHousehold", () => {
  it("creates a household with the given name and owner membership", async () => {
    const user = buildUser({ name: "Test User" });
    const household = buildHousehold({ name: "My Household" });
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.household.create.mockResolvedValue(household);
    prismaMock.member.create.mockResolvedValue(
      buildMember({ householdId: household.id, userId: user.id, role: "owner" })
    );

    const result = await householdService.createHousehold(user.id, "My Household");

    expect(prismaMock.household.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "My Household" }),
      })
    );
    expect(prismaMock.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: household.id,
          userId: user.id,
          name: "Test User",
          role: "owner",
        }),
      })
    );
    expect(result.id).toBe(household.id);
    expect(result.name).toBe("My Household");
  });
});

describe("householdService.createHousehold — subcategory seeding", () => {
  it("seeds default subcategories after creating household", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "user-1", name: "Test User" }));
    prismaMock.household.create.mockResolvedValue({
      id: "hh-new",
      name: "New Household",
    } as any);
    prismaMock.member.create.mockResolvedValue(
      buildMember({ householdId: "hh-new", userId: "user-1", role: "owner" })
    );
    prismaMock.householdSettings.create.mockResolvedValue({} as any);
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 16 });

    await householdService.createHousehold("user-1", "New Household");

    expect(prismaMock.subcategory.createMany).toHaveBeenCalledTimes(1);
    const call = prismaMock.subcategory.createMany.mock.calls[0]![0] as any;
    const data = call.data as any[];
    expect(data).toHaveLength(16); // 3 income + 7 committed + 6 discretionary
    expect(data.every((r: any) => r.householdId === "hh-new")).toBe(true);
  });

  // #135: the whole household build is wrapped in one transaction. If a later
  // write fails the transaction rejects, so the household never persists.
  it("propagates the error (no partial household) when a later write fails", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "user-1", name: "Test User" }));
    prismaMock.household.create.mockResolvedValue({ id: "hh-new", name: "New Household" } as any);
    prismaMock.member.create.mockResolvedValue(
      buildMember({ householdId: "hh-new", userId: "user-1", role: "owner" })
    );
    // settings.create fails midway → the surrounding $transaction must reject.
    prismaMock.householdSettings.create.mockRejectedValue(new Error("settings insert failed"));

    await expect(householdService.createHousehold("user-1", "New Household")).rejects.toThrow(
      "settings insert failed"
    );
    // The seeding and active-household write never run.
    expect(prismaMock.subcategory.createMany).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("maps a P2002 member-name collision to a ConflictError", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "user-1", name: "Test User" }));
    prismaMock.household.create.mockResolvedValue({ id: "hh-new", name: "New Household" } as any);
    prismaMock.member.create.mockRejectedValue({ code: "P2002" });

    await expect(householdService.createHousehold("user-1", "New Household")).rejects.toThrow(
      ConflictError
    );
  });
});

// ─── getUserHouseholds ──────────────────────────────────────────────────────

describe("householdService.getUserHouseholds", () => {
  it("returns household memberships for the user", async () => {
    const user = buildUser();
    const household = buildHousehold();
    const member = buildMember({
      userId: user.id,
      householdId: household.id,
      household: { ...household, _count: { memberProfiles: 1 } },
    });
    prismaMock.member.findMany.mockResolvedValue([member]);

    const result = await householdService.getUserHouseholds(user.id);

    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: expect.any(String) },
        include: {
          household: expect.objectContaining({
            include: expect.objectContaining({
              _count: expect.any(Object),
            }),
          }),
        },
        orderBy: { joinedAt: "asc" },
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].householdId).toBe(household.id);
  });

  it("returns empty array when user has no memberships", async () => {
    prismaMock.member.findMany.mockResolvedValue([]);
    const result = await householdService.getUserHouseholds("user-no-households");
    expect(result).toEqual([]);
  });
});

// ─── switchHousehold ─────────────────────────────────────────────────────────

describe("householdService.switchHousehold", () => {
  it("updates the user's activeHouseholdId when user is a member", async () => {
    const user = buildUser();
    const household = buildHousehold();
    const member = buildMember({ householdId: household.id, userId: user.id });
    prismaMock.member.findFirst.mockResolvedValue(member);
    prismaMock.user.update.mockResolvedValue({ ...user, activeHouseholdId: household.id });

    await householdService.switchHousehold(user.id, household.id);

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: user.id },
        data: { activeHouseholdId: household.id },
      })
    );
  });

  it("throws AuthorizationError when user is not a member", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null);
    await expect(householdService.switchHousehold("user-1", "household-1")).rejects.toThrow(
      AuthorizationError
    );
  });
});

// ─── getHouseholdDetails ─────────────────────────────────────────────────────

describe("householdService.getHouseholdDetails", () => {
  it("returns household with members and active invites when requester is a member", async () => {
    const user = buildUser();
    const household = buildHousehold();
    const member = buildMember({ householdId: household.id, userId: user.id });
    const householdWithDetails = {
      ...household,
      memberProfiles: [{ ...member, user: { id: user.id, name: user.name, email: user.email } }],
      invites: [],
    };
    prismaMock.member.findFirst.mockResolvedValue(member);
    prismaMock.household.findUnique.mockResolvedValue(householdWithDetails);

    const result = await householdService.getHouseholdDetails(household.id, user.id);

    expect(prismaMock.household.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: household.id } })
    );
    expect(result).not.toBeNull();
    expect((result as any)!.memberProfiles).toHaveLength(1);
  });

  it("throws AuthorizationError when requester is not a member", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null);
    await expect(
      householdService.getHouseholdDetails("household-1", "outsider-user")
    ).rejects.toThrow(AuthorizationError);
  });
});

// ─── renameHousehold ─────────────────────────────────────────────────────────

describe("householdService.renameHousehold", () => {
  it("updates the household name when caller is the owner", async () => {
    const ctx = { householdId: "household-1", actorId: "user-1", actorName: "Test" };
    const owner = buildUser();
    const household = buildHousehold();
    const ownerMember = buildMember({
      householdId: household.id,
      userId: owner.id,
      role: "owner",
    });
    const updated = { ...household, name: "New Name" };
    prismaMock.member.findFirst.mockResolvedValue(ownerMember);
    prismaMock.household.findUnique.mockResolvedValue(household);
    prismaMock.household.update.mockResolvedValue(updated);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await householdService.renameHousehold(household.id, owner.id, "New Name", ctx);

    expect(prismaMock.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: household.id },
        data: { name: "New Name" },
      })
    );
    expect(result.name).toBe("New Name");
  });

  it("throws AuthorizationError when caller is not an owner", async () => {
    const ctx = { householdId: "household-1", actorId: "member-user", actorName: "Member" };
    const nonOwnerMember = buildMember({ role: "member" });
    prismaMock.member.findFirst.mockResolvedValue(nonOwnerMember);
    await expect(
      householdService.renameHousehold("household-1", "member-user", "New Name", ctx)
    ).rejects.toThrow(AuthorizationError);
  });

  it("throws AuthorizationError when caller is not a member", async () => {
    const ctx = { householdId: "household-1", actorId: "outsider", actorName: "Outsider" };
    prismaMock.member.findFirst.mockResolvedValue(null);
    await expect(
      householdService.renameHousehold("household-1", "outsider", "New Name", ctx)
    ).rejects.toThrow(AuthorizationError);
  });
});

// ─── removeMember ────────────────────────────────────────────────────────────

describe("householdService.removeMember", () => {
  it("deletes the target member when caller is the owner", async () => {
    const ctx = { householdId: "household-1", actorId: "owner-id", actorName: "Owner" };
    const owner = buildUser();
    const ownerMember = buildMember({
      householdId: "household-1",
      userId: owner.id,
      role: "owner",
    });
    const targetMember = buildMember({
      id: "member-1",
      householdId: "household-1",
      userId: "target-user",
      role: "member",
    });
    prismaMock.member.findFirst.mockResolvedValue(ownerMember);
    prismaMock.member.findUnique.mockResolvedValue(targetMember);
    prismaMock.member.delete.mockResolvedValue(targetMember);
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "target-user" }));
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.removeMember("household-1", owner.id, "member-1", ctx);

    expect(prismaMock.member.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "member-1" },
      })
    );
  });

  it("throws ValidationError when owner tries to remove themselves", async () => {
    const ctx = { householdId: "household-1", actorId: "owner-id", actorName: "Owner" };
    const owner = buildUser();
    const ownerMember = buildMember({
      householdId: "household-1",
      userId: owner.id,
      role: "owner",
    });
    const selfTarget = buildMember({
      id: "member-self",
      householdId: "household-1",
      userId: owner.id,
      role: "owner",
    });
    prismaMock.member.findFirst.mockResolvedValue(ownerMember);
    prismaMock.member.findUnique.mockResolvedValue(selfTarget);

    await expect(
      householdService.removeMember("household-1", owner.id, "member-self", ctx)
    ).rejects.toThrow(ValidationError);
  });

  it("throws AuthorizationError when caller is not the owner", async () => {
    const ctx = { householdId: "household-1", actorId: "member-user", actorName: "Member" };
    const nonOwnerMember = buildMember({ role: "member" });
    prismaMock.member.findFirst.mockResolvedValue(nonOwnerMember);

    await expect(
      householdService.removeMember("household-1", "member-user", "member-1", ctx)
    ).rejects.toThrow(AuthorizationError);
  });

  it("throws AuthorizationError when caller is not a member", async () => {
    const ctx = { householdId: "household-1", actorId: "outsider", actorName: "Outsider" };
    prismaMock.member.findFirst.mockResolvedValue(null);

    await expect(
      householdService.removeMember("household-1", "outsider", "member-1", ctx)
    ).rejects.toThrow(AuthorizationError);
  });
});

// ─── capability matrix: admins may perform household-level changes ────────────

describe("household capability matrix — admin authority", () => {
  it("allows an admin to rename the household", async () => {
    const ctx = { householdId: "household-1", actorId: "admin-user", actorName: "Admin" };
    const adminMember = buildMember({
      householdId: "household-1",
      userId: "admin-user",
      role: "admin",
    });
    const household = buildHousehold({ id: "household-1" });
    prismaMock.member.findFirst.mockResolvedValue(adminMember);
    prismaMock.household.findUnique.mockResolvedValue(household);
    prismaMock.household.update.mockResolvedValue({ ...household, name: "New Name" });
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await householdService.renameHousehold(
      "household-1",
      "admin-user",
      "New Name",
      ctx
    );

    expect(result.name).toBe("New Name");
  });

  it("allows an admin to remove a member", async () => {
    const ctx = { householdId: "household-1", actorId: "admin-user", actorName: "Admin" };
    const adminMember = buildMember({
      householdId: "household-1",
      userId: "admin-user",
      role: "admin",
    });
    const target = buildMember({
      id: "member-1",
      householdId: "household-1",
      userId: "target-user",
      role: "member",
    });
    prismaMock.member.findFirst.mockResolvedValue(adminMember);
    prismaMock.member.findUnique.mockResolvedValue(target);
    prismaMock.member.delete.mockResolvedValue(target);
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "target-user" }));
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.removeMember("household-1", "admin-user", "member-1", ctx);

    expect(prismaMock.member.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "member-1" } })
    );
  });

  it("rejects removing the household owner", async () => {
    const ctx = { householdId: "household-1", actorId: "admin-user", actorName: "Admin" };
    const adminMember = buildMember({
      householdId: "household-1",
      userId: "admin-user",
      role: "admin",
    });
    const ownerTarget = buildMember({
      id: "owner-member",
      householdId: "household-1",
      userId: "owner-user",
      role: "owner",
    });
    prismaMock.member.findFirst.mockResolvedValue(adminMember);
    prismaMock.member.findUnique.mockResolvedValue(ownerTarget);

    await expect(
      householdService.removeMember("household-1", "admin-user", "owner-member", ctx)
    ).rejects.toThrow(AuthorizationError);
    expect(prismaMock.member.delete).not.toHaveBeenCalled();
  });

  it("rejects an admin removing another admin", async () => {
    const ctx = { householdId: "household-1", actorId: "admin-user", actorName: "Admin" };
    const adminMember = buildMember({
      householdId: "household-1",
      userId: "admin-user",
      role: "admin",
    });
    const otherAdmin = buildMember({
      id: "other-admin-member",
      householdId: "household-1",
      userId: "other-admin",
      role: "admin",
    });
    prismaMock.member.findFirst.mockResolvedValue(adminMember);
    prismaMock.member.findUnique.mockResolvedValue(otherAdmin);

    await expect(
      householdService.removeMember("household-1", "admin-user", "other-admin-member", ctx)
    ).rejects.toThrow(AuthorizationError);
    expect(prismaMock.member.delete).not.toHaveBeenCalled();
  });

  it("allows an admin to cancel a pending invite", async () => {
    const ctx = { householdId: "household-1", actorId: "admin-user", actorName: "Admin" };
    const adminMember = buildMember({
      householdId: "household-1",
      userId: "admin-user",
      role: "admin",
    });
    const invite = buildHouseholdInvite({ id: "invite-1", householdId: "household-1" });
    prismaMock.member.findFirst.mockResolvedValue(adminMember);
    prismaMock.householdInvite.findUnique.mockResolvedValue(invite);
    prismaMock.householdInvite.delete.mockResolvedValue(invite);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.cancelInvite("household-1", "admin-user", "invite-1", ctx);

    expect(prismaMock.householdInvite.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "invite-1" } })
    );
  });

  it("still forbids a plain member from renaming the household", async () => {
    const ctx = { householdId: "household-1", actorId: "member-user", actorName: "Member" };
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "member" }));

    await expect(
      householdService.renameHousehold("household-1", "member-user", "New Name", ctx)
    ).rejects.toThrow(AuthorizationError);
  });
});

// ─── validateInviteToken ──────────────────────────────────────────────────────

describe("householdService.validateInviteToken", () => {
  it("returns invite when token is valid", async () => {
    const invite = buildHouseholdInvite({
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      household: { id: "household-1", name: "Test Household" },
    });
    prismaMock.householdInvite.findUnique.mockResolvedValue(invite);

    const result = await householdService.validateInviteToken("valid-raw-token");

    expect(prismaMock.householdInvite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: expect.any(String) },
      })
    );
    expect(result.id).toBe(invite.id);
  });

  it("throws NotFoundError when invite does not exist", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(null);
    await expect(householdService.validateInviteToken("bad-token")).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError when invite has already been used", async () => {
    const usedInvite = buildHouseholdInvite({
      usedAt: new Date("2025-01-01T06:00:00Z"),
      expiresAt: new Date(Date.now() + 60_000),
      household: { id: "household-1", name: "Test Household" },
    });
    prismaMock.householdInvite.findUnique.mockResolvedValue(usedInvite);
    await expect(householdService.validateInviteToken("used-token")).rejects.toThrow(
      ValidationError
    );
  });

  it("throws ValidationError when invite has expired", async () => {
    const expiredInvite = buildHouseholdInvite({
      usedAt: null,
      expiresAt: new Date("2020-01-01T00:00:00Z"),
      household: { id: "household-1", name: "Test Household" },
    });
    prismaMock.householdInvite.findUnique.mockResolvedValue(expiredInvite);
    await expect(householdService.validateInviteToken("expired-token")).rejects.toThrow(
      ValidationError
    );
  });
});

describe("householdService.inviteMember with audited()", () => {
  const actor = {
    householdId: "household-1",
    actorId: "owner-user-id",
    actorName: "Owner",
  };

  it("writes an INVITE_MEMBER AuditLog entry when ctx is provided", async () => {
    const owner = buildUser({ id: "owner-user-id" });
    const household = buildHousehold({ id: "household-1" });
    const ownerMember = buildMember({
      householdId: household.id,
      userId: owner.id,
      role: "owner",
    });

    prismaMock.member.findFirst.mockResolvedValueOnce(ownerMember).mockResolvedValueOnce(null);
    prismaMock.household.findUnique.mockResolvedValue(household);
    prismaMock.householdInvite.findFirst.mockResolvedValue(null);
    prismaMock.member.create.mockResolvedValue(buildMember({ id: "placeholder-1", userId: null }));
    prismaMock.householdInvite.create.mockResolvedValue(
      buildHouseholdInvite({ email: "invitee@test.com" })
    );
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.inviteMember(
      household.id,
      owner.id,
      "invitee@test.com",
      "Invited Person",
      "member",
      actor
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "INVITE_MEMBER",
          resource: "household-invite",
          resourceId: expect.any(String),
          actorId: "owner-user-id",
        }),
      })
    );
  });
});

describe("householdService.inviteMember", () => {
  const ctx = { householdId: "household-1", actorId: "owner-user", actorName: "Owner" };

  it("stores normalized invite email when provided", async () => {
    const owner = buildUser();
    const household = buildHousehold();
    const ownerMember = buildMember({
      householdId: household.id,
      userId: owner.id,
      role: "owner",
    });

    prismaMock.member.findFirst.mockResolvedValueOnce(ownerMember).mockResolvedValueOnce(null);
    prismaMock.household.findUnique.mockResolvedValue(household);
    prismaMock.householdInvite.findFirst.mockResolvedValue(null);
    prismaMock.member.create.mockResolvedValue(buildMember({ id: "placeholder-1", userId: null }));
    prismaMock.householdInvite.create.mockResolvedValue(
      buildHouseholdInvite({ email: "invitee@test.com" })
    );
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await householdService.inviteMember(
      household.id,
      owner.id,
      " Invitee@Test.com ",
      "Invited Person",
      "member",
      ctx
    );

    expect(prismaMock.householdInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: household.id,
          email: "invitee@test.com",
          createdByUserId: owner.id,
        }),
      })
    );
    expect(result.email).toBe("invitee@test.com");
  });

  it("creates a placeholder member (userId null) linked to the invite", async () => {
    const owner = buildUser();
    const household = buildHousehold();
    const ownerMember = buildMember({
      householdId: household.id,
      userId: owner.id,
      role: "owner",
    });

    prismaMock.member.findFirst.mockResolvedValueOnce(ownerMember).mockResolvedValueOnce(null);
    prismaMock.household.findUnique.mockResolvedValue(household);
    prismaMock.householdInvite.findFirst.mockResolvedValue(null);
    prismaMock.member.create.mockResolvedValue(buildMember({ id: "placeholder-1", userId: null }));
    prismaMock.householdInvite.create.mockResolvedValue(
      buildHouseholdInvite({ email: "invitee@test.com" })
    );
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.inviteMember(
      household.id,
      owner.id,
      "invitee@test.com",
      "Invited Person",
      "admin",
      ctx
    );

    expect(prismaMock.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: household.id,
          userId: null,
          name: "Invited Person",
          role: "admin",
        }),
      })
    );
    expect(prismaMock.householdInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ memberId: "placeholder-1" }),
      })
    );
  });

  it("maps a duplicate member name to a non-revealing ConflictError", async () => {
    const owner = buildUser();
    const household = buildHousehold();
    const ownerMember = buildMember({
      householdId: household.id,
      userId: owner.id,
      role: "owner",
    });

    prismaMock.member.findFirst.mockResolvedValueOnce(ownerMember).mockResolvedValueOnce(null);
    prismaMock.household.findUnique.mockResolvedValue(household);
    prismaMock.householdInvite.findFirst.mockResolvedValue(null);
    prismaMock.member.create.mockRejectedValue({ code: "P2002" });
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await expect(
      householdService.inviteMember(
        household.id,
        owner.id,
        "invitee@test.com",
        "Duplicate Name",
        "member",
        ctx
      )
    ).rejects.toThrow(ConflictError);
  });

  it("rejects invite when email already belongs to a household member", async () => {
    const owner = buildUser();
    const household = buildHousehold();
    const ownerMember = buildMember({
      householdId: household.id,
      userId: owner.id,
      role: "owner",
    });

    prismaMock.member.findFirst
      .mockResolvedValueOnce(ownerMember)
      .mockResolvedValueOnce(buildMember({ userId: "member-2" }));
    prismaMock.household.findUnique.mockResolvedValue(household);

    await expect(
      householdService.inviteMember(
        household.id,
        owner.id,
        "member@example.com",
        "Invited Person",
        "member",
        ctx
      )
    ).rejects.toThrow(ConflictError);
  });
});

describe("householdService.acceptInvite", () => {
  it("rejects new-user signup when email does not match email-bound invite", async () => {
    const invite = buildHouseholdInvite({
      email: "invitee@example.com",
      household: { id: "household-1", name: "Test Household" },
    });

    prismaMock.householdInvite.findUnique.mockResolvedValue(invite);

    await expect(
      householdService.acceptInvite("valid-token", {
        name: "Alice",
        email: "other@example.com",
        password: "verysecure123",
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe("householdService.joinViaInvite", () => {
  it("rejects existing user when account email does not match email-bound invite", async () => {
    const invite = buildHouseholdInvite({
      email: "invitee@example.com",
      household: { id: "household-1", name: "Test Household" },
    });

    prismaMock.householdInvite.findUnique.mockResolvedValue(invite);
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({ id: "user-1", email: "wrong@example.com" })
    );

    await expect(householdService.joinViaInvite("valid-token", "user-1")).rejects.toThrow(
      ValidationError
    );
  });
});

describe("householdService.leaveHousehold", () => {
  const ctx = { householdId: "household-1", actorId: "user-1", actorName: "Member" };

  it("removes a regular member from the household", async () => {
    const member = buildMember({
      id: "member-1",
      householdId: "household-1",
      userId: "user-1",
      role: "member",
    });
    const user = buildUser({ id: "user-1", activeHouseholdId: "household-2" });

    prismaMock.member.findFirst.mockResolvedValue(member);
    prismaMock.member.findUnique.mockResolvedValue(member);
    prismaMock.member.delete.mockResolvedValue(member);
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.leaveHousehold("household-1", "user-1", ctx);

    expect(prismaMock.member.delete).toHaveBeenCalledWith({
      where: { id: "member-1" },
    });
  });

  it("throws NotFoundError if the user is not a member", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null);

    await expect(householdService.leaveHousehold("household-1", "user-1", ctx)).rejects.toThrow(
      NotFoundError
    );
  });

  it("throws ValidationError if the user is the sole owner", async () => {
    const member = buildMember({ role: "owner" });
    prismaMock.member.findFirst.mockResolvedValue(member);
    prismaMock.member.count.mockResolvedValue(1);

    await expect(householdService.leaveHousehold("household-1", "user-1", ctx)).rejects.toThrow(
      ValidationError
    );
  });

  it("allows an owner to leave when another owner exists", async () => {
    const member = buildMember({ id: "member-1", role: "owner" });
    const user = buildUser({ id: "user-1", activeHouseholdId: "household-2" });
    prismaMock.member.findFirst.mockResolvedValue(member);
    prismaMock.member.findUnique.mockResolvedValue(member);
    prismaMock.member.count.mockResolvedValue(2);
    prismaMock.member.delete.mockResolvedValue(member);
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.leaveHousehold("household-1", "user-1", ctx);

    expect(prismaMock.member.delete).toHaveBeenCalled();
  });

  it("switches activeHouseholdId when leaving the currently active household", async () => {
    const member = buildMember({
      id: "member-1",
      householdId: "household-1",
      userId: "user-1",
      role: "member",
    });
    const user = buildUser({ id: "user-1", activeHouseholdId: "household-1" });
    const otherMembership = buildMember({
      householdId: "household-2",
      userId: "user-1",
    });

    prismaMock.member.findFirst.mockResolvedValue(member);
    prismaMock.member.findUnique.mockResolvedValue(member);
    prismaMock.member.delete.mockResolvedValue(member);
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.user.update.mockResolvedValue({
      ...user,
      activeHouseholdId: "household-2",
    });
    prismaMock.auditLog.create.mockResolvedValue({} as any);
    prismaMock.member.findFirst
      .mockResolvedValueOnce(member)
      .mockResolvedValueOnce(otherMembership);

    await householdService.leaveHousehold("household-1", "user-1", ctx);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { activeHouseholdId: "household-2" },
    });
  });

  it("does not update activeHouseholdId when leaving a non-active household", async () => {
    const member = buildMember({
      id: "member-1",
      householdId: "household-1",
      userId: "user-1",
      role: "member",
    });
    const user = buildUser({ id: "user-1", activeHouseholdId: "household-2" });

    prismaMock.member.findFirst.mockResolvedValue(member);
    prismaMock.member.findUnique.mockResolvedValue(member);
    prismaMock.member.delete.mockResolvedValue(member);
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.leaveHousehold("household-1", "user-1", ctx);

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

// ─── renameHousehold with audited() ─────────────────────────────────────────

describe("householdService.renameHousehold with audited()", () => {
  const actor = {
    householdId: "household-1",
    actorId: "owner-user-id",
    actorName: "Owner",
  };

  it("writes an UPDATE_HOUSEHOLD AuditLog entry when ctx is provided", async () => {
    const owner = buildUser({ id: "owner-user-id" });
    const household = buildHousehold({ id: "household-1", name: "Old Name" });
    const ownerMember = buildMember({
      householdId: household.id,
      userId: owner.id,
      role: "owner",
    });
    const updated = { ...household, name: "New Name" };

    prismaMock.member.findFirst.mockResolvedValue(ownerMember);
    prismaMock.household.findUnique.mockResolvedValue(household);
    prismaMock.household.update.mockResolvedValue(updated);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.renameHousehold(household.id, owner.id, "New Name", actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE_HOUSEHOLD",
          resource: "household",
          resourceId: "household-1",
          actorId: "owner-user-id",
        }),
      })
    );
  });
});

// ─── cancelInvite with audited() ─────────────────────────────────────────────

describe("householdService.cancelInvite with audited()", () => {
  const actor = {
    householdId: "household-1",
    actorId: "owner-user-id",
    actorName: "Owner",
  };

  it("writes a CANCEL_INVITE AuditLog entry when ctx is provided", async () => {
    const owner = buildUser({ id: "owner-user-id" });
    const ownerMember = buildMember({
      householdId: "household-1",
      userId: owner.id,
      role: "owner",
    });
    const invite = buildHouseholdInvite({ id: "invite-1", householdId: "household-1" });

    prismaMock.member.findFirst.mockResolvedValue(ownerMember);
    prismaMock.householdInvite.findUnique.mockResolvedValue(invite);
    prismaMock.householdInvite.delete.mockResolvedValue(invite);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.cancelInvite("household-1", owner.id, "invite-1", actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CANCEL_INVITE",
          resource: "household-invite",
          resourceId: "invite-1",
          actorId: "owner-user-id",
        }),
      })
    );
  });
});

// ─── leaveHousehold with audited() ───────────────────────────────────────────

describe("householdService.leaveHousehold with audited()", () => {
  const actor = {
    householdId: "household-1",
    actorId: "user-1",
    actorName: "Member",
  };

  it("writes a LEAVE_HOUSEHOLD AuditLog entry with the membership id as resourceId", async () => {
    const member = buildMember({
      id: "member-1",
      householdId: "household-1",
      userId: "user-1",
      role: "member",
    });
    const user = buildUser({ id: "user-1", activeHouseholdId: "household-2" });

    prismaMock.member.findFirst.mockResolvedValue(member);
    prismaMock.member.findUnique.mockResolvedValue(member);
    prismaMock.member.delete.mockResolvedValue(member);
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await householdService.leaveHousehold("household-1", "user-1", actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "LEAVE_HOUSEHOLD",
          resource: "household-member",
          resourceId: "member-1",
          actorId: "user-1",
        }),
      })
    );
  });
});

// ─── acceptInvite with audit ──────────────────────────────────────────────────

describe("householdService.acceptInvite with audit", () => {
  it("writes an ACCEPT_INVITE AuditLog entry inside the transaction", async () => {
    const invite = buildHouseholdInvite({
      id: "invite-1",
      email: "invitee@example.com",
      householdId: "household-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      household: { id: "household-1", name: "Test Household" },
    });

    const createdUser = buildUser({
      id: "new-user-1",
      email: "invitee@example.com",
      name: "Alice",
      activeHouseholdId: "household-1",
    });
    const personal = buildHousehold({ id: "personal-hh-1" });

    prismaMock.householdInvite.findUnique.mockResolvedValue(invite);
    prismaMock.user.findUnique.mockResolvedValueOnce(null); // no existing user
    prismaMock.user.create.mockResolvedValue(createdUser);
    prismaMock.household.create.mockResolvedValue(personal);
    prismaMock.member.create.mockResolvedValue(buildMember());
    prismaMock.householdSettings.create.mockResolvedValue({} as any);
    prismaMock.user.update.mockResolvedValue(createdUser);
    prismaMock.householdInvite.update.mockResolvedValue({ ...invite, usedAt: new Date() });
    prismaMock.auditLog.create.mockResolvedValue({} as any);
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 16 });
    prismaMock.refreshToken.create.mockResolvedValue({} as any);

    await householdService.acceptInvite(
      "valid-token",
      { name: "Alice", email: "invitee@example.com", password: "verysecure123" },
      { ipAddress: "127.0.0.1", userAgent: "test-agent" }
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ACCEPT_INVITE",
          resource: "household-invite",
          resourceId: "invite-1",
          actorId: "new-user-1",
        }),
      })
    );
  });

  // #135: the personal household's subcategories are now seeded inside the
  // acceptInvite transaction (against the personal household id).
  it("seeds the personal household's subcategories inside the transaction", async () => {
    const invite = buildHouseholdInvite({
      id: "invite-1",
      email: "invitee@example.com",
      householdId: "household-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      household: { id: "household-1", name: "Test Household" },
    });
    const createdUser = buildUser({
      id: "new-user-1",
      email: "invitee@example.com",
      name: "Alice",
    });
    const personal = buildHousehold({ id: "personal-hh-1" });

    prismaMock.householdInvite.findUnique.mockResolvedValue(invite);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValue(createdUser);
    prismaMock.household.create.mockResolvedValue(personal);
    prismaMock.member.create.mockResolvedValue(buildMember());
    prismaMock.householdSettings.create.mockResolvedValue({} as any);
    prismaMock.user.update.mockResolvedValue(createdUser);
    prismaMock.householdInvite.update.mockResolvedValue({ ...invite, usedAt: new Date() });
    prismaMock.auditLog.create.mockResolvedValue({} as any);
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 16 });
    prismaMock.refreshToken.create.mockResolvedValue({} as any);

    await householdService.acceptInvite("valid-token", {
      name: "Alice",
      email: "invitee@example.com",
      password: "verysecure123",
    });

    expect(prismaMock.subcategory.createMany).toHaveBeenCalledTimes(1);
    const seedCall = prismaMock.subcategory.createMany.mock.calls[0]![0] as any;
    expect((seedCall.data as any[]).every((r) => r.householdId === "personal-hh-1")).toBe(true);
  });

  it("links the accepting user to the existing placeholder member instead of creating a duplicate", async () => {
    const invite = buildHouseholdInvite({
      id: "invite-1",
      email: "invitee@example.com",
      householdId: "household-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      memberId: "placeholder-1",
      household: { id: "household-1", name: "Test Household" },
    });
    const createdUser = buildUser({
      id: "new-user-1",
      email: "invitee@example.com",
      name: "Alice",
    });
    const personal = buildHousehold({ id: "personal-hh-1" });

    prismaMock.householdInvite.findUnique.mockResolvedValue(invite);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValue(createdUser);
    prismaMock.household.create.mockResolvedValue(personal);
    // personal-household member creation
    prismaMock.member.create.mockResolvedValue(buildMember());
    prismaMock.member.update.mockResolvedValue(
      buildMember({ id: "placeholder-1", userId: "new-user-1" })
    );
    prismaMock.householdSettings.create.mockResolvedValue({} as any);
    prismaMock.user.update.mockResolvedValue(createdUser);
    prismaMock.householdInvite.update.mockResolvedValue({ ...invite, usedAt: new Date() });
    prismaMock.auditLog.create.mockResolvedValue({} as any);
    prismaMock.subcategory.createMany.mockResolvedValue({ count: 16 });
    prismaMock.refreshToken.create.mockResolvedValue({} as any);

    await householdService.acceptInvite("valid-token", {
      name: "Alice",
      email: "invitee@example.com",
      password: "verysecure123",
    });

    // Placeholder is linked to the new user…
    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "placeholder-1" },
        data: expect.objectContaining({ userId: "new-user-1" }),
      })
    );
    // …and no member was created in the invited household (only the personal one)
    const invitedHouseholdCreate = prismaMock.member.create.mock.calls.find(
      (c) => (c[0] as any)?.data?.householdId === "household-1"
    );
    expect(invitedHouseholdCreate).toBeUndefined();
  });
});

// ─── delete (DELETE_HOUSEHOLD) ───────────────────────────────────────────────

describe("householdService.delete", () => {
  it("writes exactly one DELETE_HOUSEHOLD row with cascaded counts", async () => {
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "owner", userId: "user-1" }));
    prismaMock.member.count.mockResolvedValue(3);
    prismaMock.asset.count.mockResolvedValue(2);
    prismaMock.account.count.mockResolvedValue(1);
    prismaMock.incomeSource.findMany.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({ id: `inc-${i}` })) as any
    );
    prismaMock.committedItem.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `com-${i}` })) as any
    );
    prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
    prismaMock.snapshot.count.mockResolvedValue(0);
    prismaMock.purchaseItem.count.mockResolvedValue(0);
    prismaMock.household.delete.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Alice" };
    await householdService.delete("hh-1", ctx);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE_HOUSEHOLD",
          resource: "household",
          resourceId: "hh-1",
          metadata: expect.objectContaining({
            cascaded: expect.objectContaining({ members: 3, assets: 2 }),
          }),
        }),
      })
    );
  });
});

// ─── assertOwnerOrAdmin ──────────────────────────────────────────────────────

describe("assertOwnerOrAdmin", () => {
  it("passes for owner", () => {
    expect(() => assertOwnerOrAdmin("owner")).not.toThrow();
  });
  it("passes for admin", () => {
    expect(() => assertOwnerOrAdmin("admin")).not.toThrow();
  });
  it("throws AuthorizationError for member", () => {
    expect(() => assertOwnerOrAdmin("member")).toThrow(AuthorizationError);
  });
});

// ─── updateMemberRole ────────────────────────────────────────────────────────

describe("updateMemberRole", () => {
  it("allows owner to promote member to admin", async () => {
    prismaMock.member.findFirst
      .mockResolvedValueOnce(
        buildMember({ id: "m_1", userId: "user_1", householdId: "hh_1", role: "owner" })
      )
      .mockResolvedValueOnce(
        buildMember({ id: "m_2", userId: "user_2", householdId: "hh_1", role: "member" })
      );
    prismaMock.member.update.mockResolvedValue(buildMember({ id: "m_2", role: "admin" }));
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const ctx = { householdId: "hh_1", actorId: "user_1", actorName: "Owner" };
    await updateMemberRole(
      prismaMock as any,
      { householdId: "hh_1", callerId: "user_1", targetUserId: "user_2", newRole: "admin" },
      ctx
    );

    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m_2" }, data: { role: "admin" } })
    );
  });

  it("allows admin to promote member to admin", async () => {
    prismaMock.member.findFirst
      .mockResolvedValueOnce(
        buildMember({ id: "m_1", userId: "user_1", householdId: "hh_1", role: "admin" })
      )
      .mockResolvedValueOnce(
        buildMember({ id: "m_2", userId: "user_2", householdId: "hh_1", role: "member" })
      );
    prismaMock.member.update.mockResolvedValue(buildMember({ id: "m_2", role: "admin" }));
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const ctx = { householdId: "hh_1", actorId: "user_1", actorName: "Admin" };
    await updateMemberRole(
      prismaMock as any,
      { householdId: "hh_1", callerId: "user_1", targetUserId: "user_2", newRole: "admin" },
      ctx
    );

    expect(prismaMock.member.update).toHaveBeenCalled();
  });

  it("throws AuthorizationError when admin tries to demote another admin", async () => {
    prismaMock.member.findFirst
      .mockResolvedValueOnce(
        buildMember({ id: "m_1", userId: "user_1", householdId: "hh_1", role: "admin" })
      )
      .mockResolvedValueOnce(
        buildMember({ id: "m_2", userId: "user_2", householdId: "hh_1", role: "admin" })
      );

    await expect(
      updateMemberRole(prismaMock as any, {
        householdId: "hh_1",
        callerId: "user_1",
        targetUserId: "user_2",
        newRole: "member",
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it("throws AuthorizationError when trying to change owner role", async () => {
    prismaMock.member.findFirst
      .mockResolvedValueOnce(
        buildMember({ id: "m_1", userId: "user_1", householdId: "hh_1", role: "owner" })
      )
      .mockResolvedValueOnce(
        buildMember({ id: "m_2", userId: "user_2", householdId: "hh_1", role: "owner" })
      );

    await expect(
      updateMemberRole(prismaMock as any, {
        householdId: "hh_1",
        callerId: "user_1",
        targetUserId: "user_2",
        newRole: "member",
      })
    ).rejects.toThrow(AuthorizationError);
  });
});

// ─── delete (household) ──────────────────────────────────────────────────────

describe("householdService.delete", () => {
  const actor = {
    householdId: "household-1",
    actorId: "owner-user-id",
    actorName: "Owner",
  };

  function mockCascadeCounts(counts: Record<string, number> = {}) {
    const value = (key: string) => counts[key] ?? 0;
    const idRows = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));
    prismaMock.member.count.mockResolvedValue(value("members") as never);
    prismaMock.asset.count.mockResolvedValue(value("assets") as never);
    prismaMock.account.count.mockResolvedValue(value("accounts") as never);
    prismaMock.incomeSource.findMany.mockResolvedValue(idRows("inc", value("income")) as never);
    prismaMock.committedItem.findMany.mockResolvedValue(idRows("com", value("committed")) as never);
    prismaMock.discretionaryItem.findMany.mockResolvedValue(
      idRows("dis", value("discretionary")) as never
    );
    prismaMock.snapshot.count.mockResolvedValue(value("snapshots") as never);
    prismaMock.purchaseItem.count.mockResolvedValue(value("goals") as never);
  }

  it("writes a DELETE_HOUSEHOLD audit row with cascade counts and deletes the household", async () => {
    const ownerMember = buildMember({
      householdId: "household-1",
      userId: "owner-user-id",
      role: "owner",
    });
    prismaMock.member.findFirst.mockResolvedValue(ownerMember);
    mockCascadeCounts({
      members: 2,
      assets: 3,
      accounts: 4,
      income: 1,
      committed: 5,
      discretionary: 6,
      snapshots: 7,
      goals: 8,
    });
    prismaMock.auditLog.create.mockResolvedValue({} as any);
    prismaMock.household.delete.mockResolvedValue({} as any);

    await householdService.delete("household-1", actor);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE_HOUSEHOLD",
          resource: "household",
          resourceId: "household-1",
          actorId: "owner-user-id",
          metadata: expect.objectContaining({
            cascaded: expect.objectContaining({
              members: 2,
              assets: 3,
              accounts: 4,
              income: 1,
              committed: 5,
              discretionary: 6,
              snapshots: 7,
              goals: 8,
            }),
          }),
        }),
      })
    );
    expect(prismaMock.household.delete).toHaveBeenCalledWith({ where: { id: "household-1" } });
  });

  it("throws AuthorizationError when caller is not an owner", async () => {
    const adminMember = buildMember({
      householdId: "household-1",
      userId: "owner-user-id",
      role: "admin",
    });
    prismaMock.member.findFirst.mockResolvedValue(adminMember);

    await expect(householdService.delete("household-1", actor)).rejects.toThrow(AuthorizationError);
    expect(prismaMock.household.delete).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("throws AuthorizationError when caller is not a member at all", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null);

    await expect(householdService.delete("household-1", actor)).rejects.toThrow(AuthorizationError);
    expect(prismaMock.household.delete).not.toHaveBeenCalled();
  });
});
