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
import { assetTypeSchema, accountTypeSchema } from "./assets.schemas";
import { PurchasePriorityEnum, PurchaseStatusEnum } from "./planner.schemas";
import { GiftDateTypeEnum } from "./gifts.schemas";

// ─── Shared primitives ──────────────────────────────────────────────────────

const isoDatetime = z.string().datetime({ offset: true });

/**
 * A permissive ISO date-ish string. Prisma `@db.Date` columns and cuid-derived
 * timestamps serialise to strings over the wire, but the exact precision varies
 * (date-only vs full datetime). Response contracts that mix both accept any
 * string here rather than over-constraining and rejecting valid payloads.
 */
const dateString = z.string();

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

// ─── Asset / Account responses ────────────────────────────────────────────────
// Shapes returned by assetsService.listAssetsByType / listAccountsByType and the
// create/update/summary handlers. Prisma `@db.Date`/`DateTime` columns serialise
// to strings over the wire, so date fields are typed as strings, not Date.
//
// These are NOT `.strict()`: the list handlers spread the full Prisma row
// (`...a`), which carries columns the UI ignores (e.g. `isCashflowLinked` on
// accounts). A strict allowlist would reject those valid extras. The security-
// sensitive strict allowlists live on user/auth responses above.

const balanceEntryResponseSchema = z.object({
  id: z.string(),
  value: z.number(),
  date: dateString,
  note: z.string().nullable(),
  createdAt: dateString,
});

export const assetItemResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: assetTypeSchema,
  householdId: z.string(),
  memberId: z.string().nullable(),
  growthRatePct: z.number().nullable(),
  lastReviewedAt: dateString.nullable(),
  disposedAt: dateString.nullable(),
  disposalAccountId: z.string().nullable(),
  createdAt: dateString,
  updatedAt: dateString,
  currentBalance: z.number(),
  currentBalanceDate: dateString.nullable(),
  balances: z.array(balanceEntryResponseSchema),
});

export const linkedContributionItemResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  spendType: z.string(),
  amount: z.number(),
  lumpSumExceedsCap: z.boolean(),
});

export const accountItemResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: accountTypeSchema,
  householdId: z.string(),
  memberId: z.string().nullable(),
  growthRatePct: z.number().nullable(),
  lastReviewedAt: dateString.nullable(),
  disposedAt: dateString.nullable(),
  disposalAccountId: z.string().nullable(),
  createdAt: dateString,
  updatedAt: dateString,
  currentBalance: z.number(),
  currentBalanceDate: dateString.nullable(),
  monthlyContribution: z.number(),
  monthlyContributionLimit: z.number().nullable(),
  isISA: z.boolean(),
  isaYearContribution: z.number().nullable(),
  spareMonthly: z.number().nullable(),
  isOverCap: z.boolean(),
  hasSpareCapacityNudge: z.boolean(),
  higherRateTarget: z
    .object({ id: z.string(), name: z.string(), growthRatePct: z.number() })
    .nullable(),
  effectiveGrowthRatePct: z.number().nullable(),
  linkedItems: z.array(linkedContributionItemResponseSchema),
  balances: z.array(balanceEntryResponseSchema),
});

export const assetsSummaryResponseSchema = z.object({
  assetTotals: z.record(assetTypeSchema, z.number()),
  accountTotals: z.record(accountTypeSchema, z.number()),
  grandTotal: z.number(),
});

export type BalanceEntryResponse = z.infer<typeof balanceEntryResponseSchema>;
export type AssetItem = z.infer<typeof assetItemResponseSchema>;
export type LinkedContributionItem = z.infer<typeof linkedContributionItemResponseSchema>;
export type AccountItem = z.infer<typeof accountItemResponseSchema>;
export type AssetsSummary = z.infer<typeof assetsSummaryResponseSchema>;

// ─── Planner responses ────────────────────────────────────────────────────────
// PurchaseItem rows (listPurchases / create / update) and the year-budget row
// (getYearBudget / upsertYearBudget). getYearBudget returns a transient default
// with `id`/`createdAt`/`updatedAt` as null when no row exists yet, so those
// fields are nullable in the contract.

export const purchaseItemResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  yearAdded: z.number().int(),
  name: z.string(),
  estimatedCost: z.number(),
  priority: PurchasePriorityEnum,
  scheduledThisYear: z.boolean(),
  fundingSources: z.array(z.string()),
  fundingAccountId: z.string().nullable(),
  status: PurchaseStatusEnum,
  reason: z.string().nullable(),
  comment: z.string().nullable(),
  addedAt: dateString,
  createdAt: dateString,
  updatedAt: dateString,
});

