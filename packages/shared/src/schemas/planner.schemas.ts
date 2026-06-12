import { z } from "zod";
import {
  idSchema,
  nameSchema,
  nonNegativeMoneySchema,
  notesSchema,
  positiveMoneySchema,
} from "./common.schemas";

export const PurchasePriorityEnum = z.enum(["lowest", "low", "medium", "high"]);
export type PurchasePriority = z.infer<typeof PurchasePriorityEnum>;

export const PurchaseStatusEnum = z.enum(["not_started", "in_progress", "done"]);
export type PurchaseStatus = z.infer<typeof PurchaseStatusEnum>;

// ─── Purchases ────────────────────────────────────────────────────────────────

export const createPurchaseSchema = z.object({
  name: nameSchema,
  estimatedCost: positiveMoneySchema,
  priority: PurchasePriorityEnum.optional(),
  scheduledThisYear: z.boolean().optional(),
  fundingSources: z.array(z.string().max(100)).max(50).optional(),
  fundingAccountId: idSchema.optional(),
  status: PurchaseStatusEnum.optional(),
  reason: notesSchema.optional(),
  comment: notesSchema.optional(),
});

export const updatePurchaseSchema = z.object({
  name: nameSchema.optional(),
  estimatedCost: positiveMoneySchema.optional(),
  priority: PurchasePriorityEnum.optional(),
  scheduledThisYear: z.boolean().optional(),
  fundingSources: z.array(z.string().max(100)).max(50).optional(),
  fundingAccountId: idSchema.nullable().optional(),
  status: PurchaseStatusEnum.optional(),
  reason: notesSchema.nullable().optional(),
  comment: notesSchema.nullable().optional(),
});

export const upsertYearBudgetSchema = z.object({
  purchaseBudget: nonNegativeMoneySchema.optional(),
  giftBudget: nonNegativeMoneySchema.optional(),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
export type UpsertYearBudgetInput = z.infer<typeof upsertYearBudgetSchema>;
