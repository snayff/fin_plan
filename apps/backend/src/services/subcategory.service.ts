import type {
  WaterfallTier,
  BatchSaveSubcategoriesInput,
  ResetSubcategoriesInput,
} from "@finplan/shared";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../config/database.js";
import { auditEventTx, computeDiff } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import { ConflictError, ValidationError } from "../utils/errors.js";

/**
 * A Prisma client or an interactive-transaction client. `seedDefaults` accepts
 * either so seeding can join a caller's transaction (e.g. createHousehold,
 * acceptInvite) and commit atomically with the household creation.
 */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

const DEFAULT_SUBCATEGORIES = {
  income: [
    { name: "Salary", sortOrder: 0 },
    { name: "Dividends", sortOrder: 1 },
    { name: "Other", sortOrder: 2 },
  ],
  committed: [
    { name: "Housing", sortOrder: 0 },
    { name: "Utilities", sortOrder: 1 },
    { name: "Services", sortOrder: 2 },
    { name: "Charity", sortOrder: 3 },
    { name: "Childcare", sortOrder: 4 },
    { name: "Vehicles", sortOrder: 5 },
    { name: "Other", sortOrder: 6 },
  ],
  discretionary: [
    { name: "Food", sortOrder: 0 },
    { name: "Fun", sortOrder: 1 },
    { name: "Clothes", sortOrder: 2 },
    { name: "Gifts", sortOrder: 3, isLocked: true },
    { name: "Savings", sortOrder: 4, isLocked: true },
    { name: "Other", sortOrder: 5 },
  ],
} as const;

