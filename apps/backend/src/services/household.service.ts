import { createHash, randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../config/database.js";
import { hashPassword } from "../utils/password.js";
import { subcategoryService } from "./subcategory.service.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  generateTokenFamily,
} from "../utils/jwt.js";
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from "../utils/errors.js";
import { audited } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import { AuditAction } from "@finplan/shared";

const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const IDLE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const ABSOLUTE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function assertOwner(householdId: string, userId: string) {
  const m = await prisma.member.findFirst({
    where: { householdId, userId },
  });
  if (!m || m.role !== "owner") {
    throw new AuthorizationError("Only household owners can perform this action");
  }
  return m;
}

async function assertMember(householdId: string, userId: string) {
  const m = await prisma.member.findFirst({
    where: { householdId, userId },
  });
  if (!m) throw new AuthorizationError("Not a member of this household");
  return m;
}

export function assertOwnerOrAdmin(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new AuthorizationError("Only household owners or admins can perform this action");
  }
}

type UpdateMemberRoleParams = {
  householdId: string;
  callerId: string;
  targetUserId: string;
  newRole: "member" | "admin";
};

export async function updateMemberRole(
  db: PrismaClient,
  { householdId, callerId, targetUserId, newRole }: UpdateMemberRoleParams,
  ctx: ActorCtx
) {
  const [caller, target] = await Promise.all([
    db.member.findFirst({
      where: { householdId, userId: callerId },
    }),
    db.member.findFirst({
      where: { householdId, userId: targetUserId },
    }),
  ]);

  if (!caller || !target) throw new NotFoundError("Member not found");

  // Cannot change owner role
  if (target.role === "owner") {
    throw new AuthorizationError("Cannot change the role of a household owner");
  }

  // Admin cannot act on another admin
  if (caller.role === "admin" && target.role === "admin") {
    throw new AuthorizationError("Admins cannot change the role of another admin");
  }

  // Admin cannot demote — only promote
  if (caller.role === "admin" && newRole === "member") {
    throw new AuthorizationError("Admins can only promote members, not demote");
  }

  // Must be owner or admin
  assertOwnerOrAdmin(caller.role);

  return audited({
    db: prisma,
    ctx,
    action: AuditAction.UPDATE_MEMBER_ROLE,
    resource: "household-member",
    resourceId: targetUserId,
    beforeFetch: async (tx) =>
      tx.member.findFirst({
        where: { householdId, userId: targetUserId },
      }) as Promise<Record<string, unknown> | null>,
    mutation: async (tx) =>
      tx.member.update({
        where: { id: target.id },
        data: { role: newRole },
      }),
  });
}

