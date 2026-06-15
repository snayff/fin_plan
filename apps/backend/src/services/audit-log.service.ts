import type { PrismaClient } from "@prisma/client";
import type { AuditLogQuery, AuditChange, AuditEntry, AuditLogResponse } from "@finplan/shared";
import { filterChanges } from "./audit.service";
import { ValidationError } from "../utils/errors.js";

// Foreign-key fields whose raw UUID values we replace with a human-readable
// label (usually the target row's name) at read time. Keeping resolution on
// the read side avoids bloating stored rows and stays correct if the target
// is later renamed.
const FK_RESOLVERS: Record<string, { model: string; label: string }> = {
  linkedAccountId: { model: "account", label: "name" },
  memberId: { model: "member", label: "name" },
  subcategoryId: { model: "subcategory", label: "name" },
  syncedDiscretionaryItemId: { model: "discretionaryItem", label: "name" },
  giftPersonId: { model: "giftPerson", label: "name" },
  giftEventId: { model: "giftEvent", label: "name" },
};

async function resolveFkLabels(
  db: PrismaClient,
  householdId: string,
  entries: Array<{ changes: AuditChange[] | null }>
): Promise<void> {
  // Collect { model -> set<id> } to batch-fetch.
  const idsByModel = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.changes) continue;
    for (const c of e.changes) {
      const resolver = FK_RESOLVERS[c.field];
      if (!resolver) continue;
      for (const v of [c.before, c.after]) {
        if (typeof v === "string" && v.length > 0) {
          const set = idsByModel.get(resolver.model) ?? new Set<string>();
          set.add(v);
          idsByModel.set(resolver.model, set);
        }
      }
    }
  }
  if (idsByModel.size === 0) return;

  // Batch-fetch label per model, scoped to household where the model supports it.
  const labelByModelId = new Map<string, Map<string, string>>();
  await Promise.all(
    Array.from(idsByModel.entries()).map(async ([model, ids]) => {
      const resolver = Object.values(FK_RESOLVERS).find((r) => r.model === model)!;
      const rows = (await (db as any)[model].findMany({
        where: { id: { in: Array.from(ids) }, householdId },
        select: { id: true, [resolver.label]: true },
      })) as Array<Record<string, string>>;
      const byId = new Map<string, string>();
      for (const row of rows) {
        const label = row[resolver.label];
        if (typeof row.id === "string" && typeof label === "string") byId.set(row.id, label);
      }
      labelByModelId.set(model, byId);
    })
  );

  // Rewrite UUID values in place with their resolved labels.
  for (const e of entries) {
    if (!e.changes) continue;
    for (const c of e.changes) {
      const resolver = FK_RESOLVERS[c.field];
      if (!resolver) continue;
      const byId = labelByModelId.get(resolver.model);
      const resolve = (v: unknown) =>
        typeof v === "string" && v.length > 0 ? (byId?.get(v) ?? "(deleted)") : v;
      if (c.before !== undefined) c.before = resolve(c.before);
      if (c.after !== undefined) c.after = resolve(c.after);
    }
  }
}

type QueryParams = AuditLogQuery & { householdId: string };

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") return null;
    return parsed as { createdAt: string; id: string };
  } catch {
    return null;
  }
}

export async function queryAuditLog(
  db: PrismaClient,
  params: QueryParams
): Promise<AuditLogResponse> {
  const { householdId, actorId, resource, dateFrom, dateTo, cursor, limit } = params;

  const where: Record<string, unknown> = { householdId };
  if (actorId) where.actorId = actorId;
  if (resource) where.resource = resource;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) throw new ValidationError("Invalid cursor");
    const { createdAt, id } = decoded;
    Object.assign(where, {
      OR: [
        { createdAt: { lt: new Date(createdAt) } },
        { createdAt: new Date(createdAt), id: { lt: id } },
      ],
    });
  }

  // Fetch limit+1 to detect if there's a next page
  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      actorName: true,
      action: true,
      resource: true,
      resourceId: true,
      changes: true,
      createdAt: true,
    },
  });

  const hasNext = rows.length > limit;
  const entries = rows.slice(0, limit);
  const lastEntry = entries[entries.length - 1];

  const nextCursor = hasNext && lastEntry ? encodeCursor(lastEntry.createdAt, lastEntry.id) : null;

  const mapped = entries.map((e) => ({
    id: e.id,
    actorName: e.actorName ?? null,
    action: e.action ?? "",
    resource: e.resource ?? "",
    resourceId: e.resourceId ?? null,
    changes: Array.isArray(e.changes)
      ? filterChanges(e.changes as NonNullable<AuditEntry["changes"]>, e.resource ?? undefined)
      : null,
    createdAt: e.createdAt.toISOString(),
  }));

  await resolveFkLabels(db, householdId, mapped);

  return { entries: mapped, nextCursor };
}
