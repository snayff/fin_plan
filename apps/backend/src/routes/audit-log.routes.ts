import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { prisma } from "../config/database.js";
import { queryAuditLog } from "../services/audit-log.service.js";
import { assertOwnerOrAdmin } from "../services/household.service.js";
import { AuditLogQuerySchema } from "@finplan/shared";

export async function auditLogRoutes(app: FastifyInstance) {
  app.get("/audit-log", { preHandler: [authMiddleware] }, async (request, reply) => {
    const householdId = request.householdId!;

    // The auth middleware has already resolved the caller's role for the active
    // household (this route is active-household-scoped via request.householdId),
    // so use it directly rather than issuing a fresh member lookup.
    assertOwnerOrAdmin(request.user!.role);

    const query = AuditLogQuerySchema.parse(request.query);

    const result = await queryAuditLog(prisma, {
      householdId,
      ...query,
    });

    return reply.send(result);
  });
}
