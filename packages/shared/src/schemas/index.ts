/**
 * Shared validation schemas and types
 */

// Common bounded input primitives
export {
  MONEY_MAX,
  SORT_ORDER_MAX,
  YEAR_MIN,
  YEAR_MAX,
  NAME_MAX,
  NOTES_MAX,
  EMAIL_MAX,
  PASSWORD_MAX,
  ID_MAX,
  positiveMoneySchema,
  nonNegativeMoneySchema,
  signedMoneySchema,
  percentageSchema,
  signedPercentageSchema,
  sortOrderSchema,
  yearSchema,
  nameSchema,
  notesSchema,
  idSchema,
  emailSchema,
} from "./common.schemas";

// Household schemas and types
export {
  createHouseholdSchema,
  renameHouseholdSchema,
  createHouseholdInviteSchema,
  acceptInviteSchema,
  updateMemberRoleSchema,
  createMemberSchema,
  updateMemberSchema,
  deleteMemberSchema,
  type CreateHouseholdInput,
  type RenameHouseholdInput,
  type CreateHouseholdInviteInput,
  type AcceptInviteInput,
  type UpdateMemberRoleInput,
  type CreateMemberInput,
  type UpdateMemberInput,
  type DeleteMemberInput,
} from "./household.schemas";

// Waterfall schemas and types
export {
  IncomeFrequencyEnum,
  IncomeTypeEnum,
  WaterfallItemTypeEnum,
  createIncomeSourceSchema,
  updateIncomeSourceSchema,
  createCommittedBillSchema,
  updateCommittedBillSchema,
  createYearlyBillSchema,
  updateYearlyBillSchema,
  createDiscretionaryCategorySchema,
  updateDiscretionaryCategorySchema,
  createSavingsAllocationSchema,
  updateSavingsAllocationSchema,
  confirmBatchSchema,
  deleteAllWaterfallSchema,
  SpendTypeEnum,
  WaterfallTierEnum,
  createCommittedItemSchema,
  updateCommittedItemSchema,
  createDiscretionaryItemSchema,
  updateDiscretionaryItemSchema,
  type IncomeFrequency,
  type IncomeType,
  type WaterfallItemType,
  type CreateIncomeSourceInput,
  type UpdateIncomeSourceInput,
  type CreateCommittedBillInput,
  type UpdateCommittedBillInput,
  type CreateYearlyBillInput,
  type UpdateYearlyBillInput,
  type CreateDiscretionaryCategoryInput,
  type UpdateDiscretionaryCategoryInput,
  type CreateSavingsAllocationInput,
  type UpdateSavingsAllocationInput,
  type ConfirmBatchInput,
  type DeleteAllWaterfallInput,
  type SpendType,
  type WaterfallTier,
  type SubcategoryRow,
  type SubcategoryTotal,
  type CreateCommittedItemInput,
  type UpdateCommittedItemInput,
  type CreateDiscretionaryItemInput,
  type UpdateDiscretionaryItemInput,
  type WaterfallSummary,
  type IncomeByType,
  type IncomeSourceRow,
  type CommittedBillRow,
  type YearlyBillRow,
  type DiscretionaryCategoryRow,
  type SavingsAllocationRow,
  type CashflowMonth,
  ItemLifecycleStateEnum,
  type ItemLifecycleState,
  PeriodItemTypeEnum,
  type PeriodItemType,
  createPeriodSchema,
  updatePeriodSchema,
  type CreatePeriodInput,
  type UpdatePeriodInput,
  type PeriodRow,
  batchSaveSubcategoriesSchema,
  resetSubcategoriesSchema,
  createSubcategorySchema,
  type BatchSaveSubcategoriesInput,
  type SubcategoryEntry,
  type SubcategoryReassignment,
  type ResetSubcategoriesInput,
  type CreateSubcategoryInput,
} from "./waterfall.schemas";

