import { apiClient } from "@/lib/api";
import type {
  AssetType,
  AccountType,
  CreateAssetInput,
  UpdateAssetInput,
  RecordAssetBalanceInput,
  CreateAccountInput,
  UpdateAccountInput,
  RecordAccountBalanceInput,
  IsaAllowanceSummary,
} from "@finplan/shared";

export interface AssetItem {
  id: string;
  name: string;
  type: AssetType;
  householdId: string;
  memberId: string | null;
  growthRatePct: number | null;
  lastReviewedAt: string | null;
  disposedAt: string | null;
  disposalAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  currentBalance: number;
  currentBalanceDate: string | null;
  balances: Array<{
    id: string;
    value: number;
    date: string;
    note: string | null;
    createdAt: string;
  }>;
}

export interface LinkedContributionItem {
  id: string;
  name: string;
  spendType: string;
  amount: number;
  lumpSumExceedsCap: boolean;
}

export interface AccountItem {
  id: string;
  name: string;
  type: AccountType;
  householdId: string;
  memberId: string | null;
  growthRatePct: number | null;
  lastReviewedAt: string | null;
  disposedAt: string | null;
  disposalAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  currentBalance: number;
  currentBalanceDate: string | null;
  monthlyContribution: number;
  monthlyContributionLimit: number | null;
  isISA: boolean;
  isaYearContribution: number | null;
  spareMonthly: number | null;
  isOverCap: boolean;
  hasSpareCapacityNudge: boolean;
  higherRateTarget: { id: string; name: string; growthRatePct: number } | null;
  effectiveGrowthRatePct: number | null;
  linkedItems: LinkedContributionItem[];
  balances: Array<{
    id: string;
    value: number;
    date: string;
    note: string | null;
    createdAt: string;
  }>;
}

export interface AssetsSummary {
  assetTotals: Record<AssetType, number>;
  accountTotals: Record<AccountType, number>;
  grandTotal: number;
}

export const assetsApiService = {
  getSummary: () => apiClient.get<AssetsSummary>("/api/assets/summary"),

  listAssetsByType: (type: AssetType, opts: { includeDisposed?: boolean } = {}) =>
    apiClient.get<AssetItem[]>(
      `/api/assets/assets/${type}${opts.includeDisposed ? "?disposed=true" : ""}`
    ),

  createAsset: (data: CreateAssetInput) => apiClient.post<AssetItem>("/api/assets/assets", data),

  updateAsset: (assetId: string, data: UpdateAssetInput) =>
    apiClient.patch<AssetItem>(`/api/assets/assets/${assetId}`, data),

  deleteAsset: (assetId: string) => apiClient.delete(`/api/assets/assets/${assetId}`),

  recordAssetBalance: (assetId: string, data: RecordAssetBalanceInput) =>
    apiClient.post(`/api/assets/assets/${assetId}/balance`, data),

  confirmAsset: (assetId: string) => apiClient.post(`/api/assets/assets/${assetId}/confirm`, {}),

  listAccountsByType: (type: AccountType, opts: { includeDisposed?: boolean } = {}) =>
    apiClient.get<AccountItem[]>(
      `/api/assets/accounts/${type}${opts.includeDisposed ? "?disposed=true" : ""}`
    ),

  createAccount: (data: CreateAccountInput) =>
    apiClient.post<AccountItem>("/api/assets/accounts", data),

  updateAccount: (accountId: string, data: UpdateAccountInput) =>
    apiClient.patch<AccountItem>(`/api/assets/accounts/${accountId}`, data),

  deleteAccount: (accountId: string) => apiClient.delete(`/api/assets/accounts/${accountId}`),

  recordAccountBalance: (accountId: string, data: RecordAccountBalanceInput) =>
    apiClient.post(`/api/assets/accounts/${accountId}/balance`, data),

  confirmAccount: (accountId: string) =>
    apiClient.post(`/api/assets/accounts/${accountId}/confirm`, {}),
};

export async function getIsaAllowance(): Promise<IsaAllowanceSummary> {
  return apiClient.get<IsaAllowanceSummary>("/api/accounts/isa-allowance");
}
