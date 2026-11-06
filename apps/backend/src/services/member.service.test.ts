import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { buildMember } from "../test/fixtures";

mock.module("../config/database", () => ({ prisma: prismaMock }));

import { memberService } from "./member.service";
import { AuthorizationError } from "../utils/errors";

beforeEach(() => resetPrismaMocks());

describe("memberService.createMember", () => {
  const ctx = { householdId: "household-1", actorId: "owner-user", actorName: "Owner" };

  it("creates a member with name and householdId", async () => {
    const member = buildMember({ name: "Alice", userId: null });
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "owner" }));
    prismaMock.member.create.mockResolvedValue(member);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await memberService.createMember(
      "household-1",
      "owner-user",
      { name: "Alice" },
      ctx
    );

    expect(prismaMock.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Alice", householdId: "household-1", userId: null }),
      })
    );
    expect(result.name).toBe("Alice");
  });

  it("rejects if caller is not owner or admin", async () => {
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "member" }));
    await expect(
      memberService.createMember("household-1", "non-owner", { name: "Alice" }, ctx)
    ).rejects.toThrow(AuthorizationError);
  });

  it("allows an admin to create a member", async () => {
    const member = buildMember({ name: "Alice", userId: null });
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "admin" }));
    prismaMock.member.create.mockResolvedValue(member);
    prismaMock.giftPerson.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await memberService.createMember(
      "household-1",
      "admin-user",
      { name: "Alice" },
      ctx
    );

    expect(result.name).toBe("Alice");
  });
});

describe("memberService.listMembers", () => {
  it("returns all members for the household", async () => {
    const members = [buildMember({ name: "Alice" }), buildMember({ name: "Bob" })];
    prismaMock.member.findMany.mockResolvedValue(members);

    const result = await memberService.listMembers("household-1");
    expect(result).toHaveLength(2);
  });
});

describe("memberService.createMember gifts integration", () => {
  const ctx = { householdId: "hh-1", actorId: "owner-user", actorName: "Owner" };

  it("creates a matching GiftPerson row with memberId link", async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: "owner",
      role: "owner",
      householdId: "hh-1",
    } as any);
    prismaMock.member.create.mockResolvedValue({
      id: "m-new",
      householdId: "hh-1",
      name: "Sis",
    } as any);
    prismaMock.giftPerson.create.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await memberService.createMember("hh-1", "owner-user", { name: "Sis" } as any, ctx);

    expect(prismaMock.giftPerson.create).toHaveBeenCalledWith({
      data: {
        householdId: "hh-1",
        name: "Sis",
        memberId: "m-new",
      },
    });
  });

  it("does not throw if a GiftPerson with that name already exists (P2002)", async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: "owner",
      role: "owner",
      householdId: "hh-1",
    } as any);
    prismaMock.member.create.mockResolvedValue({
      id: "m-new",
      householdId: "hh-1",
      name: "Sis",
    } as any);
    prismaMock.giftPerson.create.mockRejectedValue({ code: "P2002" });
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await expect(
      memberService.createMember("hh-1", "owner-user", { name: "Sis" } as any, ctx)
    ).resolves.toBeDefined();
  });
});

describe("memberService.deleteMember gifts integration", () => {
  const ctx = { householdId: "hh-1", actorId: "owner-user", actorName: "Owner" };

  it("nullifies GiftPerson.memberId before deleting the member", async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: "owner",
      role: "owner",
      householdId: "hh-1",
    } as any);
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m-1",
      householdId: "hh-1",
      userId: null,
    } as any);
    prismaMock.incomeSource.count.mockResolvedValue(0);
    prismaMock.committedItem.count.mockResolvedValue(0);
    prismaMock.asset.count.mockResolvedValue(0);
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.giftPerson.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.member.delete.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await memberService.deleteMember("hh-1", "owner-user", "m-1", ctx, undefined);

    expect(prismaMock.giftPerson.updateMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", memberId: "m-1" },
      data: { memberId: null },
    });
  });
});

