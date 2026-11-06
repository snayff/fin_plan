import type { SpendType } from "@prisma/client";
import { addMonthsClamped } from "@finplan/shared";

export interface ForecastInput {
  amount: number;
  spendType: SpendType;
  dueDate: Date | null;
}

export interface ForecastResult {
  amount: number;
  estimated: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Counts scheduled occurrences of items between today (inclusive) and
 *  end (inclusive). Falls back to time-pro-rating for monthly/weekly/quarterly
 *  items missing a dueDate; yearly/one_off without a dueDate contribute zero. */
export function forecastContribution(
  items: ForecastInput[],
  today: Date,
  end: Date
): ForecastResult {
  let total = 0;
  let estimated = false;

  for (const item of items) {
    const r = forecastSingle(item, today, end);
    total += r.amount;
    if (r.estimated) estimated = true;
  }

  return { amount: total, estimated };
}

function forecastSingle(item: ForecastInput, today: Date, end: Date): ForecastResult {
  const { amount, spendType, dueDate } = item;
  if (amount <= 0) return { amount: 0, estimated: false };

  if (dueDate == null) {
    return forecastWithoutDate(amount, spendType, today, end);
  }

  switch (spendType) {
    case "monthly":
      return { amount: amount * countMonthlyOccurrences(dueDate, today, end), estimated: false };
    case "weekly":
      return { amount: amount * countWeeklyOccurrences(dueDate, today, end), estimated: false };
    case "quarterly":
      return {
        amount: amount * countPeriodicOccurrences(dueDate, today, end, 3),
        estimated: false,
      };
    case "yearly":
    case "one_off":
      return {
        amount: dueDate >= today && dueDate <= end ? amount : 0,
        estimated: false,
      };
  }
}

function forecastWithoutDate(
  amount: number,
  spendType: SpendType,
  today: Date,
  end: Date
): ForecastResult {
  const days = Math.max(0, (end.getTime() - today.getTime()) / MS_PER_DAY);
  switch (spendType) {
    case "monthly":
      return { amount: amount * (days / 30.4375), estimated: true };
    case "weekly":
      return { amount: amount * (days / 7), estimated: true };
    case "quarterly":
      return { amount: amount * (days / 91.3125), estimated: true };
    case "yearly":
    case "one_off":
      return { amount: 0, estimated: false };
  }
}

/** Count same-day-of-month dates in [start, end] inclusive, anchored at base.day */
function countMonthlyOccurrences(base: Date, start: Date, end: Date): number {
  return countPeriodicOccurrences(base, start, end, 1);
}

function countWeeklyOccurrences(base: Date, start: Date, end: Date): number {
  if (end < start) return 0;
  const baseTs = base.getTime();
  const startTs = start.getTime();
  const stepMs = 7 * MS_PER_DAY;
  const diff = startTs - baseTs;
  let firstTs: number;
  if (diff <= 0) {
    firstTs = baseTs;
  } else {
    const stepsBack = Math.ceil(diff / stepMs);
    firstTs = baseTs + stepsBack * stepMs;
  }
  if (firstTs > end.getTime()) return 0;
  return Math.floor((end.getTime() - firstTs) / stepMs) + 1;
}

function countPeriodicOccurrences(base: Date, start: Date, end: Date, step: number): number {
  if (end < start) return 0;
  const anchorDay = base.getUTCDate();
  // Drive iteration by an integer month-offset from `base` and clamp each step
  // to the destination month's last day (anchored on base.day). Stepping via
  // setUTCMonth would overflow for day 29-31 (e.g. Jan 31 -> "Feb 31" -> Mar 3),
  // permanently drifting and skipping a month entirely.
  let offset = 0;
  // Walk backwards to the first occurrence on-or-after `start`.
  while (addMonthsClamped(base, offset, anchorDay) > start) {
    offset -= step;
  }
  // Walk forwards to the first occurrence on-or-after `start`.
  while (addMonthsClamped(base, offset, anchorDay) < start) {
    offset += step;
  }
  let count = 0;
  while (addMonthsClamped(base, offset, anchorDay) <= end) {
    count++;
    offset += step;
  }
  return count;
}
