import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { exportService } from "../services/export.service.js";
import { importService } from "../services/import.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import { importOptionsSchema } from "@finplan/shared";

const FIVE_MB = 5 * 1024 * 1024;

export async function exportImportRoutes(fastify: FastifyInstance) {
  // Export household data (owner only — enforced inside exportService)
  fastify.get(
    "/households/export",
    {
      preHandler: [authMiddleware],
      config: {
        rateLimit: { max: 10, timeWindow: "1 hour" },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const data = await exportService.exportHousehold(
        request.householdId!,
        userId,
        actorCtx(request)
      );
      return reply.send(data);
    }
  );

  // Import household data
  // - overwrite mode: owner-of-target check enforced inside importService
  // - create_new mode: any authenticated user can create a fresh household
  fastify.post(
    "/households/import",
    {
      preHandler: [authMiddleware],
      bodyLimit: FIVE_MB,
      config: {
        rateLimit: { max: 10, timeWindow: "1 hour" },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { mode } = importOptionsSchema.parse(request.query);
      const result = await importService.importHousehold(
        request.householdId!,
        userId,
        request.body,
        mode,
        actorCtx(request)
      );
      return reply.send(result);
    }
  );

  // Restore from import backup (undo overwrite)
  fastify.post(
    "/households/import/restore/:backupId",
    {
      preHandler: [authMiddleware],
      config: {
        rateLimit: { max: 5, timeWindow: "1 hour" },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const householdId = request.householdId!;
      const { backupId } = request.params as { backupId: string };
      const result = await importService.restoreFromBackup(
        householdId,
        userId,
        backupId,
        actorCtx(request)
      );
      return reply.send(result);
    }
  );

  // Validate import file (no write, stateless)
  fastify.post(
    "/households/validate-import",
    {
      preHandler: [authMiddleware],
      bodyLimit: FIVE_MB,
      config: {
        rateLimit: { max: 30, timeWindow: "1 hour" },
      },
    },
    async (request, reply) => {
      const result = importService.validateImportData(request.body);
      return reply.send(result);
    }
  );
}