export const subcategoryService = {
  async seedDefaults(householdId: string, db: PrismaLike = prisma) {
    const rows: {
      householdId: string;
      tier: "income" | "committed" | "discretionary";
      name: string;
      sortOrder: number;
      isLocked: boolean;
      isDefault: boolean;
    }[] = [];

    for (const [tier, subs] of Object.entries(DEFAULT_SUBCATEGORIES)) {
      for (const sub of subs) {
        rows.push({
          householdId,
          tier: tier as "income" | "committed" | "discretionary",
          name: sub.name,
          sortOrder: sub.sortOrder,
          isLocked: "isLocked" in sub ? sub.isLocked : false,
          isDefault: true,
        });
      }
    }

    await db.subcategory.createMany({ data: rows, skipDuplicates: true });
  },

  async ensureSubcategories(householdId: string) {
    const count = await prisma.subcategory.count({ where: { householdId } });
    if (count === 0) {
      await this.seedDefaults(householdId);
    }
  },

  async listByTier(householdId: string, tier: WaterfallTier) {
    return prisma.subcategory.findMany({
      where: { householdId, tier },
      orderBy: { sortOrder: "asc" },
    });
  },

  async getDefaultSubcategoryId(householdId: string, tier: WaterfallTier): Promise<string> {
    const sub = await prisma.subcategory.findFirst({
      where: { householdId, tier, name: "Other" },
    });
    if (!sub) {
      throw new Error(`Default subcategory not found for tier "${tier}"`);
    }
    return sub.id;
  },

  async getSubcategoryIdByName(
    householdId: string,
    tier: WaterfallTier,
    name: string
  ): Promise<string | null> {
    const sub = await prisma.subcategory.findFirst({
      where: { householdId, tier, name },
    });
    return sub?.id ?? null;
  },

  async getItemCounts(householdId: string, tier: WaterfallTier): Promise<Record<string, number>> {
    const model =
      tier === "income"
        ? prisma.incomeSource
        : tier === "committed"
          ? prisma.committedItem
          : prisma.discretionaryItem;

    const groups = await (model as any).groupBy({
      by: ["subcategoryId"],
      where: { householdId },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const g of groups) {
      counts[g.subcategoryId] = g._count.id;
    }
    return counts;
  },

  async batchSave(householdId: string, tier: WaterfallTier, input: BatchSaveSubcategoriesInput) {
    const { subcategories: desired, reassignments } = input;

    // ── Validation ────────────────────────────────────────────────────────────
    if (desired.length > 7) {
      throw new ValidationError("Maximum 7 subcategories per tier");
    }

    // Other must be present
    const otherEntry = desired.find((s) => s.name === "Other");
    if (!otherEntry) {
      throw new ValidationError("'Other' subcategory must be present in every tier");
    }

    // Other must be last by sortOrder
    const maxSort = Math.max(...desired.map((s) => s.sortOrder));
    if (otherEntry.sortOrder !== maxSort) {
      throw new ValidationError("'Other' must be last in sort order");
    }

    // No new subcategory named "Other" (case-insensitive) besides the existing one
    const otherDuplicates = desired.filter(
      (s) => s.name.toLowerCase() === "other" && s !== otherEntry
    );
    if (otherDuplicates.length > 0) {
      throw new ValidationError("The name 'Other' is reserved");
    }

    // Unique names (case-insensitive)
    const lowerNames = desired.map((s) => s.name.toLowerCase());
    if (new Set(lowerNames).size !== lowerNames.length) {
      throw new ValidationError("Subcategory names must be unique within a tier");
    }

    // Fetch current state
    const existing = await prisma.subcategory.findMany({
      where: { householdId, tier },
    });
    const existingById = new Map(existing.map((s) => [s.id, s]));

    // Check locked subcategories are not renamed or removed
    for (const ex of existing) {
      if (!ex.isLocked) continue;
      const match = desired.find((d) => d.id === ex.id);
      if (!match) {
        throw new ValidationError(`Cannot remove locked subcategory "${ex.name}"`);
      }
      if (match.name !== ex.name) {
        throw new ValidationError(`Cannot rename locked subcategory "${ex.name}"`);
      }
    }

    // Validate reassignment IDs belong to this household's tier (DB-sourced only)
    const existingIds = new Set(existing.map((s) => s.id));
    for (const r of reassignments) {
      if (!existingIds.has(r.fromSubcategoryId)) {
        throw new ValidationError(
          `Reassignment source "${r.fromSubcategoryId}" not found in household`
        );
      }
      if (!existingIds.has(r.toSubcategoryId)) {
        throw new ValidationError(`Reassignment destination "${r.toSubcategoryId}" not found`);
      }
    }

    // ── Apply in transaction ──────────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      const itemModel =
        tier === "income"
          ? tx.incomeSource
          : tier === "committed"
            ? tx.committedItem
            : tx.discretionaryItem;

      // 1. Reassign items from removed subcategories
      for (const r of reassignments) {
        await (itemModel as any).updateMany({
          where: { subcategoryId: r.fromSubcategoryId, householdId },
          data: { subcategoryId: r.toSubcategoryId },
        });
      }

      // 2. Delete removed subcategories
      const removedIds = existing
        .filter((ex) => !desired.some((d) => d.id === ex.id))
        .map((ex) => ex.id);
      for (const id of removedIds) {
        await tx.subcategory.delete({ where: { id } });
      }

      // 3. Update existing subcategories
      for (const d of desired) {
        if (d.id && existingById.has(d.id)) {
          await tx.subcategory.update({
            where: { id: d.id },
            data: { name: d.name, sortOrder: d.sortOrder },
          });
        }
      }

      // 4. Create new subcategories
      for (const d of desired) {
        if (!d.id) {
          await tx.subcategory.create({
            data: {
              householdId,
              tier,
              name: d.name,
              sortOrder: d.sortOrder,
              isLocked: false,
              isDefault: false,
            },
          });
        }
      }
    });
  },

  async create(householdId: string, tier: WaterfallTier, name: string, ctx?: ActorCtx) {
    const trimmedName = name.trim();
    try {
      // The cap check and insert must be atomic: two concurrent creates that
      // each see 6 rows would otherwise both insert and breach the 7-per-tier
      // cap. Serializable isolation makes the re-count + insert a single
      // conflict-detected unit, so exactly one of a racing pair succeeds (#136).
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.subcategory.count({ where: { householdId, tier } });
          if (existing >= 7) {
            throw new ValidationError("Maximum 7 subcategories per tier");
          }
          const maxSort = await tx.subcategory.aggregate({
            where: { householdId, tier },
            _max: { sortOrder: true },
          });
          const data = {
            householdId,
            tier,
            name: trimmedName,
            sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
            isLocked: false,
            isDefault: false,
            lockedByPlanner: false,
          };
          const created = await tx.subcategory.create({ data });
          if (ctx) {
            // Audit inside the same transaction so it commits with the row.
            await auditEventTx(tx, {
              householdId: ctx.householdId,
              actorId: ctx.actorId,
              actorName: ctx.actorName,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
              action: "CREATE_SUBCATEGORY",
              resource: "subcategory",
              resourceId: created.id,
              changes: computeDiff(
                null,
                created as unknown as Record<string, unknown>,
                "subcategory"
              ),
            });
          }
          return created;
        },
        { isolationLevel: "Serializable" }
      );
    } catch (err: any) {
      if (err.code === "P2002") {
        throw new ConflictError("A subcategory with that name already exists");
      }
      throw err;
    }
  },

  getDefaults() {
    return DEFAULT_SUBCATEGORIES;
  },

  async resetToDefaults(householdId: string, input: ResetSubcategoriesInput) {
    const { reassignments } = input;
    const tiers = ["income", "committed", "discretionary"] as const;

    // Fetch all existing subcategories across all tiers
    const allExisting: Array<{ id: string; tier: string; householdId: string }> = [];
    for (const tier of tiers) {
      const subs = await prisma.subcategory.findMany({
        where: { householdId, tier },
      });
      allExisting.push(...subs);
    }
    const existingIds = new Set(allExisting.map((s) => s.id));

    // Validate reassignment source IDs
    for (const r of reassignments) {
      if (!existingIds.has(r.fromSubcategoryId)) {
        throw new ValidationError(
          `Reassignment source "${r.fromSubcategoryId}" not found in household`
        );
      }
    }

    // Build a map of destination IDs → their tier + name (so we can remap after re-seed)
    const destinationInfo = new Map<string, { tier: string; name: string }>();
    for (const r of reassignments) {
      const dest = allExisting.find((s) => s.id === r.toSubcategoryId) as any;
      if (dest) {
        destinationInfo.set(r.toSubcategoryId, { tier: dest.tier, name: dest.name });
      }
    }

    // Guard against FK RESTRICT (P2003) on the wholesale deleteMany below.
    // Items are moved from each reassignment source onto its target before the
    // delete, and targets are remapped to fresh defaults afterwards. Any
    // subcategory that still holds items but is NOT a reassignment target would
    // therefore block deletion — surface that as a 400, not a raw 500 (#136).
    const reassignmentSources = new Set(reassignments.map((r) => r.fromSubcategoryId));
    const reassignmentTargets = new Set(reassignments.map((r) => r.toSubcategoryId));
    const subsById = new Map(allExisting.map((s) => [s.id, s] as const));
    const blocking: string[] = [];
    for (const tier of tiers) {
      const itemModel =
        tier === "income"
          ? prisma.incomeSource
          : tier === "committed"
            ? prisma.committedItem
            : prisma.discretionaryItem;
      const groups = await (itemModel as any).groupBy({
        by: ["subcategoryId"],
        where: { householdId },
        _count: { id: true },
      });
      for (const g of groups as Array<{ subcategoryId: string | null; _count: { id: number } }>) {
        const subId = g.subcategoryId;
        if (!subId || g._count.id === 0) continue;
        // After reassignment, a source is emptied; a target retains its items
        // but is remapped post-reseed. Everything else would orphan its items.
        if (reassignmentSources.has(subId) || reassignmentTargets.has(subId)) continue;
        const sub = subsById.get(subId) as { name?: string } | undefined;
        blocking.push(sub?.name ? `${sub.name} (${subId})` : subId);
      }
    }
    if (blocking.length > 0) {
      throw new ValidationError(
        `Cannot reset: these subcategories still hold items and were not reassigned: ${blocking.join(", ")}`
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Reassign items for each reassignment
        for (const r of reassignments) {
          const source = allExisting.find((s) => s.id === r.fromSubcategoryId);
          if (!source) continue;
          const tier = source.tier as WaterfallTier;
          const itemModel =
            tier === "income"
              ? tx.incomeSource
              : tier === "committed"
                ? tx.committedItem
                : tx.discretionaryItem;

          await (itemModel as any).updateMany({
            where: { subcategoryId: r.fromSubcategoryId, householdId },
            data: { subcategoryId: r.toSubcategoryId },
          });
        }

        // 2. Delete all existing subcategories across all tiers
        await tx.subcategory.deleteMany({ where: { householdId } });

        // 3. Re-seed defaults
        const rows: Array<{
          householdId: string;
          tier: "income" | "committed" | "discretionary";
          name: string;
          sortOrder: number;
          isLocked: boolean;
          isDefault: boolean;
        }> = [];
        for (const [tier, subs] of Object.entries(DEFAULT_SUBCATEGORIES)) {
          for (const sub of subs) {
            rows.push({
              householdId,
              tier: tier as "income" | "committed" | "discretionary",
              name: sub.name,
              sortOrder: sub.sortOrder,
              isLocked: "isLocked" in sub ? sub.isLocked : false,
              isDefault: true,
            });
          }
        }
        await tx.subcategory.createMany({ data: rows });

        // 4. Remap items from old destination IDs to newly created defaults
        if (destinationInfo.size > 0) {
          const newSubs = await tx.subcategory.findMany({ where: { householdId } });
          for (const [oldId, info] of destinationInfo) {
            const newSub = newSubs.find((s) => s.tier === info.tier && s.name === info.name);
            if (!newSub || newSub.id === oldId) continue;

            const itemModel =
              info.tier === "income"
                ? tx.incomeSource
                : info.tier === "committed"
                  ? tx.committedItem
                  : tx.discretionaryItem;

            await (itemModel as any).updateMany({
              where: { subcategoryId: oldId, householdId },
              data: { subcategoryId: newSub.id },
            });
          }
        }
      });
    } catch (err: any) {
      // Defence in depth: if the FK RESTRICT still trips (e.g. a concurrent
      // insert added an item after the pre-check), surface a 400 not a 500.
      if (err?.code === "P2003") {
        throw new ValidationError(
          "Cannot reset: some subcategories still hold items and were not reassigned"
        );
      }
      throw err;
    }
  },
};
