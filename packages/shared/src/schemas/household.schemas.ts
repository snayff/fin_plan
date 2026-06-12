import { z } from "zod";
import { EMAIL_MAX, NAME_MAX, PASSWORD_MAX, idSchema } from "./common.schemas";

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1, "Household name is required").max(NAME_MAX),
});

export const renameHouseholdSchema = z.object({
  name: z.string().trim().min(1, "Household name is required").max(NAME_MAX),
});

export const createHouseholdInviteSchema = z.object({
  email: z.string().trim().max(EMAIL_MAX).email("A valid email address is required"),
  role: z.enum(["member", "admin"]).optional().default("member"),
});

export const acceptInviteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(NAME_MAX),
  email: z.string().trim().max(EMAIL_MAX).email("A valid email address is required"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters long")
    .max(PASSWORD_MAX, "Password is too long"),
});

// role: only member or admin can be assigned — owner is immutable
// targetUserId comes from the URL param, not the body
export const updateMemberRoleSchema = z.object({
  role: z.enum(["member", "admin"]),
});

export const createMemberSchema = z.object({
  name: z.string().trim().min(1, "Member name is required").max(NAME_MAX),
  dateOfBirth: z.string().datetime().nullable().optional(),
  retirementYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export const updateMemberSchema = z.object({
  name: z.string().trim().min(1, "Member name is required").max(NAME_MAX).optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  retirementYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export const deleteMemberSchema = z.object({
  reassignToMemberId: idSchema.optional(),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type RenameHouseholdInput = z.infer<typeof renameHouseholdSchema>;
export type CreateHouseholdInviteInput = z.infer<typeof createHouseholdInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type DeleteMemberInput = z.infer<typeof deleteMemberSchema>;
