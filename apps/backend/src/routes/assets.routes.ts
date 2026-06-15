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
  listDisposedQuerySchema,
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
    const { disposed } = listDisposedQuerySchema.parse(req.query ?? {});
    const parsed = assetTypeSchema.parse(type);
    const items = await assetsService.listAssetsByType(req.householdId!, parsed, {
      includeDisposed: disposed,
    });
    return reply.send(items);
  });

  fastify.post("/assets", pre, async (req, reply) => {
    const data = createAssetSchema.parse(req.body);
    const asset = await assetsService.createAsset(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(asset);
  });

  fastify.patch("/assets/:assetId", pre, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const data = updateAssetSchema.parse(req.body);
    const asset = await assetsService.updateAsset(req.householdId!, assetId, data, actorCtx(req));
    return reply.send(asset);
  });

  fastify.delete("/assets/:assetId", pre, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const result = await assetsService.deleteAsset(req.householdId!, assetId, actorCtx(req));
    return reply.send(result);
  });

  fastify.post("/assets/:assetId/balance", pre, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const data = recordAssetBalanceSchema.parse(req.body);
    const balance = await assetsService.recordAssetBalance(
      req.householdId!,
      assetId,
      data,
      actorCtx(req)
    );
    return reply.status(201).send(balance);
  });

  fastify.post("/assets/:assetId/confirm", pre, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const result = await assetsService.confirmAsset(req.householdId!, assetId, actorCtx(req));
    return reply.send(result);
  });

  // ── Accounts ──────────────────────────────────────────────────────────────

  fastify.get("/accounts/isa-allowance", pre, async (req, reply) => {
    const summary = await assetsService.getIsaAllowanceSummary(req.householdId!);
    return reply.send(summary);
  });

  fastify.get("/accounts/:type", pre, async (req, reply) => {
    const { type } = req.params as { type: string };
    const { disposed } = listDisposedQuerySchema.parse(req.query ?? {});
    const parsed = accountTypeSchema.parse(type);
    const items = await assetsService.listAccountsByType(req.householdId!, parsed, {
      includeDisposed: disposed,
    });
    return reply.send(items);
  });

  fastify.post("/accounts", pre, async (req, reply) => {
    const data = createAccountSchema.parse(req.body);
    const account = await assetsService.createAccount(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(account);
  });

  fastify.patch("/accounts/:accountId", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const data = updateAccountSchema.parse(req.body);
    const account = await assetsService.updateAccount(
      req.householdId!,
      accountId,
      data,
      actorCtx(req)
    );
    return reply.send(account);
  });

  fastify.delete("/accounts/:accountId", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const result = await assetsService.deleteAccount(req.householdId!, accountId, actorCtx(req));
    return reply.send(result);
  });

  fastify.post("/accounts/:accountId/balance", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const data = recordAccountBalanceSchema.parse(req.body);
    const balance = await assetsService.recordAccountBalance(
      req.householdId!,
      accountId,
      data,
      actorCtx(req)
    );
    return reply.status(201).send(balance);
  });

  fastify.post("/accounts/:accountId/confirm", pre, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const result = await assetsService.confirmAccount(req.householdId!, accountId, actorCtx(req));
    return reply.send(result);
  });
}
