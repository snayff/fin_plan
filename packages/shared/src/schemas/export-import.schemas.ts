import { z } from "zod";
import { IncomeFrequencyEnum, SpendTypeEnum } from "./waterfall.schemas";
import { MONEY_MAX } from "./common.schemas";

const CURRENT_SCHEMA_VERSION = 2;

// Import files are user input. Bounds are deliberately more generous than the
// live create/update schemas so older exports remain importable, but still
// reject non-finite numbers and oversized strings.
const importName = z.string().max(200);
const importNotes = z.string().max(2000);
const importMoney = z.number().finite().min(-MONEY_MAX).max(MONEY_MAX);
const importYear = z.number().int().min(1900).max(2200);
const importSortOrder = z.number().int().min(-1_000_000).max(1_000_000);

const exportMemberSchema = z.object({
  name: importName,
  role: z.enum(["owner", "admin", "member"]),
  dateOfBirth: z.string().datetime().nullable().optional(),
  retirementYear: importYear.nullable().optional(),
});

const exportSubcategorySchema = z.object({
  tier: z.enum(["income", "committed", "discretionary"]),
  name: importName,
  sortOrder: importSortOrder,
  isLocked: z.boolean(),
  isDefault: z.boolean(),
  items: z.array(importName).optional(),
});

const exportIncomeSourceSchema = z.object({
  subcategoryName: importName,
  name: importName,
  frequency: IncomeFrequencyEnum,
  incomeType: z.enum(["salary", "dividends", "freelance", "rental", "benefits", "other"]),
  dueDate: z.coerce.date(),
  ownerName: importName.nullable().optional(),
  sortOrder: importSortOrder,
  lastReviewedAt: z.string().datetime(),
  notes: importNotes.nullable().optional(),
  periods: z.array(
    z.object({
      startDate: z.string().max(40),
      endDate: z.string().max(40).nullable().optional(),
      amount: importMoney,
    })
  ),
});

const exportCommittedItemSchema = z.object({
  subcategoryName: importName,
  name: importName,
  spendType: SpendTypeEnum,
  notes: importNotes.nullable().optional(),
  ownerName: importName.nullable().optional(),
  dueDate: z.coerce.date(),
  sortOrder: importSortOrder,
  lastReviewedAt: z.string().datetime(),
  periods: z.array(
    z.object({
      startDate: z.string().max(40),
      endDate: z.string().max(40).nullable().optional(),
      amount: importMoney,
    })
  ),
});

const exportDiscretionaryItemSchema = z.object({
  subcategoryName: importName,
  name: importName,
  spendType: SpendTypeEnum,
  notes: importNotes.nullable().optional(),
  ownerName: importName.nullable().optional(),
  dueDate: z.coerce.date().nullable(),
  sortOrder: importSortOrder,
  lastReviewedAt: z.string().datetime(),
  periods: z.array(
    z.object({
      startDate: z.string().max(40),
      endDate: z.string().max(40).nullable().optional(),
      amount: importMoney,
    })
  ),
});

const exportItemAmountPeriodSchema = z.object({
  itemType: z.enum(["income_source", "committed_item", "discretionary_item"]),
  itemName: importName,
  startDate: z.string().max(40),
  endDate: z.string().max(40).nullable().optional(),
  amount: importMoney,
});

const exportWaterfallHistorySchema = z.object({
  itemType: z.enum(["income_source", "committed_item", "discretionary_item"]),
  itemName: importName,
  value: importMoney,
  recordedAt: z.string().datetime(),
});

const exportAssetSchema = z.object({
  name: importName,
  type: z.enum(["Property", "Vehicle", "Other"]),
  ownerName: importName.nullable().optional(),
  growthRatePct: z.number().finite().min(-100).max(100).nullable().optional(),
  lastReviewedAt: z.string().datetime().nullable().optional(),
  balances: z.array(
    z.object({
      value: importMoney,
      date: z.string().max(40),
      note: importNotes.nullable().optional(),
    })
  ),
});

const exportAccountSchema = z.object({
  name: importName,
  type: z.enum(["Current", "Savings", "Pension", "StocksAndShares", "Other"]),
  ownerName: importName.nullable().optional(),
  growthRatePct: z.number().finite().min(-100).max(100).nullable().optional(),
  isCashflowLinked: z.boolean().default(false),
  isISA: z.boolean().optional().default(false),
  isaYearContribution: importMoney.nullable().optional(),
  lastReviewedAt: z.string().datetime().nullable().optional(),
  balances: z.array(
    z.object({
      value: importMoney,
      date: z.string().max(40),
      note: importNotes.nullable().optional(),
    })
  ),
});