describe("memberService.updateMember", () => {
  it("updates member name", async () => {
    const member = buildMember({ name: "Alice" });
    const updated = { ...member, name: "Alice Smith" };
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "owner" }));
    prismaMock.member.findUnique.mockResolvedValue(member);
    prismaMock.member.update.mockResolvedValue(updated);

    const ctx = { householdId: "household-1", actorId: "owner-user", actorName: "Owner" };
    const result = await memberService.updateMember(
      "household-1",
      "owner-user",
      member.id,
      {
        name: "Alice Smith",
      },
      ctx
    );
    expect(result.name).toBe("Alice Smith");
  });

  it("allows a member to update their own profile without owner/admin rights", async () => {
    const ctx = { householdId: "hh-1", actorId: "u-self", actorName: "Self" };
    const own = buildMember({
      id: "m-self",
      householdId: "hh-1",
      userId: "u-self",
      role: "member",
    });
    // A plain-member caller: if the code reached the owner/admin check this would throw.
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "member" }));
    prismaMock.member.findUnique.mockResolvedValue(own);
    prismaMock.member.update.mockResolvedValue({ ...own, retirementYear: 2055 });
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await memberService.updateMember(
      "hh-1",
      "u-self",
      "m-self",
      { retirementYear: 2055 },
      ctx
    );

    expect(result.retirementYear).toBe(2055);
  });

  it("allows an admin to update another member's profile", async () => {
    const ctx = { householdId: "hh-1", actorId: "u-admin", actorName: "Admin" };
    const target = buildMember({
      id: "m-other",
      householdId: "hh-1",
      userId: "u-other",
      role: "member",
    });
    prismaMock.member.findUnique.mockResolvedValue(target);
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "admin" }));
    prismaMock.member.update.mockResolvedValue({ ...target, name: "Renamed" });
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    const result = await memberService.updateMember(
      "hh-1",
      "u-admin",
      "m-other",
      { name: "Renamed" },
      ctx
    );

    expect(result.name).toBe("Renamed");
  });

  it("rejects a plain member updating another member's profile", async () => {
    const ctx = { householdId: "hh-1", actorId: "u-member", actorName: "Member" };
    const target = buildMember({
      id: "m-other",
      householdId: "hh-1",
      userId: "u-other",
      role: "member",
    });
    prismaMock.member.findUnique.mockResolvedValue(target);
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "member" }));

    await expect(
      memberService.updateMember("hh-1", "u-member", "m-other", { name: "Nope" }, ctx)
    ).rejects.toThrow(AuthorizationError);
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });
});

describe("memberService.deleteMember capability", () => {
  const ctx = { householdId: "hh-1", actorId: "u-admin", actorName: "Admin" };

  it("allows an admin to delete a member profile", async () => {
    prismaMock.member.findFirst.mockResolvedValue(buildMember({ role: "admin" }));
    prismaMock.member.findUnique.mockResolvedValue(
      buildMember({ id: "m-1", householdId: "hh-1", userId: null })
    );
    prismaMock.incomeSource.count.mockResolvedValue(0);
    prismaMock.committedItem.count.mockResolvedValue(0);
    prismaMock.discretionaryItem.count.mockResolvedValue(0);
    prismaMock.asset.count.mockResolvedValue(0);
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.giftPerson.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.member.delete.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);

    await memberService.deleteMember("hh-1", "u-admin", "m-1", ctx, undefined);

    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: "m-1" } });
  });
});

describe("memberService audit logging", () => {
  const ctx = { householdId: "hh-1", actorId: "user-1", actorName: "Alice" };

  beforeEach(() => {
    prismaMock.auditLog.create.mockResolvedValue({} as any);
    // Reset owner check mock
    prismaMock.member.findFirst.mockResolvedValue({
      id: "owner-1",
      householdId: "hh-1",
      role: "owner",
    } as any);
  });

  it("writes CREATE_MEMBER_PROFILE audit entry on createMember", async () => {
    prismaMock.member.create.mockResolvedValue({
      id: "m-new",
      householdId: "hh-1",
      name: "Bob",
      role: "member",
    } as any);
    prismaMock.giftPerson.create.mockResolvedValue({} as any);

    await memberService.createMember("hh-1", "caller-user", { name: "Bob" }, ctx);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE_MEMBER_PROFILE",
          resource: "member-profile",
          actorId: "user-1",
        }),
      })
    );
  });

  it("writes UPDATE_MEMBER_PROFILE audit entry on updateMember", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m-1",
      householdId: "hh-1",
      name: "Bob",
    } as any);
    prismaMock.member.update.mockResolvedValue({
      id: "m-1",
      householdId: "hh-1",
      name: "Bobby",
    } as any);

    await memberService.updateMember("hh-1", "caller-user", "m-1", { name: "Bobby" }, ctx);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE_MEMBER_PROFILE",
          resource: "member-profile",
          resourceId: "m-1",
        }),
      })
    );
  });

  it("writes DELETE_MEMBER_PROFILE audit entry on deleteMember", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m-1",
      householdId: "hh-1",
      userId: null,
      name: "Bob",
    } as any);
    prismaMock.incomeSource.count.mockResolvedValue(0);
    prismaMock.committedItem.count.mockResolvedValue(0);
    prismaMock.asset.count.mockResolvedValue(0);
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.giftPerson.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.member.delete.mockResolvedValue({} as any);

    await memberService.deleteMember("hh-1", "caller-user", "m-1", ctx, undefined);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE_MEMBER_PROFILE",
          resource: "member-profile",
          resourceId: "m-1",
        }),
      })
    );
  });
});
