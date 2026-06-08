import { prisma } from "../config/database";
import type { Prisma, PrismaClient } from "@prisma/client";

// Universal: every model carries these, never user-meaningful
const SYSTEM_FIELDS = new Set([
  "id",
  "householdId",
  "createdAt",
  "updatedAt",
  "sortOrder",
  "lastReviewedAt",
  "subcategoryId",
  "yearAdded",
  "tokenHash",
  "passwordHash",
  "twoFactorSecret",
  "twoFactorBackupCodes",
  "twoFactorEnabled", // future-proofs for 2FA endpoints
  "refreshToken",
  "token",
  "password",
  "email",
]);

// Per-resource: fields that exist on the row but the user does not directly drive
const RESOURCE_FIELD_DENYLIST: Record<string, Set<string>> = {
  "committed-item": new Set(["isPlannerOwned"]),
  "discretionary-item": new Set(["isPlannerOwned"]),
  "planner-goal": new Set(["scheduledThisYear"]),
};

export function isHiddenField(field: string, resource?: string): boolean {
  if (SYSTEM_FIELDS.has(field)) return true;
  if (resource && RESOURCE_FIELD_DENYLIST[resource]?.has(field)) return true;
  return false;
}

export function filterChanges<T extends { field: string }>(changes: T[], resource?: string): T[] {
  return changes.filter((c) => !isHiddenField(c.field, resource));
}

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Fire-and-forget audit logging.
 * Writes are non-blocking — failures are logged but never throw to callers.
 */
export const auditService = {
  log(entry: AuditLogEntry): void {
    prisma.auditLog.create({ data: entry }).catch((err) => {
      console.error("Audit log write failed:", err);
    });
  },
};

// ── transactional wrapper ─────────────────────────────────────────────────────

export type ActorCtx = {
  householdId: string;
  actorId: string;
  actorName: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditChange = {
  field: string;
  before?: unknown;
  after?: unknown;
};

const FLAT_JSON_ALLOWLIST: Record<string, Set<string>> = {
  "household-settings": new Set(["stalenessThresholds"]),
};

function isFlatJsonField(resource: string | undefined, field: string): boolean {
  if (!resource) return false;
  return FLAT_JSON_ALLOWLIST[resource]?.has(field) ?? false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function descendJson(field: string, before: unknown, after: unknown): AuditChange[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: AuditChange[] = [];
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    const change: AuditChange = { field: `${field}.${k}` };
    if (bv !== undefined) change.before = bv;
    if (av !== undefined) change.after = av;
    out.push(change);
  }
  return out;
}

export function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  resource?: string
): AuditChange[] {
  if (!before && !after) return [];

  if (!before) {
    // CREATE — all populated after fields (skip null/undefined/empty strings
    // since an unset field on create is noise, not a meaningful change).
    const out: AuditChange[] = [];
    for (const [field, value] of Object.entries(after!)) {
      if (isHiddenField(field, resource)) continue;
      if (value === null || value === undefined || value === "") continue;
      if (isFlatJsonField(resource, field) && isRecord(value)) {
        out.push(...descendJson(field, undefined, value));
      } else {
        out.push({ field, after: value });
      }
    }
    return out;
  }

  if (!after) {
    // DELETE — all before fields
    const out: AuditChange[] = [];
    for (const [field, value] of Object.entries(before)) {
      if (isHiddenField(field, resource)) continue;
      if (isFlatJsonField(resource, field) && isRecord(value)) {
        out.push(...descendJson(field, value, undefined));
      } else {
        out.push({ field, before: value });
      }
    }
    return out;
  }

  // UPDATE — changed fields only
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditChange[] = [];

  for (const field of allKeys) {
    if (isHiddenField(field, resource)) continue;
    const b = before[field];
    const a = after[field];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      if (isFlatJsonField(resource, field)) {
        changes.push(...descendJson(field, b, a));
      } else {
        changes.push({ field, before: b, after: a });
      }
    }
  }

  return changes;
}

export type AuditedParams<T> = {
  db: PrismaClient;
  ctx: ActorCtx;
  action: string;
  resource: string;
  resourceId: string | ((after: T) => string);
  beforeFetch: (tx: PrismaClient) => Promise<Record<string, unknown> | null>;
  mutation: (tx: PrismaClient) => Promise<T>;
};

export async function audited<T>({
  db,
  ctx,
  action,
  resource,
  resourceId,
  beforeFetch,
  mutation,
}: AuditedParams<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    const beforeState = await beforeFetch(tx as unknown as PrismaClient);
    const result = await mutation(tx as unknown as PrismaClient);

    const afterState =
      result !== null && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : null;

    const changes = computeDiff(beforeState, afterState, resource);

    const resolvedResourceId = typeof resourceId === "function" ? resourceId(result) : resourceId;

    await (tx as any).auditLog.create({
      data: {
        householdId: ctx.householdId,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        action,
        resource,
        resourceId: resolvedResourceId,
        changes,
      },
    });

    return result;
  });
}
