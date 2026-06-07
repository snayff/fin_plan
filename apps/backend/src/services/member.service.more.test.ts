import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database", () => ({ prisma: prismaMock }));

import { memberService } from "./member.service";

const ctx = { householdId: "hh-1", actorId: "owner-user", actorName: "Owner" };

beforeEach(() => {
  resetPrismaMocks();
  // Default: caller is an owner
  prismaMock.member.findFirst.mockResolvedValue({
    id: "owner",
    role: "owner",
    householdId: "hh-1",
  } as any);
  prismaMock.auditLog.create.mockResolvedValue({} as any);
});

describe("memberService.createMember — conflict", () => {
  it("maps a P2002 unique violation to ConflictError", async () => {
    prismaMock.member.create.mockRejectedValue({ code: "P2002" });
    await expect(
      memberService.createMember("hh-1", "owner-user", { name: "Dup" } as any, ctx)
    ).rejects.toMatchObject({ name: "ConflictError" });
  });
});

describe("memberService.updateMember — guards", () => {
  it("throws NotFoundError when the member is missing", async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);
    await expect(
      memberService.updateMember("hh-1", "owner-user", "m-x", { name: "x" } as any, ctx)
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("throws NotFoundError when the member belongs to another household", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m-1", householdId: "other" } as any);
    await expect(
      memberService.updateMember("hh-1", "owner-user", "m-1", { name: "x" } as any, ctx)
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("maps a P2002 unique violation to ConflictError", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m-1", householdId: "hh-1" } as any);
    prismaMock.member.update.mockRejectedValue({ code: "P2002" });
    await expect(
      memberService.updateMember("hh-1", "owner-user", "m-1", { name: "Dup" } as any, ctx)
    ).rejects.toMatchObject({ name: "ConflictError" });
  });

  it("applies dateOfBirth and retirementYear patches", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m-1", householdId: "hh-1" } as any);
    prismaMock.member.update.mockResolvedValue({ id: "m-1" } as any);

    await memberService.updateMember(
      "hh-1",
      "owner-user",
      "m-1",
      { dateOfBirth: "1990-01-01", retirementYear: 2055 } as any,
      ctx
    );

    const call = (prismaMock.member.update.mock.calls[0] as any)[0];
    expect(call.data.dateOfBirth).toBeInstanceOf(Date);
    expect(call.data.retirementYear).toBe(2055);
  });
});

describe("memberService.deleteMember — guards and reassignment", () => {
  it("throws NotFoundError when the member is missing", async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);
    await expect(
      memberService.deleteMember("hh-1", "owner-user", "m-x", ctx)
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("refuses to delete a member with a linked user account", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m-1",
      householdId: "hh-1",
      userId: "u-1",
    } as any);
    await expect(
      memberService.deleteMember("hh-1", "owner-user", "m-1", ctx)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("requires a reassignment target when the member has assigned items", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m-1",
      householdId: "hh-1",
      userId: null,
    } as any);
    prismaMock.incomeSource.count.mockResolvedValue(2);
    prismaMock.committedItem.count.mockResolvedValue(0);
    prismaMock.discretionaryItem.count.mockResolvedValue(0);
    prismaMock.asset.count.mockResolvedValue(0);
    prismaMock.account.count.mockResolvedValue(0);

    await expect(
      memberService.deleteMember("hh-1", "owner-user", "m-1", ctx)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("reassigns items to the target then deletes the member", async () => {
    prismaMock.member.findUnique
      .mockResolvedValueOnce({ id: "m-1", householdId: "hh-1", userId: null } as any) // initial lookup
      .mockResolvedValueOnce({ id: "m-2", householdId: "hh-1" } as any); // reassignment target inside tx
    prismaMock.incomeSource.count.mockResolvedValue(1);
    prismaMock.committedItem.count.mockResolvedValue(0);
    prismaMock.discretionaryItem.count.mockResolvedValue(0);
    prismaMock.asset.count.mockResolvedValue(0);
    prismaMock.account.count.mockResolvedValue(0);
    prismaMock.incomeSource.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.committedItem.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.discretionaryItem.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.asset.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.account.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.giftPerson.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.member.delete.mockResolvedValue({} as any);

    await memberService.deleteMember("hh-1", "owner-user", "m-1", ctx, "m-2");

    expect(prismaMock.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { householdId: "hh-1", memberId: "m-1" },
      data: { memberId: "m-2" },
    });
    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: "m-1" } });
  });

  it("throws when the reassignment target does not exist", async () => {
    prismaMock.member.findUnique
      .mockResolvedValueOnce({ id: "m-1", householdId: "hh-1", userId: null } as any)
      .mockResolvedValueOnce(null); // target missing
    prismaMock.incomeSource.count.mockResolvedValue(1);
    prismaMock.committedItem.count.mockResolvedValue(0);
    prismaMock.discretionaryItem.count.mockResolvedValue(0);
    prismaMock.asset.count.mockResolvedValue(0);
    prismaMock.account.count.mockResolvedValue(0);

    await expect(
      memberService.deleteMember("hh-1", "owner-user", "m-1", ctx, "missing")
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });
});

describe("memberService.getItemCountsForMember", () => {
  it("sums counts across all item types", async () => {
    prismaMock.incomeSource.count.mockResolvedValue(1);
    prismaMock.committedItem.count.mockResolvedValue(2);
    prismaMock.discretionaryItem.count.mockResolvedValue(3);
    prismaMock.asset.count.mockResolvedValue(4);
    prismaMock.account.count.mockResolvedValue(5);

    const counts = await memberService.getItemCountsForMember("hh-1", "m-1");

    expect(counts).toEqual({
      total: 15,
      income: 1,
      committed: 2,
      discretionary: 3,
      assets: 4,
      accounts: 5,
    });
  });
});
