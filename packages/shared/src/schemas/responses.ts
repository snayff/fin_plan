/**
 * Response schemas — contracts and security allowlists for API responses.
 *
 * These Zod schemas serve two purposes:
 * 1. **Contract validation**: MSW mock fixtures can be validated against these
 *    schemas so frontend test doubles never drift from real backend shapes.
 * 2. **Security allowlists**: Every object schema uses `.strict()`, which
 *    rejects unexpected fields. This prevents accidental leaks of sensitive
 *    data (e.g. passwordHash, twoFactorSecret) in API responses.
 *
 * Date fields are ISO 8601 strings (not Date objects) because JSON
 * serialisation converts dates to strings over the wire.
 */

import { z } from "zod";
import {
  IncomeFrequencyEnum,
  IncomeTypeEnum,
  SpendTypeEnum,
  ItemLifecycleStateEnum,
} from "./waterfall.schemas";

// ─── Shared primitives ──────────────────────────────────────────────────────

const isoDatetime = z.string().datetime({ offset: true });

// ─── User ───────────────────────────────────────────────────────────────────
// Explicitly excludes: passwordHash, twoFactorSecret, twoFactorEnabled,
// twoFactorBackupCodes, and all relation fields.

export const userPreferencesResponseSchema = z
  .object({
    currency: z.string(),
    dateFormat: z.string(),
    theme: z.string(),
    defaultInflationRate: z.number(),
  })
  .strict();

export const userResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    activeHouseholdId: z.string().nullable(),
    createdAt: isoDatetime,
    updatedAt: isoDatetime,
    preferences: userPreferencesResponseSchema.nullable().optional(),
  })
  .strict();

export type UserResponse = z.infer<typeof userResponseSchema>;

// ─── Auth responses ─────────────────────────────────────────────────────────

export const authLoginResponseSchema = z
  .object({
    user: userResponseSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .strict();

export const authMeResponseSchema = z
  .object({
    user: userResponseSchema,
  })
  .strict();

export const authRefreshResponseSchema = z
  .object({
    accessToken: z.string(),
  })
  .strict();

export const csrfTokenResponseSchema = z
  .object({
    csrfToken: z.string(),
  })
  .strict();

export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>;
export type CsrfTokenResponse = z.infer<typeof csrfTokenResponseSchema>;

// ─── Household responses ────────────────────────────────────────────────────

export const householdCoreResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: isoDatetime,
    updatedAt: isoDatetime,
  })
  .strict();

export const householdWithCountResponseSchema = householdCoreResponseSchema.extend({
  _count: z.object({ members: z.number() }).strict(),
});

export const householdMembershipResponseSchema = z
  .object({
    householdId: z.string(),
    userId: z.string(),
    role: z.enum(["owner", "admin", "member"]),
    joinedAt: isoDatetime,
    household: householdWithCountResponseSchema,
  })
  .strict();

export const householdResponseSchema = z
  .object({
    household: householdCoreResponseSchema,
  })
  .strict();

export const householdListResponseSchema = z
  .object({
    households: z.array(householdMembershipResponseSchema),
  })
  .strict();

export const householdDetailResponseSchema = z
  .object({
    household: householdCoreResponseSchema.extend({
      members: z.array(z.record(z.unknown())),
      invites: z.array(z.record(z.unknown())),
    }),
  })
  .strict();

export type HouseholdCoreResponse = z.infer<typeof householdCoreResponseSchema>;
export type HouseholdMembershipResponse = z.infer<typeof householdMembershipResponseSchema>;
export type HouseholdResponse = z.infer<typeof householdResponseSchema>;
export type HouseholdListResponse = z.infer<typeof householdListResponseSchema>;
export type HouseholdDetailResponse = z.infer<typeof householdDetailResponseSchema>;

// ─── Invite responses ───────────────────────────────────────────────────────

export const inviteCreateResponseSchema = z
  .object({
    token: z.string(),
    invitedEmail: z.string(),
  })
  .strict();

