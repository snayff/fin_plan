import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { plannerService } from "../services/planner.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import { ValidationError } from "../utils/errors.js";
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  upsertYearBudgetSchema,
  yearSchema,
} from "@finplan/shared";

/**
 * Parse and validate a calendar-year input (query string or route param).
 * Rejects NaN / non-integer / out-of-range values with a 400 rather than
 * letting an unbounded year reach the database (#134).
 */
function parseYear(raw: string | undefined): number {
  const parsed = yearSchema.safeParse(raw === undefined ? undefined : Number(raw));
  if (!parsed.success) {
    throw new ValidationError("year must be a valid calendar year");
  }
  return parsed.data;
}

export async function plannerRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  // ─── Purchases ────────────────────────────────────────────────────────────

  fastify.get("/purchases", pre, async (req, reply) => {
    const { year } = req.query as { year?: string };
    const y = year ? parseYear(year) : new Date().getFullYear();
    const purchases = await plannerService.listPurchases(req.householdId!, y);
    return reply.send(purchases);
  });

  fastify.post("/purchases", pre, async (req, reply) => {
    const data = createPurchaseSchema.parse(req.body);
    const purchase = await plannerService.createPurchase(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(purchase);
  });

  fastify.patch("/purchases/:id", pre, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updatePurchaseSchema.parse(req.body);
    const purchase = await plannerService.updatePurchase(req.householdId!, id, data, actorCtx(req));
    return reply.send(purchase);
  });

  fastify.delete("/purchases/:id", pre, async (req, reply) => {
    const { id } = req.params as { id: string };
    await plannerService.deletePurchase(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });

  // ─── Year budget ──────────────────────────────────────────────────────────

  fastify.get("/budget/:year", pre, async (req, reply) => {
    const { year } = req.params as { year: string };
    const budget = await plannerService.getYearBudget(req.householdId!, parseYear(year));
    return reply.send(budget);
  });

  fastify.put("/budget/:year", pre, async (req, reply) => {
    const { year } = req.params as { year: string };
    const data = upsertYearBudgetSchema.parse(req.body);
    const budget = await plannerService.upsertYearBudget(
      req.householdId!,
      parseYear(year),
      data,
      actorCtx(req)
    );
    return reply.send(budget);
  });
}
