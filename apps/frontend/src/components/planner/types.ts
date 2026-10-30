import type { PurchasePriority, PurchaseStatus } from "@finplan/shared";

/**
 * Client-side view models for the Planner panels. These mirror the backend
 * response contracts (PurchaseItemResponse / YearBudgetResponse) but are
 * declared locally because the planner service layer is not yet fully typed.
 * Fields the panels never read are intentionally omitted.
 */
export interface Purchase {
  id: string;
  name: string;
  estimatedCost: number;
  priority: PurchasePriority;
  scheduledThisYear: boolean;
  status: PurchaseStatus;
  fundingSources: string[];
  fundingAccountId?: string | null;
  reason?: string | null;
  comment?: string | null;
}

export interface PlannerBudget {
  purchaseBudget: number;
  giftBudget?: number;
}