export const inviteDetailResponseSchema = z
  .object({
    householdId: z.string(),
    householdName: z.string(),
    emailRequired: z.boolean(),
    maskedInvitedEmail: z.string(),
  })
  .strict();

export const inviteAcceptResponseSchema = z
  .object({
    user: userResponseSchema,
    accessToken: z.string(),
  })
  .strict();

export type InviteCreateResponse = z.infer<typeof inviteCreateResponseSchema>;
export type InviteDetailResponse = z.infer<typeof inviteDetailResponseSchema>;
export type InviteAcceptResponse = z.infer<typeof inviteAcceptResponseSchema>;

// ─── Waterfall item responses ───────────────────────────────────────────────
// These match the shape returned by enrichItemsWithPeriods: the Prisma model
// fields plus { amount, lifecycleState, periods } added by the enrichment step.

const periodResponseSchema = z
  .object({
    id: z.string(),
    itemType: z.string(),
    itemId: z.string(),
    startDate: isoDatetime,
    endDate: isoDatetime.nullable(),
    amount: z.number(),
    dueDate: isoDatetime.nullable(),
    createdAt: isoDatetime,
  })
  .strict();

export const incomeSourceResponseSchema = z
  .object({
    id: z.string(),
    householdId: z.string(),
    subcategoryId: z.string(),
    name: z.string(),
    frequency: IncomeFrequencyEnum,
    incomeType: IncomeTypeEnum,
    dueDate: isoDatetime,
    memberId: z.string().nullable(),
    sortOrder: z.number().int(),
    lastReviewedAt: isoDatetime,
    createdAt: isoDatetime,
    updatedAt: isoDatetime,
    notes: z.string().nullable(),
    // Enriched by enrichItemsWithPeriods
    amount: z.number(),
    lifecycleState: ItemLifecycleStateEnum,
    periods: z.array(periodResponseSchema),
  })
  .strict();

export const committedItemResponseSchema = z
  .object({
    id: z.string(),
    householdId: z.string(),
    subcategoryId: z.string(),
    name: z.string(),
    spendType: SpendTypeEnum,
    notes: z.string().nullable(),
    memberId: z.string().nullable(),
    dueDate: isoDatetime,
    sortOrder: z.number().int(),
    lastReviewedAt: isoDatetime,
    createdAt: isoDatetime,
    updatedAt: isoDatetime,
    // Enriched by enrichItemsWithPeriods
    amount: z.number(),
    lifecycleState: ItemLifecycleStateEnum,
    periods: z.array(periodResponseSchema),
  })
  .strict();

export const discretionaryItemResponseSchema = z
  .object({
    id: z.string(),
    householdId: z.string(),
    subcategoryId: z.string(),
    name: z.string(),
    spendType: SpendTypeEnum,
    notes: z.string().nullable(),
    memberId: z.string().nullable(),
    dueDate: isoDatetime.nullable(),
    sortOrder: z.number().int(),
    lastReviewedAt: isoDatetime,
    isPlannerOwned: z.boolean(),
    linkedAccountId: z.string().nullable(),
    linkedAccount: z.object({ id: z.string(), name: z.string(), type: z.string() }).nullable(),
    createdAt: isoDatetime,
    updatedAt: isoDatetime,
    // Enriched by enrichItemsWithPeriods
    amount: z.number(),
    lifecycleState: ItemLifecycleStateEnum,
    periods: z.array(periodResponseSchema),
  })
  .strict();

export type IncomeSourceResponse = z.infer<typeof incomeSourceResponseSchema>;
export type CommittedItemResponse = z.infer<typeof committedItemResponseSchema>;
export type DiscretionaryItemResponse = z.infer<typeof discretionaryItemResponseSchema>;
export type PeriodResponse = z.infer<typeof periodResponseSchema>;

// ─── Generic success / message responses ────────────────────────────────────

export const successResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .strict();

export const messageResponseSchema = z
  .object({
    message: z.string(),
  })
  .strict();

export const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        statusCode: z.number().optional(),
      })
      .strict(),
  })
  .strict();

export type SuccessResponse = z.infer<typeof successResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
