import type { FastifyInstance, FastifyRequest } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { waterfallService } from "../services/waterfall.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import { snapshotService } from "../services/snapshot.service.js";
import { subcategoryService } from "../services/subcategory.service.js";
import {
  createIncomeSourceSchema,
  updateIncomeSourceSchema,
  createCommittedItemSchema,
  updateCommittedItemSchema,
  createDiscretionaryItemSchema,
  updateDiscretionaryItemSchema,
  confirmBatchSchema,
  deleteAllWaterfallSchema,
  WaterfallTierEnum,
  createPeriodSchema,
  updatePeriodSchema,
  batchSaveSubcategoriesSchema,
  resetSubcategoriesSchema,
  createSubcategorySchema,
} from "@finplan/shared";
import { periodService } from "../services/period.service.js";
import { prisma } from "../config/database.js";
import { NotFoundError } from "../utils/errors.js";

export async function waterfallRoutes(fastify: FastifyInstance) {
  const pre = {
    preHandler: [
      authMiddleware,
      async (request: FastifyRequest) => {
        if (["POST", "PATCH", "DELETE"].includes(request.method) && request.householdId) {
          await snapshotService.ensureBaselineSnapshot(request.householdId).catch(() => {});
        }
      },
    ],
  };

  const preMutation = {
    ...pre,
    config: { rateLimit: { max: 30, timeWindow: "15 minutes" } },
  };

  fastify.addHook("onResponse", async (request, reply) => {
    if (
      ["POST", "PATCH", "DELETE"].includes(request.method) &&
      reply.statusCode < 300 &&
      request.householdId
    ) {
      snapshotService.ensureTodayAutoSnapshot(request.householdId).catch(() => {});
    }
  });

  // ─── Summary ──────────────────────────────────────────────────────────────

  fastify.get("/", pre, async (req, reply) => {
    const householdId = req.householdId!;
    // Auto Jan 1 snapshot — fires once on first load of the new year
    snapshotService.ensureJan1Snapshot(householdId).catch(() => {});
    const summary = await waterfallService.getWaterfallSummary(householdId);
    return reply.send(summary);
  });

  fastify.get("/financial-summary", pre, async (req, reply) => {
    const summary = await snapshotService.getFinancialSummary(req.householdId!);
    return reply.send(summary);
  });

  // ─── Income ───────────────────────────────────────────────────────────────

  fastify.get("/income", pre, async (req, reply) => {
    const sources = await waterfallService.listIncome(req.householdId!);
    return reply.send(sources);
  });

  fastify.post("/income", preMutation, async (req, reply) => {
    const data = createIncomeSourceSchema.parse(req.body);
    // The item and its opening period are created atomically (#130).
    const source = await waterfallService.createIncome(req.householdId!, data, actorCtx(req), {
      startDate: data.startDate ?? new Date(),
      endDate: data.endDate,
      amount: data.amount,
    });
    return reply.status(201).send(source);
  });

  fastify.patch("/income/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updateIncomeSourceSchema.parse(req.body);
    const source = await waterfallService.updateIncome(req.householdId!, id, data, actorCtx(req));
    return reply.send(source);
  });

  fastify.delete("/income/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    await waterfallService.deleteIncome(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });

  fastify.post("/income/:id/confirm", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const source = await waterfallService.confirmIncome(req.householdId!, id, actorCtx(req));
    return reply.send(source);
  });

  // ─── Committed bills ──────────────────────────────────────────────────────

  fastify.get("/committed", pre, async (req, reply) => {
    const bills = await waterfallService.listCommitted(req.householdId!);
    return reply.send(bills);
  });

  fastify.post("/committed", preMutation, async (req, reply) => {
    const data = createCommittedItemSchema.parse(req.body);
    const bill = await waterfallService.createCommitted(req.householdId!, data, actorCtx(req), {
      startDate: data.startDate ?? new Date(),
      endDate: data.endDate,
      amount: data.amount,
    });
    return reply.status(201).send(bill);
  });

  fastify.patch("/committed/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updateCommittedItemSchema.parse(req.body);
    const bill = await waterfallService.updateCommitted(req.householdId!, id, data, actorCtx(req));
    return reply.send(bill);
  });

  fastify.delete("/committed/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    await waterfallService.deleteCommitted(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });

  fastify.post("/committed/:id/confirm", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const bill = await waterfallService.confirmCommitted(req.householdId!, id, actorCtx(req));
    return reply.send(bill);
  });

  // ─── Yearly bills ─────────────────────────────────────────────────────────

  fastify.get("/yearly", pre, async (req, reply) => {
    const bills = await waterfallService.listYearly(req.householdId!);
    return reply.send(bills);
  });

  fastify.post("/yearly", preMutation, async (req, reply) => {
    const data = createCommittedItemSchema.parse(req.body);
    const bill = await waterfallService.createYearly(req.householdId!, data, actorCtx(req), {
      startDate: data.startDate ?? new Date(),
      endDate: data.endDate,
      amount: data.amount,
    });
    return reply.status(201).send(bill);
  });

  fastify.patch("/yearly/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updateCommittedItemSchema.parse(req.body);
    const bill = await waterfallService.updateYearly(req.householdId!, id, data, actorCtx(req));
    return reply.send(bill);
  });

  fastify.delete("/yearly/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    await waterfallService.deleteYearly(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });

  fastify.post("/yearly/:id/confirm", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const bill = await waterfallService.confirmYearly(req.householdId!, id, actorCtx(req));
    return reply.send(bill);
  });

  // ─── Discretionary ────────────────────────────────────────────────────────

  fastify.get("/discretionary", pre, async (req, reply) => {
    const cats = await waterfallService.listDiscretionary(req.householdId!);
    return reply.send(cats);
  });

  fastify.post("/discretionary", preMutation, async (req, reply) => {
    const data = createDiscretionaryItemSchema.parse(req.body);
    const cat = await waterfallService.createDiscretionary(req.householdId!, data, actorCtx(req), {
      startDate: data.startDate ?? new Date(),
      endDate: data.endDate,
      amount: data.amount,
    });
    return reply.status(201).send(cat);
  });

  fastify.patch("/discretionary/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updateDiscretionaryItemSchema.parse(req.body);
    const cat = await waterfallService.updateDiscretionary(
      req.householdId!,
      id,
      data,
      actorCtx(req)
    );
    return reply.send(cat);
  });

  fastify.delete("/discretionary/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    await waterfallService.deleteDiscretionary(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });

  fastify.post("/discretionary/:id/confirm", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cat = await waterfallService.confirmDiscretionary(req.householdId!, id, actorCtx(req));
    return reply.send(cat);
  });

  // ─── Savings allocations ──────────────────────────────────────────────────

  fastify.get("/savings", pre, async (req, reply) => {
    const allocs = await waterfallService.listSavings(req.householdId!);
    return reply.send(allocs);
  });

  fastify.post("/savings", preMutation, async (req, reply) => {
    const data = createDiscretionaryItemSchema.parse(req.body);
    const alloc = await waterfallService.createSavings(req.householdId!, data, actorCtx(req), {
      startDate: data.startDate ?? new Date(),
      endDate: data.endDate,
      amount: data.amount,
    });
    return reply.status(201).send(alloc);
  });

  fastify.patch("/savings/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updateDiscretionaryItemSchema.parse(req.body);
    const alloc = await waterfallService.updateSavings(req.householdId!, id, data, actorCtx(req));
    return reply.send(alloc);
  });

  fastify.delete("/savings/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    await waterfallService.deleteSavings(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });

  fastify.post("/savings/:id/confirm", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const alloc = await waterfallService.confirmSavings(req.householdId!, id, actorCtx(req));
    return reply.send(alloc);
  });

  // ─── History ──────────────────────────────────────────────────────────────

  fastify.get("/history/:type/:id", pre, async (req, reply) => {
    const { type, id } = req.params as { type: string; id: string };
    const history = await waterfallService.getHistory(req.householdId!, type, id);
    return reply.send(history);
  });

  // ─── Batch + rebuild ──────────────────────────────────────────────────────

  fastify.post("/confirm-batch", preMutation, async (req, reply) => {
    const data = confirmBatchSchema.parse(req.body);
    await waterfallService.confirmBatch(req.householdId!, data, actorCtx(req));
    return reply.status(204).send();
  });

  fastify.delete("/all", preMutation, async (req, reply) => {
    deleteAllWaterfallSchema.parse(req.body);
    await waterfallService.deleteAll(req.householdId!);
    return reply.status(204).send();
  });

  // ─── Periods ──────────────────────────────────────────────────────────────

  fastify.get("/periods/:itemType/:itemId", pre, async (req, reply) => {
    const { itemType, itemId } = req.params as { itemType: string; itemId: string };
    await verifyItemOwnership(req.householdId!, itemType, itemId);
    const periods = await periodService.listPeriods(req.householdId!, itemType, itemId);
    return reply.send(periods);
  });

  fastify.post("/periods", preMutation, async (req, reply) => {
    const data = createPeriodSchema.parse(req.body);
    await verifyItemOwnership(req.householdId!, data.itemType, data.itemId);
    const period = await periodService.createPeriod(req.householdId!, data);
    return reply.status(201).send(period);
  });

  fastify.patch("/periods/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = updatePeriodSchema.parse(req.body);
    // Verify ownership via parent item
    const existing = await prisma.itemAmountPeriod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Period not found");
    await verifyItemOwnership(req.householdId!, existing.itemType, existing.itemId);
    const period = await periodService.updatePeriod(req.householdId!, id, data);
    return reply.send(period);
  });

  fastify.delete("/periods/:id", preMutation, async (req, reply) => {
    const { id } = req.params as { id: string };
    // Verify ownership via parent item
    const existing = await prisma.itemAmountPeriod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Period not found");
    await verifyItemOwnership(req.householdId!, existing.itemType, existing.itemId);
    const result = await periodService.deletePeriod(req.householdId!, id);
    if (result?.deleteItem) {
      switch (result.itemType) {
        case "income_source":
          await waterfallService.deleteIncome(req.householdId!, result.itemId!, actorCtx(req));
          break;
        case "committed_item":
          await waterfallService.deleteCommitted(req.householdId!, result.itemId!, actorCtx(req));
          break;
        case "discretionary_item":
          await waterfallService.deleteDiscretionary(
            req.householdId!,
            result.itemId!,
            actorCtx(req)
          );
          break;
      }
      return reply.status(200).send({ deleted: "item", itemId: result.itemId });
    }
    return reply.status(204).send();
  });

  // ─── Subcategories ─────────────────────────────────────────────────────────

  fastify.get("/subcategories/:tier", pre, async (req, reply) => {
    const { tier } = req.params as { tier: string };
    const parsedTier = WaterfallTierEnum.parse(tier);
    const householdId = req.householdId!;
    await subcategoryService.ensureSubcategories(householdId);
    const subcategories = await subcategoryService.listByTier(householdId, parsedTier);
    return reply.send(subcategories);
  });

  // ─── Subcategory mutations ──────────────────────────────────────────────────

  fastify.get("/subcategories/:tier/counts", pre, async (req, reply) => {
    const { tier } = req.params as { tier: string };
    const parsedTier = WaterfallTierEnum.parse(tier);
    const counts = await subcategoryService.getItemCounts(req.householdId!, parsedTier);
    return reply.send(counts);
  });

  fastify.put("/subcategories/:tier", preMutation, async (req, reply) => {
    const { tier } = req.params as { tier: string };
    const parsedTier = WaterfallTierEnum.parse(tier);
    const body = batchSaveSubcategoriesSchema.parse(req.body);
    await subcategoryService.batchSave(req.householdId!, parsedTier, body);
    const updated = await subcategoryService.listByTier(req.householdId!, parsedTier);
    return reply.send(updated);
  });

  fastify.post("/subcategories/:tier", preMutation, async (req, reply) => {
    const { tier } = req.params as { tier: string };
    const parsedTier = WaterfallTierEnum.parse(tier);
    const body = createSubcategorySchema.parse(req.body);
    const sub = await subcategoryService.create(
      req.householdId!,
      parsedTier,
      body.name,
      actorCtx(req)
    );
    return reply.status(201).send(sub);
  });

  fastify.post("/subcategories/reset", preMutation, async (req, reply) => {
    const body = resetSubcategoriesSchema.parse(req.body);
    await subcategoryService.resetToDefaults(req.householdId!, body);
    return reply.send({ success: true });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertOwned(item: { householdId: string } | null, householdId: string, label: string) {
  if (!item) throw new NotFoundError(`${label} not found`);
  if (item.householdId !== householdId) throw new NotFoundError(`${label} not found`);
}

async function verifyItemOwnership(householdId: string, itemType: string, itemId: string) {
  switch (itemType) {
    case "income_source": {
      const item = await prisma.incomeSource.findUnique({
        where: { id: itemId },
      });
      assertOwned(item, householdId, "Income source");
      break;
    }
    case "committed_item": {
      const item = await prisma.committedItem.findUnique({
        where: { id: itemId },
      });
      assertOwned(item, householdId, "Committed item");
      break;
    }
    case "discretionary_item": {
      const item = await prisma.discretionaryItem.findUnique({
        where: { id: itemId },
      });
      assertOwned(item, householdId, "Discretionary item");
      break;
    }
    default:
      throw new NotFoundError("Unknown item type");
  }
}
