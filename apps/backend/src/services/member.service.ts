import { prisma } from "../config/database.js";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import type { CreateMemberInput, UpdateMemberInput } from "@finplan/shared";
import { AuditAction } from "@finplan/shared";
import { audited } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";

async function assertCallerIsOwner(householdId: string, userId: string) {
  const caller = await prisma.member.findFirst({
    where: { householdId, userId },
  });
  if (!caller || caller.role !== "owner") {
    throw new AuthorizationError("Only household owners can manage members");
  }
  return caller;
}

export const memberService = {
  async createMember(
    householdId: string,
    callerUserId: string,
    data: CreateMemberInput,
    ctx: ActorCtx
  ) {
    await assertCallerIsOwner(householdId, callerUserId);

    try {
      const created = await audited({
        db: prisma,
        ctx,
        action: AuditAction.CREATE_MEMBER_PROFILE,
        resource: "member-profile",
        resourceId: (after: { id: string }) => after.id,
        beforeFetch: async () => null,
        mutation: (tx) =>
          tx.member.create({
            data: {
              householdId,
              userId: null,
              name: data.name,
              dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
              retirementYear: data.retirementYear ?? null,
              role: "member",
            },
          }),
      });

      // Also create gift person for the new member (outside the transaction)
      try {
        await prisma.giftPerson.create({
          data: { householdId, name: created.name, memberId: created.id },
        });
      } catch (gpErr: unknown) {
        if ((gpErr as { code?: string })?.code !== "P2002") throw gpErr;
      }

      return created;
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A member with that name already exists in this household");
      }
      throw err;
    }
  },

  async listMembers(householdId: string) {
    return prisma.member.findMany({
      where: { householdId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
  },

  async updateMember(
    householdId: string,
    callerUserId: string,
    memberId: string,
    data: UpdateMemberInput,
    ctx: ActorCtx
  ) {
    await assertCallerIsOwner(householdId, callerUserId);

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.householdId !== householdId) {
      throw new NotFoundError("Member not found");
    }

    try {
      return await audited({
        db: prisma,
        ctx,
        action: AuditAction.UPDATE_MEMBER_PROFILE,
        resource: "member-profile",
        resourceId: memberId,
        beforeFetch: async (tx) =>
          tx.member.findUnique({ where: { id: memberId } }) as Promise<Record<
            string,
            unknown
          > | null>,
        mutation: (tx) =>
          tx.member.update({
            where: { id: memberId },
            data: {
              ...(data.name !== undefined ? { name: data.name } : {}),
              ...(data.dateOfBirth !== undefined
                ? { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }
                : {}),
              ...(data.retirementYear !== undefined ? { retirementYear: data.retirementYear } : {}),
            },
          }),
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A member with that name already exists in this household");
      }
      throw err;
    }
  },

  async deleteMember(
    householdId: string,
    callerUserId: string,
    memberId: string,
    ctx: ActorCtx,
    reassignToMemberId?: string
  ) {
    await assertCallerIsOwner(householdId, callerUserId);

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.householdId !== householdId) {
      throw new NotFoundError("Member not found");
    }
    if (member.userId) {
      throw new ValidationError(
        "Cannot delete a member with a linked user account. Use 'Remove member' instead."
      );
    }

    // Check if member has assigned items
    const [incomeCount, committedCount, discretionaryCount, assetCount, accountCount] =
      await Promise.all([
        prisma.incomeSource.count({ where: { householdId, memberId } }),
        prisma.committedItem.count({ where: { householdId, memberId } }),
        prisma.discretionaryItem.count({ where: { householdId, memberId } }),
        prisma.asset.count({ where: { householdId, memberId } }),
        prisma.account.count({ where: { householdId, memberId } }),
      ]);

    const totalItems =
      incomeCount + committedCount + discretionaryCount + assetCount + accountCount;

    if (totalItems > 0 && !reassignToMemberId) {
      throw new ValidationError(
        `Member has ${totalItems} assigned items. Provide a reassignment target.`
      );
    }

    await prisma.$transaction(async (tx) => {
      if (reassignToMemberId && totalItems > 0) {
        // Verify reassignment target exists
        const target = await tx.member.findUnique({ where: { id: reassignToMemberId } });
        if (!target || target.householdId !== householdId) {
          throw new NotFoundError("Reassignment target member not found");
        }

        await Promise.all([
          tx.incomeSource.updateMany({
            where: { householdId, memberId },
            data: { memberId: reassignToMemberId },
          }),
          tx.committedItem.updateMany({
            where: { householdId, memberId },
            data: { memberId: reassignToMemberId },
          }),
          tx.discretionaryItem.updateMany({
            where: { householdId, memberId },
            data: { memberId: reassignToMemberId },
          }),
          tx.asset.updateMany({
            where: { householdId, memberId },
            data: { memberId: reassignToMemberId },
          }),
          tx.account.updateMany({
            where: { householdId, memberId },
            data: { memberId: reassignToMemberId },
          }),
        ]);
      }

      await tx.giftPerson.updateMany({
        where: { householdId, memberId },
        data: { memberId: null },
      });

      await tx.member.delete({ where: { id: memberId } });

      // Write audit row inside transaction
      await (tx as any).auditLog.create({
        data: {
          householdId: ctx.householdId,
          actorId: ctx.actorId,
          actorName: ctx.actorName,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          action: AuditAction.DELETE_MEMBER_PROFILE,
          resource: "member-profile",
          resourceId: memberId,
        },
      });
    });
  },

  async getItemCountsForMember(householdId: string, memberId: string) {
    const [income, committed, discretionary, assets, accounts] = await Promise.all([
      prisma.incomeSource.count({ where: { householdId, memberId } }),
      prisma.committedItem.count({ where: { householdId, memberId } }),
      prisma.discretionaryItem.count({ where: { householdId, memberId } }),
      prisma.asset.count({ where: { householdId, memberId } }),
      prisma.account.count({ where: { householdId, memberId } }),
    ]);
    return {
      total: income + committed + discretionary + assets + accounts,
      income,
      committed,
      discretionary,
      assets,
      accounts,
    };
  },
};
