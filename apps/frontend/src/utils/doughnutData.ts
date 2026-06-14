import { toMonthlyAmount } from "@finplan/shared";
import type { WaterfallSummary } from "@finplan/shared";

export interface DrillItem {
  id: string;
  name: string;
  amount: number;
  subcategoryId: string;
}

export function extractDrillItems(
  tier: "committed" | "discretionary",
  summary: WaterfallSummary
): DrillItem[] {
  if (tier === "committed") {
    const bills: DrillItem[] = summary.committed.bills.map((b) => ({
      id: b.id,
      name: b.name,
      amount: toMonthlyAmount(b.amount, b.spendType ?? "monthly"),
      subcategoryId: b.subcategoryId ?? "",
    }));

    const yearly: DrillItem[] = summary.committed.nonMonthlyBills.map((y) => ({
      id: y.id,
      name: y.name,
      amount: toMonthlyAmount(y.amount, y.spendType ?? "yearly"),
      subcategoryId: y.subcategoryId ?? "",
    }));

    return [...bills, ...yearly];
  }

  // Discretionary: categories + savings allocations
  const cats: DrillItem[] = summary.discretionary.categories.map((c) => ({
    id: c.id,
    name: c.name,
    amount: c.monthlyBudget,
    subcategoryId: c.subcategoryId ?? "",
  }));

  const savings: DrillItem[] = summary.discretionary.savings.allocations.map((s) => ({
    id: s.id,
    name: s.name,
    amount: s.monthlyAmount,
    subcategoryId: s.subcategoryId ?? "",
  }));

  return [...cats, ...savings];
}
