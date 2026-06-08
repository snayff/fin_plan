import { prisma } from "../config/database.js";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors.js";
import type {
  CreateGiftPersonInput,
  UpdateGiftPersonInput,
  CreateGiftEventInput,
  UpdateGiftEventInput,
  UpsertGiftAllocationInput,
  BulkUpsertAllocationsInput,
  SetGiftBudgetInput,
  GiftPlannerMode,
} from "@finplan/shared";
import { AuditAction } from "@finplan/shared";
import { audited } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";

function assertOwned(item: { householdId: string } | null, householdId: string, label: string) {
  if (!item) throw new NotFoundError(`${label} not found`);
  if (item.householdId !== householdId) throw new NotFoundError(`${label} not found`);
}

export const giftsService = {
  async getOrCreateSettings(householdId: string) {
    const existing = await prisma.giftPlannerSettings.findUnique({
      where: { householdId },
    });
    if (existing) return existing;
    return prisma.giftPlannerSettings.create({
      data: { householdId, mode: "synced" },
    });
  },

  async _ensureSyncedDiscretionaryItem<
    T extends { id: string; mode: string; syncedDiscretionaryItemId: string | null },
  >(householdId: string, settings: T): Promise<T> {
    if (settings.mode !== "synced" || settings.syncedDiscretionaryItemId) return settings;

    const giftsSubcategory = await prisma.subcategory.findFirst({
      where: { householdId, tier: "discretionary", name: "Gifts" },
    });
    if (!giftsSubcategory) throw new NotFoundError("Gifts subcategory not found");

    const year = new Date().getFullYear();
    const yearBudget = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year } },
    });
    const annualBudget = yearBudget?.giftBudget ?? 0;
    const startDate = new Date(Date.UTC(year, 0, 1));

    const createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.discretionaryItem.create({
        data: {
          householdId,
          subcategoryId: giftsSubcategory.id,
          name: "Gifts",
          spendType: "monthly",
          isPlannerOwned: true,
          lastReviewedAt: new Date(),
        },
      });
      await tx.itemAmountPeriod.upsert({
        where: {
          itemType_itemId_startDate: {
            itemType: "discretionary_item",
            itemId: created.id,
            startDate,
          },
        },
        create: {
          itemType: "discretionary_item",
          itemId: created.id,
          startDate,
          endDate: null,
          amount: annualBudget,
        },
        update: { amount: annualBudget },
      });
      await tx.subcategory.update({
        where: { id: giftsSubcategory.id },
        data: { lockedByPlanner: true },
      });
      await tx.giftPlannerSettings.update({
        where: { id: settings.id },
        data: { mode: "synced", syncedDiscretionaryItemId: created.id },
      });
      return created.id;
    });

    return { ...settings, mode: "synced", syncedDiscretionaryItemId: createdId } as T;
  },

  // ─── People ─────────────────────────────────────────────────────────────────
  async listPeople(householdId: string) {
    return prisma.giftPerson.findMany({
      where: { householdId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },

  async createPerson(householdId: string, data: CreateGiftPersonInput, ctx: ActorCtx) {
    try {
      return await audited({
        db: prisma,
        ctx,
        action: AuditAction.CREATE_GIFT_PERSON,
        resource: "gift-person",
        resourceId: (after: { id: string }) => after.id,
        beforeFetch: async () => null,
        mutation: (tx) => tx.giftPerson.create({ data: { householdId, ...data } }),
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A gift person with that name already exists");
      }
      throw err;
    }
  },

  async updatePerson(householdId: string, id: string, data: UpdateGiftPersonInput, ctx: ActorCtx) {
    const existing = await prisma.giftPerson.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Gift person");
    try {
      return await audited({
        db: prisma,
        ctx,
        action: AuditAction.UPDATE_GIFT_PERSON,
        resource: "gift-person",
        resourceId: id,
        beforeFetch: async (tx) =>
          tx.giftPerson.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
        mutation: (tx) => tx.giftPerson.update({ where: { id }, data }),
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A gift person with that name already exists");
      }
      throw err;
    }
  },

  async deletePerson(householdId: string, id: string, ctx: ActorCtx) {
    const existing = await prisma.giftPerson.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Gift person");
    if (existing!.memberId) {
      throw new ValidationError("Household members cannot be deleted from the gift planner");
    }
    await audited({
      db: prisma,
      ctx,
      action: AuditAction.DELETE_GIFT_PERSON,
      resource: "gift-person",
      resourceId: id,
      beforeFetch: async (tx) =>
        tx.giftPerson.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
      mutation: (tx) => tx.giftPerson.delete({ where: { id } }),
    });
  },

  // ─── Events ─────────────────────────────────────────────────────────────────
  async listEvents(householdId: string) {
    return prisma.giftEvent.findMany({
      where: { householdId },
      orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  },

  async createEvent(householdId: string, data: CreateGiftEventInput, ctx: ActorCtx) {
    const payload: any = {
      householdId,
      name: data.name,
      dateType: data.dateType,
      isLocked: false,
    };
    if (data.dateType === "shared") {
      payload.dateMonth = data.dateMonth;
      payload.dateDay = data.dateDay;
    }
    if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;
    try {
      return await audited({
        db: prisma,
        ctx,
        action: AuditAction.CREATE_GIFT_EVENT,
        resource: "gift-event",
        resourceId: (after: { id: string }) => after.id,
        beforeFetch: async () => null,
        mutation: (tx) => tx.giftEvent.create({ data: payload }),
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A gift event with that name already exists");
      }
      throw err;
    }
  },

  async updateEvent(householdId: string, id: string, data: UpdateGiftEventInput, ctx: ActorCtx) {
    const existing = await prisma.giftEvent.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Gift event");
    if (existing!.isLocked && data.name !== undefined) {
      throw new ValidationError("Locked events cannot be renamed");
    }
    try {
      return await audited({
        db: prisma,
        ctx,
        action: AuditAction.UPDATE_GIFT_EVENT,
        resource: "gift-event",
        resourceId: id,
        beforeFetch: async (tx) =>
          tx.giftEvent.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
        mutation: (tx) => tx.giftEvent.update({ where: { id }, data }),
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ConflictError("A gift event with that name already exists");
      }
      throw err;
    }
  },

  async deleteEvent(householdId: string, id: string, ctx: ActorCtx) {
    const existing = await prisma.giftEvent.findUnique({ where: { id } });
    assertOwned(existing, householdId, "Gift event");
    if (existing!.isLocked) {
      throw new ValidationError("Locked events cannot be deleted");
    }
    await audited({
      db: prisma,
      ctx,
      action: AuditAction.DELETE_GIFT_EVENT,
      resource: "gift-event",
      resourceId: id,
      beforeFetch: async (tx) =>
        tx.giftEvent.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>,
      mutation: (tx) => tx.giftEvent.delete({ where: { id } }),
    });
  },

  // ─── Locked event seeding ───────────────────────────────────────────────────
  async seedLockedEventsIfMissing(householdId: string) {
    const seeds = [
      {
        name: "Birthday",
        dateType: "personal" as const,
        dateMonth: null,
        dateDay: null,
        sortOrder: 0,
      },
      {
        name: "Wedding Anniversary",
        dateType: "personal" as const,
        dateMonth: null,
        dateDay: null,
        sortOrder: 1,
      },
      {
        name: "Valentine's Day",
        dateType: "shared" as const,
        dateMonth: 2,
        dateDay: 14,
        sortOrder: 2,
      },
      {
        name: "Mother's Day",
        dateType: "shared" as const,
        dateMonth: 3,
        dateDay: 15,
        sortOrder: 3,
      },
      { name: "Easter", dateType: "shared" as const, dateMonth: 4, dateDay: 10, sortOrder: 4 },
      {
        name: "Father's Day",
        dateType: "shared" as const,
        dateMonth: 6,
        dateDay: 15,
        sortOrder: 5,
      },
      { name: "Christmas", dateType: "shared" as const, dateMonth: 12, dateDay: 25, sortOrder: 6 },
    ];
    await prisma.giftEvent.createMany({
      data: seeds.map((s) => ({ ...s, householdId, isLocked: true })),
      skipDuplicates: true,
    });
  },

  // ─── Allocations ────────────────────────────────────────────────────────────
  _resolveStatus(input: UpsertGiftAllocationInput): "planned" | "bought" | "skipped" | undefined {
    if (input.status === "skipped") return "skipped";
    if (input.spent === null) return "planned";
    if (input.spent !== undefined) return "bought";
    return input.status;
  },

  _assertCurrentYear(year: number) {
    if (year < new Date().getFullYear()) {
      throw new ValidationError("Prior years are read-only");
    }
  },

  async upsertAllocation(
    householdId: string,
    personId: string,
    eventId: string,
    year: number,
    input: UpsertGiftAllocationInput
  ) {
    this._assertCurrentYear(year);

    // Resolve virtual `member:<id>` personId by finding or creating the
    // backing GiftPerson record, mirroring bulkUpsertAllocations.
    let resolvedPersonId = personId;
    if (personId.startsWith("member:")) {
      const memberId = personId.slice("member:".length);
      const member = await prisma.member.findUnique({ where: { id: memberId } });
      assertOwned(member, householdId, "Gift person");
      const existing = await prisma.giftPerson.findFirst({
        where: { householdId, memberId },
      });
      if (existing) {
        resolvedPersonId = existing.id;
      } else {
        const created = await prisma.giftPerson.create({
          data: { householdId, memberId, name: member!.name, sortOrder: 999 },
        });
        resolvedPersonId = created.id;
      }
    }

    const person = await prisma.giftPerson.findUnique({ where: { id: resolvedPersonId } });
    assertOwned(person, householdId, "Gift person");
    const event = await prisma.giftEvent.findUnique({ where: { id: eventId } });
    assertOwned(event, householdId, "Gift event");

    const status = this._resolveStatus(input);
    const writable: Record<string, unknown> = {};
    if (input.planned !== undefined) writable.planned = input.planned;
    if (input.spent !== undefined) writable.spent = input.spent;
    if (input.notes !== undefined) writable.notes = input.notes;
    if (input.dateMonth !== undefined) writable.dateMonth = input.dateMonth;
    if (input.dateDay !== undefined) writable.dateDay = input.dateDay;
    if (status !== undefined) writable.status = status;

    return prisma.giftAllocation.upsert({
      where: {
        giftPersonId_giftEventId_year: {
          giftPersonId: resolvedPersonId,
          giftEventId: eventId,
          year,
        },
      },
      create: {
        householdId,
        giftPersonId: resolvedPersonId,
        giftEventId: eventId,
        year,
        planned: input.planned ?? 0,
        spent: input.spent ?? null,
        status: status ?? "planned",
        notes: input.notes ?? null,
        dateMonth: input.dateMonth ?? null,
        dateDay: input.dateDay ?? null,
      },
      update: writable,
    });
  },

  async bulkUpsertAllocations(
    householdId: string,
    input: BulkUpsertAllocationsInput,
    ctx: ActorCtx
  ) {
    if (input.cells.length === 0) return { count: 0 };
    for (const cell of input.cells) this._assertCurrentYear(cell.year);

    // Auto-create GiftPerson records for household members referenced by member: prefix
    const memberPrefixIds = new Set(
      input.cells.map((c) => c.personId).filter((id) => id.startsWith("member:"))
    );
    const idMap = new Map<string, string>(); // member:xxx -> real GiftPerson id

    if (memberPrefixIds.size > 0) {
      const memberIds = [...memberPrefixIds].map((id) => id.slice("member:".length));
      const members = await prisma.member.findMany({
        where: { id: { in: memberIds }, householdId },
        select: { id: true, name: true },
      });
      if (members.length !== memberIds.length)
        throw new NotFoundError("Household member not found");

      for (const m of members) {
        const gp = await prisma.giftPerson.upsert({
          where: { householdId_name: { householdId, name: m.name } },
          create: { householdId, name: m.name, memberId: m.id },
          update: { memberId: m.id },
        });
        idMap.set(`member:${m.id}`, gp.id);
      }
    }

    // Resolve all person IDs (replace member: prefixes with real GiftPerson ids)
    const resolvedCells = input.cells.map((c) => ({
      ...c,
      personId: idMap.get(c.personId) ?? c.personId,
    }));

    const personIds = Array.from(new Set(resolvedCells.map((c) => c.personId)));
    const eventIds = Array.from(new Set(resolvedCells.map((c) => c.eventId)));

    const [persons, events] = await Promise.all([
      prisma.giftPerson.findMany({ where: { id: { in: personIds } } }),
      prisma.giftEvent.findMany({ where: { id: { in: eventIds } } }),
    ]);
    if (persons.length !== personIds.length) throw new NotFoundError("Gift person not found");
    if (events.length !== eventIds.length) throw new NotFoundError("Gift event not found");
    for (const p of persons)
      if (p.householdId !== householdId) throw new NotFoundError("Gift person not found");
    for (const e of events)
      if (e.householdId !== householdId) throw new NotFoundError("Gift event not found");

    // Pre-count existing to classify creates vs updates
    const existingAllocations = await prisma.giftAllocation.findMany({
      where: {
        householdId,
        OR: resolvedCells.map((c) => ({ giftPersonId: c.personId, giftEventId: c.eventId })),
      },
      select: { giftPersonId: true, giftEventId: true },
    });
    const existingKeys = new Set(
      existingAllocations.map((e) => `${e.giftPersonId}:${e.giftEventId}`)
    );
    let created = 0;
    let updated = 0;
    for (const cell of resolvedCells) {
      if (existingKeys.has(`${cell.personId}:${cell.eventId}`)) updated++;
      else created++;
    }

    await prisma.$transaction(async (tx) => {
      for (const cell of resolvedCells) {
        await tx.giftAllocation.upsert({
          where: {
            giftPersonId_giftEventId_year: {
              giftPersonId: cell.personId,
              giftEventId: cell.eventId,
              year: cell.year,
            },
          },
          create: {
            householdId,
            giftPersonId: cell.personId,
            giftEventId: cell.eventId,
            year: cell.year,
            planned: cell.planned,
          },
          update: { planned: cell.planned },
        });
      }
      const changes = [
        ...(created > 0 ? [{ field: "created", after: created }] : []),
        ...(updated > 0 ? [{ field: "updated", after: updated }] : []),
      ];
      await tx.auditLog.create({
        data: {
          householdId: ctx.householdId,
          actorId: ctx.actorId,
          actorName: ctx.actorName,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          action: AuditAction.UPSERT_GIFT_ALLOCATIONS,
          resource: "gift-allocation",
          resourceId: "bulk",
          changes,
        },
      });
    });
    return { count: resolvedCells.length };
  },

  // ─── Budget ─────────────────────────────────────────────────────────────────
  async setAnnualBudget(householdId: string, year: number, input: SetGiftBudgetInput) {
    this._assertCurrentYear(year);
    let settings = await this.getOrCreateSettings(householdId);
    await prisma.plannerYearBudget.upsert({
      where: { householdId_year: { householdId, year } },
      create: { householdId, year, giftBudget: input.annualBudget },
      update: { giftBudget: input.annualBudget },
    });

    if (settings.mode === "synced" && !settings.syncedDiscretionaryItemId) {
      settings = await this._ensureSyncedDiscretionaryItem(householdId, settings);
    }

    if (settings.mode === "synced" && settings.syncedDiscretionaryItemId) {
      const startDate = new Date(Date.UTC(year, 0, 1));
      await prisma.itemAmountPeriod.upsert({
        where: {
          itemType_itemId_startDate: {
            itemType: "discretionary_item",
            itemId: settings.syncedDiscretionaryItemId,
            startDate,
          },
        },
        create: {
          itemType: "discretionary_item",
          itemId: settings.syncedDiscretionaryItemId,
          startDate,
          endDate: null,
          amount: input.annualBudget,
        },
        update: { amount: input.annualBudget },
      });
    }

    return { annualBudget: input.annualBudget };
  },

  // ─── Reads ──────────────────────────────────────────────────────────────────
  async getPersonDetail(householdId: string, personId: string, year: number) {
    // Virtual `member:<memberId>` IDs are returned by getPlannerState for
    // household members that don't yet have a GiftPerson record. Resolve to an
    // existing GiftPerson if one has since been created, otherwise synthesize
    // an empty detail view without creating state on a read.
    if (personId.startsWith("member:")) {
      const memberId = personId.slice("member:".length);
      const member = await prisma.member.findUnique({ where: { id: memberId } });
      assertOwned(member, householdId, "Gift person");
      const linked = await prisma.giftPerson.findFirst({
        where: { householdId, memberId },
      });
      if (linked) {
        personId = linked.id;
      } else {
        const events = await prisma.giftEvent.findMany({
          where: { householdId },
          orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }],
        });
        const rows = events.map((e) => ({
          id: null,
          giftPersonId: personId,
          giftEventId: e.id,
          eventName: e.name,
          eventDateType: e.dateType,
          eventIsLocked: e.isLocked,
          year,
          planned: 0,
          spent: null,
          status: "planned" as const,
          notes: null,
          dateMonth: null,
          dateDay: null,
          resolvedMonth: e.dateType === "shared" ? (e.dateMonth ?? null) : null,
          resolvedDay: e.dateType === "shared" ? (e.dateDay ?? null) : null,
        }));
        return {
          person: {
            id: personId,
            name: member!.name,
            notes: null,
            sortOrder: 999,
            isHouseholdMember: true,
            plannedCount: 0,
            boughtCount: 0,
            plannedTotal: 0,
            spentTotal: 0,
            hasOverspend: false,
          },
          allocations: rows,
        };
      }
    }

    const person = await prisma.giftPerson.findUnique({ where: { id: personId } });
    assertOwned(person, householdId, "Gift person");
    const [events, allocations] = await Promise.all([
      prisma.giftEvent.findMany({
        where: { householdId },
        orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }],
      }),
      prisma.giftAllocation.findMany({
        where: { householdId, giftPersonId: personId, year },
      }),
    ]);

    const allocByEventId = new Map(allocations.map((a) => [a.giftEventId, a]));
    const rows = events.map((e) => {
      const a = allocByEventId.get(e.id);
      const dateMonth = a?.dateMonth ?? null;
      const dateDay = a?.dateDay ?? null;
      const resolvedMonth =
        e.dateType === "shared" ? (dateMonth ?? e.dateMonth ?? null) : dateMonth;
      const resolvedDay = e.dateType === "shared" ? (dateDay ?? e.dateDay ?? null) : dateDay;
      return {
        id: a?.id ?? null,
        giftPersonId: personId,
        giftEventId: e.id,
        eventName: e.name,
        eventDateType: e.dateType,
        eventIsLocked: e.isLocked,
        year,
        planned: a?.planned ?? 0,
        spent: a?.spent ?? null,
        status: a?.status ?? "planned",
        notes: a?.notes ?? null,
        dateMonth,
        dateDay,
        resolvedMonth,
        resolvedDay,
      };
    });

    return {
      person: {
        id: person!.id,
        name: person!.name,
        notes: person!.notes,
        sortOrder: person!.sortOrder,
        isHouseholdMember: person!.memberId !== null,
        plannedCount: rows.filter((r) => r.status === "planned" && r.id !== null).length,
        boughtCount: rows.filter((r) => r.status === "bought").length,
        plannedTotal: rows.reduce((s, r) => s + r.planned, 0),
        spentTotal: rows.reduce((s, r) => s + (r.spent ?? 0), 0),
        hasOverspend: rows.some((r) => r.spent !== null && r.spent > r.planned),
      },
      allocations: rows,
    };
  },

  async listEventsForConfig(householdId: string) {
    return prisma.giftEvent.findMany({
      where: { householdId },
      orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  },

  async listPeopleForConfig(
    householdId: string,
    filter: "all" | "household" | "non-household" = "all",
    year: number = new Date().getFullYear()
  ) {
    const where: Record<string, unknown> = { householdId };
    if (filter === "household") where.memberId = { not: null };
    if (filter === "non-household") where.memberId = null;
    const [giftPeople, members] = await Promise.all([
      prisma.giftPerson.findMany({
        where,
        include: {
          allocations: {
            where: { year },
            select: { status: true },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      // Only fetch members when they could be relevant (all or household filter)
      filter !== "non-household"
        ? prisma.member.findMany({
            where: { householdId },
            orderBy: [{ name: "asc" }],
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const mapped = giftPeople.map((p) => ({
      id: p.id,
      name: p.name,
      notes: p.notes,
      sortOrder: p.sortOrder,
      memberId: p.memberId,
      plannedCount: p.allocations.filter((a) => a.status === "planned").length,
      boughtCount: p.allocations.filter((a) => a.status === "bought").length,
    }));

    // Merge household members that don't already have a GiftPerson record
    const linkedMemberIds = new Set(giftPeople.filter((p) => p.memberId).map((p) => p.memberId!));
    const missingMembers = members
      .filter((m) => !linkedMemberIds.has(m.id))
      .map((m) => ({
        id: `member:${m.id}`,
        name: m.name,
        notes: null,
        sortOrder: 999,
        memberId: m.id,
        plannedCount: 0,
        boughtCount: 0,
      }));

    return [...mapped, ...missingMembers];
  },

  async getQuickAddMatrix(householdId: string, year: number) {
    const [giftPeople, members, events, allocations, budgetRow] = await Promise.all([
      prisma.giftPerson.findMany({
        where: { householdId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, memberId: true },
      }),
      prisma.member.findMany({
        where: { householdId },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.giftEvent.findMany({
        where: { householdId },
        orderBy: [{ isLocked: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.giftAllocation.findMany({
        where: { householdId, year },
        select: { giftPersonId: true, giftEventId: true, planned: true },
      }),
      prisma.plannerYearBudget.findUnique({
        where: { householdId_year: { householdId, year } },
        select: { giftBudget: true },
      }),
    ]);

    // Merge household members that don't already have a GiftPerson record
    const linkedMemberIds = new Set(giftPeople.filter((p) => p.memberId).map((p) => p.memberId!));
    const missingMembers = members
      .filter((m) => !linkedMemberIds.has(m.id))
      .map((m) => ({ id: `member:${m.id}`, name: m.name, memberId: m.id }));

    const people = [...giftPeople, ...missingMembers];
    const currentPlanned = allocations.reduce((s, a) => s + (a.planned ?? 0), 0);

    return {
      people,
      events,
      allocations: allocations.map((a) => ({
        personId: a.giftPersonId,
        eventId: a.giftEventId,
        planned: a.planned ?? 0,
      })),
      budget: {
        annual: budgetRow?.giftBudget ?? 0,
        currentPlanned,
      },
    };
  },

  async listYearsWithData(householdId: string) {
    const rows = await prisma.plannerYearBudget.findMany({
      where: { householdId },
      orderBy: { year: "desc" },
      select: { year: true },
    });
    return rows.map((r) => r.year);
  },

  async getPlannerState(householdId: string, year: number, userId: string) {
    const [settings, budgetRow, persons, allocations, dismissal, members] = await Promise.all([
      this.getOrCreateSettings(householdId),
      prisma.plannerYearBudget.findUnique({
        where: { householdId_year: { householdId, year } },
      }),
      prisma.giftPerson.findMany({
        where: { householdId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.giftAllocation.findMany({ where: { householdId, year } }),
      prisma.giftRolloverDismissal.findUnique({
        where: { householdId_userId_year: { householdId, userId, year } },
      }),
      prisma.member.findMany({
        where: { householdId },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true },
      }),
    ]);

    const annualBudget = budgetRow?.giftBudget ?? 0;
    const plannedTotal = allocations.reduce((s, a) => s + (a.planned ?? 0), 0);
    const spentTotal = allocations.reduce((s, a) => s + (a.spent ?? 0), 0);

    const allocationsByPerson = new Map<string, typeof allocations>();
    for (const a of allocations) {
      const arr = allocationsByPerson.get(a.giftPersonId) ?? [];
      arr.push(a);
      allocationsByPerson.set(a.giftPersonId, arr);
    }

    const people = persons.map((p) => {
      const items = allocationsByPerson.get(p.id) ?? [];
      const plannedCount = items.filter((i) => i.status === "planned").length;
      const boughtCount = items.filter((i) => i.status === "bought").length;
      const plannedRowTotal = items.reduce((s, i) => s + (i.planned ?? 0), 0);
      const spentRowTotal = items.reduce((s, i) => s + (i.spent ?? 0), 0);
      const hasOverspend = items.some(
        (i) => i.spent !== null && i.spent !== undefined && i.spent > (i.planned ?? 0)
      );
      return {
        id: p.id,
        name: p.name,
        notes: p.notes,
        sortOrder: p.sortOrder,
        isHouseholdMember: p.memberId !== null,
        plannedCount,
        boughtCount,
        plannedTotal: plannedRowTotal,
        spentTotal: spentRowTotal,
        hasOverspend,
      };
    });

    // Merge household members that don't already have a GiftPerson record
    const linkedMemberIds = new Set(persons.filter((p) => p.memberId).map((p) => p.memberId!));
    const missingMembers = members
      .filter((m) => !linkedMemberIds.has(m.id))
      .map((m) => ({
        id: `member:${m.id}`,
        name: m.name,
        notes: null,
        sortOrder: 999,
        isHouseholdMember: true,
        plannedCount: 0,
        boughtCount: 0,
        plannedTotal: 0,
        spentTotal: 0,
        hasOverspend: false,
      }));

    const allPeople = [...people, ...missingMembers];

    return {
      mode: settings.mode,
      year,
      isReadOnly: year < new Date().getFullYear(),
      budget: {
        annualBudget,
        planned: plannedTotal,
        spent: spentTotal,
        plannedOverBudgetBy: Math.max(0, plannedTotal - annualBudget),
        spentOverBudgetBy: Math.max(0, spentTotal - annualBudget),
      },
      people: allPeople,
      rolloverPending: dismissal === null && (await this._isRolloverPending(householdId, year)),
    };
  },

  async _isRolloverPending(householdId: string, year: number): Promise<boolean> {
    if (year !== new Date().getFullYear()) return false;
    const current = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year } },
    });
    if (!current) return false;
    const prior = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year: year - 1 } },
    });
    return prior !== null;
  },

  // ─── Upcoming view ──────────────────────────────────────────────────────────
  async getUpcoming(householdId: string, year: number) {
    const allocations = await prisma.giftAllocation.findMany({
      where: { householdId, year, status: { not: "skipped" } },
      include: { giftPerson: true, giftEvent: true },
    });

    type Row = {
      eventId: string;
      eventName: string;
      eventDateType: "shared" | "personal";
      day: number | null;
      month: number;
      recipients: Array<{
        personId: string;
        personName: string;
        planned: number;
        spent: number | null;
      }>;
      plannedTotal: number;
      spentTotal: number | null;
    };
    const groups = new Map<number, Map<string, Row>>();
    const datelessRows: Row[] = [];
    const callouts = {
      thisMonth: { count: 0, total: 0 },
      nextThreeMonths: { count: 0, total: 0 },
      restOfYear: { count: 0, total: 0 },
      dateless: { count: 0, total: 0 },
    };
    const currentMonth = new Date().getMonth() + 1;

    for (const a of allocations) {
      const event = (a as any).giftEvent;
      const person = (a as any).giftPerson;
      const month =
        event.dateType === "shared"
          ? (a.dateMonth ?? event.dateMonth ?? null)
          : (a.dateMonth ?? null);
      const day =
        event.dateType === "shared" ? (a.dateDay ?? event.dateDay ?? null) : (a.dateDay ?? null);

      if (month === null) {
        callouts.dateless.count += 1;
        callouts.dateless.total += a.planned ?? 0;
        datelessRows.push({
          eventId: event.id,
          eventName: event.name,
          eventDateType: event.dateType,
          day: null,
          month: 0,
          recipients: [
            {
              personId: person.id,
              personName: person.name,
              planned: a.planned,
              spent: a.spent,
            },
          ],
          plannedTotal: a.planned,
          spentTotal: a.spent,
        });
        continue;
      }

      if (month === currentMonth) {
        callouts.thisMonth.count += 1;
        callouts.thisMonth.total += a.planned ?? 0;
      } else if (month > currentMonth && month <= currentMonth + 3) {
        callouts.nextThreeMonths.count += 1;
        callouts.nextThreeMonths.total += a.planned ?? 0;
      } else if (month > currentMonth + 3) {
        callouts.restOfYear.count += 1;
        callouts.restOfYear.total += a.planned ?? 0;
      }

      const monthMap = groups.get(month) ?? new Map<string, Row>();
      const key =
        event.dateType === "shared"
          ? `${event.id}-${month}-${day ?? "x"}`
          : `${event.id}-${person.id}-${day ?? "x"}`;
      const existing = monthMap.get(key);
      if (existing) {
        existing.recipients.push({
          personId: person.id,
          personName: person.name,
          planned: a.planned,
          spent: a.spent,
        });
        existing.plannedTotal += a.planned ?? 0;
        existing.spentTotal = (existing.spentTotal ?? 0) + (a.spent ?? 0);
      } else {
        monthMap.set(key, {
          eventId: event.id,
          eventName: event.name,
          eventDateType: event.dateType,
          day,
          month,
          recipients: [
            {
              personId: person.id,
              personName: person.name,
              planned: a.planned,
              spent: a.spent,
            },
          ],
          plannedTotal: a.planned,
          spentTotal: a.spent,
        });
      }
      groups.set(month, monthMap);
    }

    const groupedArr = Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([month, rowMap]) => ({
        month,
        rows: Array.from(rowMap.values()).sort((a, b) => (a.day ?? 99) - (b.day ?? 99)),
      }));

    if (datelessRows.length > 0) {
      groupedArr.push({ month: 0, rows: datelessRows });
    }

    return { callouts, groups: groupedArr };
  },

  // ─── Year rollover (lazy) ───────────────────────────────────────────────────
  async runRolloverIfNeeded(householdId: string, year: number): Promise<boolean> {
    if (year !== new Date().getFullYear()) return false;
    const current = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year } },
    });
    if (current) return false;
    const prior = await prisma.plannerYearBudget.findUnique({
      where: { householdId_year: { householdId, year: year - 1 } },
    });
    if (!prior) return false;

    const priorAllocations = await prisma.giftAllocation.findMany({
      where: { householdId, year: year - 1 },
    });

    await prisma.plannerYearBudget.create({
      data: { householdId, year, giftBudget: prior.giftBudget },
    });

    if (priorAllocations.length > 0) {
      await prisma.giftAllocation.createMany({
        data: priorAllocations.map((a) => ({
          householdId,
          giftPersonId: a.giftPersonId,
          giftEventId: a.giftEventId,
          year,
          planned: a.planned,
          spent: null,
          status: "planned" as const,
          notes: a.notes,
          dateMonth: a.dateMonth,
          dateDay: a.dateDay,
        })),
      });
    }

    let settings = await this.getOrCreateSettings(householdId);
    if (settings.mode === "synced" && !settings.syncedDiscretionaryItemId) {
      settings = await this._ensureSyncedDiscretionaryItem(householdId, settings);
    }
    if (settings.mode === "synced" && settings.syncedDiscretionaryItemId) {
      await prisma.itemAmountPeriod.upsert({
        where: {
          itemType_itemId_startDate: {
            itemType: "discretionary_item",
            itemId: settings.syncedDiscretionaryItemId,
            startDate: new Date(Date.UTC(year, 0, 1)),
          },
        },
        create: {
          itemType: "discretionary_item",
          itemId: settings.syncedDiscretionaryItemId,
          startDate: new Date(Date.UTC(year, 0, 1)),
          endDate: null,
          amount: prior.giftBudget,
        },
        update: { amount: prior.giftBudget },
      });
    }

    return true;
  },

  async dismissRolloverNotification(householdId: string, userId: string, year: number) {
    await prisma.giftRolloverDismissal.upsert({
      where: { householdId_userId_year: { householdId, userId, year } },
      create: { householdId, userId, year },
      update: {},
    });
  },

  // ─── Mode switch ────────────────────────────────────────────────────────────
  async setMode(householdId: string, input: { mode: GiftPlannerMode }, _ctx?: ActorCtx) {
    const settings = await this.getOrCreateSettings(householdId);
    if (settings.mode === input.mode) return settings;

    const giftsSubcategory = await prisma.subcategory.findFirst({
      where: { householdId, tier: "discretionary", name: "Gifts" },
    });
    if (!giftsSubcategory) throw new NotFoundError("Gifts subcategory not found");

    if (settings.mode === "synced" && input.mode === "independent") {
      const itemId = settings.syncedDiscretionaryItemId;
      await prisma.$transaction(async (tx) => {
        if (itemId) {
          await tx.itemAmountPeriod.deleteMany({
            where: { itemType: "discretionary_item", itemId },
          });
          await tx.discretionaryItem.delete({ where: { id: itemId } });
        }
        await tx.subcategory.update({
          where: { id: giftsSubcategory.id },
          data: { lockedByPlanner: false },
        });
        await tx.giftPlannerSettings.update({
          where: { id: settings.id },
          data: { mode: "independent", syncedDiscretionaryItemId: null },
        });
      });
      return { ...settings, mode: "independent" as const, syncedDiscretionaryItemId: null };
    }

    // independent → synced
    return this._ensureSyncedDiscretionaryItem(householdId, {
      ...settings,
      mode: "synced",
      syncedDiscretionaryItemId: null,
    });
  },
};
