import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { audited, computeDiff } from "./audit.service.js";
import type { ActorCtx } from "./audit.service.js";
import { findEffectivePeriod } from "./period.service.js";
import { compoundForwardYears } from "./forecast.service.js";
import { toMonthlyAmount } from "@finplan/shared";
import type {
  LinkableAccountRow,
  BulkUpdateLinkedAccountsInput,
  CashflowProjection,
  CashflowMonthDetail,
  CashflowEventItemType,
  CashflowShortfall,
  CashflowShortfallQuery,
  ShortfallItem,
} from "@finplan/shared";

const LINKABLE_TYPES = ["Current", "Savings"] as const;
const MAX_PROJECTION_MONTHS = 24;

function toLinkableRow(account: {
  id: string;
  name: string;
  type: string;
  isCashflowLinked: boolean;
}): Omit<LinkableAccountRow, "latestBalance" | "latestBalanceDate"> {
  return {
    id: account.id,
    name: account.name,
    type: account.type as "Current" | "Savings",
    isCashflowLinked: account.isCashflowLinked,
  };
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface ProjectionEvent {
  date: Date;
  amount: number; // signed
  itemType: CashflowEventItemType;
  label: string;
  itemId: string;
}

/** Disposal source row used to derive a one-off liquidation cashflow event. */
interface DisposalSource {
  kind: "asset" | "account";
  id: string;
  name: string;
  disposedAt: Date;
  disposalAccountId: string;
  startBalance: number;
  startBalanceDate: Date | null; // null if no balance recorded yet
  /** Effective annual growth rate (decimal, e.g. 0.05 for 5%). */
  annualRate: number;
}

const DEFAULT_RATES = {
  currentRatePct: 0,
  savingsRatePct: 4,
  investmentRatePct: 7,
  pensionRatePct: 6,
};

function defaultAccountRate(type: string, override: number | null): number {
  if (override != null) return override / 100;
  switch (type) {
    case "Current":
      return DEFAULT_RATES.currentRatePct / 100;
    case "Savings":
      return DEFAULT_RATES.savingsRatePct / 100;
    case "StocksAndShares":
      return DEFAULT_RATES.investmentRatePct / 100;
    case "Pension":
      return DEFAULT_RATES.pensionRatePct / 100;
    default:
      return 0;
  }
}

/**
 * Compute a liquidation event for a disposal source whose date falls inside the
 * visible window AND whose target account is cashflow-linked. Returns null if
 * the disposal is outside the window or has no recorded starting balance.
 */
function buildLiquidationEvent(
  source: DisposalSource,
  from: Date,
  to: Date,
  linkedAccountIds: Set<string>,
  now: Date
): ProjectionEvent | null {
  if (!linkedAccountIds.has(source.disposalAccountId)) return null;
  if (source.disposedAt < from || source.disposedAt >= to) return null;
  // No balance recorded → skip (we can't project from nothing).
  if (source.startBalanceDate == null) return null;
  const yearsForward =
    (source.disposedAt.getTime() - Math.max(source.startBalanceDate.getTime(), now.getTime())) /
    (365.25 * 24 * 60 * 60 * 1000);
  const projectedValue = compoundForwardYears(source.startBalance, source.annualRate, yearsForward);
  return {
    date: source.disposedAt,
    amount: Math.round(projectedValue * 100) / 100,
    itemType: source.kind === "asset" ? "asset_liquidation" : "account_liquidation",
    label: `Sell ${source.name}`,
    itemId: source.id,
  };
}

interface ProjectionInput {
  startYear?: number;
  startMonth?: number;
  monthCount: number;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function startOfMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m - 1, 1));
}

function periodActiveOn(periods: Array<any>, date: Date): number {
  const eff = findEffectivePeriod(periods, date);
  return eff?.amount ?? 0;
}

