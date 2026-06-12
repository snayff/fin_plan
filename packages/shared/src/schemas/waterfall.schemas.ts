import { z } from "zod";
import {
  idSchema,
  nameSchema,
  notesSchema,
  positiveMoneySchema,
  sortOrderSchema,
} from "./common.schemas";

export const IncomeFrequencyEnum = z.enum(["monthly", "annual", "one_off", "weekly", "quarterly"]);
export type IncomeFrequency = z.infer<typeof IncomeFrequencyEnum>;

export const IncomeTypeEnum = z.enum([
  "salary",
  "dividends",
  "freelance",
  "rental",
  "benefits",
  "other",
]);
export type IncomeType = z.infer<typeof IncomeTypeEnum>;

export const WaterfallItemTypeEnum = z.enum([
  "income_source",
  "committed_item",
  "discretionary_item",
  // Legacy (kept for WaterfallHistory backward compat)
  "committed_bill",
  "yearly_bill",
  "discretionary_category",
  "savings_allocation",
]);
export type WaterfallItemType = z.infer<typeof WaterfallItemTypeEnum>;

// ─── New enums ───────────────────────────────────────────────────────────────

export const SpendTypeEnum = z.enum(["monthly", "yearly", "one_off", "weekly", "quarterly"]);
export type SpendType = z.infer<typeof SpendTypeEnum>;

export const WaterfallTierEnum = z.enum(["income", "committed", "discretionary"]);
export type WaterfallTier = z.infer<typeof WaterfallTierEnum>;

// ─── Subcategory ─────────────────────────────────────────────────────────────

