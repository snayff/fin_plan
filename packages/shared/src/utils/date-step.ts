/**
 * Calendar date stepping helpers (UTC).
 *
 * Native `Date.prototype.setUTCMonth` / `Date.UTC(y, m, day)` overflow when the
 * target day does not exist in the destination month: e.g. a date on the 31st
 * advanced one month from January becomes "Feb 31" which normalises to Mar 3.
 * Repeated stepping then drifts permanently and skips months entirely (a
 * monthly bill due on the 31st emits 11 events over a 12-month window instead
 * of 12, and never lands in February).
 *
 * These helpers anchor on a target day-of-month and CLAMP to the destination
 * month's last day when that day does not exist, so every calendar month in a
 * range produces exactly one occurrence.
 */

/** Number of days in the given UTC month (0-indexed month). Handles leap years. */
export function daysInUTCMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of the requested month.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Build a UTC date for `year`/`month` (0-indexed) on `day`, clamped to the
 * month's last valid day when `day` exceeds the month length. Never rolls into
 * the following month. e.g. (2025, 1 [Feb], 31) -> Feb 28.
 */
export function clampedUTCDate(year: number, month: number, day: number): Date {
  // Normalise month overflow/underflow into year first so daysInUTCMonth is correct.
  const normYear = year + Math.floor(month / 12);
  const normMonth = ((month % 12) + 12) % 12;
  const lastDay = daysInUTCMonth(normYear, normMonth);
  const clampedDay = Math.min(day, lastDay);
  return new Date(Date.UTC(normYear, normMonth, clampedDay));
}

/**
 * Add `months` calendar months to `date`, anchoring on `anchorDay` (defaults to
 * the day-of-month of `date`) and clamping to the destination month's last day.
 *
 * Pass the ORIGINAL anchor day on each step (rather than re-reading the previous
 * result's day) to avoid cumulative drift: stepping Jan 31 by one month yields
 * Feb 28, and the next step from the same anchor yields Mar 31 (not Mar 28).
 */
export function addMonthsClamped(date: Date, months: number, anchorDay?: number): Date {
  const day = anchorDay ?? date.getUTCDate();
  return clampedUTCDate(date.getUTCFullYear(), date.getUTCMonth() + months, day);
}
