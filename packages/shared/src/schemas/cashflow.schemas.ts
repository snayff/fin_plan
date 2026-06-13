import { z } from "zod";
import { idSchema } from "./common.schemas";

// ─── Query schemas ──────────────────────────────────────────────────────────

export const cashflowProjectionQuerySchema = z.object({
  startYear: z.coerce.number().int().min(2000).max(2100).optional(),
  startMonth: z.coerce.number().int().min(1).max(12).optional(),
  monthCount: z.coerce.number().int().min(1).max(24).default(12),
});

export type CashflowProjectionQuery = z.infer<typeof cashflowProjectionQuerySchema>;

export const cashflowMonthDetailQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type CashflowMonthDetailQuery = z.infer<typeof cashflowMonthDetailQuerySchema>;

// ─── Mutation schemas ───────────────────────────────────────────────────────

export const updateLinkedAccountSchema = z.object({
  isCashflowLinked: z.boolean(),
});
export type UpdateLinkedAccountInput = z.infer<typeof updateLinkedAccountSchema>;

export const bulkUpdateLinkedAccountsSchema = z.object({
  updates: z
    .array(
      z.object({
        accountId: idSchema,
        isCashflowLinked: z.boolean(),
      })
    )
    .min(1)
    .max(50),
});
export type BulkUpdateLinkedAccountsInput = z.infer<typeof bulkUpdateLinkedAccountsSchema>;

// ─── Response shapes ────────────────────────────────────────────────────────

export interface LinkableAccountRow {
  id: string;
  name: string;
  type: "Current" | "Savings";
  isCashflowLinked: boolean;
  latestBalance: number | null;
  latestBalanceDate: string | null; // ISO date YYYY-MM-DD
}

export interface CashflowProjectionMonth {
  year: number;
  month: number; // 1-12
  netChange: number;
  openingBalance: number;
  closingBalance: number;
  dipBelowZero: boolean;
  tightestPoint: { value: number; day: number }; // day-of-month of the lowest intra-month value
}

export interface CashflowProjection {
  startingBalance: number;
  latestKnownBalance: number;
  windowStart: { year: number; month: number };
  months: CashflowProjectionMonth[];
  projectedEndBalance: number;
  tightestDip: { value: number; date: string }; // ISO date YYYY-MM-DD
  avgMonthlySurplus: number;
  oldestLinkedBalanceDate: string | null;
  youngestLinkedBalanceDate: string | null;
  linkedAccountCount: number;
}

export type CashflowEventItemType =
  | "income_source"
  | "committed_item"
  | "discretionary_item"
  | "asset_liquidation"
  | "account_liquidation";

export interface CashflowEvent {
  date: string; // ISO YYYY-MM-DD
  label: string;
  amount: number; // signed (income +, spend −, liquidation +)
  itemType: CashflowEventItemType;
  runningBalanceAfter: number;
}

export interface CashflowMonthDetail {
  year: number;
  month: number;
  startingBalance: number;
  endBalance: number;
  netChange: number;
  tightestPoint: { value: number; day: number };
  amortisedDailyDiscretionary: number;
  monthlyDiscretionaryTotal: number; // for the info chip "£X/mo amortised"
  dailyTrace: Array<{ day: number; balance: number }>; // step-line points
  events: CashflowEvent[];
}

// ─── Shortfall ──────────────────────────────────────────────────────────────

export const cashflowShortfallQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(30),
});

export type CashflowShortfallQuery = z.infer<typeof cashflowShortfallQuerySchema>;

export type ShortfallTierKey = "committed" | "discretionary";

export interface ShortfallItem {
  itemType: "committed_item" | "discretionary_item";
  itemId: string;
  itemName: string;
  tierKey: ShortfallTierKey;
  dueDate: string; // ISO YYYY-MM-DD
  amount: number; // positive (the outflow that wasn't covered)
}

export interface CashflowShortfall {
  items: ShortfallItem[]; // sorted by dueDate asc, ties by itemName
  balanceToday: number;
  lowest: { value: number; date: string }; // ISO YYYY-MM-DD
  linkedAccountCount: number;
}
