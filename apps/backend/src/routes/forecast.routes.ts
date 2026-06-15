import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { forecastService } from "../services/forecast.service.js";
import { ForecastQuerySchema } from "@finplan/shared";

export async function forecastRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  fastify.get("/", pre, async (req, reply) => {
    const { horizonYears } = ForecastQuerySchema.parse(req.query);
    const projection = await forecastService.getProjections(req.householdId!, horizonYears);
    return reply.send(projection);
  });
}
