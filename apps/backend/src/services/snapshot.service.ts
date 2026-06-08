import { prisma } from "../config/database.js";
import { NotFoundError, ConflictError, AuthorizationError } from "../utils/errors.js";
import { waterfallService } from "./waterfall.service.js";
import { audited } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import { toGBP, AuditAction } from "@finplan/shared";
import { FinancialSummarySchema } from "@finplan/shared";
import type { CreateSnapshotInput, RenameSnapshotInput, FinancialSummary } from "@finplan/shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTierSeries(snapshots: Array<{ data: unknown; createdAt: Date }>) {
  type Point = { date: string; value: number };
  const income: Point[] = [];
  const committed: Point[] = [];
  const discretionary: Point[] = [];
  const surplus: Point[] = [];

  for (const snap of snapshots) {
    const d = snap.data as Record<string, any>;
    const date = snap.createdAt.toISOString().slice(0, 10);
    if (d?.income?.total !== undefined) income.push({ date, value: d.income.total as number });
    if (d?.committed !== undefined) {
      const ct =
        ((d.committed.monthlyTotal as number) ?? 0) + ((d.committed.monthlyAvg12 as number) ?? 0);
      committed.push({ date, value: ct });
    }
    if (d?.discretionary?.total !== undefined)
      discretionary.push({ date, value: d.discretionary.total as number });
    if (d?.surplus?.amount !== undefined) surplus.push({ date, value: d.surplus.amount as number });
  }

  return { income, committed, discretionary, surplus };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const snapshotService = {
  async listSnapshots(householdId: string) {
    return prisma.snapshot.findMany({
      where: { householdId },
      select: { id: true, name: true, isAuto: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async getSnapshot(householdId: string, id: string) {
    const snapshot = await prisma.snapshot.findUnique({ where: { id } });
    if (!snapshot || snapshot.householdId !== householdId) {
      throw new NotFoundError("Snapshot not found");
    }
    return snapshot;
  },

  async createSnapshot(householdId: string, input: CreateSnapshotInput, ctx: ActorCtx) {
    const data = await waterfallService.getWaterfallSummary(householdId);
    try {
      return await audited({
        db: prisma,
        ctx,
        action: AuditAction.CREATE_SNAPSHOT,
        resource: "snapshot",
        resourceId: (after: { id: string }) => after.id,
        beforeFetch: async () => null,
        mutation: (tx) =>
          tx.snapshot.create({
            data: { householdId, name: input.name, isAuto: false, data: data as object },
          }),
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A snapshot with that name already exists");
      }
      throw err;
    }
  },

  async renameSnapshot(householdId: string, id: string, input: RenameSnapshotInput, ctx: ActorCtx) {
    const snapshot = await prisma.snapshot.findUnique({ where: { id } });
    if (!snapshot || snapshot.householdId !== householdId) {
      throw new NotFoundError("Snapshot not found");
    }
    if (snapshot.isAuto) {
      throw new AuthorizationError("Auto-snapshots cannot be renamed");
    }
    try {
      return await audited({
        db: prisma,
        ctx,
        action: AuditAction.UPDATE_SNAPSHOT,
        resource: "snapshot",
        resourceId: id,
        beforeFetch: async (tx) =>
          tx.snapshot.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
        mutation: (tx) => tx.snapshot.update({ where: { id }, data: { name: input.name } }),
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A snapshot with that name already exists");
      }
      throw err;
    }
  },

  async deleteSnapshot(householdId: string, id: string, ctx: ActorCtx) {
    const snapshot = await prisma.snapshot.findUnique({ where: { id } });
    if (!snapshot || snapshot.householdId !== householdId) {
      throw new NotFoundError("Snapshot not found");
    }
    if (snapshot.isAuto) {
      throw new AuthorizationError("Auto-snapshots cannot be deleted");
    }
    await audited({
      db: prisma,
      ctx,
      action: AuditAction.DELETE_SNAPSHOT,
      resource: "snapshot",
      resourceId: id,
      beforeFetch: async (tx) =>
        tx.snapshot.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
      mutation: (tx) => tx.snapshot.delete({ where: { id } }),
    });
  },

  async ensureJan1Snapshot(householdId: string, now: Date = new Date()) {
    const today = now;
    if (today.getMonth() !== 0 || today.getDate() !== 1) return;

    const year = today.getFullYear();
    const autoName = `January ${year} — Auto`;
    const exists = await prisma.snapshot.findUnique({
      where: { householdId_name: { householdId, name: autoName } },
    });
    if (!exists) {
      const data = await waterfallService.getWaterfallSummary(householdId);
      await prisma.snapshot.create({
        data: { householdId, name: autoName, isAuto: true, data: data as object },
      });
    }
  },

  async ensureBaselineSnapshot(householdId: string) {
    const count = await prisma.snapshot.count({ where: { householdId, isAuto: true } });
    if (count > 0) return;
    const data = await waterfallService.getWaterfallSummary(householdId);
    await prisma.snapshot.upsert({
      where: { householdId_name: { householdId, name: "auto:init" } },
      create: { householdId, name: "auto:init", isAuto: true, data: data as object },
      update: {},
    });
  },

  async ensureTodayAutoSnapshot(householdId: string, now: Date = new Date()) {
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const name = `auto:${dateKey}`;
    const data = await waterfallService.getWaterfallSummary(householdId);
    await prisma.snapshot.upsert({
      where: { householdId_name: { householdId, name } },
      create: { householdId, name, isAuto: true, data: data as object },
      update: { data: data as object },
    });
  },

  async getFinancialSummary(householdId: string): Promise<FinancialSummary> {
    const [summary, autoSnapshots] = await Promise.all([
      waterfallService.getWaterfallSummary(householdId),
      prisma.snapshot.findMany({
        where: { householdId, isAuto: true },
        orderBy: { createdAt: "asc" },
        select: { data: true, createdAt: true },
      }),
    ]);

    const netWorth: number | null = null;
    const netWorthSeries: Array<{ date: string; value: number }> = [];

    const tierSeries = buildTierSeries(autoSnapshots);

    return FinancialSummarySchema.parse({
      current: {
        netWorth,
        income: summary.income.total,
        committed: toGBP(summary.committed.monthlyTotal + summary.committed.monthlyAvg12),
        discretionary: summary.discretionary.total,
        surplus: summary.surplus.amount,
      },
      sparklines: {
        netWorth: netWorthSeries,
        income: tierSeries.income,
        committed: tierSeries.committed,
        discretionary: tierSeries.discretionary,
        surplus: tierSeries.surplus,
      },
    });
  },
};
