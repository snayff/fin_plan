import { FastifyInstance } from "fastify";
import { householdService } from "../services/household.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { acceptInviteSchema } from "@finplan/shared";
import { actorCtx } from "../lib/actor-ctx.js";
import { setRefreshTokenCookie } from "../lib/refresh-cookie.js";

function maskInviteEmail(email: string): string {
  const atIndex = email.indexOf("@");
  const localPart = atIndex >= 0 ? email.slice(0, atIndex) : email;
  const domain = atIndex >= 0 ? email.slice(atIndex + 1) : "";
  const visibleLocal = localPart.slice(0, 1);
  const maskedLocal = `${visibleLocal}${"*".repeat(Math.max(2, localPart.length - 1))}`;
  return `${maskedLocal}@${domain}`;
}

export async function inviteRoutes(fastify: FastifyInstance) {
  // Validate an invite token — returns household name and invited email
  // No auth required (used to show invite landing page before signup)
  fastify.get("/invite/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const invite = await householdService.validateInviteToken(token);
    return reply.send({
      householdId: invite.householdId,
      householdName: invite.household.name,
      emailRequired: Boolean(invite.email),
      maskedInvitedEmail: invite.email ? maskInviteEmail(invite.email) : null,
    });
  });

  // New user accepts invite — creates account and joins household
  // No auth required
  fastify.post("/invite/:token/accept", async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = acceptInviteSchema.parse(request.body);
    const result = await householdService.acceptInvite(token, body, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });

    // Set refresh token cookie via the shared helper so the cookie contract
    // (attributes + lifetime) stays defined in exactly one place. The invite flow
    // issues a persistent 7-day cookie, so opt into the remembered lifetime.
    setRefreshTokenCookie(reply, result.refreshToken, { rememberMe: true });

    return reply.status(201).send({
      user: result.user,
      accessToken: result.accessToken,
    });
  });

  // Existing logged-in user joins household via invite
  // Requires auth
  fastify.post("/invite/:token/join", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const userId = request.user!.userId;
    const household = await householdService.joinViaInvite(token, userId, actorCtx(request));
    return reply.send({ household });
  });
}
