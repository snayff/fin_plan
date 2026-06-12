import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../utils/jwt";
import { isTokenBlacklisted } from "../utils/tokenBlacklist";
import { AuthenticationError } from "../utils/errors";
import { prisma } from "../config/database";

/**
 * Auth middleware to verify JWT token, attach user + householdId to request.
 * householdId is resolved from the user's persisted activeHouseholdId.
 */
export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError("No authorization token provided");
    }

    // Extract token from "Bearer <token>"
    const [bearer, token] = authHeader.split(" ");

    if (bearer !== "Bearer" || !token) {
      throw new AuthenticationError("Invalid authorization format. Use: Bearer <token>");
    }

    // Verify token
    const payload = verifyAccessToken(token);

    if (!payload.userId || typeof payload.userId !== "string") {
      throw new AuthenticationError("Invalid token payload");
    }

    // Check if this token has been revoked (e.g., on logout)
    if (payload.jti && (await isTokenBlacklisted(payload.jti))) {
      throw new AuthenticationError("Token has been revoked");
    }

    // Resolve active household from the database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, activeHouseholdId: true },
    });

    if (!user) {
      throw new AuthenticationError("User not found");
    }

    if (!user.activeHouseholdId) {
      throw new AuthenticationError("No active household — please contact support");
    }

    // Zero Trust: verify user is still a member of the active household
    const membership = await prisma.member.findFirst({
      where: {
        householdId: user.activeHouseholdId,
        userId: payload.userId,
      },
      select: { role: true },
    });

    if (!membership) {
      // Clear stale activeHouseholdId and reject
      const fallback = await prisma.member.findFirst({
        where: { userId: payload.userId },
        orderBy: { joinedAt: "asc" },
        select: { householdId: true },
      });
      await prisma.user.update({
        where: { id: payload.userId },
        data: { activeHouseholdId: fallback?.householdId ?? null },
      });
      throw new AuthenticationError("No longer a member of this household");
    }

    // Attach normalized user info + householdId to request
    request.user = {
      userId: payload.userId,
      email: user.email,
      name: user.name ?? "",
      role: membership.role,
    };
    request.householdId = user.activeHouseholdId;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError("Invalid or expired token");
  }
}

/**
 * Lightweight auth middleware — verifies JWT + user existence only.
 * Use for routes that don't require an active household (e.g. creating/listing households).
 */
export async function userOnlyAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError("No authorization token provided");
    }

    const [bearer, token] = authHeader.split(" ");

    if (bearer !== "Bearer" || !token) {
      throw new AuthenticationError("Invalid authorization format. Use: Bearer <token>");
    }

    const payload = verifyAccessToken(token);

    if (!payload.userId || typeof payload.userId !== "string") {
      throw new AuthenticationError("Invalid token payload");
    }

    if (payload.jti && (await isTokenBlacklisted(payload.jti))) {
      throw new AuthenticationError("Token has been revoked");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new AuthenticationError("User not found");
    }

    request.user = {
      userId: payload.userId,
      email: user.email,
      name: user.name ?? "",
      role: "",
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError("Invalid or expired token");
  }
}

/**
 * Type augmentation for Fastify request
 */
declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      name: string;
      role: string;
    };
    householdId?: string;
  }
}
