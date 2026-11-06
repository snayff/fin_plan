import { z } from "zod";
import { idSchema, signedMoneySchema } from "./common.schemas";

// Keys are entity identifiers (subcategory / item ids); bound them with idSchema
// so the record key can't carry an unbounded string payload.
export const confirmedItemsSchema = z.record(idSchema, z.array(idSchema).max(500));

export const updatedItemsSchema = z.record(
  idSchema,
  z.object({ from: signedMoneySchema, to: signedMoneySchema })
);

export const updateReviewSessionSchema = z.object({
  currentStep: z.number().int().min(0).max(1000).optional(),
  confirmedItems: confirmedItemsSchema.optional(),
  updatedItems: updatedItemsSchema.optional(),
});

export type UpdateReviewSessionInput = z.infer<typeof updateReviewSessionSchema>;
