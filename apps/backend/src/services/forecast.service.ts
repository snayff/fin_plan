import { prisma } from "../config/database.js";
import { waterfallService } from "./waterfall.service.js";
import { toMonthlyAmount } from "@finplan/shared";
import type { ForecastProjection, ForecastHorizon } from "@finplan/shared";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function accountEffectiveRate(
  account: { growthRatePct: number | null; type: string },
  settings: {
    currentRatePct: number;
    savingsRatePct: number;
    investmentRatePct: number;
    pensionRatePct: number;
  }
): number {
  if (account.growthRatePct != null) return account.growthRatePct / 100;
  switch (account.type) {
    case "Current":
      return settings.currentRatePct / 100;
    case "Savings":
      return settings.savingsRatePct / 100;
    case "StocksAndShares":
      return settings.investmentRatePct / 100;
    case "Pension":
      return settings.pensionRatePct / 100;
    default:
      return 0;
  }
}

function assetEffectiveRate(asset: { growthRatePct: number | null }): number {
  return asset.growthRatePct != null ? asset.growthRatePct / 100 : 0;
}

/**
 * Convert a disposal date into "year offset from now". Returns:
 *   - null if no disposal set
 *   - 0 if already disposed (in the past)
 *   - integer year offset rounded down to the nearest year boundary otherwise
 *
 * Year-offset granularity matches the existing yearly-resolution forecast charts.
 */
function disposalYearOffset(disposedAt: Date | null, now: Date): number | null {
  if (disposedAt == null) return null;
  const ms = disposedAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  const years = ms / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(1, Math.round(years));
}

interface ProjectionResult {
  series: number[];
  proceeds: { yearOffset: number; amount: number } | null;
}

/**
 * Project a balance series with optional disposal cut-off.
 * - Before disposal year: standard compounding growth + monthly contributions.
 * - At disposal year: capture proceeds (the value just before disposal), then 0 from there.
 * - If `disposalYear === 0`: item already disposed → series is all zeros, no proceeds (already realised).
 */
function projectBalanceSeries(
  initialBalance: number,
  monthlyContribution: number,
  annualRate: number,
  years: number,
  disposalYear: number | null
): ProjectionResult {
  if (disposalYear === 0) {
    // Already disposed before the projection window opened.
    return { series: Array.from({ length: years + 1 }, () => 0), proceeds: null };
  }
  const series = [initialBalance];
  let proceeds: { yearOffset: number; amount: number } | null = null;
  for (let y = 1; y <= years; y++) {
    const prev = series[y - 1]!;
    const grown = prev * (1 + annualRate) + monthlyContribution * 12;
    if (disposalYear != null && y >= disposalYear) {
      if (proceeds == null) {
        // Capture the value at the disposal year, then drop to zero.
        proceeds = { yearOffset: y, amount: grown };
      }
      series.push(0);
    } else {
      series.push(grown);
    }
  }
  return { series, proceeds };
}

type ProjectableAccount = {
  id: string;
  balance: number;
  monthlyContribution: number;
  growthRatePct: number | null;
  type: string;
  disposalYear: number | null;
  disposalAccountId: string | null;
};

type ProjectableAsset = {
  id: string;
  balance: number;
  growthRatePct: number | null;
  disposalYear: number | null;
  disposalAccountId: string | null;
};

interface SeriesContext {
  settings: {
    currentRatePct: number;
    savingsRatePct: number;
    investmentRatePct: number;
    pensionRatePct: number;
  };
  /** Aggregated proceeds inflows keyed by destination account id. */
  inflowsByAccountId: Map<string, Array<{ yearOffset: number; amount: number }>>;
}

function emptySeries(years: number): number[] {
  return Array.from({ length: years + 1 }, () => 0);
}

function addSeries(into: number[], from: number[]): void {
  for (let i = 0; i < into.length; i++) {
    into[i] = (into[i] ?? 0) + (from[i] ?? 0);
  }
}

