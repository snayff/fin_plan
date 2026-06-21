import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { settingsService } from "../services/settings.service.js";
import { updateSettingsSchema } from "@finplan/shared";
import { actorCtx } from "../lib/actor-ctx.js";
import { assertOwnerOrAdmin } from "../services/household.service.js";

export async function settingsRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  fastify.get("/", pre, async (req, reply) => {
    const settings = await settingsService.getSettings(req.householdId!);
    return reply.send(settings);
  });

  fastify.patch("/", pre, async (req, reply) => {
    const data = updateSettingsSchema.parse(req.body);
    const growthRateFields = [
      "currentRatePct",
      "savingsRatePct",
      "investmentRatePct",
      "pensionRatePct",
      "inflationRatePct",
      "propertyRatePct",
      "vehicleRatePct",
      "otherAssetRatePct",
    ] as const;
    const hasGrowthRateChange = growthRateFields.some((f) => f in (req.body as object));
    if (hasGrowthRateChange) {
      // This route is active-household-scoped (req.householdId), so the role the
      // auth middleware attached is the caller's role for this household — use it
      // directly rather than issuing a fresh member lookup.
      assertOwnerOrAdmin(req.user!.role);
    }
    const settings = await settingsService.updateSettings(req.householdId!, data, actorCtx(req));
    return reply.send(settings);
  });
}
