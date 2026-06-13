import { z } from "zod";
import { idSchema, signedMoneySchema } from "./common.schemas";

export const confirmedItemsSchema = z.record(z.array(idSchema).max(500));

export const updatedItemsSchema = z.record(
  z.object({ from: signedMoneySchema, to: signedMoneySchema })
);

export const updateReviewSessionSchema = z.object({
  currentStep: z.number().int().min(0).max(1000).optional(),
  confirmedItems: confirmedItemsSchema.optional(),
  updatedItems: updatedItemsSchema.optional(),
});

export type UpdateReviewSessionInput = z.infer<typeof updateReviewSessionSchema>;