export interface SubcategoryRow {
  id: string;
  householdId: string;
  tier: WaterfallTier;
  name: string;
  sortOrder: number;
  isLocked: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Subcategory totals (for overview left panel) ────────────────────────────

export interface SubcategoryTotal {
  id: string;
  name: string;
  sortOrder: number;
  monthlyTotal: number;
  oldestReviewedAt: Date | null;
  itemCount: number;
}

// ─── Committed items (replaces CommittedBill + YearlyBill) ───────────────────

export const createCommittedItemSchema = z.object({
  name: nameSchema,
  amount: positiveMoneySchema,
  subcategoryId: idSchema,
  spendType: SpendTypeEnum.default("monthly"),
  notes: notesSchema.nullable().optional(),
  memberId: idSchema.nullable().optional(),
  dueDate: z.coerce.date(),
  sortOrder: sortOrderSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateCommittedItemSchema = z.object({
  name: nameSchema.optional(),
  subcategoryId: idSchema.optional(),
  spendType: SpendTypeEnum.optional(),
  notes: notesSchema.nullable().optional(),
  memberId: idSchema.nullable().optional(),
  dueDate: z.coerce.date().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type CreateCommittedItemInput = z.infer<typeof createCommittedItemSchema>;
export type UpdateCommittedItemInput = z.infer<typeof updateCommittedItemSchema>;

// ─── Discretionary items (replaces DiscretionaryCategory + SavingsAllocation) ─

export const createDiscretionaryItemSchema = z.object({
  name: nameSchema,
  amount: positiveMoneySchema,
  subcategoryId: idSchema,
  spendType: SpendTypeEnum.default("monthly"),
  notes: notesSchema.nullable().optional(),
  memberId: idSchema.nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  linkedAccountId: idSchema.nullable().optional(),
});

export const updateDiscretionaryItemSchema = z.object({
  name: nameSchema.optional(),
  subcategoryId: idSchema.optional(),
  spendType: SpendTypeEnum.optional(),
  notes: notesSchema.nullable().optional(),
  memberId: idSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
  linkedAccountId: idSchema.nullable().optional(),
});

export type CreateDiscretionaryItemInput = z.infer<typeof createDiscretionaryItemSchema>;
export type UpdateDiscretionaryItemInput = z.infer<typeof updateDiscretionaryItemSchema>;

// ─── Income ──────────────────────────────────────────────────────────────────

export const createIncomeSourceSchema = z.object({
  name: nameSchema,
  amount: positiveMoneySchema,
  frequency: IncomeFrequencyEnum,
  incomeType: IncomeTypeEnum.default("other"),
  dueDate: z.coerce.date(),
  memberId: idSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
  subcategoryId: idSchema.optional(),
  notes: notesSchema.nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateIncomeSourceSchema = z.object({
  name: nameSchema.optional(),
  frequency: IncomeFrequencyEnum.optional(),
  incomeType: IncomeTypeEnum.optional(),
  dueDate: z.coerce.date().optional(),
  memberId: idSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
  subcategoryId: idSchema.optional(),
  notes: notesSchema.nullable().optional(),
});

export type CreateIncomeSourceInput = z.input<typeof createIncomeSourceSchema>;
export type UpdateIncomeSourceInput = z.infer<typeof updateIncomeSourceSchema>;

// ─── Committed Bills ──────────────────────────────────────────────────────────

export const createCommittedBillSchema = z.object({
  name: nameSchema,
  amount: positiveMoneySchema,
  memberId: idSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const updateCommittedBillSchema = z.object({
  name: nameSchema.optional(),
  amount: positiveMoneySchema.optional(),
  memberId: idSchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type CreateCommittedBillInput = z.infer<typeof createCommittedBillSchema>;
export type UpdateCommittedBillInput = z.infer<typeof updateCommittedBillSchema>;

// ─── Yearly Bills ─────────────────────────────────────────────────────────────

export const createYearlyBillSchema = z.object({
  name: nameSchema,
  amount: positiveMoneySchema,
  dueDate: z.coerce.date(),
  sortOrder: sortOrderSchema.optional(),
});

export const updateYearlyBillSchema = z.object({
  name: nameSchema.optional(),
  amount: positiveMoneySchema.optional(),
  dueDate: z.coerce.date().optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type CreateYearlyBillInput = z.infer<typeof createYearlyBillSchema>;
export type UpdateYearlyBillInput = z.infer<typeof updateYearlyBillSchema>;

// ─── Discretionary ────────────────────────────────────────────────────────────

export const createDiscretionaryCategorySchema = z.object({
  name: nameSchema,
  monthlyBudget: positiveMoneySchema,
  sortOrder: sortOrderSchema.optional(),
});

export const updateDiscretionaryCategorySchema = z.object({
  name: nameSchema.optional(),
  monthlyBudget: positiveMoneySchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type CreateDiscretionaryCategoryInput = z.infer<typeof createDiscretionaryCategorySchema>;
export type UpdateDiscretionaryCategoryInput = z.infer<typeof updateDiscretionaryCategorySchema>;

// ─── Savings ──────────────────────────────────────────────────────────────────

export const createSavingsAllocationSchema = z.object({
  name: nameSchema,
  monthlyAmount: positiveMoneySchema,
  sortOrder: sortOrderSchema.optional(),
});

export const updateSavingsAllocationSchema = z.object({
  name: nameSchema.optional(),
  monthlyAmount: positiveMoneySchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type CreateSavingsAllocationInput = z.infer<typeof createSavingsAllocationSchema>;
export type UpdateSavingsAllocationInput = z.infer<typeof updateSavingsAllocationSchema>;

// ─── Batch confirm ────────────────────────────────────────────────────────────

export const confirmBatchSchema = z.object({
  items: z
    .array(
      z.object({
        type: WaterfallItemTypeEnum,
        id: idSchema,
      })
    )
    .max(500),
});

export type ConfirmBatchInput = z.infer<typeof confirmBatchSchema>;

// ─── Response types ───────────────────────────────────────────────────────────

export interface IncomeByType {
  type: IncomeType;
  label: string;
  monthlyTotal: number;
  sources: IncomeSourceRow[];
}

export interface WaterfallSummary {
  income: {
    total: number;
    byType: IncomeByType[];
    bySubcategory: SubcategoryTotal[];
    monthly: IncomeSourceRow[];
    nonMonthly: IncomeSourceRow[];
    oneOff: IncomeSourceRow[];
  };
  committed: {
    monthlyTotal: number;
    monthlyAvg12: number;
    bySubcategory: SubcategoryTotal[];
    bills: CommittedBillRow[];
    nonMonthlyBills: YearlyBillRow[];
  };
  discretionary: {
    total: number;
    bySubcategory: SubcategoryTotal[];
    categories: DiscretionaryCategoryRow[];
    savings: { total: number; allocations: SavingsAllocationRow[] };
  };
  surplus: {
    amount: number;
    percentOfIncome: number;
  };
}

export interface IncomeSourceRow {
  id: string;
  householdId: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  incomeType: IncomeType;
  dueDate: Date;
  memberId: string | null;
  sortOrder: number;
  lifecycleState: ItemLifecycleState;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  subcategoryId: string | null;
  notes: string | null;
}

export interface CommittedBillRow {
  id: string;
  householdId: string;
  name: string;
  amount: number;
  memberId: string | null;
  sortOrder: number;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  spendType?: SpendType;
  subcategoryId?: string;
  notes?: string | null;
  dueDate?: Date | null;
}

export interface YearlyBillRow {
  id: string;
  householdId: string;
  name: string;
  amount: number;
  dueDate: Date;
  sortOrder: number;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  spendType?: SpendType;
  subcategoryId?: string;
  notes?: string | null;
  memberId?: string | null;
}

export interface DiscretionaryCategoryRow {
  id: string;
  householdId: string;
  name: string;
  monthlyBudget: number;
  sortOrder: number;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  spendType?: SpendType;
  subcategoryId?: string;
  notes?: string | null;
  memberId?: string | null;
}

export interface SavingsAllocationRow {
  id: string;
  householdId: string;
  name: string;
  monthlyAmount: number;
  sortOrder: number;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  spendType?: SpendType;
  subcategoryId?: string;
  notes?: string | null;
  memberId?: string | null;
}

export interface CashflowMonth {
  month: number;
  year: number;
  contribution: number;
  bills: { id: string; name: string; amount: number }[];
  oneOffIncome: { id: string; name: string; amount: number }[];
  potBefore: number;
  potAfter: number;
  shortfall: boolean;
}

// ─── Item lifecycle ─────────────────────────────────────────────────────────

export const ItemLifecycleStateEnum = z.enum(["active", "future", "expired"]);
export type ItemLifecycleState = z.infer<typeof ItemLifecycleStateEnum>;

// ─── Period schemas ─────────────────────────────────────────────────────────

export const PeriodItemTypeEnum = z.enum(["income_source", "committed_item", "discretionary_item"]);
export type PeriodItemType = z.infer<typeof PeriodItemTypeEnum>;

export const createPeriodSchema = z.object({
  itemType: PeriodItemTypeEnum,
  itemId: idSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  amount: positiveMoneySchema,
});

export const updatePeriodSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  amount: positiveMoneySchema.optional(),
});

export type CreatePeriodInput = z.infer<typeof createPeriodSchema>;
export type UpdatePeriodInput = z.infer<typeof updatePeriodSchema>;

// ─── Period response type ───────────────────────────────────────────────────

export interface PeriodRow {
  id: string;
  itemType: PeriodItemType;
  itemId: string;
  startDate: Date;
  endDate: Date | null;
  amount: number;
  createdAt: Date;
}

// ─── Delete all ─────────────────────────────────────────────────────────────

export const deleteAllWaterfallSchema = z.object({
  confirm: z.literal(true),
});
export type DeleteAllWaterfallInput = z.infer<typeof deleteAllWaterfallSchema>;

// ─── Subcategory mutation schemas ────────────────────────────────────────────

const subcategoryReassignmentSchema = z.object({
  fromSubcategoryId: idSchema,
  toSubcategoryId: idSchema,
});

const subcategoryEntrySchema = z.object({
  id: idSchema.optional(), // omitted for new subcategories
  name: z.string().min(1).max(24).trim(),
  sortOrder: sortOrderSchema,
});

export const batchSaveSubcategoriesSchema = z.object({
  subcategories: z.array(subcategoryEntrySchema).min(1).max(7),
  reassignments: z.array(subcategoryReassignmentSchema),
});

export type BatchSaveSubcategoriesInput = z.infer<typeof batchSaveSubcategoriesSchema>;
export type SubcategoryEntry = z.infer<typeof subcategoryEntrySchema>;
export type SubcategoryReassignment = z.infer<typeof subcategoryReassignmentSchema>;

export const resetSubcategoriesSchema = z.object({
  reassignments: z.array(subcategoryReassignmentSchema),
});

export type ResetSubcategoriesInput = z.infer<typeof resetSubcategoriesSchema>;

// ─── Quick-add subcategory ───────────────────────────────────────────────────

export const createSubcategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
});

export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>;