function buildEvents(
  from: Date,
  to: Date,
  income: Array<any>,
  committed: Array<any>,
  discretionary: Array<any>,
  periodsByKey: Map<string, any[]>,
  disposalSources: DisposalSource[] = [],
  linkedAccountIds: Set<string> = new Set(),
  now: Date = new Date()
): ProjectionEvent[] {
  const events: ProjectionEvent[] = [];

  function expandRecurring(
    item: any,
    itemType: "income_source" | "committed_item",
    sign: 1 | -1,
    frequencyKey: "monthly" | "annual" | "yearly" | "one_off" | "weekly" | "quarterly"
  ) {
    const periods = periodsByKey.get(`${itemType}:${item.id}`) ?? [];
    const due: Date = item.dueDate;
    if (frequencyKey === "monthly") {
      const day = due.getUTCDate();
      const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day));
      while (cursor < to) {
        if (cursor >= from) {
          const amount = periodActiveOn(periods, cursor);
          if (amount > 0)
            events.push({
              date: new Date(cursor),
              amount: sign * amount,
              itemType,
              label: item.name,
              itemId: item.id,
            });
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else if (frequencyKey === "weekly") {
      // Anchor on the weekday of dueDate. Find the first occurrence on-or-after max(from, due).
      const anchorDate = due > from ? due : from;
      const cursor = new Date(anchorDate);
      // Advance to the first matching weekday >= anchorDate
      const targetDay = due.getUTCDay(); // 0=Sun ... 6=Sat
      while (cursor.getUTCDay() !== targetDay) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      while (cursor < to) {
        const amount = periodActiveOn(periods, cursor);
        if (amount > 0)
          events.push({
            date: new Date(cursor),
            amount: sign * amount,
            itemType,
            label: item.name,
            itemId: item.id,
          });
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    } else if (frequencyKey === "annual" || frequencyKey === "yearly") {
      const month = due.getUTCMonth();
      const day = due.getUTCDate();
      // Anchor at the later of (visible window start year, item's first occurrence year)
      // so a future-dated annual bill never emits phantom past occurrences.
      let year = Math.max(from.getUTCFullYear(), due.getUTCFullYear());
      while (true) {
        const occ = new Date(Date.UTC(year, month, day));
        if (occ >= to) break;
        if (occ >= from && occ >= due) {
          const amount = periodActiveOn(periods, occ);
          if (amount > 0)
            events.push({
              date: occ,
              amount: sign * amount,
              itemType,
              label: item.name,
              itemId: item.id,
            });
        }
        year++;
      }
    } else if (frequencyKey === "quarterly") {
      const day = due.getUTCDate();
      // Anchor at the later of (visible window start, item's first occurrence)
      const anchorDate = due > from ? due : from;
      // Step from due date in 3-month increments until we reach anchorDate
      let curYear = due.getUTCFullYear();
      let curMonth = due.getUTCMonth();
      while (true) {
        const occ = new Date(Date.UTC(curYear, curMonth, day));
        if (occ >= anchorDate) break;
        curMonth += 3;
        if (curMonth >= 12) {
          curYear++;
          curMonth -= 12;
        }
      }
      while (true) {
        const occ = new Date(Date.UTC(curYear, curMonth, day));
        if (occ >= to) break;
        if (occ >= from && occ >= due) {
          const amount = periodActiveOn(periods, occ);
          if (amount > 0)
            events.push({
              date: occ,
              amount: sign * amount,
              itemType,
              label: item.name,
              itemId: item.id,
            });
        }
        curMonth += 3;
        if (curMonth >= 12) {
          curYear++;
          curMonth -= 12;
        }
      }
    } else {
      // one_off
      if (due >= from && due < to) {
        const amount = periodActiveOn(periods, due);
        if (amount > 0)
          events.push({
            date: due,
            amount: sign * amount,
            itemType,
            label: item.name,
            itemId: item.id,
          });
      }
    }
  }

  for (const i of income) expandRecurring(i, "income_source", 1, i.frequency);
  for (const c of committed) expandRecurring(c, "committed_item", -1, c.spendType);

  for (const d of discretionary) {
    if (d.spendType !== "one_off" || !d.dueDate) continue;
    if (d.dueDate >= from && d.dueDate < to) {
      const periods = periodsByKey.get(`discretionary_item:${d.id}`) ?? [];
      const amount = periodActiveOn(periods, d.dueDate);
      if (amount > 0)
        events.push({
          date: d.dueDate,
          amount: -amount,
          itemType: "discretionary_item",
          label: d.name,
          itemId: d.id,
        });
    }
  }

  for (const source of disposalSources) {
    const ev = buildLiquidationEvent(source, from, to, linkedAccountIds, now);
    if (ev) events.push(ev);
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

/**
 * Load disposal sources (assets + accounts with `disposedAt` set) for the
 * household, joined with their latest balance and effective annual rate.
 */
async function loadDisposalSources(householdId: string): Promise<DisposalSource[]> {
  const [assets, accounts, settingsRow] = await Promise.all([
    prisma.asset.findMany({
      where: { householdId, disposedAt: { not: null }, disposalAccountId: { not: null } },
      include: { balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 } },
    }),
    prisma.account.findMany({
      where: { householdId, disposedAt: { not: null }, disposalAccountId: { not: null } },
      include: { balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 } },
    }),
    prisma.householdSettings.findUnique({ where: { householdId } }),
  ]);

  const overrides = {
    currentRatePct: settingsRow?.currentRatePct ?? DEFAULT_RATES.currentRatePct,
    savingsRatePct: settingsRow?.savingsRatePct ?? DEFAULT_RATES.savingsRatePct,
    investmentRatePct: settingsRow?.investmentRatePct ?? DEFAULT_RATES.investmentRatePct,
    pensionRatePct: settingsRow?.pensionRatePct ?? DEFAULT_RATES.pensionRatePct,
  };
  void overrides; // reserved for future per-type override hooks

  const sources: DisposalSource[] = [];

  for (const a of assets) {
    if (!a.disposedAt || !a.disposalAccountId) continue;
    const latest = a.balances[0];
    sources.push({
      kind: "asset",
      id: a.id,
      name: a.name,
      disposedAt: a.disposedAt,
      disposalAccountId: a.disposalAccountId,
      startBalance: latest?.value ?? 0,
      startBalanceDate: latest?.date ?? null,
      annualRate: a.growthRatePct != null ? a.growthRatePct / 100 : 0,
    });
  }

  for (const acc of accounts) {
    if (!acc.disposedAt || !acc.disposalAccountId) continue;
    const latest = acc.balances[0];
    sources.push({
      kind: "account",
      id: acc.id,
      name: acc.name,
      disposedAt: acc.disposedAt,
      disposalAccountId: acc.disposalAccountId,
      startBalance: latest?.value ?? 0,
      startBalanceDate: latest?.date ?? null,
      annualRate: defaultAccountRate(acc.type, acc.growthRatePct),
    });
  }

  return sources;
}

function computeMonthlyDiscretionaryBaseline(
  discretionary: Array<any>,
  periodsByKey: Map<string, any[]>,
  refDate: Date
): number {
  let total = 0;
  for (const d of discretionary) {
    if (d.spendType === "one_off") continue;
    const periods = periodsByKey.get(`discretionary_item:${d.id}`) ?? [];
    const amount = periodActiveOn(periods, refDate);
    total += toMonthlyAmount(amount, d.spendType);
  }
  return total;
}

async function loadPlanContext(householdId: string) {
  const [income, committed, discretionary, disposalSources] = await Promise.all([
    prisma.incomeSource.findMany({ where: { householdId } }),
    prisma.committedItem.findMany({ where: { householdId } }),
    prisma.discretionaryItem.findMany({ where: { householdId } }),
    loadDisposalSources(householdId),
  ]);
  const allRefs = [
    ...income.map((i) => ({ type: "income_source", id: i.id })),
    ...committed.map((c) => ({ type: "committed_item", id: c.id })),
    ...discretionary.map((d) => ({ type: "discretionary_item", id: d.id })),
  ];
  const periods =
    allRefs.length > 0
      ? await prisma.itemAmountPeriod.findMany({
          where: { OR: allRefs.map((r) => ({ itemType: r.type as any, itemId: r.id })) },
          orderBy: { startDate: "asc" },
        })
      : [];
  const periodsByKey = new Map<string, any[]>();
  for (const p of periods) {
    const k = `${p.itemType}:${p.itemId}`;
    const arr = periodsByKey.get(k) ?? [];
    arr.push(p);
    periodsByKey.set(k, arr);
  }
  return { income, committed, discretionary, periodsByKey, disposalSources };
}

export const cashflowService = {
  async listLinkableAccounts(householdId: string): Promise<LinkableAccountRow[]> {
    const accounts = await prisma.account.findMany({
      where: { householdId, type: { in: ["Current", "Savings"] } },
      include: {
        balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 },
      },
      orderBy: { name: "asc" },
    });

    return accounts.map((a) => {
      const latest = a.balances[0] ?? null;
      return {
        id: a.id,
        name: a.name,
        type: a.type as "Current" | "Savings",
        isCashflowLinked: a.isCashflowLinked,
        latestBalance: latest?.value ?? null,
        latestBalanceDate: latest ? toIsoDate(latest.date) : null,
      };
    });
  },

  async updateAccountCashflowLink(
    householdId: string,
    accountId: string,
    isCashflowLinked: boolean,
    ctx: ActorCtx
  ): Promise<Omit<LinkableAccountRow, "latestBalance" | "latestBalanceDate">> {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.householdId !== householdId) {
      throw new NotFoundError("Account not found");
    }
    if (!LINKABLE_TYPES.includes(account.type as (typeof LINKABLE_TYPES)[number])) {
      throw new ValidationError("Only Current and Savings accounts can be linked to Cashflow");
    }

    const updated = await audited({
      db: prisma,
      ctx,
      action: "UPDATE_ACCOUNT_CASHFLOW_LINK",
      resource: "account",
      resourceId: accountId,
      beforeFetch: async (tx) =>
        tx.account.findUnique({
          where: { id: accountId },
          select: { isCashflowLinked: true },
        }) as Promise<Record<string, unknown> | null>,
      mutation: async (tx) =>
        tx.account.update({
          where: { id: accountId },
          data: { isCashflowLinked },
        }),
    });

    return toLinkableRow(updated);
  },

  async bulkUpdateLinkedAccounts(
    householdId: string,
    input: BulkUpdateLinkedAccountsInput,
    ctx: ActorCtx
  ): Promise<Array<Omit<LinkableAccountRow, "latestBalance" | "latestBalanceDate">>> {
    const ids = input.updates.map((u) => u.accountId);
    const accounts = await prisma.account.findMany({
      where: { id: { in: ids }, householdId },
    });

    if (accounts.length !== ids.length) {
      throw new NotFoundError("One or more accounts not found");
    }
    for (const acc of accounts) {
      if (!LINKABLE_TYPES.includes(acc.type as (typeof LINKABLE_TYPES)[number])) {
        throw new ValidationError("One or more accounts cannot be linked to Cashflow");
      }
    }

    return prisma.$transaction(async (tx) => {
      const results: Array<Omit<LinkableAccountRow, "latestBalance" | "latestBalanceDate">> = [];
      for (const update of input.updates) {
        const beforeState = (await tx.account.findUnique({
          where: { id: update.accountId },
          select: { isCashflowLinked: true },
        })) as Record<string, unknown> | null;

        const updated = await tx.account.update({
          where: { id: update.accountId },
          data: { isCashflowLinked: update.isCashflowLinked },
        });

        const changes = computeDiff(beforeState, {
          isCashflowLinked: updated.isCashflowLinked,
        });

        await (tx as any).auditLog.create({
          data: {
            householdId,
            actorId: ctx.actorId,
            actorName: ctx.actorName,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
            action: "UPDATE_ACCOUNT_CASHFLOW_LINK",
            resource: "account",
            resourceId: update.accountId,
            changes,
          },
        });

        results.push(toLinkableRow(updated));
      }
      return results;
    });
  },

  async getProjection(householdId: string, input: ProjectionInput): Promise<CashflowProjection> {
    const linked = await prisma.account.findMany({
      where: { householdId, isCashflowLinked: true, type: { in: ["Current", "Savings"] } },
      include: {
        balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 },
      },
    });
    const latestBalances = linked
      .map((a) => a.balances[0])
      .filter((b): b is NonNullable<typeof b> => b != null);
    const startingBalance = latestBalances.reduce((s, b) => s + b.value, 0);

    const youngest =
      latestBalances.length > 0 ? latestBalances.reduce((y, b) => (b.date > y.date ? b : y)) : null;
    const oldest =
      latestBalances.length > 0 ? latestBalances.reduce((o, b) => (b.date < o.date ? b : o)) : null;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const anchor = youngest?.date ?? today;

    const { income, committed, discretionary, periodsByKey, disposalSources } =
      await loadPlanContext(householdId);
    const linkedAccountIds = new Set(linked.map((a) => a.id));

    const startYear = input.startYear ?? today.getUTCFullYear();
    const startMonth = input.startMonth ?? today.getUTCMonth() + 1;
    const monthCount = input.monthCount;

    // Replay anchor → start of visible window so month 1 always opens at the
    // start-of-month balance. Two symmetric branches:
    //   - anchor < window start: walk forward, applying events.
    //   - anchor > window start: walk backward, inverting events. The user
    //     just updated their balance mid-month, and we need to derive the
    //     hypothetical 1st-of-month figure so the current month renders
    //     identically to every other month.
    const visibleWindowStart = startOfMonth(startYear, startMonth);
    let balance = startingBalance;
    if (anchor < visibleWindowStart) {
      const replayEvents = buildEvents(
        anchor,
        visibleWindowStart,
        income,
        committed,
        discretionary,
        periodsByKey,
        disposalSources,
        linkedAccountIds,
        today
      );
      const cursor = new Date(anchor);
      for (const e of replayEvents) {
        while (cursor < e.date) {
          const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
          balance -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        balance += e.amount;
      }
      while (cursor < visibleWindowStart) {
        const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
        balance -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    } else if (anchor > visibleWindowStart) {
      const replayEvents = buildEvents(
        visibleWindowStart,
        anchor,
        income,
        committed,
        discretionary,
        periodsByKey,
        disposalSources,
        linkedAccountIds,
        today
      );
      const eventsByDay = new Map<number, number>();
      for (const e of replayEvents) {
        const key = e.date.getTime();
        eventsByDay.set(key, (eventsByDay.get(key) ?? 0) + e.amount);
      }
      const cursor = new Date(anchor);
      while (cursor > visibleWindowStart) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
        balance += baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
        const evAmount = eventsByDay.get(cursor.getTime());
        if (evAmount !== undefined) {
          balance -= evAmount;
        }
      }
    }

    const months: CashflowProjection["months"] = [];
    let tightestDipValue = Infinity;
    let tightestDipDate: Date | null = null;
    let cursorYear = startYear;
    let cursorMonth = startMonth;
    let runningOpening = balance;

    for (let i = 0; i < monthCount; i++) {
      const monthStart = startOfMonth(cursorYear, cursorMonth);
      const monthEnd = new Date(Date.UTC(cursorYear, cursorMonth, 1));
      const monthEvents = buildEvents(
        monthStart,
        monthEnd,
        income,
        committed,
        discretionary,
        periodsByKey,
        disposalSources,
        linkedAccountIds,
        today
      );

      const dailyBaseline =
        computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, monthStart) /
        daysInMonth(cursorYear, cursorMonth);

      let intra = runningOpening;
      let monthLow = intra;
      let monthLowDay = 1;
      let eIdx = 0;
      const days = daysInMonth(cursorYear, cursorMonth);
      for (let day = 1; day <= days; day++) {
        const dayDate = new Date(Date.UTC(cursorYear, cursorMonth - 1, day));
        intra -= dailyBaseline;
        while (
          eIdx < monthEvents.length &&
          monthEvents[eIdx]!.date.getTime() === dayDate.getTime()
        ) {
          intra += monthEvents[eIdx]!.amount;
          eIdx++;
        }
        if (intra < monthLow) {
          monthLow = intra;
          monthLowDay = day;
        }
        if (intra < tightestDipValue) {
          tightestDipValue = intra;
          tightestDipDate = new Date(dayDate);
        }
      }
      const closingBalance = intra;
      const netChange = closingBalance - runningOpening;
      months.push({
        year: cursorYear,
        month: cursorMonth,
        netChange,
        openingBalance: runningOpening,
        closingBalance,
        dipBelowZero: monthLow < 0,
        tightestPoint: { value: monthLow, day: monthLowDay },
      });
      runningOpening = closingBalance;
      cursorMonth++;
      if (cursorMonth > 12) {
        cursorMonth = 1;
        cursorYear++;
      }
    }

    const projectedEndBalance = months[months.length - 1]?.closingBalance ?? balance;
    const avgMonthlySurplus =
      months.length > 0 ? months.reduce((s, m) => s + m.netChange, 0) / months.length : 0;

    return {
      startingBalance: balance,
      latestKnownBalance: startingBalance,
      windowStart: { year: startYear, month: startMonth },
      months,
      projectedEndBalance,
      tightestDip: {
        value: tightestDipValue === Infinity ? balance : tightestDipValue,
        date: tightestDipDate ? toIsoDate(tightestDipDate) : toIsoDate(today),
      },
      avgMonthlySurplus,
      oldestLinkedBalanceDate: oldest ? toIsoDate(oldest.date) : null,
      youngestLinkedBalanceDate: youngest ? toIsoDate(youngest.date) : null,
      linkedAccountCount: linked.length,
    };
  },

  async getMonthDetail(
    householdId: string,
    targetYear: number,
    targetMonth: number
  ): Promise<CashflowMonthDetail> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startYear = today.getUTCFullYear();
    const startMonth = today.getUTCMonth() + 1;
    const monthOffset = (targetYear - startYear) * 12 + (targetMonth - startMonth);
    if (monthOffset < 0 || monthOffset >= MAX_PROJECTION_MONTHS) {
      throw new NotFoundError("Month is outside the projection window");
    }
    const monthCount = monthOffset + 1;

    const projection = await this.getProjection(householdId, {
      startYear,
      startMonth,
      monthCount,
    });
    const month = projection.months.find((m) => m.year === targetYear && m.month === targetMonth);
    if (!month) {
      throw new NotFoundError("Month is outside the projection window");
    }

    const { income, committed, discretionary, periodsByKey, disposalSources } =
      await loadPlanContext(householdId);
    const linkedAccounts = await prisma.account.findMany({
      where: { householdId, isCashflowLinked: true, type: { in: ["Current", "Savings"] } },
      select: { id: true },
    });
    const linkedAccountIds = new Set(linkedAccounts.map((a) => a.id));

    const monthStart = startOfMonth(targetYear, targetMonth);
    const monthEnd = new Date(Date.UTC(targetYear, targetMonth, 1));
    const events = buildEvents(
      monthStart,
      monthEnd,
      income,
      committed,
      discretionary,
      periodsByKey,
      disposalSources,
      linkedAccountIds,
      today
    );

    const monthlyDiscretionaryTotal = computeMonthlyDiscretionaryBaseline(
      discretionary,
      periodsByKey,
      monthStart
    );
    const days = daysInMonth(targetYear, targetMonth);
    const amortisedDailyDiscretionary = monthlyDiscretionaryTotal / days;

    const dailyTrace: Array<{ day: number; balance: number }> = [];
    let intra = month.openingBalance;
    let eIdx = 0;
    const eventRows: CashflowMonthDetail["events"] = [];
    for (let day = 1; day <= days; day++) {
      const dayDate = new Date(Date.UTC(targetYear, targetMonth - 1, day));
      intra -= amortisedDailyDiscretionary;
      while (eIdx < events.length && events[eIdx]!.date.getTime() === dayDate.getTime()) {
        const ev = events[eIdx]!;
        intra += ev.amount;
        eventRows.push({
          date: toIsoDate(ev.date),
          label: ev.label,
          amount: ev.amount,
          itemType: ev.itemType,
          runningBalanceAfter: intra,
        });
        eIdx++;
      }
      dailyTrace.push({ day, balance: intra });
    }

    return {
      year: targetYear,
      month: targetMonth,
      startingBalance: month.openingBalance,
      endBalance: month.closingBalance,
      netChange: month.netChange,
      tightestPoint: month.tightestPoint,
      amortisedDailyDiscretionary,
      monthlyDiscretionaryTotal,
      dailyTrace,
      events: eventRows,
    };
  },

  async getShortfallItems(
    householdId: string,
    query: CashflowShortfallQuery
  ): Promise<CashflowShortfall> {
    const windowDays = query.windowDays;

    const linked = await prisma.account.findMany({
      where: { householdId, isCashflowLinked: true, type: { in: ["Current", "Savings"] } },
      include: {
        balances: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 },
      },
    });
    const latestBalances = linked
      .map((a) => a.balances[0])
      .filter((b): b is NonNullable<typeof b> => b != null);
    const startingBalance = latestBalances.reduce((s, b) => s + b.value, 0);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays);

    const { income, committed, discretionary, periodsByKey, disposalSources } =
      await loadPlanContext(householdId);
    const linkedAccountIds = new Set(linked.map((a) => a.id));

    // Anchor-replay to compute today's projected balance
    const youngest =
      latestBalances.length > 0 ? latestBalances.reduce((y, b) => (b.date > y.date ? b : y)) : null;
    const anchor = youngest?.date ?? today;

    let balanceToday = startingBalance;
    if (anchor < today) {
      const replay = buildEvents(
        anchor,
        today,
        income,
        committed,
        discretionary,
        periodsByKey,
        disposalSources,
        linkedAccountIds
      );
      const cursor = new Date(anchor);
      for (const e of replay) {
        while (cursor < e.date) {
          const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
          balanceToday -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        balanceToday += e.amount;
      }
      while (cursor < today) {
        const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
        balanceToday -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    } else if (anchor > today) {
      const replay = buildEvents(
        today,
        anchor,
        income,
        committed,
        discretionary,
        periodsByKey,
        disposalSources,
        linkedAccountIds
      );
      const eventsByDay = new Map<number, number>();
      for (const e of replay) {
        const key = e.date.getTime();
        eventsByDay.set(key, (eventsByDay.get(key) ?? 0) + e.amount);
      }
      const cursor = new Date(anchor);
      while (cursor > today) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
        balanceToday += baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
        const evAmount = eventsByDay.get(cursor.getTime());
        if (evAmount !== undefined) balanceToday -= evAmount;
      }
    }

    // Walk events within the window
    const events = buildEvents(
      today,
      windowEnd,
      income,
      committed,
      discretionary,
      periodsByKey,
      disposalSources,
      linkedAccountIds
    );
    const uncovered: ShortfallItem[] = [];
    let running = balanceToday;
    let lowestValue = balanceToday;
    let lowestDate = today;
    const cursor = new Date(today);
    let eIdx = 0;
    while (cursor < windowEnd) {
      const baseline = computeMonthlyDiscretionaryBaseline(discretionary, periodsByKey, cursor);
      running -= baseline / daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
      while (eIdx < events.length && events[eIdx]!.date.getTime() === cursor.getTime()) {
        const ev = events[eIdx]!;
        const newBalance = running + ev.amount;
        if (
          ev.amount < 0 &&
          newBalance < 0 &&
          ev.itemType !== "income_source" &&
          ev.itemType !== "asset_liquidation" &&
          ev.itemType !== "account_liquidation"
        ) {
          const tierKey: "committed" | "discretionary" =
            ev.itemType === "discretionary_item" ? "discretionary" : "committed";
          uncovered.push({
            itemType: ev.itemType,
            itemId: ev.itemId ?? "",
            itemName: ev.label,
            tierKey,
            dueDate: toIsoDate(ev.date),
            amount: -ev.amount,
          });
        }
        running = newBalance;
        eIdx++;
      }
      if (running < lowestValue) {
        lowestValue = running;
        lowestDate = new Date(cursor);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    uncovered.sort((a, b) => {
      const d = a.dueDate.localeCompare(b.dueDate);
      return d !== 0 ? d : a.itemName.localeCompare(b.itemName);
    });

    return {
      items: uncovered,
      balanceToday,
      lowest: { value: lowestValue, date: toIsoDate(lowestDate) },
      linkedAccountCount: linked.length,
    };
  },
};
