import { z } from "zod";
import { idSchema } from "./common.schemas";

export const HouseholdRoleEnum = z.enum(["owner", "admin", "member"]);
export type HouseholdRole = z.infer<typeof HouseholdRoleEnum>;

export const ResourceSlugEnum = z.enum([
  "income-source",
  "committed-item",
  "discretionary-item",
  "wealth-account",
  "liability",
  "household-settings",
  "household-member",
  "household-invite",
  "planner-goal",
  "review-session",
  "setup-session",
  "surplus-config",
  "isa-config",
  "staleness-config",
  // richer-audit-logging additions
  "snapshot",
  "user",
  "gift-person",
  "gift-event",
  "gift-allocation",
  "member-profile",
  "year-budget",
  "household",
  // asset & account slugs
  "asset",
  "asset-balance",
  "account",
  "account-balance",
  "session",
  "subcategory",
  // waterfall-wide delete + item amount-period mutations
  "waterfall",
  "item-period",
]);
export type ResourceSlug = z.infer<typeof ResourceSlugEnum>;

/**
 * Single source of truth for every audit action name written by backend code.
 * Values mirror keys so a drift test can enforce `v === k` for every entry.
 */
export const AuditAction = {
  // Auth events
  REGISTER: "REGISTER",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  TOKEN_REFRESH: "TOKEN_REFRESH",
  SESSION_REVOKED: "SESSION_REVOKED",
  ALL_SESSIONS_REVOKED: "ALL_SESSIONS_REVOKED",
  UPDATE_PROFILE: "UPDATE_PROFILE",
  CHANGE_PASSWORD: "CHANGE_PASSWORD",
  PASSWORD_RESET_REQUEST: "PASSWORD_RESET_REQUEST",
  PASSWORD_RESET: "PASSWORD_RESET",

  // Household
  CREATE_HOUSEHOLD: "CREATE_HOUSEHOLD",
  UPDATE_HOUSEHOLD: "UPDATE_HOUSEHOLD",
  DELETE_HOUSEHOLD: "DELETE_HOUSEHOLD",
  LEAVE_HOUSEHOLD: "LEAVE_HOUSEHOLD",
  INVITE_MEMBER: "INVITE_MEMBER",
  ACCEPT_INVITE: "ACCEPT_INVITE",
  JOIN_VIA_INVITE: "JOIN_VIA_INVITE",
  CANCEL_INVITE: "CANCEL_INVITE",
  REMOVE_MEMBER: "REMOVE_MEMBER",
  UPDATE_MEMBER_ROLE: "UPDATE_MEMBER_ROLE",
  CREATE_MEMBER_PROFILE: "CREATE_MEMBER_PROFILE",
  UPDATE_MEMBER_PROFILE: "UPDATE_MEMBER_PROFILE",
  DELETE_MEMBER_PROFILE: "DELETE_MEMBER_PROFILE",
  UPDATE_HOUSEHOLD_SETTINGS: "UPDATE_HOUSEHOLD_SETTINGS",

  // Waterfall (already emitted by existing code)
  CREATE_INCOME_SOURCE: "CREATE_INCOME_SOURCE",
  UPDATE_INCOME_SOURCE: "UPDATE_INCOME_SOURCE",
  DELETE_INCOME_SOURCE: "DELETE_INCOME_SOURCE",
  CREATE_COMMITTED_ITEM: "CREATE_COMMITTED_ITEM",
  UPDATE_COMMITTED_ITEM: "UPDATE_COMMITTED_ITEM",
  DELETE_COMMITTED_ITEM: "DELETE_COMMITTED_ITEM",
  CREATE_DISCRETIONARY_ITEM: "CREATE_DISCRETIONARY_ITEM",
  UPDATE_DISCRETIONARY_ITEM: "UPDATE_DISCRETIONARY_ITEM",
  DELETE_DISCRETIONARY_ITEM: "DELETE_DISCRETIONARY_ITEM",
  CREATE_SUBCATEGORY: "CREATE_SUBCATEGORY",
  // Mutationless "confirm" (review-touch) of a waterfall item — covers
  // income/committed/yearly/discretionary/savings confirms and confirm-batch.
  CONFIRM_WATERFALL_ITEM: "CONFIRM_WATERFALL_ITEM",
  // Owner/admin-only destructive wipe of the entire household waterfall.
  DELETE_ALL_WATERFALL: "DELETE_ALL_WATERFALL",
  // Item amount-period mutations (POST/PATCH/DELETE /waterfall/periods*).
  CREATE_ITEM_PERIOD: "CREATE_ITEM_PERIOD",
  UPDATE_ITEM_PERIOD: "UPDATE_ITEM_PERIOD",
  DELETE_ITEM_PERIOD: "DELETE_ITEM_PERIOD",

  // Wealth
  CREATE_WEALTH_ACCOUNT: "CREATE_WEALTH_ACCOUNT",
  UPDATE_WEALTH_ACCOUNT: "UPDATE_WEALTH_ACCOUNT",
  DELETE_WEALTH_ACCOUNT: "DELETE_WEALTH_ACCOUNT",
  CREATE_LIABILITY: "CREATE_LIABILITY",
  UPDATE_LIABILITY: "UPDATE_LIABILITY",
  DELETE_LIABILITY: "DELETE_LIABILITY",

  // Snapshots
  CREATE_SNAPSHOT: "CREATE_SNAPSHOT",
  UPDATE_SNAPSHOT: "UPDATE_SNAPSHOT",
  DELETE_SNAPSHOT: "DELETE_SNAPSHOT",

  // Gifts
  CREATE_GIFT_PERSON: "CREATE_GIFT_PERSON",
  UPDATE_GIFT_PERSON: "UPDATE_GIFT_PERSON",
  DELETE_GIFT_PERSON: "DELETE_GIFT_PERSON",
  CREATE_GIFT_EVENT: "CREATE_GIFT_EVENT",
  UPDATE_GIFT_EVENT: "UPDATE_GIFT_EVENT",
  DELETE_GIFT_EVENT: "DELETE_GIFT_EVENT",
  UPSERT_GIFT_ALLOCATIONS: "UPSERT_GIFT_ALLOCATIONS",

  // Planner
  CREATE_PLANNER_GOAL: "CREATE_PLANNER_GOAL",
  UPDATE_PLANNER_GOAL: "UPDATE_PLANNER_GOAL",
  DELETE_PLANNER_GOAL: "DELETE_PLANNER_GOAL",
  UPSERT_YEAR_BUDGET: "UPSERT_YEAR_BUDGET",

  // Review / setup sessions (already emitted)
  UPDATE_REVIEW_SESSION: "UPDATE_REVIEW_SESSION",
  UPDATE_SETUP_SESSION: "UPDATE_SETUP_SESSION",

  // Import / export
  EXPORT_DATA: "EXPORT_DATA",
  IMPORT_DATA: "IMPORT_DATA",

  // Assets & accounts
  CREATE_ASSET: "CREATE_ASSET",
  UPDATE_ASSET: "UPDATE_ASSET",
  DELETE_ASSET: "DELETE_ASSET",
  RECORD_ASSET_BALANCE: "RECORD_ASSET_BALANCE",
  CONFIRM_ASSET: "CONFIRM_ASSET",
  CREATE_ACCOUNT: "CREATE_ACCOUNT",
  UPDATE_ACCOUNT: "UPDATE_ACCOUNT",
  DELETE_ACCOUNT: "DELETE_ACCOUNT",
  RECORD_ACCOUNT_BALANCE: "RECORD_ACCOUNT_BALANCE",
  CONFIRM_ACCOUNT: "CONFIRM_ACCOUNT",
  UPDATE_ACCOUNT_CASHFLOW_LINK: "UPDATE_ACCOUNT_CASHFLOW_LINK",

  // Sessions (create variants)
  CREATE_REVIEW_SESSION: "CREATE_REVIEW_SESSION",
  CREATE_SETUP_SESSION: "CREATE_SETUP_SESSION",
} as const;

