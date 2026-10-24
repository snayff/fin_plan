/**
 * Centralized TanStack Query keys.
 *
 * Every query key and cross-domain invalidation prefix used by the app's hooks
 * lives here, namespaced by domain. Hooks import from this module rather than
 * defining ad-hoc `*_KEYS` objects or scattering magic-string arrays.
 *
 * The values here are byte-identical to the keys the hooks used previously —
 * this is a pure indirection refactor, so cache/invalidation behaviour is
 * unchanged. When adding a new key, keep the array shape stable so prefix
 * invalidation continues to match.
 */

import type {
  AssetType,
  AccountType,
  CashflowProjectionQuery,
  CashflowShortfallQuery,
  ForecastHorizon,
} from "@finplan/shared";

export const queryKeys = {
  waterfall: {
    /** Root prefix for all waterfall keys. */
    all: ["waterfall"] as const,
    summary: ["waterfall", "summary"] as const,
    financialSummary: ["waterfall", "financial-summary"] as const,
    history: (type: string, id: string) => ["waterfall", "history", type, id] as const,
    subcategories: (tier: string) => ["waterfall", "subcategories", tier] as const,
    tierItems: (tier: string) => ["waterfall", "tier-items", tier] as const,
  },

  periods: {
    list: (itemType: string, itemId: string) => ["periods", itemType, itemId] as const,
  },

  cashflow: {
    /** Root prefix for all cashflow keys. */
    all: ["cashflow"] as const,
    projection: (q: CashflowProjectionQuery) => ["cashflow", "projection", q] as const,
    /** Prefix for invalidating every cashflow projection regardless of query. */
    projectionAll: ["cashflow", "projection"] as const,
    month: (year: number, month: number) => ["cashflow", "month", year, month] as const,
    /** Prefix for invalidating every cashflow month view. */
    monthAll: ["cashflow", "month"] as const,
    linkable: ["cashflow", "linkable-accounts"] as const,
    /** Prefix for invalidating every shortfall query regardless of window. */
    shortfall: ["cashflow", "shortfall"] as const,
    shortfallQuery: (q: CashflowShortfallQuery) => ["cashflow", "shortfall", q] as const,
  },

  forecast: {
    /** Root prefix — invalidating this refreshes every forecast horizon. */
    all: ["forecast"] as const,
    projections: (horizonYears: ForecastHorizon) => ["forecast", horizonYears] as const,
  },

  assets: {
    /** Root prefix for all asset/account keys. */
    all: ["assets"] as const,
    summary: ["assets", "summary"] as const,
    assetsPrefix: ["assets", "assets"] as const,
    accountsPrefix: ["assets", "accounts"] as const,
    assetsByType: (type: AssetType, includeDisposed = false) =>
      ["assets", "assets", type, includeDisposed ? "all" : "active"] as const,
    accountsByType: (type: AccountType, includeDisposed = false) =>
      ["assets", "accounts", type, includeDisposed ? "all" : "active"] as const,
  },

  isaAllowance: ["isa-allowance"] as const,

  gifts: {
    all: ["gifts"] as const,
    state: (year: number) => ["gifts", "state", year] as const,
    statePrefix: ["gifts", "state"] as const,
    person: (id: string, year: number) => ["gifts", "person", id, year] as const,
    personPrefix: ["gifts", "person"] as const,
    upcoming: (year: number) => ["gifts", "upcoming", year] as const,
    upcomingPrefix: ["gifts", "upcoming"] as const,
    years: () => ["gifts", "years"] as const,
    configPeople: (filter: string, year: number) =>
      ["gifts", "configPeople", filter, year] as const,
    configPeoplePrefix: ["gifts", "configPeople"] as const,
    configEvents: () => ["gifts", "configEvents"] as const,
    quickAddMatrix: (year: number) => ["gifts", "quickAddMatrix", year] as const,
    quickAddMatrixPrefix: ["gifts", "quickAddMatrix"] as const,
    settings: () => ["gifts", "settings"] as const,
  },

  settings: {
    settings: ["settings"] as const,
    snapshots: ["snapshots"] as const,
    snapshot: (id: string) => ["snapshots", id] as const,
    household: (id: string) => ["household", id] as const,
    householdsList: ["households"] as const,
    members: (id: string) => ["household", id, "members"] as const,
    auditLog: (filters: unknown) => ["audit-log", filters] as const,
    securityActivity: ["security-activity"] as const,
  },

  subcategorySettings: {
    counts: (tier: string) => ["subcategory-counts", tier] as const,
  },
} as const;

/**
 * Shared ISA-allowance key.
 * @deprecated Prefer `queryKeys.isaAllowance`. Kept for existing imports.
 */
export const ISA_ALLOWANCE_KEY = queryKeys.isaAllowance;