const exportPurchaseItemSchema = z.object({
  yearAdded: importYear,
  name: importName,
  estimatedCost: importMoney,
  priority: z.enum(["lowest", "low", "medium", "high"]),
  scheduledThisYear: z.boolean(),
  fundingSources: z.array(z.string().max(100)).max(50),
  fundingAccountId: z.string().max(64).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "done"]),
  reason: importNotes.nullable().optional(),
  comment: importNotes.nullable().optional(),
});

const exportPlannerYearBudgetSchema = z.object({
  year: importYear,
  purchaseBudget: importMoney,
  giftBudget: importMoney,
});

const exportGiftPersonSchemaV2 = z.object({
  name: importName,
  notes: importNotes.nullable().optional(),
  sortOrder: importSortOrder,
  isHouseholdMember: z.boolean(),
});

const exportGiftEventSchemaV2 = z.object({
  name: importName,
  dateType: z.enum(["shared", "personal"]),
  dateMonth: z.number().int().min(1).max(12).nullable().optional(),
  dateDay: z.number().int().min(1).max(31).nullable().optional(),
  isLocked: z.boolean(),
  sortOrder: importSortOrder,
});

const exportGiftAllocationSchemaV2 = z.object({
  personName: importName,
  eventName: importName,
  year: importYear,
  planned: importMoney,
  spent: importMoney.nullable().optional(),
  status: z.enum(["planned", "bought", "skipped"]),
  notes: importNotes.nullable().optional(),
  dateMonth: z.number().int().min(1).max(12).nullable().optional(),
  dateDay: z.number().int().min(1).max(31).nullable().optional(),
});

const exportGiftPlannerSettingsSchemaV2 = z.object({
  mode: z.enum(["synced", "independent"]),
  syncedDiscretionaryItemId: z.string().max(64).nullable(),
});

const exportGiftsSectionSchema = z.object({
  settings: exportGiftPlannerSettingsSchemaV2,
  people: z.array(exportGiftPersonSchemaV2),
  events: z.array(exportGiftEventSchemaV2),
  allocations: z.array(exportGiftAllocationSchemaV2),
});

const stalenessThresholdsSchema = z.object({
  income_source: z.number().int().nonnegative().max(36500),
  committed_item: z.number().int().nonnegative().max(36500),
  discretionary_item: z.number().int().nonnegative().max(36500),
  asset_item: z.number().int().nonnegative().max(36500),
  account_item: z.number().int().nonnegative().max(36500),
});

const exportSettingsSchema = z.object({
  surplusBenchmarkPct: z.number().finite().min(0).max(100).optional(),
  isaAnnualLimit: importMoney.optional(),
  isaYearStartMonth: z.number().int().min(1).max(12).optional(),
  isaYearStartDay: z.number().int().min(1).max(31).optional(),
  stalenessThresholds: stalenessThresholdsSchema.optional(),
  currentRatePct: z.number().finite().min(0).max(100).optional(),
  savingsRatePct: z.number().finite().min(0).max(100).optional(),
  investmentRatePct: z.number().finite().min(0).max(100).optional(),
  pensionRatePct: z.number().finite().min(0).max(100).optional(),
  inflationRatePct: z.number().finite().min(0).max(100).optional(),
  showPence: z.boolean().optional(),
});

export const householdExportSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  household: z.object({ name: importName }),
  settings: exportSettingsSchema,
  members: z.array(exportMemberSchema),
  subcategories: z.array(exportSubcategorySchema),
  incomeSources: z.array(exportIncomeSourceSchema),
  committedItems: z.array(exportCommittedItemSchema),
  discretionaryItems: z.array(exportDiscretionaryItemSchema),
  itemAmountPeriods: z.array(exportItemAmountPeriodSchema),
  waterfallHistory: z.array(exportWaterfallHistorySchema),
  assets: z.array(exportAssetSchema),
  accounts: z.array(exportAccountSchema),
  purchaseItems: z.array(exportPurchaseItemSchema),
  plannerYearBudgets: z.array(exportPlannerYearBudgetSchema),
  gifts: exportGiftsSectionSchema,
});

export const importOptionsSchema = z.object({
  mode: z.enum(["overwrite", "create_new"]),
});

export const importResultSchema = z.object({
  success: z.boolean(),
  householdId: z.string(),
  backupId: z.string().optional(),
});

export const CURRENT_EXPORT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export type HouseholdExport = z.infer<typeof householdExportSchema>;
export type ImportOptions = z.infer<typeof importOptionsSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
