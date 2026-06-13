import { apiClient } from "@/lib/api";
import type {
  WaterfallSummary,
  SubcategoryRow,
  CreateIncomeSourceInput,
  UpdateIncomeSourceInput,
  CreateCommittedItemInput,
  UpdateCommittedItemInput,
  CreateDiscretionaryItemInput,
  UpdateDiscretionaryItemInput,
  ConfirmBatchInput,
  UpsertYearBudgetInput,
  FinancialSummary,
  PeriodRow,
  CreatePeriodInput,
  UpdatePeriodInput,
  BatchSaveSubcategoriesInput,
  ResetSubcategoriesInput,
  DiscretionaryItemResponse,
} from "@finplan/shared";

export const waterfallService = {
  getSummary: () => apiClient.get<WaterfallSummary>("/api/waterfall"),

  // Income
  listIncome: () => apiClient.get<any[]>("/api/waterfall/income"),
  createIncome: (data: CreateIncomeSourceInput) =>
    apiClient.post<any>("/api/waterfall/income", data),
  updateIncome: (id: string, data: UpdateIncomeSourceInput) =>
    apiClient.patch<any>(`/api/waterfall/income/${id}`, data),
  deleteIncome: (id: string) => apiClient.delete<void>(`/api/waterfall/income/${id}`),
  confirmIncome: (id: string) => apiClient.post<any>(`/api/waterfall/income/${id}/confirm`),

  // Committed bills
  listCommitted: () => apiClient.get<any[]>("/api/waterfall/committed"),
  createCommitted: (data: CreateCommittedItemInput) =>
    apiClient.post<any>("/api/waterfall/committed", data),
  updateCommitted: (id: string, data: UpdateCommittedItemInput) =>
    apiClient.patch<any>(`/api/waterfall/committed/${id}`, data),
  deleteCommitted: (id: string) => apiClient.delete<void>(`/api/waterfall/committed/${id}`),
  confirmCommitted: (id: string) => apiClient.post<any>(`/api/waterfall/committed/${id}/confirm`),

  // Yearly bills
  listYearly: () => apiClient.get<any[]>("/api/waterfall/yearly"),
  createYearly: (data: CreateCommittedItemInput) =>
    apiClient.post<any>("/api/waterfall/yearly", data),
  updateYearly: (id: string, data: UpdateCommittedItemInput) =>
    apiClient.patch<any>(`/api/waterfall/yearly/${id}`, data),
  deleteYearly: (id: string) => apiClient.delete<void>(`/api/waterfall/yearly/${id}`),
  confirmYearly: (id: string) => apiClient.post<any>(`/api/waterfall/yearly/${id}/confirm`),

  // Discretionary
  listDiscretionary: () =>
    apiClient.get<DiscretionaryItemResponse[]>("/api/waterfall/discretionary"),
  createDiscretionary: (data: CreateDiscretionaryItemInput) =>
    apiClient.post<DiscretionaryItemResponse>("/api/waterfall/discretionary", data),
  updateDiscretionary: (id: string, data: UpdateDiscretionaryItemInput) =>
    apiClient.patch<DiscretionaryItemResponse>(`/api/waterfall/discretionary/${id}`, data),
  deleteDiscretionary: (id: string) => apiClient.delete<void>(`/api/waterfall/discretionary/${id}`),
  confirmDiscretionary: (id: string) =>
    apiClient.post<DiscretionaryItemResponse>(`/api/waterfall/discretionary/${id}/confirm`),

  // Savings
  listSavings: () => apiClient.get<DiscretionaryItemResponse[]>("/api/waterfall/savings"),
  createSavings: (data: CreateDiscretionaryItemInput) =>
    apiClient.post<DiscretionaryItemResponse>("/api/waterfall/savings", data),
  updateSavings: (id: string, data: UpdateDiscretionaryItemInput) =>
    apiClient.patch<DiscretionaryItemResponse>(`/api/waterfall/savings/${id}`, data),
  deleteSavings: (id: string) => apiClient.delete<void>(`/api/waterfall/savings/${id}`),
  confirmSavings: (id: string) =>
    apiClient.post<DiscretionaryItemResponse>(`/api/waterfall/savings/${id}/confirm`),

  // History + batch
  getHistory: (type: string, id: string) =>
    apiClient.get<any[]>(`/api/waterfall/history/${type}/${id}`),
  confirmBatch: (data: ConfirmBatchInput) =>
    apiClient.post<void>("/api/waterfall/confirm-batch", data),
  deleteAll: () => apiClient.delete<void>("/api/waterfall/all", { confirm: true }),

  // Subcategories
  getSubcategories: (tier: "income" | "committed" | "discretionary") =>
    apiClient.get<SubcategoryRow[]>(`/api/waterfall/subcategories/${tier}`),

  // Subcategory mutations
  getSubcategoryCounts: (tier: "income" | "committed" | "discretionary") =>
    apiClient.get<Record<string, number>>(`/api/waterfall/subcategories/${tier}/counts`),

  createSubcategory: (tier: "income" | "committed" | "discretionary", name: string) =>
    apiClient.post<SubcategoryRow>(`/api/waterfall/subcategories/${tier}`, { name }),

  saveSubcategories: (
    tier: "income" | "committed" | "discretionary",
    data: BatchSaveSubcategoriesInput
  ) => apiClient.put<SubcategoryRow[]>(`/api/waterfall/subcategories/${tier}`, data),

  resetSubcategories: (data: ResetSubcategoriesInput) =>
    apiClient.post<{ success: boolean }>("/api/waterfall/subcategories/reset", data),

  // Planner year budget (waterfall-adjacent)
  getYearBudget: (year: number) => apiClient.get<any>(`/api/planner/budget/${year}`),
  upsertYearBudget: (year: number, data: UpsertYearBudgetInput) =>
    apiClient.put<any>(`/api/planner/budget/${year}`, data),

  getFinancialSummary: () => apiClient.get<FinancialSummary>("/api/waterfall/financial-summary"),

  // Periods
  listPeriods: (itemType: string, itemId: string) =>
    apiClient.get<PeriodRow[]>(`/api/waterfall/periods/${itemType}/${itemId}`),
  createPeriod: (data: CreatePeriodInput) =>
    apiClient.post<PeriodRow>("/api/waterfall/periods", data),
  updatePeriod: (id: string, data: UpdatePeriodInput) =>
    apiClient.patch<PeriodRow>(`/api/waterfall/periods/${id}`, data),
  deletePeriod: (id: string) =>
    apiClient.delete<void | { deleted: string; itemId: string }>(`/api/waterfall/periods/${id}`),
};
