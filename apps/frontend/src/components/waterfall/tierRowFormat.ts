import type { TierItemRow } from "@/hooks/useWaterfall";

export const CADENCE_LABELS: Record<TierItemRow["spendType"], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  one_off: "One-off",
};

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** When the payment falls, phrased for the item's cadence. */
export function formatDueDate(item: Pick<TierItemRow, "spendType" | "dueDate">): string {
  if (!item.dueDate) return "—";
  const d = new Date(item.dueDate);
  switch (item.spendType) {
    case "weekly":
      return d.toLocaleDateString("en-GB", { weekday: "short" });
    case "monthly":
      return ordinal(d.getDate());
    case "quarterly": {
      const months = [0, 3, 6, 9].map((offset) =>
        new Date(2000, (d.getMonth() + offset) % 12, 1).toLocaleDateString("en-GB", {
          month: "short",
        })
      );
      return `${ordinal(d.getDate())} ${months.join("/")}`;
    }
    case "yearly":
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    case "one_off":
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
}

/** Total columns in a tier table, including the trailing delete column. */
export function columnCount(tier: "income" | "committed" | "discretionary"): number {
  return tier === "income" ? 8 : 7;
}

export function formatIncomeType(type: string | undefined): string {
  if (!type) return "—";
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}
