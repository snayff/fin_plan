import type { FastifyInstance } from "fastify";
import { SearchQuerySchema } from "@finplan/shared";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { searchService } from "../services/search.service.js";

export async function searchRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  fastify.get("/", pre, async (req, reply) => {
    const { q } = SearchQuerySchema.parse(req.query);
    const result = await searchService.search(req.householdId!, q);
    return reply.send(result);
  });
}