export const householdService = {
  // ─── Household CRUD ────────────────────────────────────────────────────────

  async createHousehold(userId: string, name: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const household = await prisma.household.create({
      data: { name },
    });
    try {
      await prisma.member.create({
        data: {
          householdId: household.id,
          userId,
          name: user?.name ?? "Owner",
          role: "owner",
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A member with that name already exists in this household");
      }
      throw err;
    }
    await prisma.householdSettings.create({ data: { householdId: household.id } });
    await subcategoryService.seedDefaults(household.id);
    await prisma.user.update({
      where: { id: userId },
      data: { activeHouseholdId: household.id },
    });
    return household;
  },

  async getUserHouseholds(userId: string) {
    return prisma.member.findMany({
      where: { userId },
      include: {
        household: {
          include: {
            _count: { select: { memberProfiles: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
  },

  async switchHousehold(userId: string, householdId: string) {
    await assertMember(householdId, userId);
    await prisma.user.update({
      where: { id: userId },
      data: { activeHouseholdId: householdId },
    });
  },

  async getHouseholdDetails(householdId: string, requestingUserId: string) {
    await assertMember(householdId, requestingUserId);

    return prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberProfiles: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        invites: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  },

  async renameHousehold(householdId: string, ownerUserId: string, name: string, ctx: ActorCtx) {
    await assertOwner(householdId, ownerUserId);

    return audited({
      db: prisma,
      ctx,
      action: AuditAction.UPDATE_HOUSEHOLD,
      resource: "household",
      resourceId: householdId,
      beforeFetch: async (tx) =>
        tx.household.findUnique({ where: { id: householdId } }) as Promise<Record<
          string,
          unknown
        > | null>,
      mutation: async (tx) => tx.household.update({ where: { id: householdId }, data: { name } }),
    });
  },

  // ─── Members ───────────────────────────────────────────────────────────────

  async removeMember(householdId: string, ownerUserId: string, memberId: string, ctx: ActorCtx) {
    await assertOwner(householdId, ownerUserId);
    const target = await prisma.member.findUnique({ where: { id: memberId } });
    if (!target || target.householdId !== householdId) {
      throw new NotFoundError("Member not found");
    }
    if (target.userId === ownerUserId) {
      throw new ValidationError("Owner cannot remove themselves from the household");
    }

    await audited({
      db: prisma,
      ctx,
      action: AuditAction.REMOVE_MEMBER,
      resource: "household-member",
      resourceId: memberId,
      beforeFetch: async (tx) =>
        tx.member.findUnique({ where: { id: memberId } }) as Promise<Record<
          string,
          unknown
        > | null>,
      mutation: async (tx) => tx.member.delete({ where: { id: memberId } }),
    });

    // Clear stale activeHouseholdId if the removed member had a linked user
    if (target.userId) {
      const user = await prisma.user.findUnique({
        where: { id: target.userId },
        select: { activeHouseholdId: true },
      });
      if (user?.activeHouseholdId === householdId) {
        const otherMembership = await prisma.member.findFirst({
          where: { userId: target.userId },
          orderBy: { joinedAt: "asc" },
        });
        await prisma.user.update({
          where: { id: target.userId },
          data: { activeHouseholdId: otherMembership?.householdId ?? null },
        });
      }
    }
  },

  async leaveHousehold(householdId: string, userId: string, ctx: ActorCtx) {
    const member = await prisma.member.findFirst({
      where: { householdId, userId },
    });
    if (!member) throw new NotFoundError("You are not a member of this household");

    if (member.role === "owner") {
      const ownerCount = await prisma.member.count({
        where: { householdId, role: "owner" },
      });
      if (ownerCount <= 1) {
        throw new ValidationError("You are the sole owner of this household and cannot leave");
      }
    }

    await audited({
      db: prisma,
      ctx,
      action: AuditAction.LEAVE_HOUSEHOLD,
      resource: "household-member",
      resourceId: member.id,
      beforeFetch: async (tx) =>
        tx.member.findUnique({ where: { id: member.id } }) as Promise<Record<
          string,
          unknown
        > | null>,
      mutation: async (tx) => tx.member.delete({ where: { id: member.id } }),
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activeHouseholdId: true },
    });

    if (user?.activeHouseholdId === householdId) {
      const otherMembership = await prisma.member.findFirst({
        where: { userId },
        orderBy: { joinedAt: "asc" },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { activeHouseholdId: otherMembership?.householdId ?? null },
      });
    }
  },

  // ─── Invites ───────────────────────────────────────────────────────────────

  async inviteMember(
    householdId: string,
    ownerUserId: string,
    email: string,
    role: "member" | "admin" = "member",
    ctx: ActorCtx
  ) {
    const callerMembership = await prisma.member.findFirst({
      where: { householdId, userId: ownerUserId },
    });
    if (!callerMembership) throw new AuthorizationError("Not a member of this household");
    assertOwnerOrAdmin(callerMembership.role);

    const household = await prisma.household.findUnique({ where: { id: householdId } });
    if (!household) throw new NotFoundError("Household not found");

    const normalizedEmail = normalizeEmail(email)!;

    const existingMember = await prisma.member.findFirst({
      where: {
        householdId,
        user: { email: normalizedEmail },
      },
    });

    if (existingMember) {
      throw new ConflictError("A user with this email is already a member of this household");
    }

    const existingInvite = await prisma.householdInvite.findFirst({
      where: {
        householdId,
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      throw new ConflictError("An active invite already exists for this email");
    }

    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

    await audited({
      db: prisma,
      ctx,
      action: AuditAction.INVITE_MEMBER,
      resource: "household-invite",
      resourceId: tokenHash,
      beforeFetch: async () => null,
      mutation: async (tx) =>
        tx.householdInvite.create({
          data: {
            householdId,
            email: normalizedEmail,
            tokenHash,
            expiresAt,
            createdByUserId: ownerUserId,
            intendedRole: role,
          },
        }),
    });

    return { token: rawToken, email: normalizedEmail };
  },

  async cancelInvite(householdId: string, ownerUserId: string, inviteId: string, ctx: ActorCtx) {
    await assertOwner(householdId, ownerUserId);

    const invite = await prisma.householdInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.householdId !== householdId) throw new NotFoundError("Invite not found");

    await audited({
      db: prisma,
      ctx,
      action: AuditAction.CANCEL_INVITE,
      resource: "household-invite",
      resourceId: inviteId,
      beforeFetch: async (tx) =>
        tx.householdInvite.findUnique({ where: { id: inviteId } }) as Promise<Record<
          string,
          unknown
        > | null>,
      mutation: async (tx) => tx.householdInvite.delete({ where: { id: inviteId } }),
    });
  },

  // ─── Invite acceptance ─────────────────────────────────────────────────────

  async validateInviteToken(token: string) {
    const tokenHash = hashInviteToken(token);
    const invite = await prisma.householdInvite.findUnique({
      where: { tokenHash },
      include: { household: { select: { id: true, name: true } } },
    });

    if (!invite) throw new NotFoundError("Invalid invitation link");
    if (invite.usedAt) throw new ValidationError("This invitation has already been used");
    if (invite.expiresAt < new Date()) throw new ValidationError("This invitation has expired");

    return invite;
  },

  /** New user accepts an invite — creates account + joins household */
  async acceptInvite(
    token: string,
    newUser: { name: string; email: string; password: string },
    requestCtx?: { ipAddress?: string; userAgent?: string }
  ) {
    const invite = await this.validateInviteToken(token);
    const normalizedEmail = normalizeEmail(newUser.email);

    // Validate password (mirrors authService rules)
    if (newUser.password.length < 12) {
      throw new ValidationError("Password must be at least 12 characters long");
    }

    if (normalizedEmail !== invite.email) {
      throw new ValidationError("This invite must be used with the invited email address");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail! },
    });
    if (existingUser) {
      throw new ConflictError(
        "An account with this email already exists. Please log in and use the join link instead."
      );
    }

    const passwordHash = await hashPassword(newUser.password);

    // Create user + personal household in a transaction
    const { user, personalHouseholdId } = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail!,
          passwordHash,
          name: newUser.name,
          preferences: {
            currency: "GBP",
            dateFormat: "DD/MM/YYYY",
            theme: "dark",
            defaultInflationRate: 2.5,
          },
        },
      });

      // Personal household
      const personal = await tx.household.create({
        data: {
          name: `${newUser.name}'s Household`,
        },
      });
      try {
        await tx.member.create({
          data: {
            householdId: personal.id,
            userId: created.id,
            name: newUser.name,
            role: "owner",
          },
        });
      } catch (err: any) {
        if (err?.code === "P2002") {
          throw new ConflictError("A member with that name already exists in this household");
        }
        throw err;
      }
      await tx.householdSettings.create({ data: { householdId: personal.id } });

      // Join the invited household and set it as active
      try {
        await tx.member.create({
          data: {
            householdId: invite.householdId,
            userId: created.id,
            name: newUser.name,
            role: invite.intendedRole ?? "member",
          },
        });
      } catch (err: any) {
        if (err?.code === "P2002") {
          throw new ConflictError("A member with that name already exists in this household");
        }
        throw err;
      }

      const updated = await tx.user.update({
        where: { id: created.id },
        data: { activeHouseholdId: invite.householdId },
      });

      // Mark invite used
      await tx.householdInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });

      // Audit the acceptance — actor is the newly created user
      await (tx as any).auditLog.create({
        data: {
          householdId: invite.householdId,
          actorId: created.id,
          actorName: newUser.name,
          ipAddress: requestCtx?.ipAddress,
          userAgent: requestCtx?.userAgent,
          action: AuditAction.ACCEPT_INVITE,
          resource: "household-invite",
          resourceId: invite.id,
          changes: [],
        },
      });

      return { user: updated, personalHouseholdId: personal.id };
    });

    await subcategoryService.seedDefaults(personalHouseholdId);

    // Generate auth tokens
    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id });
    const now = new Date();
    const familyId = generateTokenFamily();

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: new Date(now.getTime() + IDLE_SESSION_MS),
        sessionExpiresAt: new Date(now.getTime() + ABSOLUTE_SESSION_MS),
        rememberMe: false,
      },
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, accessToken, refreshToken };
  },

  /** Existing logged-in user joins a household via invite */
  async joinViaInvite(token: string, existingUserId: string, ctx?: ActorCtx) {
    const invite = await this.validateInviteToken(token);

    const user = await prisma.user.findUnique({ where: { id: existingUserId } });
    if (!user) throw new NotFoundError("User not found");

    if (normalizeEmail(user.email) !== invite.email) {
      throw new ValidationError(
        "This invite is for a different email address. Please sign in with the invited account."
      );
    }

    const existing = await prisma.member.findFirst({
      where: { householdId: invite.householdId, userId: existingUserId },
    });
    if (existing) throw new ConflictError("You are already a member of this household");

    // Override householdId so the audit lands in the invited household, not the actor's current one
    const auditCtx = ctx ? { ...ctx, householdId: invite.householdId } : undefined;

    try {
      if (auditCtx) {
        await audited({
          db: prisma,
          ctx: auditCtx,
          action: AuditAction.JOIN_VIA_INVITE,
          resource: "household-member",
          resourceId: existingUserId,
          beforeFetch: async () => null,
          mutation: async (tx) => {
            const member = await tx.member.create({
              data: {
                householdId: invite.householdId,
                userId: existingUserId,
                name: user.name,
                role: invite.intendedRole ?? "member",
              },
            });
            await tx.user.update({
              where: { id: existingUserId },
              data: { activeHouseholdId: invite.householdId },
            });
            await tx.householdInvite.update({
              where: { id: invite.id },
              data: { usedAt: new Date() },
            });
            return member;
          },
        });
      } else {
        await prisma.$transaction([
          prisma.member.create({
            data: {
              householdId: invite.householdId,
              userId: existingUserId,
              name: user.name,
              role: invite.intendedRole ?? "member",
            },
          }),
          prisma.user.update({
            where: { id: existingUserId },
            data: { activeHouseholdId: invite.householdId },
          }),
          prisma.householdInvite.update({
            where: { id: invite.id },
            data: { usedAt: new Date() },
          }),
        ]);
      }
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A member with that name already exists in this household");
      }
      throw err;
    }

    return invite.household;
  },

  async delete(householdId: string, ctx: ActorCtx) {
    await assertOwner(householdId, ctx.actorId);
    return prisma.$transaction(async (tx) => {
      const [members, assets, accounts, income, committed, discretionary, snapshots, goals] =
        await Promise.all([
          tx.member.count({ where: { householdId } }),
          tx.asset.count({ where: { householdId } }),
          tx.account.count({ where: { householdId } }),
          tx.incomeSource.count({ where: { householdId } }),
          tx.committedItem.count({ where: { householdId } }),
          tx.discretionaryItem.count({ where: { householdId } }),
          tx.snapshot.count({ where: { householdId } }),
          tx.purchaseItem.count({ where: { householdId } }),
        ]);

      await tx.auditLog.create({
        data: {
          householdId: ctx.householdId,
          actorId: ctx.actorId,
          actorName: ctx.actorName,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          action: AuditAction.DELETE_HOUSEHOLD,
          resource: "household",
          resourceId: householdId,
          metadata: {
            cascaded: {
              members,
              assets,
              accounts,
              income,
              committed,
              discretionary,
              snapshots,
              goals,
            },
          },
        },
      });

      await tx.household.delete({ where: { id: householdId } });
    });
  },
};
