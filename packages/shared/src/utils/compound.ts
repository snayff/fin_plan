/**
 * Future value of a starting balance plus a regular monthly contribution, using
 * **monthly compounding** (contributions made at the end of each month — an
 * ordinary annuity).
 *
 * This is the single source of truth for compound-growth projections so the
 * Forecast service and the Help-page calculator never drift apart (#163).
 *
 *   FV = PV·(1 + i)^n + PMT·[((1 + i)^n − 1) / i]
 *
 * where i = annualRatePct/100/12 and n = 12·years.
 *
 * @param pv             present (starting) value
 * @param monthlyPmt     contribution added at the end of each month
 * @param annualRatePct  nominal annual rate as a percentage (e.g. 6 for 6%)
 * @param years          number of years (may be fractional)
 */
export function futureValueMonthly(
  pv: number,
  monthlyPmt: number,
  annualRatePct: number,
  years: number
): number {
  const months = 12 * years;
  // Rate of exactly 0 has no compounding — the annuity formula divides by i,
  // so handle it as a plain linear sum.
  if (annualRatePct === 0) {
    return pv + monthlyPmt * months;
  }
  const i = annualRatePct / 100 / 12;
  const growth = Math.pow(1 + i, months);
  return pv * growth + monthlyPmt * ((growth - 1) / i);
}
