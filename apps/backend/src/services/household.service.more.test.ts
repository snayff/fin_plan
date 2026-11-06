import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));
mock.module("./audit.service.js", () => ({
  audited: mock(({ mutation }: { mutation: (tx: typeof prismaMock) => unknown }) =>
    mutation(prismaMock)
  ),
  auditEventTx: mock(async (tx: typeof prismaMock, entry: Record<string, unknown>) => {
    await tx.auditLog.create({ data: entry });
  }),
}));
mock.module("./subcategory.service.js", () => ({
  subcategoryService: { seedDefaults: mock(async () => {}) },
}));

const { householdService } = await import("./household.service.js");

const ctx = {
  householdId: "hh-1",
  actorId: "u-1",
  actorName: "Alice",
  ipAddress: "127.0.0.1",
  userAgent: "test",
};

function validInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    householdId: "hh-invited",
    email: "bob@example.com",
    tokenHash: "hash",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    intendedRole: "member",
    household: { id: "hh-invited", name: "The Smiths" },
    ...overrides,
  };
}

beforeEach(() => resetPrismaMocks());

describe("householdService.joinViaInvite", () => {
  it("joins via the audited branch when ctx is provided", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-2",
      email: "bob@example.com",
      name: "Bob",
    } as any);
    prismaMock.member.findFirst.mockResolvedValue(null);
    prismaMock.member.create.mockResolvedValue({ id: "mem-1" } as any);
    prismaMock.user.update.mockResolvedValue({} as any);
    prismaMock.householdInvite.update.mockResolvedValue({} as any);

    const result = await householdService.joinViaInvite("tok", "u-2", ctx);

    expect(prismaMock.member.create).toHaveBeenCalledWith({
      data: { householdId: "hh-invited", userId: "u-2", name: "Bob", role: "member" },
    });
    expect(result).toMatchObject({ id: "hh-invited" });
  });

  it("links the existing placeholder member instead of creating a new one", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(
      validInvite({ memberId: "placeholder-1" }) as any
    );
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-2",
      email: "bob@example.com",
      name: "Bob",
    } as any);
    prismaMock.member.findFirst.mockResolvedValue(null);
    prismaMock.member.update.mockResolvedValue({ id: "placeholder-1", userId: "u-2" } as any);
    prismaMock.user.update.mockResolvedValue({} as any);
    prismaMock.householdInvite.update.mockResolvedValue({} as any);

    const result = await householdService.joinViaInvite("tok", "u-2", ctx);

    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "placeholder-1" },
        data: expect.objectContaining({ userId: "u-2" }),
      })
    );
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "hh-invited" });
  });

  it("joins via the plain transaction branch when no ctx is provided", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-2",
      email: "bob@example.com",
      name: "Bob",
    } as any);
    prismaMock.member.findFirst.mockResolvedValue(null);
    prismaMock.member.create.mockResolvedValue({ id: "mem-1" } as any);
    prismaMock.user.update.mockResolvedValue({} as any);
    prismaMock.householdInvite.update.mockResolvedValue({} as any);
    // joinViaInvite (no ctx) calls prisma.$transaction([...]) with an array of promises
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (tx: typeof prismaMock) => unknown)(prismaMock)
    );

    const result = await householdService.joinViaInvite("tok", "u-2");
    expect(result).toMatchObject({ id: "hh-invited" });
    expect(prismaMock.member.create).toHaveBeenCalled();
  });

  it("rejects when the existing user cannot be found", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(householdService.joinViaInvite("tok", "u-2", ctx)).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });

  it("rejects when the signed-in email does not match the invite", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-2",
      email: "other@example.com",
      name: "Bob",
    } as any);
    await expect(householdService.joinViaInvite("tok", "u-2", ctx)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("rejects when already a member of the invited household", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-2",
      email: "bob@example.com",
      name: "Bob",
    } as any);
    prismaMock.member.findFirst.mockResolvedValue({ id: "already" } as any);
    await expect(householdService.joinViaInvite("tok", "u-2", ctx)).rejects.toMatchObject({
      name: "ConflictError",
    });
  });

  it("maps a P2002 race to ConflictError", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-2",
      email: "bob@example.com",
      name: "Bob",
    } as any);
    prismaMock.member.findFirst.mockResolvedValue(null);
    prismaMock.member.create.mockRejectedValue({ code: "P2002" });
    await expect(householdService.joinViaInvite("tok", "u-2", ctx)).rejects.toMatchObject({
      name: "ConflictError",
    });
  });
});

describe("householdService.acceptInvite — validation branches", () => {
  it("rejects a password shorter than 12 characters", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    await expect(
      householdService.acceptInvite("tok", {
        name: "Bob",
        email: "bob@example.com",
        password: "short",
      })
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("rejects when the email does not match the invite", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    await expect(
      householdService.acceptInvite("tok", {
        name: "Bob",
        email: "wrong@example.com",
        password: "a-very-long-password",
      })
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("rejects when an account with the email already exists", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(validInvite() as any);
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" } as any);
    await expect(
      householdService.acceptInvite("tok", {
        name: "Bob",
        email: "bob@example.com",
        password: "a-very-long-password",
      })
    ).rejects.toMatchObject({ name: "ConflictError" });
  });
});

describe("householdService.validateInviteToken — error branches", () => {
  it("rejects an unknown token", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(null);
    await expect(householdService.validateInviteToken("tok")).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });

  it("rejects an already-used invite", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(
      validInvite({ usedAt: new Date() }) as any
    );
    await expect(householdService.validateInviteToken("tok")).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("rejects an expired invite", async () => {
    prismaMock.householdInvite.findUnique.mockResolvedValue(
      validInvite({ expiresAt: new Date(Date.now() - 1000) }) as any
    );
    await expect(householdService.validateInviteToken("tok")).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});

describe("householdService.removeMember — active household reassignment", () => {
  it("repoints a removed member's activeHouseholdId to another membership", async () => {
    prismaMock.member.findFirst
      .mockResolvedValueOnce({ id: "owner", role: "owner", householdId: "hh-1" } as any) // assertOwner
      .mockResolvedValueOnce({ id: "other-mem", householdId: "hh-2" } as any); // otherMembership lookup
    prismaMock.member.findUnique.mockResolvedValue({
      id: "mem-target",
      householdId: "hh-1",
      userId: "u-target",
    } as any);
    prismaMock.member.delete.mockResolvedValue({} as any);
    prismaMock.auditLog.create.mockResolvedValue({} as any);
    prismaMock.user.findUnique.mockResolvedValue({ activeHouseholdId: "hh-1" } as any);
    prismaMock.user.update.mockResolvedValue({} as any);

    await householdService.removeMember("hh-1", "u-1", "mem-target", ctx);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u-target" },
      data: { activeHouseholdId: "hh-2" },
    });
  });

  it("refuses to let an owner remove themselves", async () => {
    prismaMock.member.findFirst.mockResolvedValue({
      id: "owner",
      role: "owner",
      householdId: "hh-1",
    } as any);
    prismaMock.member.findUnique.mockResolvedValue({
      id: "mem-self",
      householdId: "hh-1",
      userId: "u-1",
    } as any);
    await expect(
      householdService.removeMember("hh-1", "u-1", "mem-self", ctx)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});