export const yearBudgetResponseSchema = z.object({
  id: z.string().nullable(),
  householdId: z.string(),
  year: z.number().int(),
  purchaseBudget: z.number(),
  giftBudget: z.number(),
  createdAt: dateString.nullable(),
  updatedAt: dateString.nullable(),
});

export type PurchaseItemResponse = z.infer<typeof purchaseItemResponseSchema>;
export type YearBudgetResponse = z.infer<typeof yearBudgetResponseSchema>;

// ─── Waterfall history response ───────────────────────────────────────────────
// WaterfallHistory rows returned by getHistory — recorded (value, recordedAt)
// points used to draw the item history sparkline.

export const waterfallHistoryResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  itemType: z.string(),
  itemId: z.string(),
  value: z.number(),
  recordedAt: dateString,
  createdAt: dateString,
});

export type WaterfallHistoryResponse = z.infer<typeof waterfallHistoryResponseSchema>;

// ─── Settings response ────────────────────────────────────────────────────────
// The full HouseholdSettings row returned by settingsService.getSettings /
// updateSettings. `stalenessThresholds` is a JSON column with a known shape.

export const stalenessThresholdsResponseSchema = z.object({
  income_source: z.number(),
  committed_item: z.number(),
  discretionary_item: z.number(),
  asset_item: z.number(),
  account_item: z.number(),
});

export const householdSettingsResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  surplusBenchmarkPct: z.number(),
  isaAnnualLimit: z.number(),
  isaYearStartMonth: z.number().int(),
  isaYearStartDay: z.number().int(),
  stalenessThresholds: stalenessThresholdsResponseSchema,
  currentRatePct: z.number(),
  savingsRatePct: z.number(),
  investmentRatePct: z.number(),
  pensionRatePct: z.number(),
  inflationRatePct: z.number(),
  showPence: z.boolean(),
  waterfallTipDismissed: z.boolean(),
  propertyRatePct: z.number(),
  vehicleRatePct: z.number(),
  otherAssetRatePct: z.number(),
  createdAt: dateString,
  updatedAt: dateString,
});

export type HouseholdSettingsResponse = z.infer<typeof householdSettingsResponseSchema>;

// ─── Snapshot responses ───────────────────────────────────────────────────────
// listSnapshots returns a projection (id/name/isAuto/createdAt); getSnapshot /
// createSnapshot / renameSnapshot return the full row including the JSON `data`
// blob. The blob is a computed financial-summary object with a stable-ish shape,
// but is typed loosely here because its keys evolve with the summary model.

export const snapshotListItemResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAuto: z.boolean(),
  createdAt: dateString,
});

export const snapshotDetailResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string(),
  isAuto: z.boolean(),
  data: z.record(z.unknown()),
  createdAt: dateString,
});

export type SnapshotListItemResponse = z.infer<typeof snapshotListItemResponseSchema>;
export type SnapshotDetailResponse = z.infer<typeof snapshotDetailResponseSchema>;

// ─── Gift config responses ────────────────────────────────────────────────────
// Shapes returned by the gift-config endpoints and person/event mutations that
// the frontend service currently types as `any`. State/settings/detail/upcoming
// already have DTO types in gifts.schemas.ts; these fill the config-view gaps.

export const giftPersonResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
  memberId: z.string().nullable(),
  createdAt: dateString,
  updatedAt: dateString,
});

export const giftEventResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string(),
  dateType: GiftDateTypeEnum,
  dateMonth: z.number().int().nullable(),
  dateDay: z.number().int().nullable(),
  isLocked: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: dateString,
  updatedAt: dateString,
});

export const giftConfigPersonResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
  memberId: z.string().nullable(),
  plannedCount: z.number().int(),
  boughtCount: z.number().int(),
});

export const giftAllocationResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  giftPersonId: z.string(),
  giftEventId: z.string(),
  year: z.number().int(),
  planned: z.number(),
  spent: z.number().nullable(),
  status: z.enum(["planned", "bought", "skipped"]),
  notes: z.string().nullable(),
  dateMonth: z.number().int().nullable(),
  dateDay: z.number().int().nullable(),
  createdAt: dateString,
  updatedAt: dateString,
});

export const giftBudgetSetResponseSchema = z.object({
  annualBudget: z.number(),
});

export type GiftPersonResponse = z.infer<typeof giftPersonResponseSchema>;
export type GiftEventResponse = z.infer<typeof giftEventResponseSchema>;
export type GiftConfigPersonResponse = z.infer<typeof giftConfigPersonResponseSchema>;
export type GiftAllocationResponse = z.infer<typeof giftAllocationResponseSchema>;
export type GiftBudgetSetResponse = z.infer<typeof giftBudgetSetResponseSchema>;