function addInflows(
  series: number[],
  inflows: Array<{ yearOffset: number; amount: number }> | undefined,
  annualRate: number,
  years: number
): void {
  // Each inflow lands at its yearOffset and then continues growing at the host
  // account's rate for subsequent years. Apply the lump sum AFTER the host's own
  // growth has been computed for that year (i.e. after series[y] is set).
  if (!inflows || inflows.length === 0) return;
  for (const { yearOffset, amount } of inflows) {
    if (yearOffset > years) continue;
    series[yearOffset] = (series[yearOffset] ?? 0) + amount;
    let carry = amount;
    for (let y = yearOffset + 1; y <= years; y++) {
      carry = carry * (1 + annualRate);
      series[y] = (series[y] ?? 0) + carry;
    }
  }
}

function projectAccountWithInflows(
  acc: ProjectableAccount,
  ctx: SeriesContext,
  years: number
): ProjectionResult {
  const rate = accountEffectiveRate(acc, ctx.settings);
  const result = projectBalanceSeries(
    acc.balance,
    acc.monthlyContribution,
    rate,
    years,
    acc.disposalYear
  );
  // Disposed accounts don't accept inflows after disposal — fold inflows in only
  // before the disposal cut-off.
  const inflows = ctx.inflowsByAccountId.get(acc.id);
  if (inflows && inflows.length > 0) {
    const filtered =
      acc.disposalYear == null ? inflows : inflows.filter((i) => i.yearOffset < acc.disposalYear!);
    addInflows(result.series, filtered, rate, years);
  }
  return result;
}

function projectAssetSeries(asset: ProjectableAsset, years: number): ProjectionResult {
  const rate = assetEffectiveRate(asset);
  return projectBalanceSeries(asset.balance, 0, rate, years, asset.disposalYear);
}

function sumAccountSeries(
  accounts: ProjectableAccount[],
  ctx: SeriesContext,
  years: number
): number[] {
  const sums = emptySeries(years);
  for (const acc of accounts) {
    const { series } = projectAccountWithInflows(acc, ctx, years);
    addSeries(sums, series);
  }
  return sums;
}

function sumAssetSeries(assets: ProjectableAsset[], years: number): number[] {
  const sums = emptySeries(years);
  for (const asset of assets) {
    const { series } = projectAssetSeries(asset, years);
    addSeries(sums, series);
  }
  return sums;
}

const DEFAULT_SETTINGS = {
  currentRatePct: 0,
  savingsRatePct: 4,
  investmentRatePct: 7,
  pensionRatePct: 6,
  inflationRatePct: 2.5,
};

// ─── Service ─────────────────────────────────────────────────────────────────

