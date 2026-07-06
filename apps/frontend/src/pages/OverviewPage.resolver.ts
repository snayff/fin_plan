import type { IncomeType, WaterfallSummary } from "@finplan/shared";

/**
 * Composite URL param schema for the Overview right panel:
 *   ?view=item:<id>         → item detail (id resolved against summary)
 *   ?view=type:<incomeType> → income type panel (e.g. type:salary)
 *   ?view=committed-bills   → committed bills panel
 *   (absent)                → no detail; left-only on mobile, summary on desktop
 *
 * URL is the single source of truth — supports refresh, deep-link, and OS
 * back to clear selection. See docs/4. planning/mobile-accessibility/plan.md
 * § Decision 5 + Item 1 amendment.
 */

export const INCOME_TYPES: IncomeType[] = [
  "salary",
  "dividends",
  "freelance",
  "rental",
  "benefits",
  "other",
];

export interface SelectedItem {
  id: string;
  type: string;
  name: string;
  amount: number;
  lastReviewedAt: Date;
}

export type ResolvedView =
  | { type: "none" }
  | { type: "item"; item: SelectedItem }
  | { type: "income_type"; incomeType: IncomeType; label: string }
  | { type: "committed_bills" };

const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  salary: "Salary",
  dividends: "Dividends",
  freelance: "Freelance",
  rental: "Rental",
  benefits: "Benefits",
  other: "Other",
};

/**
 * Resolve `?view=...` URL value into the right-panel discriminated union.
 * Returns `{ type: "none" }` when value is null/unresolvable so the page renders
 * the default summary panel. Re-derives item snapshots from `summary` so edits
 * to the underlying record are reflected (fixes the latent staleness bug
 * called out in the plan).
 */
export function resolveOverviewView(
  raw: string | null,
  summary: WaterfallSummary | undefined
): ResolvedView {
  if (raw == null) return { type: "none" };

  if (raw === "committed-bills") return { type: "committed_bills" };

  if (raw.startsWith("type:")) {
    const t = raw.slice("type:".length) as IncomeType;
    if (INCOME_TYPES.includes(t)) {
      return { type: "income_type", incomeType: t, label: INCOME_TYPE_LABEL[t] };
    }
    return { type: "none" };
  }

  if (raw.startsWith("item:") && summary) {
    const id = raw.slice("item:".length);

    // Search across income sources, committed bills, and discretionary items.
    for (const group of summary.income.byType) {
      const source = group.sources.find((s) => s.id === id);
      if (source) {
        return {
          type: "item",
          item: {
            id: source.id,
            type: "income",
            name: source.name,
            amount: source.amount,
            lastReviewedAt: new Date(source.lastReviewedAt),
          },
        };
      }
    }
    const bill = summary.committed.bills.find((b) => b.id === id);
    if (bill) {
      return {
        type: "item",
        item: {
          id: bill.id,
          type: "committed",
          name: bill.name,
          amount: bill.amount,
          lastReviewedAt: new Date(bill.lastReviewedAt),
        },
      };
    }
    return { type: "none" };
  }

  return { type: "none" };
}

export function encodeViewParam(view: ResolvedView): string | null {
  switch (view.type) {
    case "none":
      return null;
    case "item":
      return `item:${view.item.id}`;
    case "income_type":
      return `type:${view.incomeType}`;
    case "committed_bills":
      return "committed-bills";
  }
}
