import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { assetsService } from "../services/assets.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import {
  createAssetSchema,
  updateAssetSchema,
  recordAssetBalanceSchema,
  createAccountSchema,
  updateAccountSchema,
  recordAccountBalanceSchema,
  assetTypeSchema,
  accountTypeSchema,
  idParamSchema,
} from "@finplan/shared";

export async function assetsRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  // Summary
  fastify.get("/summary", pre, async (req, reply) => {
    const summary = await assetsService.getSummary(req.householdId!);
    return reply.send(summary);
  });

  // ── Assets ────────────────────────────────────────────────────────────────

  fastify.get("/assets/:type", pre, async (req, reply) => {
    const { type } = req.params as { type: string };
    const { disposed } = (req.query ?? {}) as { disposed?: string };
    const parsed = assetTypeSchema.parse(type);
    const items = await assetsService.listAssetsByType(req.householdId!, parsed, {
      includeDisposed: disposed === "true",
    });
    return reply.send(items);
  });

  fastify.post("/assets", pre, async (req, reply) => {
    const data = createAssetSchema.parse(req.body);
    const asset = await assetsService.createAsset(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(asset);
  });

  fastify.patch("/assets/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const data = updateAssetSchema.parse(req.body);
    const asset = await assetsService.updateAsset(req.householdId!, id, data, actorCtx(req));
    return reply.send(asset);
  });

  fastify.delete("/assets/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const result = await assetsService.deleteAsset(req.householdId!, id, actorCtx(req));
    return reply.send(result);
  });

  fastify.post("/assets/:id/balance", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const data = recordAssetBalanceSchema.parse(req.body);
    const balance = await assetsService.recordAssetBalance(
      req.householdId!,
      id,
      data,
      actorCtx(req)
    );
    return reply.status(201).send(balance);
  });

  fastify.post("/assets/:id/confirm", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const result = await assetsService.confirmAsset(req.householdId!, id, actorCtx(req));
    return reply.send(result);
  });

  // ── Accounts ──────────────────────────────────────────────────────────────

  fastify.get("/accounts/isa-allowance", pre, async (req, reply) => {
    const summary = await assetsService.getIsaAllowanceSummary(req.householdId!);
    return reply.send(summary);
  });

  fastify.get("/accounts/:type", pre, async (req, reply) => {
    const { type } = req.params as { type: string };
    const { disposed } = (req.query ?? {}) as { disposed?: string };
    const parsed = accountTypeSchema.parse(type);
    const items = await assetsService.listAccountsByType(req.householdId!, parsed, {
      includeDisposed: disposed === "true",
    });
    return reply.send(items);
  });

  fastify.post("/accounts", pre, async (req, reply) => {
    const data = createAccountSchema.parse(req.body);
    const account = await assetsService.createAccount(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(account);
  });

  fastify.patch("/accounts/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const data = updateAccountSchema.parse(req.body);
    const account = await assetsService.updateAccount(
      req.householdId!,
      id,
      data,
      actorCtx(req)
    );
    return reply.send(account);
  });

  fastify.delete("/accounts/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const result = await assetsService.deleteAccount(req.householdId!, id, actorCtx(req));
    return reply.send(result);
  });

  fastify.post("/accounts/:id/balance", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const data = recordAccountBalanceSchema.parse(req.body);
    const balance = await assetsService.recordAccountBalance(
      req.householdId!,
      id,
      data,
      actorCtx(req)
    );
    return reply.status(201).send(balance);
  });

  fastify.post("/accounts/:id/confirm", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const result = await assetsService.confirmAccount(req.householdId!, id, actorCtx(req));
    return reply.send(result);
  });
}
