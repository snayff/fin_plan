import { FastifyInstance } from "fastify";
import { householdService, updateMemberRole } from "../services/household.service";
import { authMiddleware, userOnlyAuth } from "../middleware/auth.middleware";
import { prisma } from "../config/database.js";
import { memberService } from "../services/member.service.js";
import {
  createHouseholdSchema,
  createHouseholdInviteSchema,
  renameHouseholdSchema,
  updateMemberRoleSchema,
  createMemberSchema,
  updateMemberSchema,
  deleteMemberSchema,
} from "@finplan/shared";
import { AuthorizationError, NotFoundError } from "../utils/errors.js";
import { actorCtx } from "../lib/actor-ctx.js";
import { exportImportRoutes } from "./export-import.routes.js";

/**
 * Asserts that the household id supplied in the URL matches the caller's
 * active household resolved by authMiddleware. Data scoping must never trust
 * URL params; a mismatch is masked as NotFoundError so resource existence is
 * not revealed to callers outside the household.
 */
function assertActiveHousehold(urlHouseholdId: string, activeHouseholdId: string | undefined) {
  if (!activeHouseholdId || urlHouseholdId !== activeHouseholdId) {
    throw new NotFoundError("Household not found");
  }
}

export async function householdRoutes(fastify: FastifyInstance) {
  // Co-locate the export/import household routes here so the entire household
  // URL-space is defined in one module. Sub-registered without a prefix, so the
  // emitted paths (/api/households/export, /import, …) are unchanged.
  await fastify.register(exportImportRoutes);

  // List all households the current user belongs to
  fastify.get("/households", { preHandler: [userOnlyAuth] }, async (request, reply) => {
    const userId = request.user!.userId;
    const memberships = await householdService.getUserHouseholds(userId);
    return reply.send({ households: memberships });
  });

  // Create a new household
  fastify.post("/households", { preHandler: [userOnlyAuth] }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = createHouseholdSchema.parse(request.body);
    const household = await householdService.createHousehold(userId, name);
    return reply.status(201).send({ household });
  });

  // Switch active household
  fastify.post(
    "/households/:id/switch",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      await householdService.switchHousehold(userId, id);
      return reply.send({ success: true });
    }
  );

  // Get household details (members + pending invites)
  fastify.get("/households/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const household = await householdService.getHouseholdDetails(id, userId);
    return reply.send({ household });
  });

  // Rename household (owner only)
  fastify.patch("/households/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const { name } = renameHouseholdSchema.parse(request.body);
    const household = await householdService.renameHousehold(id, userId, name, actorCtx(request));
    return reply.send({ household });
  });

  // Delete household (owner only) — cascades all household data
  fastify.delete("/households/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    await householdService.delete(request.householdId!, actorCtx(request));
    return reply.status(204).send();
  });

  // Invite a member (owner only) — rate limited: 5 invites per hour per household
  fastify.post(
    "/households/:id/invite",
    {
      preHandler: [authMiddleware],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
          keyGenerator: (req) => {
            const { id } = req.params as { id: string };
            return `invite_${id}`;
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { email, name, role } = createHouseholdInviteSchema.parse(request.body ?? {});
      const { token, email: invitedEmail } = await householdService.inviteMember(
        id,
        userId,
        email,
        name,
        role,
        actorCtx(request)
      );
      return reply.status(201).send({ token, invitedEmail });
    }
  );

  // Remove a member (owner only)
  fastify.delete(
    "/households/:id/members/:memberId",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id, memberId } = request.params as { id: string; memberId: string };
      await householdService.removeMember(id, userId, memberId, actorCtx(request));
      return reply.send({ success: true });
    }
  );

  // Cancel a pending invite (owner only)
  fastify.delete(
    "/households/:id/invites/:inviteId",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id, inviteId } = request.params as { id: string; inviteId: string };
      await householdService.cancelInvite(id, userId, inviteId, actorCtx(request));
      return reply.send({ success: true });
    }
  );

  // Leave household (self-removal)
  fastify.delete(
    "/households/:id/leave",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      await householdService.leaveHousehold(id, userId, actorCtx(request));
      return reply.send({ success: true });
    }
  );

  // Update a member's role (owner/admin only)
  fastify.patch(
    "/households/:householdId/members/:userId/role",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const callerId = request.user!.userId;
      const { householdId, userId: targetUserId } = request.params as {
        householdId: string;
        userId: string;
      };

      // Security: caller must belong to the active household matching the route param
      if (householdId !== request.householdId) {
        throw new AuthorizationError("Forbidden");
      }

      const { role: newRole } = updateMemberRoleSchema.parse(request.body);

      const updated = await updateMemberRole(
        prisma,
        { householdId, callerId, targetUserId, newRole },
        actorCtx(request)
      );
      return reply.send({ member: updated });
    }
  );

  // List member profiles for a household
  fastify.get(
    "/households/:id/member-profiles",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      assertActiveHousehold(id, request.householdId);
      const members = await memberService.listMembers(request.householdId!);
      return reply.send({ members });
    }
  );

  // Create a new member profile (owner only)
  fastify.post(
    "/households/:id/member-profiles",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      assertActiveHousehold(id, request.householdId);
      const data = createMemberSchema.parse(request.body);
      const member = await memberService.createMember(
        request.householdId!,
        userId,
        data,
        actorCtx(request)
      );
      return reply.status(201).send({ member });
    }
  );

  // Update a member profile (owner only)
  fastify.patch(
    "/households/:id/member-profiles/:memberId",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id, memberId } = request.params as { id: string; memberId: string };
      assertActiveHousehold(id, request.householdId);
      const data = updateMemberSchema.parse(request.body);
      const member = await memberService.updateMember(
        request.householdId!,
        userId,
        memberId,
        data,
        actorCtx(request)
      );
      return reply.send({ member });
    }
  );

  // Delete a member profile (owner only, with optional reassignment)
  fastify.delete(
    "/households/:id/member-profiles/:memberId",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id, memberId } = request.params as { id: string; memberId: string };
      assertActiveHousehold(id, request.householdId);
      const { reassignToMemberId } = deleteMemberSchema.parse(request.body ?? {});
      await memberService.deleteMember(
        request.householdId!,
        userId,
        memberId,
        actorCtx(request),
        reassignToMemberId
      );
      return reply.send({ success: true });
    }
  );
}
