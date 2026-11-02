import { prisma } from "../config/database.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  isUniqueConstraintError,
} from "../utils/errors.js";
import type { CreateMemberInput, UpdateMemberInput } from "@finplan/shared";
import { AuditAction } from "@finplan/shared";
import { audited, auditEventTx } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import { assertCallerOwnerOrAdmin } from "./household.service.js";

export const memberService = {
  async createMember(
    householdId: string,
    callerUserId: string,
    data: CreateMemberInput,
    ctx: ActorCtx
  ) {
    await assertCallerOwnerOrAdmin(householdId, callerUserId);

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
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
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
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.householdId !== householdId) {
      throw new NotFoundError("Member not found");
    }

    // A member may edit their own profile; any other target requires
    // owner-or-admin authority (the household capability matrix).
    const isSelf = member.userId !== null && member.userId === callerUserId;
    if (!isSelf) {
      await assertCallerOwnerOrAdmin(householdId, callerUserId);
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
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
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
    await assertCallerOwnerOrAdmin(householdId, callerUserId);

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
      // durable: committed atomically with the surrounding $transaction
      await auditEventTx(tx, {
        householdId: ctx.householdId,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        action: AuditAction.DELETE_MEMBER_PROFILE,
        resource: "member-profile",
        resourceId: memberId,
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