export const forecastService = {
  async getProjections(
    householdId: string,
    horizonYears: ForecastHorizon
  ): Promise<ForecastProjection> {
    const balanceInclude = { balances: { orderBy: { date: "desc" as const }, take: 1 } };
    const linkedItemsInclude = { linkedItems: { select: { id: true, spendType: true } } };

    const [accounts, assets, settingsRow, members, waterfallSummary] = await Promise.all([
      prisma.account.findMany({
        where: { householdId },
        include: { ...balanceInclude, ...linkedItemsInclude },
      }),
      prisma.asset.findMany({ where: { householdId }, include: balanceInclude }),
      prisma.householdSettings.findUnique({ where: { householdId } }),
      prisma.member.findMany({
        where: { householdId },
        include: { user: { select: { id: true, name: true } } },
      }),
      waterfallService.getWaterfallSummary(householdId),
    ]);

    // Derive monthly contributions per account from linked discretionary items
    const allLinkedItemIds = accounts.flatMap((a) => a.linkedItems.map((i) => i.id));
    const now = new Date();
    const activePeriods =
      allLinkedItemIds.length > 0
        ? await prisma.itemAmountPeriod.findMany({
            where: {
              householdId,
              itemType: "discretionary_item",
              itemId: { in: allLinkedItemIds },
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gt: now } }],
            },
          })
        : [];
    const amountByItemId = new Map<string, number>();
    for (const period of activePeriods) {
      amountByItemId.set(period.itemId, period.amount);
    }
    const monthlyContributionByAccountId = new Map<string, number>();
    for (const acc of accounts) {
      const total = acc.linkedItems.reduce(
        (sum, item) => sum + toMonthlyAmount(amountByItemId.get(item.id) ?? 0, item.spendType),
        0
      );
      monthlyContributionByAccountId.set(acc.id, total);
    }

    const settings = {
      currentRatePct: settingsRow?.currentRatePct ?? DEFAULT_SETTINGS.currentRatePct,
      savingsRatePct: settingsRow?.savingsRatePct ?? DEFAULT_SETTINGS.savingsRatePct,
      investmentRatePct: settingsRow?.investmentRatePct ?? DEFAULT_SETTINGS.investmentRatePct,
      pensionRatePct: settingsRow?.pensionRatePct ?? DEFAULT_SETTINGS.pensionRatePct,
      inflationRatePct: settingsRow?.inflationRatePct ?? DEFAULT_SETTINGS.inflationRatePct,
    };
    const currentYear = new Date().getFullYear();

    // Normalise to projectable shapes
    const toProjectableAccount = (acc: (typeof accounts)[number]): ProjectableAccount => ({
      id: acc.id,
      balance: acc.balances[0]?.value ?? 0,
      monthlyContribution: monthlyContributionByAccountId.get(acc.id) ?? 0,
      growthRatePct: acc.growthRatePct,
      type: acc.type,
      disposalYear: disposalYearOffset(acc.disposedAt, now),
      disposalAccountId: acc.disposalAccountId,
    });

    const toProjectableAsset = (a: (typeof assets)[number]): ProjectableAsset => ({
      id: a.id,
      balance: a.balances[0]?.value ?? 0,
      growthRatePct: a.growthRatePct,
      disposalYear: disposalYearOffset(a.disposedAt, now),
      disposalAccountId: a.disposalAccountId,
    });

    const projectableAccounts = accounts.map(toProjectableAccount);
    const projectableAssets = assets.map(toProjectableAsset);

    // ── Pre-compute disposal proceeds map ────────────────────────────────────
    // We project each disposing source independently so we can compute the
    // proceeds value at the disposal year, then route it to the target account.
    // (The target account's series is then re-projected with the inflow folded
    // in — see projectAccountWithInflows.)
    const inflowsByAccountId = new Map<string, Array<{ yearOffset: number; amount: number }>>();

    function recordProceeds(targetId: string | null, p: ProjectionResult["proceeds"]) {
      if (!targetId || !p) return;
      const bucket = inflowsByAccountId.get(targetId) ?? [];
      bucket.push(p);
      inflowsByAccountId.set(targetId, bucket);
    }

    // Source: assets with disposal
    for (const asset of projectableAssets) {
      if (asset.disposalYear == null || asset.disposalYear === 0) continue;
      const { proceeds } = projectAssetSeries(asset, horizonYears);
      recordProceeds(asset.disposalAccountId, proceeds);
    }

    // Source: accounts with disposal — these need inflow-aware projection because
    // a disposing account might itself be receiving proceeds before its own
    // disposal date. For simplicity (and since chains of disposals are rare),
    // we project disposing accounts WITHOUT incoming inflows when computing the
    // proceeds value. This is acceptable in practice; cyclic flows are guarded
    // by the "cannot dispose into itself" validation.
    for (const acc of projectableAccounts) {
      if (acc.disposalYear == null || acc.disposalYear === 0) continue;
      const rate = accountEffectiveRate(acc, settings);
      const { proceeds } = projectBalanceSeries(
        acc.balance,
        acc.monthlyContribution,
        rate,
        horizonYears,
        acc.disposalYear
      );
      recordProceeds(acc.disposalAccountId, proceeds);
    }

    const ctx: SeriesContext = { settings, inflowsByAccountId };

    // ── Net worth (non-pension accounts + all assets) ─────────────────────────
    const netWorthAccounts = projectableAccounts.filter((a) => a.type !== "Pension");

    const accountSums = sumAccountSeries(netWorthAccounts, ctx, horizonYears);
    const assetSums = sumAssetSeries(projectableAssets, horizonYears);

    const netWorth = Array.from({ length: horizonYears + 1 }, (_, y) => {
      const nominal = Math.round((accountSums[y] ?? 0) + (assetSums[y] ?? 0));
      const real = Math.round(nominal / Math.pow(1 + settings.inflationRatePct / 100, y));
      return { year: currentYear + y, nominal, real };
    });

    // ── Surplus accumulation ──────────────────────────────────────────────────
    const monthlySurplus = waterfallSummary.surplus.amount;
    const surplus = Array.from({ length: horizonYears + 1 }, (_, y) => ({
      year: currentYear + y,
      cumulative: Math.round(monthlySurplus * 12 * y),
    }));

    // ── Savings & Stocks-and-Shares household series ──────────────────────────
    // Household-shared pools — surfaced both as their own top-level series and
    // nested inside each member's retirement projection (joint pool, intentional).
    const savingsAccounts = projectableAccounts.filter((a) => a.type === "Savings");
    const ssAccounts = projectableAccounts.filter((a) => a.type === "StocksAndShares");

    const savingsSums = sumAccountSeries(savingsAccounts, ctx, horizonYears);
    const ssSums = sumAccountSeries(ssAccounts, ctx, horizonYears);

    const savings = Array.from({ length: horizonYears + 1 }, (_, y) => ({
      year: currentYear + y,
      balance: Math.round(savingsSums[y] ?? 0),
    }));
    const stocksAndShares = Array.from({ length: horizonYears + 1 }, (_, y) => ({
      year: currentYear + y,
      balance: Math.round(ssSums[y] ?? 0),
    }));

    // ── Retirement (per member: own pensions + shared savings + shared S&S) ──
    const retirement = members.map((member) => {
      const pensionAccounts = projectableAccounts.filter(
        (a) =>
          a.type === "Pension" && accounts.find((acc) => acc.id === a.id)?.memberId === member.id
      );
      const pensionSums = sumAccountSeries(pensionAccounts, ctx, horizonYears);

      const series = Array.from({ length: horizonYears + 1 }, (_, y) => ({
        year: currentYear + y,
        pension: Math.round(pensionSums[y] ?? 0),
        savings: Math.round(savingsSums[y] ?? 0),
        stocksAndShares: Math.round(ssSums[y] ?? 0),
      }));

      return {
        memberId: member.id,
        memberName: member.user?.name ?? member.name,
        retirementYear: member.retirementYear ?? null,
        series,
      };
    });

    // ── Monthly contributions by scope ────────────────────────────────────────
    // netWorth = all non-pension accounts; retirement = pension accounts only;
    // savings / stocksAndShares are scoped to their account type.
    const sumContributions = (predicate: (a: (typeof accounts)[number]) => boolean): number =>
      accounts
        .filter(predicate)
        .reduce((sum, a) => sum + (monthlyContributionByAccountId.get(a.id) ?? 0), 0);

    const monthlyContributionsByScope = {
      netWorth: sumContributions((a) => a.type !== "Pension"),
      retirement: sumContributions((a) => a.type === "Pension"),
      savings: sumContributions((a) => a.type === "Savings"),
      stocksAndShares: sumContributions((a) => a.type === "StocksAndShares"),
    };

    return {
      netWorth,
      surplus,
      savings,
      stocksAndShares,
      retirement,
      monthlyContributionsByScope,
    };
  },
};

// ─── Exports for cashflow service / tests ────────────────────────────────────

/**
 * Compound a starting balance forward by an arbitrary fractional number of years.
 * Used by cashflow service to compute the disposal proceeds at month/day precision
 * (forecast service uses year-offset granularity).
 */
export function compoundForwardYears(
  initialBalance: number,
  annualRate: number,
  years: number
): number {
  if (years <= 0) return initialBalance;
  return initialBalance * Math.pow(1 + annualRate, years);
}

export const __test__ = { projectBalanceSeries, disposalYearOffset, accountEffectiveRate };
