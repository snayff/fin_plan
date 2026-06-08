import { prisma } from "../config/database.js";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { exportService } from "./export.service.js";
import type { ActorCtx } from "./audit.service.js";
import { AuditAction } from "@finplan/shared";
import {
  CURRENT_EXPORT_SCHEMA_VERSION,
  householdExportSchema,
  type HouseholdExport,
  type ImportOptions,
} from "@finplan/shared";

/**
 * Import service: validates and writes a `HouseholdExport` JSON into the
 * database. Supports two modes:
 *   - `create_new`: creates a brand new household owned by the caller
 *   - `overwrite`: wipes an existing household's data (except the caller's
 *     owner Member record) and replaces it with the import payload
 *
 * Everything runs inside a single prisma transaction for atomicity.
 */

async function assertOwner(householdId: string, userId: string) {
  const member = await prisma.member.findFirst({ where: { householdId, userId } });
  if (!member || member.role !== "owner") {
    throw new AuthorizationError("Only household owners can import data");
  }
  return member;
}

/**
 * Narrow the settings object to only the known HouseholdSettings fields,
 * stripping undefined values so Prisma doesn't complain.
 */
function sanitizeSettings(s: HouseholdExport["settings"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export const importService = {
  /**
   * Synchronous validation — runs the Zod schema and also verifies the
   * schema version is not greater than the current supported version.
   * Does not touch the database.
   */
  validateImportData(data: unknown): { valid: boolean; errors?: string[] } {
    // First, peek at schemaVersion before Zod rejects it via literal()
    if (data && typeof data === "object" && "schemaVersion" in data) {
      const v = (data as { schemaVersion: unknown }).schemaVersion;
      if (typeof v === "number" && v > CURRENT_EXPORT_SCHEMA_VERSION) {
        return {
          valid: false,
          errors: [
            `Unsupported schema version ${v}. Maximum supported: ${CURRENT_EXPORT_SCHEMA_VERSION}`,
          ],
        };
      }
    }

    // Check for duplicate member names
    if (
      data &&
      typeof data === "object" &&
      "members" in data &&
      Array.isArray((data as { members: unknown }).members)
    ) {
      const members = (data as { members: Array<{ name: string }> }).members;
      const names = members.map((m) => m.name);
      const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
      if (duplicates.length > 0) {
        return {
          valid: false,
          errors: [`Duplicate member names in import data: ${[...new Set(duplicates)].join(", ")}`],
        };
      }
    }

    const parsed = householdExportSchema.safeParse(data);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      };
    }
    return { valid: true };
  },

  /**
   * Import a household export into the database.
   *
   * @param targetHouseholdId the household to overwrite (ignored for create_new)
   * @param callerUserId the authenticated user performing the import
   * @param rawData the unvalidated export payload
   * @param mode "overwrite" or "create_new"
   */
  async importHousehold(
    targetHouseholdId: string,
    callerUserId: string,
    rawData: unknown,
    mode: ImportOptions["mode"],
    ctx?: ActorCtx
  ): Promise<{ success: boolean; householdId: string; backupId?: string }> {
    // Validate first — version check included
    const validation = this.validateImportData(rawData);
    if (!validation.valid) {
      throw new ValidationError(
        `Invalid import data: ${validation.errors?.join("; ") ?? "unknown error"}`
      );
    }
    const data = householdExportSchema.parse(rawData);

    let backup: { id: string } | undefined;

    // For overwrite mode, caller must be owner of the target household.
    // For create_new mode, caller is free to create a fresh household.
    if (mode === "overwrite") {
      await assertOwner(targetHouseholdId, callerUserId);

      // Auto-backup current data before overwrite
      const backupData = await exportService.exportHousehold(targetHouseholdId, callerUserId);
      backup = await prisma.importBackup.create({
        data: {
          householdId: targetHouseholdId,
          data: backupData as object,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Clean up expired backups opportunistically
      await prisma.importBackup.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
    }

    // Get caller's name for the owner Member record
    const callerUser = await prisma.user.findUnique({
      where: { id: callerUserId },
      select: { name: true },
    });
    if (!callerUser) throw new ValidationError("Caller user not found");
    const callerName = callerUser.name;

    const newHouseholdId = await prisma.$transaction(
      async (tx) => {
        let householdId: string;

        if (mode === "create_new") {
          const household = await tx.household.create({ data: { name: data.household.name } });
          householdId = household.id;
          try {
            await tx.member.create({
              data: {
                householdId,
                userId: callerUserId,
                name: callerName,
                role: "owner",
              },
            });
          } catch (err: any) {
            if (err?.code === "P2002") {
              throw new ConflictError("A member with that name already exists in this household");
            }
            throw err;
          }
        } else {
          householdId = targetHouseholdId;
          await tx.household.update({
            where: { id: householdId },
            data: { name: data.household.name },
          });

          // Purge household-scoped history and session state first. These
          // models don't reference waterfall items via FK, so order within
          // this group is unimportant — but they must be deleted before we
          // start wiping waterfall items so nothing is left dangling.
          await tx.auditLog.deleteMany({ where: { householdId } });
          await tx.snapshot.deleteMany({ where: { householdId } });
          await tx.householdInvite.deleteMany({ where: { householdId } });
          await tx.reviewSession.deleteMany({ where: { householdId } });

          // Collect existing waterfall item ids so we can purge periods/history.
          const [existingIncome, existingCommitted, existingDiscretionary] = await Promise.all([
            tx.incomeSource.findMany({ where: { householdId }, select: { id: true } }),
            tx.committedItem.findMany({ where: { householdId }, select: { id: true } }),
            tx.discretionaryItem.findMany({ where: { householdId }, select: { id: true } }),
          ]);
          const allItemIds = [
            ...existingIncome.map((i) => i.id),
            ...existingCommitted.map((i) => i.id),
            ...existingDiscretionary.map((i) => i.id),
          ];

          if (allItemIds.length > 0) {
            await tx.itemAmountPeriod.deleteMany({ where: { itemId: { in: allItemIds } } });
            await tx.waterfallHistory.deleteMany({ where: { itemId: { in: allItemIds } } });
          }

          await tx.incomeSource.deleteMany({ where: { householdId } });
          await tx.committedItem.deleteMany({ where: { householdId } });
          await tx.discretionaryItem.deleteMany({ where: { householdId } });

          // Assets & accounts — balances cascade via onDelete: Cascade on FK
          await tx.asset.deleteMany({ where: { householdId } });
          await tx.account.deleteMany({ where: { householdId } });

          await tx.purchaseItem.deleteMany({ where: { householdId } });
          await tx.plannerYearBudget.deleteMany({ where: { householdId } });

          // Gift data: allocations → events → people → settings (respect FK order)
          await tx.giftAllocation.deleteMany({ where: { householdId } });
          await tx.giftEvent.deleteMany({ where: { householdId } });
          await tx.giftPerson.deleteMany({ where: { householdId } });
          await tx.giftPlannerSettings.deleteMany({ where: { householdId } });

          // Subcategories are referenced by waterfall items (already deleted) — safe now
          await tx.subcategory.deleteMany({ where: { householdId } });

          // Remove settings so we can re-create cleanly via upsert below
          // (HouseholdSettings has no cascade in the schema)
          // Using deleteMany to avoid errors if the row is missing
          await tx.householdSettings.deleteMany({ where: { householdId } });

          // Delete all non-caller members; preserve caller's owner Member record
          await tx.member.deleteMany({
            where: { householdId, NOT: { userId: callerUserId } },
          });
        }

        // === IMPORT MEMBERS ===
        // Skip importing a member whose name matches the caller — they already
        // exist as the owner Member record.
        const membersToImport = data.members.filter((m) => m.name !== callerName);
        for (const m of membersToImport) {
          try {
            await tx.member.create({
              data: {
                householdId,
                userId: null,
                name: m.name,
                // Demote duplicate owners so we only ever have one per household
                role: m.role === "owner" ? "member" : m.role,
                dateOfBirth: m.dateOfBirth ? new Date(m.dateOfBirth) : null,
                retirementYear: m.retirementYear ?? null,
              },
            });
          } catch (err: any) {
            if (err?.code === "P2002") {
              throw new ConflictError("A member with that name already exists in this household");
            }
            throw err;
          }
        }

        // Re-read all members to build a name lookup map. Asset/account owner
        // references use Member.id — no need to filter to linked members.
        const allMembers = await tx.member.findMany({ where: { householdId } });
        const memberIdByName = new Map<string, string>();
        for (const m of allMembers) {
          memberIdByName.set(m.name, m.id);
        }

        // === IMPORT SETTINGS ===
        await tx.householdSettings.upsert({
          where: { householdId },
          create: { householdId, ...sanitizeSettings(data.settings) },
          update: sanitizeSettings(data.settings),
        });

        // === IMPORT SUBCATEGORIES ===
        const subIdByTierAndName = new Map<string, string>();
        for (const s of data.subcategories) {
          const created = await tx.subcategory.create({
            data: {
              householdId,
              tier: s.tier,
              name: s.name,
              sortOrder: s.sortOrder,
              isLocked: s.isLocked,
              isDefault: s.isDefault,
            },
          });
          subIdByTierAndName.set(`${s.tier}:${s.name}`, created.id);
        }

        function lookupSub(tier: "income" | "committed" | "discretionary", name: string): string {
          const id = subIdByTierAndName.get(`${tier}:${name}`);
          if (!id) throw new ValidationError(`Unknown subcategory: ${tier}:${name}`);
          return id;
        }

        // === IMPORT INCOME SOURCES ===
        const incomeNameToId = new Map<string, string>();
        for (const [idx, i] of data.incomeSources.entries()) {
          try {
            const created = await tx.incomeSource.create({
              data: {
                householdId,
                subcategoryId: lookupSub("income", i.subcategoryName),
                name: i.name,
                frequency: i.frequency,
                incomeType: i.incomeType,
                dueDate: i.dueDate,
                memberId: i.ownerName ? (memberIdByName.get(i.ownerName) ?? null) : null,
                sortOrder: i.sortOrder,
                lastReviewedAt: new Date(i.lastReviewedAt),
                notes: i.notes ?? null,
              },
            });
            incomeNameToId.set(i.name, created.id);
            for (const p of i.periods) {
              await tx.itemAmountPeriod.create({
                data: {
                  itemType: "income_source",
                  itemId: created.id,
                  startDate: new Date(p.startDate),
                  endDate: p.endDate ? new Date(p.endDate) : null,
                  amount: p.amount,
                },
              });
            }
          } catch (err) {
            throw new ValidationError(
              `Failed to import income source '${i.name}' (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // === IMPORT COMMITTED ITEMS ===
        const committedNameToId = new Map<string, string>();
        for (const [idx, i] of data.committedItems.entries()) {
          try {
            const created = await tx.committedItem.create({
              data: {
                householdId,
                subcategoryId: lookupSub("committed", i.subcategoryName),
                name: i.name,
                spendType: i.spendType,
                notes: i.notes ?? null,
                memberId: i.ownerName ? (memberIdByName.get(i.ownerName) ?? null) : null,
                dueDate: i.dueDate,
                sortOrder: i.sortOrder,
                lastReviewedAt: new Date(i.lastReviewedAt),
              },
            });
            committedNameToId.set(i.name, created.id);
            for (const p of i.periods) {
              await tx.itemAmountPeriod.create({
                data: {
                  itemType: "committed_item",
                  itemId: created.id,
                  startDate: new Date(p.startDate),
                  endDate: p.endDate ? new Date(p.endDate) : null,
                  amount: p.amount,
                },
              });
            }
          } catch (err) {
            throw new ValidationError(
              `Failed to import committed item '${i.name}' (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // === IMPORT DISCRETIONARY ITEMS ===
        const discretionaryNameToId = new Map<string, string>();
        for (const [idx, i] of data.discretionaryItems.entries()) {
          try {
            const created = await tx.discretionaryItem.create({
              data: {
                householdId,
                subcategoryId: lookupSub("discretionary", i.subcategoryName),
                name: i.name,
                spendType: i.spendType,
                notes: i.notes ?? null,
                memberId: i.ownerName ? (memberIdByName.get(i.ownerName) ?? null) : null,
                dueDate: i.dueDate,
                sortOrder: i.sortOrder,
                lastReviewedAt: new Date(i.lastReviewedAt),
              },
            });
            discretionaryNameToId.set(i.name, created.id);
            for (const p of i.periods) {
              await tx.itemAmountPeriod.create({
                data: {
                  itemType: "discretionary_item",
                  itemId: created.id,
                  startDate: new Date(p.startDate),
                  endDate: p.endDate ? new Date(p.endDate) : null,
                  amount: p.amount,
                },
              });
            }
          } catch (err) {
            throw new ValidationError(
              `Failed to import discretionary item '${i.name}' (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // === WATERFALL HISTORY ===
        for (const [idx, h] of data.waterfallHistory.entries()) {
          const itemMap =
            h.itemType === "income_source"
              ? incomeNameToId
              : h.itemType === "committed_item"
                ? committedNameToId
                : discretionaryNameToId;
          const itemId = itemMap.get(h.itemName);
          if (!itemId) {
            throw new ValidationError(
              `Failed to import waterfall history entry (index ${idx}): no matching item '${h.itemName}' of type '${h.itemType}'`
            );
          }
          await tx.waterfallHistory.create({
            data: {
              itemType: h.itemType,
              itemId,
              value: h.value,
              recordedAt: new Date(h.recordedAt),
            },
          });
        }

        // === ASSETS ===
        for (const [idx, a] of data.assets.entries()) {
          try {
            const created = await tx.asset.create({
              data: {
                householdId,
                name: a.name,
                type: a.type,
                memberId: a.ownerName ? (memberIdByName.get(a.ownerName) ?? null) : null,
                growthRatePct: a.growthRatePct ?? null,
                lastReviewedAt: a.lastReviewedAt ? new Date(a.lastReviewedAt) : null,
              },
            });
            for (const b of a.balances) {
              await tx.assetBalance.create({
                data: {
                  assetId: created.id,
                  value: b.value,
                  date: new Date(b.date),
                  note: b.note ?? null,
                },
              });
            }
          } catch (err) {
            throw new ValidationError(
              `Failed to import asset '${a.name}' (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // === ACCOUNTS ===
        for (const [idx, a] of data.accounts.entries()) {
          try {
            const created = await tx.account.create({
              data: {
                householdId,
                name: a.name,
                type: a.type,
                memberId: a.ownerName ? (memberIdByName.get(a.ownerName) ?? null) : null,
                growthRatePct: a.growthRatePct ?? null,
                isCashflowLinked: a.isCashflowLinked ?? false,
                isISA: a.isISA ?? false,
                isaYearContribution: a.isaYearContribution ?? null,
                lastReviewedAt: a.lastReviewedAt ? new Date(a.lastReviewedAt) : null,
              },
            });
            for (const b of a.balances) {
              await tx.accountBalance.create({
                data: {
                  accountId: created.id,
                  value: b.value,
                  date: new Date(b.date),
                  note: b.note ?? null,
                },
              });
            }
          } catch (err) {
            throw new ValidationError(
              `Failed to import account '${a.name}' (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // === PURCHASE ITEMS ===
        for (const [idx, p] of data.purchaseItems.entries()) {
          try {
            await tx.purchaseItem.create({
              data: {
                householdId,
                yearAdded: p.yearAdded,
                name: p.name,
                estimatedCost: p.estimatedCost,
                priority: p.priority,
                scheduledThisYear: p.scheduledThisYear,
                fundingSources: p.fundingSources,
                // Account IDs aren't portable across imports; leave unset
                fundingAccountId: null,
                status: p.status,
                reason: p.reason ?? null,
                comment: p.comment ?? null,
              },
            });
          } catch (err) {
            throw new ValidationError(
              `Failed to import purchase item '${p.name}' (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // === PLANNER YEAR BUDGETS ===
        for (const [idx, b] of data.plannerYearBudgets.entries()) {
          try {
            await tx.plannerYearBudget.create({
              data: {
                householdId,
                year: b.year,
                purchaseBudget: b.purchaseBudget,
                giftBudget: b.giftBudget,
              },
            });
          } catch (err) {
            throw new ValidationError(
              `Failed to import planner year budget for year ${b.year} (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // === GIFT PLANNER SETTINGS ===
        if (data.gifts) {
          await tx.giftPlannerSettings.upsert({
            where: { householdId },
            create: {
              householdId,
              mode: data.gifts.settings.mode,
              syncedDiscretionaryItemId: data.gifts.settings.syncedDiscretionaryItemId,
            },
            update: {
              mode: data.gifts.settings.mode,
              syncedDiscretionaryItemId: data.gifts.settings.syncedDiscretionaryItemId,
            },
          });

          // === GIFT PEOPLE ===
          const giftPersonNameToId = new Map<string, string>();
          for (const [idx, gp] of data.gifts.people.entries()) {
            try {
              const created = await tx.giftPerson.create({
                data: {
                  householdId,
                  name: gp.name,
                  notes: gp.notes ?? null,
                  sortOrder: gp.sortOrder,
                },
              });
              giftPersonNameToId.set(gp.name, created.id);
            } catch (err) {
              throw new ValidationError(
                `Failed to import gift person '${gp.name}' (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }

          // === GIFT EVENTS ===
          const giftEventNameToId = new Map<string, string>();
          for (const [idx, ge] of data.gifts.events.entries()) {
            try {
              const created = await tx.giftEvent.create({
                data: {
                  householdId,
                  name: ge.name,
                  dateType: ge.dateType,
                  dateMonth: ge.dateMonth ?? null,
                  dateDay: ge.dateDay ?? null,
                  isLocked: ge.isLocked,
                  sortOrder: ge.sortOrder,
                },
              });
              giftEventNameToId.set(ge.name, created.id);
            } catch (err) {
              throw new ValidationError(
                `Failed to import gift event '${ge.name}' (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }

          // === GIFT ALLOCATIONS ===
          for (const [idx, ga] of data.gifts.allocations.entries()) {
            const personId = giftPersonNameToId.get(ga.personName);
            const eventId = giftEventNameToId.get(ga.eventName);
            if (!personId) {
              throw new ValidationError(
                `Failed to import gift allocation (index ${idx}): unknown person '${ga.personName}'`
              );
            }
            if (!eventId) {
              throw new ValidationError(
                `Failed to import gift allocation (index ${idx}): unknown event '${ga.eventName}'`
              );
            }
            try {
              await tx.giftAllocation.create({
                data: {
                  householdId,
                  giftPersonId: personId,
                  giftEventId: eventId,
                  year: ga.year,
                  planned: ga.planned,
                  spent: ga.spent ?? null,
                  status: ga.status,
                  notes: ga.notes ?? null,
                  dateMonth: ga.dateMonth ?? null,
                  dateDay: ga.dateDay ?? null,
                },
              });
            } catch (err) {
              throw new ValidationError(
                `Failed to import gift allocation (index ${idx}): ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }
        }

        // Write single IMPORT_DATA audit row with counts
        if (ctx) {
          await (tx as any).auditLog.create({
            data: {
              householdId,
              actorId: ctx.actorId,
              actorName: ctx.actorName,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
              action: AuditAction.IMPORT_DATA,
              resource: "household",
              resourceId: householdId,
              metadata: {
                counts: {
                  incomeSources: data.incomeSources.length,
                  committedItems: data.committedItems.length,
                  discretionaryItems: data.discretionaryItems.length,
                  assets: data.assets?.length ?? 0,
                  accounts: data.accounts?.length ?? 0,
                  members: data.members.length,
                  giftPeople: data.gifts?.people.length ?? 0,
                  giftEvents: data.gifts?.events.length ?? 0,
                  giftAllocations: data.gifts?.allocations.length ?? 0,
                },
              },
            },
          });
        }

        return householdId;
      },
      { timeout: 30_000 }
    );

    return {
      success: true,
      householdId: newHouseholdId,
      backupId: mode === "overwrite" ? backup?.id : undefined,
    };
  },

  async restoreFromBackup(
    householdId: string,
    callerUserId: string,
    backupId: string
  ): Promise<{ success: boolean; householdId: string }> {
    await assertOwner(householdId, callerUserId);

    const backupRecord = await prisma.importBackup.findUnique({ where: { id: backupId } });
    if (!backupRecord || backupRecord.householdId !== householdId) {
      throw new NotFoundError("Backup not found");
    }
    if (backupRecord.expiresAt < new Date()) {
      throw new ValidationError("Backup has expired");
    }

    // Import the backup data as an overwrite (this will create its own backup of current state)
    const result = await this.importHousehold(
      householdId,
      callerUserId,
      backupRecord.data,
      "overwrite"
    );

    // Delete the used backup
    await prisma.importBackup.delete({ where: { id: backupId } });

    return { success: true, householdId: result.householdId };
  },
};
