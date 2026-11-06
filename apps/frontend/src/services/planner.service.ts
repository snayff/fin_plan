import { apiClient } from "@/lib/api";
import type {
  CreatePurchaseInput,
  UpdatePurchaseInput,
  PurchaseItemResponse,
} from "@finplan/shared";

export const plannerService = {
  // Purchases
  listPurchases: (year: number) =>
    apiClient.get<PurchaseItemResponse[]>(`/api/planner/purchases?year=${year}`),
  createPurchase: (data: CreatePurchaseInput) =>
    apiClient.post<PurchaseItemResponse>("/api/planner/purchases", data),
  updatePurchase: (id: string, data: UpdatePurchaseInput) =>
    apiClient.patch<PurchaseItemResponse>(`/api/planner/purchases/${id}`, data),
  deletePurchase: (id: string) => apiClient.delete<void>(`/api/planner/purchases/${id}`),
};
