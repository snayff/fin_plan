import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { giftsService } from "../services/gifts.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import { ValidationError } from "../utils/errors.js";
import {
  createGiftPersonSchema,
  updateGiftPersonSchema,
  createGiftEventSchema,
  updateGiftEventSchema,
  upsertGiftAllocationSchema,
  bulkUpsertAllocationsSchema,
  setGiftBudgetSchema,
  setGiftPlannerModeSchema,
  idParamSchema,
} from "@finplan/shared";

function parseYear(raw: string | undefined): number {
  const y = raw ? parseInt(raw, 10) : new Date().getFullYear();
  if (isNaN(y) || y < 2000 || y > 2100) {
    throw new ValidationError("Invalid year");
  }
  return y;
}

export async function giftsRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  // ─── Reads ──────────────────────────────────────────────────────────────────

  fastify.get("/settings", pre, async (req, reply) => {
    const settings = await giftsService.getOrCreateSettings(req.householdId!);
    return reply.send({
      mode: settings.mode,
      syncedDiscretionaryItemId: settings.syncedDiscretionaryItemId,
    });
  });

  fastify.get("/state", pre, async (req, reply) => {
    const { year } = req.query as { year?: string };
    const y = parseYear(year);
    await giftsService.seedLockedEventsIfMissing(req.householdId!);
    await giftsService.runRolloverIfNeeded(req.householdId!, y);
    const state = await giftsService.getPlannerState(req.householdId!, y, req.user!.userId);
    return reply.send(state);
  });

  fastify.get("/people/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const { year } = req.query as { year?: string };
    const y = parseYear(year);
    const detail = await giftsService.getPersonDetail(req.householdId!, id, y);
    return reply.send(detail);
  });

  fastify.get("/upcoming", pre, async (req, reply) => {
    const { year } = req.query as { year?: string };
    const y = parseYear(year);
    const view = await giftsService.getUpcoming(req.householdId!, y);
    return reply.send(view);
  });

  fastify.get("/years", pre, async (req, reply) => {
    const years = await giftsService.listYearsWithData(req.householdId!);
    return reply.send(years);
  });

  fastify.get("/config/people", pre, async (req, reply) => {
    const { filter, year } = req.query as {
      filter?: "all" | "household" | "non-household";
      year?: string;
    };
    const y = parseYear(year);
    const list = await giftsService.listPeopleForConfig(req.householdId!, filter ?? "all", y);
    return reply.send(list);
  });

  fastify.get("/config/events", pre, async (req, reply) => {
    const list = await giftsService.listEventsForConfig(req.householdId!);
    return reply.send(list);
  });

  fastify.get("/config/quick-add-matrix", pre, async (req, reply) => {
    const { year } = req.query as { year?: string };
    const y = parseYear(year);
    const matrix = await giftsService.getQuickAddMatrix(req.householdId!, y);
    return reply.send(matrix);
  });

  // ─── People mutations ───────────────────────────────────────────────────────

  fastify.post("/people", pre, async (req, reply) => {
    const data = createGiftPersonSchema.parse(req.body);
    const person = await giftsService.createPerson(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(person);
  });

  fastify.patch("/people/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const data = updateGiftPersonSchema.parse(req.body);
    const person = await giftsService.updatePerson(req.householdId!, id, data, actorCtx(req));
    return reply.send(person);
  });

  fastify.delete("/people/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    await giftsService.deletePerson(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });

  // ─── Event mutations ────────────────────────────────────────────────────────

  fastify.post("/events", pre, async (req, reply) => {
    const data = createGiftEventSchema.parse(req.body);
    const event = await giftsService.createEvent(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(event);
  });

  fastify.patch("/events/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const data = updateGiftEventSchema.parse(req.body);
    const event = await giftsService.updateEvent(req.householdId!, id, data, actorCtx(req));
    return reply.send(event);
  });

  fastify.delete("/events/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    await giftsService.deleteEvent(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });

  // ─── Allocation mutations ───────────────────────────────────────────────────

  fastify.put("/allocations/:personId/:eventId/:year", pre, async (req, reply) => {
    const { personId, eventId, year } = req.params as {
      personId: string;
      eventId: string;
      year: string;
    };
    const data = upsertGiftAllocationSchema.parse(req.body);
    const y = parseYear(year);
    const result = await giftsService.upsertAllocation(
      req.householdId!,
      personId,
      eventId,
      y,
      data
    );
    return reply.send(result);
  });

  fastify.post("/allocations/bulk", pre, async (req, reply) => {
    const data = bulkUpsertAllocationsSchema.parse(req.body);
    const result = await giftsService.bulkUpsertAllocations(req.householdId!, data, actorCtx(req));
    return reply.send(result);
  });

  // ─── Budget + mode ──────────────────────────────────────────────────────────

  fastify.put("/budget/:year", pre, async (req, reply) => {
    const { year } = req.params as { year: string };
    const data = setGiftBudgetSchema.parse(req.body);
    const y = parseYear(year);
    const result = await giftsService.setAnnualBudget(req.householdId!, y, data);
    return reply.send(result);
  });

  fastify.put("/mode", pre, async (req, reply) => {
    const data = setGiftPlannerModeSchema.parse(req.body);
    const result = await giftsService.setMode(req.householdId!, data, actorCtx(req));
    return reply.send(result);
  });

  // ─── Rollover banner ────────────────────────────────────────────────────────

  fastify.delete("/rollover-banner/:year", pre, async (req, reply) => {
    const { year } = req.params as { year: string };
    const y = parseYear(year);
    await giftsService.dismissRolloverNotification(req.householdId!, req.user!.userId, y);
    return reply.status(204).send();
  });
}
