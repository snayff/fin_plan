import { z } from "zod";
import { nonNegativeMoneySchema } from "./common.schemas";

export const stalenessThresholdsSchema = z.object({
  income_source: z.number().int().min(1).max(36500).optional(),
  committed_item: z.number().int().min(1).max(36500).optional(),
  discretionary_item: z.number().int().min(1).max(36500).optional(),
  asset_item: z.number().int().positive().max(36500).optional(),
  account_item: z.number().int().positive().max(36500).optional(),
});

export const updateSettingsSchema = z.object({
  surplusBenchmarkPct: z.number().min(0).max(100).optional(),
  isaAnnualLimit: nonNegativeMoneySchema.optional(),
  isaYearStartMonth: z.number().int().min(1).max(12).optional(),
  isaYearStartDay: z.number().int().min(1).max(31).optional(),
  stalenessThresholds: stalenessThresholdsSchema.optional(),
  currentRatePct: z.number().min(0).max(100).optional(),
  savingsRatePct: z.number().min(0).max(100).optional(),
  investmentRatePct: z.number().min(0).max(100).optional(),
  pensionRatePct: z.number().min(0).max(100).optional(),
  inflationRatePct: z.number().min(0).max(100).optional(),
  propertyRatePct: z.number().min(0).max(100).optional(),
  vehicleRatePct: z.number().min(-100).max(100).optional(),
  otherAssetRatePct: z.number().min(-100).max(100).optional(),
  showPence: z.boolean().optional(),
  waterfallTipDismissed: z.boolean().optional(),
});

export type StalenessThresholds = z.infer<typeof stalenessThresholdsSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