// Settings schemas and types
export {
  stalenessThresholdsSchema,
  updateSettingsSchema,
  type StalenessThresholds,
  type UpdateSettingsInput,
} from "./settings.schemas";

// Snapshot schemas and types
export {
  createSnapshotSchema,
  renameSnapshotSchema,
  FinancialSummarySchema,
  SparklinePointSchema,
  type CreateSnapshotInput,
  type RenameSnapshotInput,
  type FinancialSummary,
  type SparklinePoint,
} from "./snapshot.schemas";

// Review session schemas and types
export {
  confirmedItemsSchema,
  updatedItemsSchema,
  updateReviewSessionSchema,
  type UpdateReviewSessionInput,
} from "./review-session.schemas";

// Assets schemas and types
export * from "./assets.schemas.js";

// Audit schemas and types
export * from "./audit.schemas";

// Planner schemas and types
export {
  PurchasePriorityEnum,
  PurchaseStatusEnum,
  createPurchaseSchema,
  updatePurchaseSchema,
  upsertYearBudgetSchema,
  type PurchasePriority,
  type PurchaseStatus,
  type CreatePurchaseInput,
  type UpdatePurchaseInput,
  type UpsertYearBudgetInput,
} from "./planner.schemas";

// Export/Import schemas and types
export {
  householdExportSchema,
  importOptionsSchema,
  importResultSchema,
  CURRENT_EXPORT_SCHEMA_VERSION,
  type HouseholdExport,
  type ImportOptions,
  type ImportResult,
} from "./export-import.schemas";

// Cashflow schemas and types
export * from "./cashflow.schemas";

// Forecast schemas and types
export {
  ForecastHorizonSchema,
  ForecastQuerySchema,
  NetWorthPointSchema,
  SurplusPointSchema,
  AccountBalancePointSchema,
  RetirementPointSchema,
  RetirementMemberProjectionSchema,
  ForecastProjectionSchema,
  MonthlyContributionsByScopeSchema,
  type ForecastHorizon,
  type ForecastQuery,
  type NetWorthPoint,
  type SurplusPoint,
  type AccountBalancePoint,
  type RetirementPoint,
  type RetirementMemberProjection,
  type ForecastProjection,
  type MonthlyContributionsByScope,
} from "./forecast.schemas";

// Gifts schemas and types
export * from "./gifts.schemas";

// Search schemas and types
export * from "./search.schemas";

// Response schemas and types (contracts + security allowlists for API responses)
export {
  // Auth
  userPreferencesResponseSchema,
  userResponseSchema,
  authLoginResponseSchema,
  authMeResponseSchema,
  authRefreshResponseSchema,
  csrfTokenResponseSchema,
  type UserResponse,
  type AuthLoginResponse,
  type AuthMeResponse,
  type AuthRefreshResponse,
  type CsrfTokenResponse,
  // Household
  householdCoreResponseSchema,
  householdWithCountResponseSchema,
  householdMembershipResponseSchema,
  householdResponseSchema,
  householdListResponseSchema,
  householdDetailResponseSchema,
  type HouseholdCoreResponse,
  type HouseholdMembershipResponse,
  type HouseholdResponse,
  type HouseholdListResponse,
  type HouseholdDetailResponse,
  // Invite
  inviteCreateResponseSchema,
  inviteDetailResponseSchema,
  inviteAcceptResponseSchema,
  type InviteCreateResponse,
  type InviteDetailResponse,
  type InviteAcceptResponse,
  // Waterfall items
  incomeSourceResponseSchema,
  committedItemResponseSchema,
  discretionaryItemResponseSchema,
  type IncomeSourceResponse,
  type CommittedItemResponse,
  type DiscretionaryItemResponse,
  type PeriodResponse,
  // Generic
  successResponseSchema,
  messageResponseSchema,
  errorResponseSchema,
  type SuccessResponse,
  type MessageResponse,
  type ErrorResponse,
} from "./responses";