export type AuditActionKey = keyof typeof AuditAction;
export type AuditActionValue = (typeof AuditAction)[AuditActionKey];
export const AuditActionEnum = z.enum(
  Object.values(AuditAction) as [AuditActionValue, ...AuditActionValue[]]
);

export const AuditChangeSchema = z.object({
  field: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type AuditChange = z.infer<typeof AuditChangeSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  actorName: z.string().nullable(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable(),
  changes: z.array(AuditChangeSchema).nullable(),
  createdAt: z.string().datetime(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const AuditLogQuerySchema = z.object({
  actorId: idSchema.optional(),
  resource: ResourceSlugEnum.optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const AuditLogResponseSchema = z.object({
  entries: z.array(AuditEntrySchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

/** Security activity — per-user, auth-scoped view. */
export const SecurityActivityQuerySchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type SecurityActivityQuery = z.infer<typeof SecurityActivityQuerySchema>;

export const SecurityActivityEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  createdAt: z.string().datetime(),
  metadata: z.unknown().nullable(),
});
export type SecurityActivityEntry = z.infer<typeof SecurityActivityEntrySchema>;

export const SecurityActivityResponseSchema = z.object({
  entries: z.array(SecurityActivityEntrySchema),
  nextCursor: z.string().nullable(),
});
export type SecurityActivityResponse = z.infer<typeof SecurityActivityResponseSchema>;
