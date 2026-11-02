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
  AssetItem,
  AccountItem,
  AssetsSummary,
} from "@finplan/shared";

// AssetItem, AccountItem, LinkedContributionItem and AssetsSummary are the
// canonical response contracts — defined once in @finplan/shared/responses and
// re-exported here so existing consumers importing them from this module keep
// working.
export type {
  AssetItem,
  AccountItem,
  LinkedContributionItem,
  AssetsSummary,
} from "@finplan/shared";

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
  return apiClient.get<IsaAllowanceSummary>("/api/assets/accounts/isa-allowance");
}
