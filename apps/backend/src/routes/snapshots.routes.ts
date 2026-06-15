import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { snapshotService } from "../services/snapshot.service.js";
import { actorCtx } from "../lib/actor-ctx.js";
import { createSnapshotSchema, renameSnapshotSchema, idParamSchema } from "@finplan/shared";

export async function snapshotRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  fastify.get("/", pre, async (req, reply) => {
    const snapshots = await snapshotService.listSnapshots(req.householdId!);
    return reply.send(snapshots);
  });

  fastify.get("/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const snapshot = await snapshotService.getSnapshot(req.householdId!, id);
    return reply.send(snapshot);
  });

  fastify.post("/", pre, async (req, reply) => {
    const data = createSnapshotSchema.parse(req.body);
    const snapshot = await snapshotService.createSnapshot(req.householdId!, data, actorCtx(req));
    return reply.status(201).send(snapshot);
  });

  fastify.patch("/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const data = renameSnapshotSchema.parse(req.body);
    const snapshot = await snapshotService.renameSnapshot(
      req.householdId!,
      id,
      data,
      actorCtx(req)
    );
    return reply.send(snapshot);
  });

  fastify.delete("/:id", pre, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    await snapshotService.deleteSnapshot(req.householdId!, id, actorCtx(req));
    return reply.status(204).send();
  });
}
