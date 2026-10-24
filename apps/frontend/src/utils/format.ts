export const formatCurrency = (n: number, showPence: boolean): string =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: showPence ? 2 : 0,
    maximumFractionDigits: showPence ? 2 : 0,
  }).format(n);

export const formatPct = (n: number): string => `${n.toFixed(2)}%`;
