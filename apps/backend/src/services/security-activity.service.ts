import type { PrismaClient } from "@prisma/client";
import type { SecurityActivityQuery, SecurityActivityResponse } from "@finplan/shared";
import { AuditAction } from "@finplan/shared";
import { ValidationError } from "../utils/errors.js";

type QueryParams = SecurityActivityQuery & { userId: string };

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

export async function querySecurityActivity(
  db: PrismaClient,
  params: QueryParams
): Promise<SecurityActivityResponse> {
  const { userId, cursor, limit } = params;

  const where: Record<string, unknown> = {
    userId,
    householdId: null,
    action: { not: AuditAction.TOKEN_REFRESH },
  };

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) throw new ValidationError("Invalid cursor");
    Object.assign(where, {
      OR: [
        { createdAt: { lt: new Date(decoded.createdAt) } },
        { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
      ],
    });
  }

  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      action: true,
      createdAt: true,
      metadata: true,
    },
  });

  const hasNext = rows.length > limit;
  const entries = rows.slice(0, limit).map((e) => ({
    id: e.id,
    action: e.action ?? "",
    createdAt: e.createdAt.toISOString(),
    metadata: e.metadata ?? null,
  }));
  const last = entries[entries.length - 1];
  const lastRow = rows[entries.length - 1];
  const nextCursor =
    hasNext && last && lastRow ? encodeCursor(lastRow.createdAt, lastRow.id) : null;

  return { entries, nextCursor };
}
